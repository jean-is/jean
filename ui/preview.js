// The preview (D126): a file Jean made or the user shared, seen beside the conversation, or over
// it on a narrow screen, in a pane of the dock (D144), with a button to save it. Each kind shows
// as what it is: a picture or a drawing as a picture; a web page in a frame of its own
// (preview.html), doing what Settings lets it (D143), by default running its scripts without any
// network; a PDF's pages drawn by pdf.js; a document on a sheet; a spreadsheet as a grid; a deck
// as its slides' text. A file being changed shows its new version as it comes. Loaded the first
// time a file is opened, with its style sheet.
import { html, nothing } from 'lit-html'
import { signal, computed, effect } from '@preact/signals-core'
import { Element, define } from './base.js'
import * as dock from './dock.js'
import { app, effective, notify } from './state.js'
import { save, savePage } from './save.js'
import { markdown } from './markdown.js'
import { icons } from './icons.js'
import { fileMeta, fileText, splitPages } from '../core/files.js'
import { callsIn, filesMade, versionsOf } from '../core/events.js'
import { pageRights, pagePolicy, pageAllow } from './csp.js'
import { t } from '../core/i18n.js'
import { styleSheet } from './sheet.js'

/** @typedef {{ uri: string, name: string, mimeType?: string, version?: number }} Shown  version: which of the conversation's, for a file Jean made (D164) */

const FRAME = new URL('../preview.html', import.meta.url).href
// Rows a grid shows: more would only slow the page; the file has them all.
const ROWS = 2000

await styleSheet('ui/preview.css')

const shown = signal(/** @type {Shown | null} */ (null))
const view = signal(/** @type {unknown} */ (nothing))

// What a web page may do, as Settings and policy have it (D143, D158): its policy, and what its frame allows.
const rights = computed(() => pageRights(effective.value.settings, app.policy))
const policy = computed(() => pagePolicy(rights.value.allows, rights.value.sites))
const allow = computed(() => pageAllow(rights.value.allows))
// A file the page made, saved for it.
addEventListener('message', ({ source, data }) => {
  if (source && source === document.querySelector('app-preview')?.querySelector('iframe')?.contentWindow) savePage(data, rights.peek().allows.downloads)
})

export const preview = (/** @type {Shown} */ file) => { shown.value = file }
const close = () => { shown.value = null }

// The versions of the file on show, when Jean made it: each one the conversation kept, oldest first (D164).
const versions = computed(() => {
  const file = shown.value
  return file ? versionsOf(filesMade(callsIn(app.current.value?.records ?? [], app.live.value?.turn.steps)), file.name) : []
})
/** Where the file on show is among its versions: the one asked for, or the last with its content. */
const at = computed(() => {
  const file = shown.value
  const all = versions.value
  return file?.version && all[file.version - 1]?.uri === file.uri ? file.version - 1 : all.findLastIndex((each) => each.uri === file?.uri)
})

class Preview extends Element {
  render() {
    const file = shown.value
    if (!file) return nothing
    const label = t('made.save', { name: file.name })
    return html`<aside class="pane preview" aria-label=${file.name} @keydown=${(/** @type {KeyboardEvent} */ event) => event.key === 'Escape' && close()}>
      <header class="pane-head">
        <h2><span dir="auto">${file.name}</span></h2>
        ${versions.value.length > 1 && at.value >= 0 ? picker() : nothing}
        <button class="icon-button" title=${label} aria-label=${label} @click=${() => download(file)}>${icons.download}</button>
        <button class="icon-button" title=${t('action.close')} aria-label=${t('action.close')} @click=${close}>${icons.close}</button>
      </header>
      <div class="preview-body">${view.value}</div>
    </aside>`
  }

  updated() {
    if (dock.place(this, Boolean(shown.value))) this.querySelector('button')?.focus()
  }
}

/** The versions of the file on show, the one it is chosen, to pick another (D164). */
function picker() {
  const all = versions.value
  // Its value as well as the options' selected: once picked from, a select no longer follows the attribute.
  return html`<select class="versions" aria-label=${t('preview.versions')} .value=${String(at.value)}
    @change=${(/** @type {Event} */ event) => { shown.value = all[Number(/** @type {HTMLSelectElement} */ (event.target).value)] }}>
    ${all.map((each, i) => html`<option value=${i} ?selected=${i === at.value}>${t('made.version', { n: each.version })}</option>`)}
  </select>`
}

/** @param {Shown} file */
async function download(file) {
  const bytes = await app.fs.readBytes(`${app.projectDir}/${file.uri}`)
  if (bytes) save(new Blob([/** @type {BlobPart} */ (bytes)], { type: file.mimeType ?? '' }), file.name)
  else notify(t('files.missing', { name: file.name }))
}

// What the file shows as, read again when another file (or a new version) is shown, or when what
// a web page may do changes. What a view holds on to (a picture's address, a PDF) is let go with
// it, or at once if it came too late.
effect(() => {
  const file = shown.value
  const rules = policy.value
  const allows = allow.value
  /** @type {(() => void)[]} */
  const holds = []
  const release = () => { for (const run of holds.splice(0)) run() }
  view.value = nothing
  if (file) {
    show(file, holds, rules, allows).catch((error) => console.warn('Preview', error) ?? null).then((template) => {
      if (shown.peek() !== file) release()
      else if (template === null) close()
      else view.value = template
    })
  }
  return release
})

// A newer version of the file on show, made while the answer is written, takes its place, unless
// the user went back to an earlier one (D164).
let newest = { name: '', uri: '' }
effect(() => {
  const file = shown.value
  const last = versions.value.at(-1)
  const before = newest
  newest = { name: file?.name ?? '', uri: last?.uri ?? '' }
  if (file && last && before.name === file.name && before.uri && before.uri !== last.uri && file.uri === before.uri) shown.value = last
})

// Another conversation, or another project, closes it.
let conversation = app.current.peek()?.id
effect(() => {
  if (app.current.value?.id !== conversation) close()
  conversation = app.current.peek()?.id
})

/**
 * @param {Shown} file @param {(() => void)[]} holds @param {string} rules a web page's policy
 * @param {string} allows what its frame allows
 * @returns {Promise<unknown>} null when the file is no longer there, or can't be read
 */
async function show(file, holds, rules, allows) {
  const dir = app.project.peek().dir
  const bytes = await app.fs.readBytes(`${dir}/${file.uri}`)
  if (!bytes) {
    notify(t('files.missing', { name: file.name }))
    return null
  }
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase() ?? ''
  if (file.mimeType?.startsWith('image/')) {
    const url = URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type: file.mimeType }))
    holds.push(() => URL.revokeObjectURL(url))
    return html`<img class="preview-picture" src=${url} alt=${file.name}>`
  }
  if (/^html?$/.test(ext)) return frame(new TextDecoder().decode(bytes), file.name, rules, allows)
  if (ext === 'pdf') {
    try {
      return await pdf(bytes, holds)
    } catch (error) {
      console.warn('Preview', error)
    }
  }
  // Everything else shows from its text: what Jean wrote for a file it made, what was read from a shared one.
  const pages = splitPages((await fileText(app.fs, dir, file.uri)) ?? '')
  const made = (await fileMeta(app.fs, dir, file.uri))?.author === 'jean'
  if (ext === 'pptx') return html`<ol class="preview-slides">${pages.map(slide)}</ol>`
  if (/^(xlsx|csv|tsv)$/.test(ext)) return grids(await sheets(ext, made, pages, file.name))
  if (/^(md|markdown)$/.test(ext) || (made && ext === 'docx')) return html`<article class="preview-sheet prose" dir="auto">${markdown(pages.join('\n'))}</article>`
  if (ext === 'docx' || ext === 'pdf') return (ext === 'pdf' ? pages : [pages.join('\n')]).map((page) => html`<article class="preview-sheet" dir="auto">${paragraphs(page)}</article>`)
  return html`<pre class="preview-text" dir="auto">${pages.join('\n')}</pre>`
}

/** @param {string} text */
const paragraphs = (text) => text.split(/\n+/).map((line) => html`<p>${line}</p>`)

/** A slide's text: its first line is its title. @param {string} text */
function slide(text) {
  const [title = '', ...lines] = text.split('\n').filter((line) => line.trim())
  return html`<li dir="auto"><h3>${title}</h3>${lines.map((line) => html`<p>${line}</p>`)}</li>`
}

/**
 * A web page, in a frame of its own: an opaque origin (scripts, never with allow-same-origin)
 * whose relay writes the policy ahead of the page. Both go in once, when the frame is ready. What
 * it allows is set before its address, since a frame takes it as it loads (D158).
 * @param {string} source @param {string} name @param {string} policy @param {string} allow
 */
function frame(source, name, policy, allow) {
  const send = { once: true, handleEvent: (/** @type {Event} */ event) => /** @type {HTMLIFrameElement} */ (event.target).contentWindow?.postMessage({ page: source, policy }, '*') }
  return html`<iframe class="preview-frame" sandbox="allow-scripts" allow=${allow} src=${FRAME} title=${name} @load=${send}></iframe>`
}

/**
 * A PDF's pages, drawn when they come into view, at the size they show, and let go when they
 * are far from it. Falls back to its text when pdf.js can't open it.
 * @param {Uint8Array} bytes @param {(() => void)[]} holds
 */
async function pdf(bytes, holds) {
  const { openPdf } = await import('../caps/files/pdf.js')
  const task = await openPdf(bytes)
  holds.push(() => task.destroy())
  const doc = await task.promise
  const pages = Object.assign(document.createElement('div'), { className: 'preview-pages' })
  /** @type {WeakMap<object, (seen: boolean) => void>} */
  const seen = new WeakMap()
  const observer = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) seen.get(target)?.(isIntersecting)
  }, { rootMargin: '100% 0px' })
  holds.push(() => observer.disconnect())
  // Page by page, so the first shows at once; a PDF let go stops this (getPage fails).
  ;(async () => {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const { width, height } = page.getViewport({ scale: 1 })
      const canvas = document.createElement('canvas')
      canvas.style.aspectRatio = `${width} / ${height}`
      /** @type {any} */
      let drawing = null
      seen.set(canvas, (near) => {
        drawing?.cancel()
        const viewport = page.getViewport({ scale: near ? (canvas.clientWidth * devicePixelRatio) / width : 0 })
        Object.assign(canvas, { width: Math.floor(viewport.width), height: Math.floor(viewport.height) })
        drawing = canvas.width ? page.render({ canvas, viewport }) : null
        drawing?.promise.catch(() => {})
      })
      pages.append(canvas)
      observer.observe(canvas)
    }
  })().catch(() => {})
  return pages
}

/**
 * A spreadsheet's sheets: what Jean wrote (CSV, or Markdown tables under their sheets' names),
 * a shared CSV, or a shared workbook's text, each page a sheet's name, then its rows by tabs.
 * @param {string} ext @param {boolean} made @param {string[]} pages @param {string} name
 * @returns {Promise<{ name: string, rows: string[][] }[]>}
 */
async function sheets(ext, made, pages, name) {
  const { sheetsIn, csvRows } = await import('../caps/made/formats.js')
  if (ext !== 'xlsx') return [{ name: '', rows: csvRows(pages.join('\n')) }]
  if (made) return sheetsIn(pages.join('\n'), name.slice(0, -5))
  /** @type {Map<string, string[][]>} */
  const found = new Map()
  for (const page of pages) {
    const [head, ...rows] = page.split('\n')
    const sheet = head.replace(/^Sheet: /, '').replace(/ \(rows [^)]*\)$/, '')
    found.set(sheet, [...(found.get(sheet) ?? []), ...rows.map((row) => row.split('\t'))])
  }
  return [...found].map(([sheet, rows]) => ({ name: sheet, rows }))
}

/** Each sheet as a grid, its columns lettered and its rows numbered, as spreadsheets show them. @param {{ name: string, rows: string[][] }[]} list */
function grids(list) {
  return list.map(({ name, rows }) => {
    const columns = Array.from({ length: Math.max(0, ...rows.map((row) => row.length)) }, (_, i) => letters(i))
    return html`<section class="preview-grid">
      ${list.length > 1 ? html`<h3 dir="auto">${name}</h3>` : nothing}
      <table><thead><tr><th></th>${columns.map((column) => html`<th>${column}</th>`)}</tr></thead>
      <tbody>${rows.slice(0, ROWS).map((row, r) => html`<tr><th>${r + 1}</th>${columns.map((_, i) => html`<td dir="auto"
        class=${/^[-+]?\d[\d.,\s]*%?$/.test(row[i] ?? '') ? 'number' : ''}>${row[i] ?? ''}</td>`)}</tr>`)}
      ${rows.length > ROWS ? html`<tr><th>…</th></tr>` : nothing}</tbody></table>
    </section>`
  })
}

/** @param {number} index @returns {string} A, B, … Z, AA… */
const letters = (index) => (index >= 26 ? letters(Math.floor(index / 26) - 1) : '') + String.fromCharCode(65 + (index % 26))

define('app-preview', Preview)
dock.join(document.createElement('app-preview'))
