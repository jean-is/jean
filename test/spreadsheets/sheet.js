// SPDX-License-Identifier: MIT
// A sheet read into a collection by rule, with no brain (collections, phase 0a; to be caps/spreadsheets/sheet.js): from a grid of
// typed cells (cells.js) and the person's region, its columns, its rows as values Tables' checkCell takes, the foot's sums, the
// order its dates were read in, whether it is a list or a report, and everything left out, each with why and where, so that
// nothing goes without a word.
//   The heads are the first line of words (a year is one, above the rows). A line of words under it takes its place when it names
//     the columns of numbers and dates below: a title of several cells, heads on two lines. A sheet with no heads is declined.
//     Merged cells lend their words across their line, and down only within the heads; a column of lent cells alone is none. A
//     column with no head takes the words just above it, else its letter; two of a name are told apart by the words over them.
//   The table runs down to other heads (the same again are a part's), or to an empty line followed by a line alone, and across to
//     an empty column whose far side has no heads here or stops much higher. Empty lines and columns inside it are passed over;
//     a cell or two with no head beside it are said, not a column. A figure merged down the rows joins one record's lines.
//   A line alone at the start of a part is its name, and under the last row a note. A line computed from others is no row: the
//     sum of the rows just above or below it (on top of its parts too, totals passed over, rounded figures off by one), the sum or
//     difference of the totals before it, or shares in a column of none; all its figures agreeing, or one with a word for total
//     in any of the languages Jean speaks most. The first that adds up every row, followed only by notes, checks or another
//     table, is the foot, and what follows it is below. A sheet with parts, subtotals or a total is a report.
//   A column's kind is what four in five of its cells are: a number (money or a share by its format or its sign), a date, a
//     tick, an email, a link, a phone; else text, and a select when its values repeat (two distinct in three cells at most).
//     Codes of digits (a zero in front, or five or more that repeat) and references with separators stay text.
//   Numbers are read as people write them ("1 234,50 €", "(45.00)", "٤٬٥٠٠٫٠٠ ج.م", "３２０万円"): a lone comma or point before
//     three digits is settled by the column's other numbers, else by the region; numbers that only their last zeros tell apart
//     (1.1, 1.10) are references, and stay text. Dates too (ISO, 2026年3月4日, 4 mars 2026, 03/04/2026): day or month first is
//     settled by a value of 13 or more anywhere in the sheet, else by the region.
// Months' names, decimal marks and currencies' signs come from Intl, for the region; the words for yes and no from the caller,
// in the person's language, beside English's and the marks people tick with. Pure: no DOM, no storage; Node's tests run it
// (sheet.test.js).

/** A cell as Files gives it (cells.js). @typedef {{ value: string | number | boolean | null, kind: 'text' | 'number' | 'date' | 'boolean' | 'empty', format?: 'money' | 'percent', currency?: string, formula?: boolean }} Cell */
/** Merged cells, counted from 0, ends included. @typedef {{ top: number, left: number, bottom: number, right: number }} Range */
/** A column; at: its place in the sheet, from 0; currency: ISO 4217, when the file names one; options: a select's choices, in the order they come. @typedef {{ name: string, type: 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'email' | 'link' | 'phone', at: number, format?: 'money' | 'percent', currency?: string, options?: string[] }} Column */
/**
 * What was left out; why: above the heads, below or beside the table, an empty line or column, a part's name, a subtotal (any
 * line computed from others), the total that is the foot, a formula whose result the file doesn't keep, a value that isn't of
 * its column's kind, the lines of a record joined into its first, no table at all; where: its cells, as A1 or A1:C3.
 * @typedef {{ why: 'above' | 'below' | 'beside' | 'empty' | 'section' | 'subtotal' | 'total' | 'formula' | 'value' | 'joined' | 'none', where: string }} Left
 */
/**
 * Where the rules may be wrong, for a brain or the person to settle; kind: a line whose cells don't fit their columns (misfit), a line
 * named a total that adds up nothing (total), a subtotal found by sums alone inside a run of rows (sums), words right under the heads
 * (words), a thin line after the last row with no total above (end), a long string of digits read as a number (long), cells merged
 * from the heads into the rows (merged); at: where, as A1 or A1:C3.
 * @typedef {{ kind: 'misfit' | 'total' | 'sums' | 'words' | 'end' | 'long' | 'merged', at: string, why: string }} Doubt
 */
/**
 * How a brain (layout.js) or the person read lines and columns, from 0: the rules read the sheet again with them, and with nothing else.
 * @typedef {{ lines?: Record<number, 'heads' | 'row' | 'section' | 'subtotal' | 'total' | 'note' | 'beside'>, kinds?: Record<number, Column['type']> }} Labels
 */
/**
 * A sheet as read; heads: the line of the heads, from 0, -1 when it has none; rows: each row's values, in the columns' order,
 * null for an empty cell; from: the line each row came from; foot: the line of totals and each column's sum, null where it has
 * none; dates: whether day or month comes first in dates written 03/04/2026, and whether the sheet's own values settled it;
 * shape: a report when it has parts, subtotals or a total, its rows then the line items alone; doubts: where the rules may be wrong.
 * @typedef {{ heads: number, columns: Column[], rows: unknown[][], from: number[], foot: { at: number, sums: (number | null)[] } | null, dates: { order: 'dmy' | 'mdy', settled: boolean }, shape: 'list' | 'report', left: Left[], doubts: Doubt[] }} Reading
 */
/** A cell as read; text: its words; word: a tick written as a word; written: read from words; alt: its other reading, for the sheet to settle; mark: the comma or point in doubt; proof: the order or decimal mark it shows for sure. @typedef {{ kind: 'empty' | 'text' | 'number' | 'date' | 'boolean' | 'email' | 'link' | 'phone', value?: any, text?: string, word?: boolean, written?: boolean, format?: 'money' | 'percent', currency?: string, alt?: any, mark?: string, proof?: string, formula?: boolean }} Seen */
/** How a region writes. @typedef {{ decimal: string, order: 'dmy' | 'mdy', months: Map<string, number>, currency: (sign: string) => string | undefined }} How */

const EMPTY = /** @type {Seen} */ ({ kind: 'empty' })
const YES = ['yes', 'true', '✓', '✔', '☑', 'x', '○', '◯', '〇'], NO = ['no', 'false', '✗', '✘', '×', '☐']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/, PHONE = /^\+?[\d\s().\-/]{3,}$/
const TIME = '(?:[t ] ?(\\d{1,2}):(\\d{2})(?::\\d{2}(?:\\.\\d+)?)?(?: ?([ap])\\.?m\\.?)?(?:z| ?[+-]\\d{2}:?\\d{2})?)?'
const YEAR_FIRST = new RegExp(`^(\\d{4}) ?[-/.年] ?(\\d{1,2}) ?[-/.月] ?(\\d{1,2}) ?日?${TIME}$`), YEAR_LAST = new RegExp(`^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4}|\\d{2})${TIME}$`)
// The words that name a total in a line's first words: whole words in the languages that write one, anywhere in Chinese, Japanese
// (総数, the statistics' total) and Korean (計 alone), after the article in Arabic.
const TOTAL = /(?<!\p{L})(?:(?:sub|sous|grand)[- ]?)?(?:totals?|totales?|totaux|totaal|summe|gesamt|insgesamt|zwischensumme|итого|всего|razem|suma|toplam|yhteensä|totalt|celkem|összesen)(?!\p{L})|合計|小計|総計|総数|合计|小计|总计|^[計计]$|합계|소계|총계|(?<!\p{L})(?:ال)?(?:مجموع|إجمالي|اجمالي)(?!\p{L})/u
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]/u, GAP = /(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]) (?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々])/gu
const DAY_MONTH = /^(\d{1,2})(?:er|st|nd|rd|th)?[ .\-/]+([^\d\s.,\-/]+)\.?,?[ .\-/]+(\d{4}|\d{2})$/, MONTH_DAY = /^([^\d\s.,]+)\.?,? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/

/** Text in plain characters: full-width ones as ASCII, Arabic's and Persian's digits as 0 to 9, no marks of direction, single spaces. @param {string} text */
const plain = (text) => text.normalize('NFKC').replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 15)).replace(/[\u200e\u200f\u061c]/g, '').replace(/\s+/g, ' ').trim()
/** "A", "B", … "AA". @param {number} index @returns {string} */
const letters = (index) => (index >= 26 ? letters(Math.floor(index / 26) - 1) : '') + String.fromCharCode(65 + (index % 26))
/** Cells as a spreadsheet names them. @param {number} top @param {number} left @param {number} [bottom] @param {number} [right] */
const ref = (top, left, bottom = top, right = left) => `${letters(left)}${top + 1}${bottom === top && right === left ? '' : `:${letters(right)}${bottom + 1}`}`
/** @param {number} a @param {number} b */
const near = (a, b) => Math.abs(a - b) <= 0.005 + Math.abs(b) * 1e-9

/** @type {Map<string, How>} */
const regions = new Map()

/** How a region writes: its decimal mark, whether the month comes before the day, its months' names beside English's, and its currencies by their signs, names and codes. @param {string} region @returns {How} */
function conventions(region) {
  const known = regions.get(region)
  if (known) return known
  const decimal = new Intl.NumberFormat(region, { numberingSystem: 'latn' }).formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? '.'
  const parts = new Intl.DateTimeFormat(region, { calendar: 'gregory' }).formatToParts(0).map((part) => part.type)
  /** @type {Map<string, number>} */
  const months = new Map()
  for (const locale of [region, 'en']) for (const month of /** @type {const} */ (['long', 'short'])) for (const day of /** @type {const} */ ([undefined, 'numeric'])) for (let m = 0; m < 12; m++) {
    const name = new Intl.DateTimeFormat(locale, { month, day, calendar: 'gregory', timeZone: 'UTC' }).formatToParts(Date.UTC(2026, m, 15)).find((part) => part.type === 'month')?.value ?? ''
    if (!months.has(plain(name).toLowerCase().replace(/\.$/, ''))) months.set(plain(name).toLowerCase().replace(/\.$/, ''), m + 1)
  }
  /** @type {Map<string, string> | undefined} */
  let signs
  const short = (/** @type {string} */ sign) => plain(sign).toLowerCase().replace(/[.\s]/g, '')
  const how = /** @type {How} */ ({ decimal, order: parts.indexOf('month') < parts.indexOf('day') ? 'mdy' : 'dmy', months, currency: (sign) => {
    if (!signs) {
      // Each currency's code, then its sign as the region writes it, so that a sign several share is the region's own ($ in
      // Canada), else the most used one's; then the signs that are no letters (₹, ₩: as letters they are words, 12 km, P10, Q1),
      // then its names (euros, 円).
      const codes = Intl.supportedValuesOf('currency'), known = signs = new Map(codes.map((code) => [code.toLowerCase(), code]))
      for (const currencyDisplay of /** @type {const} */ (['symbol', 'narrowSymbol', 'name'])) {
        for (const currency of ['USD', 'EUR', 'JPY', 'GBP', ...codes]) {
          const format = new Intl.NumberFormat(region, { style: 'currency', currency, currencyDisplay })
          for (const n of currencyDisplay === 'name' ? [1, 2] : [1]) ((key) => key && !known.has(key) && (currencyDisplay !== 'narrowSymbol' || /[^\p{L}\p{M}]/u.test(key)) && known.set(key, currency))(short(format.formatToParts(n).find((part) => part.type === 'currency')?.value ?? ''))
        }
        if (currencyDisplay === 'symbol') for (const [key, currency] of [['$', 'USD'], ['€', 'EUR'], ['¥', 'JPY'], ['£', 'GBP']]) if (!known.has(key)) known.set(key, currency)
      }
    }
    return signs.get(short(sign))
  } })
  regions.set(region, how)
  return how
}

/** A day on the calendar as ISO 8601 writes it, with its time when it has one that isn't midnight (Numbers writes 00:00 after every date); undefined when there is no such day. @param {string} year @param {string | number} month @param {string} date @param {string} [hour] @param {string} [minute] @param {string} [half] a or p */
function stamp(year, month, date, hour, minute, half) {
  const y = Number(year) + (year.length > 2 ? 0 : Number(year) < 30 ? 2000 : 1900), m = Number(month), d = Number(date), h = hour === undefined ? 0 : (Number(hour) % 12) + (half ? (half === 'p' ? 12 : 0) : Number(hour) - (Number(hour) % 12))
  if (m < 1 || m > 12 || d < 1 || new Date(Date.UTC(y, m - 1, d)).getUTCDate() !== d || h > 23 || Number(minute ?? 0) > 59) return undefined
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}${hour === undefined || (!h && !Number(minute)) ? '' : `T${String(h).padStart(2, '0')}:${minute}`}`
}

/**
 * A date as people write it, in lower case: the year first (ISO, 2026/3/4, 2026年3月4日), last (04/03/2026, read day first, with
 * its other reading when both are days), or with its month in words. @param {string} text @param {Map<string, number>} months
 * @returns {{ value: string, alt?: string, proof?: string } | undefined}
 */
function day(text, months) {
  let found = YEAR_FIRST.exec(text)
  if (found) return ((value) => (value ? { value } : undefined))(stamp(found[1], found[2], found[3], found[4], found[5], found[6]))
  if ((found = YEAR_LAST.exec(text))) {
    const dmy = stamp(found[3], found[2], found[1], found[4], found[5], found[6]), mdy = stamp(found[3], found[1], found[2], found[4], found[5], found[6])
    return dmy && mdy && dmy !== mdy ? { value: dmy, alt: mdy } : dmy ? { value: dmy, ...(!mdy && { proof: 'dmy' }) } : mdy ? { value: mdy, proof: 'mdy' } : undefined
  }
  const words = (found = DAY_MONTH.exec(text)) ? stamp(found[3], months.get(found[2]) ?? 0, found[1]) : (found = MONTH_DAY.exec(text)) ? stamp(found[3], months.get(found[1]) ?? 0, found[2]) : undefined
  return words ? { value: words } : undefined
}

/**
 * A number as people write it, in plain characters: with spaces, commas, points or apostrophes between thousands, a comma or a
 * point before decimals, a minus, brackets or Japan's triangle for less than nothing, a percent sign, a currency before or after,
 * 千, 万 or 億.
 * Not a number: other words beside it, a zero in front (a code, a phone), thousands not in threes.
 * @param {string} text @param {How} how @returns {Pick<Seen, 'value' | 'alt' | 'mark' | 'proof' | 'format' | 'currency'> | undefined}
 */
function amount(text, how) {
  const found = /^(\D*?)(\d(?:[\d .,'٬٫]*\d)?)(\D*)$/.exec(text)
  if (!found || /^0\d/.test(found[2])) return undefined
  const around = found[1] + found[3], percent = /[%٪]/.test(around), less = /[-−△▲]/.test(found[1]) || /^ ?[-−]/.test(found[3]) || (found[1].includes('(') && found[3].includes(')'))
  let scale = 1, core = found[2], value = NaN, alt, mark, proof
  const unit = around.replace(/[-−△▲+()%٪\s]/g, '').replace(/[千万億]/, (ten) => ((scale = ten === '千' ? 1e3 : ten === '万' ? 1e4 : 1e8), ''))
  const currency = unit ? how.currency(unit) : undefined
  if (unit && !currency) return undefined
  if (/[٬٫]/.test(core)) value = /^\d+(?:٬\d{3})*(?:٫\d+)?$/.test(core) ? Number(core.replace(/٬/g, '').replace('٫', '.')) : NaN
  else {
    const spaced = /[ ']/.test(core)
    if (spaced && !/^\d{1,3}(?:[ ']\d{3})+(?:[.,]\d+)?$/.test(core)) return undefined
    core = core.replace(/[ ']/g, '')
    const mixed = core.includes(',') && core.includes('.'), sep = core.lastIndexOf(',') > core.lastIndexOf('.') ? ',' : '.', pieces = core.split(sep)
    if (pieces.length === 1) value = Number(core)
    else if (mixed) [value, proof] = pieces.length === 2 && /^\d{1,3}(?:[.,]\d{3})+$/.test(pieces[0]) ? [Number(`${pieces[0].replace(/[.,]/g, '')}.${pieces[1]}`), sep] : [NaN, sep]
    else if (pieces.length > 2) [value, proof] = [pieces[0].length <= 3 && pieces.slice(1).every((piece) => piece.length === 3) ? Number(pieces.join('')) : NaN, sep === ',' ? '.' : ',']
    else if (spaced || pieces[1].length !== 3 || pieces[0].length > 3 || pieces[0] === '0') [value, proof] = [Number(pieces.join('.')), sep]
    else [value, alt, mark] = [Number(pieces.join('')), Number(pieces.join('.')), sep]
  }
  if (Number.isNaN(value)) return undefined
  const as = (/** @type {number} */ n) => ((less ? -n : n) * scale) / (percent ? 100 : 1)
  return { value: as(value), ...(alt !== undefined && { alt: as(alt), mark }), ...(proof && { proof }), ...(percent ? { format: 'percent' } : currency && { format: 'money', currency }) }
}

/** A cell as it is read. @param {Cell | undefined} cell @param {How} how @param {{ yes: Set<string>, no: Set<string> }} said @returns {Seen} */
function seen(cell, how, said) {
  if (!cell || cell.kind === 'empty' || cell.value === null) return cell?.formula ? { kind: 'empty', formula: true } : EMPTY
  if (cell.kind === 'number') return ((currency) => ({ kind: 'number', value: cell.value, text: String(cell.value), ...((cell.format ?? (currency && 'money')) && { format: cell.format ?? 'money' }), ...(currency && { currency }) }))(cell.currency ? how.currency(cell.currency) : undefined)
  if (cell.kind !== 'text') return { kind: cell.kind, value: cell.value, text: String(cell.value) }
  const text = String(cell.value).trim(), key = plain(text), low = key.toLowerCase()
  if (!key) return EMPTY
  if (said.yes.has(low) || said.no.has(low)) return { kind: 'boolean', value: said.yes.has(low), text, word: true }
  // A phone: from abroad, in brackets, with a zero in front, or as North America writes it; never with a slash (72-1/6574-13) or
  // starting otherwise (11.10.10.10.10): those are codes.
  const digits = key.replace(/\D/g, '').length
  if (PHONE.test(key) && !key.includes('/') && (/^[+(]/.test(key) ? digits >= 8 : /^0/.test(key) ? digits >= 9 : /^\d{3}[-. ]\d{3}[-. ]\d{4}$/.test(key))) return { kind: 'phone', value: key, text }
  const read = /\d/.test(key) ? ((date) => (date ? { kind: 'date', ...date } : ((number) => number && { kind: 'number', ...number })(amount(key, how))))(day(low, how.months)) : undefined
  if (read) return /** @type {Seen} */ ({ ...read, text, written: true })
  if (EMAIL.test(key)) return { kind: 'email', value: text, text }
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(text) && URL.canParse(text.replace(/^www\./i, 'https://www.'))) return { kind: 'link', value: text.replace(/^www\./i, 'https://www.'), text }
  return { kind: 'text', value: text, text }
}

/**
 * The sheet of a workbook to offer first: the first that isn't hidden, nor a list of the others by their names, which Numbers
 * puts in front of a document of several tables. @param {{ name: string, hidden?: boolean, cells: (Cell | undefined)[][] }[]} sheets
 * @returns {number} its place, -1 when every sheet is hidden
 */
export function first(sheets) {
  const shown = sheets.flatMap((sheet, i) => (sheet.hidden ? [] : [i]))
  return shown.find((i) => shown.length < 3 || !shown.every((other) => other === i || sheets[i].cells.some((line) => line.some((cell) => cell?.value === sheets[other].name)))) ?? shown[0] ?? -1
}

/**
 * A sheet's cells as a collection's columns and rows.
 * @param {(Cell | undefined)[][]} grid its lines, each its cells
 * @param {{ region?: string, merges?: Range[], yes?: string[], no?: string[], labels?: Labels }} [options] region: the person's, as fr-FR; merges: the sheet's merged cells; yes, no: the words for a ticked box and an unticked one in the person's language; labels: lines and columns as a brain or the person read them
 * @returns {Reading}
 */
export function read(grid, { region = 'en-US', merges = [], yes = [], no = [], labels = {} } = {}) {
  const how = conventions(region), height = grid.length, width = grid.reduce((most, line) => Math.max(most, line.length), 0)
  // A word for yes or no, or its first letter (Y, N; O, N).
  const spell = (/** @type {string[]} */ words) => new Set(words.map((word) => plain(word).toLowerCase()).flatMap((word) => (/^[a-z]{2,}$/.test(word) ? [word, word[0]] : [word])))
  const ticks = { yes: spell([...YES, ...yes]), no: spell([...NO, ...no]) }
  const S = grid.map((line) => Array.from({ length: width }, (_, c) => seen(line[c], how, ticks)))
  // Merged cells lend their words across their first line, and down only within the heads (below); a cell lent is none of its own.
  const lent = new Set()
  const lend = (/** @type {Range} */ m, /** @type {number} */ r) => { for (let c = m.left; c <= Math.min(m.right, width - 1); c++) if ((r > m.top || c > m.left) && S[m.top]?.[m.left]) { S[r][c] = S[m.top][m.left]; lent.add(r * width + c) } }
  for (const m of merges) if (m.top < height) lend(m, m.top)

  // Day or month first, and each column's decimal mark: by what the values show, else by the region.
  let dmy = 0, mdy = 0, unsure = 0
  const marks = Array.from({ length: width }, () => /** @type {Set<string>} */ (new Set()))
  for (const line of S) line.forEach((cell, c) => (cell.kind === 'number' ? cell.proof && marks[c].add(cell.proof) : cell.kind === 'date' && (cell.proof === 'dmy' ? dmy++ : cell.proof === 'mdy' ? mdy++ : cell.alt && unsure++)))
  const dates = { order: dmy && !mdy ? /** @type {const} */ ('dmy') : mdy && !dmy ? /** @type {const} */ ('mdy') : how.order, settled: !unsure || !dmy !== !mdy }
  for (const line of S) line.forEach((cell, c) => { if (cell.alt !== undefined && (cell.kind === 'date' ? dates.order === 'mdy' : cell.mark === (marks[c].size === 1 ? [...marks[c]][0] : how.decimal))) [cell.value, cell.alt] = [cell.alt, undefined] })

  // The heads.
  const filled = (/** @type {number} */ r, /** @type {number} */ c) => S[r][c].kind !== 'empty'
  const sources = (/** @type {number} */ r) => S[r].reduce((n, cell, c) => n + (cell.kind !== 'empty' && cell !== S[r][c - 1] ? 1 : 0), 0)
  // A head is words (not a code of digits, 01200), or a year above the rows: never inside them (1 900 € there is an amount), nor
  // over more years (a column of years).
  const year = (/** @type {Seen} */ cell) => cell.kind === 'number' && Number.isInteger(cell.value) && cell.value >= 1900 && cell.value <= 2100
  const head = (/** @type {Seen} */ cell, inside = false) => (cell.kind === 'text' && !/^\d+$/.test(plain(cell.text ?? ''))) || (!inside && year(cell))
  const wordy = (/** @type {number} */ r) => S[r].some((cell) => cell.kind === 'text') && S[r].every((cell) => cell.kind === 'empty' || cell.word || head(cell))
  /** The kind most of the next twenty cells under one are. @param {number} r @param {number} c */
  const below = (r, c) => {
    /** @type {Record<string, number>} */
    const tally = {}
    let most = ''
    for (let i = r + 1, n = 0; i < height && n < 20; i++) if (filled(i, c)) { n++; tally[S[i][c].kind] = (tally[S[i][c].kind] ?? 0) + 1; if (tally[S[i][c].kind] > (tally[most] ?? 0)) most = S[i][c].kind }
    return most
  }
  /** How many of the columns of numbers, dates, ticks or addresses under a line (or under another) its words name, when they name most; else 0. @param {number} r @param {number} [under] @param {boolean} [inside] */
  const names = (r, under = r, inside = false) => ((typed) => ((named) => (2 * named > typed.length ? named : 0))(typed.filter((c) => head(S[r][c], inside || year(S[next(r)]?.[c] ?? EMPTY))).length))(S[r].map((_, c) => c).filter((c) => !['', 'text'].includes(below(under, c))))
  const lead = (/** @type {number} */ r) => sources(r) >= Math.min(2, width) && wordy(r)
  const next = (/** @type {number} */ r) => { for (let i = r + 1; i < height; i++) if (S[i].some((cell) => cell.kind !== 'empty')) return i; return -1 }
  // Lines labelled heads before any row, part, subtotal or total are the heads (notes above them aside); further down, a part's.
  const said = Object.entries(labels.lines ?? {}).map(([r, label]) => /** @type {[number, string]} */ ([Number(r), label])).sort((a, b) => a[0] - b[0])
  const given = said.slice(0, ((i) => (i < 0 ? said.length : i))(said.findIndex(([, label]) => !['heads', 'note', 'beside'].includes(label)))).filter(([, label]) => label === 'heads').map(([r]) => r)
  const forced = new Map(said.map(([r, label]) => [r, label === 'heads' && !given.includes(r) ? 'section' : label]))
  let heads = -1
  for (let r = 0; r < Math.min(height, 50) && heads < 0; r++) if (lead(r)) heads = r
  // A line of words under it takes its place when it names the same columns of numbers and dates, or, over words alone, twice as many.
  for (let r = next(heads); heads >= 0 && r >= 0 && lead(r) && (names(r, heads) || (!names(heads) && !names(r) && sources(r) >= 2 * sources(heads))); r = next(r)) heads = r
  // Labelled heads join the rules' own line, unless it is labelled otherwise: the last of them names the columns.
  if (given.length) heads = Math.max(forced.has(heads) && !given.includes(heads) ? -1 : heads, ...given)
  // A sheet with no heads holds no table: it is declined, said whole.
  if (heads < 0) return { heads, columns: [], rows: [], from: [], foot: null, dates, shape: 'list', left: S.some((line) => line.some((cell) => cell.kind !== 'empty')) ? [{ why: 'none', where: ref(0, 0, height - 1, width - 1) }] : [], doubts: [] }
  for (const m of merges) for (let r = m.top + 1; r <= Math.min(m.bottom, heads); r++) lend(m, r)

  // One record written over several lines: a figure merged down the rows joins the lines it spans (their words end to end),
  // unless two of them hold a figure of the same column.
  /** @type {Left[]} */
  const left = []
  const joined = new Set()
  const spans = merges.filter((m) => m.top > heads && m.bottom > m.top && S[m.top]?.[m.left]?.kind === 'number').map((m) => [m.top, Math.min(m.bottom, height - 1)]).sort((a, b) => a[0] - b[0])
  for (let i = 0; i < spans.length; i++) {
    let [from, to] = spans[i]
    while (i + 1 < spans.length && spans[i + 1][0] <= to) to = Math.max(to, spans[++i][1])
    const parts = S[from].map((_, c) => S.slice(from, to + 1).map((line) => line[c]).filter((cell, j) => cell.kind !== 'empty' && (!j || !lent.has((from + j) * width + c))))
    if (parts.some((cells) => cells.length > 1 && cells.some((cell) => cell.kind !== 'text'))) continue
    S[from] = parts.map((cells) => (cells.length > 1 ? ((text) => /** @type {Seen} */ ({ kind: 'text', value: text, text }))(cells.map((cell) => /** @type {string} */ (cell.text)).reduce((a, b) => a + (CJK.test(a.at(-1) ?? '') && CJK.test(b[0]) ? '' : ' ') + b)) : cells[0] ?? EMPTY))
    left.push({ why: 'joined', where: ref(from + 1, 0, to, width - 1) })
    for (let r = from + 1; r <= to; r++) { S[r] = S[r].map(() => EMPTY); joined.add(r) }
  }

  // The columns: those holding a cell of their own, across to an empty one whose far side isn't this table's.
  const top = heads + 1, own = (/** @type {number} */ r, /** @type {number} */ c) => filled(r, c) && !lent.has(r * width + c)
  const depth = Array.from({ length: width }, (_, c) => { let n = 0; for (let r = top; r < height; r++) if (own(r, c)) n++; return n })
  const named = (/** @type {number} */ c) => filled(heads, c), used = (/** @type {number} */ c) => depth[c] > 0 || (named(c) && own(heads, c))
  /** @type {number[]} */
  const cols = []
  let beside = width
  for (let c = 0; c < width; c++) {
    if (used(c)) { cols.push(c); continue }
    let far = c, end
    while (far < width && !used(far)) far++
    for (end = far; end < width && used(end);) end++
    if (!cols.length || far === width) continue
    const block = Array.from({ length: end - far }, (_, i) => far + i)
    if (!block.some(named) || 2 * Math.max(...block.map((at) => depth[at])) < Math.max(...cols.map((at) => depth[at]))) { beside = far; break }
    left.push({ why: 'empty', where: ref(Math.max(heads, 0), c, height - 1, far - 1) })
    c = far - 1
  }

  // The lines, in three passes. First, where the table stops: at other heads (the same again are a part's), or at an empty line
  // followed by a line alone.
  const words = (/** @type {number} */ r, /** @type {number} */ c) => /** @type {string} */ (S[r][c].text).replace(/\s+/g, ' ').trim().replace(GAP, '')
  const count = (/** @type {number} */ r) => cols.reduce((n, c, i) => n + (filled(r, c) && S[r][c] !== S[r][cols[i - 1]] ? 1 : 0), 0), across = (/** @type {number} */ r, to = r) => ref(r, cols[0], to, /** @type {number} */ (cols.at(-1)))
  const alone = (/** @type {number} */ r) => count(r) === 1 && cols.every((c) => S[r][c].kind === 'empty' || S[r][c].kind === 'text')
  // A line labelled is as labelled, and the table runs on to the last labelled part of it.
  /** @type {{ r: number, kind: 'line' | 'alone' | 'again' | 'out', gap: boolean }[]} */
  const lines = []
  const reach = Math.max(-1, ...[...forced].filter(([, label]) => !['note', 'beside'].includes(label)).map(([r]) => r))
  let cut = height
  for (let r = top, gap = 0; r < height; r++) {
    if (!count(r)) { if (!joined.has(r)) gap++; continue }
    const fresh = lead(r) && names(r, r, true) >= (gap ? 1 : 2), again = fresh && cols.every((c) => !filled(r, c) || (named(c) && words(r, c) === words(heads, c)))
    if (r > reach && ((fresh && !again) || (gap && alone(r) && ((after) => after !== r + 1 || count(after) < 2 || (lead(after) && names(after)))(next(r))))) { cut = r; break }
    if (gap) left.push({ why: 'empty', where: across(r - gap, r - 1) })
    const label = forced.get(r)
    lines.push({ r, kind: label === 'note' || label === 'beside' ? 'out' : label === 'section' ? 'again' : label ? 'line' : again ? 'again' : alone(r) ? 'alone' : 'line', gap: gap > 0 })
    gap = 0
  }

  // Second, the lines computed from others, by their sums: of the rows just above or below them (totals passed over), the sum or
  // difference of the totals before them (a surplus, a net result), or shares where the column has none. Two figures must agree
  // and none differ, or one with a word for total (then one row may be the sum). Figures rounded to the unit may be off by one each.
  const value = (/** @type {number} */ r, /** @type {number} */ c) => (S[r][c].kind === 'number' ? S[r][c].value : 0)
  const kinds = new Map(lines.map((one) => [one.r, one.kind])), computed = /** @type {Map<number, number>} */ (new Map()), downs = /** @type {number[]} */ ([])
  let onTop = false
  const isRow = (/** @type {number} */ r) => kinds.get(r) === 'line' && !computed.has(r)
  const label = (/** @type {number} */ r) => ((c) => (c === undefined ? '' : words(r, c).toLowerCase().replace(/\u0640/g, '')))(cols.find((c) => S[r][c].kind === 'text'))
  const off = (/** @type {number} */ total, /** @type {number} */ k) => 0.005 + Math.abs(total) * 1e-9 + (Number.isInteger(total) && Math.abs(total) >= 1000 ? Math.min(Math.ceil(k / 2), Math.max(1, Math.abs(total) * 1e-4)) : 0)
  /** Whether a line's numbers are the sums: all of them and two at least; most of them for the foot with a word for total (1); one for a line with that word (2). @param {number} r @param {Float64Array} sums @param {number} k @param {number} evidence */
  const fits = (r, sums, k, evidence) => {
    let hits = 0, misses = 0
    for (const c of cols) if (S[r][c].kind === 'number' && (S[r][c].value || sums[c])) Math.abs(S[r][c].value - sums[c]) <= off(S[r][c].value, k) ? hits++ : misses++
    return evidence > 1 ? hits > 0 : evidence ? hits > misses : hits >= 2 && !misses
  }
  const sum = (/** @type {number} */ from, /** @type {number} */ to) => { const sums = new Float64Array(width); for (let j = from; j <= to; j++) if (isRow(j)) for (const c of cols) sums[c] += value(j, c); return sums }
  /** How many rows just above (dir -1) or below (dir 1) a line is the sum of, 0 for none: one only with a word for total, or on top of it (itself no total) where the sheet puts totals on top of their parts. @param {number} r @param {number} dir @param {number} evidence */
  const run = (r, dir, evidence) => {
    const key = cols.find((c) => value(r, c) !== 0)
    if (key === undefined) return false
    // A column of one sign stops the search once the parts pass the total.
    for (let j = r + dir, v = value(r, key), acc = 0, k = 0; j >= top && j < cut && (evidence > 1 || Math.abs(j - r) <= 300); j += dir) {
      if (!isRow(j)) continue
      acc += value(j, key)
      if (++k >= (evidence > 1 || (dir > 0 && onTop && !TOTAL.test(label(j))) ? 1 : 2) && Math.abs(v - acc) <= off(v, k) && fits(r, sum(Math.min(r + dir, j), Math.max(r + dir, j)), k, evidence)) return k
      if ((!less[key] && acc > v + off(v, k)) || (!more[key] && acc < v - off(v, k))) return 0
    }
    return 0
  }
  const at = (/** @type {number} */ j) => Float64Array.from(S[j], (_, c) => value(j, c))
  /** Whether a line is the sum or the difference of two totals before it (not totals on top of their parts), or of the last one and the row or two since, in the same part (a balance after tax). @param {number} r @param {number} evidence */
  const combines = (r, evidence) => {
    const done = downs.filter((one) => one < r).slice(-5), last = done.at(-1)
    if (last === undefined) return false
    const since = r - last < 9 ? lines.filter((one) => one.r > last && one.r < r) : [], far = r - last >= 9 || since.some((one) => one.kind !== 'line') || since.filter((one) => isRow(one.r)).length > 2
    const pairs = [...done.flatMap((a, i) => done.slice(i + 1).map((b) => [at(a), at(b)])), ...(far ? [] : [[at(last), sum(last + 1, r - 1)]])]
    return pairs.some(([a, b]) => [1, -1].some((sign) => fits(r, a.map((x, c) => x + sign * b[c]), 2, evidence)))
  }
  const items = lines.filter((one) => one.kind === 'line'), pct = new Uint32Array(width), num = new Uint32Array(width), less = new Uint8Array(width), more = new Uint8Array(width)
  for (const { r } of items) for (const c of cols) if (S[r][c].kind === 'number') { num[c]++; if (S[r][c].format === 'percent') pct[c]++; if (S[r][c].value < 0) less[c] = 1; else more[c] = 1 }
  const ratio = (/** @type {number} */ r) => ((nums) => nums.length > 0 && nums.every((c) => S[r][c].format === 'percent' && 2 * pct[c] < num[c]))(cols.filter((c) => S[r][c].kind === 'number'))
  // A line labelled a subtotal or a total is one; labelled a row, never. Those found by sums alone, of a row or two, are kept apart.
  const thin = new Set()
  for (const { r } of items) if (['subtotal', 'total'].includes(forced.get(r) ?? '')) { computed.set(r, -1); downs.push(r) }
  for (let pass = 0, again = true; again && pass < 6; pass++) {
    again = false
    for (const { r } of items) {
      if (computed.has(r) || forced.has(r) || !cols.some((c) => S[r][c].kind === 'number')) continue
      const evidence = TOTAL.test(label(r)) ? 2 : 0, below = run(r, -1, evidence), dir = below || combines(r, evidence) || ratio(r) ? -1 : run(r, 1, evidence) ? 1 : 0
      if (dir && !evidence && below && below <= 2) thin.add(r)
      if (dir) { computed.set(r, dir); again = true; if (dir > 0) onTop = true; else downs.splice(downs.findIndex((one) => one > r) >>> 0, 0, r) }
    }
  }
  // The foot: the first computed line that is the sum of every row above it, followed only by notes, checks or another table's
  // lines (half the columns or fewer); else the last row, when it adds up four or more above it. What follows the foot is below.
  // A line labelled the total is the foot when only notes, checks or another table follow it, as the rules would have it; else a subtotal.
  const after = (/** @type {number} */ r) => lines.every((one) => one.r <= r || ['note', 'beside'].includes(forced.get(one.r) ?? '') || 2 * count(one.r) <= cols.length)
  const totals = items.filter(({ r }) => forced.get(r) === 'total' && after(r))
  let foot = totals.length ? /** @type {number} */ (totals.at(-1)?.r) : items.find(({ r }) => computed.has(r) && !forced.has(r) && fits(r, sum(top, r - 1), items.length, TOTAL.test(label(r)) ? 1 : 0) && after(r))?.r ?? -1
  const last = items.at(-1)?.r
  if (foot < 0 && last !== undefined && isRow(last) && !forced.has(last) && items.filter((one) => one.r < last && isRow(one.r)).length >= 4 && fits(last, sum(top, last - 1), items.length, 1)) computed.set(foot = last, -1)
  const stop = foot >= 0 ? foot + 1 : cut

  // Third, a line alone at the start of a part (or the heads again) is its name; the rest are rows, a line alone after the last
  // a note.
  /** @type {number[]} */
  const rows = []
  let before = 'heads'
  for (const { r, kind, gap } of lines) {
    if (r >= stop) break
    if (gap) before = 'gap'
    if (r === foot) left.push({ why: 'total', where: across(r) })
    else if (kind === 'out') left.push({ why: forced.get(r) === 'note' ? 'below' : 'beside', where: across(r) })
    else if (kind === 'again' || (kind === 'alone' && before !== 'row' && forced.get(r) !== 'row')) { left.push({ why: 'section', where: across(r) }); before = 'section' }
    else if (computed.has(r)) { left.push({ why: 'subtotal', where: across(r) }); before = 'subtotal' }
    else { rows.push(r); before = 'row' }
  }
  for (const after = Math.max(-1, ...[...computed.keys()].filter((r) => r < stop)); foot < 0 && rows.length > 1 && alone(/** @type {number} */ (rows.at(-1))) && !forced.has(/** @type {number} */ (rows.at(-1))) && /** @type {number} */ (rows.at(-1)) > after;) left.push({ why: 'below', where: across(/** @type {number} */ (rows.pop())) })
  if (heads > 0 && S.slice(0, heads).some((line) => line.some((cell) => cell.kind !== 'empty'))) left.push({ why: 'above', where: ref(0, 0, heads - 1, width - 1) })
  if (beside < width) left.push({ why: 'beside', where: ref(Math.max(heads, 0), beside, stop - 1, width - 1) })
  if (S.slice(stop).some((line) => line.some((cell) => cell.kind !== 'empty'))) left.push({ why: 'below', where: ref(stop, 0, height - 1, width - 1) })

  // Each column's kind, name and values.
  const up = heads > 0 && (given.includes(heads - 1) || (!given.length && lead(heads - 1))) ? heads - 1 : -1
  const twice = (/** @type {string} */ name) => cols.filter((c) => named(c) && words(heads, c).toLocaleLowerCase() === name.toLocaleLowerCase()).length > 1
  // A line of units under the heads ($'000 in every column) leaves the names to the line above.
  const units = up >= 0 && cols.filter(named).length > 1 && new Set(cols.filter(named).map((c) => words(heads, c))).size === 1
  /** The words over a head on the line above: its own cell's, else the nearest before it. @param {number} c */
  const over = (c) => { for (let i = c; up >= 0 && i >= cols[0]; i--) if (filled(up, i)) return words(up, i); return '' }
  /** @type {Column[]} */
  const columns = []
  /** @type {unknown[][]} */
  const values = []
  const taken = new Set(), odd = new Uint16Array(rows.length)
  for (const c of cols) {
    const cells = rows.map((r) => S[r][c]), full = cells.filter((cell) => cell.kind !== 'empty')
    // A cell or two with no head, beside few of the rows, is no column.
    const spots = lines.filter((one) => one.r < stop && own(one.r, c)).map((one) => one.r)
    if (!named(c) && spots.length && spots.length <= 2 && spots.length * 5 < rows.length) { for (const r of spots) left.push({ why: 'beside', where: ref(r, c) }); continue }
    if (!full.length && (cells.some((cell) => cell.formula) || !named(c))) {
      if (named(c) || cells.some((cell) => cell.formula)) left.push({ why: 'formula', where: ref(Math.max(heads, 0), c, rows.at(-1) ?? Math.max(heads, 0), c) })
      continue
    }
    /** @type {Record<string, number>} */
    const tally = {}
    for (const cell of full) tally[cell.kind] = (tally[cell.kind] ?? 0) + 1
    const [most, share] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0] ?? ['text', 0]
    // Its name: its head; with none, the words just above it, else its letter; two of a name are told apart by the words over them, else by a number.
    const mine = named(c) ? words(heads, c) : '', base = mine && units && over(c) ? over(c) : mine && twice(mine) && over(c) && over(c) !== mine ? `${over(c)} ${mine}` : mine || (up >= 0 && filled(up, c) ? words(up, c) : letters(c))
    let name = base
    for (let n = 2; taken.has(name.toLocaleLowerCase()); n++) name = `${base} ${n}`
    taken.add(name.toLocaleLowerCase())
    /** @type {Column} */
    const column = { name, type: most === 'text' || share < 0.8 * full.length ? 'text' : most === 'boolean' ? 'checkbox' : /** @type {Column['type']} */ (most), at: c }
    // Numbers written as text that only their last zeros tell apart (1.1 and 1.10) are references; digits of one length with a zero in
    // front, or of five or more that repeat (postcodes), are codes.
    const digits = full.map((cell) => plain(cell.text ?? ''))
    if (column.type === 'number' && ((bare) => new Set(bare.map((cell) => cell.value)).size < new Set(bare.map((cell) => cell.text)).size)(full.filter((cell) => /^\d+[.,]\d+$/.test(cell.text ?? '')))) column.type = 'text'
    if (column.type === 'number' && full.every((cell, i) => (cell.written || cell.kind === 'text') && /^\d+$/.test(digits[i])) && new Set(digits.map((d) => d.length)).size === 1 && (digits.some((d) => d[0] === '0') || (digits[0].length >= 5 && new Set(digits).size < digits.length))) column.type = 'text'
    // Identifiers of thirteen digits or more (a SIRET, a barcode) are no amounts, however they are kept.
    if (column.type === 'number' && full.every((cell) => cell.kind === 'number' && Number.isInteger(cell.value) && Math.abs(cell.value) >= 1e12)) column.type = 'text'
    if (labels.kinds?.[c]) column.type = labels.kinds[c]
    if (column.type === 'number') {
      const numbers = full.filter((cell) => cell.kind === 'number'), format = /** @type {const} */ (['money', 'percent']).find((one) => 2 * numbers.filter((cell) => cell.format === one).length >= numbers.length)
      /** @type {Map<string, number>} */
      const codes = new Map()
      for (const { currency } of numbers) if (currency) codes.set(currency, (codes.get(currency) ?? 0) + 1)
      if (format) column.format = format
      if (format === 'money' && codes.size) column.currency = [...codes].sort((a, b) => b[1] - a[1])[0][0]
    }
    const choices = [...new Set(full.map((cell) => /** @type {string} */ (cell.text)))]
    if (column.type === 'text' && !labels.kinds?.[c] && choices.length < full.length && choices.length * 3 <= full.length * 2 && choices.length <= 30) Object.assign(column, { type: 'select', options: choices })
    if (column.type === 'select') column.options ??= choices
    columns.push(column)
    values.push(cells.map((cell, i) => {
      const fits = cell.kind === 'empty' ? null : column.type === 'text' || column.type === 'select' ? cell.text : cell.kind === (column.type === 'checkbox' ? 'boolean' : column.type) ? cell.value : undefined
      if (fits === undefined || cell.formula) left.push({ why: fits === undefined ? 'value' : 'formula', where: ref(rows[i], c) })
      if (fits === undefined) odd[i]++
      return fits ?? null
    }))
  }
  const all = sum(top, stop - 1)
  const sums = foot < 0 ? null : { at: foot, sums: columns.map(({ at: c }) => ((cell) => (cell.kind === 'number' && Math.abs(cell.value - all[c]) <= off(cell.value, rows.length) ? cell.value : (cell.kind === 'number' && left.push({ why: 'value', where: ref(foot, c) }), null)))(S[foot][c])) }
  const shape = foot >= 0 || left.some((one) => one.why === 'section' || one.why === 'subtotal') ? 'report' : 'list'

  // Doubts, where the rules may be wrong: never on what a brain or the person labelled.
  /** @type {Doubt[]} */
  const doubts = []
  const doubt = (/** @type {Doubt['kind']} */ kind, /** @type {string} */ at, /** @type {string} */ why) => doubts.push({ kind, at, why })
  const typed = columns.filter((one) => !['text', 'select'].includes(one.type)), size = rows.map((r) => columns.filter(({ at: c }) => filled(r, c)).length)
  const middle = [...size].sort((a, b) => a - b)[size.length >> 1] ?? 0, wordy_ = (/** @type {number} */ r) => columns.every(({ at: c }) => !filled(r, c) || S[r][c].kind === 'text')
  rows.forEach((r, i) => {
    if (forced.has(r)) return
    if (odd[i] >= 2 || (odd[i] && 2 * odd[i] >= typed.filter(({ at: c }) => filled(r, c)).length)) doubt('misfit', across(r), 'its cells don\'t fit their columns')
    if (/^\p{L}./u.test(label(r)) && TOTAL.test(label(r).split(' ')[0])) doubt('total', across(r), 'named a total, but its figures add up nothing here')
  })
  for (const r of thin) if (!forced.has(r) && computed.has(r) && r !== foot && ((i) => i > 0 && isRow(lines[i - 1].r) && isRow(lines[i + 1]?.r ?? -1))(lines.findIndex((one) => one.r === r))) doubt('sums', across(r), 'left out as the sum of the row or two above it, among rows like it')
  if (rows.length && rows[0] === lines[0]?.r && !lines[0].gap && !forced.has(rows[0]) && size[0] >= 2 && wordy_(rows[0]) && typed.some(({ at: c }) => filled(rows[0], c))) doubt('words', across(rows[0]), 'words right under the heads: maybe more heads')
  if (foot < 0 && rows.length > 2 && !forced.has(/** @type {number} */ (rows.at(-1))) && (2 * /** @type {number} */ (size.at(-1)) < middle || odd[rows.length - 1])) doubt('end', across(/** @type {number} */ (rows.at(-1))), 'the last row is thin and no total is above it: maybe a note')
  for (const { at: c, type } of columns) if (type === 'number' && !labels.kinds?.[c]) ((r) => r !== undefined && doubt('long', ref(r, c), 'a long string of digits read as a number: maybe a code'))(rows.find((r) => S[r][c].kind === 'number' && Number.isInteger(S[r][c].value) && Math.abs(S[r][c].value) >= 1e12))
  for (const m of merges) if (!given.length && m.top <= heads && m.bottom > heads && m.bottom - m.top < 4 && rows.includes(heads + 1)) { doubt('merged', ref(m.top, m.left, m.bottom, m.right), 'cells merged from the heads into the line below: the heads may take more lines'); break }
  return { heads, columns, rows: rows.map((_, i) => values.map((column) => column[i])), from: rows, foot: sums, dates, shape, left, doubts }
}

