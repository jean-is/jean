// SPDX-License-Identifier: MIT
// Collections, phase 0a: can a spreadsheet be read into a collection by rule, with no brain? Reads the twenty sheets of
// test/spreadsheets/ (made by make.js, expected as set.js says) through cells.js and the reader, sheet.js, in each sheet's region
// and with its language's words for yes and no, as Jean would pass them, and prints the gate's figures:
//   heads:   the line of the heads found;
//   kinds:   each column's kind (its type, and money or a share), a column the reader adds counting as wrong;
//   said:    every cell that isn't a head, a row's value or the foot is in what the reader says it left out, with why and where;
//   silent:  no sheet read wrong without a word: a value that isn't what was written, a row that is none, a row or a column
//            missing, a wrong currency, with nothing said about its cells.
// Beside them: names, rows, values, the foot's sums, the dates' order, what a careful person expects left out, and whether
// Tables' checkCell takes every value. Twelve sheets are to improve the reader on; eight are held out, read once at the end.
// Usage: node scripts/spreadsheets.js                 the twelve
//        node scripts/spreadsheets.js --held           the eight held out (once)
//        node scripts/spreadsheets.js --all --write    all twenty and the 10,000 rows, into test/spreadsheets/results.md
//        … --only fr-jobs.xlsx --verbose · --speed · --real · --region en-US (every sheet read as from there)
//        node scripts/spreadsheets.js --file <path> --region fr-FR --lang fr    any file, as it is read (a real one, with nothing expected)
import { readdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cellsOf } from '../test/spreadsheets/cells.js'
import { first, read } from '../test/spreadsheets/sheet.js'
import { SET, SPEED } from '../test/spreadsheets/set.js'
import { CACHE, makeAll } from '../test/spreadsheets/make.js'
import { checkCell } from '../app/caps/tables/table.js'

// The expectations for the public workbooks copy values from them, so they stay out of git beside the files themselves
// (test/spreadsheets/.gitignore): the modes that read those workbooks need both, and the others run without them.
/** @param {string} name */
const optional = async (name) => (existsSync(fileURLToPath(new URL(`../test/spreadsheets/${name}`, import.meta.url))) ? import(`../test/spreadsheets/${name}`) : null)
const [publicSet, heldSet, shapeSet, thirdSet] = await Promise.all(['public.js', 'held.js', 'public-shape.js', 'third.js'].map(optional))
/** @param {string} name @returns {() => never} */
const missing = (name) => () => { throw new Error(`test/spreadsheets/${name} is not here: it copies values from the public workbooks, so it stays beside them, out of git.`) }
const loadPublic = publicSet?.load ?? missing('public.js')
const loadHeld = heldSet?.load ?? missing('held.js')
const loadThird = thirdSet?.load ?? missing('third.js')
/** @type {any[]} */
const SHAPES = shapeSet?.SHAPES ?? []

const DIR = fileURLToPath(new URL('../test/spreadsheets/', import.meta.url))
/** The words for a ticked box and an unticked one, as Jean's own strings give them in each language. */
const WORDS = /** @type {Record<string, { yes: string[], no: string[] }>} */ ({ en: { yes: ['Yes'], no: ['No'] }, fr: { yes: ['Oui'], no: ['Non'] }, ar: { yes: ['نعم'], no: ['لا'] }, ja: { yes: ['はい'], no: ['いいえ'] } })
const GATE = 'heads found in 95% of sheets; 90% of columns given the right kind; every cell left out is said; no sheet read wrong without a word'
/**
 * Expectations that turned out plainly wrong, each with why and what a careful person would expect instead: set.js stays as it
 * was written, and the figures are given both ways. @type {{ file: string, why: string, fix: (expected: Expected) => Expected }[]}
 */
const FIXES = []

/** @import { Expected } from '../test/spreadsheets/set.js' */
/** @import { Truth } from '../test/spreadsheets/make.js' */
/** @typedef {{ file: string, held: boolean, lang: string, heads: boolean, columns: number, kinds: number, names: number, currencies: number, moneys: number, rows: boolean, values: number, wrong: number, foot: boolean, dates: boolean, left: number, expectedLeft: number, unsaid: string[], silent: string[], refused: number, whole: boolean, misses: string[], ms: number }} Score */

/** "A1:C3" as places from 0. @param {string} where */
function range(where) {
  const [from, to = from] = where.split(':').map((cell) => { const [, col, row] = /^([A-Z]+)(\d+)$/.exec(cell) ?? []; return { row: Number(row) - 1, col: [...col].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1 } })
  return { top: from.row, left: from.col, bottom: to.row, right: to.col }
}
/** @param {number} row @param {number} col */
const a1 = (row, col) => `${col >= 26 ? String.fromCharCode(64 + Math.floor(col / 26)) : ''}${String.fromCharCode(65 + (col % 26))}${row + 1}`

/** Whether a value read is the one written. @param {unknown} got @param {unknown} want */
const same = (got, want) => (want === null || want === undefined ? got === null || got === undefined
  : typeof want === 'number' ? typeof got === 'number' && Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(want))
    : typeof want === 'string' && /^https?:\/\//.test(want) ? typeof got === 'string' && URL.canParse(got) && new URL(got).href === new URL(want).href
      : typeof want === 'string' ? typeof got === 'string' && got.trim() === want.trim() : got === want)

/**
 * One sheet read and compared with what is expected of it and with what was written.
 * @param {Expected} expected @param {Truth} truth @param {string} [region] @param {import('../test/spreadsheets/sheet.js').Labels} [labels] @returns {Promise<Score & { reading: import('../test/spreadsheets/sheet.js').Reading, book: import('../test/spreadsheets/cells.js').Workbook }>}
 */
async function readOne(expected, truth, region = expected.region, labels = undefined) {
  const bytes = new Uint8Array(await readFile(`${CACHE}${expected.file}`))
  const started = performance.now()
  const book = await cellsOf(expected.file, bytes), sheet = book.sheets[Math.max(first(book.sheets), 0)]
  const reading = read(sheet.cells, { region, merges: sheet.merges, ...WORDS[expected.lang], ...(labels && { labels }) })
  const ms = performance.now() - started
  /** @type {string[]} */
  const misses = [], silent = [], unsaid = []
  const said = reading.left.map((one) => ({ ...one, ...range(one.where) }))
  const covered = (/** @type {number} */ row, /** @type {number} */ col) => said.some((one) => row >= one.top && row <= one.bottom && col >= one.left && col <= one.right)
  const at = new Map(reading.columns.map((column, i) => [column.at, i])), line = new Map(reading.from.map((row, i) => [row, i]))

  // The heads, and each column's kind, name and currency.
  const heads = reading.heads + 1 === expected.heads
  if (!heads) misses.push(`heads on line ${reading.heads + 1}, not ${expected.heads}`)
  let kinds = 0, names = 0, currencies = 0, moneys = 0
  const taken = new Set()
  expected.columns.forEach((want, i) => {
    const got = reading.columns[at.get(truth.cols[i]) ?? -1], label = want.name ?? `(no name, ${a1(truth.heads, truth.cols[i]).replace(/\d+/, '')})`
    if (!got) { misses.push(`${label}: no such column`); if (!covered(truth.heads, truth.cols[i])) silent.push(`column ${label} missing`); return }
    const kind = (got.type === want.type && got.format === want.format) || (want.also ?? []).includes(got.type)
    if (kind) kinds++
    else misses.push(`${label}: ${got.type}${got.format ? ` (${got.format})` : ''}, not ${want.type}${want.format ? ` (${want.format})` : ''}`)
    if ((want.name === null ? got.name.trim() !== '' : got.name === want.name) && !taken.has(got.name)) names++
    else misses.push(`${label}: named "${got.name}"`)
    taken.add(got.name)
    if (want.format === 'money') {
      moneys++
      if ((got.currency ?? null) === want.currency) currencies++
      else { misses.push(`${label}: currency ${got.currency ?? 'not named'}, not ${want.currency ?? 'none (the file names none)'}`); if (got.currency) silent.push(`${label} in ${got.currency}, not ${want.currency ?? 'unnamed'}`) }
    }
  })
  const extra = reading.columns.filter((column) => !truth.cols.includes(column.at))
  for (const column of extra) { misses.push(`a column that is none: "${column.name}" (${column.type})`); silent.push(`column "${column.name}" is none`) }

  // The rows and their values: each one written is read as it was, or its cell is said.
  const wanted = new Set(truth.rows.map((row) => row.at))
  const rows = reading.from.length === wanted.size && reading.from.every((row) => wanted.has(row))
  for (const row of reading.from) if (!wanted.has(row)) { misses.push(`line ${row + 1} read as a row`); silent.push(`line ${row + 1} is no row`) }
  let values = 0, wrong = 0
  for (const row of truth.rows) {
    const i = line.get(row.at)
    row.values.forEach((want, c) => {
      values++
      const col = truth.cols[c], got = i === undefined || !at.has(col) ? undefined : reading.rows[i][/** @type {number} */ (at.get(col))]
      if (same(got, want)) return
      wrong++
      const word = covered(row.at, col) || reading.foot?.at === row.at || (expected.columns[c].type === 'date' && !reading.dates.settled && typeof got === 'string')
      if (wrong <= 6) misses.push(`${a1(row.at, col)}: ${JSON.stringify(got ?? null)}, not ${JSON.stringify(want)}${word ? ' (said)' : ''}`)
      if (!word) silent.push(`${a1(row.at, col)} read as ${JSON.stringify(got ?? null)}`)
    })
  }
  if (wrong > 6) misses.push(`… ${wrong - 6} more values`)

  // The foot, the dates' order, and what a careful person expects left out.
  const sums = expected.columns.map((want, i) => (want.name !== null && expected.foot?.[want.name] !== undefined ? expected.foot[want.name] : null))
  const footed = expected.columns.map((_, i) => reading.foot?.sums[at.get(truth.cols[i]) ?? -1] ?? null)
  const foot = sums.every((sum, i) => (sum === null ? footed[i] === null : footed[i] !== null && same(footed[i], sum))) && (expected.foot ? reading.foot?.at === truth.foot : !reading.foot)
  if (!foot) { misses.push(`foot ${JSON.stringify(reading.foot?.sums ?? null)}, not ${JSON.stringify(expected.foot ?? null)}`); if (expected.foot && !reading.foot) silent.push('no foot') }
  const dates = !expected.dates || (reading.dates.order === expected.dates.order && reading.dates.settled === expected.dates.settled)
  if (!dates) misses.push(`dates ${reading.dates.order}${reading.dates.settled ? ', settled by the values' : ', by the region'}, not ${expected.dates?.order}${expected.dates?.settled ? ', settled by the values' : ', by the region'}`)
  const full = (/** @type {number} */ row, /** @type {number} */ col) => { const cell = sheet.cells[row]?.[col]; return !!cell && (cell.kind !== 'empty' || !!cell.formula) }
  let left = 0
  for (const want of expected.left ?? []) {
    const box = range(want.where)
    let ok = want.why === 'empty' ? said.some((one) => one.why === 'empty' && one.top <= box.bottom && one.bottom >= box.top && one.left <= box.right && one.right >= box.left) : true
    for (let row = box.top; row <= box.bottom; row++) for (let col = box.left; col <= box.right; col++) if (full(row, col) && !covered(row, col)) ok = false
    if (ok) left++
    else misses.push(`${want.where} (${want.why}) not said as left out`)
  }

  // Every cell that is no head, no row's value and not the foot is said.
  sheet.cells.forEach((cells, row) => cells.forEach((_, col) => {
    if (!full(row, col) || covered(row, col)) return
    const i = line.get(row), c = at.get(col)
    if (c !== undefined && (row === reading.heads || row === reading.foot?.at || (i !== undefined && reading.rows[i][c] !== null))) return
    unsaid.push(a1(row, col))
  }))
  if (unsaid.length) misses.push(`left out without a word: ${unsaid.slice(0, 8).join(', ')}${unsaid.length > 8 ? `… (${unsaid.length})` : ''}`)

  // The workbook: its sheets, the hidden ones, where its dates count from.
  const sheetNames = book.sheets.map((one) => one.name), hidden = book.sheets.filter((one) => one.hidden).map((one) => one.name)
  const whole = !expected.book || (JSON.stringify(sheetNames) === JSON.stringify(expected.book.sheets) && JSON.stringify(hidden) === JSON.stringify(expected.book.hidden ?? []) && book.date1904 === !!expected.book.date1904)
  if (!whole) misses.push(`workbook read as: sheets ${sheetNames.join(', ')}; hidden: ${hidden.join(', ') || 'none'}; dates from ${book.date1904 ? 1904 : 1900}`)

  // Tables takes every value.
  let refused = 0
  reading.columns.forEach((column, c) => reading.rows.forEach((row) => { if (checkCell(/** @type {any} */ ({ name: column.name, type: column.type }), row[c])) refused++ }))
  if (refused) misses.push(`${refused} values checkCell refuses`)
  return { file: expected.file, held: expected.held, lang: expected.lang, heads, columns: expected.columns.length + extra.length, kinds, names, currencies, moneys, rows, values, wrong, foot, dates, left, expectedLeft: expected.left?.length ?? 0, unsaid, silent, refused, whole, misses, ms, reading, book }
}

/** @param {number} part @param {number} whole */
const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : '—')
/** @param {Score[]} scores @param {(score: Score) => number} of */
const total = (scores, of) => scores.reduce((sum, score) => sum + of(score), 0)

/** The gate's four figures over some sheets, and whether each is met. @param {Score[]} scores */
function figures(scores) {
  const heads = scores.filter((score) => score.heads).length, kinds = total(scores, (score) => score.kinds), columns = total(scores, (score) => score.columns)
  const unsaid = total(scores, (score) => score.unsaid.length), silent = scores.filter((score) => score.silent.length).length
  return { heads, kinds, columns, unsaid, silent, sheets: scores.length, passes: [heads / scores.length >= 0.95, kinds / columns >= 0.9, unsaid === 0, silent === 0] }
}

/** @param {string} name @param {Score[]} scores */
function line(name, scores) {
  const { heads, kinds, columns, unsaid, silent, sheets, passes } = figures(scores), mark = (/** @type {boolean} */ ok) => (ok ? 'pass' : 'MISS')
  const values = total(scores, (score) => score.values), wrong = total(scores, (score) => score.wrong)
  return `| ${name} | ${heads}/${sheets} (${percent(heads, sheets)}) ${mark(passes[0])} | ${kinds}/${columns} (${percent(kinds, columns)}) ${mark(passes[1])} | ${unsaid} ${mark(passes[2])} | ${silent} ${mark(passes[3])} | ${percent(total(scores, (score) => score.names), total(scores, (score) => score.columns))} | ${scores.filter((score) => score.rows).length}/${sheets} | ${percent(values - wrong, values)} (${wrong} of ${values} wrong) | ${scores.filter((score) => score.foot).length}/${sheets} | ${total(scores, (score) => score.currencies)}/${total(scores, (score) => score.moneys)} | ${total(scores, (score) => score.left)}/${total(scores, (score) => score.expectedLeft)} | ${scores.filter((score) => score.whole).length}/${sheets} | ${total(scores, (score) => score.refused)} |`
}

const HEAD = `| Sheets | Heads found (95%) | Columns of the right kind (90%) | Cells left out unsaid (0) | Sheets read wrong without a word (0) | Names | Rows | Values | Foot | Currencies | Expected left out, said | Workbook (sheets, hidden, 1904) | Values checkCell refuses |
|---|---|---|---|---|---|---|---|---|---|---|---|---|`

/** The figures as a table: the twelve, the eight, both. @param {Score[]} scores */
function table(scores) {
  const dev = scores.filter((score) => !score.held), held = scores.filter((score) => score.held)
  return [HEAD, ...(dev.length ? [line(`The ${dev.length} to improve on`, dev)] : []), ...(held.length ? [line(`The ${held.length} held out`, held)] : []), ...(dev.length && held.length ? [line(`All ${scores.length}`, scores)] : [])].join('\n')
}

/** Each sheet's line, and its misses. @param {Score[]} scores */
function sheets(scores) {
  const mark = (/** @type {boolean} */ ok) => (ok ? 'yes' : '**no**')
  return `| Sheet | | Heads | Kinds | Rows | Values wrong | Foot | Dates | Unsaid | Silent | Misses |
|---|---|---|---|---|---|---|---|---|---|---|
${scores.map((score) => `| ${score.file} | ${score.held ? 'held out' : ''} | ${mark(score.heads)} | ${score.kinds}/${score.columns} | ${mark(score.rows)} | ${score.wrong} | ${mark(score.foot)} | ${mark(score.dates)} | ${score.unsaid.length} | ${score.silent.length} | ${score.misses.map((miss) => miss.replaceAll('|', '/')).join('; ') || '—'} |`).join('\n')}`
}

/** How long the 10,000 rows take, the middle of five readings each. @param {Record<string, Truth>} truths */
async function speed(truths) {
  /** @type {string[]} */
  const lines = []
  for (const expected of SPEED) {
    const bytes = new Uint8Array(await readFile(`${CACHE}${expected.file}`))
    /** @type {[number, number][]} */
    const times = []
    for (let i = 0; i < 5; i++) {
      const start = performance.now(), book = await cellsOf(expected.file, bytes), mid = performance.now()
      read(book.sheets[0].cells, { region: expected.region, merges: book.sheets[0].merges, ...WORDS.en })
      times.push([mid - start, performance.now() - mid])
    }
    const middle = (/** @type {number} */ i) => Math.round(times.map((time) => time[i]).sort((a, b) => a - b)[2])
    const score = await readOne(expected, truths[expected.file])
    lines.push(`| ${expected.file} | ${Math.round(bytes.length / 1024)} KB | ${middle(0)} ms | ${middle(1)} ms | ${score.heads ? 'yes' : 'no'} | ${score.kinds}/${score.columns} | ${score.wrong} of ${score.values} | ${score.unsaid.length} | ${score.misses.join('; ') || '—'} |`)
  }
  return `| 10,000 rows by 12 columns | Size | Cells (cells.js) | Read (sheet.js) | Heads | Kinds | Values wrong | Unsaid | Misses |\n|---|---|---|---|---|---|---|---|---|\n${lines.join('\n')}`
}

/**
 * Any spreadsheet as the reader reads it, each sheet in turn: for the real files, which have no expectations written down.
 * @param {string} path @param {string} region @param {string} lang
 */
async function show(path, region, lang) {
  const book = await cellsOf(path.split('/').at(-1) ?? path, new Uint8Array(await readFile(path)))
  console.log(`${path}: ${book.sheets.length} sheet${book.sheets.length > 1 ? 's' : ''}${book.date1904 ? ', dates from 1904' : ''}, read as from ${region}`)
  for (const [i, sheet] of book.sheets.entries()) {
    if (sheet.hidden) { console.log(`\n── ${sheet.name}: hidden, not read`); continue }
    if (i === first(book.sheets) && book.sheets.length > 1) console.log(`\n(the sheet offered first: ${sheet.name})`)
    const reading = read(sheet.cells, { region, merges: sheet.merges, ...WORDS[lang] })
    const said = reading.left.map((one) => range(one.where)), at = new Map(reading.columns.map((column, i) => [column.at, i])), line = new Map(reading.from.map((row, i) => [row, i]))
    /** @type {string[]} */
    const unsaid = []
    sheet.cells.forEach((cells, row) => cells.forEach((cell, col) => {
      if ((cell.kind === 'empty' && !cell.formula) || said.some((one) => row >= one.top && row <= one.bottom && col >= one.left && col <= one.right)) return
      const i = line.get(row), c = at.get(col)
      if (c === undefined || !(row === reading.heads || row === reading.foot?.at || (i !== undefined && reading.rows[i][c] !== null))) unsaid.push(a1(row, col))
    }))
    let refused = 0
    reading.columns.forEach((column, c) => reading.rows.forEach((row) => { if (checkCell(/** @type {any} */ ({ name: column.name, type: column.type }), row[c])) refused++ }))
    console.log(`\n── ${sheet.name}: ${sheet.cells.length} lines, ${sheet.merges.length} merged ranges; heads on line ${reading.heads + 1}, ${reading.rows.length} rows, dates ${reading.dates.order}${reading.dates.settled ? '' : ' (by the region)'}, foot ${reading.foot ? `on line ${reading.foot.at + 1}: ${JSON.stringify(reading.foot.sums)}` : 'none'}`)
    for (const column of reading.columns) console.log(`   ${a1(0, column.at).replace(/\d+/, '').padEnd(3)} ${column.name}: ${column.type}${column.format ? ` ${column.format}` : ''}${column.currency ? ` ${column.currency}` : ''}${column.options ? ` [${column.options.slice(0, 6).join(' · ')}${column.options.length > 6 ? ' …' : ''}]` : ''}`)
    const why = Object.groupBy(reading.left, (one) => one.why)
    console.log(`   left out: ${Object.entries(why).map(([name, list]) => `${name} ${(list ?? []).slice(0, 6).map((one) => one.where).join(' ')}${(list?.length ?? 0) > 6 ? ` … (${list?.length})` : ''}`).join('; ') || 'nothing'}`)
    for (const row of reading.rows.slice(0, 3)) console.log(`   ${JSON.stringify(row)}`)
    console.log(`   unsaid: ${unsaid.length ? unsaid.slice(0, 12).join(' ') : 'none'}; values checkCell refuses: ${refused}`)
  }
}

/**
 * The real files at hand, as read: what Numbers exported into .cache/real/ (numbers-<lang>-…), each from its language's region,
 * with nothing expected of them, so no figure: the sheet offered first, its heads, rows, columns and what was left out.
 */
async function real() {
  const regions = /** @type {Record<string, string>} */ ({ en: 'en-US', fr: 'fr-FR', ar: 'ar-EG', ja: 'ja-JP' })
  const files = (await readdir(`${CACHE}real`, { recursive: true }).catch(() => [])).filter((name) => /\.(xlsx|csv)$/.test(name)).sort()
  /** @type {string[]} */
  const lines = []
  for (const name of files) {
    const lang = /numbers-(\w\w)-/.exec(name)?.[1] ?? 'en', book = await cellsOf(name.split('/').at(-1) ?? name, new Uint8Array(await readFile(`${CACHE}real/${name}`)))
    const sheet = book.sheets[Math.max(first(book.sheets), 0)], reading = read(sheet.cells, { region: regions[lang], merges: sheet.merges, ...WORDS[lang] })
    const why = Object.entries(Object.groupBy(reading.left, (one) => one.why)).map(([name, list]) => `${name} ${(list ?? []).map((one) => one.where).slice(0, 3).join(' ')}`).join('; ')
    lines.push(`| ${name} | ${book.sheets.length > 1 ? `${sheet.name}, of ${book.sheets.length}` : sheet.name} | ${reading.heads + 1} | ${reading.rows.length} | ${reading.columns.map((column) => `${column.name}: ${column.format ?? column.type}${column.currency ? ` ${column.currency}` : ''}`).join(' · ').replaceAll('|', '/')} | ${reading.foot ? reading.foot.sums.filter((sum) => sum !== null).join(' · ') : '—'} | ${why || '—'} |`)
  }
  return lines.length ? `| File | Sheet read | Heads on line | Rows | Columns | Foot | Left out |\n|---|---|---|---|---|---|---|\n${lines.join('\n')}` : ''
}

/**
 * Every sheet with an expectation, read by the rules alone (or with labels by file), and scored: the 34 public, the 14 held, the 20
 * scripted. Each has what a brain is shown: its cells and merged ranges, its region and language.
 * @param {Record<string, import('../test/spreadsheets/sheet.js').Labels>} [labelled] labels by score's file name
 */
async function everySheet(labelled = {}) {
  await makeAll()
  /** @type {Record<string, Truth>} */
  const truths = JSON.parse(await readFile(`${CACHE}truth.json`, 'utf8'))
  /** @type {{ set: 'public' | 'held' | 'scripted', file: string, cells: any[][], merges: any[], score: (labels?: import('../test/spreadsheets/sheet.js').Labels) => Promise<any> }[]} */
  const all = []
  const sheetOf = async (/** @type {string} */ name, /** @type {Uint8Array} */ bytes, /** @type {string | undefined} */ wanted) => ((book) => book.sheets.find((one) => (wanted ? one.name === wanted : true)) ?? book.sheets[0])(await cellsOf(name, bytes))
  for (const item of loadPublic()) { const file = `${item.expected.file} · ${item.expected.sheet}`, sheet = await sheetOf(item.name, item.bytes, item.expected.sheet); all.push({ set: 'public', file, cells: sheet.cells, merges: sheet.merges, score: (labels = labelled[file]) => readPublic(item, false, labels) }) }
  for (const item of loadHeld()) { const file = `${item.expected.file} · ${item.expected.sheet}`, sheet = await sheetOf(item.name, item.bytes, item.expected.sheet); all.push({ set: 'held', file, cells: sheet.cells, merges: sheet.merges, score: (labels = labelled[file]) => readHeld(item, false, labels) }) }
  for (const expected of SET) {
    const book = await cellsOf(expected.file, new Uint8Array(await readFile(`${CACHE}${expected.file}`))), sheet = book.sheets[Math.max(first(book.sheets), 0)]
    all.push({ set: 'scripted', file: expected.file, cells: sheet.cells, merges: sheet.merges, score: (labels = labelled[expected.file]) => readOne(expected, truths[expected.file], undefined, labels) })
  }
  return all
}

/** Whether a score is right but for Pleumeleuc's yes column, which the held set's author accepts as a checkbox. @param {any} score */
const conceded = (score) => score.file === 'fr-pleumeleuc · spécifications' && score.silent.every((/** @type {string} */ one) => /^C\d+ read as true$/.test(one))

/**
 * The doubts against what went wrong, on every sheet read by the rules alone: each sheet read wrong without a word should carry one
 * (recall); a right sheet carrying one is a false alarm, by kind. @returns {Promise<string>}
 */
async function doubtsMode() {
  const scores = []
  for (const one of await everySheet()) scores.push({ set: one.set, ...(await one.score()) })
  const wrong = (/** @type {any} */ score, /** @type {boolean} */ concede) => score.silent.length > 0 && !(concede && conceded(score))
  const kinds = ['misfit', 'total', 'sums', 'words', 'end', 'long', 'merged']
  const has = (/** @type {any} */ score, /** @type {string} */ kind) => score.reading.doubts.some((/** @type {any} */ one) => one.kind === kind)
  const lines = [`Doubts on ${scores.length} sheets read by the rules alone (34 public, 14 held, 20 scripted).`, '']
  for (const concede of [false, true]) {
    const bad = scores.filter((score) => wrong(score, concede)), good = scores.filter((score) => !wrong(score, concede))
    lines.push(`${concede ? 'With Pleumeleuc\'s yes column accepted as a checkbox' : 'As the expectations are written'}: ${bad.length} sheets read wrong without a word, ${bad.filter((score) => score.reading.doubts.length).length} carrying a doubt (recall); ${good.filter((score) => score.reading.doubts.length).length} of ${good.length} right sheets carrying one (false alarms).`)
    for (const score of bad) lines.push(`   wrong: ${score.file}: ${[...new Set(score.reading.doubts.map((/** @type {any} */ one) => one.kind))].join(', ') || 'NO DOUBT'}`)
  }
  lines.push('', '| Doubt | Sheets wrong it is on | Right sheets it is on (false alarms) | Places, all sheets |', '|---|---:|---:|---:|')
  for (const kind of kinds) lines.push(`| ${kind} | ${scores.filter((score) => wrong(score, true) && has(score, kind)).length} | ${scores.filter((score) => !wrong(score, true) && has(score, kind)).length} | ${scores.reduce((n, score) => n + score.reading.doubts.filter((/** @type {any} */ one) => one.kind === kind).length, 0)} |`)
  lines.push('', 'Right sheets with a doubt:', ...scores.filter((score) => !wrong(score, true) && score.reading.doubts.length).map((score) => `   ${score.set} ${score.file}: ${score.reading.doubts.map((/** @type {any} */ one) => `${one.kind} ${one.at}`).join(', ')}`))
  return lines.join('\n')
}

// ── Round three: a brain reads a doubted sheet's layout (--brain) ──
// The rules read every sheet; on those they doubt (or every real sheet, --every), a brain is shown the sheet, the rules' reading and
// their doubts (layout.js ask()), its answer is checked (take()), and the rules read the sheet again with its labels and nothing else.
// Each sheet is scored as without the brain, and compared with the rules alone. The gate, written before the first run: on the doubted
// sheets, with Haiku, heads found in 95% of sheets, 90% of columns of the right kind, nothing left out unsaid, no sheet read wrong
// without a word, and no sheet a brain touched read worse than without it; Sonnet beside it; three runs each.
//   BRAIN=claudecode:haiku node scripts/spreadsheets.js --brain [--runs 3] [--every] [--save <file.jsonl>] [--parallel 3]
//   node scripts/spreadsheets.js --brain --from <a.jsonl>,<b.jsonl>     score kept answers again, asking no brain
// A plan's limit or a rate limit stops the run where it is: nothing is asked again.

/** A failure that is the plan's or the provider's limit. @param {any} error */
const isLimit = (error) => ['rate_limit', 'credits', 'auth'].includes(error?.code) || /usage limit|rate.?limit|limit reached|hit your|out of (extra )?usage|quota|too many requests|overloaded|credit/i.test(String(error?.message ?? error))

/** Whether a sheet read with a brain's labels reads worse than with the rules alone, or better. @param {any} base @param {any} mine */
const compare = (base, mine) => ({
  worse: (base.heads && !mine.heads) || mine.kinds < base.kinds || mine.unsaid.length > base.unsaid.length || mine.silent.length > base.silent.length || mine.wrong > base.wrong || (base.rows && !mine.rows),
  better: mine.silent.length < base.silent.length || (!base.heads && mine.heads) || mine.kinds > base.kinds || mine.wrong < base.wrong,
})

/** @param {string[]} argv @param {Record<string, string | undefined>} env */
async function brainMode(argv, env) {
  const flag = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const all = await everySheet(), base = new Map()
  for (const one of all) base.set(one.file, await one.score(undefined))
  /** @type {any[]} */
  let records = []
  const from = flag('--from')
  if (from) records = (await Promise.all(from.split(',').map((file) => readFile(file, 'utf8')))).flatMap((text) => text.split('\n').filter(Boolean).map((line) => JSON.parse(line)))
  else {
    if (!env.BRAIN) throw new Error('name a brain: BRAIN=<provider>:<model> (cli/brain.js)')
    const { chooseBrain } = await import('../cli/brain.js'), { streamChat } = await import('../app/core/llm.js'), { ask, take } = await import('../test/spreadsheets/layout.js')
    const found = await chooseBrain({ named: env.BRAIN, address: env.BRAIN_ADDRESS, env })
    if (!found || 'needs' in found) throw new Error(`no brain "${env.BRAIN}"`)
    const brain = `${found.brain.model} (${found.brain.provider})`, every = argv.includes('--every'), runs = every ? 1 : Number(flag('--runs') ?? 3), save = flag('--save')
    const chosen = all.filter((one) => (every ? one.set !== 'scripted' : base.get(one.file).reading.doubts.length))
    const jobs = Array.from({ length: runs }, (_, run) => chosen.map((one) => ({ one, run: run + 1 }))).flat()
    console.log(`spreadsheets --brain: ${brain}, ${every ? `every real sheet (${chosen.length}), once` : `the ${chosen.length} doubted sheets, ${runs} runs`}, ${jobs.length} calls, ${Math.min(3, Number(flag('--parallel') ?? 3))} at a time`)
    let stopped = '', failures = 0, next = 0
    try {
      await Promise.all(Array.from({ length: Math.min(3, Number(flag('--parallel') ?? 3), jobs.length) }, async () => {
        while (next < jobs.length && !stopped) {
          const { one, run } = jobs[next++], reading = base.get(one.file).reading, { system, text, shown } = ask(one.cells, one.merges, reading), started = performance.now()
          /** @type {any} */
          let record = { brain, run, set: one.set, file: one.file, every }
          try {
            let answer = ''
            const tokens = { in: 0, out: 0 }
            for await (const event of streamChat({ brain: found.brain, apiKey: found.apiKey, system, messages: [{ role: 'user', content: text }], maxTokens: 2000, signal: AbortSignal.timeout(240_000) })) {
              if (event.type === 'text') answer += event.delta
              if (event.type === 'done') { tokens.in += event.usage?.inputTokens ?? 0; tokens.out += event.usage?.outputTokens ?? 0 }
            }
            if (/^(API )?Error: /.test(answer.trim())) throw new Error(answer.trim().slice(0, 300))
            const taken = take(answer, { height: one.cells.length, width: Math.max(0, ...one.cells.map((line) => line.length)), shown })
            record = { ...record, tokens, ms: Math.round(performance.now() - started), failed: taken.failed, dropped: taken.dropped, labels: taken.labels, answer: answer.slice(0, 1500) }
            failures = 0
          } catch (error) {
            record = { ...record, error: String(/** @type {Error} */ (error).message).slice(0, 300) }
            if (isLimit(error) || ++failures >= 6) stopped ||= record.error
          }
          records.push(record)
          if (save) await appendFile(save, `${JSON.stringify(record)}\n`)
          console.log(`${String(records.length).padStart(3)}/${jobs.length} ${one.file} run ${run}: ${record.error ? `error ${record.error}` : `${record.failed ? 'not taken' : `${Object.keys(record.labels.lines ?? {}).length} lines, ${Object.keys(record.labels.kinds ?? {}).length} columns`}${record.dropped.length ? `, dropped ${record.dropped.join('; ')}` : ''}, ${record.tokens.in}+${record.tokens.out} tokens, ${record.ms} ms`}`)
        }
      }))
    } finally {
      await /** @type {any} */ (found).close?.()
    }
    if (stopped) console.log(`\nStopped after ${records.length} of ${jobs.length} calls, nothing asked again: ${stopped}`)
  }
  console.log(`\n${await brainReport(records, all, base)}`)
}

/** The brain's figures against the gate, by brain, run and set of sheets. @param {any[]} records @param {any[]} all @param {Map<string, any>} base */
async function brainReport(records, all, base) {
  const out = []
  const done = records.filter((one) => !one.error)
  for (const brain of [...new Set(done.map((one) => one.brain))]) for (const every of [false, true]) {
    const mine = done.filter((one) => one.brain === brain && !!one.every === every)
    if (!mine.length) continue
    out.push(`### ${brain}, ${every ? 'every real sheet, doubted or not' : 'the doubted sheets'}`, '', HEAD)
    const runs = [...new Set(mine.map((one) => one.run))].sort()
    const files = [...new Set(mine.map((one) => one.file))]
    out.push(line(`Rules alone (${files.length})`, files.map((file) => base.get(file))))
    /** @type {string[]} */
    const notes = []
    for (const run of runs) {
      const these = mine.filter((one) => one.run === run), scores = []
      for (const one of these) scores.push({ record: one, score: await /** @type {any} */ (all.find((sheet) => sheet.file === one.file)).score(one.failed ? undefined : one.labels) })
      out.push(line(`With the brain, run ${run} (${these.length})`, scores.map((one) => one.score)))
      const judged = scores.map(({ record, score }) => ({ record, score, ...compare(base.get(record.file), score), touched: !record.failed && (Object.keys(record.labels?.lines ?? {}).length + Object.keys(record.labels?.kinds ?? {}).length) > 0 }))
      const avg = (/** @type {(one: any) => number} */ of) => Math.round(these.reduce((n, one) => n + of(one), 0) / these.length)
      notes.push(`Run ${run}: ${judged.filter((one) => one.touched).length} of ${these.length} sheets touched; ${judged.filter((one) => one.worse).length} read worse${judged.some((one) => one.worse) ? ` (${judged.filter((one) => one.worse).map((one) => one.record.file).join('; ')})` : ''}, ${judged.filter((one) => one.better).length} better; JSON not taken ${these.filter((one) => one.failed).length}, answers with something dropped ${these.filter((one) => one.dropped?.length).length}; tokens per sheet ${avg((one) => one.tokens?.in ?? 0)} in, ${avg((one) => one.tokens?.out ?? 0)} out; ${(avg((one) => one.ms ?? 0) / 1000).toFixed(1)} s per sheet.`)
      for (const { record, score, worse } of judged) if (score.silent.length || worse) notes.push(`   ${record.file}: ${worse ? 'WORSE; ' : ''}${score.silent.length ? `wrong without a word: ${score.silent.slice(0, 4).join('; ')}` : ''} labels ${JSON.stringify(record.labels ?? {}).slice(0, 300)}`)
    }
    out.push('', ...notes, '')
  }
  const errors = records.filter((one) => one.error)
  if (errors.length) out.push(`${errors.length} calls failed at the server and are left out: ${[...new Set(errors.map((one) => one.error))].slice(0, 3).join('; ')}`)
  return out.join('\n')
}

/** @param {string[]} argv */
async function main(argv) {
  if (argv.includes('--third')) return thirdMode(argv, process.env)
  if (argv.includes('--brain')) return brainMode(argv, process.env)
  if (argv.includes('--doubts')) return console.log(await doubtsMode())
  if (argv.includes('--public')) return publicMode(argv)
  if (argv.includes('--held-files')) return heldMode(argv)
  const flag = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  if (flag('--file')) return show(/** @type {string} */ (flag('--file')), flag('--region') ?? 'en-US', flag('--lang') ?? 'en')
  const all = argv.includes('--all') || argv.includes('--write'), held = argv.includes('--held'), only = flag('--only'), region = flag('--region')
  await makeAll()
  /** @type {Record<string, Truth>} */
  const truths = JSON.parse(await readFile(`${CACHE}truth.json`, 'utf8'))
  const chosen = SET.filter((sheet) => (only ? sheet.file === only : all || sheet.held === held))
  /** @param {boolean} fixed */
  const run = async (fixed) => {
    /** @type {Awaited<ReturnType<typeof readOne>>[]} */
    const scores = []
    for (const sheet of chosen) scores.push(await readOne(FIXES.filter((fix) => fixed && fix.file === sheet.file).reduce((expected, { fix }) => fix(expected), sheet), truths[sheet.file], region))
    return scores
  }
  const scores = await run(false), fixed = FIXES.length ? await run(true) : null
  console.log(`spreadsheets: ${chosen.length} sheets${region ? `, all read as from ${region}` : ''}\nThe gate: ${GATE}.\n`)
  console.log(table(scores))
  if (fixed) console.log(`\nWith ${FIXES.length} expectation${FIXES.length > 1 ? 's' : ''} corrected (${FIXES.map((fix) => `${fix.file}: ${fix.why}`).join('; ')}):\n${table(fixed)}`)
  console.log(`\n${sheets(scores)}`)
  if (argv.includes('--verbose')) for (const score of scores) {
    console.log(`\n── ${score.file}: heads ${score.reading.heads + 1}, dates ${JSON.stringify(score.reading.dates)}, foot ${JSON.stringify(score.reading.foot)}, sheets ${score.book.sheets.map((sheet) => `${sheet.name}${sheet.hidden ? ' (hidden)' : ''}`).join(', ')}${score.book.date1904 ? ', dates from 1904' : ''}`)
    for (const column of score.reading.columns) console.log(`   ${a1(score.reading.heads, column.at).replace(/\d+/, '').padEnd(3)} ${column.name}: ${column.type}${column.format ? ` ${column.format}` : ''}${column.currency ? ` ${column.currency}` : ''}${column.options ? ` [${column.options.slice(0, 6).join(' · ')}${column.options.length > 6 ? ' …' : ''}]` : ''}`)
    console.log(`   left out: ${score.reading.left.map((one) => `${one.where} ${one.why}`).join(', ') || 'nothing'}`)
    console.log(`   first row: ${JSON.stringify(score.reading.rows[0])}`)
    if (score.silent.length) console.log(`   wrong without a word: ${score.silent.slice(0, 12).join('; ')}`)
  }
  const fast = argv.includes('--speed') || argv.includes('--write') ? await speed(truths) : ''
  if (fast) console.log(`\n${fast}`)
  const made = argv.includes('--real') || argv.includes('--write') ? await real() : ''
  if (made) console.log(`\n${made}`)
  if (argv.includes('--write')) {
    const round = existsSync(`${DIR}.cache/public`) ? await publicScores(false) : null
    /** @type {any[]} */
    const held = []
    if (existsSync(`${DIR}.cache/held`)) for (const item of loadHeld()) held.push(await readHeld(item, false))
    const doubts = round && held.length ? await doubtsMode() : ''
    const kept = flag('--from') ? (await Promise.all(/** @type {string} */ (flag('--from')).split(',').map((file) => readFile(file, 'utf8')))).flatMap((text) => text.split('\n').filter(Boolean).map((line) => JSON.parse(line))) : []
    const brains = kept.length ? await (async () => { const all = await everySheet(), base = new Map(); for (const one of all) base.set(one.file, await one.score(undefined)); return brainReport(kept, all, base) })() : ''
    const { asked } = await import('../test/spreadsheets/layout.js')
    const hashes = await Promise.all(['cells.js', 'sheet.js', 'layout.js'].map(async (name) => `| test/spreadsheets/${name} | \`${createHash('sha256').update(await readFile(`${DIR}${name}`)).digest('hex')}\` |`))
    await writeFile(`${DIR}results.md`, `# Spreadsheets: can a sheet be read into a collection by rule?

Written by \`node scripts/spreadsheets.js --write\` on ${new Date().toISOString().slice(0, 10)}. Twenty sheets made by script (test/spreadsheets/make.js), five each in
English, French, Arabic and Japanese, as people keep them, read through cells.js and sheet.js with no brain, each in its region and
with its language's words for yes and no. What a careful person expects of each is in set.js, written before the reader saw any;
twelve were used to improve the reader, eight were held out and read once at the end.

The gate, written before the first run: ${GATE}.

${table(scores)}
${fixed ? `\nWith ${FIXES.length} expectation${FIXES.length > 1 ? 's' : ''} corrected (${FIXES.map((fix) => `${fix.file}: ${fix.why}`).join('; ')}):\n\n${table(fixed)}\n` : ''}
A column's kind is its type and whether it is money or a share; a column the reader adds counts as wrong. A cell is said when it is
a head, a row's value or the foot, or lies in what the reader says it left out. A sheet is read wrong without a word when a value
isn't what was written, a line that is no row is one, a row or a column is missing or a currency is wrong, and nothing is said of
those cells. Names, rows, values, the foot, currencies, what a careful person expects left out and the workbook's sheets (which
are hidden, where its dates count from) are beside the gate, not in it.

## Each sheet

${sheets(scores)}

## Speed

${fast}

The middle of five readings on this computer, the file's bytes already in memory.
${made ? `
## Real files, as read

What Numbers exported from documents made in it here (.cache/real/, not committed), each read from its language's region. Nothing
was expected of them in writing beforehand, so they give no figure: they are what the reader's rules were also improved on.

${made}
` : ''}
${round ? `
## The real sheets, by the rules alone

Sixteen public workbooks (34 sheets, public.js and public.md) and thirteen held out (14 sheets, held.js and held.md), each
expected by someone who did not write the reader. Round two's rules were made on the 34; the 14 were read once by round two's
frozen reader (held.md: 6 read wrong without a word) and are development material since. Round three added two rules (codes of
13 digits or more stay text; 総数 is a word for total); these figures are on sheets the rules were made or mended on.

${round.figures}
${held.length ? `${line(`The 14 held, round three's rules alone`, held)}\n` : ''}
What each public sheet is read as. A report is a sheet with parts, subtotals or a total: its rows are its line items, and every
part's name, subtotal and total is said, by kind and line, before anything is kept.

${round.shapes}
` : ''}${doubts ? `
## Round three: where the rules doubt

${doubts}
` : ''}${brains ? `
## Round three: a brain reads the doubted sheets

The gate, written before the first run: on the doubted sheets, with Haiku, ${GATE}, and no sheet a brain touched read worse than
without it; Sonnet beside it; three runs each. Then each brain once on every real sheet, doubted or not. The brain is shown the
sheet's lines (the first 60 and the last 20), the rules' reading and their doubts (layout.js), and its answer can only label lines
and columns; the rules read the sheet again with those labels. "Worse" is any of: heads lost, fewer columns of the right kind,
more cells unsaid, more read wrong without a word, more values wrong, rows no longer right.

The first Haiku run, with sheet.js frozen at \`2bf3bea9…\`, failed the gate: in each of its three runs, heads 2/3 and kinds 20/28
(71.4%), nothing unsaid, no sheet wrong without a word, and Urayasu read worse. Haiku had named line 4 as heads and left line 5,
which the rules had right, alone; a heads label then replaced the rules' line, against the prompt's own word that lines left out
keep the rules' reading. The reader was mended to keep that word (\`da904902…\`) and Haiku asked again: the runs below. Sonnet's
second run then showed a second flaw of the same kind (title lines labelled notes above the heads hid them), mended before the
runs on every sheet (\`14f7d075…\`, the frozen one); every answer below is read with it. The gate was not changed.

${brains}
` : ''}
## With no brain

What the sheet asks the person, for each kind of doubt:

${Object.entries(asked).map(([kind, question]) => `- ${kind}: ${question}`).join('\n')}

## Frozen

The reader as it stands after round three: cells.js, sheet.js and layout.js don't change until the third held-out set is read.

| File | SHA-256 |
|---|---|
${hashes.join('\n')}

## What the figures don't say

Every scripted sheet was written by the reader's author, the eight held out too. The 48 real sheets were expected by someone else,
but the rules and the doubts were made or mended on them, with the misses in view: their figures measure the fit, not the reach.
The doubts' recall rests on three sheets. A third held-out set, of everyday lists rather than budgets, will measure the reach.
`)
    console.log(`\nwritten: ${DIR}results.md`)
  }
}

// ── The real half (--public) ──
// Sixteen public workbooks, expected in test/spreadsheets/public.js by someone who did not write the reader, read once. Each sheet
// is scored as readOne scores a scripted one, with what real files need: the sheet named rather than the one offered first, the
// file's own extension (the cache names them .file), heads that may be either of two lines, a column's kind or values that a
// careful person can't settle left out of the score, a column tolerated, a value that may be either of two, and a sheet that is
// no table (its heads expected none, every column and row read from it counting as read wrong).
//   node scripts/spreadsheets.js --public          the real sheets, then with the twenty scripted ones
//   node scripts/spreadsheets.js --public --dry    the same with an empty reading, to try the scoring without the reader

/** @param {unknown} got @param {unknown} want */
const either = (got, want) => (want && typeof want === 'object' ? ('skip' in want ? true : /** @type {{ either: unknown[] }} */ (want).either.some((one) => same(got, one))) : same(got, want))

/**
 * One real sheet read and compared with what is expected of it: readOne's comparisons, line for line, with the differences above.
 * @param {ReturnType<typeof loadPublic>[number]} item @param {boolean} dry
 */
async function readPublic({ expected, truth, bytes, name }, dry, labels = undefined) {
  const started = performance.now()
  const book = await cellsOf(name, bytes), sheet = book.sheets.find((one) => one.name === expected.sheet)
  if (!sheet) throw new Error(`${name}: no sheet ${expected.sheet}`)
  /** @type {import('../test/spreadsheets/sheet.js').Reading} */
  const reading = dry ? { heads: -1, columns: [], rows: [], from: [], foot: null, dates: { order: 'dmy', settled: true }, left: [] } : read(sheet.cells, { region: expected.region, merges: sheet.merges, ...WORDS[expected.lang], ...(labels && { labels }) })
  const ms = performance.now() - started
  /** @type {string[]} */
  const misses = [], silent = [], unsaid = []
  const said = reading.left.map((one) => ({ ...one, ...range(one.where) }))
  const covered = (/** @type {number} */ row, /** @type {number} */ col) => said.some((one) => row >= one.top && row <= one.bottom && col >= one.left && col <= one.right)
  const at = new Map(reading.columns.map((column, i) => [column.at, i])), fromLine = new Map(reading.from.map((row, i) => [row, i]))
  const columns = expected.columns ?? []

  // The heads, and each column's kind, name and currency.
  const heads = truth.heads.includes(reading.heads), headLine = heads ? reading.heads : /** @type {number} */ (truth.heads.at(-1))
  if (!heads) misses.push(`heads on line ${reading.heads + 1}, not ${truth.heads[0] < 0 ? 'none (no table)' : truth.heads.map((one) => one + 1).join(' or ')}`)
  let kinds = 0, names = 0, currencies = 0, moneys = 0, scored = 0
  const taken = new Set()
  columns.forEach((want, i) => {
    const got = reading.columns[at.get(truth.cols[i]) ?? -1], label = want.name ?? `(no name, ${want.at})`, judged = !want.skip?.includes('kind')
    if (judged) scored++
    if (!got) { misses.push(`${label}: no such column`); if (!covered(headLine, truth.cols[i])) silent.push(`column ${label} missing`); return }
    const kind = (got.type === want.type && got.format === want.format) || (want.also ?? []).includes(got.type)
    if (judged && kind) kinds++
    else if (judged) misses.push(`${label}: ${got.type}${got.format ? ` (${got.format})` : ''}, not ${want.type}${want.format ? ` (${want.format})` : ''}`)
    if ((want.name === null ? got.name.trim() !== '' : got.name === want.name) && !taken.has(got.name)) names++
    else misses.push(`${label}: named "${got.name}"`)
    taken.add(got.name)
    if (want.format === 'money') {
      moneys++
      if ((got.currency ?? null) === (want.currency ?? null)) currencies++
      else { misses.push(`${label}: currency ${got.currency ?? 'not named'}, not ${want.currency ?? 'none (the file names none)'}`); if (got.currency) silent.push(`${label} in ${got.currency}, not ${want.currency ?? 'unnamed'}`) }
    }
  })
  const tolerated = new Set((expected.tolerate ?? []).map((one) => range(`${one}1`).left))
  const extra = reading.columns.filter((column) => !truth.cols.includes(column.at) && !tolerated.has(column.at))
  for (const column of extra) { misses.push(`a column that is none: "${column.name}" (${column.type})`); silent.push(`column "${column.name}" is none`) }

  // The rows and their values: each one expected is read as the file holds it, or its cell is said.
  const wanted = new Set(truth.rows.map((row) => row.at))
  const rows = reading.from.length === wanted.size && reading.from.every((row) => wanted.has(row))
  for (const row of reading.from) if (!wanted.has(row)) { misses.push(`line ${row + 1} read as a row`); silent.push(`line ${row + 1} is no row`) }
  let values = 0, wrong = 0
  for (const row of truth.rows) {
    const i = fromLine.get(row.at)
    row.values.forEach((want, c) => {
      if (want && typeof want === 'object' && 'skip' in want) return
      values++
      const col = truth.cols[c], got = i === undefined || !at.has(col) ? undefined : reading.rows[i][/** @type {number} */ (at.get(col))]
      if (either(got, want)) return
      wrong++
      const word = covered(row.at, col) || reading.foot?.at === row.at || (columns[c].type === 'date' && !reading.dates.settled && typeof got === 'string')
      if (wrong <= 6) misses.push(`${a1(row.at, col)}: ${JSON.stringify(got ?? null)}, not ${JSON.stringify(want)}${word ? ' (said)' : ''}`)
      if (!word) silent.push(`${a1(row.at, col)} read as ${JSON.stringify(got ?? null)}`)
    })
  }
  if (wrong > 6) misses.push(`… ${wrong - 6} more values`)

  // The foot, the dates' order, and what a careful person expects left out.
  const footed = columns.map((_, i) => reading.foot?.sums[at.get(truth.cols[i]) ?? -1] ?? null)
  const foot = truth.sums.every((sum, i) => columns[i].skip?.includes('kind') || (sum === null ? footed[i] === null : footed[i] !== null && same(footed[i], sum))) && (truth.foot !== null ? reading.foot?.at === truth.foot : !reading.foot)
  if (!foot) { misses.push(`foot ${reading.foot ? `on line ${reading.foot.at + 1}` : 'none'} ${JSON.stringify(reading.foot?.sums ?? null)}, not ${truth.foot === null ? 'none' : `line ${truth.foot + 1} ${JSON.stringify(truth.sums)}`}`); if (truth.foot !== null && !reading.foot) silent.push('no foot') }
  const dates = !expected.dates || (reading.dates.order === expected.dates.order && reading.dates.settled === expected.dates.settled)
  if (!dates) misses.push(`dates ${reading.dates.order}${reading.dates.settled ? ', settled by the values' : ', by the region'}, not ${expected.dates?.order}${expected.dates?.settled ? ', settled by the values' : ', by the region'}`)
  const full = (/** @type {number} */ row, /** @type {number} */ col) => { const cell = sheet.cells[row]?.[col]; return !!cell && (cell.kind !== 'empty' || !!cell.formula) }
  let left = 0
  for (const want of expected.left ?? []) {
    const box = range(want.where)
    let ok = want.why === 'empty' ? said.some((one) => one.why === 'empty' && one.top <= box.bottom && one.bottom >= box.top && one.left <= box.right && one.right >= box.left) : true
    for (let row = box.top; row <= box.bottom; row++) for (let col = box.left; col <= box.right; col++) if (full(row, col) && !covered(row, col)) ok = false
    if (ok) left++
    else misses.push(`${want.where} (${want.why}) not said as left out`)
  }

  // Every cell that is no head, no row's value and not the foot is said; a sheet that is no table, read as none (no heads, no
  // rows), is said whole.
  const none = expected.table === false && reading.heads < 0 && !reading.rows.length
  sheet.cells.forEach((cells, row) => cells.forEach((_, col) => {
    if (none || !full(row, col) || covered(row, col)) return
    const i = fromLine.get(row), c = at.get(col)
    if (c !== undefined && (row === reading.heads || row === reading.foot?.at || (i !== undefined && reading.rows[i][c] !== null))) return
    unsaid.push(a1(row, col))
  }))
  if (unsaid.length) misses.push(`left out without a word: ${unsaid.slice(0, 8).join(', ')}${unsaid.length > 8 ? `… (${unsaid.length})` : ''}`)

  // The workbook: its sheets, the hidden ones, where its dates count from.
  const sheetNames = book.sheets.map((one) => one.name), hidden = book.sheets.filter((one) => one.hidden).map((one) => one.name)
  const whole = !expected.book || (JSON.stringify(sheetNames) === JSON.stringify(expected.book.sheets) && JSON.stringify(hidden) === JSON.stringify(expected.book.hidden ?? []) && book.date1904 === !!expected.book.date1904)
  if (!whole) misses.push(`workbook read as: sheets ${sheetNames.join(', ')}; hidden: ${hidden.join(', ') || 'none'}; dates from ${book.date1904 ? 1904 : 1900}`)

  // Tables takes every value.
  let refused = 0
  reading.columns.forEach((column, c) => reading.rows.forEach((row) => { if (checkCell(/** @type {any} */ ({ name: column.name, type: column.type }), row[c])) refused++ }))
  if (refused) misses.push(`${refused} values checkCell refuses`)
  return { file: `${expected.file} · ${expected.sheet}`, held: false, lang: expected.lang, heads, columns: scored + extra.length, kinds, names, currencies, moneys, rows, values, wrong, foot, dates, left, expectedLeft: expected.left?.length ?? 0, unsaid, silent, refused, whole, misses, ms, reading, book, expected }
}

/** The real sheets and the scripted ones, scored; the gate's table over them, by language and together. @param {boolean} dry */
async function publicScores(dry) {
  const items = loadPublic()
  /** @type {Awaited<ReturnType<typeof readPublic>>[]} */
  const real = []
  for (const item of items) real.push(await readPublic(item, dry))
  await makeAll()
  /** @type {Record<string, Truth>} */
  const truths = JSON.parse(await readFile(`${CACHE}truth.json`, 'utf8'))
  /** @type {Score[]} */
  const scripted = []
  for (const sheet of SET) scripted.push(await readOne(sheet, truths[sheet.file]))
  const statements = (/** @type {Score} */ score) => /^en-townsville · Table (?:[1-4]|[6-9]|10)$/.test(score.file)
  const tables = real.filter((score) => score.expected.table !== false)
  const figures = [HEAD,
    ...['fr', 'ja', 'ar', 'en'].map((lang) => line(`Real, ${{ fr: 'French', ja: 'Japanese', ar: 'Arabic', en: 'English' }[lang]} (${real.filter((score) => score.lang === lang).length})`, real.filter((score) => score.lang === lang))),
    line(`All ${real.length} real`, real), line(`The ${tables.length} real tables (no label/value sheet)`, tables), line(`Real, without the nine Townsville statements (${real.filter((score) => !statements(score)).length})`, real.filter((score) => !statements(score))),
    line(`The ${scripted.length} scripted`, scripted), line(`Real and scripted (${real.length + scripted.length})`, [...real, ...scripted])].join('\n')
  // What each real sheet is, as the person would be told: a list, or a report and what of it was left out; none, no table.
  const count = (/** @type {Score} */ score, /** @type {string} */ why) => score.reading.left.filter((one) => one.why === why).length
  const shapes = `| Sheet | Read as | Parts | Subtotals | Total (the foot) | Records joined |\n|---|---|---:|---:|---|---:|\n${real.map((score) => `| ${score.file} | ${score.reading.heads < 0 ? 'no table' : score.reading.shape} | ${count(score, 'section')} | ${count(score, 'subtotal')} | ${score.reading.foot ? `line ${score.reading.foot.at + 1}` : '—'} | ${count(score, 'joined')} |`).join('\n')}`
  return { real, scripted, items, figures, shapes }
}

/** @param {string[]} argv */
async function publicMode(argv) {
  const dry = argv.includes('--dry'), { real, scripted, items, figures, shapes } = await publicScores(dry)
  console.log(`spreadsheets --public${dry ? ' (dry: an empty reading, the reader not run)' : ''}: ${real.length} real sheets from ${new Set(items.map((item) => item.expected.file)).size} files, and the ${scripted.length} scripted\nThe gate: ${GATE}.\n`)
  console.log(figures)
  console.log(`\n${sheets(real)}\n\n${shapes}`)
  for (const score of real) {
    const { reading, book } = score
    console.log(`\n── ${score.file}: heads ${reading.heads + 1}, ${reading.rows.length} rows, dates ${JSON.stringify(reading.dates)}, foot ${JSON.stringify(reading.foot)}${score.ms ? `, ${Math.round(score.ms)} ms` : ''}`)
    for (const column of reading.columns) console.log(`   ${a1(0, column.at).replace(/\d+/, '').padEnd(3)} ${column.name}: ${column.type}${column.format ? ` ${column.format}` : ''}${column.currency ? ` ${column.currency}` : ''}${column.options ? ` [${column.options.slice(0, 6).join(' · ')}${column.options.length > 6 ? ' …' : ''}]` : ''}`)
    console.log(`   left out: ${reading.left.map((one) => `${one.where} ${one.why}`).join(', ') || 'nothing'}`)
    console.log(`   first row: ${JSON.stringify(reading.rows[0])}`)
    if (score.silent.length) console.log(`   wrong without a word (${score.silent.length}): ${score.silent.slice(0, 14).join('; ')}`)
    if (score.unsaid.length) console.log(`   unsaid (${score.unsaid.length}): ${score.unsaid.slice(0, 20).join(' ')}`)
    if (book.sheets.length > 1 && score.expected.book) console.log(`   offered first: ${dry ? '(dry)' : book.sheets[Math.max(first(book.sheets), 0)].name}`)
  }
}

// ── The second held-out set (--held-files) ──
// Thirteen public files expected in test/spreadsheets/held.js by someone who did not write the reader, read once with the frozen
// reader (its hashes checked against results.md first), each sheet scored by readPublic as the first sixteen are, with what
// held.js adds: lines that may be rows or not (maybe). Beside the gate: the flag (list or report) on these 14 sheets and on
// public.js's 34 (public-shape.js), as written (a list may end with a foot) and with a foot making a report; and each line a
// careful person leaves out of a report, said by line and by kind (heads again count as a part's name, a total that isn't the
// foot as a subtotal, as the reader names them). The 34 are read again, and their figures given as written and with Townsville's
// Tables 3, 4, 9 and 10 given the foot their last line is.
//   node scripts/spreadsheets.js --held-files [--dry]  (--dev: with a reader that isn't the frozen one, the set being spent)

/** The hashes results.md records under "Frozen", and the files' own. */
async function frozen() {
  const recorded = Object.fromEntries([...(await readFile(`${DIR}results.md`, 'utf8')).split('## Frozen')[1]?.matchAll(/\| test\/spreadsheets\/(cells|sheet)\.js \| `([0-9a-f]{64})` \|/g) ?? []].map((m) => [m[1], m[2]]))
  const own = Object.fromEntries(await Promise.all(['cells', 'sheet'].map(async (name) => [name, createHash('sha256').update(await readFile(`${DIR}${name}.js`)).digest('hex')])))
  return { recorded, own, same: !!recorded.cells && recorded.cells === own.cells && recorded.sheet === own.sheet }
}

/** A held sheet: its maybe lines expected as rows whose values aren't scored, then the rows judged with them either way. @param {ReturnType<typeof loadHeld>[number]} item @param {boolean} dry */
async function readHeld(item, dry, labels = undefined) {
  const { expected, truth } = item, maybe = new Set(truth.maybe)
  const score = await readPublic(/** @type {any} */ ({ ...item, truth: { ...truth, rows: [...truth.rows, ...truth.maybe.map((at) => ({ at, values: (expected.columns ?? []).map(() => ({ skip: true })) }))] } }), dry, labels)
  const read = new Set(score.reading.from)
  score.rows = truth.rows.every((row) => read.has(row.at)) && score.reading.from.every((at) => maybe.has(at) || truth.rows.some((row) => row.at === at))
  return score
}

/** The flag right or wrong: as written, and with a foot making a report; null where it isn't scored. @param {Score & { reading: any }} score @param {'list' | 'report' | null | undefined} want @param {boolean} foot */
const flag = (score, want, foot) => (want ? { got: score.reading.heads < 0 ? 'no table' : score.reading.shape, written: want, footed: want === 'report' || foot ? 'report' : 'list' } : null)

/**
 * Each line a careful person leaves out of a report (and each foot), as the reader took it: said (not a row, and left out as a
 * part, a subtotal or a total, or the foot), and of the kind expected. @param {any} score @param {{ line: number, kind: string }[]} lines @param {number | null | undefined} foot
 */
function reportLines(score, lines, foot) {
  return lines.map(({ line, kind }) => {
    const at = line - 1, mine = kind === 'heads' ? 'section' : kind === 'total' ? (line === foot ? 'total' : 'subtotal') : kind
    const entry = score.reading.left.find((/** @type {any} */ one) => ['section', 'subtotal', 'total'].includes(one.why) && range(one.where).top <= at && range(one.where).bottom >= at)
    const theirs = score.reading.foot?.at === at ? 'total' : entry?.why
    const said = !score.reading.from.includes(at) && !!theirs
    return { line, kind, mine, theirs: score.reading.from.includes(at) ? 'row' : theirs ?? 'not said', said, right: said && theirs === mine }
  })
}

/** @param {string[]} argv */
async function heldMode(argv) {
  const dry = argv.includes('--dry'), hashes = await frozen()
  if (!dry && !hashes.same && !argv.includes('--dev')) throw new Error(`the reader isn't the frozen one: results.md ${JSON.stringify(hashes.recorded)}, files ${JSON.stringify(hashes.own)}`)
  const items = loadHeld()
  /** @type {Awaited<ReturnType<typeof readHeld>>[]} */
  const held = []
  for (const item of items) held.push(await readHeld(item, dry))
  console.log(`spreadsheets --held-files${dry ? ' (dry: an empty reading, the reader not run)' : ''}: ${held.length} held sheets from ${new Set(items.map((item) => item.expected.file)).size} files; cells.js ${hashes.own.cells}, sheet.js ${hashes.own.sheet}, ${hashes.same ? 'as frozen in results.md' : 'NOT as frozen'}\nThe gate: ${GATE}.\n`)
  const { real, scripted } = await publicScores(dry)
  // The four Townsville statements whose last line adds up every row (to rounding), given that line as their foot.
  const LAST = /** @type {Record<string, number>} */ ({ 'Table 3': 27, 'Table 4': 15, 'Table 9': 27, 'Table 10': 18 })
  const fixedItems = loadPublic().filter((item) => item.expected.file === 'en-townsville' && LAST[item.expected.sheet]).map((item) => ({ ...item, expected: { ...item.expected, foot: LAST[item.expected.sheet] }, truth: { ...item.truth, foot: LAST[item.expected.sheet] - 1 } }))
  /** @type {Awaited<ReturnType<typeof readPublic>>[]} */
  const fixed = []
  for (const item of fixedItems) {
    // The foot's sums are that line's figures, as written (they add up every row to the thousand dollars they're rounded to).
    const book = await cellsOf(item.name, item.bytes), cells = book.sheets.find((one) => one.name === item.expected.sheet)?.cells[item.truth.foot] ?? []
    item.truth.sums = (item.expected.columns ?? []).map((column, i) => ((cell) => (column.type === 'number' && cell?.kind === 'number' ? /** @type {number} */ (cell.value) : null))(cells[item.truth.cols[i]]))
    fixed.push(await readPublic(item, dry))
  }
  const realFixed = real.map((score) => fixed.find((one) => one.file === score.file) ?? score)
  console.log([HEAD, ...['fr', 'ja', 'ar', 'en'].map((lang) => line(`Held, ${{ fr: 'French', ja: 'Japanese', ar: 'Arabic', en: 'English' }[lang]} (${held.filter((score) => score.lang === lang).length})`, held.filter((score) => score.lang === lang))),
    line(`All ${held.length} held`, held), line(`The 34 public, as written`, real), line(`The 34 public, Townsville 3, 4, 9, 10 with their foot`, realFixed), line(`The ${scripted.length} scripted`, scripted),
    line(`Held, public and scripted (${held.length + real.length + scripted.length})`, [...held, ...real, ...scripted])].join('\n'))
  console.log(`\n${sheets(held)}`)

  // The flag.
  const flags = [...held.map((score) => ({ set: 'held', file: score.file, ...(score.expected.shapeSkip ? { skip: score.expected.shapeSkip } : {}), result: score.expected.shapeSkip ? null : flag(score, score.expected.shape, !!score.expected.shapeFoot) })),
    ...real.map((score) => { const shape = SHAPES.find((one) => `${one.file} · ${one.sheet}` === score.file); return { set: 'public', file: score.file, ...(shape?.why && shape.shape === null ? { skip: shape.why } : {}), result: flag(score, shape?.shape, !!shape?.foot) } })]
  const tally = (/** @type {string} */ set, /** @type {'written' | 'footed'} */ way) => ((list) => `${list.filter((one) => one.result?.got === one.result?.[way]).length}/${list.length}`)(flags.filter((one) => one.set === set && one.result))
  console.log(`\nThe flag (list or report): held ${tally('held', 'written')} as written, ${tally('held', 'footed')} with a foot making a report; public ${tally('public', 'written')} as written, ${tally('public', 'footed')} with a foot making a report.\n`)
  console.log(`| Set | Sheet | Read as | Expected (as written) | Expected (a foot makes a report) |\n|---|---|---|---|---|\n${flags.map((one) => `| ${one.set} | ${one.file} | ${one.result?.got ?? '—'} | ${one.result ? `${one.result.written}${one.result.got === one.result.written ? '' : ' **miss**'}` : `not scored: ${one.skip ?? '—'}`} | ${one.result ? `${one.result.footed}${one.result.got === one.result.footed ? '' : ' **miss**'}` : '—'} |`).join('\n')}`)

  // The lines a careful person leaves out of a report, and the feet.
  const heldLines = held.map((score) => ({ file: score.file, lines: reportLines(score, [...(score.expected.left ?? []).filter((one) => ['section', 'subtotal', 'total', 'heads'].includes(one.why)).flatMap((one) => { const box = range(one.where); return Array.from({ length: box.bottom - box.top + 1 }, (_, i) => ({ line: box.top + i + 1, kind: one.why })) }), ...(score.expected.foot ? [{ line: score.expected.foot, kind: 'total' }] : [])], score.expected.foot) }))
  const publicLines = (/** @type {typeof real} */ scores, /** @type {boolean} */ corrected) => scores.map((score) => { const shape = SHAPES.find((one) => `${one.file} · ${one.sheet}` === score.file); return { file: score.file, lines: reportLines(score, Object.entries(shape?.lines ?? {}).flatMap(([kind, lines]) => (lines ?? []).map((line) => ({ line, kind }))), corrected && fixed.some((one) => one.file === score.file) ? fixedItems.find((one) => `${one.expected.file} · ${one.expected.sheet}` === score.file)?.expected.foot : score.expected.foot) } })
  const sum = (/** @type {{ lines: any[] }[]} */ list, /** @type {string} */ key) => `${list.reduce((n, one) => n + one.lines.filter((line) => line[key]).length, 0)}/${list.reduce((n, one) => n + one.lines.length, 0)}`
  console.log(`\nLines left out of reports, and feet: held ${sum(heldLines, 'said')} said, ${sum(heldLines, 'right')} of the right kind; public ${sum(publicLines(real, false), 'said')} said, ${sum(publicLines(real, false), 'right')} of the right kind (${sum(publicLines(real, true), 'right')} with Townsville's four feet).`)
  for (const one of [...heldLines, ...publicLines(real, false)]) { const off = one.lines.filter((line) => !line.right); if (off.length) console.log(`   ${one.file}: ${off.map((line) => `${line.line} ${line.kind}${line.mine !== line.kind ? ` (${line.mine})` : ''} → ${line.theirs}`).join(', ')}`) }

  // Each held sheet as read.
  for (const score of held) {
    const { reading } = score
    console.log(`\n── ${score.file}: heads ${reading.heads + 1}, ${reading.rows.length} rows, ${reading.shape}, dates ${JSON.stringify(reading.dates)}, foot ${JSON.stringify(reading.foot)}`)
    for (const column of reading.columns) console.log(`   ${a1(0, column.at).replace(/\d+/, '').padEnd(3)} ${column.name}: ${column.type}${column.format ? ` ${column.format}` : ''}${column.currency ? ` ${column.currency}` : ''}${column.options ? ` [${column.options.slice(0, 6).join(' · ')}${column.options.length > 6 ? ' …' : ''}]` : ''}`)
    console.log(`   left out: ${reading.left.map((one) => `${one.where} ${one.why}`).join(', ') || 'nothing'}`)
    console.log(`   rows from lines: ${reading.from.map((at) => at + 1).join(' ').slice(0, 400)}`)
    console.log(`   first row: ${JSON.stringify(reading.rows[0])?.slice(0, 400)}`)
    if (score.silent.length) console.log(`   wrong without a word (${score.silent.length}): ${score.silent.slice(0, 14).join('; ')}`)
    if (score.unsaid.length) console.log(`   unsaid (${score.unsaid.length}): ${score.unsaid.slice(0, 20).join(' ')}`)
  }
  console.log(`\nThe 34 public, Townsville's four with their foot:\n${sheets(fixed)}`)
}

// ── The third held-out set (--third) ──
// Thirteen public files of everyday lists, expected in test/spreadsheets/third.js by someone who did not write the reader, read
// with the frozen reader (cells.js, sheet.js and layout.js, checked against results.md first), each sheet scored by readHeld as the
// second set is. Without --brain: the rules alone against the gate, their doubts (on the sheets read wrong, and false alarms on
// the right ones, by kind), what the person would face with no brain, and the flag both ways. With --brain: the doubted sheets
// shown to the brain as brainMode shows them, read again with its labels, and reported by brainReport, with tokens, seconds and
// answers not taken.
//   node scripts/spreadsheets.js --third [--dry]
//   BRAIN=claudecode:haiku node scripts/spreadsheets.js --third --brain [--runs 3] [--save <file.jsonl>] [--parallel 3]
//   node scripts/spreadsheets.js --third --brain --from <a.jsonl>,<b.jsonl>     score kept answers again, asking no brain

/** The three frozen hashes results.md records (its last "Frozen" table), and the files' own. */
async function frozenThree() {
  const table = (await readFile(`${DIR}results.md`, 'utf8')).split('## Frozen').at(-1) ?? ''
  const recorded = Object.fromEntries([...table.matchAll(/\| test\/spreadsheets\/(cells|sheet|layout)\.js \| `([0-9a-f]{64})` \|/g)].map((m) => [m[1], m[2]]))
  const own = Object.fromEntries(await Promise.all(['cells', 'sheet', 'layout'].map(async (name) => [name, createHash('sha256').update(await readFile(`${DIR}${name}.js`)).digest('hex')])))
  return { recorded, own, same: ['cells', 'sheet', 'layout'].every((name) => !!recorded[name] && recorded[name] === own[name]) }
}

/** The third set's sheets, each with what a brain is shown and its score with or without labels. */
async function thirdSheets() {
  const all = []
  for (const item of loadThird()) {
    const file = `${item.expected.file} · ${item.expected.sheet}`, book = await cellsOf(item.name, item.bytes), sheet = book.sheets.find((one) => one.name === item.expected.sheet) ?? book.sheets[0]
    all.push({ set: 'third', file, item, cells: sheet.cells, merges: sheet.merges, score: (/** @type {any} */ labels = undefined) => readHeld(/** @type {any} */ (item), false, labels) })
  }
  return all
}

/** @param {string[]} argv @param {Record<string, string | undefined>} env */
async function thirdMode(argv, env) {
  const dry = argv.includes('--dry'), hashes = await frozenThree(), arg = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  if (!dry && !hashes.same) throw new Error(`the reader isn't the frozen one: results.md ${JSON.stringify(hashes.recorded)}, files ${JSON.stringify(hashes.own)}`)
  const all = await thirdSheets(), base = new Map()
  for (const one of all) base.set(one.file, await readHeld(/** @type {any} */ (one.item), dry))
  if (argv.includes('--brain')) return thirdBrain(argv, env, all, base, arg)
  const scores = all.map((one) => base.get(one.file))
  console.log(`spreadsheets --third${dry ? ' (dry: an empty reading, the reader not run)' : ''}: ${scores.length} sheets; cells.js ${hashes.own.cells}, sheet.js ${hashes.own.sheet}, layout.js ${hashes.own.layout}, ${hashes.same ? 'as frozen in results.md' : 'NOT as frozen'}\nThe gate: ${GATE}.\n`)
  console.log([HEAD, ...['fr', 'ja', 'ar', 'en'].map((lang) => ((list) => line(`Third, ${{ fr: 'French', ja: 'Japanese', ar: 'Arabic', en: 'English' }[lang]} (${list.length})`, list))(scores.filter((score) => score.lang === lang))),
    line(`All ${scores.length}`, scores)].join('\n'))
  console.log(`\n${sheets(scores)}`)
  // The doubts.
  const doubts = (/** @type {any} */ score) => score.reading.doubts ?? [], wrong = (/** @type {any} */ score) => score.silent.length > 0
  const bad = scores.filter(wrong), good = scores.filter((score) => !wrong(score)), kinds = ['misfit', 'total', 'sums', 'words', 'end', 'long', 'merged']
  console.log(`\nThe doubts: ${bad.length} sheets read wrong without a word, ${bad.filter((score) => doubts(score).length).length} carrying a doubt; ${good.filter((score) => doubts(score).length).length} of ${good.length} right sheets carrying one (false alarms).`)
  for (const score of bad) console.log(`   wrong: ${score.file}: ${[...new Set(doubts(score).map((/** @type {any} */ one) => one.kind))].join(', ') || 'NO DOUBT'}`)
  console.log(`\n| Doubt | Sheets wrong it is on | Right sheets it is on (false alarms) | Places, all sheets |\n|---|---:|---:|---:|\n${kinds.map((kind) => `| ${kind} | ${bad.filter((score) => doubts(score).some((/** @type {any} */ one) => one.kind === kind)).length} | ${good.filter((score) => doubts(score).some((/** @type {any} */ one) => one.kind === kind)).length} | ${scores.reduce((n, score) => n + doubts(score).filter((/** @type {any} */ one) => one.kind === kind).length, 0)} |`).join('\n')}`)
  for (const score of scores.filter((one) => doubts(one).length)) console.log(`   ${wrong(score) ? 'wrong' : 'right'} ${score.file}: ${doubts(score).map((/** @type {any} */ one) => `${one.kind} ${one.at}${one.why ? ` (${one.why})` : ''}`).join('; ').slice(0, 600)}`)
  // What the person would face with no brain.
  console.log(`\nWith no brain: ${good.filter((score) => !doubts(score).length).length} sheets right with no doubt; ${scores.filter((score) => doubts(score).length).length} with doubts (${scores.reduce((n, score) => n + doubts(score).length, 0)} questions; ${good.filter((score) => doubts(score).length).length} of them right as read, ${bad.filter((score) => doubts(score).length).length} wrong); ${bad.filter((score) => !doubts(score).length).length} wrong with no doubt (silent).`)
  // The flag.
  const flags = all.map((one) => ({ file: one.file, result: flag(base.get(one.file), one.item.expected.shape, !!one.item.expected.shapeFoot) }))
  console.log(`\nThe flag: ${flags.filter((one) => one.result?.got === one.result?.written).length}/${flags.length} as written (a list may end with a foot), ${flags.filter((one) => one.result?.got === one.result?.footed).length}/${flags.length} with a foot making a report.`)
  for (const one of flags) if (one.result?.got !== one.result?.written || one.result?.got !== one.result?.footed) console.log(`   ${one.file}: read as ${one.result?.got}, expected ${one.result?.written} (as written), ${one.result?.footed} (a foot makes a report)`)
  // Each sheet as read.
  for (const score of scores) {
    const { reading } = score
    console.log(`\n── ${score.file}: heads ${reading.heads + 1}, ${reading.rows.length} rows, ${reading.shape}, dates ${JSON.stringify(reading.dates)}, foot ${JSON.stringify(reading.foot)}`)
    for (const column of reading.columns) console.log(`   ${a1(0, column.at).replace(/\d+/, '').padEnd(3)} ${column.name}: ${column.type}${column.format ? ` ${column.format}` : ''}${column.currency ? ` ${column.currency}` : ''}${column.options ? ` [${column.options.slice(0, 6).join(' · ')}${column.options.length > 6 ? ' …' : ''}]` : ''}`)
    console.log(`   left out: ${reading.left.map((/** @type {any} */ one) => `${one.where} ${one.why}`).join(', ').slice(0, 900) || 'nothing'}`)
    console.log(`   rows from lines: ${reading.from.map((/** @type {number} */ at) => at + 1).join(' ').slice(0, 300)}`)
    console.log(`   first row: ${JSON.stringify(reading.rows[0])?.slice(0, 400)}`)
    if (doubts(score).length) console.log(`   doubts: ${doubts(score).map((/** @type {any} */ one) => `${one.kind} ${one.at}`).join(', ')}`)
    if (score.silent.length) console.log(`   wrong without a word (${score.silent.length}): ${score.silent.slice(0, 14).join('; ')}`)
    if (score.unsaid.length) console.log(`   unsaid (${score.unsaid.length}): ${score.unsaid.slice(0, 20).join(' ')}`)
  }
}

/**
 * The doubted third sheets read by a brain, as brainMode reads the others: at most three calls at a time, a limit stopping the run.
 * @param {string[]} argv @param {Record<string, string | undefined>} env @param {any[]} all @param {Map<string, any>} base @param {(name: string) => string | undefined} arg
 */
async function thirdBrain(argv, env, all, base, arg) {
  /** @type {any[]} */
  let records = []
  const from = arg('--from'), chosen = all.filter((one) => (base.get(one.file).reading.doubts ?? []).length)
  if (from) records = (await Promise.all(from.split(',').map((file) => readFile(file, 'utf8')))).flatMap((text) => text.split('\n').filter(Boolean).map((one) => JSON.parse(one)))
  else {
    if (!env.BRAIN) throw new Error('name a brain: BRAIN=<provider>:<model> (cli/brain.js)')
    const { chooseBrain } = await import('../cli/brain.js'), { streamChat } = await import('../app/core/llm.js'), { ask, take } = await import('../test/spreadsheets/layout.js')
    const found = await chooseBrain({ named: env.BRAIN, address: env.BRAIN_ADDRESS, env })
    if (!found || 'needs' in found) throw new Error(`no brain "${env.BRAIN}"`)
    const brain = `${found.brain.model} (${found.brain.provider})`, runs = Number(arg('--runs') ?? 3), save = arg('--save'), parallel = Math.min(3, Number(arg('--parallel') ?? 3))
    const jobs = Array.from({ length: runs }, (_, run) => chosen.map((one) => ({ one, run: run + 1 }))).flat()
    console.log(`spreadsheets --third --brain: ${brain}, the ${chosen.length} doubted sheets of ${all.length}, ${runs} runs, ${jobs.length} calls, ${parallel} at a time`)
    let stopped = '', failures = 0, next = 0
    try {
      await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, async () => {
        while (next < jobs.length && !stopped) {
          const { one, run } = jobs[next++], reading = base.get(one.file).reading, { system, text, shown } = ask(one.cells, one.merges, reading), started = performance.now()
          /** @type {any} */
          let record = { brain, run, set: one.set, file: one.file, every: false }
          try {
            let answer = ''
            const tokens = { in: 0, out: 0 }
            for await (const event of streamChat({ brain: found.brain, apiKey: found.apiKey, system, messages: [{ role: 'user', content: text }], maxTokens: 2000, signal: AbortSignal.timeout(240_000) })) {
              if (event.type === 'text') answer += event.delta
              if (event.type === 'done') { tokens.in += event.usage?.inputTokens ?? 0; tokens.out += event.usage?.outputTokens ?? 0 }
            }
            if (/^(API )?Error: /.test(answer.trim())) throw new Error(answer.trim().slice(0, 300))
            const taken = take(answer, { height: one.cells.length, width: Math.max(0, ...one.cells.map((/** @type {any[]} */ cells) => cells.length)), shown })
            record = { ...record, tokens, ms: Math.round(performance.now() - started), failed: taken.failed, dropped: taken.dropped, labels: taken.labels, answer: answer.slice(0, 1500) }
            failures = 0
          } catch (error) {
            record = { ...record, error: String(/** @type {Error} */ (error).message).slice(0, 300) }
            if (isLimit(error) || ++failures >= 6) stopped ||= record.error
          }
          records.push(record)
          if (save) await appendFile(save, `${JSON.stringify(record)}\n`)
          console.log(`${String(records.length).padStart(3)}/${jobs.length} ${one.file} run ${run}: ${record.error ? `error ${record.error}` : `${record.failed ? 'not taken' : `${Object.keys(record.labels?.lines ?? {}).length} lines, ${Object.keys(record.labels?.kinds ?? {}).length} columns`}${record.dropped?.length ? `, dropped ${record.dropped.join('; ')}` : ''}, ${record.tokens.in}+${record.tokens.out} tokens, ${Math.round(record.ms / 100) / 10} s`}`)
        }
      }))
    } finally {
      await /** @type {any} */ (found).close?.()
    }
    if (stopped) console.log(`\nStopped after ${records.length} of ${jobs.length} calls, nothing asked again: ${stopped}`)
  }
  console.log(`\n${await brainReport(records, all, base)}`)
  for (const brain of [...new Set(records.map((one) => one.brain))]) {
    const done = records.filter((one) => one.brain === brain && !one.error), mean = (/** @type {(one: any) => number} */ of) => (done.length ? Math.round(done.reduce((n, one) => n + of(one), 0) / done.length) : 0)
    console.log(`${brain}: ${done.length} answers, ${records.filter((one) => one.brain === brain && one.error).length} calls failed; a sheet ${mean((one) => one.tokens?.in ?? 0)} tokens in and ${mean((one) => one.tokens?.out ?? 0)} out, ${Math.round(mean((one) => one.ms ?? 0) / 100) / 10} s; JSON not taken ${done.filter((one) => one.failed).length}, answers with something dropped ${done.filter((one) => one.dropped?.length).length}.`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch((error) => { console.error(error); process.exitCode = 1 })
