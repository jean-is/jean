// The corpus's files in each format, and their text as Jean extracts it. Word and Excel come
// from Jean's own writer (caps/made/formats.js); PowerPoint from a small writer here; PDF from
// Chromium printing the HTML below (scripts/documents.js), as a real tool makes them.
import { makeFile } from '../../app/caps/made/formats.js'
import { extractPages } from '../../app/caps/files/extract.js'
import { writeZip } from '../../app/core/zip.js'

/** @typedef {import('./corpus.js').Block} Block */

const enc = new TextEncoder()

/** @param {string} cell */
const md = (cell) => cell.replace(/\|/g, '\\|')

/** @param {Block[]} blocks */
export function markdown(blocks) {
  /** @type {string[]} */
  const out = []
  for (const block of blocks) {
    if (block.kind === 'break') continue
    if (block.kind === 'table') out.push([block.header, block.header?.map(() => '---'), ...(block.rows ?? [])].map((row) => `| ${(row ?? []).map(md).join(' | ')} |`).join('\n'))
    else out.push(`${{ h1: '# ', h2: '## ', h3: '### ', p: '' }[block.kind]}${block.text}`)
  }
  return out.join('\n\n') + '\n'
}

/** Plain text: headings as lines of their own, tables as tab-separated rows. @param {Block[]} blocks */
export function plain(blocks) {
  return blocks.filter((block) => block.kind !== 'break').map((block) => block.kind === 'table' ? [block.header, ...(block.rows ?? [])].map((row) => (row ?? []).join('\t')).join('\n') : block.text).join('\n\n') + '\n'
}

/** @param {Block[]} blocks a single table's */
export function csv(blocks) {
  const table = blocks.find((block) => block.kind === 'table')
  const cell = (/** @type {string} */ value) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  return [table?.header, ...(table?.rows ?? [])].map((row) => (row ?? []).map(cell).join(',')).join('\n') + '\n'
}

const esc = (/** @type {string} */ text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const DIR = { ar: 'rtl' }

/** A page Chromium prints: A4, small type as dense reports have, a page break where the corpus wants one. @param {Block[]} blocks @param {string} title */
export function html(blocks, title) {
  const attrs = (/** @type {Block} */ block) => block.lang ? ` lang="${block.lang}"${DIR[/** @type {'ar'} */ (block.lang)] ? ' dir="rtl"' : ''}` : ''
  const body = blocks.map((block) => {
    if (block.kind === 'break') return '<div class="break"></div>'
    if (block.kind === 'table') return `<table${attrs(block)}><thead><tr>${(block.header ?? []).map((cell) => `<th>${esc(cell)}</th>`).join('')}</tr></thead><tbody>${(block.rows ?? []).map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    return `<${block.kind}${attrs(block)}>${esc(block.text ?? '')}</${block.kind}>`
  }).join('\n')
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: A4; margin: 16mm 13mm }
body { font: 9pt/1.3 Helvetica, Arial, sans-serif }
h1 { font-size: 14pt } h2 { font-size: 11pt; margin: 8pt 0 4pt } h3 { font-size: 9.5pt; margin: 6pt 0 2pt } p { margin: 3pt 0; text-align: justify }
table { border-collapse: collapse; font-size: 7.5pt; margin: 4pt 0 } td, th { border: 0.5pt solid #888; padding: 1pt 4pt; text-align: start }
.break { break-before: page }
</style><body>${body}</body></html>`
}

/** A presentation: a slide per heading, its paragraphs and table rows as lines. @param {Block[]} blocks */
export async function pptx(blocks) {
  /** @type {{ title: string, lines: string[] }[]} */
  const slides = []
  for (const block of blocks) {
    if (block.kind === 'break') continue
    if (block.kind === 'h1' || block.kind === 'h2' || !slides.length) slides.push({ title: block.kind === 'h1' || block.kind === 'h2' ? block.text ?? '' : '', lines: [] })
    const slide = /** @type {{ title: string, lines: string[] }} */ (slides.at(-1))
    if (block.kind === 'table') slide.lines.push(...[block.header, ...(block.rows ?? [])].map((row) => (row ?? []).join(' | ')))
    else if (block.kind !== 'h1' && block.kind !== 'h2') slide.lines.push(block.text ?? '')
  }
  const x = (/** @type {string} */ text) => esc(text).replace(/"/g, '&quot;')
  const para = (/** @type {string} */ text) => `<a:p><a:r><a:t>${x(text)}</a:t></a:r></a:p>`
  const P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
  const files = [
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>' },
    { name: 'ppt/presentation.xml', text: `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${P}><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst></p:presentation>` },
    { name: 'ppt/_rels/presentation.xml.rels', text: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>` },
    ...slides.map((slide, i) => ({ name: `ppt/slides/slide${i + 1}.xml`, text: `<?xml version="1.0" encoding="UTF-8"?><p:sld ${P}><p:cSld><p:spTree><p:sp><p:txBody>${para(slide.title)}</p:txBody></p:sp><p:sp><p:txBody>${slide.lines.map(para).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>` })),
  ]
  return writeZip(files.map(({ name, text }) => ({ name, bytes: enc.encode(text) })))
}

/**
 * A file's bytes in the format its name says. PDF is made elsewhere (it needs Chromium).
 * @param {{ name: string, blocks: Block[] }} file @returns {Promise<Uint8Array>}
 */
export async function bytesOf({ name, blocks }) {
  const ext = /\.(\w+)$/.exec(name)?.[1] ?? ''
  if (ext === 'docx' || ext === 'xlsx') return (await makeFile(name, markdown(blocks))).bytes
  if (ext === 'pptx') return pptx(blocks)
  if (ext === 'csv') return enc.encode(csv(blocks))
  if (ext === 'txt') return enc.encode(plain(blocks))
  if (ext === 'md') return enc.encode(markdown(blocks))
  throw new Error(`No writer for .${ext} here`)
}

/**
 * PDF text, page by page, as Jean reads it: pdfjs-dist in node with the joining Jean's pdf.js uses.
 * @param {Uint8Array} bytes @param {(items: any[]) => string} join
 */
export async function pdfPages(bytes, join) {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const pdfjs = await import(require.resolve('pdfjs-dist/legacy/build/pdf.mjs'))
  const base = require.resolve('pdfjs-dist/package.json').replace(/package\.json$/, '')
  const task = pdfjs.getDocument({ data: bytes.slice(), cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 })
  const doc = await task.promise
  /** @type {string[]} */
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    pages.push(join((await page.getTextContent()).items))
    page.cleanup()
  }
  await task.destroy()
  return pages
}

/**
 * A file's text, page by page, as Jean extracts it.
 * @param {string} name @param {Uint8Array} bytes @param {(items: any[]) => string} [join] PDF's joining
 */
export async function extract(name, bytes, join) {
  if (/\.pdf$/i.test(name)) {
    if (!join) throw new Error('PDF needs its joining')
    return pdfPages(bytes, join)
  }
  const pages = await extractPages(name, bytes)
  if (!pages) throw new Error(`Jean can't read ${name}`)
  return pages
}
