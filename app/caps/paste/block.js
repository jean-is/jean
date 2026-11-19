// SPDX-License-Identifier: MIT
// Cells copied from a spreadsheet, as a collection takes them (D759): the block read from the clipboard's text, a line a row and a tab a cell; each value
// as its column's kind writes it, a number, a day and a box read as people and spreadsheets write them, in the person's language and in any script's
// digits; and what the block changes, laid from the cell it is pasted on over the rows and the columns shown. Pure, so Node's tests run it.
import { checkCell } from '../tables/table.js'

/** @import { Property } from '../tables/table.js' */
/** How a value is read: the person's languages, their words for a box ticked and not, and today, a day with no year being this year's. @typedef {{ locales?: string[], yes?: string, no?: string, now?: Date }} How */

/**
 * A block's cells as spreadsheets copy one: a line a row, a tab between cells, a cell in double quotes holding tabs, line breaks and quotes, each doubled;
 * the line break after the last cell ends the block. @param {string} text @returns {string[][]}
 */
export function cellsOf(text) {
  const from = text.replace(/\r\n?/g, '\n'), rows = /** @type {string[][]} */ ([[]])
  // A cell quoted is one whose closing quote ends it; any other quote is a letter of its own.
  const [quoted, bare] = [/"((?:[^"]|"")*)"(?=[\t\n]|$)/y, /[^\t\n]*/y]
  for (let i = 0; i <= from.length; i++) {
    quoted.lastIndex = bare.lastIndex = i
    const held = from[i] === '"' ? quoted.exec(from) : null, cell = held ? held[1].replace(/""/g, '"') : /** @type {RegExpExecArray} */ (bare.exec(from))[0]
    i += (held ?? [cell])[0].length
    rows[rows.length - 1].push(cell)
    if (from[i] === '\n') rows.push([])
    else if (from[i] !== '\t') break
  }
  // What follows the last line break is no row, and neither is a block of nothing.
  if (rows.length > 1 && rows[rows.length - 1].join('') === '') rows.pop()
  return rows.some((cells) => cells.some((cell) => cell.trim())) ? rows : []
}

/** Words as they compare: no case, no width, no space around. @param {unknown} text */
const key = (text) => String(text ?? '').normalize('NFKC').trim().toLocaleLowerCase()
/** A script's digits as ASCII's: each set of ten runs from its zero, the one before which is no digit. @param {string} text */
const plain = (text) => text.normalize('NFKC').replace(/[^\d\P{Nd}]/gu, (digit) => { let zero = /** @type {number} */ (digit.codePointAt(0)); while (/\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero--; return String((/** @type {number} */ (digit.codePointAt(0)) - zero) % 10) })

/**
 * A number as people and spreadsheets write one: spaces, a currency's sign or its few letters and a percent sign aside, a minus or brackets for less than nothing;
 * with a point and a comma, the last is its decimals'; with one alone, it groups thousands where it is the language's mark for them before three
 * digits, or comes more than once, and is its decimals' otherwise. Undefined where it is none. @param {string} text @param {string[]} [locales]
 */
export function numberOf(text, locales) {
  const said = plain(text).replace(/٫/g, '.').replace(/[\s٬'’_]/g, ''), less = /^\(.*\)$/.test(said) || /^[^\d]*[-−–]/.test(said) || /[-−–]$/.test(said)
  if (/^[+-]?(\d+\.?\d*|\.\d+)e[+-]?\d+$/i.test(said)) return Number(said)
  // A minus between digits is a day's, never a number's.
  if (/\d.*[-−–+].*\d/.test(said)) return undefined
  const digits = said.replace(/[^\d.,]/g, ''), rest = said.replace(/[\d.,()+\-−–%٪\p{Sc}]/gu, '')
  if (!/\d/.test(digits) || (rest && !/^\p{L}{1,3}\.?$/u.test(rest))) return undefined
  const group = new Intl.NumberFormat(locales).formatToParts(12345.6).find((part) => part.type === 'group')?.value ?? ','
  const marks = [...digits].filter((mark) => mark === '.' || mark === ','), [last] = marks.slice(-1), both = new Set(marks).size > 1
  const tail = last ? digits.length - digits.lastIndexOf(last) - 1 : 0, head = last ? digits.indexOf(last) : 0
  const groups = !both && (marks.length > 1 || (last === group && tail === 3 && head > 0 && head < 4))
  const whole = !last ? digits : groups ? digits.replace(/[.,]/g, '') : `${digits.slice(0, digits.lastIndexOf(last)).replace(/[.,]/g, '')}.${digits.slice(digits.lastIndexOf(last) + 1)}`
  const value = Number(whole) * (less ? -1 : 1)
  return Number.isFinite(value) ? value : undefined
}

/** A month's names in a language and in English, long and short, each with its place in the year. @type {Map<string, Map<string, number>>} */
const months = new Map()
/** @param {string[] | undefined} locales */
const monthsIn = (locales) => {
  const at = String(locales)
  if (!months.has(at)) months.set(at, new Map([locales, ['en']].flatMap((language) => /** @type {const} */ (['long', 'short']).flatMap((month) => Array.from({ length: 12 }, (_, i) => /** @type {[string, number]} */ (
    [key(new Intl.DateTimeFormat(language, { month, timeZone: 'UTC', calendar: 'gregory' }).format(new Date(Date.UTC(2026, i, 15)))).replace(/\.$/, ''), i + 1]))))))
  return /** @type {Map<string, number>} */ (months.get(at))
}

/**
 * A day as people and spreadsheets write one, as ISO 8601 has it: 2026-11-20, 20/11/2026 or 11/20/2026 as the language orders them, a number over
 * twelve being a day's, 20 Nov 2026 or November 20 in the language's months or English's, a year of two digits this century's under 70; then its time, 14:30 or 2:30 PM, kept where
 * the column has times or it is not midnight. Undefined where it is none, or a day no calendar has. @param {string} text @param {How & { timed?: boolean }} [how]
 */
export function dateOf(text, { locales, now = new Date(), timed = false } = {}) {
  let said = plain(text).trim().replace(/(\d)T(\d)/, '$1 $2').replace(/[年月년월]/g, '-').replace(/[日일]/g, ' ')
  const clock = /(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(a\.?m\.?|p\.?m\.?)?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?/i.exec(said)
  if (clock) said = said.replace(clock[0], ' ')
  const hour = clock ? (Number(clock[1]) % 12) + (/^p/i.test(clock[3] ?? '') || (!clock[3] && Number(clock[1]) >= 12) ? 12 : 0) : 0, minute = clock ? Number(clock[2]) : 0
  // Its parts: numbers, a day's with its ending too (20th, 1er), and words, one of which may be a month's name.
  const parts = said.split(/[\s,./\-–]+/).filter(Boolean).map((part) => /^(\d+)\p{L}{1,3}$/u.exec(part)?.[1] ?? part), written = parts.filter((part) => /^\d+$/.test(part)), numbers = written.map(Number)
  const named = parts.map((part) => monthsIn(locales).get(key(part))).find(Boolean), century = (/** @type {number} */ at) => (written[at].length > 2 ? numbers[at] : numbers[at] + (numbers[at] < 70 ? 2000 : 1900))
  let [year, month, day] = [0, 0, 0]
  if (named && numbers.length && numbers.length < 3) {
    // Its month by name: the year is the number of four digits, else the second of two, else this year; the day the other.
    const long = written.findIndex((part) => part.length > 2), at = long >= 0 ? long : numbers.length - 1 || -1
    ;[year, month, day] = [at < 0 ? now.getFullYear() : century(at), named, numbers[at === 0 ? 1 : 0]]
  } else if (!named && numbers.length === 3 && parts.length < 5) {
    // In numbers: the year first where it has four digits, else last, the day before the month as the language has them, a number over twelve a day's.
    const order = new Intl.DateTimeFormat(locales, { timeZone: 'UTC', calendar: 'gregory' }).formatToParts(new Date(0)).filter(({ type }) => type === 'day' || type === 'month').map(({ type }) => type)
    const first = numbers[0] > 12 ? 'day' : numbers[1] > 12 ? 'month' : order[0]
    ;[year, month, day] = written[0].length === 4 ? numbers : [century(2), first === 'day' ? numbers[1] : numbers[0], first === 'day' ? numbers[0] : numbers[1]]
  } else return undefined
  // A year of the Buddhist era, where the language counts them so.
  if (year > 2400 && new Intl.DateTimeFormat(locales).resolvedOptions().calendar === 'buddhist') year -= 543
  const on = new Date(Date.UTC(year, month - 1, day)), two = (/** @type {number} */ n) => String(n).padStart(2, '0')
  if (!(year > 999 && year < 10000) || on.getUTCMonth() !== month - 1 || on.getUTCDate() !== day || Number(clock?.[1] ?? 0) > 23 || minute > 59) return undefined
  return `${year}-${two(month)}-${two(day)}${clock && (timed || hour || minute) ? `T${two(hour)}:${two(minute)}` : ''}`
}

/** A box ticked or not, as spreadsheets and people say it. */
const TICKED = /^(true|yes|y|1|x|on|✓|✔|☑|vrai|oui|wahr|ja|verdadero|verdadeiro|vero|sí|si|sim|waar)$/, CLEAR = /^(false|no|n|0|off|☐|faux|non|falsch|nein|falso|não|nao|onwaar|nee)$/

/**
 * A cell's text as its column's kind writes it: null where it is empty, which empties the cell; undefined where the column can't take it, or is
 * worked out, a picture or files, and its cell stays as it is. A step and a choice by their names in any case, several choices between commas, a web address with no
 * https:// given one. A relation's row is the caller's to name. @param {Property} property @param {string} text @param {How} [how]
 */
export function valueFor(property, text, how = {}) {
  const said = text.trim(), { type } = property
  if (/^(picture|files|relation|formula|created-by|created-at|changed-by|changed-at)$/.test(type)) return undefined
  if (!said) return null
  const named = () => property.options?.find((option) => key(option.name) === key(said))?.name
  const value = type === 'number' ? numberOf(said, how.locales) : type === 'date' ? dateOf(said, { ...how, timed: Boolean(property.time) })
    : type === 'checkbox' ? ([how.yes, how.no].map(key).includes(key(said)) ? key(said) === key(how.yes) : TICKED.test(key(said)) ? true : CLEAR.test(key(said)) ? false : undefined)
    : type === 'status' ? named() : type === 'select' ? named() ?? said : type === 'multi-select' ? said.split(/[,،、;]/).map((one) => one.trim()).filter(Boolean).map((one) => property.options?.find((option) => key(option.name) === key(one))?.name ?? one)
    : type === 'link' && !/^[a-z][a-z\d+.-]*:/i.test(said) && /^[^\s/@]+\.[^\s/@.]{2,}(\/\S*)?$/.test(said) ? `https://${said}` : said
  return value === undefined || checkCell(property, value) ? undefined : value
}

/**
 * What a block pasted on a cell changes: its lines go to the rows shown from that cell's, one each, and past the last make rows; its cells go to the
 * columns shown from that cell's, one each, those past the last left. A line that changes nothing is left, as is a new row of nothing.
 * @param {string[][]} lines @param {Property[]} columns from the cell's @param {string[]} rows those shown, by their ids @param {string} from the cell's row
 * @param {(property: Property, text: string) => unknown} read a cell's value, null to empty it, undefined to leave it
 * @returns {{ row?: string, set: Record<string, unknown> }[]}
 */
export function planned(lines, columns, rows, from, read) {
  const start = rows.includes(from) ? rows.indexOf(from) : rows.length
  return lines.flatMap((cells, i) => {
    const set = Object.fromEntries(cells.slice(0, columns.length).flatMap((text, j) => ((value) => (value === undefined ? [] : [[columns[j].id, value]]))(read(columns[j], text)))), row = rows[start + i]
    return Object.keys(set).length && (row || Object.values(set).some((value) => value !== null)) ? [{ ...(row && { row }), set }] : []
  })
}
