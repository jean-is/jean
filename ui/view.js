// What a file shows as beside the conversation (D126): in the preview, and in the browser for a
// file of the conversation's folder or the project's workspace that isn't a page (D190), so both
// show a file the same way. A picture, a film or a sound as itself; a web page in a frame of its
// own (preview.html), doing what Settings lets it (D143), by default running its scripts without
// any network; a PDF's pages drawn by pdf.js; an Office file or a CSV as Office draws it, in a
// frame of the same kind (D183); Markdown laid out as an answer is; anything else as its text.
// Loaded the first time a file shows, with its style sheet.
import { html } from 'lit-html'
import { markdown } from './markdown.js'
import { pagePolicy } from './csp.js'
import { styleSheet } from './sheet.js'

const FRAME = new URL('../preview.html', import.meta.url).href

await styleSheet(new URL('view.css', import.meta.url))

/**
 * A file to show: its name, its bytes, its media type when known, its text when it isn't its bytes
 * as they are (what was read from a file shared), and whether it is Markdown whatever its name says
 * (a document Jean wrote).
 * @typedef {{ name: string, bytes: Uint8Array, type?: string, text?: () => Promise<string>, prose?: boolean }} File
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
  const media = /^(image|video|audio)\//.exec(file.type ?? '')?.[1]
  if (media) {
    const url = URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type: file.type }))
    holds.push(() => URL.revokeObjectURL(url))
    return media === 'image' ? html`<img class="view-picture" src=${url} alt=${name}>`
      : media === 'video' ? html`<video class="view-film" src=${url} controls></video>`
      : html`<audio class="view-sound" src=${url} controls></audio>`
  }
  if (/^html?$/.test(ext)) return frame(new TextDecoder().decode(bytes), name, page.policy, page.allow)
  // A PDF's pages, drawn by pdf.js; its text when pdf.js can't open it.
  if (ext === 'pdf') {
    try {
      return await pdf(bytes, holds)
    } catch (error) {
      console.warn('View', error)
    }
  }
  // An Office file as Office draws it; a CSV as Excel shows it, made a workbook by Jean's own writer (D183).
  const csv = /^(csv|tsv)$/.test(ext) && page.allows.scripts ? await (await import('../caps/made/formats.js')).makeFile(name.replace(/\.[ct]sv$/i, '.xlsx'), new TextDecoder().decode(bytes)).catch(() => null) : null
  if (csv || (/^(docx|xlsx|pptx)$/.test(ext) && page.allows.scripts)) return frame(await (await import('../caps/files/office.js')).officePage(csv ? 'xlsx' : ext, csv?.bytes ?? bytes, name), name, pagePolicy(page.allows, page.sites, true), page.allow)
  // Everything else shows from its text: an Office file's words, any other file as it is.
  const { extractPages, decodeText } = await import('../caps/files/extract.js')
  const text = file.text ? await file.text() : /^(docx|xlsx|pptx)$/.test(ext) ? ((await extractPages(name, bytes)) ?? []).join('\n\n') : decodeText(bytes)
  if (/^(md|markdown)$/.test(ext) || file.prose) return html`<article class="view-sheet prose" dir="auto">${markdown(text)}</article>`
  return html`<pre class="view-text" dir="auto">${text}</pre>`
}

/**
 * A web page, in a frame of its own: an opaque origin (scripts, never with allow-same-origin)
 * whose relay writes the policy ahead of the page. Both go in once, when the frame is ready. What
 * it allows is set before its address, since a frame takes it as it loads (D158).
 * @param {string} source @param {string} name @param {string} policy @param {string} allow
 */
function frame(source, name, policy, allow) {
  const send = { once: true, handleEvent: (/** @type {Event} */ event) => /** @type {HTMLIFrameElement} */ (event.target).contentWindow?.postMessage({ page: source, policy }, '*') }
  return html`<iframe class="view-frame" sandbox="allow-scripts" allow=${allow} src=${FRAME} title=${name} @load=${send}></iframe>`
}

/**
 * A PDF's pages, drawn when they come into view, at the size they show, and let go when they
 * are far from it. @param {Uint8Array} bytes @param {(() => void)[]} holds
 */
async function pdf(bytes, holds) {
  const { openPdf } = await import('../caps/files/pdf.js')
  const task = await openPdf(bytes)
  holds.push(() => task.destroy())
  const doc = await task.promise
  const pages = Object.assign(document.createElement('div'), { className: 'view-pages' })
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
