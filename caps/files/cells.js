// A workbook's cells changed in place (D229): a cell takes a formula ("=…"), TRUE or FALSE, a number (unless
// its style shows numbers as text) or text, in the cell itself so the shared strings stay as they were, and
// keeps its style, emptied too; the rest stays as it was once unzipped. Excel works the formulas out again as
// it opens the file, and rebuilds their chain, dropped once a formula is written over. What changes only as a
// whole is refused, or Excel would repair the file: a table's header, a formula others share, part of an array.
import { readZip, writeZip } from '../../core/zip.js'
import { attr, columnIndex, decodeEntities, relationships, resolveTarget, sharedStrings, sheetRows } from './extract.js'

/** A cell to change: its sheet by its place among the workbook's, from 0, and its value as typed. @typedef {{ sheet: number, ref: string, value: string }} CellChange */
/** @typedef {{ at: number, source: string, attrs: string, body: string }} Placed */
const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?(e[-+]?\d+)?$/i
const FORMULA = /<(?:\w+:)?f\b([^>]*)>(?:([^<]*)<)?/
const ESCAPES = /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })

/** Text safe in XML: escaped, without the characters XML forbids. @param {string} text */
const escape = (text) => text.replace(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '').replace(/[&<>]/g, (char) => ESCAPES[char])
/** "A", "B", … "Z", "AA"… @param {number} index from 0 @returns {string} */
const column = (index) => (index >= 26 ? column(Math.floor(index / 26) - 1) : '') + String.fromCharCode(65 + (index % 26))
/** "B3" → [1, 3]; "B2:C4" → [1, 2, 2, 4]. @param {string} range */
const corners = (range) => range.split(':').flatMap((ref) => [columnIndex(ref), Number(/\d+$/.exec(ref)?.[0])])
/** The elements of that name, each with its attributes and what it holds. @param {string} name with its prefix */
const elements = (name) => new RegExp(`<${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${name}>)`, 'g')
/** A worksheet's or a workbook's prefix, as some writers give one ("x:"). @param {string} xml */
const prefixOf = (xml) => /<(\w+:)?(?:worksheet|workbook)\b/.exec(xml)?.[1] ?? ''
/** A row: its cells, then what else it held (its extensions). @param {string} p @param {string} attrs @param {{ source: string }[]} cells @param {string} body */
const rowOf = (p, attrs, cells, body) => `<${p}row${attrs}>${cells.map((cell) => cell.source).join('')}${body.replace(elements(`${p}c`), '').trim()}</${p}row>`
/** Rows or cells in order, each where its `r` says, else just after the one before. @param {RegExpMatchArray[]} matches @param {(ref: string) => number} at @param {number} last @returns {Placed[]} */
const placed = (matches, at, last) => matches.map((match) => {
  const ref = attr(match[1], 'r')
  return { at: (last = ref ? at(ref) : last + 1), source: match[0], attrs: match[1], body: match[2] ?? '' }
})

/** A workbook unzipped: its parts, read and written as text, its sheets in order, and the styles that show numbers as text (format 49, "@"). @param {Uint8Array} bytes @param {string} name */
async function open(bytes, name) {
  const parts = new Map(await Promise.all(readZip(bytes).map(async (entry) => /** @type {[string, Uint8Array]} */ ([entry.name, await entry.read()]))))
  const text = (/** @type {string} */ path) => (parts.has(path) ? new TextDecoder().decode(parts.get(path)) : null)
  const put = (/** @type {string} */ path, /** @type {string} */ value) => void (parts.has(path) && parts.set(path, new TextEncoder().encode(value)))
  const workbook = text('xl/workbook.xml')
  if (workbook === null) throw new Error(`${name} isn't an Excel workbook.`)
  const targets = relationships(text('xl/_rels/workbook.xml.rels') ?? '')
  const sheets = [...workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*)>/g)].map((match) => ({ name: attr(match[1], 'name') ?? '', path: resolveTarget('xl', targets.get(attr(match[1], 'r:id') ?? '') ?? '') }))
  const xfs = /<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(text('xl/styles.xml') ?? '')?.[1] ?? ''
  const texts = new Set([...xfs.matchAll(/<(?:\w+:)?xf\b([^>]*)>/g)].flatMap((match, i) => (attr(match[1], 'numFmtId') === '49' ? [String(i)] : [])))
  return { name, parts, text, put, sheets, texts }
}
/** @typedef {Awaited<ReturnType<typeof open>>} Book */

/** What in a sheet changes only as a whole, as rectangles with why: array formulas over several cells, tables' headers. @param {Book} book @param {string} path @param {string} xml */
function wholes(book, path, xml) {
  const found = /** @type {[number[], string][]} */ ([])
  for (const match of xml.matchAll(new RegExp(FORMULA, 'g'))) {
    const ref = attr(match[1], 'ref')
    if (attr(match[1], 't') === 'array' && ref?.includes(':')) found.push([corners(ref), `is part of an array formula over ${ref}, which changes only as a whole`])
  }
  const dir = path.slice(0, path.lastIndexOf('/'))
  for (const [link] of (book.text(`${dir}/_rels/${path.slice(dir.length + 1)}.rels`) ?? '').matchAll(/<Relationship\b[^>]*\/table"[^>]*>/g)) {
    const table = /<(?:\w+:)?table\b([^>]*)>/.exec(book.text(resolveTarget(dir, attr(link, 'Target') ?? '')) ?? '')?.[1] ?? ''
    const [left, top, right] = corners(attr(table, 'ref') ?? '')
    if (attr(table, 'headerRowCount') !== '0' && top) found.push([[left, top, right, top], `heads a column of the table ${attr(table, 'displayName')}, which formulas may name`])
  }
  return found
}

/** A cell's XML; nothing for an empty one without a style. @param {string} ref @param {string} value @param {string | null} style @param {string} p the prefix @param {Set<string>} texts the styles that show numbers as text */
function cellOf(ref, value, style, p, texts) {
  const head = `<${p}c r="${ref}"${style ? ` s="${style}"` : ''}`
  const typed = !texts.has(style ?? '0')
  if (!value) return style ? `${head}/>` : ''
  if (/^=./s.test(value)) return `${head}><${p}f>${escape(value.slice(1))}</${p}f></${p}c>`
  if (typed && /^(true|false)$/i.test(value)) return `${head} t="b"><${p}v>${/^t/i.test(value) ? 1 : 0}</${p}v></${p}c>`
  if (typed && NUMBER.test(value)) return `${head}><${p}v>${value}</${p}v></${p}c>`
  return `${head} t="inlineStr"><${p}is><${p}t${/^\s|\s$/.test(value) ? ' xml:space="preserve"' : ''}>${escape(value)}</${p}t></${p}is></${p}c>`
}

/**
 * A sheet with one cell changed, once `check` lets it (given the cell's XML, '' if none); its row loses `spans`, a mere hint at where its cells are.
 * @param {string} xml @param {number} col from 0 @param {number} row from 1 @param {string} value @param {(ref: string, cell: string) => void} check @param {Set<string>} texts
 */
function writeCell(xml, col, row, value, check, texts) {
  const p = prefixOf(xml)
  const data = elements(`${p}sheetData`).exec(xml)
  if (!data) throw new Error('This sheet is a chart, without cells.')
  const rows = placed([...(data[2] ?? '').matchAll(elements(`${p}row`))], Number, 0)
  const at = rows.findIndex((each) => each.at >= row)
  const found = rows[at]?.at === row ? rows[at] : null
  const cells = placed([...(found?.body ?? '').matchAll(elements(`${p}c`))], columnIndex, -1)
  const here = cells.findIndex((each) => each.at >= col)
  const old = cells[here]?.at === col ? cells[here] : null
  const ref = `${column(col)}${row}`
  check(ref, old?.source ?? '')
  const made = cellOf(ref, value, attr(old?.attrs ?? '', 's'), p, texts)
  if (!old && !made) return xml
  cells.splice(here < 0 ? cells.length : here, old ? 1 : 0, ...(made ? [{ at: col, source: made, attrs: '', body: '' }] : []))
  const source = rowOf(p, (found?.attrs ?? ` r="${row}"`).replace(/\sspans="[^"]*"/, ''), cells, found?.body ?? '')
  rows.splice(at < 0 ? rows.length : at, found ? 1 : 0, { at: row, source, attrs: '', body: '' })
  return `${xml.slice(0, data.index)}<${p}sheetData${data[1]}>${rows.map((each) => each.source).join('')}</${p}sheetData>${xml.slice(data.index + data[0].length)}`
}

/** A workbook whose formulas are worked out again as it opens: `calcPr` where the standard puts it. @param {string} xml */
function recalc(xml) {
  const p = prefixOf(xml)
  const calc = new RegExp(`<${p}calcPr\\b([^>]*?)(/?)>`).exec(xml)
  if (calc) return `${xml.slice(0, calc.index)}<${p}calcPr${calc[1].replace(/\sfullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"${calc[2]}>${xml.slice(calc.index + calc[0].length)}`
  const at = new RegExp(`<${p}(?:oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\\b|</${p}workbook>`).exec(xml)?.index ?? xml.length
  return `${xml.slice(0, at)}<${p}calcPr fullCalcOnLoad="1"/>${xml.slice(at)}`
}

// ─── Formulas worked out again ───────────────────────────────────────────────

const TOKENS = /\s*(?:(\d+(?:\.\d+)?(?:E[-+]?\d+)?)|(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?|(SUM|AVERAGE|MIN|MAX|COUNT)\(|([-+*/^(),]))/y
// The cells a formula names on its own sheet: a cell, a range, whole columns.
const NAMED = /(?<![\w.!$:'"])\$?([A-Z]{1,3})(?:\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?|:\$?([A-Z]{1,3}))(?![\w(!])/g
/** "$B$3" → [1, 3]. @param {string} ref */
const placeOf = (ref) => corners(ref.replace(/\$/g, ''))
/** A formula others share, as it is in a cell so many rows and columns from the one holding it. @param {string} formula @param {number} rows @param {number} cols */
const moved = (formula, rows, cols) => formula.replace(/(?<![\w.$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\w(])/g, (_, fixedCol, col, fixedRow, row) =>
  `${fixedCol}${fixedCol ? col : column(columnIndex(col) + cols)}${fixedRow}${fixedRow ? row : Number(row) + rows}`)

/**
 * What a formula comes to, for what Jean knows: + - * / ^, brackets, and SUM, AVERAGE, MIN, MAX and COUNT over cells and ranges; else null.
 * @param {string} formula @param {(col: number, row: number) => number | null | undefined} at a cell's number: undefined when empty, null for text, NaN unknown
 */
export function evaluate(formula, at) {
  const tokens = /** @type {RegExpExecArray[]} */ ([])
  const scan = new RegExp(TOKENS)
  for (const text = formula.trim(); scan.lastIndex < text.length;) {
    const token = scan.exec(text)
    if (!token) return null
    tokens.push(token)
  }
  let i = 0
  const range = (/** @type {string} */ from, /** @type {string} */ to) => {
    const [[left, right], [top, bottom]] = [0, 1].map((n) => [placeOf(from)[n], placeOf(to)[n]].sort((a, b) => a - b))
    const out = []
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) out.push(at(col, row))
    return out
  }
  /** @returns {number} */
  const atom = () => {
    const token = tokens[i++]
    if (token?.[1]) return Number(token[1])
    if (token?.[2]) return token[3] ? NaN : ((value) => (value === undefined ? 0 : value ?? NaN))(range(token[2], token[2])[0])
    if (token?.[4]) {
      const values = []
      if (tokens[i]?.[5] !== ')') do {
        const [next, after] = [tokens[i], tokens[i + 1]?.[5]]
        if (next?.[2] && (after === ',' || after === ')')) values.push(...range(next[2], (i++, next[3] ?? next[2])))
        else values.push(sum())
      } while (tokens[i]?.[5] === ',' && ++i)
      const numbers = /** @type {number[]} */ (values.filter((value) => value !== undefined && value !== null))
      if (tokens[i++]?.[5] !== ')' || numbers.some(Number.isNaN)) return NaN
      const total = numbers.reduce((a, b) => a + b, 0)
      return token[4] === 'SUM' ? total : token[4] === 'COUNT' ? numbers.length : token[4] === 'AVERAGE' ? total / numbers.length
        : numbers.length ? numbers.reduce((a, b) => (token[4] === 'MIN' ? Math.min(a, b) : Math.max(a, b))) : 0
    }
    if (token?.[5] === '(') {
      const value = sum()
      return tokens[i++]?.[5] === ')' ? value : NaN
    }
    return token?.[5] === '-' ? -atom() : token?.[5] === '+' ? atom() : NaN
  }
  /** The operators of a level and those that bind tighter: + and -, then * and /, then ^. @param {number} [level] @returns {number} */
  const sum = (level = 0) => {
    let value = level < 2 ? sum(level + 1) : atom()
    for (let op = tokens[i]?.[5]; ['+-', '*/', '^'][level].includes(op ?? '_'); op = tokens[i]?.[5]) {
      const next = (i++, level < 2 ? sum(level + 1) : atom())
      value = op === '+' ? value + next : op === '-' ? value - next : op === '*' ? value * next : op === '/' ? value / next : value ** next
    }
    return value
  }
  const result = sum()
  return i === tokens.length && Number.isFinite(result) ? Number(result.toPrecision(15)) : null
}

/** Whether a formula names one of these cells ("col,row"), looking from whichever side is smaller. @param {string} formula @param {Set<string>} keys */
function uses(formula, keys) {
  return [...formula.matchAll(NAMED)].some(([, first, top, other, end, last]) => {
    const [left, right] = [columnIndex(first), columnIndex(other ?? last ?? first)].sort((a, b) => a - b)
    const [low, high] = top ? [Number(top), Number(end ?? top)].sort((a, b) => a - b) : [1, 1048576]
    if ((right - left + 1) * (high - low + 1) > keys.size) {
      return [...keys].some((key) => {
        const [col, row] = /** @type {[number, number]} */ (key.split(',').map(Number))
        return col >= left && col <= right && row >= low && row <= high
      })
    }
    for (let row = low; row <= high; row++) for (let col = left; col <= right; col++) if (keys.has(`${col},${row}`)) return true
    return false
  })
}

/**
 * A sheet's formulas that use the cells changed, or such formulas, worked out again after those they use (D229): a result Jean can
 * work out is saved, so a preview shows it, others none, as no number beats a wrong one. A shared formula is moved to each cell.
 * @param {string} xml @param {Set<string>} changed the cells, as "col,row"
 */
function workOut(xml, changed) {
  const p = prefixOf(xml)
  const data = elements(`${p}sheetData`).exec(xml)
  if (!data) return xml
  /** @typedef {Placed & { row: number, formula: string | null, value?: number | null, touched: boolean, done: boolean }} Cell */
  const cells = /** @type {Map<string, Cell>} */ (new Map())
  const [masters, members] = [/** @type {Map<string | null, Cell>} */ (new Map()), /** @type {[Cell, string | null][]} */ ([])]
  const rows = placed([...(data[2] ?? '').matchAll(elements(`${p}row`))], Number, 0).map((row) => ({ ...row, cells: placed([...row.body.matchAll(elements(`${p}c`))], columnIndex, -1).map((cell) => {
    const f = FORMULA.exec(cell.body)
    const [kind, value, type] = [f && attr(f[1], 't'), /<(?:\w+:)?v>([^<]*)</.exec(cell.body)?.[1], attr(cell.attrs, 't')]
    /** @type {Cell} */
    const entry = { ...cell, row: row.at, formula: f && (!kind || kind === 'normal' || kind === 'shared') ? decodeEntities(f[2] ?? '') : null,
      value: !value ? undefined : !type || type === 'n' ? Number(value) : type === 'e' ? NaN : null, touched: false, done: false }
    if (f && kind === 'shared') (f[2] ? masters.set(attr(f[1], 'si'), entry) : members.push([entry, attr(f[1], 'si')]))
    cells.set(`${cell.at},${row.at}`, entry)
    return entry
  }) }))
  for (const [cell, si] of members) {
    const master = masters.get(si)
    cell.formula = master?.formula ? moved(master.formula, cell.row - master.row, cell.at - master.at) : ''
  }
  const formulas = [...cells.values()].filter((cell) => cell.formula !== null)
  const dirty = new Set(changed)
  for (const key of changed) if (cells.get(key)?.formula) /** @type {Cell} */ (cells.get(key)).touched = true
  for (let grown = true; grown;) {
    grown = false
    for (const cell of formulas) if (!cell.touched && uses(/** @type {string} */ (cell.formula), dirty)) (cell.touched = grown = true) && dirty.add(`${cell.at},${cell.row}`)
  }
  /** A cell's number, the formulas it uses worked out first; one in a loop isn't known. @param {number} col @param {number} row */
  const at = (col, row) => {
    const cell = cells.get(`${col},${row}`)
    if (cell?.touched && !cell.done) {
      cell.done = true
      cell.value = NaN
      cell.value = evaluate(/** @type {string} */ (cell.formula), at) ?? NaN
    }
    return cell?.value
  }
  try {
    for (const cell of formulas) if (cell.touched) at(cell.at, cell.row)
  } catch {
    // A chain too long to follow: none rather than a wrong one.
    for (const cell of formulas) if (cell.touched) cell.value = NaN
  }
  const saved = (/** @type {Cell} */ { attrs, body, value }) => `<${p}c${attrs.replace(/\st="[^"]*"/, '')}>${body.replace(/<(?:\w+:)?v\b[^>]*(?:\/>|>[^<]*<\/(?:\w+:)?v>)/, '')}${Number.isFinite(value) ? `<${p}v>${value}</${p}v>` : ''}</${p}c>`
  const body = rows.map((row) => (row.cells.some((cell) => cell.touched) ? rowOf(p, row.attrs, row.cells.map((cell) => (cell.touched ? { source: saved(cell) } : cell)), row.body) : row.source))
  return `${xml.slice(0, data.index)}<${p}sheetData${data[1]}>${body.join('')}</${p}sheetData>${xml.slice(data.index + data[0].length)}`
}

/** @param {Book} book @param {CellChange[]} changes @param {boolean} keep a formula stays unless a formula replaces it: the brain reads what it comes to, not it */
async function write(book, changes, keep) {
  const sheets = /** @type {Map<number, string>} */ (new Map())
  const changed = /** @type {Map<number, Set<string>>} */ (new Map())
  let formulas = false
  for (const { sheet, ref, value } of changes) {
    const { name, path } = book.sheets[sheet] ?? { name: '', path: '' }
    const xml = sheets.get(sheet) ?? book.text(path)
    if (xml === null) throw new Error(`${book.name} has no sheet ${sheet + 1}.`)
    const [col, row] = /^[A-Z]{1,3}[1-9]\d{0,6}$/.test(ref) ? corners(ref) : [-1, 0]
    if (col < 0 || col >= 16384 || row > 1048576) throw new Error(`"${ref}" isn't a cell, such as B3.`)
    changed.set(sheet, (changed.get(sheet) ?? new Set()).add(`${col},${row}`))
    const check = (/** @type {string} */ ref, /** @type {string} */ cell) => {
      const wall = wholes(book, path, xml).find(([[left, top, right = left, bottom = top]]) => col >= left && col <= right && row >= top && row <= bottom)
      if (wall) throw new Error(`${ref} in ${name} ${wall[1]}: change it in a spreadsheet app.`)
      const formula = FORMULA.exec(cell)
      if (formula && attr(formula[1], 't') === 'shared' && attr(formula[1], 'ref')) throw new Error(`${ref} in ${name} holds the formula that the cells of ${attr(formula[1], 'ref')} share: change it in a spreadsheet app.`)
      if (formula && keep && !value.startsWith('=')) throw new Error(`${ref} in ${name} is worked out by a formula${formula[2] ? `, =${decodeEntities(formula[2])}` : ''}: give a new formula, starting with =, or change the cells it uses.`)
      formulas ||= Boolean(formula)
    }
    sheets.set(sheet, writeCell(xml, col, row, value, check, book.texts))
  }
  for (const [sheet, xml] of sheets) book.put(book.sheets[sheet].path, workOut(xml, changed.get(sheet) ?? new Set()))
  book.put('xl/workbook.xml', recalc(book.text('xl/workbook.xml') ?? ''))
  if (formulas && book.parts.delete('xl/calcChain.xml')) for (const path of ['xl/_rels/workbook.xml.rels', '[Content_Types].xml']) book.put(path, (book.text(path) ?? '').replace(/<(?:Relationship|Override)\b[^>]*calcChain\.xml"[^>]*>/g, ''))
  return writeZip([...book.parts].map(([name, bytes]) => ({ name, bytes })))
}

/** A workbook with cells changed, each taking what was typed in it. @param {Uint8Array} bytes @param {CellChange[]} changes @param {string} name */
export async function setCells(bytes, changes, name) {
  return write(await open(bytes, name), changes, false)
}

/**
 * A workbook with one passage of its text replaced, as Files reads it to the brain (a row's cells apart by tabs): quoted exactly, found once,
 * within one row. The cells it spans take their new text; one that ends its row may add cells after it, or empty them. @param {Uint8Array} bytes
 * @param {string} old @param {string} replacement @param {string} name @param {(text: string, old: string, replacement: string, name: string) => string} replaceOnce
 */
export async function replaceInSheet(bytes, old, replacement, name, replaceOnce) {
  if (/[\r\n]/.test(old + replacement)) throw new Error(`In ${name}, change one row at a time: no line breaks in the passage or the new text.`)
  const book = await open(bytes, name)
  const shared = sharedStrings(book.text('xl/sharedStrings.xml') ?? '')
  const lines = book.sheets.flatMap(({ path }, sheet) => {
    const xml = book.text(path) ?? ''
    return placed([...xml.matchAll(elements(`${prefixOf(xml)}row`))], Number, 0).map((row) => ({ sheet, row: row.at, text: sheetRows(row.source, shared)[0] ?? '' }))
  })
  replaceOnce(lines.map((line) => line.text).join('\n'), old, replacement, name)
  // The passage has no line break, so it is within one row.
  const line = /** @type {(typeof lines)[number]} */ (lines.find((each) => each.text.includes(old)))
  const start = line.text.indexOf(old)
  const [was, now] = [line.text, line.text.slice(0, start) + replacement + line.text.slice(start + old.length)].map((text) => text.split('\t'))
  if (was.length !== now.length && start + old.length < line.text.length) throw new Error(`In ${name}, keep the cells a passage spans: as many tabs in the new text as in the passage, unless it ends its row.`)
  const changes = Array.from({ length: Math.max(was.length, now.length) }, (_, col) => ({ sheet: line.sheet, ref: `${column(col)}${line.row}`, value: now[col] ?? '' }))
  return write(book, changes.filter((cell, col) => cell.value !== (was[col] ?? '')), true)
}
