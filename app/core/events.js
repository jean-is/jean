// ACP records: building them, folding them for display, and deriving the
// model's context from them. One log, two readers.
/** @import { Envelope, AcpUpdate, ToolCall, ToolCallInfo, ChatMessage, ToolMessage, PlanEntry, ResourceLink, DocumentPart, SystemNoteData } from './types.js' */

/** @param {string} by @param {AcpUpdate} update @param {number} [step] @returns {Envelope} */
export const envelope = (by, update, step) => ({ at: new Date().toISOString(), by, ...(step !== undefined && { step }), update })

/** @param {string} text @param {string} by */
export const userRecord = (text, by) => envelope(by, { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } })

/**
 * One user message: a chunk per shared file, then the text. Consecutive user chunks
 * fold into a single message.
 * @param {string} text @param {ResourceLink[]} files @param {string} by
 */
export function userRecords(text, files, by) {
  const links = files.map((link) => envelope(by, { sessionUpdate: 'user_message_chunk', content: link }))
  return text || !links.length ? [...links, userRecord(text, by)] : links
}

/** A system note (D46): what changed, in English for the brain, plus data for the UI. @param {string} text @param {SystemNoteData} data */
export const noteRecord = (text, data) => envelope('jean', { sessionUpdate: '_system_note', text, data })

/** @param {string} by @param {Record<string, any>} meta @returns {Envelope} */
export const metaRecord = (by, meta) => ({ at: new Date().toISOString(), by, meta })

/**
 * @typedef {{ index: number, text: string, thought: string, tools: ToolCallInfo[] }} Step
 * @typedef {{ text: string, data: SystemNoteData }} Note
 * @typedef {{ text: string, files: ResourceLink[], at: string, upTo: number }} UserTurn upTo: how many records lead up to its end
 * @typedef {{ user: UserTurn | null, notes: Note[], steps: Step[], plan?: PlanEntry[], at: string, end?: string }} Turn
 *   notes are the system notes recorded just before this turn's user message; end is when its answer was last written.
 */

/** Fold records into turns for display. @param {Envelope[]} records @returns {Turn[]} */
export function foldTurns(records) {
  /** @type {Turn[]} */
  const turns = []
  /** @type {Turn | null} */
  let turn = null
  /** @type {Note[]} */
  let notes = []
  let previous = ''
  for (const [index, record] of records.entries()) {
    const update = record.update
    if (!update) continue
    const kind = update.sessionUpdate
    if (kind === '_system_note') notes.push({ text: update.text, data: update.data })
    else if (kind === 'user_message_chunk') {
      if (previous !== kind || !turn?.user) {
        turn = { user: { text: '', files: [], at: record.at, upTo: 0 }, notes, steps: [], at: record.at }
        turns.push(turn)
        notes = []
      }
      const user = /** @type {UserTurn} */ (turn.user)
      user.upTo = index + 1
      if (update.content.type === 'resource_link') user.files.push(update.content)
      else user.text += update.content.text
    } else {
      if (!turn) turns.push((turn = { user: null, notes: [], steps: [], at: record.at }))
      applyUpdate(turn, update, record.step ?? 0)
      turn.end = record.at
    }
    previous = kind
  }
  return turns
}

/** Every file linked from the conversation, in order. @param {Envelope[]} records @returns {ResourceLink[]} */
export const linkedFiles = (records) => records.flatMap(({ update }) => (update?.sessionUpdate === 'user_message_chunk' && update.content.type === 'resource_link' ? [update.content] : []))

/** A picture brains that can see take as it is: PNG, JPEG, WebP or GIF. @param {ResourceLink} link */
export const isPicture = (link) => /^image\/(png|jpeg|webp|gif)$/.test(link.mimeType ?? '')

/** @param {Turn} turn @param {AcpUpdate} update @param {number} index */
export function applyUpdate(turn, update, index) {
  if (update.sessionUpdate === 'plan') {
    turn.plan = update.entries
    return
  }
  let step = turn.steps.find((candidate) => candidate.index === index)
  if (!step) turn.steps.push((step = { index, text: '', thought: '', tools: [] }))
  if (update.sessionUpdate === 'agent_message_chunk') step.text += update.content.text
  else if (update.sessionUpdate === 'agent_thought_chunk') step.thought += update.content.text
  else if (update.sessionUpdate === 'user_message_chunk' || update.sessionUpdate === '_system_note') return
  else if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
    const { sessionUpdate, ...info } = update
    const existing = step.tools.find((tool) => tool.toolCallId === info.toolCallId)
    if (existing) Object.assign(existing, info)
    else step.tools.push(/** @type {ToolCallInfo} */ ({ ...info }))
  }
}

/** What a page closed on while the last turn waited for the user: its last step's unended calls, to run again (D212). @param {Envelope[]} records @returns {{ step: number, calls: ToolCall[] } | null} */
export function unanswered(records) {
  const step = foldTurns(records).at(-1)?.steps.at(-1)
  const calls = step?.tools.filter((tool) => tool.name && !tool._meta?.parent && tool.status === 'pending') ?? []
  return step && calls[0]?._meta?.waiting ? { step: step.index, calls: calls.map((tool) => ({ id: tool.toolCallId, name: String(tool.name), args: tool.rawInput ?? {} })) } : null
}

/**
 * The model's context: system notes and user messages, then per step one assistant
 * message followed by its tool results. Brain entries (kind "think", no name) are skipped,
 * except for the provider-native blocks they keep for replay.
 * @param {Envelope[]} records
 * @param {(link: ResourceLink) => DocumentPart} [document] the text the brain reads for a linked file
 * @param {{ step: number } | null} [resume] the last turn's step whose unended calls run again now, their results to come (D212)
 * @returns {ChatMessage[]}
 */
export function toChatMessages(records, document = (link) => ({ name: link.name, text: '' }), resume = null) {
  /** @type {ChatMessage[]} */
  const messages = []
  const turns = foldTurns(records)
  for (const turn of turns) {
    for (const note of turn.notes) messages.push({ role: 'system', content: note.text })
    if (turn.user) {
      const documents = turn.user.files.map(document)
      messages.push({ role: 'user', content: turn.user.text, ...(documents.length && { documents }) })
    }
    for (const step of [...turn.steps].sort((a, b) => a.index - b.index)) {
      // A script's own calls (codemode) are part of its result, not of the brain's turn.
      const calls = step.tools.filter((tool) => tool.name && !tool._meta?.parent)
      if (!step.text && !calls.length) continue
      const brain = step.tools.find((tool) => tool.kind === 'think' && !tool.name && tool._meta?.raw)
      messages.push({
        role: 'assistant',
        content: step.text,
        ...(calls.length && { toolCalls: calls.map((tool) => ({ id: tool.toolCallId, name: String(tool.name), args: tool.rawInput ?? {} })) }),
        ...(brain && { raw: brain._meta?.raw, rawModel: brain.rawInput?.model }),
      })
      for (const tool of calls) {
        // A call that never ended (stopped, or the page closed) was cut short, unless it runs again now (D212).
        if (tool.status === 'pending' && turn === turns.at(-1) && step.index === resume?.step) continue
        /** @type {ToolMessage} */
        const result = { role: 'tool', toolCallId: tool.toolCallId, name: String(tool.name), content: tool.status === 'pending' || tool.status === 'in_progress' ? 'Cut short before it ended: it may not have been done.' : stringify(tool.rawOutput) }
        if (tool.status !== 'completed') result.isError = true
        messages.push(result)
      }
    }
  }
  return messages
}

/** @param {unknown} value */
const stringify = (value) => (value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value))

/**
 * A reply's text without the follow-ups the brain suggested in a trailing <suggestions>
 * block, which is hidden from its opening tag on (even mid-stream), and those follow-ups.
 * @param {string} text
 */
export function splitSuggestions(text) {
  const at = text.search(/<suggestions>|<s(u(g(g(e(s(t(i(o(n(s)?)?)?)?)?)?)?)?)?)?$/i)
  if (at < 0) return { text, suggestions: [] }
  const lines = text.slice(at).replace(/<\/?suggestions>?/gi, '').split('\n')
  const suggestions = lines.map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])?\s*/, '').trim()).filter((line) => line && !line.startsWith('<'))
  return { text: text.slice(0, at).trimEnd(), suggestions: suggestions.slice(0, 3) }
}

/** Latest title from meta records. @param {Envelope[]} records @returns {string} */
export const titleOf = (records) => records.findLast((record) => record.meta?.title)?.meta?.title ?? ''

/** The words of each request, in order. @param {Envelope[]} records @returns {string[]} */
export const requestsOf = (records) => records.flatMap(({ update }) => (update?.sessionUpdate === 'user_message_chunk' && update.content.type === 'text' && update.content.text ? [update.content.text] : []))

/** The words of the request that opened the conversation. @param {Envelope[]} records */
export const openingOf = (records) => requestsOf(records)[0] ?? ''

/** The routine a conversation is a run of, from the note it opens with (D122). @param {Envelope[]} records */
export const routineOf = (records) => records.flatMap(({ update }) => (update?.sessionUpdate === '_system_note' && update.data.kind === 'routine' ? [update.data] : []))[0]

/**
 * A file Jean made or changed: Things Jean made's (`_meta.file`), or one the computer kept
 * (`_meta.files`), with its version in the conversation (D164).
 * @typedef {{ uri: string, name: string, mimeType: string, size: number, version?: number }} MadeFile
 */

/**
 * The tool calls of a conversation, in order: those its records hold, then those of the answer
 * being written. @param {Envelope[]} records @param {{ tools: ToolCallInfo[] }[]} [steps]
 * @returns {ToolCallInfo[]}
 */
export const callsIn = (records, steps = []) => [
  ...records.flatMap(({ update }) => (update?.sessionUpdate === 'tool_call' ? [/** @type {ToolCallInfo} */ (update)] : [])),
  ...steps.flatMap((step) => step.tools),
]

/** Where a file of the conversation is as it is now: the copy the user last changed it into in the preview, else itself (D229). @param {Envelope[]} records @param {string} uri */
export const latestOf = (records, uri) => records.flatMap(({ update }) => (update?.sessionUpdate === '_system_note' && update.data.kind === 'cells' && update.data.was === uri ? [update.data.uri] : [])).at(-1) ?? uri

/** Every file the calls made, in order. @param {ToolCallInfo[]} calls @returns {MadeFile[]} */
export const filesMade = (calls) => calls.flatMap((call) => [call._meta?.file, ...(call._meta?.files ?? [])].filter(Boolean))

/**
 * A file's versions in a conversation, oldest first, by its name, numbered: each one made, a
 * version made again just after itself counted once (D164).
 * @param {MadeFile[]} made @param {string} name @returns {Required<MadeFile>[]}
 */
export function versionsOf(made, name) {
  /** @type {Required<MadeFile>[]} */
  const versions = []
  for (const file of made) if (file.name === name && versions.at(-1)?.uri !== file.uri) versions.push({ ...file, version: versions.length + 1 })
  return versions
}

/** The version a file just made will be: the next, unless it is the last one again. @param {MadeFile[]} made @param {string} name @param {string} uri */
export function nextVersion(made, name, uri) {
  const versions = versionsOf(made, name)
  return versions.at(-1)?.uri === uri ? versions.length : versions.length + 1
}
