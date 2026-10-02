// Model adapters over fetch + SSE: OpenAI-compatible Chat Completions and Anthropic Messages.
// No SDKs on purpose (zero dependencies). Together these two wire formats reach almost every model.

import { parseSSE } from './sse.js'

/**
 * @typedef {import('./types.js').ProviderId} ProviderId
 * @typedef {import('./types.js').WireApi} WireApi
 * @typedef {import('./types.js').BrainConfig} BrainConfig
 * @typedef {import('./types.js').ChatMessage} ChatMessage
 * @typedef {import('./types.js').AssistantMessage} AssistantMessage
 * @typedef {import('./types.js').ToolCall} ToolCall
 * @typedef {import('./types.js').ToolSpec} ToolSpec
 * @typedef {import('./types.js').StreamEvent} StreamEvent
 * @typedef {import('./types.js').StopReason} StopReason
 * @typedef {import('./types.js').Usage} Usage
 * @typedef {import('./types.js').ModelInfo} ModelInfo
 * @typedef {import('./sse.js').SSEEvent} SSEEvent
 * @typedef {'auth'|'rate_limit'|'network'|'cors_or_offline'|'bad_request'|'not_found'|'server'|'aborted'|'bad_response'|'refusal'|'too_long'} LLMErrorCode
 * @typedef {{ brain: BrainConfig, apiKey?: string, signal?: AbortSignal, fetch?: typeof globalThis.fetch }} Connection
 * @typedef {import('./types.js').DocumentPart} DocumentPart
 * @typedef {{ system?: string, messages: ChatMessage[], tools?: ToolSpec[], maxTokens?: number }} Prompt
 * @typedef {{ url: string, headers: Record<string, string>, body: Record<string, any> }} WireRequest
 * @typedef {{ role: 'user'|'assistant', content: any[] }} AnthropicMessage
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

const ANTHROPIC_VERSION = '2023-06-01'
// Adaptive thinking exists from Claude 4.6 on, except Haiku; older models reject it.
const ADAPTIVE_THINKING = /^claude-(fable|mythos|opus|sonnet)-(5|4-[6-9])/
// Models that accept role "system" messages mid-conversation; others get a tagged block.
const MID_SYSTEM = /^claude-(opus-5|opus-4-8|fable-5|mythos-5|sonnet-5-5)/
// Models that accept server-side refusal fallbacks routed by refusal category.
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

/** @type {Map<string, StopReason>} */
const OPENAI_STOP = new Map([['stop', 'end'], ['tool_calls', 'tool_use'], ['length', 'max_tokens'], ['content_filter', 'refusal']])
/** @type {Map<string, StopReason>} */
const ANTHROPIC_STOP = new Map([['end_turn', 'end'], ['tool_use', 'tool_use'], ['max_tokens', 'max_tokens'], ['refusal', 'refusal']])
/** @type {Map<string, LLMErrorCode>} */
const ANTHROPIC_ERRORS = new Map([
  ['overloaded_error', 'server'], ['api_error', 'server'], ['rate_limit_error', 'rate_limit'],
  ['authentication_error', 'auth'], ['permission_error', 'auth'],
  ['invalid_request_error', 'bad_request'], ['not_found_error', 'not_found'],
])

// ─── Public API ──────────────────────────────────────────────────────────────

/** @param {BrainConfig} brain @param {string} [apiKey] @returns {Record<string, string>} */
export function headersFor(brain, apiKey) {
  /** @type {Record<string, string>} */
  const headers = { 'content-type': 'application/json' }
  if (brain.api === 'anthropic') {
    if (apiKey) headers['x-api-key'] = apiKey
    headers['anthropic-version'] = ANTHROPIC_VERSION
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
  const anthropic = options.brain.api === 'anthropic'
  const send = (/** @type {Prompt} */ prompt) => {
    const { url, headers, body } = anthropic ? anthropicRequest({ ...options, ...prompt }) : openaiRequest({ ...options, ...prompt })
    return fetchOrThrow(fetch, url, { method: 'POST', headers, body: JSON.stringify(body) }, signal)
  }
  let res
  try {
    res = await send(options)
  } catch (error) {
    // A replayed thinking block whose signature no longer matches (the conversation was
    // edited elsewhere): answer this once without the earlier reasoning.
    if (!(anthropic && isStaleThinking(error) && options.messages.some((m) => m.role === 'assistant' && m.raw))) throw error
    res = await send({ ...options, messages: options.messages.map((m) => (m.role === 'assistant' ? { ...m, raw: undefined } : m)) })
  }
  if (!res.body) throw new LLMError('The response has no body', { code: 'bad_response' })
  const events = sseEvents(res.body, signal)
  yield* anthropic ? readAnthropic(events) : readOpenAI(events)
}

/** @param {unknown} error */
const isStaleThinking = (error) => error instanceof LLMError && error.code === 'bad_request' && /signature|thinking/i.test(error.message)

/**
 * Writes the prompt cache for a conversation the user is about to continue (D49), so the
 * real reply starts sooner. Anthropic only; `messages` ends with the user message being
 * written (its text may still be empty). Returns null when warming isn't worth it.
 * @param {Connection & Prompt} options
 * @returns {Promise<Usage | null>}
 */
export async function warmCache({ signal, fetch = globalThis.fetch, ...options }) {
  if (options.brain.api !== 'anthropic') return null
  const { url, headers, body } = anthropicRequest(options)
  delete body.cache_control
  delete body.stream
  delete body.fallbacks
  body.max_tokens = 0
  // The breakpoint goes on the last block the real request will share: never on the placeholder.
  while (body.messages.at(-1)?.role === 'system') body.messages.pop()
  const last = body.messages.at(-1)
  if (last?.role === 'user' && last.content.at(-1)?.type === 'text' && !last.content.at(-1).text) last.content.pop()
  const block = body.messages.at(-1)?.content.at(-1)
  if (!block) return null
  if (JSON.stringify(body).length / 4 < minimumCacheable(options.brain.model)) return null
  body.messages.at(-1).content[body.messages.at(-1).content.length - 1] = { ...block, cache_control: { type: 'ephemeral' } }
  if (body.messages.at(-1).role === 'user') body.messages.at(-1).content.push({ type: 'text', text: '…' })
  else body.messages.push({ role: 'user', content: [{ type: 'text', text: '…' }] })
  const res = await fetchOrThrow(fetch, url, { method: 'POST', headers, body: JSON.stringify(body) }, signal)
  const json = await res.json().catch(() => null)
  return json?.usage ? anthropicUsage(json.usage) : null
}

/** Smallest prefix Anthropic caches, in tokens; shorter ones silently aren't. @param {string} model */
export function minimumCacheable(model) {
  if (/^claude-(opus-5|fable-5|mythos-5|sonnet-5-5)/.test(model)) return 512
  if (/^claude-(opus-4-7|mythos-preview|3-5-haiku|haiku-3-5)/.test(model)) return 2048
  if (/^claude-(opus-4-[56]|opus-4-5|haiku-4-5)/.test(model)) return 4096
  return 1024
}

/** Lists models in provider order. @param {Connection} options @returns {Promise<ModelInfo[]>} */
export async function listModels({ brain, apiKey, signal, fetch = globalThis.fetch }) {
  const anthropic = brain.api === 'anthropic'
  const headers = headersFor(brain, apiKey)
  delete headers['content-type'] // a GET has no body
  const url = endpoint(brain, anthropic ? '/models?limit=100' : '/models')
  const res = await fetchOrThrow(fetch, url, { headers }, signal)
  const json = await res.json().catch((e) => {
    throw wrapError(e, signal, 'bad_response')
  })
  if (!Array.isArray(json?.data)) throw new LLMError('Unexpected model list', { code: 'bad_response' })
  return json.data.map(anthropic ? fromAnthropicModel : fromOpenAIModel)
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
const noteBlock = (text) => `<system-note>\n${text}\n</system-note>`

/** @param {DocumentPart} doc */
const documentBlock = (doc) => `<document name="${doc.name.replace(/["\n]/g, ' ')}">\n${doc.text}\n</document>`

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

// ─── Anthropic Messages ──────────────────────────────────────────────────────

/** @param {Connection & Prompt} options @returns {WireRequest} */
function anthropicRequest({ brain, apiKey, system, messages, tools = [], maxTokens }) {
  const headers = headersFor(brain, apiKey)
  /** @type {Record<string, any>} */
  const body = { model: brain.model, max_tokens: maxTokens ?? 64000, stream: true }
  // One breakpoint at the end of the frozen system prompt (tools come before it), and
  // automatic caching for the growing conversation (D49).
  if (system) body.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
  body.cache_control = { type: 'ephemeral' }
  // Summaries are shown to the user. budget_tokens and {type:'disabled'} are rejected by current models.
  if (ADAPTIVE_THINKING.test(brain.model)) body.thinking = { type: 'adaptive', display: 'summarized' }
  if (FALLBACK_MODELS.has(brain.model)) {
    // On a safety refusal, the API continues on a fallback model inside the same stream.
    body.fallbacks = 'default'
    headers['anthropic-beta'] = [headers['anthropic-beta'], FALLBACK_BETA].filter(Boolean).join(',')
  }
  body.messages = toAnthropic(messages, brain.model)
  if (tools.length) {
    body.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters, eager_input_streaming: true }))
  }
  return { url: endpoint(brain, '/messages'), headers, body }
}

/**
 * System notes become role "system" messages right after the next user message (the API
 * wants one there) on models that take them, and a tagged block at its top elsewhere.
 * @param {ChatMessage[]} messages @param {string} model
 */
function toAnthropic(messages, model) {
  const native = MID_SYSTEM.test(model)
  /** @type {(AnthropicMessage | { role: 'system', content: string })[]} */
  const out = []
  /** @type {string[]} */
  let notes = []
  for (const message of messages) {
    if (message.role === 'system') {
      notes.push(message.content)
      continue
    }
    const next = toAnthropicMessage(message, model)
    if (message.role === 'user' && notes.length && !native) next.content.unshift(...notes.map((text) => ({ type: 'text', text: noteBlock(text) })))
    if (!next.content.length) continue
    const prev = out.at(-1)
    // Roles must alternate: consecutive tool results become one user message.
    if (prev?.role === next.role) /** @type {AnthropicMessage} */ (prev).content = [.../** @type {any[]} */ (prev.content), ...next.content]
    else out.push(next)
    if (message.role === 'user' && notes.length) {
      if (native) for (const text of notes) out.push({ role: 'system', content: text })
      notes = []
    }
  }
  return out
}

/** @param {ChatMessage} m @param {string} model @returns {AnthropicMessage} */
function toAnthropicMessage(m, model) {
  if (m.role === 'user') {
    const documents = (m.documents ?? []).map((doc) => ({ type: 'text', text: documentBlock(doc) }))
    return { role: 'user', content: m.content ? [...documents, { type: 'text', text: m.content }] : documents }
  }
  if (m.role === 'system') return { role: 'user', content: [{ type: 'text', text: noteBlock(m.content) }] }
  if (m.role === 'tool') {
    const result = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }
    return { role: 'user', content: [m.isError ? { ...result, is_error: true } : result] }
  }
  // Thinking blocks must come back exactly as they were received, to the model that made them.
  if (Array.isArray(m.raw) && (!m.rawModel || m.rawModel === model)) return { role: 'assistant', content: m.raw }
  /** @type {any[]} */
  const content = m.content ? [{ type: 'text', text: m.content }] : []
  for (const c of m.toolCalls ?? []) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args ?? {} })
  return { role: 'assistant', content }
}

/** @param {AsyncIterable<SSEEvent>} events @returns {AsyncGenerator<StreamEvent, void, undefined>} */
async function* readAnthropic(events) {
  /** @type {any[]} */
  const blocks = []
  /** @type {Record<string, number>} */
  let usage = {}
  let stop = ''
  let finished = false
  for await (const { event, data } of events) {
    const d = parseData(data)
    const type = d.type ?? event
    if (type === 'error') throw streamError(d.error)
    if (type === 'message_start') usage = { ...d.message?.usage }
    if (type === 'content_block_start') blocks[d.index] = startBlock(d.content_block)
    if (type === 'content_block_delta') {
      const out = applyDelta(blocks[d.index], d.delta)
      if (out) yield out
    }
    if (type === 'message_delta') {
      stop = d.delta?.stop_reason ?? stop
      // Later counts are cumulative and may restate earlier ones.
      for (const [key, value] of Object.entries(d.usage ?? {})) if (typeof value === 'number') usage[key] = value
    }
    if (type === 'message_stop') finished = true
  }
  if (!finished) throw new LLMError('The response stream ended early', { code: 'network' })
  // Tool calls are emitted only now, so a refusal fallback can't leave one the final message lacks.
  const raw = keepAfterFallback(blocks.filter(Boolean)).map(finishBlock).filter(Boolean)
  const toolCalls = raw.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input }))
  for (const call of toolCalls) yield { type: 'tool_call', call }
  const text = raw.filter((b) => b.type === 'text').map((b) => b.text).join('')
  yield doneEvent(ANTHROPIC_STOP.get(stop) ?? 'other', anthropicUsage(usage), text, toolCalls, raw)
}

/** @param {any} block */
function startBlock(block = {}) {
  switch (block.type) {
    case 'text': return { type: 'text', text: block.text ?? '' }
    case 'thinking': return { type: 'thinking', thinking: block.thinking ?? '', signature: block.signature ?? '' }
    case 'redacted_thinking': return { type: 'redacted_thinking', data: block.data }
    case 'tool_use': return { type: 'tool_use', id: block.id, name: block.name, json: '' }
    default: return { type: block.type } // e.g. 'fallback': a marker, never echoed back
  }
}

/** @param {any} block @param {any} delta @returns {StreamEvent|null} */
function applyDelta(block, delta) {
  if (!block || !delta) return null
  if (delta.type === 'signature_delta') block.signature += delta.signature
  if (delta.type === 'input_json_delta') block.json += delta.partial_json
  // text_delta carries `text` and thinking_delta carries `thinking`, like the blocks they extend.
  const kind = delta.type === 'text_delta' ? 'text' : delta.type === 'thinking_delta' ? 'thinking' : null
  if (!kind || !delta[kind]) return null
  block[kind] += delta[kind]
  return { type: kind, delta: delta[kind] }
}

/**
 * After a mid-output refusal, the API keeps the declined partial and marks the switch with a
 * 'fallback' block. Only its text may be echoed back; thinking and tool calls before it are dropped.
 * @param {any[]} blocks
 */
function keepAfterFallback(blocks) {
  const cut = blocks.map((b) => b.type).lastIndexOf('fallback')
  return blocks.filter((b, i) => i > cut || b.type === 'text')
}

/** @param {any} block */
function finishBlock(block) {
  switch (block.type) {
    case 'text': case 'thinking': case 'redacted_thinking': return block
    case 'tool_use': return { type: 'tool_use', id: block.id, name: block.name, input: parseArgs(block.json) }
    default: return null
  }
}

/**
 * Anthropic counts cached input apart; Usage.inputTokens counts all of it.
 * @param {any} u @returns {Usage}
 */
function anthropicUsage(u) {
  const read = u.cache_read_input_tokens ?? 0
  const write = u.cache_creation_input_tokens ?? 0
  /** @type {Usage} */
  const usage = { inputTokens: (u.input_tokens ?? 0) + read + write }
  if (u.output_tokens != null) usage.outputTokens = u.output_tokens
  if (read) usage.cacheReadTokens = read
  if (write) usage.cacheWriteTokens = write
  return usage
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** @param {BrainConfig} brain @param {string} path */
function endpoint(brain, path) {
  return brain.baseURL.replace(/\/+$/, '') + path
}

/** @param {ReadableStream<Uint8Array>} body @param {AbortSignal} [signal] @returns {AsyncGenerator<SSEEvent, void, undefined>} */
async function* sseEvents(body, signal) {
  try {
    for await (const event of parseSSE(body)) {
      if (signal?.aborted) throw new LLMError('Request aborted', { code: 'aborted' })
      yield event
    }
  } catch (e) {
    throw wrapError(e, signal, 'network')
  }
}

/** @param {string} data @returns {any} */
function parseData(data) {
  try {
    return JSON.parse(data)
  } catch (e) {
    throw new LLMError('Malformed data in the response stream', { code: 'bad_response', cause: e })
  }
}

/** Strict parse. Invalid arguments are kept so the agent loop can report them to the model. @param {string} raw */
function parseArgs(raw) {
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return { __invalidJSON: raw }
  }
}

/** @param {unknown} value @returns {value is string} */
function isText(value) {
  return typeof value === 'string' && value !== ''
}

/**
 * @param {StopReason} stopReason @param {Usage|undefined} usage @param {string} content
 * @param {ToolCall[]} toolCalls @param {any[]} [raw] @returns {StreamEvent}
 */
function doneEvent(stopReason, usage, content, toolCalls, raw) {
  /** @type {AssistantMessage} */
  const message = { role: 'assistant', content }
  if (toolCalls.length) message.toolCalls = toolCalls
  if (raw) message.raw = raw
  return { type: 'done', stopReason, usage, message }
}

/** @param {number} status @returns {LLMErrorCode} */
function codeForStatus(status) {
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'not_found'
  if (status === 429) return 'rate_limit'
  if (status === 400 || status === 422) return 'bad_request'
  if (status >= 500) return 'server'
  return 'bad_response'
}

/** @param {Response} res */
async function httpError(res) {
  const detail = errorDetail(await res.text().catch(() => ''))
  const message = detail ? `HTTP ${res.status}: ${detail}` : `HTTP ${res.status}`
  return new LLMError(message, { status: res.status, code: codeForStatus(res.status) })
}

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
function streamError(error) {
  const status = typeof error?.code === 'number' ? error.code : undefined
  const code = ANTHROPIC_ERRORS.get(error?.type) ?? (status ? codeForStatus(status) : 'bad_response')
  return new LLMError(error?.message || 'The provider reported an error', { status, code })
}

/** @param {unknown} error @param {AbortSignal|undefined} signal @param {LLMErrorCode} code */
function wrapError(error, signal, code) {
  if (error instanceof LLMError) return error
  const e = /** @type {any} */ (error)
  if (signal?.aborted || e?.name === 'AbortError') return new LLMError('Request aborted', { code: 'aborted', cause: error })
  return new LLMError(e?.message || String(error), { code, cause: error })
}

/** @param {any} m @returns {ModelInfo} */
function fromOpenAIModel(m) {
  const pricing = m.pricing ? { prompt: Number(m.pricing.prompt), completion: Number(m.pricing.completion) } : undefined
  return { id: m.id, name: m.name, contextLength: m.context_length, pricing }
}

/** @param {any} m @returns {ModelInfo} */
function fromAnthropicModel(m) {
  return { id: m.id, name: m.display_name, contextLength: m.max_input_tokens }
}
