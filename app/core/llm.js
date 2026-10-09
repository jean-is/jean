// Model adapters over fetch + SSE: OpenAI-compatible Chat Completions here, and Anthropic
// Messages in anthropic.js, imported the first time an Anthropic brain is used.
// No SDKs on purpose (zero dependencies). Together these two wire formats reach almost every model.

import { parseSSE } from './sse.js'

/**
 * @import { ProviderId, WireApi, ChatMessage, AssistantMessage, ToolCall, StreamEvent, StopReason, Usage, ModelInfo,
 *   DocumentPart, LLMErrorCode, Connection, Prompt, WireRequest } from './types.js'
 * @import { SSEEvent } from './sse.js'
 */

/**
 * keyCheck: where the model list is public, an address that refuses a wrong key.
 * @type {Record<ProviderId, { api: WireApi, baseURL: string, defaultModel: string|null, needsKey: boolean, keyCheck?: string }>}
 */
export const PROVIDERS = {
  device: { api: 'device', baseURL: '', defaultModel: null, needsKey: false },
  openrouter: { api: 'openai', baseURL: 'https://openrouter.ai/api/v1', defaultModel: 'openrouter/auto', needsKey: true, keyCheck: 'https://openrouter.ai/api/v1/key' },
  openai: { api: 'openai', baseURL: 'https://api.openai.com/v1', defaultModel: null, needsKey: true },
  anthropic: { api: 'anthropic', baseURL: 'https://api.anthropic.com/v1', defaultModel: 'claude-opus-5-5', needsKey: true },
  gemini: { api: 'openai', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-3.8-flash', needsKey: true },
  // {project} is the user's Google Cloud project; the key is an hour-long OAuth access token.
  vertex: { api: 'openai', baseURL: 'https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/endpoints/openapi', defaultModel: 'google/gemini-3.8-flash', needsKey: true },
  mistral: { api: 'openai', baseURL: 'https://api.mistral.ai/v1', defaultModel: 'mistral-medium-latest', needsKey: true },
  huggingface: { api: 'openai', baseURL: 'https://router.huggingface.co/v1', defaultModel: null, needsKey: true, keyCheck: 'https://huggingface.co/api/whoami-v2' },
  vercel: { api: 'openai', baseURL: 'https://ai-gateway.vercel.sh/v1', defaultModel: 'anthropic/claude-sonnet-5.5', needsKey: true, keyCheck: 'https://ai-gateway.vercel.sh/v1/credits' },
  groq: { api: 'openai', baseURL: 'https://api.groq.com/openai/v1', defaultModel: null, needsKey: true },
  cerebras: { api: 'openai', baseURL: 'https://api.cerebras.ai/v1', defaultModel: null, needsKey: true },
  together: { api: 'openai', baseURL: 'https://api.together.xyz/v1', defaultModel: null, needsKey: true },
  fireworks: { api: 'openai', baseURL: 'https://api.fireworks.ai/inference/v1', defaultModel: null, needsKey: true },
  xai: { api: 'openai', baseURL: 'https://api.x.ai/v1', defaultModel: null, needsKey: true },
  ollama: { api: 'openai', baseURL: 'http://localhost:11434/v1', defaultModel: null, needsKey: false },
  lmstudio: { api: 'openai', baseURL: 'http://localhost:1234/v1', defaultModel: null, needsKey: false },
  // The user's own Claude Code, with their Claude plan, through This computer's bridge (D235): its address and key are the bridge's.
  claudecode: { api: 'anthropic', baseURL: '', defaultModel: 'opus', needsKey: true },
  custom: { api: 'openai', baseURL: '', defaultModel: null, needsKey: false },
}

// What may pass if asked again. Being offline does; a refused cross-origin request looks the same
// to a browser, and costs only the wait (D202).
const RETRYABLE = new Set(['rate_limit', 'server', 'network', 'cors_or_offline'])

export class LLMError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: LLMErrorCode, retryable?: boolean, retryAfter?: number, cause?: unknown }} [options]
   *   retryAfter: how long the provider asks to wait, in ms
   */
  constructor(message, { status, code = 'bad_response', retryable, retryAfter, cause } = {}) {
    super(message, { cause })
    this.name = 'LLMError'
    this.status = status
    this.code = code
    this.retryable = retryable ?? RETRYABLE.has(code)
    this.retryAfter = retryAfter
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
const HTTP_ERRORS = new Map([[400, 'bad_request'], [401, 'auth'], [402, 'credits'], [403, 'auth'], [404, 'not_found'], [422, 'bad_request'], [429, 'rate_limit']])

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

/** Streams one model turn: text and thinking deltas, then every tool call, then exactly one 'done'. @param {Connection & Prompt} options @returns {AsyncGenerator<StreamEvent, void, undefined>} */
export async function* streamChat({ signal, fetch = globalThis.fetch, ...options }) {
  if (options.brain.api === 'device') throw new LLMError('The on-device brain has its own runtime', { code: 'bad_request' })
  if (options.brain.api === 'anthropic') return yield* (await import('./anthropic.js')).streamAnthropic({ signal, fetch, ...options })
  const res = await post(fetch, openaiRequest(options), signal).catch((error) => {
    // OpenRouter weighs the credits left against the longest answer the brain may give, and says what they cover (402).
    const affords = error.status === 402 && /can only afford (\d+)/.exec(error.message)?.[1]
    if (!affords) throw error
    return post(fetch, openaiRequest({ ...options, maxTokens: Number(affords) }), signal)
  })
  yield* readOpenAI(sseEvents(res, signal))
}

/**
 * Writes the prompt cache for a conversation the user is about to continue (D49), so the
 * real reply starts sooner. Anthropic only; null for other brains or when it isn't worth it.
 * @param {Connection & Prompt} options @returns {Promise<Usage | null>}
 */
export const warmCache = async (options) => (options.brain.api === 'anthropic' ? (await import('./anthropic.js')).warmCache(options) : null)

/** Lists models in provider order. @param {Connection} options @returns {Promise<ModelInfo[]>} */
export async function listModels({ brain, apiKey, signal, fetch = globalThis.fetch }) {
  const anthropic = brain.api === 'anthropic'
  // Vertex AI's Chat Completions has no model list: Google's catalogue of its own Gemini stands in.
  const vertex = brain.provider === 'vertex'
  const headers = headersFor(brain, apiKey)
  delete headers['content-type'] // a GET has no body
  const url = vertex ? `${new URL(brain.baseURL).origin}/v1beta1/publishers/google/models` : endpoint(brain, anthropic ? '/models?limit=100' : '/models')
  const res = await fetchOrThrow(fetch, url, { headers }, signal)
  const json = await res.json().catch((e) => { throw wrapError(e, signal, 'bad_response') })
  const list = vertex ? json?.publisherModels : json?.data
  if (!Array.isArray(list)) throw new LLMError('Unexpected model list', { code: 'bad_response' })
  if (vertex) return list.map((/** @type {any} */ m) => ({ id: `google/${String(m.name).split('/').at(-1)}` })).filter((m) => m.id.includes('gemini'))
  return list.map((/** @type {any} */ m) => (anthropic
    ? { id: m.id, name: m.display_name, contextLength: m.max_input_tokens }
    // Gemini lists its models as models/gemini-…, and answers to the bare name too.
    : { id: m.id.replace(/^models\//, ''), name: m.name, contextLength: m.context_length, pricing: m.pricing ? { prompt: Number(m.pricing.prompt), completion: Number(m.pricing.completion) } : undefined, input: m.architecture?.input_modalities, output: m.architecture?.output_modalities }))
}

/** Throws an 'auth' LLMError when the provider refuses the key; listing models can't tell where the list is public. @param {Connection} options */
export async function checkKey({ brain, apiKey, signal, fetch = globalThis.fetch }) {
  const url = PROVIDERS[brain.provider]?.keyCheck
  if (url) await fetchOrThrow(fetch, url, { headers: { authorization: `Bearer ${apiKey}` } }, signal)
}

/** fetch() with every failure mapped to an LLMError. Also used by oauth.js. @param {typeof globalThis.fetch} fetch @param {string} url @param {RequestInit} init @param {AbortSignal} [signal] */
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
    // OpenRouter runs the brain's own web search itself, and cites pages in annotations.
    body.tools = tools.map(({ name, description, parameters, native }) => (native && brain.provider === 'openrouter'
      ? { type: 'openrouter:web_search', parameters: { max_uses: 3 } } : { type: 'function', function: { name, description, parameters } }))
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
      const parts = [...notes.map(noteBlock), ...(m.documents ?? []).flatMap((doc) => (doc.image ? [documentBlock(doc), doc.image] : [documentBlock(doc)])), m.content].filter((part) => part !== '')
      // A picture makes the content a list of parts; text alone stays one string, as every server takes.
      out.push({ role: 'user', content: parts.every((part) => typeof part === 'string') ? parts.join('\n\n')
        : parts.map((part) => (typeof part === 'string' ? { type: 'text', text: part } : { type: 'image_url', image_url: { url: `data:${part.mimeType};base64,${part.data}` } })) })
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
    const cited = (delta.annotations ?? []).flatMap((/** @type {any} */ a) => (a.url_citation?.url ? [{ title: a.url_citation.title || a.url_citation.url, url: a.url_citation.url, quote: a.url_citation.content }] : []))
    if (cited.length) yield { type: 'cite', sources: cited }
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

/** @param {unknown} value @returns {value is string} */
const isText = (value) => typeof value === 'string' && value !== ''

/** @param {StopReason} stopReason @param {Usage|undefined} usage @param {string} content @param {ToolCall[]} toolCalls @param {any[]} [raw] @returns {StreamEvent} */
export function doneEvent(stopReason, usage, content, toolCalls, raw) {
  /** @type {AssistantMessage} */
  const message = { role: 'assistant', content, ...(toolCalls.length && { toolCalls }), ...(raw && { raw }) }
  return { type: 'done', stopReason, usage, message }
}

/** @param {Response} res */
async function httpError(res) {
  const detail = errorDetail(await res.text().catch(() => ''))
  const message = detail ? `HTTP ${res.status}: ${detail}` : `HTTP ${res.status}`
  // Gemini and xAI answer a wrong key with 400: "Please pass a valid API key", "Incorrect API key provided";
  // Anthropic, an account out of credits: "Your credit balance is too low" (others answer 402).
  const code = res.status !== 400 ? codeForStatus(res.status) : /(valid|incorrect) API key/i.test(detail) ? 'auth' : /credit balance/i.test(detail) ? 'credits' : 'bad_request'
  return new LLMError(message, { status: res.status, code, retryAfter: waitAsked(res.headers.get('retry-after')) })
}

/** Retry-After, in seconds or until a date, as ms (D202). @param {string | null} value */
function waitAsked(value) {
  const ms = !value ? NaN : /^\s*\d+\s*$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now()
  return Number.isFinite(ms) ? Math.max(0, ms) : undefined
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
