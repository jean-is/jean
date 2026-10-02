// ACP records: building them, folding them for display, and deriving the
// model's context from them. One log, two readers.
/** @typedef {import('./types.js').Envelope} Envelope */
/** @typedef {import('./types.js').AcpUpdate} AcpUpdate */
/** @typedef {import('./types.js').ToolCallInfo} ToolCallInfo */
/** @typedef {import('./types.js').ChatMessage} ChatMessage */
/** @typedef {import('./types.js').ToolMessage} ToolMessage */
/** @typedef {import('./types.js').PlanEntry} PlanEntry */
/** @typedef {import('./types.js').ResourceLink} ResourceLink */
/** @typedef {import('./types.js').DocumentPart} DocumentPart */
/** @typedef {import('./types.js').SystemNoteData} SystemNoteData */

/**
 * @param {string} by @param {AcpUpdate} update @param {number} [step]
 * @returns {Envelope}
 */
export function envelope(by, update, step) {
  return step === undefined
    ? { at: new Date().toISOString(), by, update }
    : { at: new Date().toISOString(), by, step, update }
}

/** @param {string} text @param {string} by */
export function userRecord(text, by) {
  return envelope(by, { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } })
}

/**
 * One user message: a chunk per shared file, then the text. Consecutive user chunks
 * fold into a single message.
 * @param {string} text @param {ResourceLink[]} files @param {string} by
 */
export function userRecords(text, files, by) {
  const links = files.map((link) => envelope(by, { sessionUpdate: 'user_message_chunk', content: link }))
  return text || !links.length ? [...links, userRecord(text, by)] : links
}

/**
 * A system note (D46): what changed, in English for the brain, plus data for the UI.
 * @param {string} text @param {SystemNoteData} data
 */
export function noteRecord(text, data) {
  return envelope('jean', { sessionUpdate: '_system_note', text, data })
}

/** @param {string} by @param {Record<string, any>} meta @returns {Envelope} */
export function metaRecord(by, meta) {
  return { at: new Date().toISOString(), by, meta }
}

/**
 * @typedef {{ index: number, text: string, thought: string, tools: ToolCallInfo[] }} Step
 * @typedef {{ text: string, data: SystemNoteData }} Note
 * @typedef {{ text: string, files: ResourceLink[], at: string }} UserTurn
 * @typedef {{ user: UserTurn | null, notes: Note[], steps: Step[], plan?: PlanEntry[], at: string }} Turn
 *   notes are the system notes recorded just before this turn's user message.
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
  for (const record of records) {
    const update = record.update
    if (!update) continue
    const kind = update.sessionUpdate
    if (kind === '_system_note') notes.push({ text: update.text, data: update.data })
    else if (kind === 'user_message_chunk') {
      if (previous !== kind || !turn?.user) {
        turn = { user: { text: '', files: [], at: record.at }, notes, steps: [], at: record.at }
        turns.push(turn)
        notes = []
      }
      const user = /** @type {UserTurn} */ (turn.user)
      if (update.content.type === 'resource_link') user.files.push(update.content)
      else user.text += update.content.text
    } else {
      if (!turn) turns.push((turn = { user: null, notes: [], steps: [], at: record.at }))
      applyUpdate(turn, update, record.step ?? 0)
    }
    previous = kind
  }
  return turns
}

/** Every file linked from the conversation, in order. @param {Envelope[]} records */
export function linkedFiles(records) {
  /** @type {ResourceLink[]} */
  const links = []
  for (const record of records) {
    const update = record.update
    if (update?.sessionUpdate === 'user_message_chunk' && update.content.type === 'resource_link') links.push(update.content)
  }
  return links
}

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

/**
 * The model's context: system notes and user messages, then per step one assistant
 * message followed by its tool results. Brain entries (kind "think", no name) are skipped,
 * except for the provider-native blocks they keep for replay.
 * @param {Envelope[]} records
 * @param {(link: ResourceLink) => DocumentPart} [document] the text the brain reads for a linked file
 * @returns {ChatMessage[]}
 */
export function toChatMessages(records, document = (link) => ({ name: link.name, text: '' })) {
  /** @type {ChatMessage[]} */
  const messages = []
  for (const turn of foldTurns(records)) {
    for (const note of turn.notes) messages.push({ role: 'system', content: note.text })
    if (turn.user) {
      const documents = turn.user.files.map(document)
      messages.push({ role: 'user', content: turn.user.text, ...(documents.length && { documents }) })
    }
    for (const step of [...turn.steps].sort((a, b) => a.index - b.index)) {
      const calls = step.tools.filter((tool) => tool.name && tool.status !== 'pending' && tool.status !== 'in_progress')
      if (!step.text && !calls.length) continue
      const brain = step.tools.find((tool) => tool.kind === 'think' && !tool.name && tool._meta?.raw)
      messages.push({
        role: 'assistant',
        content: step.text,
        ...(calls.length && { toolCalls: calls.map((tool) => ({ id: tool.toolCallId, name: String(tool.name), args: tool.rawInput ?? {} })) }),
        ...(brain && { raw: brain._meta?.raw, rawModel: brain.rawInput?.model }),
      })
      for (const tool of calls) {
        /** @type {ToolMessage} */
        const result = { role: 'tool', toolCallId: tool.toolCallId, name: String(tool.name), content: stringify(tool.rawOutput) }
        if (tool.status === 'failed') result.isError = true
        messages.push(result)
      }
    }
  }
  return messages
}

/** @param {unknown} value */
function stringify(value) {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** Latest title from meta records. @param {Envelope[]} records */
export function titleOf(records) {
  let title = ''
  for (const record of records) if (record.meta?.title) title = record.meta.title
  return title
}
