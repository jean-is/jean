// Creations (D497): what the capabilities found keep in the project for the user to come back to, documents, tables, the
// pictures and films Jean made and the scores its answers hold (D542), each kind given by its capability's `creations` slot.
// The drawer has one place for them once a capability that keeps them is found: the pointer resting on it shows the five
// latest beside it, those pinned first (D544), and pressed, it opens their page (./creations-page.js, loaded then) in place of
// a new task's welcome, kept in the address as a window (`?creations`). Picked or made, one opens beside the task, where the
// box asks about it, or a score its task; a new task, a message sent or another task opened leaves the page, another project
// keeps it. Loaded with the drawer, @, and by Documents, Tables, Pictures and Skills, whose `main` slot is the page.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app, newConversation, newTasks, openFile, turnPage } from './state.js'
import { slots, loaded } from './caps.js'
import { keep } from './windows.js'
import { styleSheet } from './sheet.js'
import { t } from '../core/i18n.js'
import { icons } from './menu-icons.js'
import { markdown } from './markdown.js'

await styleSheet(new URL('creations.css', import.meta.url))

/**
 * A creation, as its `creations` slot's `kept(dir)` gives it: its place, name, when it last changed and was made, whether it is
 * pinned, its words, and how it opens.
 * @typedef {{ path: string, name: string, changed: string, created?: string, pinned?: boolean, text: string, link: import('../core/types.js').ResourceLink }} Creation
 */

/** The latest changed first. @param {Creation} a @param {Creation} b */
const latest = (a, b) => (a.changed < b.changed ? 1 : -1)
/** A kind's creations, each with its kind's slot. @param {any} kind */
const of = async (kind) => (/** @type {Creation[]} */ (await kind.kept())).map((item) => ({ ...item, kind }))
/** The open project's creations, the latest changed first, each with its kind's slot: what the drawer, the page and @ list. */
export const creationsHere = async () => (await Promise.all(slots('creations').map(of))).flat().sort(latest)
/** Those listed, read again as the tasks are, as capabilities come, and as their page opens or changes one; and whether their page shows. */
export const all = signal(/** @type {Awaited<ReturnType<typeof creationsHere>>} */ ([])), shown = signal(false)
let reading = 0
// Each kind's as soon as it is read, so that a slow kind (the scores of many tasks) holds back none of the others.
export const reread = () => { const at = ++reading, kinds = slots('creations'); return Promise.all(kinds.map((kind) => of(kind).then((list) => { if (at === reading) all.value = [...all.value.filter((one) => one.kind !== kind && kinds.includes(one.kind)), ...list].sort(latest) }))).catch(console.warn) }
effect(() => { void [app.conversations.value, loaded.value]; reread() })
// Another project keeps the page, none of the one left's on it while its own are read.
let room = app.project.peek().dir
effect(() => { void [newTasks.value, app.current.value]; const dir = app.project.peek().dir; if (dir === room) shown.value = false; else all.value = []; room = dir })

/** The page, in place of a new task's welcome: the `main` slot Documents and Tables carry, left for another page there. */
export const page = { at: 2, draw: () => (shown.value ? (void import('./creations-page.js'), html`<app-creations></app-creations>`) : null), leave: () => { shown.value = false } }
/** Opens it on a new task, in place of any other page there, the latest put away: drawn at once from the list as it was, read again once it shows. */
const open = async () => { clearTimeout(timer); /** @type {HTMLElement | null} */ (document.querySelector('.creations-latest:popover-open'))?.hidePopover(); await turnPage(newConversation); for (const main of slots('main')) main.leave?.(); shown.value = true; setTimeout(reread, 300) }
/** The words its page finds by, and the page opened finding these, as a tag of a document does (D576). @param {string} text */
export const query = signal(''), seek = (/** @type {string} */ text) => { query.value = text; return open() }
// In the address (D220), as a window while it shows: shown with its cards read, for the room to show with them (D582).
keep('creations', { get: () => (shown.value ? '' : null), set: async (state) => { const on = state !== null && !app.current.peek()?.records.length; if (on) await Promise.all([import('./creations-page.js'), reread()]); shown.value = on } })

/** One opened beside the task, or where its kind opens it (a score, its task), what it was picked from put away: the latest, the drawer where it is over the conversation. @param {Creation & { kind: any }} item */
export const show = (item) => (/** @type {Event} */ event) => { /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.currentTarget).closest('[popover]'))?.hidePopover(); app.dialog.value = null; item.kind.open ? item.kind.open(item) : openFile(item.link) }

/**
 * A new one asked for in the box (D542), what it held replaced: its request, in which its example is selected for the user's own words.
 * @param {string} key its request's, with `{what}` @param {string} example its example's
 */
export async function ask(key, example) {
  const what = t(example), words = t(key, { what }), at = words.indexOf(what), box = /** @type {HTMLTextAreaElement} */ (document.getElementById('prompt'))
  app.draft.value = words
  await new Promise(requestAnimationFrame)
  box.focus(); box.setSelectionRange(at, at + what.length)
}
let timer = 0
/** The latest, beside the place, once there are some and the pointer rests on it or on them, or put away once it has left both a moment. @param {Event} event @param {boolean} on */
const rest = (event, on) => {
  const latest = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.currentTarget).querySelector('[popover]'))
  clearTimeout(timer)
  timer = setTimeout(() => (on ? latest?.matches(':popover-open') || latest?.showPopover() : latest?.hidePopover()), 150)
}

/** The drawer's place for them, once a capability that keeps them is found: pressed, their page; pointed at, five beside it, those pinned first. */
export const place = () => (slots('creations').length ? html`<div class="creations" @pointerenter=${(/** @type {Event} */ e) => rest(e, true)} @pointerleave=${(/** @type {Event} */ e) => rest(e, false)}>
  <button class="place" @click=${open}>${icons.layers}${t('creations.title')}</button>
  ${all.value.length ? html`<div class="menu creations-latest" popover>${[...all.value.filter((item) => item.pinned), ...all.value.filter((item) => !item.pinned)].slice(0, 5)
    .map((item) => html`<button type="button" @click=${show(item)}>${item.kind.draw()}<span dir="auto">${item.name}</span>${item.pinned ? icons.pin : nothing}</button>`)}</div>` : nothing}
</div>` : nothing)

/** What a card shows of a creation, drawn by its kind (its slot's `preview`): the start of a text as an answer draws it, its blocks left out. @param {string} text */
export const prose = (text) => html`<div class="prose" dir="auto">${markdown(text.replace(/```[\s\S]*?(?:```|$)/g, '').slice(0, 600))}</div>`
/** Or a table's heads, then its first rows. @param {string[][]} rows */
export const grid = (rows) => html`<table>${rows.map((row, i) => html`<tr>${row.map((cell) => (i ? html`<td>${cell}</td>` : html`<th>${cell}</th>`))}</tr>`)}</table>`
