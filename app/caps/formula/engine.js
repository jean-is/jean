// SPDX-License-Identifier: MIT
// What a Formula column works out for each row from its other cells, as the collection is read (`worked()`; Tables fetches this folder for a collection that has one),
// so that sorting, filters, the foot, the workbook and the brain see them as any other. Jean reads it itself, never with eval: numbers, "text", true and false, the
// row's columns by their names (../tables/formula.js), + - * / % and ** or ^, & joining words, = != <> < <= > >=, brackets, and FUNCTIONS by their names in any case,
// with every function and constant of Math (sqrt, pi…). A day is written as a date cell holds it, YYYY-MM-DD, a time after a T; a cell of several choices is a list.
// A page's parts read their formulas with it too (../interactive/live.js). Pure but for today() and now(), so Node's tests run it.
import { tokens, Unread } from '../tables/formula.js'

/** @import { Table, Property } from '../tables/table.js' */
/** @import { Row } from '../tables/changes.js' */
/** @typedef {(cells: Record<string, unknown>) => any} Part */
/** @typedef {{ group: 'logic' | 'numbers' | 'text' | 'dates' | 'lists', min: number, max?: number, run: (...values: any[]) => unknown, lazy?: true }} Fn */

/** Math's own names, by their lower case: round, pi, log10… */
const MATH = new Map(Object.getOwnPropertyNames(Math).map((name) => [name.toLowerCase(), name]))
/** A value as a list: a cell of several choices as it is, an empty one none. @param {unknown} value @returns {unknown[]} */
const list = (value) => (Array.isArray(value) ? value : value === '' || value == null ? [] : [value])
/** A value as words, a list's joined with commas. @param {unknown} value @returns {string} */
const text = (value) => (Array.isArray(value) ? value.map(text).join(', ') : value == null ? '' : String(value))
/** A value as a number, words that read as one too; NaN for anything else. @param {unknown} value */
const num = (value) => (typeof value === 'number' ? value : typeof value === 'boolean' ? Number(value) : typeof value === 'string' && value.trim() ? Number(value) : NaN)
/** Whether a value is empty: none, no words, no number, an empty list. @param {unknown} value */
const blank = (value) => value == null || value === '' || (Array.isArray(value) && !value.length) || Number.isNaN(value)
/** Whether a value counts as yes: a list with something in it, else as JavaScript reads it. @param {unknown} value */
const truth = (value) => (Array.isArray(value) ? value.length > 0 : Boolean(value))
/** Every number of the values given, lists' included. @param {unknown[]} values */
const numbers = (values) => values.flatMap(list).map(num).filter((n) => !Number.isNaN(n))
/** Words in a case that compares in any language. @param {unknown} value */
const low = (value) => text(value).toLocaleLowerCase()
const OPS = /** @type {Record<string, (a: any, b: any) => unknown>} */ ({ '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b, '%': (a, b) => a % b, '&': (a, b) => text(a) + text(b),
  '=': (a, b) => a == b, '!=': (a, b) => a != b, '<>': (a, b) => a != b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b })

const DAY = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/
const MS = /** @type {Record<string, number>} */ ({ minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5 })
/** A day as a time in UTC, its time of day kept; NaN for anything else. @param {unknown} value */
const time = (value) => ((m) => (m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) : NaN))(DAY.exec(text(value)))
/** A time in UTC written as a date cell holds it, with its time of day when `clock`; none for no time. @param {number} at @param {boolean} [clock] */
const iso = (at, clock = false) => (Number.isFinite(at) ? new Date(at).toISOString().slice(0, clock ? 16 : 10) : null)
/** The device's day, or its minute, as a date cell holds it. @param {boolean} clock */
const here = (clock) => ((d) => iso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), clock ? d.getHours() : 0, clock ? d.getMinutes() : 0), clock))(new Date())
/** A unit by its name in English, as functions' are, one or many, or its letter: d, w, m, y, h, min. @param {unknown} unit */
const unitOf = (unit) => ((name) => ({ d: 'day', w: 'week', m: 'month', y: 'year', h: 'hour', min: 'minute' })[name] ?? name)(low(unit).replace(/s$/, ''))
/** Minutes of a month's day, to tell whether a month is complete. @param {Date} d */
const into = (d) => d.getUTCDate() * 1440 + d.getUTCHours() * 60 + d.getUTCMinutes()
/** A day moved by a number of a unit, a month's last day kept within its month. @param {unknown} value @param {unknown} by @param {unknown} [unit] */
function moved(value, by, unit = 'days') {
  const at = time(value), n = Math.trunc(num(by)), u = unitOf(unit), clock = /T/.test(text(value)) || u === 'hour' || u === 'minute'
  if (u in MS) return iso(at + n * MS[u], clock)
  if (u !== 'month' && u !== 'year') return null
  const d = new Date(at), months = d.getUTCMonth() + n * (u === 'year' ? 12 : 1), y = d.getUTCFullYear() + Math.floor(months / 12), m = ((months % 12) + 12) % 12
  return iso(Date.UTC(y, m, Math.min(d.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate()), d.getUTCHours(), d.getUTCMinutes()), clock)
}
/** How many whole units from one day to another, fewer than none when the second is before. @param {unknown} from @param {unknown} to @param {unknown} [unit] */
function between(from, to, unit = 'days') {
  const [a, b, u] = [time(from), time(to), unitOf(unit)]
  if (u in MS) return Math.trunc((b - a) / MS[u])
  if (u !== 'month' && u !== 'year') return NaN
  const [x, y] = [new Date(a), new Date(b)], months = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth()
  const whole = months - (b >= a ? Number(into(y) < into(x)) : -Number(into(y) > into(x)))
  return u === 'year' ? Math.trunc(whole / 12) : whole
}

/** The functions a formula is written with, by group, beside Math's. The lazy ones are given their parts to work out as they need. @type {Record<string, Fn>} */
export const FUNCTIONS = {
  if: { group: 'logic', min: 2, max: 3, lazy: true, run: (test, yes, no) => (truth(test()) ? yes() : no ? no() : '') },
  ifs: { group: 'logic', min: 2, lazy: true, run: (...parts) => { for (let i = 0; i + 1 < parts.length; i += 2) if (truth(parts[i]())) return parts[i + 1](); return parts.length % 2 ? parts[parts.length - 1]() : '' } },
  and: { group: 'logic', min: 1, lazy: true, run: (...parts) => parts.every((part) => truth(part())) },
  or: { group: 'logic', min: 1, lazy: true, run: (...parts) => parts.some((part) => truth(part())) },
  not: { group: 'logic', min: 1, max: 1, run: (value) => !truth(value) },
  empty: { group: 'logic', min: 1, max: 1, run: blank },
  ifempty: { group: 'logic', min: 2, max: 2, run: (value, other) => (blank(value) ? other : value) },
  sum: { group: 'numbers', min: 1, run: (...values) => numbers(values).reduce((a, b) => a + b, 0) },
  average: { group: 'numbers', min: 1, run: (...values) => ((all) => all.reduce((a, b) => a + b, 0) / all.length)(numbers(values)) },
  min: { group: 'numbers', min: 1, run: (...values) => Math.min(...numbers(values)) },
  max: { group: 'numbers', min: 1, run: (...values) => Math.max(...numbers(values)) },
  round: { group: 'numbers', min: 1, max: 2, run: (value, digits = 0) => Math.round(num(value) * 10 ** num(digits)) / 10 ** num(digits) },
  floor: { group: 'numbers', min: 1, max: 1, run: (value) => Math.floor(num(value)) },
  ceil: { group: 'numbers', min: 1, max: 1, run: (value) => Math.ceil(num(value)) },
  abs: { group: 'numbers', min: 1, max: 1, run: (value) => Math.abs(num(value)) },
  sqrt: { group: 'numbers', min: 1, max: 1, run: (value) => Math.sqrt(num(value)) },
  number: { group: 'numbers', min: 1, max: 1, run: num },
  concat: { group: 'text', min: 1, run: (...values) => values.map(text).join('') },
  length: { group: 'text', min: 1, max: 1, run: (value) => (Array.isArray(value) ? value.length : [...text(value)].length) },
  upper: { group: 'text', min: 1, max: 1, run: (value) => text(value).toLocaleUpperCase() },
  lower: { group: 'text', min: 1, max: 1, run: low },
  trim: { group: 'text', min: 1, max: 1, run: (value) => text(value).trim().replace(/\s+/gu, ' ') },
  contains: { group: 'text', min: 2, max: 2, run: (where, what) => (Array.isArray(where) ? where.some((one) => low(one) === low(what)) : low(where).includes(low(what))) },
  replace: { group: 'text', min: 3, max: 3, run: (value, find, by) => (text(find) ? text(value).replaceAll(text(find), text(by)) : text(value)) },
  left: { group: 'text', min: 1, max: 2, run: (value, n = 1) => [...text(value)].slice(0, Math.max(0, num(n))).join('') },
  right: { group: 'text', min: 1, max: 2, run: (value, n = 1) => (num(n) > 0 ? [...text(value)].slice(-num(n)).join('') : '') },
  text: { group: 'text', min: 1, max: 1, run: text },
  today: { group: 'dates', min: 0, max: 0, run: () => here(false) },
  now: { group: 'dates', min: 0, max: 0, run: () => here(true) },
  date: { group: 'dates', min: 3, max: 3, run: (y, m, d) => iso(Date.UTC(num(y), num(m) - 1, num(d))) },
  dateadd: { group: 'dates', min: 2, max: 3, run: moved },
  datediff: { group: 'dates', min: 2, max: 3, run: between },
  year: { group: 'dates', min: 1, max: 1, run: (value) => new Date(time(value)).getUTCFullYear() },
  month: { group: 'dates', min: 1, max: 1, run: (value) => new Date(time(value)).getUTCMonth() + 1 },
  day: { group: 'dates', min: 1, max: 1, run: (value) => new Date(time(value)).getUTCDate() },
  weekday: { group: 'dates', min: 1, max: 1, run: (value) => ((new Date(time(value)).getUTCDay() + 6) % 7) + 1 },
  count: { group: 'lists', min: 1, run: (...values) => values.flatMap(list).filter((value) => !blank(value)).length },
  join: { group: 'lists', min: 1, max: 2, run: (value, by = ', ') => list(value).map(text).join(text(by)) },
  first: { group: 'lists', min: 1, max: 1, run: (value) => list(value)[0] ?? '' },
  last: { group: 'lists', min: 1, max: 1, run: (value) => list(value).at(-1) ?? '' },
}

/**
 * A formula as a function of a row's cells; throws an Unread, saying why and where, when it can't be read. An empty cell is 0 in a number column, unticked in a
 * box's, else "". @param {string} source @param {Property[]} columns @returns {Part}
 */
export function compile(source, columns) {
  const list = tokens(source, columns)
  let i = 0
  const take = (/** @type {string} */ what) => list[i]?.text === what && ++i > 0
  /** A bracket opened at `at` closed here, else why not. @param {number} at */
  const closed = (at) => { if (!take(')')) throw list[i] ? new Unread(list[i].at, 'extra') : new Unread(at, 'close') }
  /** Parts joined by these operators, from the left. @param {() => Part} next @param {string[]} ops @returns {() => Part} */
  const chain = (next, ops) => () => {
    let left = next()
    for (let op = list[i]?.text; ops.includes(op); op = list[i]?.text) {
      i++
      const [a, b] = [left, next()]
      left = (cells) => OPS[op](a(cells), b(cells))
    }
    return left
  }
  /** @returns {Part} */
  const power = () => {
    const base = unary(), exponent = take('**') || take('^') ? power() : null
    return exponent ? (cells) => base(cells) ** exponent(cells) : base
  }
  /** @returns {Part} */
  const unary = () => {
    const sign = take('-') ? -1 : take('+') ? 1 : 0
    if (!sign) return atom()
    const part = unary()
    return (cells) => sign * part(cells)
  }
  const compare = chain(chain(chain(chain(power, ['*', '/', '%']), ['+', '-']), ['&']), ['=', '!=', '<>', '<', '<=', '>', '>='])
  /** @returns {Part} */
  const atom = () => {
    const token = list[i++]
    if (!token) throw new Unread(source.length, 'more')
    if (token.column) {
      const { id, type } = token.column, empty = type === 'number' ? 0 : type === 'checkbox' ? false : /** @type {string} */ (type) === 'live' ? NaN : ''
      return (cells) => cells[id] ?? empty
    }
    if (token.text === '(') {
      const inner = compare()
      closed(token.at)
      return inner
    }
    if (/^[\d.]/.test(token.text)) return ((number) => () => number)(Number(token.text))
    if (/^["']/.test(token.text)) return ((words) => () => words)(token.text.slice(1, -1).replace(/\\(.)/gu, '$1'))
    if (!/^[\p{L}_]/u.test(token.text)) throw new Unread(token.at, 'more')
    const name = token.text.toLowerCase(), fn = Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : null
    const member = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (Math))[MATH.get(name) ?? '']
    if (!take('(')) {
      if (name === 'true' || name === 'false') return () => name === 'true'
      if (typeof member === 'number') return () => member
      throw new Unread(token.at, 'word', token.text)
    }
    if (!fn && typeof member !== 'function') throw new Unread(token.at, 'word', token.text)
    /** @type {Part[]} */
    const args = [], open = list[i - 1].at
    if (!take(')')) {
      do args.push(compare()); while (take(','))
      closed(open)
    }
    if (fn && (args.length < fn.min || args.length > (fn.max ?? Infinity))) throw new Unread(token.at, 'parts', token.text)
    if (fn?.lazy) return (cells) => fn.run(...args.map((arg) => () => arg(cells)))
    if (fn) return (cells) => fn.run(...args.map((arg) => arg(cells)))
    return (cells) => /** @type {Function} */ (member)(...args.map((arg) => num(arg(cells))))
  }
  const whole = compare()
  if (i < list.length) throw new Unread(list[i].at, 'extra')
  return whole
}

/** A result as a cell holds it: a finite number, text (a list's joined) or a box's value; anything else none. @param {Part} part @param {Record<string, unknown>} cells */
export function result(part, cells) {
  let value
  try { value = part(cells) } catch { return null }
  if (Array.isArray(value)) value = text(value)
  return typeof value === 'number' ? (Number.isFinite(value) ? value : null) : typeof value === 'string' || typeof value === 'boolean' ? value : null
}

/** A Formula's function, none for one empty or that can't be read. @param {Property} property @param {Property[]} columns @returns {Part} */
const partOf = (property, columns) => { try { return property.formula?.trim() ? compile(property.formula, columns) : () => null } catch { return () => null } }

/**
 * The rows with each formula's cell worked out, twice over, so that a formula naming a later one sees it; one empty or that can't be read
 * leaves its cells empty, whatever they held as another kind.
 * @param {Table} table @param {Row[]} rows @returns {Row[]}
 */
export function worked(table, rows) {
  const columns = table.properties.filter((property) => !property.deleted)
  const formulas = columns.flatMap((property) => (property.type === 'formula' ? [/** @type {const} */ ([property.id, partOf(property, columns)])] : []))
  if (!formulas.length) return rows
  return rows.map((row) => {
    const cells = { ...row.cells }
    for (const _ of [1, 2]) for (const [id, part] of formulas) cells[id] = result(part, cells)
    return { ...row, cells }
  })
}
