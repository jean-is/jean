// Compaction (D359): a conversation near its brain's window is summed up by that same brain, on the same system, tools
// and history plus one request, and the brain reads on from the summary (core/loop.js's turn.compact). Its record is ACP's
// compaction_update: the summary, for the user to read, and in _meta what the brain reads, the summary and what Jean knows
// for sure: the sources and files by number, the notes in force and the request at work, word for word. The file keeps
// everything and the room shows it whole: the summary is only read. Loaded the first time a conversation
// passes half its window (ui/send.js); Ollama and LM Studio are asked the window they gave their brain.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { Element, define } from '../../ui/base.js'
import { app } from '../../ui/state.js'
import { icons } from '../../ui/menu-icons.js'
import { markdown } from '../../ui/markdown.js'
import { styleSheet } from '../../ui/sheet.js'
import { loadConversation } from '../../core/conversations.js'
import { envelope, foldTurns, linkedFiles } from '../../core/events.js'
import { estimateMessages } from '../../core/files.js'
import { LLMError } from '../../core/llm.js'
import { t, useStrings } from '../../core/i18n.js'
import { ulid } from '../../core/ulid.js'

/** @import { BrainConfig, ChatMessage, CompactionUpdate, Envelope, StreamEvent, ToolCallInfo, Usage } from '../../core/types.js' */

await Promise.all([useStrings('compact'), styleSheet(new URL('compact.css', import.meta.url))])

/** Past this share of its window, a conversation is summed up before the brain is asked again. */
const FULL = 0.75
/** The smallest window Ollama gives a brain: below it, nothing is cut anywhere. */
const SMALLEST = 4096
/** Servers asked the window they gave their brain; those whose own count may not say what was sent, with any address. */
const ASKED = ['ollama', 'lmstudio']
const SERVERS = [...ASKED, 'custom']
/** What a call's result keeps when the conversation is past its window: the last step's more. */
const CUT = 2000

// Anthropic's summary for compaction, kept calm.
const ASK = `This conversation has grown too long to keep in full. Write a summary of it that lets you carry on from there, in place of everything before it:
- what the user asked for, and what they decided, chose or ruled out, in their own words where it matters;
- what was done so far and what came of it: problems met and how they were handled, what was tried or set aside;
- what the latest results hold that the rest of the task needs;
- where things stand, and what is left to do;
- exact names, numbers, dates, file names and links.
Write it in the language the user writes in, as plain notes. Do not call any tools; respond with text only.`

/** The notes that hold until another of their kind: the latest of each, a section's by its name; tools found and switched, all. */
const STANDING = ['language', 'date', 'section', 'tools', 'switch']

/** The window each local brain was given, by brain and model, while the page is open. @type {Map<string, number>} */
const windows = new Map()
/** @param {BrainConfig} brain */
const keyOf = (brain) => `${brain.id} ${brain.model}`

/**
 * The window a local server gave its brain, loading it first as a request would: Ollama's /api/ps, LM Studio's
 * /api/v1/models. Jean never chooses it: that is the user's memory. @param {BrainConfig} brain @param {AbortSignal} [signal]
 * @returns {Promise<number | undefined>}
 */
async function served(brain, signal) {
  const origin = new URL(brain.baseURL).origin
  /** @param {string} path @param {object} [body] posted when given @returns {Promise<any>} */
  const ask = async (path, body) => (await fetch(`${origin}${path}`, {
    signal, headers: { 'content-type': 'application/json', ...brain.headers }, ...(body && { method: 'POST', body: JSON.stringify(body) }) })).json()
  if (brain.provider === 'ollama') {
    const loaded = async () => (await ask('/api/ps')).models?.find((/** @type {any} */ model) => [brain.model, `${brain.model}:latest`].includes(model.name))?.context_length
    // Loaded with no prompt, nothing is written (done_reason "load").
    return await loaded() ?? (await ask('/api/generate', { model: brain.model }), await loaded())
  }
  const listed = (await ask('/api/v1/models')).models?.find((/** @type {any} */ model) => model.key === brain.model || model.loaded_instances?.some((/** @type {any} */ one) => one.id === brain.model))
  return listed?.loaded_instances?.[0]?.config?.context_length ?? (await ask('/api/v1/models/load', { model: brain.model, echo_load_config: true })).load_config?.context_length
}

/**
 * How full the brain's window is, in tokens: what it last read and wrote, plus what came since; Jean's own estimate where
 * nothing was counted, and the larger of the two on a local server, which may count only what it kept.
 * @param {{ brain: BrainConfig, system: string, tools: object[], messages: ChatMessage[], usage?: Usage }} e
 */
function fullness({ brain, system, tools, messages, usage }) {
  const estimated = estimateMessages([system, tools, messages])
  if (!usage?.inputTokens) return estimated
  const counted = usage.inputTokens + (usage.outputTokens ?? 0) + estimateMessages(messages.slice(messages.findLastIndex((message) => message.role === 'assistant') + 1))
  return SERVERS.includes(brain.provider) ? Math.max(counted, estimated) : counted
}

/**
 * Before a step: past 3/4 of its window, or past it (the provider said so), the brain sums up the conversation, which
 * it reads on from. A summary that can't be written leaves the conversation as it is.
 * @param {any} e @param {(e?: any) => Promise<any>} next
 */
async function compact(e, next) {
  const size = fullness(e)
  let window = e.window
  if (ASKED.includes(e.brain.provider) && size > FULL * SMALLEST) {
    const asked = await served(e.brain, e.signal).catch((error) => console.warn('The local server’s window', error))
    if (asked) windows.set(keyOf(e.brain), asked)
    window = windows.get(keyOf(e.brain)) ?? window
  }
  if (e.reason === 'window' && size <= FULL * window) return next(e)
  const { text, usage } = await summary(e)
  if (!text) return next(e)
  const records = (e.task && (await loadConversation(app.fs, e.task))?.records) || []
  return envelope('jean', { sessionUpdate: 'compaction_update', compactionId: ulid(), status: 'completed', summary: [{ type: 'text', text }],
    _meta: { text: [`<summary>\n${text}\n</summary>`, ...known(records)].join('\n\n'), reason: e.reason, brain: { provider: e.brain.provider, model: e.brain.model }, ...(usage && { usage }) } })
}

/**
 * The brain's summary, on the conversation as it is, or, past the window, with what calls brought in and the files'
 * text cut short. @param {any} e @returns {Promise<{ text: string, usage?: Usage }>}
 */
async function summary(e) {
  const ask = async (/** @type {ChatMessage[]} */ messages) => {
    // After the request itself, in its message: some chat templates refuse two of the user's in a row.
    const last = messages.at(-1)
    const { text, done } = await e.ask(last?.role === 'user' ? [...messages.slice(0, -1), { ...last, content: `${last.content}\n\n${ASK}` }] : [...messages, { role: 'user', content: ASK }])
    // A brain that wrapped it in tags of its own: the record gives it its own.
    return { text: String(text).replace(/^\s*<summary>|<\/summary>\s*$/g, '').trim(), usage: done?.usage }
  }
  if (e.reason === 'window') {
    try {
      return await ask(e.messages)
    } catch (error) {
      if (!(error instanceof LLMError && error.code === 'too_long')) throw error
    }
  }
  const last = e.messages.findLastIndex((/** @type {ChatMessage} */ message) => message.role === 'assistant')
  return ask(e.messages.map((/** @type {ChatMessage} */ message, /** @type {number} */ i) => (message.role === 'tool' ? { ...message, content: short(message.content, i > last ? CUT * 4 : CUT) }
    : message.role === 'user' && message.documents ? { ...message, documents: message.documents.map(({ image, ...document }) => ({ ...document, text: short(document.text, CUT) })) } : message)))
}

/** @param {string} text @param {number} length */
const short = (text, length) => (text.length > length ? `${text.slice(0, length)}…` : text)

/**
 * What Jean knows for sure and the summary may not say: the sources and files by the numbers the brain cites them by
 * (D71), the notes in force, the plan (D364), then the request being worked on, word for word, with what it came with, and what the
 * user said since to steer it (D365). In English.
 * @param {Envelope[]} records @returns {string[]}
 */
function known(records) {
  /** @type {Map<number, string>} */
  const sources = new Map()
  /** @type {Map<number, string>} */
  const files = new Map()
  /** @type {Map<string | number, string>} */
  const notes = new Map()
  for (const [i, { update }] of records.entries()) {
    if (update?.sessionUpdate === 'tool_call') for (const { n, title, url } of update._meta?.sources ?? []) sources.set(n, `[${n}] ${title}${url ? ` <${url}>` : ''}`)
    if (update?.sessionUpdate !== '_system_note' || !STANDING.includes(update.data.kind)) continue
    const { data } = update
    notes.set(data.kind === 'section' ? data.name : data.kind === 'tools' || data.kind === 'switch' ? i : data.kind, update.text)
  }
  for (const { name, _meta } of linkedFiles(records)) {
    const pages = (_meta?.pages ?? []).map(([first, last]) => (first === last ? `${first}` : `${first}–${last}`)).join(', ')
    if (_meta?.source) files.set(_meta.source, `[${_meta.source}] ${name}${pages ? ` (pages ${pages} of ${_meta.of} were given)` : ''}`)
  }
  // The request at work is the last one that wasn't a steer; what the user said since steers it (D365).
  const turns = foldTurns(records)
  const at = turns.findLastIndex((turn) => turn.user && !turn.user.steer)
  const request = turns[at]
  const since = turns.slice(at + 1).flatMap((turn) => (turn.user?.steer ? [turn.user.text] : []))
  const plan = turns.slice(Math.max(at, 0)).findLast((turn) => turn.plan)?.plan
  return [
    ...(sources.size ? [`Sources cited so far, by number:\n${[...sources.values()].join('\n')}`] : []),
    ...(files.size ? [`Files the user shared, by number; read them again when needed:\n${[...files.values()].join('\n')}`] : []),
    ...(notes.size ? [`Notes in force:\n${[...notes.values()].map((text) => `- ${text}`).join('\n')}`] : []),
    ...(plan ? [`The plan, as it stood:\n${plan.map(({ content, status }) => `- [${status}] ${content}`).join('\n')}`] : []),
    ...(request?.user ? [`The request being worked on, word for word:\n<request>\n${[...request.notes.filter((note) => !STANDING.includes(note.data.kind)).map((note) => note.text), request.user.text].join('\n\n')}\n</request>`] : []),
    ...(since.length ? [`What the user said since, as the work went on, word for word:\n${since.map((text) => `<request>\n${text}\n</request>`).join('\n')}`] : []),
  ]
}

/**
 * A local server that cuts what doesn't fit without a word (Ollama) says it read far less than was sent: too long, as a
 * provider would say. Only a request past the window it gave can be cut, and there the answer is held until the server
 * says how much it read, so that a cut one is asked again once summed up, with nothing shown of it.
 * @param {any} e @param {(e?: any) => Promise<AsyncIterable<StreamEvent>>} next @returns {AsyncGenerator<StreamEvent>}
 */
async function* uncut(e, next) {
  const sent = estimateMessages([e.system, e.tools, e.messages])
  const window = windows.get(keyOf(e.brain))
  if (!ASKED.includes(e.brain.provider) || !window || sent <= window) return yield* await next(e)
  /** @type {StreamEvent[]} */
  const events = []
  for await (const event of await next(e)) {
    const read = event.type === 'done' && event.usage?.inputTokens
    if (read && read < sent / 2) throw new LLMError(`The server read ${read} tokens of about ${sent}: it cut what didn't fit in its window`, { code: 'too_long' })
    events.push(event)
  }
  yield* events
}

/**
 * A summary in the room: in the activity, the request that wrote it (`entry`); above the answer, a line where the
 * brain read on from it (`record`), which opens on what it wrote.
 */
class Compaction extends Element {
  #entry = signal(/** @type {ToolCallInfo | undefined} */ (undefined))
  #record = signal(/** @type {CompactionUpdate | undefined} */ (undefined))
  set entry(/** @type {ToolCallInfo} */ entry) { this.#entry.value = entry }
  set record(/** @type {CompactionUpdate} */ record) { this.#record.value = record }

  connectedCallback() {
    // What it was given before it was defined.
    const self = /** @type {any} */ (this)
    for (const name of ['entry', 'record']) {
      if (!Object.hasOwn(this, name)) continue
      const value = self[name]
      delete self[name]
      self[name] = value
    }
    super.connectedCallback()
  }

  render() {
    const [entry, record] = [this.#entry.value, this.#record.value]
    if (entry) return t(entry.status === 'failed' ? 'compact.failed' : entry.status === 'completed' ? 'compact.done' : 'compact.doing')
    if (!record) return nothing
    const text = (record.summary ?? []).map((block) => block.text).join('\n\n')
    return html`<details class="read-list compaction">
      <summary>${icons.scroll}<span>${t('compact.divider')}</span><span class="link-button">${t('compact.read')}</span>${icons.chevron}</summary>
      <div class="prose" dir="auto">${markdown(text)}</div>
    </details>`
  }
}
define('app-compaction', Compaction)

register({
  id: 'compact',
  hooks: [
    { on: 'turn.compact', run: compact },
    { on: 'turn.step', run: uncut },
  ],
})
