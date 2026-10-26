// A Formula column's cells (D621): one formula for the column, worked out for each row from its other cells as the collection is read
// (`worked()`), so that sorting, filters, the foot, the workbook and the brain see them as any other. Jean reads it itself, never with eval:
// numbers, "text", the row's columns by their names as written (the longest name first, in any case), + - * / % and ** or ^, brackets, and
// every function and constant of Math by its name alone (round, max, sqrt, PI…). Renamed, a column keeps its formulas (`renamed()`). Pure, so Node's tests run it.

/** @import { Table, Property } from './table.js' */
/** @import { Row } from './changes.js' */
/** @typedef {{ text: string, at: number, column?: Property }} Token */
/** @typedef {(cells: Record<string, unknown>) => any} Part */

/** Math's own names, by their lower case: round, pi, log10… */
const MATH = new Map(Object.getOwnPropertyNames(Math).map((name) => [name.toLowerCase(), name]))
const OPS = /** @type {Record<string, (a: any, b: any) => unknown>} */ ({ '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b, '%': (a, b) => a % b, '**': (a, b) => a ** b, '^': (a, b) => a ** b })
const TOKEN = /^(?:(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[\p{L}_][\p{L}\p{N}_]*|\*\*|[-+*/%^(),])/iu
const wrong = () => new Error('This formula can\'t be worked out.')

/** A formula's tokens, a column's where its name is written, the longest first, as a word of its own. @param {string} text @param {Property[]} columns @returns {Token[]} */
function tokens(text, columns) {
  const named = [...columns].sort((a, b) => b.name.length - a.name.length), out = []
  for (let at = 0; at < text.length;) {
    const rest = text.slice(at), space = /^\s+/u.exec(rest)?.[0].length
    if (space) { at += space; continue }
    const column = named.find(({ name }) => rest.slice(0, name.length).toLocaleLowerCase() === name.toLocaleLowerCase() && !/^[\p{L}\p{N}_]/u.test(rest.slice(name.length)))
    const found = column ? rest.slice(0, column.name.length) : TOKEN.exec(rest)?.[0]
    if (!found) throw wrong()
    out.push({ text: found, at, column })
    at += found.length
  }
  return out
}

/**
 * A formula as a function of a row's cells; throws when it can't be read. An empty cell is 0 in a number column, unticked in a box's, else "".
 * @param {string} text @param {Property[]} columns @returns {Part}
 */
export function compile(text, columns) {
  const list = tokens(text, columns)
  let i = 0
  const take = (/** @type {string} */ what) => list[i]?.text === what && ++i > 0
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
  const sum = chain(chain(power, ['*', '/', '%']), ['+', '-'])
  /** @returns {Part} */
  const atom = () => {
    const token = list[i++]
    if (!token) throw wrong()
    if (token.column) {
      const { id, type } = token.column, empty = type === 'number' ? 0 : type === 'checkbox' ? false : ''
      return (cells) => cells[id] ?? empty
    }
    if (token.text === '(') {
      const inner = sum()
      if (!take(')')) throw wrong()
      return inner
    }
    if (/^[\d.]/.test(token.text)) return ((number) => () => number)(Number(token.text))
    if (/^["']/.test(token.text)) return ((words) => () => words)(token.text.slice(1, -1).replace(/\\(.)/gu, '$1'))
    const member = /** @type {any} */ (Math)[MATH.get(token.text.toLowerCase()) ?? '']
    if (member === undefined) throw wrong()
    if (typeof member !== 'function') return () => member
    if (!take('(')) throw wrong()
    /** @type {Part[]} */
    const args = []
    if (!take(')')) {
      do args.push(sum()); while (take(','))
      if (!take(')')) throw wrong()
    }
    return (cells) => member(...args.map((arg) => arg(cells)))
  }
  const whole = sum()
  if (i < list.length) throw wrong()
  return whole
}

/** A result as a cell holds it: a finite number, text or a box's value; anything else none. @param {Part} part @param {Record<string, unknown>} cells */
const result = (part, cells) => {
  let value
  try { value = part(cells) } catch { return null }
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

/** A formula with a column's name written anew where it names it; as it was when it can't be read. @param {string} text @param {Property[]} columns @param {string} id @param {string} name */
export function renamed(text, columns, id, name) {
  try { return tokens(text, columns).reduceRight((out, token) => (token.column?.id === id ? `${out.slice(0, token.at)}${name}${out.slice(token.at + token.text.length)}` : out), text) } catch { return text }
}
