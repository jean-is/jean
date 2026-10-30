// The panes of what opens beside the conversation (D126, D144, D635): a file Jean made or the user shared, or a creation, each a pane
// of the dock by its place in the project, its head naming it, with what its kind adds there, a button to save it, and Close. A click
// that opens a file or a creation, in an answer, the drawer or Creations, opens it in a pane for a look, which the next click gives the
// next, until it is kept: changed, moved by its head, or double-clicked there; one dropped or opened beside the task from a menu is
// kept at once, and one already on screen comes forward where it is. The look a task opened goes and comes back with it (D497). Each
// kind shows as what it is: a creation by its capability's own view (a document's or a collection's editor, a design's while it is the
// one on show, a score's sheet and player, a deck's slides, an app); a file as ui/view.js draws it, which the browser shares: a picture
// as a picture; a web page in a frame of its own, doing what Settings lets it (D143); a PDF's pages drawn; an Office file or a CSV as
// Office draws it (D183); Markdown laid out; else its text. A file being changed shows its new version as it comes. Each file shows
// where it was scrolled to in this tab, as an unsent draft comes back, and never in the file itself (D582). The address keeps the panes
// with the dock's other parts (`?split=`). Loaded, with its style sheet, as a file first opens, or an address or a drop names one.
import { html, nothing } from 'lit-html'
import { signal, computed, effect, batch } from '@preact/signals-core'
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
import { loaded, slots } from './caps.js'
import { leaves, without } from './tree.js'

/** @typedef {{ uri: string, name: string, title: string, mimeType?: string, version?: number, at?: string }} Shown  name: the file's, which it saves as; title: what its head says, as whoever opens it names it; version: which of the conversation's, for a file Jean made (D164); at: where a citation points in it, as its mark says (D481) */

await Promise.all([styleSheet('ui/preview.css'), styleSheet('ui/select.css')])

// What a web page may do, as Settings and policy have it (D143, D158): its policy, and what its frame allows.
const rights = computed(() => pageRights(effective.value.settings, app.policy))
const policy = computed(() => pagePolicy(rights.value.allows, rights.value.sites))
const allow = computed(() => pageAllow(rights.value.allows))
/** Each pane by its place. @type {Map<string, Pane>} */
const panes = new Map()
// A file a page made, saved for it; a cell of a workbook the user changed (D229), in the pane whose frame it comes from.
addEventListener('message', ({ source, data }) => [...panes.values()].find((pane) => source && pane.querySelector('iframe')?.contentWindow === source)?.received(/** @type {Window} */ (source), data))
// Where the user was in the workbook they changed last, to show it there again.
let where = /** @type {{ uri: string, at: import('../caps/files/office.js').Place } | null} */ (null)

/** Documents' module for a document, Tables' for a collection, Designs' for a design, Skills' scores for a tune an answer holds and decks for a deck kept, Games' for a game, its pages' for an app one holds, once found (D485, D491, D507, D544, D553, D558, D572, D591, D648). @param {string} uri */
const keeper = (uri) => {
  const [, id, load] = KEEPERS.find(([place]) => place.test(uri)) ?? []
  return id && load && loaded.peek().has(id) ? load() : null
}
const KEEPERS = /** @type {[RegExp, string, () => Promise<any>][]} */ ([[/^documents\//, 'documents', () => import('../caps/documents/documents.js')], [/^collections\//, 'tables', () => import('../caps/tables/tables.js')],
  [/^designs\//, 'designs', () => import('../caps/designs/designs.js')], [/^conversations\/[^#]+#\d+$/, 'skills', () => import('../caps/skills/scores.js')], [/^decks\//, 'skills', () => import('../caps/skills/decks.js')], [/^games\//, 'games', () => import('../caps/games/games.js')], [/^conversations\/[^#]+#app-\d+$/, 'interactive', () => import('../caps/interactive/apps.js')]])
/** A file's name, title and kind by its place; a creation's by its capability's, once found (D485, D491). @param {string} uri */
const metaOf = async (uri) => (/^files\/[^/]+$/.test(uri) ? await fileMeta(app.fs, app.projectDir, uri).then((one) => one && { ...one, title: fileTitle(one.name) }) : await (await keeper(uri))?.metaOf(uri))
/** The pane a click opened for a look, if one is open. */
const looked = () => [...panes.values()].find((pane) => pane.hasAttribute('data-look'))

/**
 * Opens a file or a creation beside the conversation, for a look: where it is already on screen, brought forward; else in the pane of
 * the last look, else in a pane of its own, where opening puts it. @param {Shown} file
 */
export function preview(file) {
  const there = panes.get(file.uri), look = !there && looked()
  if (!there && !look) dock.add(file.uri), panes.get(file.uri)?.setAttribute('data-look', '')
  const pane = /** @type {Pane} */ (there || look || panes.get(file.uri))
  pane.file.value = there ? { ...pane.file.peek(), ...file } : file
  pane.forward(Boolean(there))
}
/** Closed, if it is open: gone from the Creations page (D544), or making way for the box. @param {string} uri */
export const unshow = (uri) => { if (panes.has(uri)) dock.layout.value = without(dock.layout.peek(), uri) ?? 'here' }

// Where each file's view was scrolled to in this tab, by its place (D582): the view, or a box in it that scrolls on its own, as a
// table's does, by its class, each across and down. Where a view is still to go is set again as what it holds comes (a PDF's
// pages), until it gets there, the user moves it, or three seconds have passed.
const PLACES = 'app.scrolled'
let places = /** @type {Record<string, Record<string, number[]>>} */ ({}); try { places = JSON.parse(sessionStorage.getItem(PLACES) ?? '{}') } catch {}

/** A pane of the dock showing a file or a creation, by its place. */
class Pane extends Element {
  uri = ''
  /** What it shows, as it was opened; its view; whether it shows yet, and what it holds on to till then. */
  file = signal(/** @type {Shown | null} */ (null))
  #view = signal(/** @type {unknown} */ (nothing))
  viewing = Promise.resolve()
  /** What it holds now: the copy the user last changed it into here (D229), else itself. */
  #copy = computed(() => (this.file.value ? latestOf(app.current.value?.records ?? [], this.file.value.uri) : ''))
  /** The versions of what it shows, when Jean made it, each one the conversation kept, oldest first (D164), and where it is among them. */
  #versions = computed(() => (this.file.value ? versionsOf(filesMade(callsIn(app.current.value?.records ?? [], app.live.value?.turn.steps)), this.file.value.name) : []))
  #at = computed(() => { const file = this.file.value, all = this.#versions.value; return file?.version && all[file.version - 1]?.uri === file.uri ? file.version - 1 : all.findLastIndex((each) => each.uri === file?.uri) })
  /** Effects of its own; the view last shown, to scroll it where it was once it changes; where it is still to go. */
  #stop = /** @type {(() => void)[]} */ ([])
  #shown = /** @type {unknown} */ (nothing)
  #still = /** @type {Record<string, number[]>} */ ({})
  #grown = new MutationObserver(() => { const view = this.querySelector('.view'); if (view) this.#scrollBack(view) })
  #take = false
  /** Kept, no longer the pane of a look: changed, moved or double-clicked. */
  #keep = () => { this.removeAttribute('data-look') }
  #close = () => unshow(this.uri)

  connectedCallback() {
    super.connectedCallback()
    // What it shows, read again when it is another file (or a new version), or what a web page may do changes; what a view holds on to
    // (a picture's address, a PDF) let go with it, or at once if it came too late. Done once it shows, or is given up.
    this.#stop.push(effect(() => {
      const file = this.file.value, uri = this.#copy.value, rules = policy.value, allows = allow.value, holds = /** @type {(() => void)[]} */ ([])
      const release = () => { for (const run of holds.splice(0)) run() }
      this.#view.value = nothing
      if (file) this.viewing = show(file, uri, holds, rules, allows, this.#close).catch((error) => console.warn('Preview', error) ?? null)
        .then((template) => void (this.file.peek() !== file || this.#copy.peek() !== uri ? release() : template === null ? this.#close() : (this.#view.value = template)))
      return release
    }), effect(() => {
      // Known by what it shows: another file, or another version of it, its place in the screen's parts renamed.
      const uri = this.file.value?.uri; if (uri && uri !== this.uri && !panes.has(uri)) batch(() => { panes.delete(this.uri); panes.set(uri, this); this.uri = uri; dock.rename(this, uri) })
    }), () => this.#grown.disconnect(), effect(() => {
      // A newer version, made while the answer is written, takes its place, unless the user went back to an earlier one (D164).
      const file = this.file.value, last = this.#versions.value.at(-1), before = this.#newest
      this.#newest = { name: file?.name ?? '', uri: last?.uri ?? '' }
      if (file && last && before.name === file.name && before.uri && before.uri !== last.uri && file.uri === before.uri) this.file.value = { ...last, title: file.title }
    }))
  }
  #newest = { name: '', uri: '' }

  disconnectedCallback() { super.disconnectedCallback(); for (const stop of this.#stop.splice(0)) stop() }

  /** Opened, the keys in it; asked for again, brought forward where it is, marked a moment, a design's view there again (D635). @param {boolean} [again] */
  forward(again) {
    this.#take = true
    if (again) /** @type {any} */ (this.querySelector('.view')?.firstElementChild)?.wake?.(), this.toggleAttribute('data-called', true), setTimeout(() => this.removeAttribute('data-called'), 1200)
    this.updated()
  }

  /** What its frame sends: a file a page made, saved for it, or a cell of a workbook changed, as a copy in the version on show (D229). @param {Window} source @param {any} data */
  received(source, data) {
    // A game's frame says nothing here (D648): its own element hears it.
    const file = this.file.peek()
    if (/^games\//.test(file?.uri ?? '')) return
    if (!data?.cell || !file) return savePage(data, rights.peek().allows.downloads)
    changeCell(data.cell, source, { name: file.name, said: 'beside the task', read: () => app.fs.readBytes(`${app.projectDir}/${this.#copy.peek()}`), keep: async (bytes, at) => {
      const pages = (await (await import('../caps/files/extract.js')).extractPages(file.name, bytes)) ?? []
      const link = await addFile(app.fs, { projectDir: app.projectDir, name: file.name, mimeType: file.mimeType, bytes, pages, by: app.deviceId })
      where = { uri: link.uri, at }
      return { was: file.uri, uri: link.uri }
    } })
  }

  /** What it holds now, for Save. */
  copy() { return this.#copy.peek() }

  render() {
    const file = this.file.value, all = this.#versions.value, at = this.#at.value
    if (!file) return nothing
    return html`<aside class="pane preview" aria-label=${file.title} @keydown=${(/** @type {KeyboardEvent} */ event) => event.key === 'Escape' && !event.defaultPrevented && this.#close()}>
      <header class="pane-head" @dblclick=${this.#keep}>
        <h2><span dir="auto">${file.title}</span></h2>
        ${all.length > 1 && at >= 0 ? html`<select class="versions" aria-label=${t('preview.versions')} .value=${String(at)}
          @change=${(/** @type {Event} */ event) => { this.file.value = { ...all[Number(/** @type {HTMLSelectElement} */ (event.target).value)], title: file.title } }}>
          ${all.map((each, i) => html`<option value=${i} ?selected=${i === at}>${t('made.version', { n: each.version })}</option>`)}</select>` : nothing}
        ${slots('head').map((part) => part.draw(file))}
        ${saves(file) ? html`<button class="icon-button" aria-label=${t('made.save', { name: file.name })} @click=${() => download(file)}>${icons.download}</button>` : nothing}
        <button class="icon-button" aria-label=${t('action.close')} @click=${this.#close}>${icons.close}</button>
      </header>
      <div class="view" @scroll=${{ handleEvent: this.#scrolled, capture: true }} @pointerdown=${this.#stay} @keydown=${this.#stay} @wheel=${{ handleEvent: this.#stay, passive: true }}
        @input=${this.#keep} @change=${this.#keep}>${this.#view.value}</div>
    </aside>`
  }

  updated() {
    // Opened or brought forward, it takes the keys; one an address or a drop names, never (D582).
    dock.place(this, Boolean(this.file.peek()))
    if (this.#take && this.file.peek()) (this.#take = false), /** @type {HTMLElement | null} */ (this.querySelector('button'))?.focus()
    const box = this.querySelector('.view')
    if (box && this.#shown !== (this.#shown = this.#view.peek())) {
      const these = (this.#still = { ...places[this.#place()] })
      this.#grown.observe(box, { childList: true, subtree: true })
      setTimeout(() => this.#still === these && this.#stay(), 3000)
    }
    if (box) this.#scrollBack(box)
  }

  #place = () => `${app.projectDir}/${this.uri}`
  #stay = () => { this.#still = {} }
  /** @param {globalThis.Element} view */
  #scrollBack(view) { for (const [name, [x, y]] of Object.entries(this.#still)) { const box = name ? view.querySelector(`.${CSS.escape(name)}`) : view; box?.scrollTo(x, y); if (box && Math.abs(box.scrollLeft - x) + Math.abs(box.scrollTop - y) < 2) delete this.#still[name] } }
  /** A scroll kept while the file shows, not as its view gives way to another's or goes back where it was: the view's, or the one box of its class's in it. @param {Event} event */
  #scrolled = ({ target }) => {
    const box = /** @type {HTMLElement} */ (target), at = box.closest('.view'), name = box === at ? '' : box.classList[0]
    if (!at || this.#view.peek() === nothing || name === undefined || name in this.#still || (name && at.querySelectorAll(`.${CSS.escape(name)}`).length > 1)) return
    places[this.#place()] = { ...places[this.#place()], [name]: [box.scrollLeft, box.scrollTop] }
    try { sessionStorage.setItem(PLACES, JSON.stringify(places)) } catch {}
  }
}

/**
 * What a file saves as: its name and bytes; a table's a workbook, named as its name with .xlsx (D491, D620), a tune's its ABC (D544, D626); for
 * a file on show, the copy the user last changed it into. @param {Shown} file @param {string} [at]
 */
export async function fileBytes(file, at = panes.get(file.uri)?.copy() || file.uri) {
  const kept = await keeper(file.uri), book = /^collections\//.test(file.uri) && await (await import('../caps/tables/tables.js')).workbook(file.uri)
  return { name: book ? book.name : file.name, bytes: book ? book.bytes : kept && 'bytesOf' in kept ? await kept.bytesOf(file.uri) : await app.fs.readBytes(`${app.projectDir}/${at}`) }
}

/** Whether a pane's own Save is the file's, where its kind has none of its own (a document's, a collection's, a design's, a deck's, a tune's). @param {{ uri: string, name: string }} file */
export const saves = (file) => !(/^(documents|collections|designs|decks)\//.test(file.uri) || (loaded.value.has('scores') && /\.abc$/i.test(file.name)))

/** @param {Shown} file */
export async function download(file) {
  const { name, bytes } = await fileBytes(file)
  if (!bytes) return notify(t('files.missing', { name: file.name }))
  save(new Blob([/** @type {BlobPart} */ (bytes)], { type: file.mimeType ?? '' }), name)
  act('file.save', { task: app.current.peek()?.path, format: /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() })
}

/**
 * What a file or a creation shows as: a creation its capability's own view (a design's as it shows one at a time, a collection's
 * following its place, a document's, a tune's, a deck's or an app's editor); a file as ui/view.js draws it.
 * @param {Shown} file @param {string} uri where what it holds now is (D229) @param {(() => void)[]} holds @param {string} rules a web page's policy
 * @param {string} allows what its frame allows @param {() => void} close
 * @returns {Promise<unknown>} null when the file is no longer there, or can't be read
 */
async function show(file, uri, holds, rules, allows, close) {
  const kept = await keeper(file.uri)
  if (kept) return kept.editor(file, holds, close)
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

define('app-preview', Pane)

// Each part of the screen that is a file or a creation is a pane, made as its part comes, by a click, a drop or an address, and let
// go as it goes; one an address names holds the room back until it shows (D582).
effect(() => {
  const wanted = leaves(dock.layout.value).filter((part) => part.includes('/'))
  for (const [uri, pane] of panes) if (!wanted.includes(uri)) panes.delete(uri), dock.leave(pane)
  for (const uri of wanted.filter((one) => !panes.has(one))) {
    const pane = Object.assign(/** @type {Pane} */ (document.createElement('app-preview')), { uri })
    panes.set(uri, pane), dock.join(pane, uri)
    // Named by a drop or an address, read for its name and kind; opened, given them (one not written yet, a new document's, too).
    const ready = Promise.resolve().then(async () => {
      const meta = !pane.file.peek() && await metaOf(uri)
      if (meta) pane.file.value ??= { uri, name: meta.name, title: meta.title, mimeType: meta.mimeType }
      else if (!pane.file.peek()) return unshow(uri)
      await pane.viewing
    }).catch(console.warn).finally(() => dock.waits.delete(ready))
    dock.waits.add(ready)
  }
})
// A task's look goes with it and comes back when it does, in this visit, and another project closes every pane, none of its places this
// one's; a new task keeps what it shows as its first message makes it one (D488, D497).
const left = /** @type {Map<string, Shown | null>} */ (new Map())
let was = { dir: app.project.peek().dir, id: app.current.peek()?.id }
effect(() => {
  const now = { dir: app.project.value.dir, id: app.current.value?.id }, look = looked(), moved = now.dir !== was.dir
  if (!moved && now.id === was.id) return
  if (was.id) left.set(was.id, look?.file.peek() ?? null)
  if (moved || was.id !== undefined) {
    const gone = moved ? [...panes.keys()] : look ? [look.uri] : [], back = now.id && left.get(now.id)
    if (gone.length) dock.layout.value = gone.reduce((tree, uri) => without(tree, uri) ?? 'here', dock.layout.peek())
    if (back) queueMicrotask(() => preview(back))
  }
  was = now
})
