// The preview (D126): a file Jean made or the user shared, seen beside the conversation, or over
// it on a narrow screen, in a pane of the dock (D144), with a button to save it. Each kind shows
// as what it is (ui/view.js, which the browser shares): a picture as a picture; a web page in a
// frame of its own, doing what Settings lets it (D143); a PDF's pages drawn; an Office file or a
// CSV as Office draws it (D183); Markdown laid out; else its text. A file being changed shows its
// new version as it comes. Each file shows where it was scrolled to in this tab, as an unsent draft
// comes back, and never in the file itself (D582). Loaded the first time a file is opened, with its
// style sheet.
import { html, nothing } from 'lit-html'
import { signal, computed, effect } from '@preact/signals-core'
import { Element, define } from './base.js'
import * as dock from './dock.js'
import { app, effective, notify } from './state.js'
import { save, savePage } from './save.js'
import { act } from './acts.js'
import { icons } from './menu-icons.js'
import { addFile, fileMeta, fileText, fileTitle, splitPages } from '../core/files.js'
import { callsIn, filesMade, latestOf, versionsOf } from '../core/events.js'
import { pageRights, pagePolicy, pageAllow } from './csp.js'
import { t } from '../core/i18n.js'
import { styleSheet } from './sheet.js'
import { changeCell, viewOf } from './view.js'
import { keep } from './windows.js'
import { loaded, slots } from './caps.js'

/** @typedef {{ uri: string, name: string, title: string, mimeType?: string, version?: number, at?: string }} Shown  name: the file's, which it saves as; title: what its head says, as whoever opens it names it; version: which of the conversation's, for a file Jean made (D164); at: where a citation points in it, as its mark says (D481) */

await Promise.all([styleSheet('ui/preview.css'), styleSheet('ui/select.css')])

const shown = signal(/** @type {Shown | null} */ (null))
const view = signal(/** @type {unknown} */ (nothing))

// What a web page may do, as Settings and policy have it (D143, D158): its policy, and what its frame allows.
const rights = computed(() => pageRights(effective.value.settings, app.policy))
const policy = computed(() => pagePolicy(rights.value.allows, rights.value.sites))
const allow = computed(() => pageAllow(rights.value.allows))
// A file the page made, saved for it; a cell of a workbook the user changed (D229).
addEventListener('message', ({ source, data }) => {
  if (!source || source !== document.querySelector('app-preview')?.querySelector('iframe')?.contentWindow) return
  const file = shown.peek()
  if (!data?.cell || !file) return savePage(data, rights.peek().allows.downloads)
  // In the version on show: what it holds becomes a copy with the change, as the bytes the brain read stay as they were (D229).
  changeCell(data.cell, /** @type {Window} */ (source), { name: file.name, said: 'in the preview', read: () => app.fs.readBytes(`${app.projectDir}/${copy.peek()}`), keep: async (bytes, at) => {
    const pages = (await (await import('../caps/files/extract.js')).extractPages(file.name, bytes)) ?? []
    const link = await addFile(app.fs, { projectDir: app.projectDir, name: file.name, mimeType: file.mimeType, bytes, pages, by: app.deviceId })
    where = { uri: link.uri, at }
    return { was: file.uri, uri: link.uri }
  } })
})
// Where the user was in the workbook they changed last, to show it there again.
let where = /** @type {{ uri: string, at: import('../caps/files/office.js').Place } | null} */ (null)

export const preview = (/** @type {Shown} */ file) => { shown.value = file }
const close = () => { shown.value = null }
/** Closed if it shows this file, gone from the Creations page (D544). @param {string} uri */
export const unshow = (uri) => { if (shown.peek()?.uri === uri) close() }
/** Documents' module for a document, Tables' for a collection, Designs' for a design, Skills' scores for a tune an answer holds and decks for a deck kept, its pages' for an app one holds, once found (D485, D491, D507, D544, D553, D558, D572, D591). @param {string} uri */
const keeper = (uri) => {
  const [, id, load] = KEEPERS.find(([place]) => place.test(uri)) ?? []
  return id && load && loaded.peek().has(id) ? load() : null
}
const KEEPERS = /** @type {[RegExp, string, () => Promise<any>][]} */ ([[/^documents\//, 'documents', () => import('../caps/documents/documents.js')], [/^collections\//, 'tables', () => import('../caps/tables/tables.js')],
  [/^designs\//, 'designs', () => import('../caps/designs/designs.js')], [/^conversations\/[^#]+#\d+$/, 'skills', () => import('../caps/skills/scores.js')], [/^decks\//, 'skills', () => import('../caps/skills/decks.js')], [/^conversations\/[^#]+#app-\d+$/, 'interactive', () => import('../caps/interactive/apps.js')]])
// In the address (D220): the file on show, by its place in the project, which says its name and kind.
keep('preview', {
  get: () => shown.value?.uri ?? null,
  set: async (uri) => {
    if (uri === null) return close()
    // A document or a table Jean keeps by its own name, once Documents or Tables is found (D485, D491).
    const meta = uri !== shown.peek()?.uri && (/^files\/[^/]+$/.test(uri) ? await fileMeta(app.fs, app.projectDir, uri).then((one) => one && { ...one, title: fileTitle(one.name) }) : await (await keeper(uri))?.metaOf(uri))
    // Shown once what it shows is there, for the room to show with it (D582).
    if (meta) preview({ uri, name: meta.name, title: meta.title, mimeType: meta.mimeType }), await viewing
  },
})

// What the file on show holds now: the copy the user last changed it into here (D229), else itself.
const copy = computed(() => (shown.value ? latestOf(app.current.value?.records ?? [], shown.value.uri) : ''))

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

// Where each file's view was scrolled to in this tab, by its place (D582): the view, or a box in it that scrolls on its own, as a
// table's does, by its class, each across and down. Where the view on show is still to go is set again as what it holds comes (a
// PDF's pages), until it gets there, the user moves it, or three seconds have passed.
const PLACES = 'app.scrolled', placeOf = () => `${app.projectDir}/${shown.peek()?.uri}`
let places = /** @type {Record<string, Record<string, number[]>>} */ ({}); try { places = JSON.parse(sessionStorage.getItem(PLACES) ?? '{}') } catch {}
let still = /** @type {Record<string, number[]>} */ ({})
const stay = () => { still = {} }
const scrollBack = (/** @type {globalThis.Element} */ view) => { for (const [name, [left, top]] of Object.entries(still)) { const box = name ? view.querySelector(`.${CSS.escape(name)}`) : view; box?.scrollTo(left, top); if (box && Math.abs(box.scrollLeft - left) + Math.abs(box.scrollTop - top) < 2) delete still[name] } }
const grown = new MutationObserver(() => { const view = document.querySelector('app-preview .view'); if (view) scrollBack(view) })

class Preview extends Element {
  /** The view last shown, to scroll it where it was once it changes. */
  #shown = /** @type {unknown} */ (nothing)

  render() {
    const file = shown.value
    if (!file) return nothing
    return html`<aside class="pane preview" aria-label=${file.title} @keydown=${(/** @type {KeyboardEvent} */ event) => event.key === 'Escape' && !event.defaultPrevented && close()}>
      <header class="pane-head">
        <h2><span dir="auto">${file.title}</span></h2>
        ${versions.value.length > 1 && at.value >= 0 ? picker(file) : nothing}
        ${slots('head').map((part) => part.draw(file))}
        ${/^(designs|decks)\//.test(file.uri) ? nothing : html`<button class="icon-button" aria-label=${t('made.save', { name: file.name })} @click=${() => download(file)}>${icons.download}</button>`}
        <button class="icon-button" aria-label=${t('action.close')} @click=${close}>${icons.close}</button>
      </header>
      <div class="view" @scroll=${{ handleEvent: scrolled, capture: true }} @pointerdown=${stay} @keydown=${stay} @wheel=${{ handleEvent: stay, passive: true }}>${view.value}</div>
    </aside>`
  }

  updated() {
    if (dock.place(this, Boolean(shown.value))) this.querySelector('button')?.focus()
    const box = this.querySelector('.view')
    if (box && this.#shown !== (this.#shown = view.peek())) { const these = still = { ...places[placeOf()] }; grown.observe(box, { childList: true, subtree: true }); setTimeout(() => still === these && stay(), 3000) }
    if (box) scrollBack(box)
  }
}

/** A scroll kept while the file shows, not as its view gives way to another's or goes back where it was: the view's, or the one box of its class's in it. @param {Event} event */
function scrolled({ target }) {
  const box = /** @type {HTMLElement} */ (target), at = box.closest('.view'), name = box === at ? '' : box.classList[0]
  if (!at || view.peek() === nothing || name === undefined || name in still || (name && at.querySelectorAll(`.${CSS.escape(name)}`).length > 1)) return
  places[placeOf()] = { ...places[placeOf()], [name]: [box.scrollLeft, box.scrollTop] }; try { sessionStorage.setItem(PLACES, JSON.stringify(places)) } catch {}
}

/** The versions of the file on show, the one it is chosen, to pick another (D164), by the same title. @param {Shown} file */
function picker(file) {
  const all = versions.value
  // Its value as well as the options' selected: once picked from, a select no longer follows the attribute.
  return html`<select class="versions" aria-label=${t('preview.versions')} .value=${String(at.value)}
    @change=${(/** @type {Event} */ event) => { shown.value = { ...all[Number(/** @type {HTMLSelectElement} */ (event.target).value)], title: file.title } }}>
    ${all.map((each, i) => html`<option value=${i} ?selected=${i === at.value}>${t('made.version', { n: each.version })}</option>`)}
  </select>`
}

/** @param {Shown} file */
async function download(file) {
  // A table downloads as a workbook, named as its name with .xlsx (D491, D620), a tune as its ABC (D544).
  const kept = await keeper(file.uri), book = /^collections\//.test(file.uri) && await (await import('../caps/tables/tables.js')).workbook(file.uri), name = book ? book.name : file.name
  const bytes = book ? book.bytes : kept && 'bytesOf' in kept ? await kept.bytesOf(file.uri) : await app.fs.readBytes(`${app.projectDir}/${copy.peek() || file.uri}`)
  if (!bytes) return notify(t('files.missing', { name: file.name }))
  save(new Blob([/** @type {BlobPart} */ (bytes)], { type: file.mimeType ?? '' }), name)
  act('file.save', { task: app.current.peek()?.path, format: /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() })
}

// What the file shows as, read again when another file (or a new version) is shown, or when what
// a web page may do changes. What a view holds on to (a picture's address, a PDF) is let go with
// it, or at once if it came too late. Done once it shows, or is given up.
let viewing = Promise.resolve()
effect(() => {
  const file = shown.value, uri = copy.value, rules = policy.value, allows = allow.value
  /** @type {(() => void)[]} */
  const holds = []
  const release = () => { for (const run of holds.splice(0)) run() }
  view.value = nothing
  if (file) viewing = show(file, uri, holds, rules, allows).catch((error) => console.warn('Preview', error) ?? null).then((template) => {
    if (shown.peek() !== file || copy.peek() !== uri) release()
    else if (template === null) close()
    else view.value = template
  })
  return release
})

// A newer version of the file on show, made while the answer is written, takes its place, unless
// the user went back to an earlier one (D164).
let newest = { name: '', uri: '' }
effect(() => {
  const file = shown.value, last = versions.value.at(-1), before = newest
  newest ={ name: file?.name ?? '', uri: last?.uri ?? '' }
  if (file && last && before.name === file.name && before.uri && before.uri !== last.uri && file.uri === before.uri) shown.value = { ...last, title: file.title }
})

// Another project or task shows again what was on show there as it was left, in this visit (none in a new task), but a new task keeps what it shows as its first message makes it one (D488, D497).
const left = /** @type {Map<string | undefined, Shown | null>} */ (new Map())
let was = { dir: app.project.peek().dir, id: app.current.peek()?.id }
effect(() => {
  const now = { dir: app.project.value.dir, id: app.current.value?.id }
  if (was.id) left.set(was.id, shown.peek())
  if (now.dir !== was.dir || (now.id !== was.id && (was.id !== undefined || left.has(now.id)))) shown.value = left.get(now.id) ?? null
  was = now
})

/**
 * @param {Shown} file @param {string} uri where what it holds now is (D229) @param {(() => void)[]} holds @param {string} rules a web page's policy
 * @param {string} allows what its frame allows
 * @returns {Promise<unknown>} null when the file is no longer there, or can't be read
 */
async function show(file, uri, holds, rules, allows) {
  // A document or a table Jean keeps opens in its editor (D485, D491).
  const kept = await keeper(uri)
  if (kept) return kept.editor(file, holds)
  const dir = app.project.peek().dir
  const bytes = await app.fs.readBytes(`${dir}/${uri}`)
  if (!bytes) { notify(t('files.missing', { name: file.name })); return null }
  // Its text is what Jean wrote for a file it made, what was read from a shared one; a Word document Jean wrote is Markdown.
  const prose = /\.docx$/i.test(file.name) && (await fileMeta(app.fs, dir, uri))?.author === 'jean'
  const text = async () => splitPages((await fileText(app.fs, dir, uri)) ?? '').join('\n')
  const { allows: can, sites } = rights.peek()
  // A workbook's cells change here, and it shows again where the user was (D229).
  const cells = /\.xlsx$/i.test(file.name) ? { ...(where?.uri === uri && { at: where.at }) } : undefined
  // Where a citation points, found in what the file says, or said not to be there (D481).
  const at = file.at && (await import('../caps/files/search.js')).anchor(splitPages((await fileText(app.fs, dir, uri)) ?? ''), file.at)
  if (at === null) notify(t('check.is.missing'))
  return viewOf({ name: file.name, bytes, type: file.mimeType, text, prose, cells, at: at || undefined }, holds, { allows: can, sites, policy: rules, allow: allows })
}

define('app-preview', Preview)
dock.join(document.createElement('app-preview'))
