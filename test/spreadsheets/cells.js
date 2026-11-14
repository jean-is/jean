// SPDX-License-Identifier: MIT
// A workbook or a CSV file as typed cells (collections, phase 0a; to live beside sheetRows in caps/files/extract.js, which gives
// one string per row): each sheet's name, whether it is hidden, its merged ranges, and a grid of cells, each with its kind, a
// number's format (a date, a share, money and the sign it is written with) and whether a formula made it. A date is written as
// ISO 8601, counted from 1904 where the workbook says so. How a Japanese word is read, which Excel keeps beside it, is left out;
// so is a dash alone, an accountant's nothing. CSV and tab-separated text come through Made's reader, every cell text, Shift_JIS
// told apart. A small scan, no DOMParser: workers and Node run it.
import { readZip } from '../../app/core/zip.js'
import { attr, columnIndex, dateStyles, decodeEntities, decodeText, relationships, resolveTarget } from '../../app/caps/files/extract.js'
import { csvRows } from '../../app/caps/made/formats.js'

/**
 * A cell; value: text, a number, true or false, a date as 2026-03-04 or 2026-03-04T14:30, null when empty; currency: the sign its
 * format writes beside the number ("€", "EGP", "円"), a currency's for sure when format is money; formula: a formula made it, and
 * an empty one kept no result.
 * @typedef {{ value: string | number | boolean | null, kind: 'text' | 'number' | 'date' | 'boolean' | 'empty', format?: 'money' | 'percent', currency?: string, formula?: boolean }} Cell
 */
/** Merged cells, counted from 0, ends included. @typedef {{ top: number, left: number, bottom: number, right: number }} Range */
/** @typedef {{ name: string, hidden: boolean, cells: Cell[][], merges: Range[] }} Sheet */
/** @typedef {{ sheets: Sheet[], date1904: boolean }} Workbook */
/** What a cell style shows a number as; code: as digits set apart, a phone or a postcode, each 0 or # a digit. @typedef {{ date?: boolean, format?: 'money' | 'percent', currency?: string, code?: string }} Shown */

const decoder = new TextDecoder()
/** @type {Cell} */
const EMPTY = { value: null, kind: 'empty' }
const CODES = new Set(Intl.supportedValuesOf('currency'))
/** A dash alone, an accountant's nothing: an empty cell. */
const DASH = /^\s*[-–—―ー−]\s*$/

/**
 * A spreadsheet's cells: a workbook's sheets, or a CSV or tab-separated file as one sheet named after it.
 * @param {string} name the file's, for its extension @param {Uint8Array} bytes @returns {Promise<Workbook>}
 */
export async function cellsOf(name, bytes) {
  if (!/\.xlsx$/i.test(name)) return { date1904: false, sheets: [{ name: name.replace(/\.[^.]+$/, ''), hidden: false, merges: [], cells: csvRows(decoded(bytes)).map((row) => row.map((value) => (value && !DASH.test(value) ? { value, kind: 'text' } : EMPTY))) }] }
  const entries = new Map(readZip(bytes).map((entry) => [entry.name, entry]))
  /** @param {string} path */
  const xml = async (path) => ((entry) => (entry ? entry.read().then((part) => decoder.decode(part)) : ''))(entries.get(path))
  const book = await xml('xl/workbook.xml'), targets = relationships(await xml('xl/_rels/workbook.xml.rels'))
  const shared = strings(await xml('xl/sharedStrings.xml')), styles = shown(await xml('xl/styles.xml')), date1904 = /<workbookPr\b[^>]*\sdate1904="(?:1|true)"/.test(book)
  /** @type {Sheet[]} */
  const sheets = []
  for (const [, attrs] of book.matchAll(/<sheet\b([^>]*)>/g)) {
    const target = targets.get(attr(attrs, 'r:id') ?? '')
    sheets.push({ name: attr(attrs, 'name') ?? '', hidden: /hidden/i.test(attr(attrs, 'state') ?? ''), ...sheetCells(target ? await xml(resolveTarget('xl', target)) : '', shared, styles, date1904) })
  }
  return { sheets, date1904 }
}

/**
 * A text file's words: UTF-16 by its mark, UTF-8 when valid, Shift_JIS when it reads cleanly into Japanese (most Japanese offices'
 * CSV), else Files' guess, Windows-1252. @param {Uint8Array} bytes
 */
function decoded(bytes) {
  if (bytes[0] !== 0xff && bytes[0] !== 0xfe) for (const label of ['utf-8', 'shift_jis']) {
    try {
      const text = new TextDecoder(label, { fatal: true }).decode(bytes)
      if (label === 'utf-8' || /[\u3040-\u30ff\u4e00-\u9fff]/.test(text)) return text.replace(/\r\n?/g, '\n')
    } catch {}
  }
  return decodeText(bytes)
}

/** The words of a string or of a cell that holds its own: its runs joined, without how they are read (rPh). @param {string} xml */
const words = (xml) => decodeEntities([...xml.replace(/<rPh\b.*?<\/rPh>/gs, '').matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map((run) => run[1]).join(''))

/** A workbook's shared strings. @param {string} source xl/sharedStrings.xml */
export const strings = (source) => [...source.matchAll(/<si\b[^>]*?(?:\/>|>(.*?)<\/si>)/gs)].map((item) => words(item[1] ?? ''))

/**
 * What each cell style (its place in cellXfs) shows a number as: a date (dateStyles), a share, or money, by Excel's own formats
 * (9 and 10; 5 to 8, 42 and 44, which name no currency unless the file writes their code down) or a custom code's first part:
 * a % outside quotes, a currency in [$€-40C], a currency's sign, or its code in quotes. Any other words beside the number are
 * given as its sign, for whoever knows the region's currencies. A code of digits set apart or of zeros in front (France's
 * 0# ## ## ## ##, 00000) writes a phone or a postcode, which is text. @param {string} source xl/styles.xml @returns {Shown[]}
 */
export function shown(source) {
  const dates = dateStyles(source), codes = new Map([...source.matchAll(/<numFmt\b([^>]*)>/g)].map((format) => [Number(attr(format[1], 'numFmtId')), attr(format[1], 'formatCode') ?? '']))
  return [...(/<cellXfs\b[^>]*>(.*?)<\/cellXfs>/s.exec(source)?.[1] ?? '').matchAll(/<xf\b([^>]*)>/g)].map(([, attrs], i) => {
    const id = Number(attr(attrs, 'numFmtId') ?? 0), code = codes.get(id)
    if (dates.has(i)) return { date: true }
    if (code === undefined) return id === 9 || id === 10 ? { format: 'percent' } : (id >= 5 && id <= 8) || id === 42 || id === 44 ? { format: 'money' } : {}
    const first = code.split(';')[0]
    if (/^(?:[0#]|"[ \-./()]*"|\\[ \-./()]|[ \-()/])+$/.test(first) && /^00|[^0#]/.test(first)) return { code: first.replace(/["\\]/g, '') }
    let sign = '', money = false, percent = false
    for (const [, quoted, escaped, currency, bare, share, end] of code.matchAll(/"([^"]*)"|\\(.)|\[\$([^\]-]*)[^\]]*\]|\[[^\]]*\]|[_*].|(\p{Sc})|(%)|(;)|./gsu)) {
      if (end) break
      sign += quoted ?? escaped ?? currency ?? bare ?? ''
      money ||= !!currency
      percent ||= !!share
    }
    sign = sign.trim()
    return percent ? { format: 'percent' } : { ...((money || /\p{Sc}/u.test(sign) || CODES.has(sign.toUpperCase())) && { format: 'money' }), ...(sign && { currency: sign }) }
  })
}

/** A whole number as a code of digits writes it: 612345678 under 0# ## ## ## ## is 06 12 34 56 78. @param {number} n @param {string} code */
function coded(n, code) {
  const digits = [...String(n)]
  const out = [...code].reduceRight((text, one) => (one === '0' ? digits.pop() ?? '0' : one === '#' ? digits.pop() ?? '' : one) + text, '')
  return (digits.join('') + out).trim()
}

/** A count of days as a date, with its time when it has one; a time alone as 14:30. @param {number} serial @param {boolean} date1904 @returns {Cell} */
function dated(serial, date1904) {
  const minutes = Math.round(serial * 1440)
  if (!(serial >= 0 && serial < 2958466)) return { value: serial, kind: 'number' }
  const iso = new Date((date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)) + minutes * 60000).toISOString()
  return serial < 1 && !date1904 ? { value: iso.slice(11, 16), kind: 'text' } : { value: iso.slice(0, minutes % 1440 ? 16 : 10), kind: 'date' }
}

/**
 * A worksheet's cells and merged ranges. A cell with no place follows the one before it.
 * @param {string} source @param {string[]} shared @param {Shown[]} styles @param {boolean} date1904 @returns {{ cells: Cell[][], merges: Range[] }}
 */
export function sheetCells(source, shared, styles, date1904) {
  /** @type {Cell[][]} */
  const cells = []
  let row = -1
  for (const [, at, inside] of source.matchAll(/<row\b([^>]*?)(?:\/>|>(.*?)<\/row>)/gs)) {
    row = Number(/(?:^|\s)r="(\d+)"/.exec(at)?.[1] ?? row + 2) - 1
    let column = -1
    for (const [, attrs, body = ''] of (inside ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const ref = /(?:^|\s)r="([A-Z]+)\d+"/.exec(attrs)?.[1], type = /(?:^|\s)t="(\w+)"/.exec(attrs)?.[1] ?? 'n', raw = /<v\b[^>]*>([^<]*)<\/v>/.exec(body)?.[1]
      const style = styles[Number(/(?:^|\s)s="(\d+)"/.exec(attrs)?.[1] ?? 0)] ?? {}, formula = /<f[\s>/]/.test(body)
      column = ref ? columnIndex(ref) : column + 1
      /** @type {Cell} */
      let cell = EMPTY
      if (type === 's' || type === 'inlineStr' || type === 'str' || type === 'e') {
        const value = type === 's' ? shared[Number(raw)] ?? '' : type === 'inlineStr' ? words(body) : decodeEntities(raw ?? '')
        if (value.trim() && !DASH.test(value)) cell = { value, kind: 'text' }
      } else if (raw === undefined || raw === '') cell = EMPTY
      else if (type === 'b') cell = { value: raw === '1', kind: 'boolean' }
      else if (type === 'd') cell = { value: raw.slice(0, /T(?!00:00)/.test(raw) ? 16 : 10), kind: 'date' }
      else if (style.code && /^\d+$/.test(raw)) cell = { value: coded(Number(raw), style.code), kind: 'text' }
      else cell = style.date ? dated(Number(raw), date1904) : { value: Number(raw), kind: 'number', ...(style.format && { format: style.format }), ...(style.currency && { currency: style.currency }) }
      if (cell === EMPTY && !formula) continue
      for (let r = cells.length; r <= row; r++) cells.push([])
      for (let c = cells[row].length; c < column; c++) cells[row].push(EMPTY)
      cells[row][column] = formula ? { ...cell, formula } : cell
    }
  }
  const merges = [...source.matchAll(/<mergeCell\b[^>]*\sref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)].map(([, left, top, right, bottom]) => ({ top: Number(top) - 1, left: columnIndex(left), bottom: Number(bottom) - 1, right: columnIndex(right) }))
  return { cells, merges }
}
