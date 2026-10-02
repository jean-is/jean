// Model adapters over fetch + SSE: OpenAI-compatible Chat Completions here, and Anthropic
// Messages in anthropic.js, imported the first time an Anthropic brain is used.
// No SDKs on purpose (zero dependencies). Together these two wire formats reach almost every model.

import { parseSSE } from './sse.js'

/**
 * @import { ProviderId, WireApi, ChatMessage, AssistantMessage, ToolCall, StreamEvent, StopReason, Usage, ModelInfo,
 *   DocumentPart, LLMErrorCode, Connection, Prompt, WireRequest } from './types.js'
 * @import { SSEEvent } from './sse.js'
 */

/** @type {Record<ProviderId, { api: WireApi, baseURL: string, defaultModel: string|null, needsKey: boolean }>} */
export const PROVIDERS = {
  device: { api: 'device', baseURL: '', defaultModel: null, needsKey: false },
  openrouter: { api: 'openai', baseURL: 'https://openrouter.ai/api/v1', defaultModel: 'openrouter/auto', needsKey: true },
  openai: { api: 'openai', baseURL: 'https://api.openai.com/v1', defaultModel: null, needsKey: true },
  anthropic: { api: 'anthropic', baseURL: 'https://api.anthropic.com/v1', defaultModel: 'claude-opus-5-5', needsKey: true },
  ollama: { api: 'openai', baseURL: 'http://localhost:11434/v1', defaultModel: null, needsKey: false },
  lmstudio: { api: 'openai', baseURL: 'http://localhost:1234/v1', defaultModel: null, needsKey: false },
  custom: { api: 'openai', baseURL: '', defaultModel: null, needsKey: false },
}

const RETRYABLE = new Set(['rate_limit', 'server', 'network'])

export class LLMError extends Error {
  /** @param {string} message @param {{ status?: number, code?: LLMErrorCode, retryable?: boolean, cause?: unknown }} [options] */
  constructor(message, { status, code = 'bad_response', retryable, cause } = {}) {
    super(message, { cause })
    this.name = 'LLMError'
    this.status = status
    this.code = code
    this.retryable = retryable ?? RETRYABLE.has(code)
  }
}

/** @type {Map<string, StopReason>} */
const OPENAI_STOP = new Map([['stop', 'end'], ['tool_calls', 'tool_use'], ['length', 'max_tokens'], ['content_filter', 'refusal']])
/** @type {Map<string, LLMErrorCode>} */
const STREAM_ERRORS = new Map([
  ['overloaded_error', 'server'], ['api_error', 'server'], ['rate_limit_error', 'rate_limit'],
  ['authentication_error', 'auth'], ['permission_error', 'auth'],
  ['invalid_request_error', 'bad_request'], ['not_found_error', 'not_found'],
])
/** @type {Map<number, LLMErrorCode>} */
const HTTP_ERRORS = new Map([[400, 'bad_request'], [401, 'auth'], [403, 'auth'], [404, 'not_found'], [422, 'bad_request'], [429, 'rate_limit']])

// ─── Public API ──────────────────────────────────────────────────────────────

/** @param {import('./types.js').BrainConfig} brain @param {string} [apiKey] @returns {Record<string, string>} */
export function headersFor(brain, apiKey) {
  /** @type {Record<string, string>} */
  const headers = { 'content-type': 'application/json' }
  if (brain.api === 'anthropic') {
    if (apiKey) headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    // Without this header Anthropic rejects CORS requests from browsers.
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
  } else if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`
  }
  for (const [name, value] of Object.entries(brain.headers ?? {})) headers[name.toLowerCase()] = value
  return headers
}

/**
 * Streams one model turn: text and thinking deltas, then every tool call, then exactly one 'done'.
 * @param {Connection & Prompt} options
 * @returns {AsyncGenerator<StreamEvent, void, undefined>}
 */
export async function* streamChat({ signal, fetch = globalThis.fetch, ...options }) {
  if (options.brain.api === 'device') throw new LLMError('The on-device brain has its own runtime', { code: 'bad_request' })
  if (options.brain.api === 'anthropic') return yield* (await import('./anthropic.js')).streamAnthropic({ signal, fetch, ...options })
  const res = await post(fetch, openaiRequest(options), signal)
  yield* readOpenAI(sseEvents(res, signal))
}

/**
 * Writes the prompt cache for a conversation the user is about to continue (D49), so the
 * real reply starts sooner. Anthropic only; null for other brains or when it isn't worth it.
 * @param {Connection & Prompt} options
 * @returns {Promise<Usage | null>}
 */
export async function warmCache(options) {
  return options.brain.api === 'anthropic' ? (await import('./anthropic.js')).warmCache(options) : null
}

/** Lists models in provider order. @param {Connection} options @returns {Promise<ModelInfo[]>} */
export async function listModels({ brain, apiKey, signal, fetch = globalThis.fetch }) {
  const anthropic = brain.api === 'anthropic'
  const headers = headersFor(brain, apiKey)
  delete headers['content-type'] // a GET has no body
  const res = await fetchOrThrow(fetch, endpoint(brain, anthropic ? '/models?limit=100' : '/models'), { headers }, signal)
  const json = await res.json().catch((e) => {
    throw wrapError(e, signal, 'bad_response')
  })
  if (!Array.isArray(json?.data)) throw new LLMError('Unexpected model list', { code: 'bad_response' })
  return json.data.map((/** @type {any} */ m) => (anthropic
    ? { id: m.id, name: m.display_name, contextLength: m.max_input_tokens }
    : { id: m.id, name: m.name, contextLength: m.context_length, pricing: m.pricing ? { prompt: Number(m.pricing.prompt), completion: Number(m.pricing.completion) } : undefined }))
}

/**
 * fetch() with every failure mapped to an LLMError. Also used by oauth.js.
 * @param {typeof globalThis.fetch} fetch @param {string} url @param {RequestInit} init @param {AbortSignal} [signal]
 */
export async function fetchOrThrow(fetch, url, init, signal) {
  let res
  try {
    res = await fetch(url, { ...init, signal })
  } catch (e) {
    // Browsers report a CORS rejection and being offline as the same TypeError.
    throw wrapError(e, signal, e instanceof TypeError ? 'cors_or_offline' : 'network')
  }
  if (!res.ok) throw await httpError(res)
  return res
}

/** @param {typeof globalThis.fetch} fetch @param {WireRequest} request @param {AbortSignal} [signal] */
export const post = (fetch, { url, headers, body }, signal) => fetchOrThrow(fetch, url, { method: 'POST', headers, body: JSON.stringify(body) }, signal)

// ─── OpenAI-compatible Chat Completions ──────────────────────────────────────

/** @param {Connection & Prompt} options @returns {WireRequest} */
function openaiRequest({ brain, apiKey, system, messages, tools = [], maxTokens }) {
  // OpenAI and OpenRouter take system messages anywhere; local servers' chat templates often don't.
  const systemNotes = brain.provider === 'openai' || brain.provider === 'openrouter'
  /** @type {Record<string, any>} */
  const body = { model: brain.model, stream: true, messages: openaiMessages(system, messages, { systemNotes }) }
  if (tools.length) {
    body.tools = tools.map(({ name, description, parameters }) => ({ type: 'function', function: { name, description, parameters } }))
  }
  // OpenAI's own API rejects max_tokens on its reasoning models; other servers only know max_tokens.
  if (maxTokens != null) body[brain.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = maxTokens
  if (brain.provider === 'openrouter' || brain.provider === 'openai') body.stream_options = { include_usage: true }
  return { url: endpoint(brain, '/chat/completions'), headers: headersFor(brain, apiKey), body }
}

/**
 * Chat Completions messages, also fed to the on-device brain's chat template. System notes
 * become system messages where they fall, or a tagged block at the top of the next user turn.
 * @param {string | undefined} system @param {ChatMessage[]} messages
 * @param {{ systemNotes: boolean, argsAsObject?: boolean }} options argsAsObject: for chat templates
 * @returns {Record<string, any>[]}
 */
export function openaiMessages(system, messages, { systemNotes, argsAsObject = false }) {
  /** @type {Record<string, any>[]} */
  const out = system ? [{ role: 'system', content: system }] : []
  /** @type {string[]} */
  let notes = []
  for (const m of messages) {
    if (m.role === 'system') {
      if (systemNotes) out.push({ role: 'system', content: m.content })
      else notes.push(m.content)
    } else if (m.role === 'user') {
      const parts = [...notes.map(noteBlock), ...(m.documents ?? []).map(documentBlock), m.content].filter(Boolean)
      out.push({ role: 'user', content: parts.join('\n\n') })
      notes = []
    } else if (m.role === 'tool') {
      const content = m.isError ? `Error: ${m.content}` : m.content
      out.push({ role: 'tool', tool_call_id: m.toolCallId, ...(argsAsObject && { name: m.name }), content })
    } else {
      /** @type {Record<string, any>} */
      const message = { role: 'assistant', content: m.content }
      if (m.toolCalls?.length) {
        message.tool_calls = m.toolCalls.map(({ id, name, args }) => ({
          id, type: 'function', function: { name, arguments: argsAsObject ? args ?? {} : JSON.stringify(args ?? {}) },
        }))
      }
      out.push(message)
    }
  }
  return out
}

/** @param {string} text */
export const noteBlock = (text) => `<system-note>\n${text}\n</system-note>`

/** @param {DocumentPart} doc */
export const documentBlock = (doc) => `<document${doc.source ? ` source="${doc.source}"` : ''} name="${doc.name.replace(/["\n]/g, ' ')}">\n${doc.text}\n</document>`

/** @param {AsyncIterable<SSEEvent>} events @returns {AsyncGenerator<StreamEvent, void, undefined>} */
async function* readOpenAI(events) {
  /** @type {{ id: string, name: string, args: string }[]} */
  const slots = []
  let text = ''
  let finish = ''
  let received = false
  /** @type {Usage|undefined} */
  let usage
  for await (const { data } of events) {
    if (data === '[DONE]') break
    const chunk = parseData(data)
    received = true
    if (chunk.error) throw streamError(chunk.error)
    if (chunk.usage) {
      const cached = chunk.usage.prompt_tokens_details?.cached_tokens
      usage = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens, ...(cached && { cacheReadTokens: cached }) }
    }
    const choice = chunk.choices?.[0]
    if (!choice) continue
    const delta = choice.delta ?? {}
    if (isText(delta.content)) {
      text += delta.content
      yield { type: 'text', delta: delta.content }
    }
    // OpenRouter streams `reasoning`; DeepSeek, LM Studio and vLLM stream `reasoning_content`.
    const thought = [delta.reasoning, delta.reasoning_content].find(isText)
    if (thought) yield { type: 'thinking', delta: thought }
    for (const call of delta.tool_calls ?? []) addToolDelta(slots, call)
    if (choice.finish_reason) finish = choice.finish_reason
  }
  if (!received) throw new LLMError('The server sent no response', { code: 'bad_response' })
  const toolCalls = slots.filter(Boolean).map((s) => ({ id: s.id || `call_${crypto.randomUUID()}`, name: s.name, args: parseArgs(s.args) }))
  for (const call of toolCalls) yield { type: 'tool_call', call }
  // Some local servers finish tool calls with 'stop'.
  yield doneEvent(toolCalls.length ? 'tool_use' : OPENAI_STOP.get(finish) ?? 'other', usage, text, toolCalls)
}

/**
 * Tool calls stream as fragments keyed by `index`: id and name first, then pieces of arguments.
 * @param {{ id: string, name: string, args: string }[]} slots @param {any} delta
 */
function addToolDelta(slots, delta) {
  let i = delta.index
  if (typeof i !== 'number') {
    // Some servers omit the index and send each call whole.
    const known = slots.findIndex((s) => s?.id === delta.id)
    i = delta.id ? (known >= 0 ? known : slots.length) : Math.max(slots.length - 1, 0)
  }
  const slot = (slots[i] ??= { id: '', name: '', args: '' })
  if (delta.id) slot.id = delta.id
  if (delta.function?.name) slot.name = delta.function.name
  const args = delta.function?.arguments
  if (args != null) slot.args += typeof args === 'string' ? args : JSON.stringify(args)
}

// ─── Shared with anthropic.js ────────────────────────────────────────────────

/** @param {import('./types.js').BrainConfig} brain @param {string} path */
export const endpoint = (brain, path) => brain.baseURL.replace(/\/+$/, '') + path

/** @param {Response} res @param {AbortSignal} [signal] @returns {AsyncGenerator<SSEEvent, void, undefined>} */
export async function* sseEvents(res, signal) {
  if (!res.body) throw new LLMError('The response has no body', { code: 'bad_response' })
  try {
    for await (const event of parseSSE(res.body)) {
      if (signal?.aborted) throw new LLMError('Request aborted', { code: 'aborted' })
      yield event
    }
  } catch (e) {
    throw wrapError(e, signal, 'network')
  }
}

/** @param {string} data @returns {any} */
export function parseData(data) {
  try {
    return JSON.parse(data)
  } catch (e) {
    throw new LLMError('Malformed data in the response stream', { code: 'bad_response', cause: e })
  }
}

/** Strict parse. Invalid arguments are kept so the agent loop can report them to the model. @param {string} raw */
export function parseArgs(raw) {
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return { __invalidJSON: raw }
  }
}

/** @type {(value: unknown) => value is string} */
const isText = (value) => typeof value === 'string' && value !== ''

/**
 * @param {StopReason} stopReason @param {Usage|undefined} usage @param {string} content
 * @param {ToolCall[]} toolCalls @param {any[]} [raw] @returns {StreamEvent}
 */
export function doneEvent(stopReason, usage, content, toolCalls, raw) {
  /** @type {AssistantMessage} */
  const message = { role: 'assistant', content, ...(toolCalls.length && { toolCalls }), ...(raw && { raw }) }
  return { type: 'done', stopReason, usage, message }
}

/** @param {Response} res */
async function httpError(res) {
  const detail = errorDetail(await res.text().catch(() => ''))
  const message = detail ? `HTTP ${res.status}: ${detail}` : `HTTP ${res.status}`
  return new LLMError(message, { status: res.status, code: codeForStatus(res.status) })
}

/** @param {number} status @returns {LLMErrorCode} */
const codeForStatus = (status) => HTTP_ERRORS.get(status) ?? (status >= 500 ? 'server' : 'bad_response')

/** @param {string} text */
function errorDetail(text) {
  try {
    const json = JSON.parse(text)
    const message = json?.error?.message ?? json?.error ?? json?.message
    if (typeof message === 'string') return message
  } catch {}
  return text.trim().slice(0, 200)
}

/** An error object inside a stream: OpenRouter's { code, message } or Anthropic's { type, message }. @param {any} error */
export function streamError(error) {
  const status = typeof error?.code === 'number' ? error.code : undefined
  const code = STREAM_ERRORS.get(error?.type) ?? (status ? codeForStatus(status) : 'bad_response')
  return new LLMError(error?.message || 'The provider reported an error', { status, code })
}

/** @param {unknown} error @param {AbortSignal|undefined} signal @param {LLMErrorCode} code */
function wrapError(error, signal, code) {
  if (error instanceof LLMError) return error
  const e = /** @type {any} */ (error)
  if (signal?.aborted || e?.name === 'AbortError') return new LLMError('Request aborted', { code: 'aborted', cause: error })
  return new LLMError(e?.message || String(error), { code, cause: error })
}
