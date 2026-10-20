// What a file shows as beside the conversation (D126): in the preview, and in the browser for a
// file of the conversation's folder or the project's workspace that isn't a page (D190), so both
// show a file the same way. A picture, a film or a sound as itself; a MIDI file, which no browser
// plays, as the sound Jean's own synthesizer makes of it (D197); a web page in a frame of its
// own (preview.html), doing what Settings lets it (D143), by default running its scripts without
// any network; a PDF's pages drawn by pdf.js; an Office file or a CSV as Office draws it, in a
// frame of the same kind (D183); Markdown laid out as an answer is, its blocks drawn as they would be
// there, and a file of a kind of block an answer draws (a tune's .abc, a diagram's .mmd, a map's
// .geojson, a Marp deck) drawn as that block (D432); anything else as its text, unless it isn't
// text. One this browser can't draw, play or read says so in its place.
// Loaded the first time a file shows, with its style sheet.
import { html, render } from 'lit-html'
import { effect } from '@preact/signals-core'
import { markdown, widget } from './markdown.js'
import { pagePolicy, PAGE_SANDBOX } from './csp.js'
import { styleSheet } from './sheet.js'
import { app, notify, keepRecords } from './state.js'
import { noteRecord } from '../core/events.js'
import { t } from '../core/i18n.js'

const FRAME = new URL('../preview.html', import.meta.url).href
/** The kind of block a file is by its name (D432); a deck is Markdown whose front matter says it is Marp's. */
const KINDS = /** @type {Record<string, string>} */ ({ abc: 'abc', mmd: 'mermaid', mermaid: 'mermaid', geojson: 'geojson' })

await styleSheet(new URL('view.css', import.meta.url))

/**
 * A file to show: its name, its bytes, its media type when known, its text when it isn't its bytes
 * as they are (what was read from a file shared), whether it is Markdown whatever its name says
 * (a document Jean wrote), and, for a workbook in the preview, that its cells change there (D229).
 * @typedef {{ name: string, bytes: Uint8Array, type?: string, text?: () => Promise<string>, prose?: boolean, cells?: { at?: import('../caps/files/office.js').Place } }} File
 */
/**
 * What a web page may do, as Settings and policy have it (D143, D158): its rights, its policy, and
 * what its frame allows. @typedef {{ allows: Record<import('./csp.js').PageRight, boolean>, sites: string[], policy: string, allow: string }} Page
 */

/**
 * A file's view: a template or an element. What it holds on to (a picture's address, a PDF) goes
 * into `holds`, to be let go with it. @param {File} file @param {(() => void)[]} holds @param {Page} page
 * @returns {Promise<unknown>}
 */
export async function viewOf(file, holds, page) {
  const { name, bytes } = file
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? ''
  const midi = /^(midi?|kar|rmi)$/.test(ext) || /^audio\/(x-)?midi?$/.test(file.type ?? '')
  const media = midi ? 'audio' : /^(image|video|audio)\//.exec(file.type ?? '')?.[1]
  if (media) {
    const sound = midi ? await (await import('../caps/files/midi.js')).midiSound(bytes).catch((error) => console.warn('View', error) ?? null) : null
    if (midi && !sound) return unshown()
    const url = URL.createObjectURL(sound ?? new Blob([/** @type {BlobPart} */ (bytes)], { type: file.type }))
    holds.push(() => URL.revokeObjectURL(url))
    // A kind this browser can't draw or play (a TIFF or HEIC picture outside Safari) says so in its place.
    const failed = (/** @type {Event} */ event) => /** @type {Element} */ (event.currentTarget).replaceWith(unshown())
    return media === 'image' ? html`<img class="view-picture" src=${url} alt=${name} @error=${failed}>`
      : media === 'video' ? html`<video class="view-film" src=${url} controls @error=${failed}></video>`
      : html`<audio class="view-sound" src=${url} controls @error=${failed}></audio>`
  }
  if (/^html?$/.test(ext)) return frame(new TextDecoder().decode(bytes), name, page.policy, page.allow)
  // A PDF's pages, drawn by pdf.js; its text when pdf.js can't open it.
  const pages = ext === 'pdf' && await pdf(bytes, holds).catch((error) => console.warn('View', error))
  if (pages) return pages
  const { extractPages, decodeText, isBinary } = await import('../caps/files/extract.js')
  const office = /^(docx|xlsx|pptx)$/.test(ext)
  const plain = office || isBinary(bytes) ? '' : decodeText(bytes)
  // An Office file as Office draws it; a CSV as Excel shows it, made a workbook by Jean's own writer (D183), and so an
  // .xls that is text, as many exports are, unless it is a web page or XML.
  const csv = page.allows.scripts && (/^(csv|tsv)$/.test(ext) || (ext === 'xls' && /^\s*[^<\s]/.test(plain))) ? await (await import('../caps/made/formats.js')).makeFile(name.replace(/\.(csv|tsv|xls)$/i, '.xlsx'), plain).catch(() => null) : null
  if (csv || (office && page.allows.scripts)) return frame(await (await import('../caps/files/office.js')).officePage(csv ? 'xlsx' : ext, csv?.bytes ?? bytes, name, csv ? undefined : file.cells), name, pagePolicy(page.allows, page.sites, true), page.allow)
  // Everything else shows from its text: an Office file's words, any other file as it is, unless it isn't text.
  const text = file.text ? await file.text() : office ? ((await extractPages(name, bytes)) ?? []).join('\n\n') : plain
  if (!text && !office && isBinary(bytes)) return unshown()
  const kind = Object.hasOwn(KINDS, ext) ? KINDS[ext] : /^(md|markdown)$/.test(ext) && /^---[ \t]*\r?\n(?:(?!---).*\r?\n)*?marp[ \t]*:[ \t]*true\b/.test(text) ? 'marp' : ''
  // Drawn as an answer is, by its own widget(), and again as what that needs comes or goes (D432): a skill, a block's widget, a
  // diagram's module, the layouts. A file of a kind of block is drawn by that block's widget while a skill of the room declares
  // the kind, as pages, diagrams and maps always are (D196); one its widget can't draw (a .geojson that isn't GeoJSON) shows as it
  // would without.
  const box = document.createElement('div')
  holds.push(effect(() => {
    const drawn = kind && widget({ lang: kind, text })
    render(drawn ? html`<div class="prose" dir="auto">${drawn}</div>`
      : /^(md|markdown)$/.test(ext) || file.prose ? html`<article class="view-sheet prose" dir="auto">${markdown(text)}</article>`
      : html`<pre class="view-text" dir="auto">${text}</pre>`, box)
  }))
  return box
}

/**
 * A cell the user changed in a workbook's frame (D229): checked, written into what `read` gives, kept by `keep`, which says what the note for the
 * brain of the task on screen carries; one that changes only in a spreadsheet app says so. @param {unknown} cell @param {Window} frame
 * @param {{ name: string, said: string, read: () => Promise<Uint8Array | null>, keep: (bytes: Uint8Array, at: import('../caps/files/office.js').Place) => Promise<{ was?: string, uri?: string }> }} file
 */
export async function changeCell(cell, frame, { name, said, read, keep }) {
  const { sheet, ref, value, sheetName, at } = /** @type {Record<string, any>} */ (cell ?? {})
  const conversation = app.current.peek()
  if (!/\.xlsx$/i.test(name) || !Number.isInteger(sheet) || typeof ref !== 'string' || typeof value !== 'string' || value.length > 32767) return
  try {
    const bytes = await read()
    if (!bytes) return notify(t('files.missing', { name }))
    const changed = await (await import('../caps/files/cells.js')).setCells(bytes, [{ sheet, ref, value }], name)
    const data = await keep(changed, { sheet, x: Number(at?.x) || 0, y: Number(at?.y) || 0, ref })
    const note = noteRecord(`The user changed ${name} ${said}: ${ref} in ${String(sheetName)} is ${value ? `now ${value}` : 'empty'}.`, { kind: 'cells', ...data })
    if (!conversation) return
    await keepRecords(conversation.path, [note], true)
  } catch (error) {
    console.warn('View', error)
    notify(t('preview.locked'))
    frame.postMessage({ unchanged: true }, '*')
  }
}

/** What shows in place of a file that can't. */
const unshown = () => Object.assign(document.createElement('p'), { className: 'view-note', textContent: t('view.unshown') })

/**
 * A web page, in a frame of its own: an opaque origin (scripts and forms, never allow-same-origin)
 * whose relay writes the policy ahead of the page. Both go in once, when the frame is ready. What
 * it allows is set before its address, since a frame takes it as it loads (D158).
 * @param {string} source @param {string} name @param {string} policy @param {string} allow
 */
function frame(source, name, policy, allow) {
  const send = { once: true, handleEvent: (/** @type {Event} */ event) => /** @type {HTMLIFrameElement} */ (event.target).contentWindow?.postMessage({ page: source, policy }, '*') }
  return html`<iframe class="view-frame" sandbox=${PAGE_SANDBOX} allow=${allow} src=${FRAME} title=${name} @load=${send}></iframe>`
}

/**
 * A PDF's pages, drawn when they come into view, at the size they show, and let go when they
 * are far from it. @param {Uint8Array} bytes @param {(() => void)[]} holds
 */
async function pdf(bytes, holds) {
  const task = await (await import('../caps/files/pdf.js')).openPdf(bytes)
  holds.push(() => task.destroy())
  const doc = await task.promise
  const pages = Object.assign(document.createElement('div'), { className: 'view-pages' })
  /** @type {WeakMap<object, (seen: boolean) => void>} */
  const seen = new WeakMap()
  const observer = new IntersectionObserver((entries) => entries.forEach(({ target, isIntersecting }) => seen.get(target)?.(isIntersecting)), { rootMargin: '100% 0px' })
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
      observer.observe(pages.appendChild(canvas))
    }
  })().catch(() => {})
  return pages
}
