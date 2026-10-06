// Text out of the files people share: Word, PowerPoint and Excel (zips of XML), and
// plain text. Returns pages, so the brain can read a long file a part at a time.
// A small tag scanner instead of DOMParser keeps this runnable in workers and Node.
// PDFs are read by pdf.js, in the Files capability.
import { readZip } from '../../core/zip.js'

/** @typedef {import('../../core/zip.js').ZipEntry} ZipEntry */

const PAGE_CHARS = 4000
const SHEET_ROWS = 200
const TEXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|log|ya?ml|ini|srt|vtt)$/i

/** @param {string} name */
export const extractable = (name) => /\.(docx|pptx|xlsx)$/i.test(name) || TEXT.test(name)

/**
 * @param {string} name file name, used for its extension
 * @param {Uint8Array} bytes
 * @returns {Promise<string[] | null>} pages, or null when the format isn't handled here
 */
export async function extractPages(name, bytes) {
  const ext = name.toLowerCase().split('.').pop()
  if (TEXT.test(name)) return paginate(decodeText(bytes).split('\n'))
  if (ext !== 'docx' && ext !== 'pptx' && ext !== 'xlsx') return null
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

/** UTF-8 when valid, else Windows-1252 (what older Windows apps save). @param {Uint8Array} bytes */
export function decodeText(bytes) {
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
function attr(attrs, name) {
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
function relationships(source) {
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
function resolveTarget(base, target) {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/')
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment !== '.') parts.push(segment)
  }
  return parts.join('/')
}

// ─── Excel ───────────────────────────────────────────────────────────────────

/**
 * Each sheet as tab-separated rows, SHEET_ROWS rows per page, headed by the sheet name.
 * Values are as stored: dates stay serial numbers.
 * @param {(path: string) => Promise<string | null>} xml
 */
async function xlsx(xml) {
  const workbook = (await xml('xl/workbook.xml')) ?? ''
  const targets = relationships((await xml('xl/_rels/workbook.xml.rels')) ?? '')
  const shared = sharedStrings((await xml('xl/sharedStrings.xml')) ?? '')
  /** @type {string[]} */
  const pages = []
  for (const match of workbook.matchAll(/<sheet\b([^>]*)>/g)) {
    const name = attr(match[1], 'name') ?? ''
    const target = targets.get(attr(match[1], 'r:id') ?? '')
    const source = target ? await xml(resolveTarget('xl', target)) : null
    if (source === null) continue
    const rows = sheetRows(source, shared)
    for (let start = 0; start < Math.max(rows.length, 1); start += SHEET_ROWS) {
      const chunk = rows.slice(start, start + SHEET_ROWS)
      const range = rows.length > SHEET_ROWS ? ` (rows ${start + 1}–${start + chunk.length})` : ''
      pages.push(`Sheet: ${name}${range}\n${chunk.join('\n')}`.trimEnd())
    }
  }
  return pages.length ? pages : ['']
}

/** @param {string} source xl/sharedStrings.xml */
function sharedStrings(source) {
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
 * @returns {string[]} tab-separated rows; gaps between cells are kept as empty columns
 */
export function sheetRows(source, shared) {
  /** @type {string[]} */
  const rows = []
  /** @type {string[]} */
  let row = []
  let column = 0
  let type = ''
  let value = ''
  let inValue = false
  for (const token of tokens(source)) {
    if ('text' in token) {
      if (inValue) value += token.text
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
      value = ''
      if (selfClosing) row[column] = ''
    } else if (name === 'c' && close) {
      for (let i = row.length; i < column; i++) row[i] = ''
      row[column] = cellValue(type, value, shared).replace(/[\t\n]+/g, ' ')
    } else if (name === 'v' || name === 't') inValue = !close && !selfClosing
  }
  while (rows.length && !rows.at(-1)) rows.pop()
  return rows
}

/** "BC12" → 54 (zero-based). @param {string} ref */
function columnIndex(ref) {
  let index = 0
  for (const char of /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A') index = index * 26 + char.charCodeAt(0) - 64
  return index - 1
}

/** @param {string} type @param {string} value @param {string[]} shared */
function cellValue(type, value, shared) {
  if (type === 's') return shared[Number(value)] ?? ''
  if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE'
  return value
}
