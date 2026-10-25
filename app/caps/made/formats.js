// Files Jean makes (D119): a Word document from Markdown, a spreadsheet from CSV or Markdown
// tables, or any other text file as it is. Office files are zips of XML, written with
// core/zip.js and the lexer Jean already loads: no file-format library. Those that can say so
// say a trained model made them, as the AI Act asks (D324): Word's and Excel's in their document
// properties, a drawing in its XMP, a web page in schema.org's terms. Pure, so Node's tests run it.
import { lexed } from '../layouts/shapes.js'
import { writeZip } from '../../core/zip.js'
import { xmpOf, GENERATED } from '../pictures/mark.js'
import { BRAND } from '../../brand.js'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const TEXT = /** @type {Record<string, string>} */ ({
  txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values',
  html: 'text/html', htm: 'text/html', svg: 'image/svg+xml', xml: 'application/xml', json: 'application/json',
  ics: 'text/calendar', vcf: 'text/vcard', yaml: 'application/yaml', yml: 'application/yaml', css: 'text/css',
  js: 'text/javascript', py: 'text/x-python', sql: 'application/sql', srt: 'application/x-subrip', vtt: 'text/vtt', log: 'text/plain',
})
// Kinds that aren't text: written as text, they would be broken files. Any other kind is text.
const BINARY = new Set(('pdf doc docm dot xls xlsm xlsb ppt pptx pptm odt ods odp pages numbers key epub zip gz tgz bz2 xz 7z rar tar iso ' +
  'png jpg jpeg gif webp avif heic heif bmp tif tiff ico psd mp3 wav m4a aac ogg flac wma mp4 m4v mov webm avi mkv wmv ' +
  'exe msi dmg apk jar wasm woff woff2 ttf otf sqlite db parquet').split(' '))

const encoder = new TextEncoder()

/** A name every system takes: no folders, none of the characters Windows refuses, at most 120 characters. @param {string} name */
export function fileName(name) {
  const clean = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/ (?=\.[a-z0-9]{1,8}$)/i, '').replace(/^\.+\s*/, '')
  const ext = /\.[a-z0-9]{1,8}$/i.exec(clean)?.[0] ?? ''
  return clean.length > 120 ? clean.slice(0, 120 - ext.length).trimEnd() + ext : clean
}

/** Letter-sized paper where the region of a locale uses it, else A4. @param {string} [locale] @returns {'a4' | 'letter'} */
export function paperFor(locale) {
  try {
    return /^(US|CA|MX|PH|CL|CO|VE|PR)$/.test(new Intl.Locale(locale ?? '').maximize().region ?? '') ? 'letter' : 'a4'
  } catch {
    return 'a4'
  }
}

/**
 * The file a name and its content make: the extension says which kind.
 * @param {string} name @param {string} content Markdown for .docx, CSV or Markdown tables for .xlsx, else the text itself
 * @param {{ paper?: 'a4' | 'letter', date?: Date, look?: Look | null }} [options] a Word file's in the project's look (D601)
 * @returns {Promise<{ name: string, mimeType: string, bytes: Uint8Array }>}
 */
export async function makeFile(name, content, { paper = 'a4', date, look } = {}) {
  const clean = fileName(name)
  const ext = /\.([a-z0-9]{1,8})$/i.exec(clean)?.[1].toLowerCase() ?? ''
  if (!content.trim()) throw new Error('The file has no content.')
  if (ext === 'docx') return { name: clean, mimeType: DOCX, bytes: await docx(content, paper, date, look ?? {}) }
  if (ext === 'xlsx') return { name: clean, mimeType: XLSX, bytes: await xlsx(sheetsIn(content, clean.slice(0, -5)), date) }
  if (!ext) throw new Error('Name the file with its kind, e.g. "Report.docx", "Budget.xlsx" or "Notes.txt".')
  if (BINARY.has(ext)) throw new Error(`A .${ext} file can't be made: it isn't text. Make a Word document (.docx, which Word saves as PDF too), a spreadsheet (.xlsx), a drawing (.svg) or a text file (.md, .csv, .html…).`)
  // A byte-order mark, so Excel reads a CSV as UTF-8.
  return { name: clean, mimeType: TEXT[ext] ?? 'text/plain', bytes: encoder.encode((/^[ct]sv$/.test(ext) ? '\ufeff' : '') + (MARKS[ext]?.(content) ?? content)) }
}


/**
 * A file's text with one passage changed: the passage must be there exactly once.
 * @param {string} text @param {string} passage @param {string} replacement @param {string} name for the messages
 */
export function replaceOnce(text, passage, replacement, name) {
  if (!passage) throw new Error('Quote the passage to change.')
  const count = text.split(passage).length - 1
  if (count === 1) return text.replace(passage, () => replacement)
  if (count) throw new Error(`The passage is in ${name} ${count} times: quote more of the text around it.`)
  throw new Error(`The passage is not in ${name}, which reads:\n${text.length > 3000 ? `${text.slice(0, 3000)}\n…` : text}`)
}

// ─── XML ─────────────────────────────────────────────────────────────────────

const ESCAPES = /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })
/** Text safe in XML: escaped, without the characters XML forbids. @param {string} text */
const xml = (text) => text.replace(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '').replace(/[&<>"]/g, (char) => ESCAPES[char])
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const PACKAGE = 'http://schemas.openxmlformats.org/package/2006'
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** @param {[string, string][]} parts path → content type, under officedocument's */
const contentTypes = (parts) => `${HEAD}<Types xmlns="${PACKAGE}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${
  parts.map(([path, type]) => `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`).join('')}</Types>`

/** @param {[string, string, string, string?][]} links id, type (under officeDocument's), target, and External for a web address */
const relationships = (links) => `${HEAD}<Relationships xmlns="${PACKAGE}/relationships">${
  links.map(([id, type, target, mode]) => `<Relationship Id="${id}" Type="${OFFICE}/${type}" Target="${xml(target)}"${mode ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`

/** @param {Record<string, string>} parts path → XML @param {Date} [date] */
const zip = (parts, date) => writeZip(Object.entries(parts).map(([name, text]) => ({ name, bytes: encoder.encode(text) })), date)

/** Arabic, Hebrew, Persian, Urdu, Syriac, Thaana… */
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/
/** Whether a text reads right to left: its first letter does. @param {string} text */
const rightToLeft = (text) => RTL.test(/\p{L}/u.exec(text)?.[0] ?? '')

// ─── The AI Act's mark (D324) ────────────────────────────────────────────────

/** What a web page says of how it was made, in schema.org's terms for IPTC's: a trained model, and the system. */
const MADE = /* html */ `<script type="application/ld+json">{"@context":"https://schema.org","@type":"CreativeWork","digitalSourceType":"https://schema.org/TrainedAlgorithmicMediaDigitalSource","creator":{"@type":"SoftwareApplication","name":${JSON.stringify(BRAND.name)}}}</script>`
/** A web page's mark in its head, else at its start; a drawing's XMP in its metadata, after its opening tag. Text that already says so stays as it is. */
const MARKS = /** @type {Record<string, (text: string) => string>} */ ({
  html: (text) => (text.includes('TrainedAlgorithmicMediaDigitalSource') ? text : /<\/head>/i.test(text) ? text.replace(/<\/head>/i, (end) => `${MADE}${end}`) : `${MADE}\n${text}`),
  svg: (text) => (text.includes(GENERATED) ? text : text.replace(/<svg\b[^>]*[^/]>/, (open) => `${open}<metadata>${xmpOf(BRAND.name)}</metadata>`)),
})
MARKS.htm = MARKS.html
/** A Word document's or a workbook's custom properties: IPTC's Digital Source Type and the system, which Word and Excel show under Properties. */
const CUSTOM = `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${
  [['DigitalSourceType', GENERATED], ['AISystemUsed', BRAND.name]].map(([name, value], i) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${i + 2}" name="${name}"><vt:lpwstr>${xml(value)}</vt:lpwstr></property>`).join('')}</Properties>`

// ─── Word ────────────────────────────────────────────────────────────────────

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const PAPER = { a4: '<w:pgSz w:w="11906" w:h="16838"/>', letter: '<w:pgSz w:w="12240" w:h="15840"/>' }

/** @typedef {{ links: string[], lists: [number, number][], colour?: string }} Parts what the other parts list as the document is written: link addresses, each numbered list's start and level; the look's colour */
/** The project's look on white paper (ui/kit.js, D601): its colour as `#rrggbb`, which reads on white, and its voice. @typedef {{ colour?: string, voice?: string }} Look */
/** @typedef {{ b?: boolean, i?: boolean, s?: boolean, code?: boolean, link?: boolean }} Format */

/** @param {string} markdown @param {'a4' | 'letter'} paper @param {Date | undefined} date @param {Look} look */
async function docx(markdown, paper, date, look) {
  /** @type {Parts} */
  const parts = { links: [], lists: [], colour: look.colour?.slice(1) }
  const body = blocks(lexed(markdown, { breaks: true }), parts) || '<w:p/>'
  const section = `<w:sectPr>${PAPER[paper]}<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`
  return zip({
    '[Content_Types].xml': contentTypes([['word/document.xml', 'wordprocessingml.document.main'], ['word/styles.xml', 'wordprocessingml.styles'], ['word/numbering.xml', 'wordprocessingml.numbering'], ['docProps/custom.xml', 'custom-properties']]),
    '_rels/.rels': relationships([['rId1', 'officeDocument', 'word/document.xml'], ['rId2', 'custom-properties', 'docProps/custom.xml']]),
    'docProps/custom.xml': CUSTOM,
    'word/_rels/document.xml.rels': relationships([['rId1', 'styles', 'styles.xml'], ['rId2', 'numbering', 'numbering.xml'],
      ...parts.links.map((url, i) => /** @type {[string, string, string, string]} */ ([`rIdLink${i + 1}`, 'hyperlink', url, 'External']))]),
    'word/document.xml': `${HEAD}<w:document xmlns:w="${W}" xmlns:r="${OFFICE}"><w:body>${body}${section}</w:body></w:document>`,
    'word/styles.xml': stylesOf(look),
    'word/numbering.xml': numbering(parts.lists),
  }, date)
}

/** @param {any[]} tokens @param {Parts} parts @param {string} [style] a paragraph style for all of them (a quote's) @returns {string} */
function blocks(tokens, parts, style = '') {
  return tokens.map((token) => {
    switch (token.type) {
      case 'heading': return paragraph(runs(token.tokens, parts), { style: `Heading${token.depth}`, text: token.text })
      case 'paragraph': case 'text': return paragraph(runs(token.tokens ?? [token], parts), { style, text: token.text })
      case 'list': return list(token, parts, 0)
      case 'table': return table(token, parts)
      case 'blockquote': return blocks(token.tokens, parts, 'Quote')
      case 'code': return paragraph(run(token.text, { code: true }), { style: 'Code' })
      case 'hr': return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>'
      // Raw HTML is shown as text, as in answers.
      case 'html': return paragraph(run(token.text.trim()), { style, text: token.text })
      default: return ''
    }
  }).join('')
}

/**
 * @param {string} content runs
 * @param {{ style?: string, text?: string, numbering?: [number, number], indent?: number, align?: string | null, tight?: boolean }} options
 *   numbering: the list's id and level; text: what decides the direction; tight: no space after it (a table's cells)
 */
function paragraph(content, { style = '', text = '', numbering, indent, align, tight } = {}) {
  // In the order the schema wants them: Word refuses a file that mixes it up.
  const props = (style ? `<w:pStyle w:val="${style}"/>` : '')
    + (numbering ? `<w:numPr><w:ilvl w:val="${numbering[1]}"/><w:numId w:val="${numbering[0]}"/></w:numPr>` : '')
    + (rightToLeft(text) ? '<w:bidi/>' : '')
    + (tight ? '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>' : '')
    + (indent ? `<w:ind w:left="${indent}"/>` : '')
    + (align === 'center' || align === 'right' ? `<w:jc w:val="${align}"/>` : '')
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${content}</w:p>`
}

/** Inline tokens as runs. @param {any[]} tokens @param {Parts} parts @param {Format} [format] @returns {string} */
function runs(tokens = [], parts, format = {}) {
  return tokens.map((token) => {
    switch (token.type) {
      case 'strong': return runs(token.tokens, parts, { ...format, b: true })
      case 'em': return runs(token.tokens, parts, { ...format, i: true })
      case 'del': return runs(token.tokens, parts, { ...format, s: true })
      case 'codespan': return run(token.text, { ...format, code: true })
      case 'br': return '<w:r><w:br/></w:r>'
      case 'checkbox': return run(token.checked ? '☑ ' : '☐ ', format)
      case 'image': return run(`[${token.text || token.href}]`, format)
      case 'link': {
        const inner = runs(token.tokens, parts, { ...format, link: true })
        if (!/^(https?:|mailto:)/i.test(token.href)) return inner
        parts.links.push(token.href)
        return `<w:hyperlink r:id="rIdLink${parts.links.length}">${inner}</w:hyperlink>`
      }
      default: return token.tokens ? runs(token.tokens, parts, format) : run(String(token.text ?? ''), format)
    }
  }).join('')
}

/** @param {string} text @param {Format} [format] */
function run(text, format = {}) {
  if (!text) return ''
  const props = (format.link ? '<w:rStyle w:val="Hyperlink"/>' : '')
    + (format.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : '')
    + (format.b ? '<w:b/><w:bCs/>' : '') + (format.i ? '<w:i/><w:iCs/>' : '') + (format.s ? '<w:strike/>' : '')
    + (RTL.test(text) ? '<w:rtl/>' : '')
  // Line breaks and tabs are elements of their own.
  const content = text.split('\n').map((line) => line.split('\t').map((part) => (part ? `<w:t xml:space="preserve">${xml(part)}</w:t>` : '')).join('<w:tab/>')).join('<w:br/>')
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${content}</w:r>`
}

/** Each item is a numbered or bulleted paragraph; what follows in it is indented to match. @param {any} token @param {Parts} parts @param {number} level */
function list(token, parts, level) {
  if (token.ordered) parts.lists.push([Number(token.start) || 1, level])
  // Bullets are list 1; each numbered list has its own, so it starts at its own number.
  const id = token.ordered ? parts.lists.length + 1 : 1
  return token.items.map((/** @type {any} */ item) => {
    let first = true
    return item.tokens.map((/** @type {any} */ child) => {
      if (child.type === 'list') return list(child, parts, Math.min(level + 1, 8))
      if (child.type === 'checkbox') return ''
      if (child.type !== 'text' && child.type !== 'paragraph') return blocks([child], parts)
      const box = item.task && first ? [{ type: 'checkbox', checked: item.checked }] : []
      const options = first ? { numbering: /** @type {[number, number]} */ ([id, level]) } : { indent: 720 * (level + 1) }
      first = false
      return paragraph(runs([...box, ...(child.tokens ?? [child])], parts), { ...options, text: child.text })
    }).join('')
  }).join('')
}

const BORDERS = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`).join('')}</w:tblBorders>`
  + '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>'

/** Borders and shading on the table itself, not in a style: previews and other apps show them too. @param {any} token @param {Parts} parts */
function table(token, parts) {
  const width = Math.floor(9000 / token.header.length)
  const direction = rightToLeft(token.header.map((/** @type {any} */ cell) => cell.text).join(' ')) ? '<w:bidiVisual/>' : ''
  /** @param {any[]} cells @param {boolean} header */
  const row = (cells, header) => `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((cell, i) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${header && parts.colour ? `<w:tcBorders><w:bottom w:val="single" w:sz="12" w:space="0" w:color="${parts.colour}"/></w:tcBorders>` : ''}${header ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ''}</w:tcPr>${
    paragraph(runs(cell.tokens, parts, { b: header }), { text: cell.text, align: token.align[i], tight: true })}</w:tc>`).join('')}</w:tr>`
  // A paragraph after it, as Word keeps one: two tables in a row would merge.
  return `<w:tbl><w:tblPr>${direction}<w:tblW w:w="5000" w:type="pct"/>${BORDERS}</w:tblPr><w:tblGrid>${`<w:gridCol w:w="${width}"/>`.repeat(token.header.length)}</w:tblGrid>${
    row(token.header, true)}${token.rows.map((/** @type {any[]} */ cells) => row(cells, false)).join('')}</w:tbl><w:p/>`
}

/** @param {[number, number][]} lists each numbered list's first number and level */
function numbering(lists) {
  const BULLETS = ['•', '◦', '▪']
  const NUMBERS = ['decimal', 'lowerLetter', 'lowerRoman']
  /** @param {(level: number) => [string, string]} kind format and text, by level */
  const levels = (kind) => Array.from({ length: 9 }, (_, level) => `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${kind(level)[0]}"/><w:lvlText w:val="${kind(level)[1]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (level + 1)}" w:hanging="360"/></w:pPr></w:lvl>`).join('')
  return `${HEAD}<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0">${levels((level) => ['bullet', BULLETS[level % 3]])}</w:abstractNum><w:abstractNum w:abstractNumId="1">${
    levels((level) => [NUMBERS[level % 3], `%${level + 1}.`])}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${
    lists.map(([start, level], i) => `<w:num w:numId="${i + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="${level}"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`).join('')}</w:numbering>`
}

/** Each voice's faces in Word, Office's own, its headings' then its words', where calm keeps Word's (D601). */
const FACES = /** @type {Record<string, [string, string]>} */ ({ elegant: ['Georgia', 'Calibri'], bold: ['Arial Narrow', 'Calibri'], friendly: ['Trebuchet MS', 'Trebuchet MS'] })
/** @param {string} face */
const fonts = (face) => `<w:rFonts w:ascii="${face}" w:hAnsi="${face}" w:cs="Arial"/>`

/** @param {number} level @param {number} size in half-points @param {string[]} look its face and its colour, each where the schema has it */
const heading = (level, size, [face, colour]) => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${level < 3 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr>${face}<w:b/><w:bCs/>${colour}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`

/** The styles, the headings in the look's colour and its voice's faces. @param {Look} look */
function stylesOf({ colour, voice }) {
  const [head, body] = FACES[voice ?? ''] ?? ['Calibri', 'Calibri'], own = [head === body ? '' : fonts(head), colour ? `<w:color w:val="${colour.slice(1)}"/>` : '']
  return `${HEAD}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr>${fonts(body)}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + [36, 30, 26, 24, 22, 22].map((size, i) => heading(i + 1, size, own)).join('')
    + '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="567"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="595959"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>'
    + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style></w:styles>'
}

// ─── Excel ───────────────────────────────────────────────────────────────────

const SHEET = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

/** @typedef {{ name: string, rows: string[][] }} Sheet */

/**
 * The sheets a spreadsheet's content describes: its Markdown tables, each named by the heading
 * above it, or else CSV (or tab-separated) text as one sheet, named after the file.
 * @param {string} content @param {string} title the file's name without its extension
 * @returns {Sheet[]}
 */
export function sheetsIn(content, title) {
  /** @type {Sheet[]} */
  const sheets = []
  let heading = ''
  for (const token of lexed(content)) {
    if (token.type === 'heading') heading = token.text
    else if (token.type === 'table') sheets.push({ name: heading, rows: [token.header, ...token.rows].map((row) => row.map((/** @type {any} */ cell) => plain(cell.tokens))) })
  }
  if (!sheets.length) sheets.push({ name: title, rows: csvRows(content) })
  // Excel's rules: 31 characters at most, none of []:*?/\, each name its own.
  /** @type {Set<string>} */
  const taken = new Set()
  return sheets.map(({ name, rows }, i) => {
    const base = name.replace(/[[\]:*?/\\]+/g, ' ').replace(/\s+/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31).trim() || `${title.slice(0, 26).trim() || 'Sheet'} ${i + 1}`
    let clean = base
    for (let n = 2; taken.has(clean.toLowerCase()); n++) clean = `${base.slice(0, 27).trim()} ${n}`
    taken.add(clean.toLowerCase())
    return { name: clean, rows }
  })
}

/** A cell's inline tokens as plain text. @param {any[]} tokens @returns {string} */
const plain = (tokens = []) => tokens.map((token) => (token.tokens ? plain(token.tokens) : token.type === 'br' ? ' ' : String(token.text ?? ''))).join('').trim()

/**
 * CSV rows, separated by commas, semicolons or tabs, with quoted cells that may hold any of them,
 * line breaks included. Empty lines are skipped. The separator is the one Excel's own first line
 * names ("sep=;"), else the one that splits the most of the first rows into the same number of
 * cells, so a title above the table, a quoted "Name, first" or decimal commas don't mislead it;
 * on a tie, a tab before a semicolon before a comma, which ordinary text holds more of.
 * @param {string} text @param {string} [separator] the separator, when known @returns {string[][]}
 */
export function csvRows(text, separator) {
  const source = text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n')
  const named = separator ? null : /^"?sep=(.)"?\n/i.exec(source)
  if (!separator) return csvRows(source.slice(named?.[0].length ?? 0), named?.[1] ?? ['\t', ';', ','].map((s) => /** @type {const} */ ([s, alike(csvRows(source.slice(0, 65536), s).slice(0, 100))])).sort((a, b) => b[1] - a[1])[0][0])
  /** @type {string[][]} */
  const rows = [[]]
  let cell = ''
  let quoted = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') cell += source[i++]
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && !cell.trim()) quoted = true
    else if (char === separator || char === '\n') {
      /** @type {string[]} */ (rows.at(-1)).push(cell.trim())
      cell = ''
      if (char === '\n') rows.push([])
    } else cell += char
  }
  /** @type {string[]} */ (rows.at(-1)).push(cell.trim())
  return rows.filter((row) => row.some(Boolean))
}

/** How many rows have the commonest number of cells, when that is more than one. @param {string[][]} rows */
const alike = (rows) => Math.max(0, ...rows.map((row) => (row.length > 1 ? rows.filter((other) => other.length === row.length).length : 0)))

const NUMBER = /^-?(?:0|[1-9]\d{0,14})(?:\.\d+)?$/
const PERCENT = /^(-?(?:0|[1-9]\d{0,14})(\.\d+)?)\s?%$/
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
// Formulas that only compute: these functions, cell references, numbers and text. Nothing that
// reaches out when the file opens (WEBSERVICE, HYPERLINK, a link to another program or workbook).
const FUNCTIONS = new Set(('SUM AVERAGE MIN MAX COUNT COUNTA COUNTBLANK COUNTIF COUNTIFS SUMIF SUMIFS AVERAGEIF AVERAGEIFS SUMPRODUCT PRODUCT MEDIAN MODE '
  + 'STDEV VAR ROUND ROUNDUP ROUNDDOWN INT MOD ABS POWER SQRT IF IFS IFERROR AND OR NOT TODAY DATE YEAR MONTH DAY WEEKDAY EDATE EOMONTH '
  + 'DATEDIF NETWORKDAYS LEN LEFT RIGHT MID UPPER LOWER PROPER TRIM CONCAT CONCATENATE TEXT VALUE VLOOKUP HLOOKUP XLOOKUP INDEX MATCH '
  + 'RANK LARGE SMALL PERCENTILE PMT FV PV RATE NPV').split(' '))

/** @param {string} value */
const computes = (value) => /^=[^|[\]{}\\]+$/.test(value)
  && [...value.replace(/"[^"]*"/g, '""').matchAll(/([A-Za-z_][\w.]*)\s*\(/g)].every((match) => FUNCTIONS.has(match[1].toUpperCase()))

/**
 * A value Excel keeps as a number, and its style: 2 and 3 a percentage, 4 a date.
 * @param {string} value @returns {[number, number] | null}
 */
function numeric(value) {
  if (NUMBER.test(value)) return [Number(value), 0]
  const percent = PERCENT.exec(value)
  if (percent) return [Number((Number(percent[1]) / 100).toPrecision(15)), percent[2] ? 3 : 2]
  const day = DATE.exec(value)
  const time = day ? Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : NaN
  // Excel counts days from 1900, wrongly taking it as a leap year: from March 1900 on, it's right.
  if (day && time >= Date.UTC(1900, 2, 1) && new Date(time).toISOString().startsWith(value)) return [(time - Date.UTC(1899, 11, 30)) / 864e5, 4]
  return null
}

const TOTAL = /^=(SUM|AVERAGE|MIN|MAX|COUNT)\(\s*\$?([A-Z]{1,3})\$?(\d+)\s*:\s*\$?([A-Z]{1,3})\$?(\d+)\s*\)$/i

/**
 * What a total over a range comes to, saved with its formula so that a preview which doesn't
 * compute (Quick Look, a mail's attachment) shows it too. Excel works every formula out again
 * when it opens the file. None when the range holds another formula: no number beats a wrong one.
 * A total looks like what it adds up (percentages, dates), a count like a number.
 * @param {string} formula @param {Map<string, [number, number]>} numbers value and style by "column,row", NaN for a formula
 * @returns {[number | null, number]} the result, and the style it shows in
 */
function total(formula, numbers) {
  const match = TOTAL.exec(formula)
  if (!match) return [null, 0]
  const [left, right] = [columnIndex(match[2]), columnIndex(match[4])].sort((a, b) => a - b)
  const [top, bottom] = [Number(match[3]), Number(match[5])].sort((a, b) => a - b)
  /** @type {[number, number][]} */
  const cells = []
  for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) if (numbers.has(`${col},${row}`)) cells.push(/** @type {[number, number]} */ (numbers.get(`${col},${row}`)))
  const kind = match[1].toUpperCase()
  const values = cells.map(([value]) => value)
  const style = kind === 'COUNT' ? 0 : cells[0]?.[1] ?? 0
  if (values.some(Number.isNaN) || (kind === 'AVERAGE' && !values.length)) return [null, style]
  const sum = values.reduce((a, b) => a + b, 0)
  const result = kind === 'SUM' ? sum : kind === 'COUNT' ? values.length : kind === 'AVERAGE' ? sum / values.length
    : values.length ? Math[kind === 'MIN' ? 'min' : 'max'](...values) : 0
  return [Number(result.toPrecision(15)), style]
}

/** "A" → 0, "AA" → 26. @param {string} letters */
const columnIndex = (letters) => [...letters.toUpperCase()].reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1

/** "A", "B", … "Z", "AA"… @param {number} index zero-based @returns {string} */
const column = (index) => (index >= 26 ? column(Math.floor(index / 26) - 1) : '') + String.fromCharCode(65 + (index % 26))

/** How wide a text shows: CJK characters take two columns. @param {string} text */
const width = (text) => [...text].reduce((sum, char) => sum + (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFF00-\uFF60]/.test(char) ? 2 : 1), 0)

/** @param {Sheet[]} sheets @param {Date} [date] */
async function xlsx(sheets, date) {
  /** @type {Map<string, number>} */
  const strings = new Map()
  /** @param {string} text */
  const shared = (text) => strings.get(text) ?? strings.set(text, strings.size).get(text)
  /**
   * One cell: a number, a formula, or text (the header's in bold, style 1).
   * @param {string} value @param {string} ref @param {boolean} header @param {Map<string, [number, number]>} numbers the sheet's, for totals
   */
  const cell = (value, ref, header, numbers) => {
    if (!value) return ''
    const number = header ? null : numeric(value)
    if (number) return `<c r="${ref}"${number[1] ? ` s="${number[1]}"` : ''}><v>${number[0]}</v></c>`
    if (!header && computes(value)) {
      const [result, style] = total(value, numbers)
      return `<c r="${ref}"${style ? ` s="${style}"` : ''}><f>${xml(value.slice(1))}</f>${result === null ? '' : `<v>${result}</v>`}</c>`
    }
    return `<c r="${ref}" t="s"${header ? ' s="1"' : ''}><v>${shared(value)}</v></c>`
  }
  const worksheets = sheets.map(({ rows }) => {
    const header = rows.length > 1
    /** @type {Map<string, [number, number]>} */
    const numbers = new Map()
    rows.forEach((row, r) => row.forEach((value, c) => {
      if (r === 0 && header) return
      const number = numeric(value)
      if (number || computes(value)) numbers.set(`${c},${r + 1}`, number ?? [NaN, 0])
    }))
    const widths = rows.reduce((most, row) => row.map((value, i) => Math.max(most[i] ?? 0, width(value))), /** @type {number[]} */ ([]))
    const cols = widths.map((chars, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(chars, 8), 60) + 2}" customWidth="1"/>`).join('')
    // The header stays in view as the rows scroll; a sheet in Arabic or Hebrew runs right to left.
    const frozen = header ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ''
    const direction = rightToLeft(rows.flat().join(' ')) ? ' rightToLeft="1"' : ''
    const data = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => cell(value, `${column(c)}${r + 1}`, r === 0 && header, numbers)).join('')}</row>`).join('')
    return `${HEAD}<worksheet xmlns="${SHEET}"><sheetViews><sheetView workbookViewId="0"${direction}>${frozen}</sheetView></sheetViews>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${data}</sheetData></worksheet>`
  })
  const n = sheets.length
  return zip({
    '[Content_Types].xml': contentTypes([['xl/workbook.xml', 'spreadsheetml.sheet.main'], ...sheets.map((_, i) => /** @type {[string, string]} */ ([`xl/worksheets/sheet${i + 1}.xml`, 'spreadsheetml.worksheet'])),
      ['xl/styles.xml', 'spreadsheetml.styles'], ['xl/sharedStrings.xml', 'spreadsheetml.sharedStrings'], ['docProps/custom.xml', 'custom-properties']]),
    '_rels/.rels': relationships([['rId1', 'officeDocument', 'xl/workbook.xml'], ['rId2', 'custom-properties', 'docProps/custom.xml']]),
    'docProps/custom.xml': CUSTOM,
    'xl/_rels/workbook.xml.rels': relationships([...sheets.map((_, i) => /** @type {[string, string, string]} */ ([`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`])),
      [`rId${n + 1}`, 'styles', 'styles.xml'], [`rId${n + 2}`, 'sharedStrings', 'sharedStrings.xml']]),
    // Formulas have no saved results: they are worked out when the file opens.
    'xl/workbook.xml': `${HEAD}<workbook xmlns="${SHEET}" xmlns:r="${OFFICE}"><sheets>${sheets.map(({ name }, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr fullCalcOnLoad="1"/></workbook>`,
    ...Object.fromEntries(worksheets.map((sheet, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheet])),
    'xl/styles.xml': SHEET_STYLES,
    'xl/sharedStrings.xml': `${HEAD}<sst xmlns="${SHEET}" count="${strings.size}" uniqueCount="${strings.size}">${[...strings.keys()].map((text) => `<si><t xml:space="preserve">${xml(text)}</t></si>`).join('')}</sst>`,
  }, date)
}

/** @param {number} format a built-in number format: 9 is 0%, 10 is 0.00%, 14 the short date of the user's settings @param {number} [font] */
const xf = (format, font = 0) => `<xf numFmtId="${format}" fontId="${font}" fillId="0" borderId="0" xfId="0"${format ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}/>`
const SHEET_STYLES = `${HEAD}<styleSheet xmlns="${SHEET}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5">${xf(0)}${xf(0, 1)}${xf(9)}${xf(10)}${xf(14)}</cellXfs>`
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
