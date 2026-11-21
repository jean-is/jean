// SPDX-License-Identifier: MIT
// What a collection's own check finds (caps/checks), with no brain: the same row more than once, a choice written two ways, a number most rows have
// and some lack, and rows that end before they start, by the two dates its calendar goes by. Each finding names its rows, and what would mend it.
// Pure, so Node's tests run it.
import { titleOf, calendarOf } from '../tables/table.js'

/** @import { Table } from '../tables/table.js' */
/**
 * A finding: its key, which stays the same while it holds, its kind, the rows it is about, and, by kind, the row's name, the column, the way
 * written by few and the one written by most, or how many rows. @typedef {{ key: string, kind: 'same' | 'ways' | 'empty' | 'ends', rows: string[], name?: string, column?: string, a?: string, b?: string }} Finding
 */

const WORKED = /^(formula|created-by|created-at|changed-by|changed-at)$/
/** Words as they compare: no case, no width, one space between them. @param {string} text */
const alike = (text) => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()

/** @param {Table} table @param {{ id: string, cells: Record<string, unknown>, deleted?: unknown }[]} all @returns {Finding[]} */
export function findings(table, all) {
  const rows = all.filter((row) => !row.deleted), columns = table.properties.filter((property) => !property.deleted && !WORKED.test(property.type)), title = titleOf(table), found = /** @type {Finding[]} */ ([])
  // The same row: a name, and every cell saying the same.
  const prints = /** @type {Map<string, typeof rows>} */ (new Map())
  for (const row of rows) if (String(row.cells[title?.id ?? ''] ?? '').trim()) { const print = JSON.stringify(columns.map((column) => row.cells[column.id] ?? null)); prints.set(print, [...prints.get(print) ?? [], row]) }
  for (const same of prints.values()) if (same.length > 1) found.push({ key: `same ${same.map((row) => row.id).join(' ')}`, kind: 'same', rows: same.map((row) => row.id), name: String(same[0].cells[title?.id ?? '']).trim() })
  for (const column of columns) {
    if (column.type === 'select') {
      // A choice written two ways: values that read alike, the rows of the ways fewer wrote going to the one most did.
      const ways = /** @type {Map<string, Map<string, string[]>>} */ (new Map())
      for (const row of rows) { const said = row.cells[column.id]; if (typeof said === 'string' && said.trim()) { const those = ways.get(alike(said)) ?? new Map(); ways.set(alike(said), those.set(said, [...those.get(said) ?? [], row.id])) } }
      for (const [read, those] of ways) if (those.size > 1) { const [[most], ...fewer] = [...those].sort((a, b) => b[1].length - a[1].length); found.push({ key: `ways ${column.id} ${read}`, kind: 'ways', column: column.id, a: fewer[0][0], b: most, rows: fewer.flatMap(([, ids]) => ids) }) }
    } else if (column.type === 'number') {
      // A number four rows in five have, and some lack, among five rows at least.
      const lacking = rows.filter((row) => typeof row.cells[column.id] !== 'number')
      if (rows.length > 4 && lacking.length && lacking.length * 5 <= rows.length) found.push({ key: `empty ${column.id}`, kind: 'empty', column: column.id, rows: lacking.map((row) => row.id) })
    }
  }
  const dated = calendarOf(table), day = (/** @type {unknown} */ value) => (typeof value === 'string' ? value.slice(0, 10) : ''), late = dated?.until ? rows.filter((row) => { const [from, to] = [day(row.cells[dated.date.id]), day(row.cells[/** @type {{ id: string }} */ (dated.until).id])]; return from && to && to < from }) : []
  if (late.length) found.push({ key: 'ends', kind: 'ends', rows: late.map((row) => row.id) })
  return found
}
