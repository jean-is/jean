// Anthropic Messages, imported by llm.js the first time an Anthropic brain is used.
import { LLMError, headersFor, post, endpoint, sseEvents, parseData, parseArgs, doneEvent, streamError, noteBlock, documentBlock } from './llm.js'

/**
 * @import { ChatMessage, SystemNote, StreamEvent, StopReason, Usage, Connection, Prompt, WireRequest } from './types.js'
 * @import { SSEEvent } from './sse.js'
 * @typedef {{ role: 'user'|'assistant', content: any[] }} AnthropicMessage
 */

// Adaptive thinking exists from Claude 4.6 on, except Haiku; older models reject it.
const ADAPTIVE_THINKING = /^claude-(fable|mythos|opus|sonnet)-(5|4-[6-9])/
// Models that accept role "system" messages mid-conversation; others get a tagged block.
const MID_SYSTEM = /^claude-(opus-5|opus-4-8|fable-5|mythos-5|sonnet-5-5)/
// Models that take how much to think (D414); Claude Code's and Copilot's names for them are their own.
const EFFORT = /^claude-(fable|mythos|opus|sonnet|haiku)-(5|4-[6-9])/
// Models that accept server-side refusal fallbacks routed by refusal category.
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

/** @type {Map<string, StopReason>} */
const STOP = new Map([['end_turn', 'end'], ['tool_use', 'tool_use'], ['max_tokens', 'max_tokens'], ['model_context_window_exceeded', 'max_tokens'], ['refusal', 'refusal'], ['pause_turn', 'pause']])
// The provider's own tools and their results: echoed back whole in later requests.
const SERVER_BLOCK = /^server_tool_use$|_tool_result$/
// Set when the organisation turned web search off (a 400 says so): Jean's own search from then on.
let searchOff = false

/** streamChat() for Anthropic brains. @param {Connection & Prompt} options @returns {AsyncGenerator<StreamEvent, void, undefined>} */
export async function* streamAnthropic({ signal, fetch = globalThis.fetch, ...options }) {
  const send = (/** @type {ChatMessage[]} */ messages) => post(fetch, anthropicRequest({ ...options, messages }), signal)
  let res
  try {
    res = await send(options.messages)
  } catch (error) {
    const off = !searchOff && error instanceof LLMError && error.code === 'bad_request' && /web.?search/i.test(error.message)
    // A replayed thinking block whose signature no longer matches (the conversation was
    // edited elsewhere): answer this once without the earlier reasoning.
    if (!off && !(isStaleThinking(error) && options.messages.some((m) => m.role === 'assistant' && m.raw))) throw error
    searchOff ||= off
    res = await send(off ? options.messages : options.messages.map((m) => (m.role === 'assistant' ? { ...m, raw: undefined } : m)))
  }
  yield* readAnthropic(sseEvents(res, signal))
}

/** @param {unknown} error */
const isStaleThinking = (error) => error instanceof LLMError && error.code === 'bad_request' && /signature|thinking/i.test(error.message)

/**
 * warmCache() for Anthropic brains. `messages` ends with the user message being written
 * (its text may still be empty). Returns null when warming isn't worth it.
 * @param {Connection & Prompt} options @returns {Promise<Usage | null>}
 */
export async function warmCache({ signal, fetch = globalThis.fetch, ...options }) {
  const request = anthropicRequest(options)
  const { body } = request
  delete body.cache_control
  delete body.stream
  delete body.fallbacks
  body.max_tokens = 0
  // The breakpoint goes on the last block the real request will share: never on the placeholder.
  while (body.messages.at(-1)?.role === 'system') body.messages.pop()
  const last = body.messages.at(-1)
  if (last?.role === 'user' && last.content.at(-1)?.type === 'text' && !last.content.at(-1).text) last.content.pop()
  const block = last?.content.at(-1)
  if (!block || JSON.stringify(body).length / 4 < minimumCacheable(options.brain.model)) return null
  last.content[last.content.length - 1] = { ...block, cache_control: { type: 'ephemeral' } }
  if (last.role === 'user') last.content.push({ type: 'text', text: '…' })
  else body.messages.push({ role: 'user', content: [{ type: 'text', text: '…' }] })
  const res = await post(fetch, request, signal)
  const json = await res.json().catch(() => null)
  return json?.usage ? anthropicUsage(json.usage) : null
}

/** Smallest prefix Anthropic caches, in tokens; shorter ones silently aren't. @param {string} model */
export function minimumCacheable(model) {
  if (/^claude-(opus-5|fable-5|mythos-5|sonnet-5-5)/.test(model)) return 512
  if (/^claude-(opus-4-7|mythos-preview|3-5-haiku|haiku-3-5)/.test(model)) return 2048
  if (/^claude-(opus-4-[56]|haiku-4-5)/.test(model)) return 4096
  return 1024
}

/** @param {Connection & Prompt} options @returns {WireRequest} */
function anthropicRequest({ brain, apiKey, system, messages, tools = [], maxTokens, effort }) {
  const headers = headersFor(brain, apiKey)
  /** @type {Record<string, any>} */
  const body = { model: brain.model, max_tokens: maxTokens ?? 64000, stream: true }
  // One breakpoint at the end of the frozen system prompt (tools come before it), and
  // automatic caching for the growing conversation (D49).
  if (system) body.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
  body.cache_control = { type: 'ephemeral' }
  // Summaries are shown to the user. budget_tokens and {type:'disabled'} are rejected by current models.
  if (ADAPTIVE_THINKING.test(brain.model)) body.thinking = { type: 'adaptive', display: 'summarized' }
  if (effort && EFFORT.test(brain.model)) body.output_config = { effort }
  if (FALLBACK_MODELS.has(brain.model)) {
    // On a safety refusal, the API continues on a fallback model inside the same stream.
    body.fallbacks = 'default'
    headers['anthropic-beta'] = [headers['anthropic-beta'], FALLBACK_BETA].filter(Boolean).join(',')
  }
  body.messages = toAnthropic(messages, brain.model)
  // The brain's own web search runs on Anthropic's side: with dynamic filtering from Claude 4.6 on.
  const search = { type: ADAPTIVE_THINKING.test(brain.model) ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search', max_uses: 5 }
  if (tools.length) {
    body.tools = tools.map((t) => (t.native === 'web_search' && !searchOff ? search
      : { name: t.name, description: t.description, input_schema: t.parameters, eager_input_streaming: true }))
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
  /** @type {(AnthropicMessage | SystemNote)[]} */
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

/** @param {Exclude<ChatMessage, SystemNote>} m @param {string} model @returns {AnthropicMessage} */
function toAnthropicMessage(m, model) {
  if (m.role === 'user') {
    const documents = (m.documents ?? []).flatMap((doc) => [{ type: 'text', text: documentBlock(doc) }, ...(doc.images ?? []).map(({ mimeType, data }) => ({ type: 'image', source: { type: 'base64', media_type: mimeType, data } }))])
    return { role: 'user', content: m.content ? [...documents, { type: 'text', text: m.content }] : documents }
  }
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
    // Text that cites web pages: the sources follow it, as [n] once numbered.
    const cited = type === 'content_block_stop' ? blocks[d.index]?.citations?.filter((/** @type {any} */ c) => c.url) : null
    if (cited?.length) yield { type: 'cite', sources: cited.map((/** @type {any} */ c) => ({ title: c.title || c.url, url: c.url, quote: c.cited_text })) }
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
  yield doneEvent(STOP.get(stop) ?? 'other', anthropicUsage(usage), text, toolCalls, raw)
}

/** @param {any} block */
function startBlock(block = {}) {
  switch (block.type) {
    case 'text': return { type: 'text', text: block.text ?? '' }
    case 'thinking': return { type: 'thinking', thinking: block.thinking ?? '', signature: block.signature ?? '' }
    case 'redacted_thinking': return { type: 'redacted_thinking', data: block.data }
    case 'tool_use': return { type: 'tool_use', id: block.id, name: block.name, json: '' }
    // Server tools (the brain's own search) and their results; 'fallback' is a marker, never echoed back.
    default: return SERVER_BLOCK.test(block.type) ? { ...block, json: '' } : { type: block.type }
  }
}

/** @param {any} block @param {any} delta @returns {StreamEvent|null} */
function applyDelta(block, delta) {
  if (!block || !delta) return null
  if (delta.type === 'signature_delta') block.signature += delta.signature
  if (delta.type === 'input_json_delta') block.json += delta.partial_json
  if (delta.type === 'citations_delta') (block.citations ??= []).push(delta.citation)
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
    default: {
      if (!SERVER_BLOCK.test(block.type)) return null
      const { json, ...rest } = block
      return json ? { ...rest, input: parseArgs(json) } : rest
    }
  }
}

/** Anthropic counts cached input apart; Usage.inputTokens counts all of it. @param {any} u @returns {Usage} */
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
