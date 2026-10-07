// Things Jean made: files the brain writes (a Word document, a spreadsheet, a text file),
// kept in the project's files and shown under the answer, ready to save (D119); an answer
// copied as rich text (pastes formatted into Word, Outlook and Google Docs), or its tables as
// CSV (opens in Excel). Browser features only; no file-format library.
import { html, nothing, render } from 'lit-html'
import { lexer } from 'marked'
import { Element, define } from '../../ui/base.js'
import { register, loaded } from '../../ui/caps.js'
import { app, notify, conversationOf } from '../../ui/state.js'
import { save } from '../../ui/save.js'
import { markdown } from '../../ui/markdown.js'
import { icons } from '../../ui/icons.js'
import { addFile, fileText, splitPages } from '../../core/files.js'
import { callsIn, filesMade, nextVersion, versionsOf } from '../../core/events.js'
import { t, locale, formatBytes } from '../../core/i18n.js'
import { styleSheet } from '../../ui/sheet.js'

/** @typedef {import('../../core/events.js').MadeFile} MadeFile what a call that made a file records (`_meta.file`), with its version (D164) */

// The cards' style sheet comes with them, not with the first screen (D126).
await styleSheet(new URL('made.css', import.meta.url))

// ─── Writing files ───────────────────────────────────────────────────────────

/** Where paper is letter-sized: the user's region, as the browser gives it. */
const LETTER = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'PR'])
function paper() {
  try {
    return LETTER.has(new Intl.Locale(navigator.language).maximize().region ?? '') ? 'letter' : 'a4'
  } catch {
    return 'a4'
  }
}

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
 * wrote as its text, so it can be changed later. The call records it; the answer shows it.
 * @param {string} name @param {string} content @param {import('../../core/loop.js').ToolContext} ctx
 */
async function keep(name, content, ctx) {
  // The writers load with the first file made, not with the first message.
  const { makeFile } = await import('./formats.js')
  const { name: kept, mimeType, bytes } = await makeFile(name, content, { paper: paper() })
  const link = await addFile(app.fs, { projectDir: app.projectDir, name: kept, mimeType, bytes, pages: [content], by: 'jean' })
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
      'or a text file, as it is (.md, .csv, .txt, .html, .svg, .json, .ics…).',
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
    description: 'Change part of a file you made with write: replace a passage of what you wrote (its Markdown, CSV or text), quoted exactly, with new text. The passage must be there once. The user gets the new version.',
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
    const found = files.findLast((file) => file.name.toLowerCase() === wanted)
    if (!found) throw new Error(`No file named "${args?.file}" was made in this conversation. Made: ${[...new Set(files.map((file) => file.name))].join(', ') || 'none'}. Use write to make it.`)
    const text = await fileText(app.fs, app.projectDir, found.uri)
    if (text === null) throw new Error(`${found.name} is no longer on this device. Use write to make it again.`)
    const { replaceOnce } = await import('./formats.js')
    const changed = replaceOnce(splitPages(text).join('\n'), String(args?.old ?? ''), String(args?.new ?? ''), found.name)
    const { kept, version } = await keep(found.name, changed, ctx)
    return `Changed ${kept}. The new version, version ${version}, shows under your answer, and the earlier one stays under its own.`
  },
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

/** The kinds of file Jean makes, by extension, in words people use (any other shows its extension), each with its icon. */
const KINDS = /** @type {Record<string, string>} */ ({ docx: 'document', xlsx: 'sheet', csv: 'sheet', tsv: 'sheet', html: 'page', htm: 'page', svg: 'drawing', txt: 'text', md: 'text', markdown: 'text' })
const TILES = /** @type {Record<string, unknown>} */ ({ document: icons.file, sheet: icons.table, page: icons.globe, drawing: icons.image, text: icons.note })

/**
 * A file Jean made, under the answer: a card with its name, the kind of file it is and its size,
 * opened in the preview (D126) or saved. A web page opens in the browser once it is on, where its
 * links lead on and the other files of /workspace it uses come along (D172). A drawing (.svg) is
 * its own tile, a picture where its scripts never run.
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
        <span class="file-meta"><span>${kind ? t(`made.kind.${kind}`) : ext.toUpperCase()}</span><span>${formatBytes(Number(this.getAttribute('size')) || 0)}</span>${version && versions.length > 1 ? html`<span>${t('made.version', { n: version })}</span>` : nothing}</span></span>
      <button class="icon-button" title=${label} aria-label=${label} @click=${() => this.#save(name, type)}>${icons.download}</button>
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
    const bytes = this.getAttribute('type') === 'image/svg+xml' ? await this.#bytes() : null
    if (uri !== this.getAttribute('uri') || !this.isConnected) return
    URL.revokeObjectURL(this.#url)
    this.#url = bytes ? URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type: 'image/svg+xml' })) : ''
    render(this.render(), this)
  }

  #bytes() {
    return app.fs.readBytes(`${app.projectDir}/${this.getAttribute('uri')}`)
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
      <button class="icon-button subtle" aria-label=${t('action.copy')} title=${t('made.copyTitle')} @click=${() => copyRich(source)}>${icons.copy}</button>
      ${tables.map((table, i) => html`<button class="icon-button subtle" title=${t('made.csvTitle')}
        aria-label=${tables.length > 1 ? t('made.csvNumbered', { count: i + 1 }) : t('made.csvTitle')}
        @click=${() => downloadCSV(table, i + 1)}>${icons.table}</button>`)}`
  }
}

// ─── Rich text ───────────────────────────────────────────────────────────────

/** @param {string} source Markdown */
export async function copyRich(source) {
  const holder = document.createElement('div')
  render(markdown(source), holder)
  // lit-html leaves marker comments; the clipboard doesn't need them.
  const walker = document.createTreeWalker(holder, NodeFilter.SHOW_COMMENT)
  /** @type {ChildNode[]} */
  const comments = []
  while (walker.nextNode()) comments.push(/** @type {ChildNode} */ (walker.currentNode))
  for (const comment of comments) comment.remove()
  const rich = new XMLSerializer().serializeToString(holder)
  try {
    if (typeof ClipboardItem === 'function' && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([rich], { type: 'text/html' }),
        'text/plain': new Blob([source], { type: 'text/plain' }),
      })])
    } else await navigator.clipboard.writeText(source)
    notify(t('toast.copied'))
  } catch (error) {
    console.warn('Copy', error)
    notify(t('made.copyFailed'))
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
