// SPDX-License-Identifier: MIT
// A task worked on together (D734): its changes are records, appended to each copy in the order they come. What goes is what a member
// wrote: requests, answers, activity, plans; never what is the person's own, their frozen prompt and its notes, a summary, or thoughts.
// Another's turn is written after a `shared` note naming them, as People writes what someone sent (D727), so the room says "From Ana",
// their requests are theirs, without actions, and the task holds something from elsewhere (D673).
import { app, refreshConversations, openConversation } from '../../ui/state.js'
import { appendRecords } from '../../core/conversations.js'
import { canonical } from '../tables/table.js'

/** Where a task is: its project's folder and its file there. @typedef {{ dir: string, folder: string }} Place */
/** What the journal holds of it: each record, as text. @typedef {{ lines: Set<string>, table: string }} Held */
/** @typedef {import('../../core/types.js').Envelope & { who?: { fp: string, name: string } }} Record */

/** What goes: a member's own words and work, never what is theirs alone. @param {Record} record */
export const goes = (record) => !record.who && !record.meta && ['user_message_chunk', 'agent_message_chunk', 'tool_call', 'tool_call_update', 'plan'].includes(String(record.update?.sessionUpdate))
/** A record as the journal names it, whoever wrote it. @param {Record} record */
const keyOf = ({ who: _, ...record }) => canonical(record)
/** @param {Place} place */
const pathOf = ({ dir, folder }) => `${dir}/${folder}`
/** @param {Place} place @returns {Promise<Record[]>} */
const read = async (place) => ((await app.fs.read(pathOf(place))) ?? '').split('\n').slice(1).flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } })

/** The task's title as the person who shared it gave it. @param {Place} place */
export const titleOf = async (place) => app.conversations.peek().find((one) => one.path === pathOf(place))?.title ?? ''

/** All of it, for a seed: its id and title, and what goes of its records. @param {Place} place */
export const seedOf = async (place) => ({ id: place.folder.slice(-32, -6), title: await titleOf(place), records: (await read(place)).filter(goes) })

/** What a seed holds, taken as the journal's. @param {Held} held @param {{ records: Record[] }} content */
export const hold = (held, { records }) => { for (const record of records) held.lines.add(keyOf(record)) }

/** Tasks whose records came while they were being answered here, written once the answer ends. @type {Map<string, Record[]>} */
const waiting = new Map()

/**
 * What came, taken in: records written where they aren't, another's turn after a note naming them; a newcomer's first seed makes the
 * task. @param {Place} place @param {{ records?: Record[], id?: string }} body @param {Held} held @param {{ me: string, names: (fp: string) => string }} who
 */
export async function take(place, body, held, { me, names }) {
  const path = pathOf(place)
  const records = (Array.isArray(body.records) ? body.records : []).filter((record) => record?.update && record.who?.fp !== me && !held.lines.has(keyOf(record)))
  for (const record of records) held.lines.add(keyOf(record))
  if (!records.length) return
  if (!(await app.fs.exists(path))) await app.fs.write(path, `${JSON.stringify({ format: 1, kind: 'conversation', id: body.id ?? place.folder.slice(-32, -6), createdAt: new Date().toISOString(), by: app.deviceId })}\n`)
  // Each turn of someone else's opens with a note naming them; their requests are theirs.
  const out = /** @type {Record[]} */ ([])
  let last = /** @type {any} */ ((await read(place)).findLast((record) => record.update?.sessionUpdate === '_system_note' && record.update.data?.kind === 'shared')?.update)?.data?.person
  for (const record of records) {
    const fp = record.who?.fp ?? ''
    if (record.update?.sessionUpdate === 'user_message_chunk' && fp !== last) {
      out.push({ at: record.at, by: 'jean', update: { sessionUpdate: '_system_note', text: '', data: { kind: 'shared', person: fp, name: names(fp) } } })
      last = fp
    }
    out.push(record.update?.sessionUpdate === 'user_message_chunk' ? { ...record, update: { ...record.update, _meta: { ...record.update._meta, theirs: true } } } : record)
  }
  if (app.running.peek().some((one) => one === path)) waiting.set(path, [...waiting.get(path) ?? [], ...out])
  else await written(path, out)
}

/** Records written, and the task read again where it is open. @param {string} path @param {Record[]} records */
async function written(path, records) {
  await appendRecords(app.fs, path, /** @type {any} */ (records))
  await refreshConversations()
  if (app.current.peek()?.path === path) await openConversation(path)
}
/** Once an answer here ends, what came meanwhile goes in after it. */
export const after = () => { for (const [path, records] of waiting) if (!app.running.peek().includes(path)) { waiting.delete(path); written(path, records) } }

/** Where each task followed posts what its member writes (the `record` hook). @type {Map<string, (records: Record[]) => void>} */
export const posting = new Map()
/** What the person writes here goes, record by record as keepRecords writes it. @param {Place} place @param {Held} held @param {(body: { records: Record[] }) => Promise<unknown>} post */
export function watch(place, held, post) {
  const path = pathOf(place)
  posting.set(path, (records) => {
    const fresh = records.filter((record) => goes(record) && !held.lines.has(keyOf(record)))
    for (const record of fresh) held.lines.add(keyOf(record))
    if (fresh.length) post({ records: fresh }).catch((error) => console.warn('Together', error))
  })
  return () => posting.delete(path)
}

/**
 * The records as each brain reads a task worked on together: others' requests and answers quoted, each line marked, as their words
 * rather than the person's request; their activity and the notes naming them left out (D734). @param {Record[]} records @param {(fp: string) => string} names
 */
export const viewed = (records, names) => records.flatMap((record) => /** @type {Record[]} */ (/** @type {any} */ ((() => {
  const u = /** @type {any} */ (record.update)
  if (u?.sessionUpdate === '_system_note' && u.data?.kind === 'shared' && u.data?.name !== undefined) return []
  if (!record.who) return [record]
  const name = names(record.who.fp) || 'Someone'
  const quoted = (/** @type {string} */ text) => text.split('\n').map((line) => `> ${line}`).join('\n')
  if (u?.sessionUpdate === 'user_message_chunk' && u.content?.type === 'text') return [{ at: record.at, by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: `${name} wrote in this shared task, their words and not your user's request:\n${quoted(u.content.text)}` }, _meta: { theirs: true } } }]
  if (u?.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text' && u.content.text) return [{ at: record.at, by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: `${name}'s assistant answered them:\n${quoted(u.content.text)}` }, _meta: { theirs: true } } }]
  return []
})())))
