// A table as a file (D491): CSV, or a workbook made the way Jean makes every file (caps/made/formats.js),
// the columns' names on top, then a row a line, a relation's cell its row's name (D560). A cell that a spreadsheet would read as a formula starts
// with an apostrophe instead. Pure, so Node's tests run it.
import { makeFile } from '../made/formats.js'
import { valueOf } from './query.js'
import { titleOf } from './table.js'

/** @import { Table, Property } from './table.js' */
/** @import { Row } from './changes.js' */
/**
 * yes and no: the words for a ticked box and an unticked one, from t(); names: each related row's (`namesOf()`); look: a workbook's (D664).
 * @typedef {{ labels?: { yes?: string, no?: string }, names?: Map<string, string>, look?: import('../made/formats.js').Look | null }} Options
 */

// A spreadsheet reads these as the start of a formula; a number or a phone number is none.
const FORMULA = /^[=+\-@\t\r]/
const NUMBERLIKE = /^[+-]?[\d\s().\-/]+$/

/**
 * A cell as text: lists joined, a box as a word, a file or a place by its name.
 * @param {Row} row @param {Property} property @param {Options} [options]
 */
export function textOf(row, property, { labels = {}, names } = {}) {
  const value = valueOf(row, property, names)
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? labels.yes ?? 'Yes' : labels.no ?? 'No'
  if (Array.isArray(value)) return value.map((item) => (item && typeof item === 'object' ? String(item.name) : String(item))).join(', ')
  if (typeof value === 'object') return String(/** @type {{ name?: string }} */ (value).name ?? JSON.stringify(value))
  return String(value)
}

/**
 * A cell as a card and a page say it: a date and a number as the language writes them, a box as a word, a relation's row by its name.
 * @param {Row} row @param {Property} property @param {Options & { locales?: string[] }} [options]
 */
export function said(row, property, { locales, ...options } = {}) {
  const value = valueOf(row, property)
  if (property.type === 'date' && typeof value === 'string') return new Intl.DateTimeFormat(locales, { dateStyle: 'medium', ...(value.includes('T') && { timeStyle: 'short' }) }).format(new Date(value.includes('T') ? value : `${value}T00:00`))
  return typeof value === 'number' ? new Intl.NumberFormat(locales).format(value) : textOf(row, property, options)
}

/** Each of a collection's rows by its id, its name as its first text column, else its first, holds it (D560). @param {Table} table @param {Row[]} rows */
export const namesOf = (table, rows) => ((title) => new Map(rows.map((row) => [row.id, title ? textOf(row, title) : ''])))(titleOf(table))

/**
 * The row of a collection a relation's value names (D560): one of its ids, else the one alone with that name, in any case; undefined
 * when none or two are, and what isn't text as it is. @param {Row[]} rows the collection's @param {Map<string, string>} names theirs @param {unknown} value
 */
export function rowNamed(rows, names, value) {
  const key = (/** @type {unknown} */ name) => String(name ?? '').trim().normalize('NFKC').toLocaleLowerCase(), found = rows.filter((row) => key(names.get(row.id)) === key(value))
  return typeof value !== 'string' || rows.some((row) => row.id === value) ? value : found.length === 1 && key(value) ? found[0].id : undefined
}

/** @param {Table} table @param {Row[]} rows @param {Options} options @param {RegExp} formula @returns {string[][]} */
function cellsOf(table, rows, options, formula) {
  const columns = table.properties.filter((property) => !property.deleted)
  return [columns.map((property) => property.name), ...rows.map((row) => columns.map((property) => {
    const text = textOf(row, property, options)
    return property.type !== 'number' && formula.test(text) && !NUMBERLIKE.test(text) ? `'${text}` : text
  }))]
}

/** The table as CSV, its lines ended as RFC 4180 says. @param {Table} table @param {Row[]} rows @param {Options} [options] */
export function toCSV(table, rows, options = {}) {
  const quoted = (/** @type {string} */ text) => (/[",;\t\n\r]|^\s|\s$/.test(text) ? `"${text.replaceAll('"', '""')}"` : text)
  return cellsOf(table, rows, options, FORMULA).map((cells) => `${cells.map(quoted).join(',')}\r\n`).join('')
}

/**
 * The table as a file named after it: CSV with the mark Excel reads as UTF-8, or a workbook with
 * numbers as numbers and dates as dates, where only a cell starting with = would be a formula.
 * @param {Table} table @param {Row[]} rows @param {'csv' | 'xlsx'} kind @param {Options} [options]
 */
export function exportTable(table, rows, kind, options = {}) {
  if (kind === 'csv') return makeFile(`${table.name}.csv`, toCSV(table, rows, options))
  const quoted = (/** @type {string} */ text) => (/[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text)
  return makeFile(`${table.name}.xlsx`, `sep=,\n${cellsOf(table, rows, options, /^=/).map((cells) => cells.map(quoted).join(',')).join('\n')}\n`, { look: options.look })
}
