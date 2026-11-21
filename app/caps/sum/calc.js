// SPDX-License-Identifier: MIT
// A collection summed up (caps/sum), with no brain, from its columns' kinds: how many rows, the total of its first number, and that total, or
// the rows where it has no number, by its status, else its first choice, in the order of its choices, and by the month of its first date, the
// last six that have rows. Pure, so Node's tests run it.

/** @import { Table, Property } from '../tables/table.js' */
/** A summary: the rows counted, the number summed and its total, what it is shared by with each share, and by which date with each month's. @typedef {{ count: number, number?: Property, total: number, by?: Property, groups: [name: string, worth: number][], date?: Property, months: [month: string, worth: number][] }} Summary */

/** @param {Table} table @param {{ cells: Record<string, unknown>, deleted?: unknown }[]} all @returns {Summary} */
export function summary(table, all) {
  const rows = all.filter((row) => !row.deleted), columns = table.properties.filter((property) => !property.deleted), first = (/** @type {string} */ type) => columns.find((property) => property.type === type)
  const number = first('number'), by = first('status') ?? first('select'), date = first('date')
  /** What a row is worth: its number, or one row where the collection has none. @param {typeof rows[number]} row */
  const worth = (row) => (!number ? 1 : typeof row.cells[number.id] === 'number' ? Number(row.cells[number.id]) : 0)
  /** The rows' worth by what each is under, those under nothing left out. @param {(row: typeof rows[number]) => string | undefined} under */
  const shared = (under) => { const shares = /** @type {Map<string, number>} */ (new Map()); for (const row of rows) { const at = under(row); if (at !== undefined) shares.set(at, (shares.get(at) ?? 0) + worth(row)) } return [...shares] }
  const order = (by?.options ?? []).map(({ name }) => name), place = (/** @type {string} */ name) => (order.includes(name) ? order.indexOf(name) : name ? order.length : order.length + 1)
  return { count: rows.length, number, total: rows.reduce((sum, row) => sum + (number ? worth(row) : 0), 0), by, groups: by ? shared((row) => String(row.cells[by.id] ?? '')).sort(([a], [b]) => place(a) - place(b)) : [],
    date, months: date ? shared((row) => (/^\d{4}-\d\d/.exec(String(row.cells[date.id] ?? '')) ?? [])[0]).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-6) : [] }
}
