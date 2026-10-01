// ACP records: building them, folding them for display, and deriving the
// model's context from them. One log, two readers.
/** @typedef {import('./types.js').Envelope} Envelope */
/** @typedef {import('./types.js').AcpUpdate} AcpUpdate */
/** @typedef {import('./types.js').ToolCallInfo} ToolCallInfo */
/** @typedef {import('./types.js').ChatMessage} ChatMessage */
/** @typedef {import('./types.js').ToolMessage} ToolMessage */
/** @typedef {import('./types.js').PlanEntry} PlanEntry */

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

/** @param {string} by @param {Record<string, any>} meta @returns {Envelope} */
export function metaRecord(by, meta) {
  return { at: new Date().toISOString(), by, meta }
}

/**
 * @typedef {{ index: number, text: string, thought: string, tools: ToolCallInfo[] }} Step
 * @typedef {{ user: { text: string, at: string } | null, steps: Step[], plan?: PlanEntry[], at: string }} Turn
 */

/** Fold records into turns for display. @param {Envelope[]} records @returns {Turn[]} */
export function foldTurns(records) {
  /** @type {Turn[]} */
  const turns = []
  /** @type {Turn | null} */
  let turn = null
  for (const record of records) {
    const update = record.update
    if (!update) continue
    if (update.sessionUpdate === 'user_message_chunk') {
      turn = { user: { text: update.content.text, at: record.at }, steps: [], at: record.at }
      turns.push(turn)
      continue
    }
    if (!turn) turns.push((turn = { user: null, steps: [], at: record.at }))
    applyUpdate(turn, update, record.step ?? 0)
  }
  return turns
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
  else if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
    const { sessionUpdate, ...info } = update
    const existing = step.tools.find((tool) => tool.toolCallId === info.toolCallId)
    if (existing) Object.assign(existing, info)
    else step.tools.push(/** @type {ToolCallInfo} */ ({ ...info }))
  }
}

/**
 * The model's context: user messages, then per step one assistant message
 * followed by its tool results. Brain entries (kind "think", no name) are skipped.
 * @param {Envelope[]} records
 * @returns {ChatMessage[]}
 */
export function toChatMessages(records) {
  /** @type {ChatMessage[]} */
  const messages = []
  for (const turn of foldTurns(records)) {
    if (turn.user) messages.push({ role: 'user', content: turn.user.text })
    for (const step of [...turn.steps].sort((a, b) => a.index - b.index)) {
      const calls = step.tools.filter((tool) => tool.name && tool.status !== 'pending' && tool.status !== 'in_progress')
      if (!step.text && !calls.length) continue
      messages.push({
        role: 'assistant',
        content: step.text,
        ...(calls.length && { toolCalls: calls.map((tool) => ({ id: tool.toolCallId, name: String(tool.name), args: tool.rawInput ?? {} })) }),
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
