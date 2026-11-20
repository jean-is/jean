// SPDX-License-Identifier: MIT
// A collection begun with no brain: a file's lines, whatever mark parts its cells; each column's kind, guessed from all its cells so that none is lost
// (a kind only where every filled cell is one), with what a kind picked instead would leave empty; and the starting points, as the specs Tables
// makes tables from. Cells are read as a paste's are (caps/paste/block.js). Pure, so Node's tests run it.
import { valueFor } from '../paste/block.js'

/** @import { How } from '../paste/block.js' */
/** The kinds a file's column can be. */
export const KINDS = /** @type {const} */ (['text', 'number', 'date', 'select', 'checkbox', 'link', 'email', 'phone'])
/** @typedef {typeof KINDS[number]} Kind */
/** A column guessed: its name, its kind, money's currency, a date's time, and its first cells. @typedef {{ name: string, type: Kind, format?: 'money', currency?: string, time?: boolean, sample: string[] }} Column */
/** How cells are read, the currency of money that names none, and a name for a column that has none. @typedef {How & { currency?: string, column: (place: number) => string }} Reading */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, LINK = /^(https?:\/\/\S+|[^\s/@]+\.[^\s/@.\d]{2,}(\/\S*)?)$/i
// A phone starts as one does and has seven to fifteen digits; a number with one decimal mark is none.
const PHONE = /^(?=(?:\D*\d){7,15}\D*$)(\+|00|\(?0)[\d\s().-]+$/, DECIMAL = /^\d*[.,]\d*$/
const SIGNS = /** @type {Record<string, string>} */ ({ '€': 'EUR', $: 'USD', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW', '₽': 'RUB', '₺': 'TRY', '₪': 'ILS', '₦': 'NGN', '฿': 'THB', '₫': 'VND' })

/**
 * A file's lines, each its cells: parted by the mark that parts the first line the most, a comma, a semicolon, a tab or a bar; a cell in double quotes
 * holds the mark, line breaks and quotes, each doubled; a line of nothing is none. @param {string} text @returns {string[][]}
 */
export function linesOf(text) {
  const from = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'), head = (from.split('\n', 1)[0] ?? '').replace(/"(?:[^"]|"")*"/g, '')
  const mark = [',', ';', '\t', '|'].reduce((best, one) => (head.split(one).length > head.split(best).length ? one : best))
  const rows = /** @type {string[][]} */ ([[]])
  let cell = '', quoted = false
  for (let i = 0; i < from.length; i++) {
    const letter = from[i]
    if (quoted) { if (letter !== '"') cell += letter; else if (from[i + 1] === '"') cell += from[i++]; else quoted = false } else if (letter === '"' && !cell) quoted = true
    else if (letter === mark || letter === '\n') { rows[rows.length - 1].push(cell); cell = ''; if (letter === '\n') rows.push([]) } else cell += letter
  }
  rows[rows.length - 1].push(cell)
  return rows.filter((cells) => cells.some((one) => one.trim()))
}

/** Whether a kind takes a cell's words. @param {Kind} type @param {string} text @param {How} how */
const takes = (type, text, how) => (type === 'text' || type === 'select' ? true : type === 'email' ? EMAIL.test(text) : type === 'link' ? LINK.test(text) && !EMAIL.test(text)
  : type === 'phone' ? PHONE.test(text) && !DECIMAL.test(text) : valueFor({ id: 'c', name: 'c', type }, text, how) !== undefined)

/** A column's filled cells. @param {string[][]} rows @param {number} at */
const filled = (rows, at) => rows.map((cells) => (cells[at] ?? '').trim()).filter(Boolean)

/** How many of a column's filled cells a kind would leave empty. @param {Kind} type @param {string[][]} rows @param {number} at @param {How} how */
export const off = (type, rows, at, how) => filled(rows, at).filter((text) => !takes(type, text, how)).length

/**
 * A file's columns, named by its first row, and its other rows, each as wide as the widest. A kind is one every filled cell of the column is: a box where
 * some say so in words, a day, a phone, a number unless one would lose its first zero, an email, a link; else a choice, where few values come again
 * in a column that isn't the first, else words. A number is money where half its cells name a currency. @param {string[][]} lines @param {Reading} how
 * @returns {{ columns: Column[], rows: string[][] }}
 */
export function guess(lines, how) {
  const width = Math.max(0, ...lines.map((cells) => cells.length)), rows = lines.slice(1).map((cells) => Array.from({ length: width }, (_, i) => (cells[i] ?? '').trim()))
  const taken = new Set(), all = (/** @type {Kind} */ type, /** @type {string[]} */ values) => values.every((text) => takes(type, text, how))
  const columns = Array.from({ length: width }, (_, at) => {
    const given = (lines[0][at] ?? '').trim() || how.column(at + 1), values = filled(rows, at), few = new Set(values.map((text) => text.toLocaleLowerCase())).size
    let name = given
    for (let n = 2; taken.has(name.toLocaleLowerCase()); n++) name = `${given} ${n}`
    taken.add(name.toLocaleLowerCase())
    const type = /** @type {Kind} */ (!values.length ? 'text' : values.some((text) => /\D/.test(text)) && all('checkbox', values) ? 'checkbox' : all('date', values) ? 'date' : all('phone', values) ? 'phone'
      : !values.some((text) => /^0\d/.test(text)) && all('number', values) ? 'number' : all('email', values) ? 'email' : all('link', values) ? 'link'
      : at && values.length > 3 && few <= 12 && few * 2 <= values.length && values.every((text) => text.length <= 40) ? 'select' : 'text')
    // Money names its currency by its sign or its three letters, in half its cells at least.
    const named = values.flatMap((text) => ((code) => (code ? [code] : []))(SIGNS[/\p{Sc}/u.exec(text)?.[0] ?? ''] ?? /\b[A-Z]{3}\b/.exec(text)?.[0]))
    return /** @type {Column} */ ({ name, type, ...(type === 'number' && named.length * 2 >= values.length && { format: 'money', currency: named[0] }), ...(type === 'date' && values.some((text) => /\d:\d\d/.test(text)) && { time: true }), sample: values.slice(0, 3) })
  })
  return { columns, rows }
}

/** What Tables makes a table from: the columns as guessed, or as the person changed their kinds. @param {string} name @param {Column[]} columns */
export const specOf = (name, columns) => ({ name, columns: columns.map(({ name, type, format, currency, time }) => ({ name, type, ...(type === 'number' && format && { format, currency }), ...(type === 'date' && time && { time }) })) })

/**
 * The starting points: each one's tables, a column by its words' key and its kind, a relation to the table at a place before it.
 * @type {{ id: string, tables: { name: string, columns: [key: string, type: string, to?: number][] }[] }[]}
 */
export const STARTS = [
  { id: 'jobs', tables: [{ name: 'start.jobs', columns: [['col.company', 'text'], ['col.role', 'text'], ['kind.status', 'status'], ['col.applied', 'date'], ['col.contact', 'person'], ['kind.link', 'link']] }] },
  { id: 'spending', tables: [{ name: 'start.spending', columns: [['col.what', 'text'], ['col.amount', 'number'], ['kind.date', 'date'], ['col.category', 'select'], ['col.receipt', 'files']] }] },
  { id: 'clients', tables: [{ name: 'clients', columns: [['name', 'text'], ['col.contact', 'person'], ['kind.email', 'email']] },
    { name: 'invoices', columns: [['col.invoice', 'text'], ['col.client', 'relation', 0], ['col.amount', 'number'], ['kind.status', 'status'], ['col.due', 'date']] }] },
  { id: 'todo', tables: [{ name: 'start.todo', columns: [['col.task', 'text'], ['kind.status', 'status'], ['col.who', 'person'], ['col.due', 'date']] }] },
  { id: 'stock', tables: [{ name: 'start.stock', columns: [['col.item', 'text'], ['kind.picture', 'picture'], ['col.count', 'number'], ['col.where', 'text'], ['col.reorder', 'number']] }] },
]

/**
 * A starting point's tables as Tables makes them, in the person's words: a status with its three steps, an amount as money in their currency, a
 * relation naming the place, among these, of the table it relates to. @param {typeof STARTS[number]} start @param {(key: string) => string} words @param {string} currency
 */
export const started = (start, words, currency) => start.tables.map(({ name, columns }) => ({ name: words(name), columns: columns.map(([key, type, to]) => ({ name: words(key), type,
  ...(type === 'status' && { options: ['todo', 'doing', 'done'].map((step) => words(`step.${step}`)) }), ...(key === 'col.amount' && { format: 'money', currency }), ...(to !== undefined && { collection: to }) })) }))
