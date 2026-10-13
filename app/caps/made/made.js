// Things Jean made: files the brain writes (a Word document, a spreadsheet, a text file),
// kept in the project's files and shown under the answer, ready to save (D119); an answer
// copied as rich text (pastes formatted into Word, Outlook and Google Docs), or its tables as
// CSV (opens in Excel). Browser features only; no file-format library.
import { html, nothing, render, svg } from 'lit-html'
import { lexer } from 'marked'
import { Element, define } from '../../ui/base.js'
import { register, loaded } from '../../ui/caps.js'
import { app, notify, conversationOf } from '../../ui/state.js'
import { save } from '../../ui/save.js'
import { markdown } from '../../ui/markdown.js'
import { icons } from '../../ui/icons.js'
import { addFile, fileText, splitPages } from '../../core/files.js'
import { callsIn, filesMade, latestOf, nextVersion, versionsOf } from '../../core/events.js'
import { t, locale, formatBytes } from '../../core/i18n.js'
import { styleSheet } from '../../ui/sheet.js'

/** @typedef {import('../../core/events.js').MadeFile} MadeFile what a call that made a file records (`_meta.file`), with its version (D164) */

// The cards' style sheet comes with them, not with the first screen (D126).
await styleSheet(new URL('made.css', import.meta.url))

// ─── Writing files ───────────────────────────────────────────────────────────

/**
 * Files made in the conversation a call works for, oldest first: those of earlier answers, then
 * this one's, the computer's pages included (D164), or only those written here (`written`), which
 * edit changes: the computer changes its own, in /workspace.
 * @param {AbortSignal} [signal] its run's @param {boolean} [written] @returns {MadeFile[]}
 */
function madeFiles(signal, written = false) {
  const conversation = conversationOf(signal)
  const calls = callsIn(conversation?.records ?? [], conversation?.turn?.steps)
  return written ? calls.flatMap((call) => (call._meta?.file ? [call._meta.file] : [])) : filesMade(calls)
}

/**
 * Makes the file and keeps it in the project's files like a shared one, with what the brain
 * wrote as its text, so it can be changed later; or keeps a workbook changed cell by cell, with
 * what Files reads as its text (D229). The call records it; the answer shows it.
 * @param {string} name @param {string | { bytes: Uint8Array, mimeType: string, pages: string[] }} content
 * @param {import('../../core/loop.js').ToolContext} ctx
 */
async function keep(name, content, ctx) {
  // The writers load with the first file made, not with the first message.
  const { makeFile, paperFor } = await import('./formats.js')
  const { name: kept, mimeType, bytes } = typeof content === 'string' ? await makeFile(name, content, { paper: paperFor(navigator.language) }) : { name, ...content }
  const link = await addFile(app.fs, { projectDir: app.projectDir, name: kept, mimeType, bytes, pages: typeof content === 'string' ? [content] : content.pages, by: 'jean' })
  // Each version is a file of its own, by its content, and the earlier ones stay where they are (D164).
  const version = nextVersion(madeFiles(ctx.signal), kept, link.uri)
  ctx.meta.file = /** @type {MadeFile} */ ({ uri: link.uri, name: kept, mimeType, size: bytes.length, version })
  return { kept, version }
}

/** @type {import('../../core/loop.js').Tool} */
const writeTool = {
  spec: {
    name: 'write',
    description: [
      'Make a file the user can save, or replace one you made. Its extension says what it is:',
      '.docx, a Word document, written in Markdown (headings, lists, tables, bold, links);',
      '.xlsx, a spreadsheet, written as CSV, or as Markdown tables, each under a heading that names its sheet:',
      'numbers plain (1234.5), dates as 2026-10-03, formulas in English (=SUM(B2:B9));',
      'or any text file, as it is (.md, .csv, .html, .svg, .json, .ics, .tex, .py…).',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The file name with its extension, in the user\'s language, e.g. "Sales report.docx"' },
        content: { type: 'string', description: 'What it holds' },
      },
      required: ['name', 'content'],
    },
  },
  kind: 'edit',
  title: (args) => `Write ${args?.name ?? ''}`,
  run: async (args, ctx) => {
    const { kept, version } = await keep(String(args?.name ?? ''), String(args?.content ?? ''), ctx)
    return `Saved ${kept}. It shows under your answer, ready to save${version > 1 ? `, as version ${version}: the earlier ones stay under theirs` : ''}.`
  },
}

/** @type {import('../../core/loop.js').Tool} */
const editTool = {
  spec: {
    name: 'edit',
    description: 'Change part of a file you made with write: replace a passage of what you wrote (its Markdown, CSV or text), quoted exactly, with new text; in a spreadsheet the user changed, of how it reads, cells apart by tabs. The passage must be there once. The user gets the new version.',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'The file\'s name' },
        old: { type: 'string', description: 'The passage, exactly as it is now' },
        new: { type: 'string', description: 'What replaces it; empty to remove it' },
      },
      required: ['file', 'old', 'new'],
    },
  },
  kind: 'edit',
  title: (args) => `Edit ${args?.file ?? ''}`,
  locations: (args) => [{ path: String(args?.file ?? '') }],
  run: async (args, ctx) => {
    const files = madeFiles(ctx.signal, true)
    const wanted = String(args?.file ?? '').trim().toLowerCase()
    const made = files.findLast((file) => file.name.toLowerCase() === wanted)
    if (!made) throw new Error(`No file named "${args?.file}" was made in this conversation. Made: ${[...new Set(files.map((file) => file.name))].join(', ') || 'none'}. Use write to make it.`)
    // As it is now: a workbook holds the copy the user last changed it into in the preview (D229).
    const found = { ...made, uri: latestOf(conversationOf(ctx.signal)?.records ?? [], made.uri) }
    const text = await fileText(app.fs, app.projectDir, found.uri)
    if (text === null) throw new Error(`${found.name} is no longer on this device. Use write to make it again.`)
    const { replaceOnce } = await import('./formats.js')
    const [old, replacement] = [String(args?.old ?? ''), String(args?.new ?? '')]
    // A workbook the user changed in the preview has what Files reads as its text: it changes cell by cell (D229).
    const changed = /\.xlsx$/i.test(found.name) && splitPages(text)[0]?.startsWith('Sheet: ') ? await changeCells(found, old, replacement, replaceOnce)
      : replaceOnce(splitPages(text).join('\n'), old, replacement, found.name)
    const { kept, version } = await keep(found.name, changed, ctx)
    return `Changed ${kept}. The new version, version ${version}, shows under your answer, and the earlier one stays under its own.`
  },
}

/**
 * A workbook's cells changed by a passage of how it reads (D229), with what Files reads of it now.
 * @param {MadeFile} file @param {string} old @param {string} replacement @param {typeof import('./formats.js').replaceOnce} replaceOnce
 */
async function changeCells(file, old, replacement, replaceOnce) {
  const bytes = await app.fs.readBytes(`${app.projectDir}/${file.uri}`)
  if (!bytes) throw new Error(`${file.name} is no longer on this device. Use write to make it again.`)
  const changed = await (await import('../files/cells.js')).replaceInSheet(bytes, old, replacement, file.name, replaceOnce)
  return { bytes: changed, mimeType: file.mimeType, pages: (await (await import('../files/extract.js')).extractPages(file.name, changed)) ?? [] }
}

register({
  id: 'made',
  tools: [writeTool, editTool],
  lines: [
    { name: 'write', line: 'make a file the user can save: .docx, .xlsx or text' },
    { name: 'edit', line: 'change part of a file you made' },
  ],
  rules: ['Documents and spreadsheets the user asks for are files.', 'In files, write formulas with symbols, such as φ ≈ 1.618 or x², not LaTeX.'],
})

/** The kinds of file Jean and its computer make, by extension, each with its icon, and in words people use where there are some (any other shows its extension). */
const KINDS = /** @type {Record<string, string>} */ ({ docx: 'document', xlsx: 'sheet', csv: 'sheet', tsv: 'sheet', html: 'page', htm: 'page', svg: 'drawing', txt: 'text', md: 'text', markdown: 'text',
  png: 'picture', jpg: 'picture', jpeg: 'picture', gif: 'picture', webp: 'picture', pdf: 'pdf', pptx: 'slides', ics: 'event', vcf: 'contact',
  json: 'code', xml: 'code', yaml: 'code', yml: 'code', css: 'code', js: 'code', py: 'code', sql: 'code', tex: 'code' })
const WORDS = /** @type {Record<string, string>} */ ({ document: 'made.kind.document', sheet: 'made.kind.sheet', page: 'made.kind.page', drawing: 'made.kind.drawing', text: 'made.kind.text', picture: 'files.picture' })
const glyph = (/** @type {unknown} */ paths) => html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`
const TILES = /** @type {Record<string, unknown>} */ ({ document: icons.file, sheet: icons.table, page: icons.globe, drawing: icons.image, text: icons.note, picture: icons.image, contact: icons.person, code: icons.code,
  pdf: glyph(svg`<path d="M5.5 11V5.5a2 2 0 0 1 2-2H14l4.5 4.5v3M14 3.5V8h4.5M4 20.5v-6h1.8a1.8 1.8 0 0 1 0 3.6H4M10.25 14.5v6h.9a2.3 2.3 0 0 0 2.3-2.3v-1.4a2.3 2.3 0 0 0-2.3-2.3ZM20 14.5h-3.25v6M16.75 17.6h2.4"/>`),
  slides: glyph(svg`<path d="M3.5 4.5h17M5 4.5V14a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 14V4.5M12 15.5V18M8.5 20.5 12 18l3.5 2.5M9 12v-1.5M12 12V8M15 12V9.5"/>`),
  event: glyph(svg`<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" stroke-width="2.4"/>`) })

/**
 * A file Jean made, under the answer: a card with its name, the kind of file it is and its size,
 * opened in the preview (D126) or saved. A web page opens in the browser once it is on, where its
 * links lead on and the other files of /workspace it uses come along (D172). A picture is its own
 * tile, and so is a drawing (.svg), where its scripts never run.
 */
class FileMade extends Element {
  // A newer version of the file can take this one's place under the answer.
  static observedAttributes = ['uri', 'name', 'type', 'size', 'version']
  #url = ''

  render() {
    const name = this.getAttribute('name') ?? ''
    const type = this.getAttribute('type') ?? ''
    const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? ''
    const kind = KINDS[ext]
    const label = t('made.save', { name })
    const uri = this.getAttribute('uri') ?? ''
    // Its version, once the conversation has more than one of the file (D164).
    const versions = versionsOf(filesMade(callsIn(app.current.value?.records ?? [], app.live.value?.turn.steps)), name)
    const version = Number(this.getAttribute('version')) || 0
    const open = async () => (kind === 'page' && loaded.peek().has('browser')
      ? (await import('../browser/browser.js')).showMade({ uri, name })
      : (await import('../../ui/preview.js')).preview({ uri, name, mimeType: type, ...(version && { version }) }))
    // The whole card opens the file for a pointer; its Open button is the one keyboards and screen readers reach.
    return html`<div class="file-card" @click=${(/** @type {MouseEvent} */ event) => /** @type {HTMLElement} */ (event.target).closest('button') || open()}>
      <span class="file-tile" aria-hidden="true">${this.#url ? html`<img src=${this.#url} alt="">` : TILES[kind] ?? icons.file}</span>
      <span class="file-about"><span class="file-name"><span dir="auto">${name}</span></span>
        <span class="file-meta"><span>${WORDS[kind] ? t(WORDS[kind]) : ext.toUpperCase()}</span><span>${formatBytes(Number(this.getAttribute('size')) || 0)}</span>${version && versions.length > 1 ? html`<span>${t('made.version', { n: version })}</span>` : nothing}</span></span>
      <button class="icon-button" aria-label=${label} @click=${() => this.#save(name, type)}>${icons.download}</button>
      <button class="button" aria-label=${t('sources.open', { name })} @click=${open}>${t('made.open')}</button>
    </div>`
  }

  connectedCallback() {
    super.connectedCallback()
    this.#preview()
  }

  attributeChangedCallback() {
    if (!this.isConnected) return
    render(this.render(), this)
    this.#preview()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    URL.revokeObjectURL(this.#url)
    this.#url = ''
  }

  async #preview() {
    const uri = this.getAttribute('uri')
    const type = this.getAttribute('type') ?? ''
    const bytes = type.startsWith('image/') ? await this.#bytes() : null
    if (uri !== this.getAttribute('uri') || !this.isConnected) return
    URL.revokeObjectURL(this.#url)
    this.#url = bytes ? URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type })) : ''
    render(this.render(), this)
  }

  /** What it holds now: a workbook the user changed in the preview, the copy they changed it into (D229). */
  #bytes() {
    return app.fs.readBytes(`${app.projectDir}/${latestOf(app.current.peek()?.records ?? [], this.getAttribute('uri') ?? '')}`)
  }

  /** @param {string} name @param {string} type */
  async #save(name, type) {
    const bytes = await this.#bytes()
    if (bytes) save(new Blob([/** @type {BlobPart} */ (bytes)], { type }), name)
    else notify(t('files.missing', { name }))
  }
}

class Made extends Element {
  render() {
    const source = /** @type {string} */ (/** @type {any} */ (this).source ?? '')
    if (!source) return nothing
    const tables = tablesIn(source)
    return html`
      <button class="icon-button subtle" aria-label=${t('action.copy')} @click=${() => copyRich(source, this.closest('.msg-jean'))}>${icons.copy}</button>
      ${tables.map((table, i) => html`<button class="icon-button subtle"
        aria-label=${tables.length > 1 ? t('made.csvNumbered', { count: i + 1 }) : t('made.csvTitle')}
        @click=${() => downloadCSV(table, i + 1)}>${icons.table}</button>`)}`
  }
}

// ─── Rich text ───────────────────────────────────────────────────────────────

/**
 * Copies an answer two ways at once: its Markdown as text, and laid out as rich text, in which a
 * chart, a score, a deck's slide or a LaTeX document (D185, D196, D200) is the picture its widget on screen draws, or else its code, as a page (D289) is.
 * @param {string} source Markdown @param {globalThis.Element | null} [answer] the answer on screen, with its widgets
 */
export async function copyRich(source, answer) {
  try {
    if (typeof ClipboardItem === 'function' && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': laidOut(source, answer).then((rich) => new Blob([rich], { type: 'text/html' })),
        'text/plain': new Blob([source], { type: 'text/plain' }),
      })])
    } else await navigator.clipboard.writeText(source)
    // Some apps leave out pictures pasted in rich text (Notion), but take a widget's own copy (D196).
    notify(t(answer?.querySelector('.prose :is(app-chart, app-score) [role="img"], .prose app-slides .slide, .prose app-latex .latex-page, .prose app-diagram') ? 'toast.copiedPictures' : 'toast.copied'))
  } catch (error) {
    console.warn('Copy', error)
    notify(t('made.copyFailed'))
  }
}

/** The answer as HTML. @param {string} source @param {globalThis.Element | null | undefined} answer */
async function laidOut(source, answer) {
  const holder = document.createElement('div')
  render(markdown(source), holder)
  // lit-html leaves marker comments; the clipboard doesn't need them.
  const walker = document.createTreeWalker(holder, NodeFilter.SHOW_COMMENT)
  /** @type {ChildNode[]} */
  const comments = []
  while (walker.nextNode()) comments.push(/** @type {ChildNode} */ (walker.currentNode))
  for (const comment of comments) comment.remove()
  // Each widget's twin on screen, the same kind with the same source, draws its picture.
  const shown = [...answer?.querySelectorAll('.prose :is(app-chart, app-score, app-slides, app-latex, app-diagram)') ?? []]
  for (const widget of holder.querySelectorAll('app-chart, app-score, app-slides, app-latex, app-diagram, app-page')) {
    const code = widget.getAttribute('source') ?? ''
    const twin = shown.find((other) => other.localName === widget.localName && other.getAttribute('source') === code)
    if (twin) shown.splice(shown.indexOf(twin), 1)
    widget.replaceWith((twin && await pictureOf(twin)) || Object.assign(document.createElement('pre'), { textContent: code }))
  }
  return new XMLSerializer().serializeToString(holder)
}

/** A widget's picture as an image in the copied HTML, at the size it shows, or null. @param {globalThis.Element} widget */
async function pictureOf(widget) {
  try {
    const blob = await /** @type {{ picture: () => Promise<Blob> }} */ (/** @type {unknown} */ (widget)).picture()
    const reader = new FileReader()
    const read = new Promise((resolve, reject) => Object.assign(reader, { onload: resolve, onerror: reject }))
    reader.readAsDataURL(blob)
    const [{ width }] = await Promise.all([createImageBitmap(blob), read])
    // Drawn twice as fine as it shows.
    return Object.assign(document.createElement('img'), { src: String(reader.result), width: Math.round(width / 2), alt: widget.querySelector('[role="img"], .slide.is-shown')?.getAttribute('aria-label') ?? '' })
  } catch (error) {
    console.warn('Copy', error)
    return null
  }
}

// ─── Tables ──────────────────────────────────────────────────────────────────

/** @typedef {string[][]} Table rows of cells, the header first */

/** @param {string} source @returns {Table[]} */
export function tablesIn(source) {
  /** @type {Table[]} */
  const tables = []
  /** @param {any[]} tokens */
  const visit = (tokens) => {
    for (const token of tokens) {
      if (token.type === 'table') {
        tables.push([token.header, ...token.rows].map((/** @type {any[]} */ row) => row.map((cell) => inlineText(cell.tokens))))
      } else if (token.tokens && token.type !== 'paragraph') visit(token.tokens)
      else if (token.items) visit(token.items)
    }
  }
  try {
    visit(lexer(source))
  } catch {}
  return tables
}

/** @param {any[] | undefined} tokens @returns {string} */
function inlineText(tokens = []) {
  return tokens.map((token) => {
    if (token.tokens) return inlineText(token.tokens)
    if (token.type === 'br') return ' '
    return decode(token.text ?? token.raw ?? '')
  }).join('')
}

const ENTITIES = /** @type {Record<string, string>} */ ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })
/** @param {string} text */
const decode = (text) => text.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity])

/**
 * CSV the way spreadsheets in this locale expect it: `;` where the decimal mark is a
 * comma (as Excel does in French), a BOM so Excel reads UTF-8.
 * @param {Table} table @param {string} lang
 */
export function toCSV(table, lang) {
  const decimal = new Intl.NumberFormat(lang).formatToParts(1.5).find((part) => part.type === 'decimal')?.value
  const separator = decimal === ',' ? ';' : ','
  const quote = (/** @type {string} */ cell) => (/[",;\n\r]/.test(cell) || /^\s|\s$/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)
  return '﻿' + table.map((row) => row.map(quote).join(separator)).join('\r\n') + '\r\n'
}

/** @param {Table} table @param {number} index */
function downloadCSV(table, index) {
  save(new Blob([toCSV(table, locale.value)], { type: 'text/csv;charset=utf-8' }), `${t('made.tableFile', { count: index })}.csv`)
}

define('app-made', Made)
define('app-file', FileMade)
