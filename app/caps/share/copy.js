// SPDX-License-Identifier: MIT
// What of a task goes in a share (D361): its requests and answers and the files it made, by their
// places in the project, which the share holds them under, never its file as it is. The notes (memory,
// instructions, the folder, the page on show), the prompt its brain was given, its thinking, plans and
// summaries, what the page reached and the device's id stay here; what Jean read (the tools' calls and
// results, the files shared) goes only when the person says so. A share brought in is read through it
// again, so its task holds only what a copy can. No DOM: tested with node --test.
import { filesMade, metaRecord } from '../../core/events.js'

/** What a call that made a file keeps: the file, who made it (D263). */
const MADE = ['file', 'picture', 'files', 'made']

/**
 * A conversation's file as its share copy, JSONL too.
 * @param {string} file the conversation's JSONL
 * @param {{ read?: boolean, aFile: string, files?: Record<string, string> }} options read: with what Jean read; aFile: what a shared
 * file is called otherwise; files: those that came with a share brought in, the only ones a link keeps its address to
 */
export function copyOf(file, { read = false, aFile, files }) {
  const [first = '{}', ...lines] = file.split('\n'), header = JSON.parse(first)
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
    if ((kind === 'user_message_chunk' || kind === 'agent_message_chunk') && update.content?.type === 'resource_link') {
      const { uri, name, mimeType } = update.content, shown = read && (!files || Object.hasOwn(files, uri))
      return as({ sessionUpdate: kind, content: { type: 'resource_link', uri: shown ? uri : '', name: shown ? name : aFile, ...(shown && mimeType && { mimeType }) } })
    }
    if (kind === 'user_message_chunk' || kind === 'agent_message_chunk') return as({ sessionUpdate: kind, content: update.content })
    if (kind !== 'tool_call' && kind !== 'tool_call_update') return []
    // Thinking stays here, its replay too, and no call declares a tool where it goes.
    if (read) return calls.get(update.toolCallId)?.kind === 'think' ? [] : as({ ...update, ...(update._meta && { _meta: { ...update._meta, raw: undefined, declare: undefined } }) })
    const call = calls.get(update.toolCallId)
    if (kind !== 'tool_call' || !filesMade([call]).length) return []
    const meta = Object.fromEntries(MADE.flatMap((name) => (call._meta?.[name] ? [[name, call._meta[name]]] : [])))
    return as({ sessionUpdate: 'tool_call', toolCallId: call.toolCallId, title: '', status: call.status, _meta: meta,
      rawInput: call._meta?.picture && call.rawInput?.description ? { description: call.rawInput.description } : {} })
  })
  return `${[{ format: header.format, kind: header.kind, id: header.id, createdAt: header.createdAt, by: 'user' }, ...kept].map((record) => JSON.stringify(record)).join('\n')}\n`
}

/**
 * The records a share brought in writes as its task (Continue with Jean): its copy again, links only to the files that came with it,
 * and what its parts were filled with, as its sender's Jean kept it (ui/export.js, keeping()).
 * @param {string} file the share's JSONL @param {Record<string, string>} files those that came with it @param {string} aFile
 */
export function broughtIn(file, files, aFile) {
  const filled = file.split('\n').map((line) => { try { return JSON.parse(line).meta?.filled } catch { return undefined } }).findLast((one) => one && typeof one === 'object')
  const [, ...records] = copyOf(file, { read: true, aFile, files }).trim().split('\n').map((line) => JSON.parse(line))
  return [...records, ...(filled ? [metaRecord('user', { filled })] : [])]
}
