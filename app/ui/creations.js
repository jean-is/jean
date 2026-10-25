// Creations (D497): what the capabilities found keep in the project for the user to come back to, documents, tables, the
// pictures and films Jean made and the scores its answers hold (D542), each kind given by its capability's `creations` slot.
// The drawer has one place for them once a capability that keeps them is found, which opens their page (./creations-page.js,
// loaded then) in place of a new task's welcome, kept in the address as a window (`?creations`) with the kind it shows, its
// order and its words, and only there; those pinned are under its Pinned (ui/inbox.js, D605). Picked or made, one opens beside
// the task, where the box asks about it, or a score its task; a new task, a message sent or another task opened leaves the
// page, another project keeps it. Loaded with the drawer, @, and by Documents, Tables, Pictures and Skills, whose `main` slot
// is the page.
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
const open = async () => { await turnPage(newConversation); for (const main of slots('main')) main.leave?.(); shown.value = true; setTimeout(reread, 300) }
/** The words its page finds by, the kind it shows ('' for all) and its order, and the page opened finding these, as a tag of a document does (D576). @param {string} text */
export const query = signal(''), kind = signal(''), order = signal('changed'), seek = async (/** @type {string} */ text) => { await open(); query.value = text }
// The address alone keeps them: the page left, they are as it first shows again.
effect(() => { if (!shown.value) { kind.value = ''; order.value = 'changed'; query.value = '' } })
/** What the page shows, as the address keeps it: its kind once found (`all` of them), its order, then its words, as far as the last that isn't the page's first. */
const showing = () => { const parts = [slots('creations').some((one) => one.id === kind.value) ? kind.value : 'all', order.value, query.value]; return parts.slice(0, parts.findLastIndex((part, i) => part !== ['all', 'changed', ''][i]) + 1).join('/') }
/** The page as an address gives it, its cards read: its kind, its order, one it doesn't have the first, and its words. @param {string} state */
const follow = async (state) => { const [{ ORDERS }] = await Promise.all([import('./creations-page.js'), reread()]), [one = '', by = '', ...words] = state.split('/'); kind.value = one === 'all' ? '' : one; order.value = Object.hasOwn(ORDERS, by) ? by : 'changed'; query.value = words.join('/') }
// In the address (D220), as a window while it shows, with what it shows (`?creations=tables/name`, `?creations=all/changed/budget`), so that a reload, a
// link or Back shows it so again: shown on a new task once its cards are read, for the room to show with them (D582).
keep('creations', { get: () => (shown.value ? showing() : null), set: async (state) => { const on = state !== null && !app.current.peek()?.records.length; if (on) await follow(state); shown.value = on } })

/** One opened beside the task, or where its kind opens it (a score, its task), the drawer put away where it is over the conversation. @param {Creation & { kind: any }} item */
export const show = (item) => () => { app.dialog.value = null; item.kind.open ? item.kind.open(item) : openFile(item.link) }

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

/** The drawer's place for them, once a capability that keeps them is found, which opens their page. */
export const place = () => (slots('creations').length ? html`<button class="place" @click=${open}>${icons.layers}${t('creations.title')}</button>` : nothing)

/** What a card shows of a creation, drawn by its kind (its slot's `preview`): the start of a text as an answer draws it, its blocks left out. @param {string} text */
export const prose = (text) => html`<div class="prose" dir="auto">${markdown(text.replace(/```[\s\S]*?(?:```|$)/g, '').slice(0, 600))}</div>`
/** Or a table's heads, then its first rows. @param {string[][]} rows */
export const grid = (rows) => html`<table>${rows.map((row, i) => html`<tr>${row.map((cell) => (i ? html`<td>${cell}</td>` : html`<th>${cell}</th>`))}</tr>`)}</table>`
