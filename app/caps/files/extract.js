// Text out of the files people share: Word, PowerPoint and Excel (zips of XML), Numbers (numbers.js),
// and plain text. Returns pages, so the brain can read a long file a part at a time.
// A small tag scanner instead of DOMParser keeps this runnable in workers and Node.
// PDFs are read by pdf.js, in the Files capability; their pages' text is joined here.
import { readZip } from '../../core/zip.js'

/** @typedef {import('../../core/zip.js').ZipEntry} ZipEntry */

const PAGE_CHARS = 4000
const SHEET_ROWS = 200
const TEXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|log|ya?ml|ini|srt|vtt|sd-jwt)$/i

/** @param {string} name */
export const extractable = (name) => /\.(docx|pptx|xlsx|numbers)$/i.test(name) || TEXT.test(name)

/**
 * @param {string} name file name, used for its extension
 * @param {Uint8Array} bytes
 * @returns {Promise<string[] | null>} pages, or null when the format isn't handled here
 */
export async function extractPages(name, bytes) {
  const ext = name.toLowerCase().split('.').pop()
  // An .xls that is text, as many exports are, reads as its text; one of Excel's own isn't read.
  if (TEXT.test(name) || (ext === 'xls' && !isBinary(bytes))) return paginate(decodeText(bytes).split('\n'))
  if (ext !== 'docx' && ext !== 'pptx' && ext !== 'xlsx' && ext !== 'numbers') return null
  if (ext === 'numbers') return tablePages(await (await import('./numbers.js')).numbersTables(readZip(bytes)))
  const entries = new Map(readZip(bytes).map((entry) => [entry.name, entry]))
  /** @param {string} path */
  const xml = async (path) => {
    const entry = entries.get(path)
    return entry ? decoder.decode(await entry.read()) : null
  }
  if (ext === 'docx') return docx((await xml('word/document.xml')) ?? '')
  if (ext === 'pptx') return pptx(xml, [...entries.keys()])
  return xlsx(xml)
}

const decoder = new TextDecoder()

/** UTF-16 when it starts with its byte order mark (what Windows' Notepad and PowerShell may save). @param {Uint8Array} bytes */
const wide = (bytes) => (bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : '')

/** Whether a file's bytes are data rather than text: a zero in its first 8000, as Git tells, unless it is UTF-16. @param {Uint8Array} bytes */
export const isBinary = (bytes) => !wide(bytes) && bytes.subarray(0, 8000).includes(0)

/** UTF-16 when it says so, UTF-8 when valid, else Windows-1252 (what older Windows apps save). @param {Uint8Array} bytes */
export function decodeText(bytes) {
  if (wide(bytes)) return new TextDecoder(wide(bytes)).decode(bytes).replace(/\r\n?/g, '\n')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n')
  } catch {
    return new TextDecoder('windows-1252').decode(bytes).replace(/\r\n?/g, '\n')
  }
}

/**
 * Groups lines into pages of about PAGE_CHARS characters.
 * @param {string[]} lines
 */
export function paginate(lines) {
  /** @type {string[]} */
  const pages = []
  let page = ''
  for (const line of lines) {
    if (page && page.length + line.length > PAGE_CHARS) {
      pages.push(page.trimEnd())
      page = ''
    }
    page += line + '\n'
  }
  if (page.trim() || !pages.length) pages.push(page.trimEnd())
  return pages
}

// ─── XML scanning ────────────────────────────────────────────────────────────

/**
 * @typedef {{ close: boolean, name: string, attrs: string, selfClosing: boolean } | { text: string }} XmlToken
 */

const TOKEN = /<[?!][^>]*>|<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g

/** @param {string} source @returns {Generator<XmlToken>} */
function* tokens(source) {
  for (const match of source.matchAll(TOKEN)) {
    if (match[5] !== undefined) yield { text: decodeEntities(match[5]) }
    else if (match[2]) yield { close: match[1] === '/', name: match[2], attrs: match[3], selfClosing: match[4] === '/' }
  }
}

/** @param {string} attrs @param {string} name */
export function attr(attrs, name) {
  const match = new RegExp(`(?:^|\\s)${name.replace(/[.:]/g, '\\$&')}="([^"]*)"`).exec(attrs)
  return match ? decodeEntities(match[1]) : null
}

const ENTITIES = /** @type {Record<string, string>} */ ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })

/** XML's entities, named and numbered, as text. @param {string} text */
export function decodeEntities(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, body) => {
    if (body[0] !== '#') return ENTITIES[body] ?? entity
    const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1))
    return Number.isFinite(code) ? String.fromCodePoint(code) : entity
  })
}

// ─── Word ────────────────────────────────────────────────────────────────────

/**
 * Paragraphs become lines (headings get `#`), tables become `| a | b |` rows, and
 * Word's last rendered page breaks become pages when there are any.
 * @param {string} source word/document.xml
 */
export function docx(source) {
  /** @type {string[][]} */
  const pages = [[]]
  let para = ''
  let heading = 0
  let inText = false
  let depth = 0 // table nesting
  /** @type {string[]} */
  let row = []
  let cell = ''
  const newPage = () => {
    if (pages.at(-1)?.some((line) => line.trim())) pages.push([])
  }
  for (const token of tokens(source)) {
    if ('text' in token) {
      if (inText) para += token.text
      continue
    }
    const { name, close, attrs, selfClosing } = token
    if (name === 'w:t') inText = !close && !selfClosing
    else if (name === 'w:tab' && !close) para += '\t'
    else if (name === 'w:br' && !close) {
      if (attr(attrs, 'w:type') === 'page') newPage()
      else para += '\n'
    } else if (name === 'w:lastRenderedPageBreak' && depth === 0) {
      if (para.trim()) /** @type {string[]} */ (pages.at(-1)).push(para)
      para = ''
      newPage()
    } else if (name === 'w:pStyle') {
      const level = /^(?:heading|titre|berschrift)\s*(\d)$/i.exec(attr(attrs, 'w:val') ?? '')
      heading = level ? Number(level[1]) : /^title$/i.test(attr(attrs, 'w:val') ?? '') ? 1 : heading
    } else if (name === 'w:p' && !close && !selfClosing) {
      para = ''
      heading = 0
    } else if (name === 'w:p' && close) {
      if (depth) cell += (cell ? ' ' : '') + para.trim()
      else /** @type {string[]} */ (pages.at(-1)).push(heading && para.trim() ? `${'#'.repeat(Math.min(heading, 6))} ${para}` : para)
      para = ''
    } else if (name === 'w:tbl') depth += close ? -1 : 1
    else if (name === 'w:tr' && !close) row = []
    else if (name === 'w:tc' && close) {
      row.push(cell.replace(/\|/g, '\\|'))
      cell = ''
    } else if (name === 'w:tr' && close && depth === 1) /** @type {string[]} */ (pages.at(-1)).push(`| ${row.join(' | ')} |`)
  }
  const found = pages.map((lines) => collapse(lines)).filter(Boolean)
  return found.length > 1 ? found : paginate(collapse(pages.flat()).split('\n'))
}

/** Lines to text, with runs of blank lines squeezed to one. @param {string[]} lines */
function collapse(lines) {
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ─── PowerPoint ──────────────────────────────────────────────────────────────

/**
 * One page per slide, in presentation order.
 * @param {(path: string) => Promise<string | null>} xml @param {string[]} names
 */
async function pptx(xml, names) {
  const order = await slideOrder(xml)
  const slides = order.length ? order : names
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(/\d+/.exec(a)) - Number(/\d+/.exec(b)))
  /** @type {string[]} */
  const pages = []
  for (const path of slides) {
    const source = await xml(path)
    if (source !== null) pages.push(slideText(source))
  }
  return pages.length ? pages : ['']
}

/** @param {(path: string) => Promise<string | null>} xml */
async function slideOrder(xml) {
  const presentation = await xml('ppt/presentation.xml')
  const targets = relationships((await xml('ppt/_rels/presentation.xml.rels')) ?? '')
  if (!presentation) return []
  return [...presentation.matchAll(/<p:sldId\b([^>]*)>/g)]
    .map((match) => targets.get(attr(match[1], 'r:id') ?? ''))
    .filter((target) => target !== undefined)
    .map((target) => resolveTarget('ppt', /** @type {string} */ (target)))
}

/** @param {string} source */
export function slideText(source) {
  /** @type {string[]} */
  const lines = []
  let line = ''
  let inText = false
  for (const token of tokens(source)) {
    if ('text' in token) {
      if (inText) line += token.text
    } else if (token.name === 'a:t') inText = !token.close && !token.selfClosing
    else if (token.name === 'a:br') line += '\n'
    else if (token.name === 'a:p' && token.close) {
      lines.push(line)
      line = ''
    }
  }
  return collapse(lines)
}

/** Id → Target from a .rels file. @param {string} source */
export function relationships(source) {
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const match of source.matchAll(/<Relationship\b([^>]*)>/g)) {
    const id = attr(match[1], 'Id')
    const target = attr(match[1], 'Target')
    if (id && target) map.set(id, target)
  }
  return map
}

/** @param {string} base folder of the part that owns the .rels @param {string} target */
export function resolveTarget(base, target) {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/')
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment !== '.') parts.push(segment)
  }
  return parts.join('/')
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/
const STRONG = /[\p{L}\p{N}]/u
const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' }

/** The size most of a PDF's text is set in, in tenths of its unit. @param {{ str?: string, height?: number }[]} items */
export const bodySize = (items) => [...items.reduce((sizes, item) => sizes.set(Math.round((item.height ?? 0) * 10), (sizes.get(Math.round((item.height ?? 0) * 10)) ?? 0) + (item.str?.length ?? 0)), new Map())]
  .sort((a, b) => b[1] - a[1])[0]?.[0] || Infinity

/**
 * A PDF page's text from pdf.js's items, as people read it: headings marked as Markdown's by how much
 * larger than the body (the whole document's, if given) they are set, lines where the PDF ends them, but none
 * inside a word cut at a hyphen or between Chinese or Japanese characters; a right-to-left line in
 * reading order, since pdf.js gives each word right but the words as drawn, left to right; Arabic
 * and Hebrew letters, and Chinese and Japanese characters, as themselves, not the shapes and radicals
 * some PDFs name them by.
 * @param {{ str?: string, dir?: string, hasEOL?: boolean, height?: number }[]} items @param {number} [body] the body's size, from bodySize
 */
export function pageText(items, body = bodySize(items)) {
  const lines = items.reduce((/** @type {(typeof items)[]} */ all, item) => (all[all.length - 1].push(item), item.hasEOL && all.push([]), all), [[]])
  let out = ''
  let mark = ''
  for (const [i, line] of lines.entries()) {
    const weight = (/** @type {boolean} */ rtl) => line.filter((item) => (item.dir === 'rtl') === rtl && STRONG.test(item.str ?? '')).reduce((n, item) => n + (item.str ?? '').length, 0)
    const runs = line.reduce((/** @type {{ rtl: boolean, text: string }[]} */ all, item) => (item.dir !== 'rtl' && all.length && !all[all.length - 1].rtl
      ? all[all.length - 1].text += item.str ?? '' : all.push({ rtl: item.dir === 'rtl', text: item.str ?? '' }), all), [])
    // Read right to left, a run of left-to-right text keeps its order but the spaces and marks around it turn with the line.
    const turn = (/** @type {string} */ text = '') => [...text].reverse().map((c) => MIRROR[/** @type {'('} */ (c)] ?? c).join('')
    const text = (weight(true) > weight(false) ? runs.reverse().map(({ rtl, text }) => {
      const [, before, core, after] = rtl ? ['', '', text, ''] : /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su.exec(text) ?? []
      return turn(after) + (core ?? '') + turn(before)
    }) : runs.map((run) => run.text)).join('').replace(/[ \t]+$/, '').replace(/[\u2e80-\u2fdf\uf900-\ufaff\ufb1d-\ufdff\ufe70-\ufefc]+/g, (forms) => forms.normalize('NFKC'))
    const ratio = Math.max(0, ...line.map((item) => (item.str?.trim() ? Math.round((item.height ?? 0) * 10) : 0))) / body
    const joins = /-$/.test(out) && STRONG.test(text[0] ?? '') || CJK.test(out[out.length - 1] ?? '') && CJK.test(text[0] ?? '')
    const level = ratio >= 1.4 ? '# ' : ratio >= 1.15 ? '## ' : ratio > 1.03 ? '### ' : ''
    // A heading wrapped over two lines is one.
    out += level && level === mark ? ` ${text}` : (i && !joins ? '\n' : '') + level + text
    mark = text.trim() ? level : mark
  }
  return out.trim()
}

// ─── Excel ───────────────────────────────────────────────────────────────────

/**
 * Each sheet as tab-separated rows (tablePages). Values are as stored, but for dates, written as dates.
 * @param {(path: string) => Promise<string | null>} xml
 */
async function xlsx(xml) {
  const workbook = (await xml('xl/workbook.xml')) ?? ''
  const targets = relationships((await xml('xl/_rels/workbook.xml.rels')) ?? '')
  const shared = sharedStrings((await xml('xl/sharedStrings.xml')) ?? '')
  const dates = dateStyles((await xml('xl/styles.xml')) ?? '')
  /** @type {{ title: string, rows: string[] }[]} */
  const sheets = []
  for (const match of workbook.matchAll(/<sheet\b([^>]*)>/g)) {
    const target = targets.get(attr(match[1], 'r:id') ?? '')
    const source = target ? await xml(resolveTarget('xl', target)) : null
    if (source !== null) sheets.push({ title: `Sheet: ${attr(match[1], 'name') ?? ''}`, rows: sheetRows(source, shared, dates) })
  }
  return tablePages(sheets)
}

/** Tables' rows, SHEET_ROWS per page, each page headed by its table's title and its column names. @param {{ title: string, rows: string[] }[]} tables */
function tablePages(tables) {
  /** @type {string[]} */
  const pages = []
  for (const { title, rows } of tables) {
    for (let start = 0; start < Math.max(rows.length, 1); start += SHEET_ROWS) {
      const chunk = rows.slice(start, start + SHEET_ROWS)
      const range = rows.length > SHEET_ROWS ? ` (rows ${start + 1}–${start + chunk.length})` : ''
      // Each page names its columns, as the first row does.
      if (start) chunk.unshift(rows[0])
      pages.push(`${title}${range}\n${chunk.join('\n')}`.trimEnd())
    }
  }
  return pages.length ? pages : ['']
}

/** @param {string} source xl/sharedStrings.xml */
export function sharedStrings(source) {
  /** @type {string[]} */
  const strings = []
  let current = ''
  let inText = false
  for (const token of tokens(source)) {
    if ('text' in token) {
      if (inText) current += token.text
    } else if (token.name === 't') inText = !token.close && !token.selfClosing
    else if (token.name === 'si' && !token.close) current = ''
    else if (token.name === 'si' && token.close) strings.push(current)
  }
  return strings
}

/**
 * @param {string} source a worksheet
 * @param {string[]} shared
 * @param {Set<number>} [dates] the styles that show a number as a date
 * @returns {string[]} tab-separated rows; gaps between cells are kept as empty columns; a formula without its result shows as itself
 */
export function sheetRows(source, shared, dates = new Set()) {
  /** @type {string[]} */
  const rows = []
  /** @type {string[]} */
  let row = []
  let column = 0
  let type = ''
  let date = false
  let value = ''
  let formula = ''
  let inValue = false
  let inFormula = false
  for (const token of tokens(source)) {
    if ('text' in token) {
      if (inValue) value += token.text
      else if (inFormula) formula += token.text
      continue
    }
    const { name, close, attrs, selfClosing } = token
    if (name === 'row' && !close) row = []
    else if (name === 'row' && close) {
      while (row.length && !row.at(-1)) row.pop()
      rows.push(row.join('\t'))
    } else if (name === 'c' && !close) {
      const ref = attr(attrs, 'r')
      column = ref ? columnIndex(ref) : row.length
      type = attr(attrs, 't') ?? ''
      date = dates.has(Number(attr(attrs, 's') ?? -1))
      value = formula = ''
      if (selfClosing) row[column] = ''
    } else if (name === 'c' && close) {
      for (let i = row.length; i < column; i++) row[i] = ''
      row[column] = (value || !formula ? cellValue(date && !type ? 'd' : type, value, shared) : `=${formula}`).replace(/[\t\n]+/g, ' ')
    } else if (name === 'v' || name === 't') inValue = !close && !selfClosing
    else if (name === 'f') inFormula = !close && !selfClosing
  }
  while (rows.length && !rows.at(-1)) rows.pop()
  return rows
}

/** "BC12" → 54 (zero-based). @param {string} ref */
export function columnIndex(ref) {
  let index = 0
  for (const char of /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A') index = index * 26 + char.charCodeAt(0) - 64
  return index - 1
}

/** @param {string} type @param {string} value @param {string[]} shared */
function cellValue(type, value, shared) {
  if (type === 's') return shared[Number(value)] ?? ''
  if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE'
  // A date is a count of days since 1899-12-30 (Excel's own count, its 1900 leap day included).
  if (type === 'd' && /^\d+(\.\d+)?$/.test(value)) return new Date(Date.UTC(1899, 11, 30) + Number(value) * 86_400_000).toISOString().slice(0, Number(value) % 1 ? 16 : 10).replace('T', ' ')
  return value
}

/**
 * The cell styles (their places in cellXfs) whose number format shows a date: Excel's own (14–22,
 * 27–36, 45–47, 50–58) or one whose code has days, months or years outside quotes and brackets.
 * @param {string} source xl/styles.xml
 */
export function dateStyles(source) {
  const custom = new Map([...source.matchAll(/<numFmt\b([^>]*)>/g)].map((m) => [Number(attr(m[1], 'numFmtId')), decodeEntities(attr(m[1], 'formatCode') ?? '')]))
  const isDate = (/** @type {number} */ id) => id >= 14 && id <= 22 || id >= 27 && id <= 36 || id >= 45 && id <= 47 || id >= 50 && id <= 58
    || /[dmy]/i.test((custom.get(id) ?? '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''))
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(source)?.[1] ?? ''
  return new Set([...xfs.matchAll(/<xf\b([^>]*)\/?>/g)].flatMap((m, i) => (isDate(Number(attr(m[1], 'numFmtId') ?? 0)) ? [i] : [])))
}
