// What of a task goes in a share (D361): its requests and answers and the files it made, by their
// places in the project, which the share holds them under, never its file as it is. The notes (memory,
// instructions, the folder, the page on show), the prompt its brain was given, its thinking, plans and
// summaries, what the page reached and the device's id stay here; what Jean read (the tools' calls and
// results, the files shared) goes only when the person says so. No DOM: tested with node --test.
import { filesMade } from '../../core/events.js'

/** What a call that made a file keeps: the file, who made it (D263). */
const MADE = ['file', 'picture', 'files', 'made']

/**
 * A conversation's file as its share copy, JSONL too.
 * @param {string} file the conversation's JSONL
 * @param {{ read?: boolean, aFile: string }} options read: with what Jean read; aFile: what a shared file is called otherwise
 */
export function copyOf(file, { read = false, aFile }) {
  const [first = '{}', ...lines] = file.split('\n')
  const header = JSON.parse(first)
  /** @type {any[]} */
  const records = lines.flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } })
  // Each call as it ended, its updates over it, as the room folds them.
  /** @type {Map<string, any>} */
  const calls = new Map()
  for (const { update } of records) if (update?.sessionUpdate === 'tool_call' || update?.sessionUpdate === 'tool_call_update') calls.set(update.toolCallId, { ...calls.get(update.toolCallId), ...update })
  const kept = records.flatMap(({ at, step, update }) => {
    const kind = update?.sessionUpdate
    /** @param {any} kept */
    const as = (kept) => [{ at, by: kind === 'user_message_chunk' ? 'user' : 'jean', ...(step !== undefined && { step }), update: kept }]
    if (kind === 'user_message_chunk' && update.content.type === 'resource_link') {
      return as({ sessionUpdate: kind, content: { type: 'resource_link', uri: read ? update.content.uri : '', name: read ? update.content.name : aFile, ...(read && update.content.mimeType && { mimeType: update.content.mimeType }) } })
    }
    if (kind === 'user_message_chunk' || kind === 'agent_message_chunk') return as({ sessionUpdate: kind, content: update.content })
    if (kind !== 'tool_call' && kind !== 'tool_call_update') return []
    if (read) return as(update)
    const call = calls.get(update.toolCallId)
    if (kind !== 'tool_call' || !filesMade([call]).length) return []
    const meta = Object.fromEntries(MADE.flatMap((name) => (call._meta?.[name] ? [[name, call._meta[name]]] : [])))
    return as({ sessionUpdate: 'tool_call', toolCallId: call.toolCallId, title: '', status: call.status, _meta: meta,
      rawInput: call._meta?.picture && call.rawInput?.description ? { description: call.rawInput.description } : {} })
  })
  return `${[{ format: header.format, kind: header.kind, id: header.id, createdAt: header.createdAt, by: 'user' }, ...kept].map((record) => JSON.stringify(record)).join('\n')}\n`
}
