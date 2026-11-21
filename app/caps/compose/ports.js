// SPDX-License-Identifier: MIT
// A collection's port (docs/composition.md, D763): the one way in for what people outside propose, a published site's form whose `data-to`
// names it. Its owner opens it, `port.json` in its folder: the columns a proposal may fill, and the column that approves one, which only its
// owner sets. A proposal fills those columns alone, never the approval, comes at most so many an hour, and comes once; it goes into the
// journal, never into a version. A row counts as approved only where the owner set that column: the person here, or a change of Jean's they
// kept. Pure, so Node's tests run it.
import { propertyOf, converted, canonical } from '../tables/table.js'

/** @import { Table } from '../tables/table.js' */
/** @import { Row, Line } from '../tables/changes.js' */
/** A port: when and by whom it was opened, the columns a proposal may fill, the one that approves, and how many proposals an hour at most. @typedef {{ format: 1, at: string, by: string, columns: string[], approval: string, hour: number }} Port */
/** A proposal, as a site's form sends it (../sites/replies.js): each field by its label. @typedef {{ form: string, at: string, fields: { label: string, value: string, choice?: boolean }[] }} Proposal */

/** The kinds of column a form fills. */
export const FILLED = ['text', 'number', 'select', 'multi-select', 'date', 'link', 'email', 'phone', 'place']
/** How many proposals an hour a port lets in at most, and how long a value is kept, past which it is cut. */
export const HOUR = 30, LONGEST = 2000

/** A port opened on a collection: every column a form fills, the approval aside. @param {Table} table @param {string} approval its id @param {string} at @returns {Port} */
export const portOf = (table, approval, at) => ({ format: 1, at, by: 'user', columns: table.properties.filter((one) => !one.deleted && one.id !== approval && FILLED.includes(one.type)).map((one) => one.id), approval, hour: HOUR })

/** What a row holds in the port's columns, to tell one proposal from another. @param {Port} port @param {Record<string, unknown>} cells */
const heldIn = (port, cells) => canonical(Object.fromEntries(port.columns.flatMap((id) => (cells[id] === undefined || cells[id] === null || cells[id] === '' ? [] : [[id, cells[id]]]))))

/**
 * The proposals let in, as rows to make: each one's fields, by their labels, onto the port's columns, the approval never, each value as its
 * column takes it, cut past LONGEST; none once the hour's count is reached, counting those already in, and none the collection holds already.
 * @param {Port} port @param {{ table: Table, rows: Row[], lines: Line[] }} one @param {Proposal[]} proposals @param {number} now @returns {{ set: Record<string, unknown> }[]}
 */
export function admitted(port, { table, rows, lines }, proposals, now) {
  const seen = new Set(rows.map((row) => heldIn(port, row.cells))), edits = /** @type {{ set: Record<string, unknown> }[]} */ ([])
  let room = port.hour - new Set(lines.flatMap((line) => ('by' in line && line.by === 'visitor' && Date.parse(line.at) > now - 3_600_000 ? [line.row] : []))).size
  for (const { fields } of proposals) {
    const set = Object.fromEntries(fields.flatMap(({ label, value }) => ((one) => ((cell) => (one && cell !== undefined && cell !== '' ? [[one.id, cell]] : []))(one && converted(one, String(value).slice(0, LONGEST))))(
      ((one) => (one && !one.deleted && port.columns.includes(one.id) && one.id !== port.approval ? one : null))(propertyOf(table, label.trim())))))
    if (!Object.keys(set).length || seen.has(heldIn(port, set)) || room <= 0) continue
    seen.add(heldIn(port, set)), room--, edits.push({ set })
  }
  return edits
}

/** A collection as a reader outside sees it: the approval column holding only what its owner set. @template {{ table: Table, rows: Row[] }} T @param {T} one @param {Port | null} port @returns {T} */
export const owned = (one, port) => (port ? { ...one, rows: one.rows.map((row) => ((stamp) => (stamp?.by === 'user' || (stamp?.by === 'jean' && one.table.kept && stamp.at <= one.table.kept) ? row
  : { ...row, cells: { ...row.cells, [port.approval]: undefined } }))(row.stamps?.[port.approval])) } : one)

/** The rows proposed through the port that wait for their owner's approval. @param {{ table: Table, rows: Row[] }} one @param {Port} port */
export const waiting = (one, port) => owned(one, port).rows.filter((row) => row.created?.by === 'visitor' && !row.cells[port.approval]).length
