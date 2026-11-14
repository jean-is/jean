// SPDX-License-Identifier: MIT
// Spreadsheets, phase 0a: the twenty sheets the reader is measured on, and one of 10,000 rows for speed, made here as people keep
// them: an association's budget, expenses, members, a small shop's orders and a job search, in English, French, Arabic and
// Japanese. Workbooks are XML parts written by hand and zipped with core/zip.js, as caps/made/formats.js writes Jean's own; CSV
// and tab-separated text in the encodings Excel and LibreOffice save. Each cell says what is written and, where that differs,
// what it means (its truth): the rows a careful person would keep are written beside the files, in .cache/truth.json, for
// scripts/spreadsheets.js to compare a reading with. What is expected of each sheet is in set.js, written by hand.
//   node test/spreadsheets/make.js     writes test/spreadsheets/.cache/ (never committed)
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeZip } from '../../app/core/zip.js'

export const CACHE = fileURLToPath(new URL('./.cache/', import.meta.url))

/**
 * A cell as it is written; truth: what it means, when that isn't its value; reading: how a Japanese word is read, kept beside it
 * as Excel does; runs: its text in parts, as Excel keeps words set in two faces.
 * @typedef {{ kind: 'text' | 'number' | 'date' | 'boolean' | 'formula', value?: string | number | boolean, format?: number | string, formula?: string, reading?: string, runs?: string[], truth?: unknown }} Made
 */
/** @typedef {Made | string | number | boolean | null | undefined} Loose */
/** A row of a table: its cells, or what makes them from its line's number; null an empty line; out: a line that is no row (a section's name, a subtotal). @typedef {Loose[] | ((line: number) => Loose[]) | { out: Loose[] | ((line: number) => Loose[]) } | null} Line */
/** What a careful person keeps of a sheet's main table: where its heads are, its columns' places, each row's place and values. @typedef {{ heads: number, cols: number[], rows: { at: number, values: unknown[] }[], foot: number | null }} Truth */

/** Text, and what it means when it is a number, a date or a tick written in words. @param {string} value @param {unknown} [truth] @returns {Made} */
const T = (value, truth) => ({ kind: 'text', value, ...(truth !== undefined && { truth }) })
/** A number, shown with one of Excel's own formats (its id) or a custom one (its code). @param {number} value @param {number | string} [format] @param {unknown} [truth] @returns {Made} */
const N = (value, format, truth) => ({ kind: 'number', value, format, ...(truth !== undefined && { truth }) })
/** A date kept as a count of days and shown by a date format. @param {string} iso 2026-03-04, or 2026-03-04T14:30 @param {number | string} [format] @returns {Made} */
const D = (iso, format = 14) => ({ kind: 'date', value: iso, format })
/** A formula; without a value, none is kept, as in a file no spreadsheet has opened. @param {string} formula @param {number | string} [value] @param {number | string} [format] @returns {Made} */
const F = (formula, value, format) => ({ kind: 'formula', formula, value, format })
/** A Japanese word with its reading. @param {string} value @param {string} reading @returns {Made} */
const P = (value, reading) => ({ kind: 'text', value, reading })

/** @param {Loose} cell @returns {Made | null} */
const made = (cell) => (cell === null || cell === undefined || cell === '' ? null : typeof cell === 'string' ? T(cell) : typeof cell === 'number' ? N(cell) : typeof cell === 'boolean' ? { kind: 'boolean', value: cell } : cell)
/** @param {Made | null} cell */
const truthOf = (cell) => (!cell ? null : 'truth' in cell ? cell.truth : cell.kind === 'formula' ? cell.value ?? null : cell.value)
/** @param {number[]} values */
const sum = (values) => values.reduce((a, b) => a + b, 0)
/** "A", "B", … "AA". @param {number} index @returns {string} */
const letters = (index) => (index >= 26 ? letters(Math.floor(index / 26) - 1) : '') + String.fromCharCode(65 + (index % 26))

class Grid {
  /** @param {string} [name] @param {{ hidden?: boolean, rtl?: boolean }} [options] */
  constructor(name = 'Sheet1', { hidden = false, rtl = false } = {}) {
    this.name = name
    this.hidden = hidden
    this.rtl = rtl
    /** @type {(Made | null)[][]} */
    this.rows = []
    /** @type {string[]} */
    this.merges = []
    /** @type {Truth | null} */
    this.truth = null
  }

  /** A line of cells. @param {...Loose} cells */
  put(...cells) {
    this.rows.push(cells.map(made))
    return this
  }

  /** Empty lines. @param {number} [n] */
  skip(n = 1) {
    for (let i = 0; i < n; i++) this.rows.push([])
    return this
  }

  /** Cells merged, the first holding their words. @param {...string} refs A1:F1 */
  merge(...refs) {
    this.merges.push(...refs)
    return this
  }

  /** A cell put beside what is written. @param {number} row zero-based @param {number} col @param {Loose} cell */
  set(row, col, cell) {
    while (this.rows.length <= row) this.rows.push([])
    for (let c = this.rows[row].length; c < col; c++) this.rows[row][c] = null
    this.rows[row][col] = made(cell)
    return this
  }

  /**
   * A table: its heads, then its lines; the sheet's first is the one a careful person keeps, its truth written down.
   * @param {Loose[]} heads @param {Line[]} lines
   * @param {{ foot?: Loose[] | ((line: number) => Loose[]), skip?: number[], width?: number }} [options] foot: the line of totals; skip: columns a careful person leaves out (an empty one, formulas without values); width: columns, when the heads name fewer
   */
  table(heads, lines, { foot, skip = [], width = heads.length } = {}) {
    /** @type {Truth} */
    const truth = { heads: this.rows.length, cols: Array.from({ length: width }, (_, c) => c).filter((c) => !skip.includes(c)), rows: [], foot: null }
    this.rows.push(heads.map(made))
    for (const line of lines) {
      const at = this.rows.length
      if (line === null) { this.rows.push([]); continue }
      const out = !Array.isArray(line) && typeof line !== 'function', from = out ? line.out : line
      const cells = (typeof from === 'function' ? from(at + 1) : from).map(made)
      this.rows.push(cells)
      if (!out) truth.rows.push({ at, values: truth.cols.map((c) => truthOf(cells[c] ?? null)) })
    }
    if (foot) {
      truth.foot = this.rows.length
      this.rows.push((typeof foot === 'function' ? foot(this.rows.length + 1) : foot).map(made))
    }
    this.truth ??= truth
    return this
  }
}

// ─── Writing ─────────────────────────────────────────────────────────────────

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE = 'http://schemas.openxmlformats.org/package/2006'
const encoder = new TextEncoder()
/** The truth of the file written last: that of its first sheet not hidden. @type {Truth | null} */
let written = null
/** @param {string} text */
const xml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A date as Excel counts it: days since 30 December 1899, or since 1 January 1904 in a workbook that says so. @param {string} iso @param {boolean} date1904 */
const serial = (iso, date1904) => (Date.parse(iso.length > 10 ? `${iso}:00Z` : `${iso}T00:00:00Z`) - (date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30))) / 864e5

/**
 * A workbook's bytes. @param {Grid[]} sheets
 * @param {{ date1904?: boolean, named?: Record<number, string>, inline?: boolean }} [options] named: the codes Excel writes down for its own money formats, which change with the country; inline: words kept in their cells, as other programs' exports do
 */
async function workbook(sheets, { date1904 = false, named = {}, inline = false } = {}) {
  written = sheets.find((grid) => !grid.hidden)?.truth ?? null
  /** @type {Map<string, number>} */
  const strings = new Map()
  /** @type {Map<number | string, number>} */
  const styles = new Map()
  /** @param {number | string | undefined} format */
  const style = (format) => (format === undefined || format === 0 ? '' : ` s="${styles.get(format) ?? styles.set(format, styles.size + 1).get(format)}"`)
  /** @param {Made} cell */
  const words = (cell) => (cell.runs ? cell.runs.map((run, i) => `<r>${i ? '' : '<rPr><b/></rPr>'}<t xml:space="preserve">${xml(run)}</t></r>`).join('') : `<t xml:space="preserve">${xml(String(cell.value))}</t>`)
    + (cell.reading ? `<rPh sb="0" eb="${String(cell.value).length}"><t>${xml(cell.reading)}</t></rPh><phoneticPr fontId="1"/>` : '')
  /** @param {Made} cell @param {string} ref */
  const one = (cell, ref) => {
    if (cell.kind === 'text' && inline) return `<c r="${ref}" t="inlineStr"><is>${words(cell)}</is></c>`
    if (cell.kind === 'text') return `<c r="${ref}" t="s"><v>${strings.get(words(cell)) ?? strings.set(words(cell), strings.size).get(words(cell))}</v></c>`
    if (cell.kind === 'boolean') return `<c r="${ref}" t="b"><v>${cell.value ? 1 : 0}</v></c>`
    if (cell.kind === 'date') return `<c r="${ref}"${style(cell.format)}><v>${serial(String(cell.value), date1904)}</v></c>`
    if (cell.kind === 'number') return `<c r="${ref}"${style(cell.format)}><v>${cell.value}</v></c>`
    return `<c r="${ref}"${style(cell.format)}${typeof cell.value === 'string' ? ' t="str"' : ''}><f>${xml(cell.formula ?? '')}</f>${cell.value === undefined ? '' : `<v>${xml(String(cell.value))}</v>`}</c>`
  }
  const parts = sheets.map((grid) => {
    const data = grid.rows.map((cells, r) => ((row) => row && `<row r="${r + 1}">${row}</row>`)(cells.map((cell, c) => (cell ? one(cell, `${letters(c)}${r + 1}`) : '')).join(''))).join('')
    return `${HEAD}<worksheet xmlns="${MAIN}"><sheetViews><sheetView workbookViewId="0"${grid.rtl ? ' rightToLeft="1"' : ''}/></sheetViews><sheetData>${data}</sheetData>${
      grid.merges.length ? `<mergeCells count="${grid.merges.length}">${grid.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : ''}</worksheet>`
  })
  const custom = [...styles.keys()].filter((format) => typeof format === 'string')
  const formats = [...Object.entries(named).map(([id, code]) => [id, code]), ...custom.map((code, i) => [164 + i, code])]
  const sheetStyles = `${HEAD}<styleSheet xmlns="${MAIN}">${formats.length ? `<numFmts count="${formats.length}">${formats.map(([id, code]) => `<numFmt numFmtId="${id}" formatCode="${xml(String(code))}"/>`).join('')}</numFmts>` : ''}`
    + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><sz val="6"/><name val="Yu Gothic"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${styles.size + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${[...styles.keys()].map((format) => `<xf numFmtId="${typeof format === 'number' ? format : 164 + custom.indexOf(format)}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join('')}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
  const n = sheets.length
  /** @param {[string, string, string][]} links */
  const rels = (links) => `${HEAD}<Relationships xmlns="${PACKAGE}/relationships">${links.map(([id, type, target]) => `<Relationship Id="${id}" Type="${OFFICE}/${type}" Target="${target}"/>`).join('')}</Relationships>`
  const files = {
    '[Content_Types].xml': `${HEAD}<Types xmlns="${PACKAGE}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${
      [['xl/workbook.xml', 'sheet.main'], ...sheets.map((_, i) => [`xl/worksheets/sheet${i + 1}.xml`, 'worksheet']), ['xl/styles.xml', 'styles'], ...(inline ? [] : [['xl/sharedStrings.xml', 'sharedStrings']])]
        .map(([path, type]) => `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.${type}+xml"/>`).join('')}</Types>`,
    '_rels/.rels': rels([['rId1', 'officeDocument', 'xl/workbook.xml']]),
    'xl/workbook.xml': `${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${OFFICE}"><workbookPr${date1904 ? ' date1904="1"' : ''}/><sheets>${sheets.map((grid, i) => `<sheet name="${xml(grid.name)}" sheetId="${i + 1}"${grid.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': rels([...sheets.map((_, i) => /** @type {[string, string, string]} */ ([`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`])), [`rId${n + 1}`, 'styles', 'styles.xml'], ...(inline ? [] : [/** @type {[string, string, string]} */ ([`rId${n + 2}`, 'sharedStrings', 'sharedStrings.xml'])])]),
    ...Object.fromEntries(parts.map((part, i) => [`xl/worksheets/sheet${i + 1}.xml`, part])),
    'xl/styles.xml': sheetStyles,
    ...(!inline && { 'xl/sharedStrings.xml': `${HEAD}<sst xmlns="${MAIN}" count="${strings.size}" uniqueCount="${strings.size}">${[...strings.keys()].map((si) => `<si>${si}</si>`).join('')}</sst>` }),
  }
  return writeZip(Object.entries(files).map(([name, text]) => ({ name, bytes: encoder.encode(text) })), new Date(Date.UTC(2026, 10, 14)))
}

const CP1252 = new Map(Array.from({ length: 32 }, (_, i) => [new TextDecoder('windows-1252').decode(Uint8Array.of(0x80 + i)), 0x80 + i]))

/**
 * A sheet as text: CSV, or tab-separated. @param {Grid} grid
 * @param {{ sep?: string, encoding?: 'utf-8' | 'windows-1252' | 'utf-16le', bom?: boolean }} [options]
 */
function text(grid, { sep = ',', encoding = 'utf-8', bom = false } = {}) {
  written = grid.truth
  const quoted = (/** @type {string} */ value) => (value.includes(sep) || /["\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
  const width = Math.max(...grid.rows.map((cells) => cells.length))
  const body = grid.rows.map((cells) => Array.from({ length: width }, (_, c) => quoted(cells[c] ? String(cells[c]?.value) : '')).join(sep)).join('\r\n') + '\r\n'
  if (encoding === 'utf-16le') return new Uint8Array(Buffer.from(`\ufeff${body}`, 'utf16le'))
  if (encoding === 'utf-8') return encoder.encode((bom ? '\ufeff' : '') + body)
  return Uint8Array.from([...body].map((char) => {
    const byte = CP1252.get(char) ?? char.charCodeAt(0)
    if (byte > 255) throw new Error(`Windows-1252 has no ${JSON.stringify(char)}`)
    return byte
  }))
}

// ─── Writing as each language does ──────────────────────────────────────────

/** 1 482,35 as French writes it in a file saved as Windows-1252: a no-break space between thousands. @param {number} n @param {number} [digits] */
const fr = (n, digits = 2) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n).replace(/[\u202f\u00a0]/g, '\u00a0')
/** ٤٬٥٠٠٫٠٠, Arabic's own digits and marks. @param {number} n @param {number} [digits] */
const ar = (n, digits = 2) => new Intl.NumberFormat('ar-EG', { numberingSystem: 'arab', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
/** Digits as Arabic writes them. @param {string} text */
const arabic = (text) => text.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])
/** Full-width letters and digits, as a Japanese keyboard types them. @param {string} text */
const wide = (text) => text.replace(/[!-~]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0xfee0))
/** 1,234.50 @param {number} n @param {number} [digits] */
const en = (n, digits = 2) => new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
/** A date written day first, month first, or as words. @param {string} iso @param {'dmy' | 'mdy'} order */
const slashed = (iso, order) => ((y, m, d) => (order === 'dmy' ? `${d}/${m}/${y}` : `${m}/${d}/${y}`))(...(/** @type {[string, string, string]} */ (iso.split('-'))))

// ─── English ─────────────────────────────────────────────────────────────────

/** A community garden's budget kept in Excel: a title across the columns, subtotals by category, formulas, a total, other sheets and a hidden one. */
function enBudget() {
  const USD = 44, DIFF = '"$"#,##0.00;[Red]\\-"$"#,##0.00', SHARE = 10
  const groups = /** @type {[string, [string, number, number | null][]][]} */ ([
    ['Operations', [['Water and utilities', 1800, 1642.18], ['Tool replacement', 650, 712.4]]],
    ['Supplies', [['Compost and soil', 900, 845], ['Seeds and seedlings', 420, 398.75]]],
    ['Maintenance', [['Fence repair', 1500, 1500], ['Shed roof', 2200, 2475.5]]],
    ['Administration', [['Liability insurance', 1150, 1150], ['Website and email', 240, 216], ['Printing and signage', 180, 95.4]]],
    ['Events', [['Spring plant sale', 300, 284.6], ['Harvest festival', 750, null], ['Children\'s workshop', 400, 362.25]]],
  ])
  /** @param {string} name @param {string | null} category @param {number} budget @param {number} actual @param {(col: string, line: number) => string} formula */
  const totals = (name, category, budget, actual, formula) => (/** @type {number} */ r) => [name, category, F(formula('C', r), budget, USD), F(formula('D', r), actual, USD), F(`D${r}-C${r}`, actual - budget, DIFF), F(`D${r}/C${r}`, actual / budget, SHARE)]
  /** @type {Line[]} */
  const lines = []
  /** @type {number[]} */
  const subtotals = []
  let line = 5
  for (const [category, items] of groups) {
    for (const [item, budget, actual] of items) lines.push((r) => [item, category, N(budget, USD), actual === null ? null : N(actual, USD), F(`D${r}-C${r}`, (actual ?? 0) - budget, DIFF), F(`D${r}/C${r}`, (actual ?? 0) / budget, SHARE)])
    const first = line
    line += items.length
    subtotals.push(line++)
    lines.push({ out: totals(`Subtotal — ${category}`, null, sum(items.map((item) => item[1])), sum(items.map((item) => item[2] ?? 0)), (col, r) => `SUM(${col}${first}:${col}${r - 1})`) })
  }
  const all = groups.flatMap(([, items]) => items)
  const budget = new Grid('2026 Budget').put({ kind: 'text', value: 'Riverside Community Garden — 2026 Budget', runs: ['Riverside Community Garden', ' — 2026 Budget'] }).merge('A1:F1').put('Approved at the annual meeting, January 17').skip()
    .table(['Item', 'Category', 'Budget', 'Actual', 'Difference', '% used'], lines, { foot: totals('Total', null, sum(all.map((item) => item[1])), sum(all.map((item) => item[2] ?? 0)), (col) => subtotals.map((r) => `${col}${r}`).join('+')) })
    .skip().put('Figures in US dollars. Actuals as of October 31.')
  const last = new Grid('2025 Actuals').table(['Item', 'Category', 'Actual'], [['Water and utilities', 'Operations', N(1588.4, USD)], ['Compost and soil', 'Supplies', N(790, USD)], ['Liability insurance', 'Administration', N(1095, USD)], ['Harvest festival', 'Events', N(702.15, USD)]])
  const notes = new Grid('Notes').put('Notes for the treasurer').put('Move the shed roof overrun to the reserve fund.').put('Ask the city about the water rate before March.')
  const lists = new Grid('Lists', { hidden: true }).put('Category').put('Operations').put('Supplies').put('Maintenance').put('Administration').put('Events')
  return workbook([budget, last, notes, lists], { named: { 44: '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)' } })
}

/** A treasurer's expenses, saved as CSV by Excel in the United States: dates month first, dollars as text, a refund in brackets, Y and N. */
function enExpenses() {
  const rows = /** @type {[string, string, string, number, string, string, string][]} */ ([
    ['2026-01-14', 'Printer paper and toner', 'Office', 86.4, 'Dana', 'Y', 'Y'], ['2026-01-22', 'Zoom annual plan', 'Software', 149.9, 'Dana', 'Y', 'Y'],
    ['2026-02-03', 'Volunteer lunch', 'Food', 212.75, 'Marcus', 'Y', 'N'], ['2026-02-17', 'Storage unit — February', 'Rent', 1250, 'Priya', 'Y', 'Y'],
    ['2026-02-28', 'Postage', 'Office', 34.2, 'Marcus', 'N', 'N'], ['2026-03-05', 'Banner printing', 'Marketing', 318, 'Priya', 'Y', 'Y'],
    ['2026-03-13', 'Refund — duplicate toner order', 'Office', -43.2, 'Dana', 'Y', 'N'], ['2026-03-19', 'Storage unit — March', 'Rent', 1250, 'Priya', 'Y', 'Y'],
    ['2026-03-27', 'Coffee and snacks', 'Food', 58.15, 'Marcus', 'N', 'N'], ['2026-04-02', 'Domain renewal', 'Software', 21.99, 'Dana', 'Y', 'Y'],
    ['2026-04-16', 'Flyers', 'Marketing', 142.5, 'Priya', 'Y', 'N'], ['2026-04-30', 'Storage unit — April', 'Rent', 1250, 'Priya', 'Y', 'Y'],
  ])
  const dollars = (/** @type {number} */ n) => T(n < 0 ? `($${en(-n)})` : `$${en(n)}`, n)
  const grid = new Grid().table(['Date', 'Description', 'Category', 'Amount', 'Paid by', 'Receipt', 'Reimbursed'],
    rows.map(([date, what, category, amount, by, receipt, back]) => [T(slashed(date, 'mdy'), date), what, category, dollars(amount), by, T(receipt, receipt === 'Y'), T(back, back === 'Y')]),
    { foot: ['Total', null, null, dollars(Number(sum(rows.map((row) => row[3])).toFixed(2)))] })
  return text(grid, { bom: true })
}

/** A walking club's members in the United Kingdom: an empty column, empty lines, two columns named Phone and one with no name, dates as text day first and as dates, pounds. */
function enMembers() {
  const GBP = '[$£-809]#,##0.00'
  const rows = /** @type {([string, string, string, string | null, string, string, string, number, string, string | null, string | null] | null)[]} */ ([
    ['Aitken, Morag', 'morag.aitken@example.org', '01632 960114', null, '2019-03-14', '2026-04-01', 'Adult', 28, 'Yes', 'https://www.example.org/morag', 'Walk leader'],
    ['Banerjee, Anil', 'anil.b@example.com', '07700 900142', '01632 960377', '2021-09-02', '2026-09-01', 'Adult', 28, 'Yes', null, null],
    ['Calder, Ruth', 'ruthcalder@example.co.uk', '07700 900318', null, '2017-01-27', '2026-04-01', 'Concession', 15, 'No', null, 'Prefers post'],
    ['Drummond, Iain', 'iain.drummond@example.org', '+44 7700 900551', null, '2023-05-09', '2026-05-01', 'Family', 45, 'Yes', 'www.example.com/drummonds', null],
    ['Egwu, Chidi', 'chidi@example.net', '01632 960202', null, '2020-06-30', '2026-07-01', 'Adult', 28, 'Yes', null, null],
    null,
    ['Fairlie, Joan', 'joan.fairlie@example.org', '07700 900764', null, '2015-11-11', '2026-04-01', 'Concession', 15, 'Yes', null, 'First aider'],
    ['Gupta, Meera', 'meera.gupta@example.com', '07700 900093', '01632 960480', '2022-02-19', '2026-03-01', 'Family', 45, 'No', 'https://meera.example.com', null],
    ['Hendry, Tom', 'tomhendry@example.co.uk', '01632 960655', null, '2018-10-05', '2026-10-01', 'Adult', 28, 'Yes', null, null],
    ['Imrie, Fiona', 'fiona.imrie@example.org', '+44 7700 900427', null, '2024-08-23', '2026-08-01', 'Adult', 28, 'No', null, 'Joined after the open day'],
    ['Jardine, Alasdair', 'a.jardine@example.net', '07700 900876', null, '2016-04-01', '2026-04-01', 'Concession', 15, 'Yes', null, null],
    null,
    ['Kowalski, Marta', 'marta.kowalski@example.com', '07700 900235', null, '2023-07-17', '2026-07-01', 'Adult', 28, 'Yes', 'https://www.example.org/marta-walks', null],
    ['Laing, Douglas', 'douglas.laing@example.org', '01632 960831', '07700 900609', '2019-12-08', '2026-12-01', 'Family', 45, 'Yes', null, 'Minibus driver'],
    ['Mackie, Shona', 'shona.mackie@example.co.uk', '07700 900958', null, '2025-03-26', '2026-03-01', 'Adult', 28, 'No', null, null],
    ['Nwosu, Grace', 'grace.nwosu@example.com', '+44 7700 900112', null, '2022-09-13', '2026-09-01', 'Concession', 15, 'Yes', null, null],
  ])
  const grid = new Grid('Members').table(['Name', 'Email', 'Phone', 'Phone', null, 'Joined', 'Renewal due', 'Type', 'Fee', 'Paid', 'Website'],
    rows.map((row) => row && [row[0], row[1], row[2], row[3], null, T(slashed(row[4], 'dmy'), row[4]), D(row[5]), row[6], N(row[7], GBP), T(row[8], row[8] === 'Yes'), row[9] && T(row[9], row[9].startsWith('www.') ? `https://${row[9]}` : row[9]), row[10]]),
    { skip: [4], width: 12 })
  return workbook([grid])
}

/** A candle shop's orders, from a Mac's Excel of old (dates counted from 1904) through a tool that keeps words in their cells and no formula's result. */
function enOrders() {
  const DAY = 'd-mmm-yy', USD = 8
  const items = /** @type {Record<string, number>} */ ({ 'Lavender soy candle': 18, 'Cedar & sage candle': 22, 'Beeswax taper pair': 12.5, 'Wax melt sampler': 9.75, 'Gift box — three candles': 48 })
  const rows = /** @type {[number, string, string, string, number, string, boolean, string | null][]} */ ([
    [1041, '2026-01-06', 'Hannah Whitfield', 'Lavender soy candle', 2, 'Paid', true, 'https://track.example.com/p/1Z84A0291'],
    [1042, '2026-01-06', 'Marcus Delgado', 'Gift box — three candles', 1, 'Paid', true, 'https://track.example.com/p/1Z84A0305'],
    [1043, '2026-01-09', 'Yuki Tanabe', 'Wax melt sampler', 3, 'Paid', true, 'https://track.example.com/p/1Z84A0412'],
    [1044, '2026-01-12', 'Olivia Brandt', 'Cedar & sage candle', 1, 'Refunded', false, null],
    [1045, '2026-01-15', 'Samir Haddad', 'Beeswax taper pair', 4, 'Paid', true, 'https://track.example.com/p/1Z84A0533'],
    [1046, '2026-01-19', 'Priya Raman', 'Lavender soy candle', 1, 'Paid', true, 'https://track.example.com/p/1Z84A0610'],
    [1047, '2026-01-23', 'Tom Akers', 'Gift box — three candles', 2, 'Pending', false, null],
    [1048, '2026-01-27', 'Elena Sokolova', 'Cedar & sage candle', 2, 'Paid', true, 'https://track.example.com/p/1Z84A0748'],
    [1049, '2026-02-02', 'Grace Oyelaran', 'Wax melt sampler', 6, 'Paid', true, 'https://track.example.com/p/1Z84A0802'],
    [1050, '2026-02-05', 'Hannah Whitfield', 'Beeswax taper pair', 2, 'Paid', false, null],
    [1051, '2026-02-10', 'Daniel Fischer', 'Lavender soy candle', 3, 'Pending', false, null],
    [1052, '2026-02-13', 'Aiko Mori', 'Gift box — three candles', 1, 'Paid', true, 'https://track.example.com/p/1Z84A0955'],
    [1053, '2026-02-17', 'Marcus Delgado', 'Cedar & sage candle', 1, 'Paid', true, 'https://track.example.com/p/1Z84A1031'],
    [1054, '2026-02-20', 'Nora Lindqvist', 'Wax melt sampler', 2, 'Refunded', false, null],
  ])
  const grid = new Grid('Orders').table(['Order #', 'Date', 'Customer', 'Item', 'Qty', 'Unit price', 'Total', 'Status', 'Shipped', 'Tracking', 'Notes'],
    rows.map(([id, date, customer, item, qty, status, shipped, tracking]) => (/** @type {number} */ r) => [id, D(date, DAY), customer, item, qty, N(items[item], USD), F(`E${r}*F${r}`, undefined, USD), status, shipped, tracking]), { skip: [6] })
  return workbook([grid], { date1904: true, inline: true })
}

/** A job search kept in a text editor, tab-separated: ISO dates, dates in words, dollars, a salary given as a range. */
function enJobs() {
  const rows = /** @type {[string, string, string, string, string | null, string, string | null, number | null, string, string | null, string | null, string | null][]} */ ([
    ['Northwind Analytics', 'Data analyst', '2026-01-08', 'Rejected', 'hiring@northwind.example', 'https://jobs.northwind.example/1182', '$78,000', 78000, 'no', 'Jan 22, 2026', '2026-01-22', null],
    ['Lakeshore Credit Union', 'Reporting analyst', '2026-01-12', 'Interview', 'm.okafor@lakeshorecu.example', 'https://lakeshorecu.example/careers/reporting-analyst', '$72,500', 72500, 'no', 'Feb 2, 2026', '2026-02-02', 'Second round with the CFO'],
    ['Brightpath Learning', 'Operations analyst', '2026-01-15', 'Applied', null, 'https://brightpath.example/jobs/ops-analyst', '$70,000', 70000, 'yes', null, null, null],
    ['City of Fairmont', 'Budget analyst I', '2026-01-20', 'Interview', 'hr@fairmont.example', 'https://fairmont.example/jobs/budget-analyst-i', '$65,000–$75,000', null, 'no', 'Feb 11, 2026', '2026-02-11', 'Panel interview, bring writing sample'],
    ['Harbor Freight Lines', 'Pricing analyst', '2026-01-21', 'Applied', 'talent@harborfreight.example', 'https://harborfreight.example/careers/4471', '$81,000', 81000, 'no', null, null, null],
    ['Meridian Health', 'Data analyst, quality', '2026-01-26', 'Rejected', 'recruiting@meridianhealth.example', 'https://meridianhealth.example/jobs/da-quality', '$84,000', 84000, 'yes', null, null, 'Wanted SQL Server experience'],
    ['Tallgrass Co-op', 'Member data coordinator', '2026-01-29', 'Offer', 'jlund@tallgrass.example', 'https://tallgrass.example/work-with-us', '$68,500', 68500, 'no', 'Feb 20, 2026', '2026-02-20', 'Answer by the 20th'],
    ['Quillfeather Books', 'Sales analyst', '2026-02-03', 'Applied', null, 'https://quillfeather.example/jobs/sales-analyst', null, null, 'yes', null, null, 'No salary listed'],
    ['Pine Ridge Schools', 'Assessment data specialist', '2026-02-06', 'Interview', 'districtoffice@pineridge.example', 'https://pineridge.example/employment/ads', '$66,200', 66200, 'no', 'Feb 18, 2026', '2026-02-18', null],
    ['Solstice Energy', 'Business analyst', '2026-02-10', 'Applied', 'careers@solstice.example', 'https://solstice.example/careers/ba-2', '$90,000', 90000, 'yes', null, null, null],
    ['Ostrander & Wells', 'Research assistant', '2026-02-12', 'Rejected', 'office@ostranderwells.example', 'https://ostranderwells.example/join', '$58,000', 58000, 'no', null, null, null],
    ['Greenline Transit', 'Ridership analyst', '2026-02-17', 'Applied', 'jobs@greenline.example', 'https://greenline.example/jobs/ridership-analyst', '$76,400', 76400, 'no', 'Mar 3, 2026', '2026-03-03', 'Recruiter will call'],
  ])
  const grid = new Grid().table(['Company', 'Role', 'Applied', 'Status', 'Contact', 'Posting', 'Salary', 'Remote', 'Follow up', 'Notes'],
    rows.map(([company, role, applied, status, contact, posting, salary, value, remote, follow, day, notes]) => [company, role, applied, status, contact, posting, salary && T(salary, value), T(remote, remote === 'yes'), follow && T(follow, day), notes]))
  return text(grid, { sep: '\t' })
}

// ─── French ──────────────────────────────────────────────────────────────────

/** A shared garden's budget as French associations keep it: receipts then spending, two tables down one sheet, each under its name, with its total. */
function frBudget() {
  const EUR = '#,##0.00\\ "€"', SHARE = 10
  /** @param {[string, number, number][]} items @param {string} total @param {number} first the first item's line */
  const part = (items, total, first) => /** @type {[Line[], (line: number) => Loose[]]} */ ([
    items.map(([name, planned, real]) => (/** @type {number} */ r) => [name, N(planned, EUR), N(real, EUR), F(`C${r}-B${r}`, real - planned, EUR), F(`C${r}/B${r}`, real / planned, SHARE)]),
    (r) => [total, F(`SUM(B${first}:B${r - 1})`, sum(items.map((item) => item[1])), EUR), F(`SUM(C${first}:C${r - 1})`, sum(items.map((item) => item[2])), EUR), F(`C${r}-B${r}`, sum(items.map((item) => item[2] - item[1])), EUR), F(`C${r}/B${r}`, sum(items.map((item) => item[2])) / sum(items.map((item) => item[1])), SHARE)],
  ])
  const heads = ['Poste', 'Prévu 2026', 'Réalisé', 'Écart', '% réalisé']
  const [receipts, receiptsTotal] = part([['Cotisations des adhérents', 3200, 3480], ['Subvention de la mairie', 2500, 2500], ['Subvention du département', 1200, 800], ['Vente de plants (fête de printemps)', 900, 1042.5], ['Dons', 400, 615], ['Location de parcelles', 1800, 1740]], 'TOTAL RECETTES', 6)
  const [spending, spendingTotal] = part([['Eau', 1400, 1512.3], ['Assurance', 620, 620], ['Outillage', 850, 934.9], ['Semences et plants', 1100, 1065], ['Entretien du local', 1500, 1280], ['Animations et ateliers', 2400, 2215.6], ['Frais bancaires', 130, 141.2], ['Communication', 500, 388]], 'TOTAL DÉPENSES', 17)
  const grid = new Grid('Budget 2026').put('Association Les Jardins du Lavoir — Budget prévisionnel 2026').merge('A1:E1').put('Voté en assemblée générale le 24 janvier 2026').skip()
    .put('RECETTES').merge('A4:E4').table(heads, receipts, { foot: receiptsTotal }).skip(2)
    .put('DÉPENSES').merge('A15:E15').table(heads, spending, { foot: spendingTotal }).skip()
    .put('Résultat', F('B12-B25', 1500, EUR), F('C12-C25', 2020.5, EUR))
  const before = new Grid('Budget 2025').table(['Poste', 'Réalisé 2025'], [['Cotisations des adhérents', N(3150, EUR)], ['Subvention de la mairie', N(2500, EUR)], ['Eau', N(1388.4, EUR)], ['Assurance', N(598, EUR)]])
  return workbook([grid, before])
}

/** A treasurer's expenses exported by a French Excel: semicolons, Windows-1252, decimal commas, euros as text, and dates that no value settles. */
function frExpenses() {
  const rows = /** @type {[string, string, string, number, string, string, number][]} */ ([
    ['2026-01-05', 'Papeterie — ramettes et enveloppes', 'Fournitures', 48.6, 'Hélène', 'Oui', 0.2], ['2026-01-09', 'Location de la salle des fêtes', 'Location', 1250, 'Karim', 'Oui', 0.2],
    ['2026-01-12', 'Timbres', 'Fournitures', 12.9, 'Lucie', 'Non', 0], ['2026-02-03', 'Goûter de l\'assemblée générale', 'Réception', 86.45, 'Lucie', 'Oui', 0.055],
    ['2026-02-07', 'Assurance responsabilité civile', 'Assurance', 214.3, 'Karim', 'Oui', 0], ['2026-02-11', 'Avoir — cartouches retournées', 'Fournitures', -35, 'Hélène', 'Oui', 0.2],
    ['2026-03-02', 'Hébergement du site', 'Internet', 71.88, 'Hélène', 'Oui', 0.2], ['2026-03-06', 'Repas des bénévoles', 'Réception', 163.5, 'Lucie', 'Oui', 0.1],
    ['2026-03-10', 'Impression des affiches', 'Communication', 96, 'Karim', 'Oui', 0.2], ['2026-04-04', 'Frais de tenue de compte', 'Banque', 18.4, 'Hélène', 'Non', 0],
    ['2026-04-08', 'Boissons pour la kermesse', 'Réception', 142.75, 'Lucie', 'Oui', 0.2], ['2026-04-12', 'Affranchissement des convocations', 'Fournitures', 54.52, 'Karim', 'Non', 0],
  ])
  const euros = (/** @type {number} */ n) => T(`${fr(n)}\u00a0€`, n)
  const grid = new Grid().table(['Date', 'Libellé', 'Catégorie', 'Montant', 'Payé par', 'Justificatif', 'TVA'],
    rows.map(([date, what, category, amount, by, proof, vat]) => [T(slashed(date, 'dmy'), date), what, category, euros(amount), by, T(proof, proof === 'Oui'), T(`${fr(vat * 100, vat === 0.055 ? 1 : 0)}\u00a0%`, vat)]),
    { foot: ['Total', null, null, euros(Number(sum(rows.map((row) => row[3])).toFixed(2)))] })
  return text(grid, { sep: ';', encoding: 'windows-1252' })
}

/** A choir's members: a title and a line of two cells above the heads, phone numbers kept as numbers under France's own format, dates as dates, euros, Oui and Non, and a column of x's. */
function frMembers() {
  const EUR = '#,##0.00\\ "€"', DAY = 'dd/mm/yyyy', PHONE = '0#" "##" "##" "##" "##'
  const rows = /** @type {[string, string, string, string, string, string, string, number, string, string | null][]} */ ([
    ['Arnould', 'Béatrice', 'beatrice.arnould@example.fr', '06 12 34 56 78', 'Nantes', 'Soprano', '2019-09-12', 35, 'Oui', 'x'],
    ['Benali', 'Yacine', 'y.benali@example.com', '06 23 45 67 89', 'Rezé', 'Ténor', '2021-09-09', 35, 'Oui', 'x'],
    ['Chevalier', 'Odile', 'odile.chevalier@example.org', '02 40 12 34 56', 'Nantes', 'Alto', '2015-09-10', 35, 'Oui', null],
    ['Delmas', 'Jean-Marc', 'jm.delmas@example.fr', '06 34 56 78 90', 'Saint-Herblain', 'Basse', '2018-09-13', 35, 'Non', 'x'],
    ['Etcheverry', 'Maïté', 'maite.etcheverry@example.com', '07 45 67 89 01', 'Nantes', 'Soprano', '2023-09-14', 20, 'Oui', 'x'],
    ['Fontaine', 'Gaël', 'gael.fontaine@example.org', '06 56 78 90 12', 'Orvault', 'Ténor', '2024-01-18', 20, 'Oui', null],
    ['Guérin', 'Solène', 'solene.guerin@example.fr', '06 67 89 01 23', 'Nantes', 'Alto', '2020-09-10', 35, 'Oui', 'x'],
    ['Hamon', 'Loïc', 'loic.hamon@example.com', '02 40 23 45 67', 'Vertou', 'Basse', '2016-09-08', 35, 'Oui', 'x'],
    ['Isambert', 'Clémence', 'clemence.isambert@example.org', '07 78 90 12 34', 'Nantes', 'Soprano', '2025-09-11', 20, 'Non', 'x'],
    ['Joly', 'Françoise', 'francoise.joly@example.fr', '06 89 01 23 45', 'Rezé', 'Alto', '2012-09-13', 50, 'Oui', null],
    ['Kervella', 'Erwan', 'erwan.kervella@example.com', '06 90 12 34 56', 'Nantes', 'Ténor', '2022-09-08', 35, 'Oui', 'x'],
    ['Lemoine', 'Anaïs', 'anais.lemoine@example.org', '07 01 23 45 67', 'Saint-Herblain', 'Soprano', '2024-09-12', 35, 'Non', 'x'],
    ['Moreau', 'Thierry', 'thierry.moreau@example.fr', '02 40 34 56 78', 'Orvault', 'Basse', '2014-09-11', 50, 'Oui', 'x'],
    ['N\'Diaye', 'Aminata', 'aminata.ndiaye@example.com', '06 11 22 33 44', 'Nantes', 'Alto', '2023-01-19', 35, 'Oui', 'x'],
    ['Olivier', 'Rémi', 'remi.olivier@example.org', '06 22 33 44 55', 'Vertou', 'Ténor', '2019-09-12', 35, 'Oui', null],
    ['Perrin', 'Élodie', 'elodie.perrin@example.fr', '07 33 44 55 66', 'Nantes', 'Soprano', '2021-09-09', 35, 'Oui', 'x'],
  ])
  const grid = new Grid('Adhérents').put('Chorale À Tout Chœur — Adhérents saison 2025-2026').put('Mise à jour :', D('2026-02-16', DAY)).skip()
    .table(['Nom', 'Prénom', 'Courriel', 'Téléphone', 'Ville', 'Pupitre', 'Date d\'adhésion', 'Cotisation', 'Réglée', 'Droit à l\'image'],
      rows.map(([last, first, mail, phone, town, voice, joined, fee, paid, image]) => [last, first, mail, N(Number(phone.replace(/\s/g, '')), PHONE, phone), town, voice, D(joined, DAY), N(fee, EUR), T(paid, paid === 'Oui'), image && T(image, true)]))
  return workbook([grid])
}

/** A potter's orders saved as CSV by LibreOffice in France: semicolons, UTF-8, decimal commas with no currency, a column with no name, a line of totals. */
function frOrders() {
  const rows = /** @type {[string, string, string, string, number, number, number, string, string | null, string | null, string | null][]} */ ([
    ['2026-014', '2026-01-13', 'Atelier Morel', 'Bol à thé en grès', 4, 18.5, 0, 'Payée', 'oui', 'https://suivi.example.fr/colis/8842119', null],
    ['2026-015', '2026-01-16', 'Camille Roussel', 'Assiette plate émaillée', 6, 24, 0.1, 'Payée', 'oui', 'https://suivi.example.fr/colis/8842476', 'cadeau'],
    ['2026-016', '2026-01-21', 'Librairie Le Passage', 'Tasse à expresso', 12, 12, 0.15, 'Payée', 'oui', 'https://suivi.example.fr/colis/8843302', null],
    ['2026-017', '2026-01-24', 'Hugo Lambert', 'Vase soliflore', 1, 32, 0, 'En attente', 'non', null, null],
    ['2026-018', '2026-01-28', 'Inès Carpentier', 'Bol à thé en grès', 2, 18.5, 0, 'Payée', 'oui', 'https://suivi.example.fr/colis/8844018', null],
    ['2026-019', '2026-02-02', 'Restaurant La Tablée', 'Assiette plate émaillée', 24, 24, 0.2, 'Payée', 'oui', 'https://suivi.example.fr/colis/8844950', 'livraison un mardi'],
    ['2026-020', '2026-02-05', 'Maëlle Texier', 'Saladier', 1, 58, 0, 'Annulée', null, null, null],
    ['2026-021', '2026-02-14', 'Camille Roussel', 'Tasse à expresso', 4, 12, 0, 'Payée', 'oui', 'https://suivi.example.fr/colis/8846127', null],
    ['2026-022', '2026-02-17', 'Thomas Besnard', 'Pichet', 1, 45, 0, 'Payée', 'non', null, 'retrait sur place'],
    ['2026-023', '2026-02-19', 'Atelier Morel', 'Vase soliflore', 3, 32, 0.1, 'En attente', 'non', null, null],
    ['2026-024', '2026-02-23', 'Nadia Belkacem', 'Saladier', 2, 58, 0, 'Payée', 'oui', 'https://suivi.example.fr/colis/8847733', null],
    ['2026-025', '2026-02-27', 'Hugo Lambert', 'Bol à thé en grès', 6, 18.5, 0.1, 'Payée', 'oui', 'https://suivi.example.fr/colis/8848405', null],
  ])
  const total = (/** @type {typeof rows[number]} */ row) => Number((row[4] * row[5] * (1 - row[6])).toFixed(2))
  const grid = new Grid().table(['N° commande', 'Date', 'Client', 'Article', 'Quantité', 'Prix unitaire', 'Remise', 'Total TTC', 'Statut', 'Expédiée', 'Suivi'],
    rows.map((row) => [row[0], T(slashed(row[1], 'dmy'), row[1]), row[2], row[3], T(String(row[4]), row[4]), T(fr(row[5]).replace(/\u00a0/g, ' '), row[5]), T(`${Math.round(row[6] * 100)} %`, row[6]), T(fr(total(row)).replace(/\u00a0/g, ' '), total(row)), row[7], row[8] && T(row[8], row[8] === 'oui'), row[9], row[10]]),
    { width: 12, foot: ['Total', null, null, null, T(String(sum(rows.map((row) => row[4]))), 0), null, null, T(fr(sum(rows.map(total))).replace(/\u00a0/g, ' '), 0)] })
  return text(grid, { sep: ';' })
}

/** A job search in Excel: an empty column, empty lines between the months, euros under Excel's French format, a salary to be discussed, interviews written in words, x's. */
function frJobs() {
  const EUR = '#,##0\\ [$€-40C]'
  const rows = /** @type {([string, string, string, string, string, string | null, string, number | string | null, string | null, string | null, string | null, string | null] | null)[]} */ ([
    ['Coopérative Les Halles', 'Chargée de communication', 'Lyon', '2026-01-06', 'Refus', 'recrutement@leshalles.example', 'https://leshalles.example/emplois/communication', 31000, 'x', null, null, null],
    ['Mairie de Villeurbanne', 'Chargée de projets culturels', 'Villeurbanne', '2026-01-09', 'Entretien', 'drh@villeurbanne.example', 'https://villeurbanne.example/offres/1187', 29500, 'x', '22 janvier 2026', '2026-01-22', 'Jury de trois personnes'],
    ['Éditions du Confluent', 'Assistante d\'édition', 'Lyon', '2026-01-14', 'Sans réponse', null, 'https://confluent.example/nous-rejoindre', 'à négocier', null, null, null, null],
    ['Théâtre des Pentes', 'Responsable des publics', 'Lyon', '2026-01-20', 'Entretien', 'administration@theatredespentes.example', 'https://theatredespentes.example/recrutement', 33000, null, '3 février 2026', '2026-02-03', null],
    ['Maison de l\'Écologie', 'Animatrice réseau', 'Télétravail', '2026-01-27', 'Envoyée', 'contact@maison-ecologie.example', 'https://maison-ecologie.example/jobs/animatrice', 28000, null, null, null, null],
    null,
    ['Musée des Tissus', 'Médiatrice culturelle', 'Lyon', '2026-02-02', 'Refus', 'rh@museedestissus.example', 'https://museedestissus.example/emploi/mediation', 27500, 'x', null, null, 'Poste pourvu en interne'],
    ['Agence Trait d\'union', 'Cheffe de projet événementiel', 'Villeurbanne', '2026-02-05', 'Entretien', 'bonjour@traitdunion.example', 'https://traitdunion.example/carrieres', 36000, 'x', '17 février 2026', '2026-02-17', 'Visio puis sur place'],
    ['Université Lumière', 'Chargée de valorisation', 'Bron', '2026-02-10', 'Envoyée', null, 'https://univ-lumiere.example/recrutement/valorisation', 32400, null, null, null, null],
    ['Festival Nuits d\'été', 'Coordinatrice des bénévoles', 'Lyon', '2026-02-12', 'Sans réponse', 'equipe@nuitsdete.example', 'https://nuitsdete.example/rejoindre', 'à négocier', 'x', null, null, 'CDD de six mois'],
    ['Librairie Passages', 'Responsable événements', 'Lyon', '2026-02-18', 'Envoyée', 'contact@librairiepassages.example', 'https://librairiepassages.example/offres', 26800, null, null, null, null],
    null,
    ['Métropole de Lyon', 'Chargée de mission tourisme', 'Lyon', '2026-03-03', 'Entretien', 'emploi@grandlyon.example', 'https://grandlyon.example/offres/tourisme-2026', 34200, null, '19 mars 2026', '2026-03-19', null],
    ['Fondation Bellecour', 'Chargée de mécénat', 'Lyon', '2026-03-05', 'Envoyée', 'candidatures@fondationbellecour.example', 'https://fondationbellecour.example/emplois', 35000, null, null, null, null],
    ['Radio Canut', 'Chargée de production', 'Télétravail', '2026-03-09', 'Envoyée', null, 'https://radiocanut.example/recrute', 25200, null, null, null, 'Temps partiel possible'],
    ['Office du tourisme', 'Conseillère en séjour', 'Villeurbanne', '2026-03-11', 'Sans réponse', 'accueil@ot-villeurbanne.example', 'https://ot-villeurbanne.example/emploi', 24600, 'x', null, null, null],
  ])
  const grid = new Grid('Candidatures').table(['Entreprise', 'Poste', 'Lieu', 'Date de candidature', 'Statut', null, 'Contact', 'Annonce', 'Salaire annuel', 'Relancé', 'Entretien', 'Notes'],
    rows.map((row) => row && [row[0], row[1], row[2], D(row[3]), row[4], null, row[5], row[6], typeof row[7] === 'number' ? N(row[7], EUR) : row[7] && T(row[7], null), row[8] && T(row[8], true), row[9] && T(row[9], row[10]), row[11]]), { skip: [5] })
  return workbook([grid])
}

// ─── Arabic ──────────────────────────────────────────────────────────────────

/** A library friends' budget in Egypt: income then spending down one sheet, the years as numbers in the heads, pounds under Excel's Arabic format. */
function arBudget() {
  const EGP = '#,##0.00\\ [$ج.م.\u200f-C01]', SHARE = '0.0%'
  /** @param {[string, number, number][]} items @param {number} first */
  const part = (items, first) => /** @type {[Line[], (line: number) => Loose[]]} */ ([
    items.map(([name, before, now]) => (/** @type {number} */ r) => [name, N(before, EGP), N(now, EGP), F(`C${r}-B${r}`, now - before, EGP), F(`D${r}/B${r}`, (now - before) / before, SHARE)]),
    (r) => ['الإجمالي', F(`SUM(B${first}:B${r - 1})`, sum(items.map((item) => item[1])), EGP), F(`SUM(C${first}:C${r - 1})`, sum(items.map((item) => item[2])), EGP), F(`C${r}-B${r}`, sum(items.map((item) => item[2] - item[1])), EGP), F(`D${r}/B${r}`, sum(items.map((item) => item[2] - item[1])) / sum(items.map((item) => item[1])), SHARE)],
  ])
  const heads = ['البند', 2025, 2026, 'الفرق', 'نسبة التغير']
  const [income, incomeTotal] = part([['اشتراكات الأعضاء', 18000, 21000], ['تبرعات الأفراد', 12500, 15000], ['منحة وزارة الثقافة', 30000, 30000], ['بيع الكتب المستعملة', 4200, 5600], ['رسوم الورش والدورات', 6800, 9400]], 5)
  const [spending, spendingTotal] = part([['رواتب العاملين', 36000, 39600], ['شراء كتب جديدة', 14000, 16500], ['إيجار القاعة', 9600, 9600], ['كهرباء ومياه', 3100, 3550], ['أنشطة الأطفال', 4300, 6000], ['صيانة وترميم', 2500, 3200], ['مطبوعات ودعاية', 1500, 1800]], 14)
  const grid = new Grid('الموازنة', { rtl: true }).put('جمعية أصدقاء المكتبة العامة — الموازنة السنوية').merge('A1:E1').skip()
    .put('أولاً: الإيرادات').table(heads, income, { foot: incomeTotal }).skip()
    .put('ثانياً: المصروفات').table(heads, spending, { foot: spendingTotal })
  return workbook([grid])
}

/** An association's expenses in Egypt as CSV: Arabic's own digits and marks, dates in words, pounds as text. */
function arExpenses() {
  const months = ['يناير', 'فبراير', 'مارس']
  const rows = /** @type {[string, string, string, number, string, string][]} */ ([
    ['2026-01-03', 'إيجار المقر — يناير', 'إيجار', 4500, 'تحويل بنكي', 'نعم'], ['2026-01-07', 'فاتورة الكهرباء', 'مرافق', 632.5, 'نقدًا', 'نعم'],
    ['2026-01-12', 'أدوات مكتبية وأحبار', 'مستلزمات', 418.75, 'نقدًا', 'نعم'], ['2026-01-19', 'ضيافة اجتماع الجمعية العمومية', 'ضيافة', 950, 'نقدًا', 'لا'],
    ['2026-01-28', 'اشتراك الإنترنت', 'مرافق', 399, 'بطاقة ائتمان', 'نعم'], ['2026-02-03', 'إيجار المقر — فبراير', 'إيجار', 4500, 'تحويل بنكي', 'نعم'],
    ['2026-02-09', 'طباعة ملصقات معرض الكتاب', 'دعاية', 1275, 'تحويل بنكي', 'نعم'], ['2026-02-15', 'مواصلات المتطوعين', 'مواصلات', 310, 'نقدًا', 'لا'],
    ['2026-02-22', 'صيانة التكييف', 'صيانة', 1850, 'نقدًا', 'نعم'], ['2026-03-03', 'إيجار المقر — مارس', 'إيجار', 4500, 'تحويل بنكي', 'نعم'],
    ['2026-03-11', 'فاتورة المياه', 'مرافق', 187.25, 'نقدًا', 'نعم'], ['2026-03-24', 'هدايا تكريم المتطوعين', 'ضيافة', 2240, 'بطاقة ائتمان', 'لا'],
  ])
  const pounds = (/** @type {number} */ n) => T(`${ar(n)} ج.م`, n)
  const grid = new Grid().table(['التاريخ', 'البيان', 'الفئة', 'المبلغ', 'طريقة الدفع', 'يوجد إيصال'],
    rows.map(([date, what, category, amount, how, receipt]) => [T(`${arabic(String(Number(date.slice(8))))} ${months[Number(date.slice(5, 7)) - 1]} ${arabic(date.slice(0, 4))}`, date), what, category, pounds(amount), how, T(receipt, receipt === 'نعم')]),
    { foot: ['الإجمالي', null, null, pounds(sum(rows.map((row) => row[3])))] })
  return text(grid, { bom: true })
}

/** A reading club's members in Egypt: a hidden sheet of lists first, a title across the columns, an empty column, dates counted from 1904, phones in both kinds of digits. */
function arMembers() {
  const EGP = '[$EGP] #,##0.00', DAY = 'dd/mm/yyyy'
  const rows = /** @type {[string, string, string, string, string, number, string][]} */ ([
    ['منى عبد الرحمن', 'mona.abdelrahman@example.com', '0100 123 4567', '2023-09-14', 'عادي', 600, 'نعم'], ['كريم السيد', 'karim.elsayed@example.org', arabic('0111 234 5678'), '2022-02-03', 'طالب', 300, 'نعم'],
    ['هبة مصطفى', 'heba.mostafa@example.net', '0122 345 6789', '2024-01-21', 'عادي', 600, 'لا'], ['يوسف إبراهيم', 'youssef.ibrahim@example.com', '0100 456 7890', '2021-10-09', 'عائلي', 1000, 'نعم'],
    ['سلمى حسن', 'salma.hassan@example.org', arabic('0155 567 8901'), '2025-03-16', 'طالب', 300, 'نعم'], ['أحمد فؤاد', 'ahmed.fouad@example.com', '0106 678 9012', '2020-11-28', 'عادي', 600, 'نعم'],
    ['نهى الشريف', 'noha.elsherif@example.net', '0127 789 0123', '2023-05-07', 'عائلي', 1000, 'لا'], ['طارق عبد الله', 'tarek.abdallah@example.com', '0112 890 1234', '2019-09-15', 'عادي', 600, 'نعم'],
    ['دينا رمضان', 'dina.ramadan@example.org', arabic('0101 901 2345'), '2024-10-02', 'طالب', 300, 'نعم'], ['محمود الجندي', 'mahmoud.elgendy@example.com', '0128 012 3456', '2022-06-19', 'عادي', 600, 'نعم'],
    ['رانيا سليمان', 'rania.soliman@example.net', '0109 135 2468', '2021-01-30', 'عائلي', 1000, 'نعم'], ['عمر خليل', 'omar.khalil@example.com', '0114 246 3579', '2025-02-13', 'طالب', 300, 'لا'],
    ['ليلى عثمان', 'laila.osman@example.org', '0120 357 4680', '2020-03-22', 'عادي', 600, 'نعم'], ['حسام نصر', 'hossam.nasr@example.com', arabic('0102 468 5791'), '2023-12-05', 'عادي', 600, 'نعم'],
  ])
  const lists = new Grid('قوائم', { hidden: true, rtl: true }).put('نوع العضوية', 'الاشتراك').put('عادي', 600).put('طالب', 300).put('عائلي', 1000)
  const grid = new Grid('الأعضاء', { rtl: true }).put(`نادي القراءة — سجل الأعضاء ${arabic('2026')}`).merge('A1:I1').skip()
    .table(['م', 'الاسم', 'البريد الإلكتروني', 'الهاتف', 'تاريخ الانضمام', null, 'نوع العضوية', 'الاشتراك', 'مسدد'],
      rows.map(([name, mail, phone, joined, kind, fee, paid], i) => [i + 1, name, mail, T(phone, phone.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))), D(joined, DAY), null, kind, N(fee, EGP), T(paid, paid === 'نعم')]), { skip: [5] })
  const notes = new Grid('ملاحظات', { rtl: true }).put('يُجدَّد الاشتراك في سبتمبر من كل عام.').put('خصم الطلاب يتطلب صورة من بطاقة الجامعة.')
  return workbook([lists, grid, notes], { date1904: true })
}

/** A sweets shop's orders in Egypt: dates with their hour, a column of formulas with their results, an empty column and an empty line, ticks, delivery days as ISO text, a line of totals. */
function arOrders() {
  const STAMP = 'dd/mm/yyyy hh:mm', PRICE = '#,##0.00', EGP = '#,##0.00 "ج.م"'
  const items = /** @type {Record<string, number>} */ ({ 'كنافة بالقشطة': 180, 'بسبوسة': 95, 'بقلاوة مشكلة': 240, 'قطايف': 120, 'أم علي': 65 })
  const rows = /** @type {([number, string, string, string, number, string, string | null, string, string | null] | null)[]} */ ([
    [5021, '2026-03-01T10:15', 'مها عبد العزيز', 'كنافة بالقشطة', 2, 'مدفوع', '✓', '2026-03-02', 'https://tawseel.example/t/EG55021'],
    [5022, '2026-03-01T12:40', 'شريف منصور', 'بقلاوة مشكلة', 1.5, 'مدفوع', '✓', '2026-03-02', 'https://tawseel.example/t/EG55022'],
    [5023, '2026-03-02T09:05', 'نادين فهمي', 'بسبوسة', 3, 'عند الاستلام', '✓', '2026-03-03', 'https://tawseel.example/t/EG55023'],
    [5024, '2026-03-02T17:30', 'خالد يوسف', 'قطايف', 2, 'ملغي', null, '2026-03-04', null],
    [5025, '2026-03-03T11:20', 'إيمان صبري', 'أم علي', 6, 'مدفوع', '✓', '2026-03-03', 'https://tawseel.example/t/EG55025'],
    [5026, '2026-03-04T14:00', 'مها عبد العزيز', 'بقلاوة مشكلة', 2, 'مدفوع', '✓', '2026-03-05', 'https://tawseel.example/t/EG55026'],
    [5027, '2026-03-05T16:45', 'وليد سامي', 'كنافة بالقشطة', 1, 'عند الاستلام', null, '2026-03-07', null],
    null,
    [5028, '2026-03-08T10:30', 'ريم الطحان', 'قطايف', 4, 'مدفوع', '✓', '2026-03-09', 'https://tawseel.example/t/EG55028'],
    [5029, '2026-03-08T13:10', 'شريف منصور', 'بسبوسة', 2, 'مدفوع', '✓', '2026-03-09', 'https://tawseel.example/t/EG55029'],
    [5030, '2026-03-09T18:25', 'جيهان مراد', 'أم علي', 10, 'عند الاستلام', null, '2026-03-11', null],
    [5031, '2026-03-10T09:50', 'باسم حلمي', 'كنافة بالقشطة', 3, 'مدفوع', '✓', '2026-03-11', 'https://tawseel.example/t/EG55031'],
    [5032, '2026-03-11T15:35', 'نادين فهمي', 'بقلاوة مشكلة', 1, 'ملغي', null, '2026-03-12', null],
    [5033, '2026-03-12T12:00', 'سارة النجار', 'قطايف', 2.5, 'مدفوع', '✓', '2026-03-13', 'https://tawseel.example/t/EG55033'],
  ])
  const real = /** @type {Exclude<typeof rows[number], null>[]} */ (rows.filter(Boolean))
  const grid = new Grid('الطلبات', { rtl: true }).table(['رقم الطلب', 'التاريخ', 'العميل', 'الصنف', 'الكمية', 'سعر الوحدة', 'الإجمالي', null, 'الحالة', 'تم التوصيل', 'موعد التسليم', 'رابط التتبع'],
    rows.map((row) => row && ((/** @type {number} */ r) => [row[0], D(row[1], STAMP), row[2], row[3], row[4], N(items[row[3]], PRICE), F(`E${r}*F${r}`, row[4] * items[row[3]], EGP), null, row[5], row[6] && T(row[6], true), row[7], row[8]])),
    { skip: [7], foot: (r) => ['الإجمالي', null, null, null, F(`SUM(E2:E${r - 1})`, sum(real.map((row) => row[4]))), null, F(`SUM(G2:G${r - 1})`, sum(real.map((row) => row[4] * items[row[3]])), EGP)] })
  return workbook([grid])
}

/** A job search in Egypt as CSV: dates day first in Arabic's digits, salaries in both kinds of digits with the pound's sign or its code, one that depends on experience. */
function arJobs() {
  const rows = /** @type {[string, string, string, string, string | null, string, string | null, number | null, string, string | null][]} */ ([
    ['شركة النيل للبرمجيات', 'محلل بيانات', '2026-01-14', 'تم التقديم', 'hr@nilesoft.example', 'https://nilesoft.example/jobs/212', `${ar(18000, 0)} ج.م`, 18000, 'لا', null],
    ['بنك الدلتا', 'محلل ائتمان', '2026-01-18', 'مقابلة', 'careers@deltabank.example', 'https://deltabank.example/careers/credit-analyst', '22,000 EGP', 22000, 'لا', 'المقابلة الثانية مع مدير الإدارة'],
    ['مؤسسة رواق للنشر', 'محرر محتوى', '2026-01-22', 'مرفوض', 'jobs@rewaq.example', 'https://rewaq.example/join', `${ar(12500, 0)} ج.م`, 12500, 'نعم', null],
    ['أكاديمية المستقبل', 'منسق برامج تدريبية', '2026-01-27', 'تم التقديم', null, 'https://mostaqbal.example/vacancies/88', 'حسب الخبرة', null, 'لا', null],
    ['مستشفى السلام التخصصي', 'محلل نظم معلومات', '2026-02-02', 'مقابلة', 'recruitment@alsalam-hospital.example', 'https://alsalam-hospital.example/jobs/is-analyst', `${ar(20000, 0)} ج.م`, 20000, 'لا', 'إحضار أصل الشهادات'],
    ['شركة واحة للتجارة الإلكترونية', 'محلل أداء المبيعات', '2026-02-05', 'عرض عمل', 'talent@waha.example', 'https://waha.example/careers/sales-analyst', '25,000 EGP', 25000, 'نعم', 'الرد قبل نهاية الشهر'],
    ['جمعية رسالة أمل', 'مسؤول متابعة وتقييم', '2026-02-11', 'تم التقديم', 'info@resalet-amal.example', 'https://resalet-amal.example/jobs', `${ar(14000, 0)} ج.م`, 14000, 'لا', null],
    ['مجموعة الفيروز للمقاولات', 'محاسب تكاليف', '2026-02-16', 'مرفوض', 'hr@alfayrouz.example', 'https://alfayrouz.example/careers/cost-accountant', `${ar(16500, 0)} ج.م`, 16500, 'لا', null],
    ['منصة درايتي التعليمية', 'محلل بيانات تعليمية', '2026-02-19', 'مقابلة', 'join@derayty.example', 'https://derayty.example/work/data', '21,500 EGP', 21500, 'نعم', null],
    ['الشركة المتحدة للأدوية', 'أخصائي تقارير', '2026-02-24', 'تم التقديم', 'careers@united-pharma.example', 'https://united-pharma.example/jobs/reporting', null, null, 'لا', 'لم يُذكر الراتب'],
    ['مكتبة الإسكندرية الجديدة', 'أخصائي إحصاء', '2026-03-01', 'تم التقديم', 'employment@newbibalex.example', 'https://newbibalex.example/employment/statistics', `${ar(15000, 0)} ج.م`, 15000, 'لا', null],
    ['ستارت أب كايرو', 'محلل منتجات', '2026-03-04', 'مقابلة', 'people@startupcairo.example', 'https://startupcairo.example/careers/product-analyst', `${ar(24000, 0)} ج.م`, 24000, 'نعم', null],
  ])
  const grid = new Grid().table(['الشركة', 'الوظيفة', 'تاريخ التقديم', 'الحالة', 'البريد الإلكتروني', 'الرابط', 'الراتب المتوقع', 'عن بُعد', 'ملاحظات'],
    rows.map(([company, role, date, status, mail, link, pay, value, remote, notes]) => [company, role, T(arabic(slashed(date, 'dmy')), date), status, mail, link, pay && T(pay, value), T(remote, remote === 'نعم'), notes]))
  return text(grid)
}

// ─── Japanese ────────────────────────────────────────────────────────────────

/** A neighbourhood association's budget as Japan's are laid out: the unit said once at the top, income and spending as parts of one table, each with its total, a triangle for less. */
function jaBudget() {
  const YEN = 3, CHANGE = '#,##0;"△ "#,##0'
  /** @param {[string, string, number, number, string?][]} items @param {string} total @param {number} first */
  const part = (items, total, first) => /** @type {Line[]} */ ([
    ...items.map(([name, reading, before, now, note]) => (/** @type {number} */ r) => [P(name, reading), N(before, YEN), N(now, YEN), F(`C${r}-B${r}`, now - before, CHANGE), note]),
    { out: (/** @type {number} */ r) => [total, F(`SUM(B${first}:B${r - 1})`, sum(items.map((item) => item[2])), YEN), F(`SUM(C${first}:C${r - 1})`, sum(items.map((item) => item[3])), YEN), F(`C${r}-B${r}`, sum(items.map((item) => item[3] - item[2])), CHANGE)] },
  ])
  const grid = new Grid('予算書').put('令和8年度 さくら台町内会 収支予算書').merge('A1:E1').put(null, null, null, null, '（単位：円）')
    .table(['科目', '前年度予算額', '本年度予算額', '増減', '備考'], [
      { out: ['収入の部'] },
      ...part([['会費', 'カイヒ', 1440000, 1464000, '月額500円×244世帯'], ['市補助金', 'シホジョキン', 250000, 250000], ['資源回収報奨金', 'シゲンカイシュウホウショウキン', 86000, 90000], ['夏祭り協賛金', 'ナツマツリキョウサンキン', 120000, 100000], ['前年度繰越金', 'ゼンネンドクリコシキン', 312450, 287300], ['雑収入', 'ザッシュウニュウ', 5000, 5000]], '収入合計', 5),
      { out: ['支出の部'] },
      ...part([['防犯灯電気料', 'ボウハントウデンキリョウ', 180000, 186000], ['夏祭り費', 'ナツマツリヒ', 420000, 400000], ['防災訓練費', 'ボウサイクンレンヒ', 90000, 110000, '備蓄品の更新'], ['清掃活動費', 'セイソウカツドウヒ', 60000, 60000], ['会館維持費', 'カイカンイジヒ', 350000, 365000], ['慶弔費', 'ケイチョウヒ', 50000, 50000], ['事務費', 'ジムヒ', 75000, 72000], ['予備費', 'ヨビヒ', 988450, 953300]], '支出合計', 13),
    ])
  return workbook([grid])
}

/** An expense claim in Japan: a title, a line of the claimant's name and section, dates as dates in Japanese, yen under Excel's format, the tax rate, circles and crosses, and the sums by kind in a small table beside. */
function jaExpenses() {
  const DAY = 'yyyy"年"m"月"d"日"', YEN = '[$¥-411]#,##0', SHARE = 9
  const rows = /** @type {[string, string, string, string, number, number, string][]} */ ([
    ['2026-02-02', '新宿→横浜 往復', 'JR東日本', '交通費', 1140, 0.1, '○'], ['2026-02-03', '取引先との打ち合わせ（コーヒー）', 'カフェ・ド・ミナト', '会議費', 1320, 0.1, '○'],
    ['2026-02-05', 'コピー用紙 A4 5冊', 'オフィスサプライ東京', '消耗品費', 2178, 0.1, '○'], ['2026-02-06', '弁当（社内勉強会）', 'キッチンさくら', '会議費', 5400, 0.08, '○'],
    ['2026-02-09', 'タクシー（深夜帰宅）', '東都交通', '交通費', 3900, 0.1, '×'], ['2026-02-12', 'モバイルWi-Fi 2月分', 'ミナトモバイル', '通信費', 4268, 0.1, '○'],
    ['2026-02-13', '品川→名古屋 新幹線', 'JR東海', '交通費', 10560, 0.1, '○'], ['2026-02-13', '名古屋市内 地下鉄', '名古屋市交通局', '交通費', 480, 0.1, '×'],
    ['2026-02-17', 'ボールペン・付箋', 'オフィスサプライ東京', '消耗品費', 946, 0.1, '○'], ['2026-02-20', '切手・レターパック', '日本郵便', '通信費', 1890, 0.1, '○'],
    ['2026-02-24', 'お茶・菓子（来客用）', 'スーパー丸栄', '会議費', 1620, 0.08, '○'], ['2026-02-26', '東京→大宮 往復', 'JR東日本', '交通費', 1100, 0.1, '○'],
  ])
  const grid = new Grid('経費精算').put('経費精算書（2026年2月分）').put('氏名：', '佐藤 美咲', '部署：', '営業部').skip()
    .table(['日付', '内容', '支払先', '区分', '金額', '税率', '領収書'], rows.map(([date, what, where, kind, amount, tax, receipt]) => [D(date, DAY), what, where, kind, N(amount, YEN), N(tax, SHARE), T(receipt, receipt === '○')]),
      { foot: (r) => ['合計', null, null, null, F(`SUM(E5:E${r - 1})`, sum(rows.map((row) => row[4])), YEN)] })
  const kinds = [...new Set(rows.map((row) => row[3]))]
  grid.set(4, 8, '区分').set(4, 9, '小計')
  kinds.forEach((kind, i) => grid.set(5 + i, 8, kind).set(5 + i, 9, F(`SUMIF(D5:D16,I${6 + i},E5:E16)`, sum(rows.filter((row) => row[3] === kind).map((row) => row[4])), YEN)))
  return workbook([grid])
}

/** A tennis circle's members in Japan: heads on two lines with cells merged across and down, names with their readings kept by Excel, a phone typed full-width, a hidden sheet. */
function jaMembers() {
  const DAY = 'yyyy/m/d', YEN = '"¥"#,##0'
  const rows = /** @type {[string, string, string, string, string, number, string][]} */ ([
    ['山田 太郎', 'ヤマダ タロウ', 'taro.yamada@example.jp', '090-1234-5678', '2019-04-07', 6000, 'はい'], ['佐藤 美咲', 'サトウ ミサキ', 'misaki.sato@example.com', '080-2345-6789', '2021-04-11', 6000, 'はい'],
    ['鈴木 健一', 'スズキ ケンイチ', 'kenichi.suzuki@example.jp', '090-3456-7890', '2017-10-01', 6000, 'いいえ'], ['高橋 由美子', 'タカハシ ユミコ', 'yumiko.takahashi@example.org', '070-4567-8901', '2023-04-09', 3000, 'はい'],
    ['田中 翔', 'タナカ ショウ', 'sho.tanaka@example.com', wide('090-5678-9012'), '2024-06-02', 3000, 'はい'], ['伊藤 さくら', 'イトウ サクラ', 'sakura.ito@example.jp', '080-6789-0123', '2022-04-10', 6000, 'はい'],
    ['渡辺 大輔', 'ワタナベ ダイスケ', 'daisuke.watanabe@example.org', '090-7890-1234', '2016-04-03', 6000, 'いいえ'], ['中村 真由美', 'ナカムラ マユミ', 'mayumi.nakamura@example.com', '080-8901-2345', '2020-09-06', 6000, 'はい'],
    ['小林 誠', 'コバヤシ マコト', 'makoto.kobayashi@example.jp', '090-9012-3456', '2018-04-08', 6000, 'はい'], ['加藤 千尋', 'カトウ チヒロ', 'chihiro.kato@example.org', '070-0123-4567', '2025-04-06', 3000, 'いいえ'],
    ['吉田 隆', 'ヨシダ タカシ', 'takashi.yoshida@example.com', '090-1357-2468', '2015-04-05', 6000, 'はい'], ['山本 恵', 'ヤマモト メグミ', 'megumi.yamamoto@example.jp', '080-2468-1357', '2023-10-01', 6000, 'はい'],
  ])
  const grid = new Grid('名簿').put('緑ヶ丘テニスサークル 会員名簿').merge('A1:H1').skip()
    .put('No.', '氏名', 'フリガナ', '連絡先', null, '入会日', '会費').merge('A3:A4', 'B3:B4', 'C3:C4', 'D3:E3', 'F3:F4', 'G3:H3')
    .table([null, null, null, 'メール', '電話', null, '年額', '納入済'], rows.map(([name, reading, mail, phone, joined, fee, paid], i) => [i + 1, P(name, reading), reading, mail, T(phone, phone.normalize('NFKC')), D(joined, DAY), N(fee, YEN), T(paid, paid === 'はい')]))
  const settings = new Grid('設定', { hidden: true }).put('会費', '年額').put('一般', 6000).put('学生', 3000)
  return workbook([grid, settings])
}

/** A homeware shop's orders in Japan: order times, customers' names with their readings, a column of formulas with their results, circles for shipped, two columns named the same, an empty line, a line of totals. */
function jaOrders() {
  const STAMP = 'yyyy/m/d h:mm', YEN = '"¥"#,##0'
  const items = /** @type {Record<string, number>} */ ({ '波佐見焼マグカップ': 2420, 'リネンのエプロン': 4950, '真鍮のペーパーナイフ': 3300, '木製カトラリーセット': 2860, '和紙のレターセット': 1320 })
  const rows = /** @type {([string, string, string, string, string, number, string, string | null, string | null, string | null, string | null] | null)[]} */ ([
    ['A-1024', '2026-01-08T09:12', '石井 恵子', 'イシイ ケイコ', '波佐見焼マグカップ', 2, 'クレジットカード', '○', 'https://tsuiseki.example.jp/n/4406118251', null, null],
    ['A-1025', '2026-01-08T21:47', '森 拓也', 'モリ タクヤ', 'リネンのエプロン', 1, '銀行振込', '○', 'https://tsuiseki.example.jp/n/4406118366', 'ギフト包装', null],
    ['A-1026', '2026-01-11T13:05', '藤田 奈々', 'フジタ ナナ', '和紙のレターセット', 3, 'クレジットカード', '○', 'https://tsuiseki.example.jp/n/4406119402', null, null],
    ['A-1027', '2026-01-14T10:30', '岡田 浩', 'オカダ ヒロシ', '真鍮のペーパーナイフ', 1, '代金引換', '○', 'https://tsuiseki.example.jp/n/4406120077', null, '再注文のお客様'],
    ['A-1028', '2026-01-17T18:22', '長谷川 彩', 'ハセガワ アヤ', '木製カトラリーセット', 2, 'クレジットカード', '○', 'https://tsuiseki.example.jp/n/4406121593', null, null],
    ['A-1029', '2026-01-22T08:55', '石井 恵子', 'イシイ ケイコ', 'リネンのエプロン', 1, 'クレジットカード', '○', 'https://tsuiseki.example.jp/n/4406123010', '配達は午前中希望', null],
    ['A-1030', '2026-01-27T15:40', '村上 智', 'ムラカミ サトシ', '波佐見焼マグカップ', 4, '銀行振込', null, null, null, '入金待ち'],
    null,
    ['A-1031', '2026-02-02T11:18', '近藤 真理', 'コンドウ マリ', '和紙のレターセット', 5, 'クレジットカード', '○', 'https://tsuiseki.example.jp/n/4406127745', null, null],
    ['A-1032', '2026-02-04T20:03', '坂本 涼', 'サカモト リョウ', '木製カトラリーセット', 1, '代金引換', '○', 'https://tsuiseki.example.jp/n/4406128319', null, null],
    ['A-1033', '2026-02-07T12:26', '森 拓也', 'モリ タクヤ', '真鍮のペーパーナイフ', 2, 'クレジットカード', '○', 'https://tsuiseki.example.jp/n/4406129884', 'ギフト包装', null],
    ['A-1034', '2026-02-10T16:51', '遠藤 美穂', 'エンドウ ミホ', '波佐見焼マグカップ', 1, 'クレジットカード', null, null, null, null],
    ['A-1035', '2026-02-13T09:37', '青木 健', 'アオキ ケン', 'リネンのエプロン', 2, '銀行振込', '○', 'https://tsuiseki.example.jp/n/4406132206', null, '領収書同封'],
    ['A-1036', '2026-02-16T14:09', '藤田 奈々', 'フジタ ナナ', '木製カトラリーセット', 1, 'クレジットカード', '○', 'https://tsuiseki.example.jp/n/4406133571', null, null],
    ['A-1037', '2026-02-19T19:44', '西村 香織', 'ニシムラ カオリ', '和紙のレターセット', 2, '代金引換', null, null, '2月25日以降に発送', null],
  ])
  const real = /** @type {Exclude<typeof rows[number], null>[]} */ (rows.filter(Boolean))
  const grid = new Grid('受注一覧').table(['注文番号', '注文日時', 'お客様名', '商品名', '数量', '単価', '金額', '支払方法', '発送済', '追跡URL', '備考', '備考'],
    rows.map((row) => row && ((/** @type {number} */ r) => [row[0], D(row[1], STAMP), P(row[2], row[3]), row[4], row[5], N(items[row[4]], YEN), F(`E${r}*F${r}`, row[5] * items[row[4]], YEN), row[6], row[7] && T(row[7], true), row[8], row[9], row[10]])),
    { foot: (r) => ['合計', null, null, null, F(`SUM(E2:E${r - 1})`, sum(real.map((row) => row[5]))), null, F(`SUM(G2:G${r - 1})`, sum(real.map((row) => row[5] * items[row[4]])), YEN)] })
  return workbook([grid])
}

/** A job search in Japan saved from Excel as Unicode text: UTF-16, tabs, dates as 2026年1月9日 and typed full-width, yen with its sign and in ten-thousands. */
function jaJobs() {
  const rows = /** @type {[string, string, string, string, string | null, string, string | null, number | null, string, string | null, string | null, string | null][]} */ ([
    ['株式会社ミナト商事', '営業事務', '2026-01-09', '書類選考中', 'saiyo@minato-shoji.example', 'https://minato-shoji.example/recruit/204', '¥3,600,000', 3600000, 'いいえ', null, null, null],
    ['あおぞら信用金庫', '窓口・渉外', '2026-01-13', '一次面接', 'jinji@aozora-shinkin.example', 'https://aozora-shinkin.example/saiyo/2026', '¥3,840,000', 3840000, 'いいえ', wide('2026/2/3'), '2026-02-03', '筆記試験あり'],
    ['合同会社コトノハ', '編集アシスタント', '2026-01-16', '不採用', 'recruit@kotonoha.example', 'https://kotonoha.example/jobs/editor-assistant', '320万円', 3200000, 'はい', null, null, null],
    ['みどり市役所', '一般事務（任期付）', '2026-01-20', '一次面接', 'shokuin@city.midori.example', 'https://city.midori.example/saiyo/ninki-2026', '¥2,980,000', 2980000, 'いいえ', '2026/2/10', '2026-02-10', '持ち物：受験票'],
    ['株式会社ソラテック', 'カスタマーサポート', '2026-01-23', '書類選考中', null, 'https://soratech.example/careers/cs', '¥3,300,000', 3300000, 'はい', null, null, null],
    ['北斗物流株式会社', '総務', '2026-01-28', '最終面接', 'soumu-saiyo@hokuto-butsuryu.example', 'https://hokuto-butsuryu.example/recruit/soumu', '¥4,100,000', 4100000, 'いいえ', wide('2026/2/17'), '2026-02-17', '役員面接'],
    ['NPO法人まちの縁側', '事務局スタッフ', '2026-02-02', '書類選考中', 'info@machi-engawa.example', 'https://machi-engawa.example/boshu', '280万円', 2800000, 'いいえ', null, null, '週4日勤務も可'],
    ['株式会社はるか製菓', '商品企画', '2026-02-05', '不採用', 'saiyo@haruka-seika.example', 'https://haruka-seika.example/recruit/kikaku', '¥3,750,000', 3750000, 'いいえ', null, null, null],
    ['つばさ学園', '学校事務', '2026-02-09', '一次面接', 'jimu@tsubasa-gakuen.example', 'https://tsubasa-gakuen.example/saiyo', '¥3,200,000', 3200000, 'いいえ', '2026/2/24', '2026-02-24', null],
    ['株式会社クラウドベル', 'セールスアシスタント', '2026-02-12', '書類選考中', 'hr@cloudbell.example', 'https://cloudbell.example/jobs/sales-assistant', '¥3,900,000', 3900000, 'はい', null, null, null],
    ['東海精機株式会社', '経理事務', '2026-02-16', '内定', 'keiri-saiyo@tokai-seiki.example', 'https://tokai-seiki.example/recruit/keiri', '¥4,050,000', 4050000, 'いいえ', null, null, '2月末までに返事'],
    ['ひかり書房', '書店スタッフ（正社員）', '2026-02-18', '書類選考中', null, 'https://hikari-shobo.example/staff', null, null, 'いいえ', null, null, '給与は応相談'],
  ])
  const grid = new Grid().table(['企業名', '職種', '応募日', '選考状況', '連絡先', '求人URL', '想定年収', 'リモート可', '次回面接', 'メモ'],
    rows.map(([company, role, date, status, mail, link, pay, value, remote, next, day, notes]) => [company, role, T(`${Number(date.slice(0, 4))}年${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`, date), status, mail, link, pay && T(pay, value), T(remote, remote === 'はい'), next && T(next, day), notes]))
  return text(grid, { sep: '\t', encoding: 'utf-16le' })
}

// ─── Speed ───────────────────────────────────────────────────────────────────

/** 10,000 orders by 12 columns, as a shop's system exports them: a workbook, and the same as CSV. @param {'xlsx' | 'csv'} kind */
function speed(kind) {
  let seed = 20261114
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const pick = (/** @type {string[]} */ list) => list[Math.floor(random() * list.length)]
  const first = ['Ava', 'Noah', 'Mia', 'Liam', 'Zoe', 'Omar', 'Ines', 'Kenji', 'Lena', 'Ravi', 'Sofia', 'Tariq', 'Elsa', 'Hugo', 'Nia', 'Paolo'], last = ['Reyes', 'Okafor', 'Lindgren', 'Tanaka', 'Moreau', 'Haddad', 'Novak', 'Castillo', 'Byrne', 'Ivanova', 'Mensah', 'Fischer']
  const countries = ['United States', 'Canada', 'United Kingdom', 'France', 'Germany', 'Japan', 'Australia', 'Mexico'], products = ['Lavender soy candle', 'Cedar & sage candle', 'Beeswax taper pair', 'Wax melt sampler', 'Gift box — three candles', 'Linen wick trimmer', 'Ceramic holder', 'Matchbox set']
  const notes = ['Gift wrap', 'Leave at the door', 'Repeat customer', 'Call before delivery']
  const grid = new Grid('Orders')
  /** @type {Line[]} */
  const lines = []
  for (let i = 0; i < 10000; i++) {
    const name = `${pick(first)} ${pick(last)}`, qty = 1 + Math.floor(random() * 6), price = Math.round((6 + random() * 60) * 100) / 100, off = pick(['0', '0', '0', '0.05', '0.1', '0.15']), date = new Date(Date.UTC(2023, 0, 1) + Math.floor(random() * 1400) * 864e5).toISOString().slice(0, 10)
    const total = Math.round(qty * price * (1 - Number(off)) * 100) / 100, paid = random() > 0.08, note = random() > 0.9 ? pick(notes) : null
    lines.push(kind === 'xlsx'
      ? (r) => [100001 + i, D(date), name, `${name.toLowerCase().replace(' ', '.')}@example.com`, pick(countries), pick(products), qty, N(price, 44), N(Number(off), 9), F(`ROUND(G${r}*H${r}*(1-I${r}),2)`, total, 44), paid, note]
      : [T(String(100001 + i), 100001 + i), date, name, `${name.toLowerCase().replace(' ', '.')}@example.com`, pick(countries), pick(products), T(String(qty), qty), T(`$${en(price)}`, price), T(`${Math.round(Number(off) * 100)}%`, Number(off)), T(`$${en(total)}`, total), T(paid ? 'TRUE' : 'FALSE', paid), note])
  }
  grid.table(['Order ID', 'Date', 'Customer', 'Email', 'Country', 'Product', 'Qty', 'Unit price', 'Discount', 'Total', 'Paid', 'Notes'], lines)
  return kind === 'xlsx' ? workbook([grid], { named: { 44: '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)' } }) : text(grid)
}

/** Each file by its name; the sheet a careful person reads is its first one not hidden. @type {Record<string, () => Uint8Array | Promise<Uint8Array>>} */
export const FILES = {
  'en-budget.xlsx': enBudget, 'en-expenses.csv': enExpenses, 'en-members.xlsx': enMembers, 'en-orders.xlsx': enOrders, 'en-jobs.tsv': enJobs,
  'fr-budget.xlsx': frBudget, 'fr-expenses.csv': frExpenses, 'fr-members.xlsx': frMembers, 'fr-orders.csv': frOrders, 'fr-jobs.xlsx': frJobs,
  'ar-budget.xlsx': arBudget, 'ar-expenses.csv': arExpenses, 'ar-members.xlsx': arMembers, 'ar-orders.xlsx': arOrders, 'ar-jobs.csv': arJobs,
  'ja-budget.xlsx': jaBudget, 'ja-expenses.xlsx': jaExpenses, 'ja-members.xlsx': jaMembers, 'ja-orders.xlsx': jaOrders, 'ja-jobs.txt': jaJobs,
  'speed.xlsx': () => speed('xlsx'), 'speed.csv': () => speed('csv'),
}

/** Writes every file and truth.json into .cache/. */
export async function makeAll() {
  await mkdir(CACHE, { recursive: true })
  /** @type {Record<string, Truth | null>} */
  const truths = {}
  for (const [name, make] of Object.entries(FILES)) {
    await writeFile(`${CACHE}${name}`, await make())
    truths[name] = written
  }
  await writeFile(`${CACHE}truth.json`, JSON.stringify(truths))
  return Object.keys(FILES).length
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) makeAll().then((n) => console.log(`${n} files in ${CACHE}`))
