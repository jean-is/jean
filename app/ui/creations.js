// Creations (D497): what the capabilities found keep in the project for the user to come back to, documents and tables
// so far, each kind given by its capability's `creations` slot. The drawer has one place for them once there are some:
// the pointer resting on it shows the latest beside it, and pressed, it opens their page in place of a new task's welcome,
// a card each, kept in the address as a window (`?creations`). Picked, one opens beside the task, where the box asks
// about it; a new task, a message sent or another task opened leaves the page. Loaded with the drawer, @, and by
// Documents and Tables, whose `main` slot is the page.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, newConversation, newTasks, openFile, turnPage } from './state.js'
import { slots } from './caps.js'
import { keep } from './windows.js'
import { styleSheet } from './sheet.js'
import { t, relativeTime } from '../core/i18n.js'
import { icons } from './menu-icons.js'

await styleSheet(new URL('creations.css', import.meta.url))

/**
 * A creation, as its `creations` slot's `kept(dir)` gives it: its place, name, when it last changed, its words, and how it opens.
 * @typedef {{ path: string, name: string, changed: string, text: string, link: import('../core/types.js').ResourceLink }} Creation
 */

/** The open project's creations, the latest changed first, each with its kind's slot: what the drawer, the page and @ list. */
export const creationsHere = async () => (await Promise.all(slots('creations').map(async (kind) => (/** @type {Creation[]} */ (await kind.kept())).map((item) => ({ ...item, kind }))))).flat().sort((a, b) => (a.changed < b.changed ? 1 : -1))
/** Those listed, read again as the tasks are; and whether their page shows. */
const all = signal(/** @type {Awaited<ReturnType<typeof creationsHere>>} */ ([])), shown = signal(false)
let reading = 0
effect(() => { const at = (void app.conversations.value, ++reading); creationsHere().then((list) => { if (at === reading) all.value = list }, console.warn) })
effect(() => { void [newTasks.value, app.current.value]; shown.value = false })

/** The page, in place of a new task's welcome: the `main` slot Documents and Tables carry, left for another page there. */
export const page = { at: 2, draw: () => (shown.value ? html`<app-creations></app-creations>` : null), leave: () => { shown.value = false } }
/** Opens it on a new task, in place of any other page there, the latest put away. */
const open = async () => { /** @type {HTMLElement | null} */ (document.querySelector('.creations-latest:popover-open'))?.hidePopover(); await turnPage(newConversation); for (const main of slots('main')) main.leave?.(); shown.value = true }
// In the address (D220), as a window while it shows.
keep('creations', { get: () => (shown.value ? '' : null), set: (state) => { shown.value = state !== null && !app.current.peek()?.records.length } })

/** One opened beside the task, what it was picked from put away: the latest, the drawer where it is over the conversation. @param {Creation} item */
const show = (item) => (/** @type {Event} */ event) => { /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.currentTarget).closest('[popover]'))?.hidePopover(); app.dialog.value = null; openFile(item.link) }
let timer = 0
/** The latest, beside the place, once the pointer rests on it or on them, or put away once it has left both a moment. @param {Event} event @param {boolean} on */
const rest = (event, on) => {
  const latest = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (event.currentTarget).querySelector('[popover]'))
  clearTimeout(timer)
  timer = setTimeout(() => (on ? latest.matches(':popover-open') || latest.showPopover() : latest.hidePopover()), 150)
}

/** The drawer's place for them, once there are some: pressed, their page; pointed at, the latest five beside it. */
export const place = () => (all.value.length ? html`<div class="creations" @pointerenter=${(/** @type {Event} */ e) => rest(e, true)} @pointerleave=${(/** @type {Event} */ e) => rest(e, false)}>
  <button class="place" @click=${open}>${icons.layers}${t('creations.title')}</button>
  <div class="menu creations-latest" popover>${all.value.slice(0, 5).map((item) => html`<button type="button" @click=${show(item)}>${item.kind.draw()}<span dir="auto">${item.name}</span></button>`)}</div>
</div>` : nothing)

/** Every creation, a card each, the latest changed first. */
class Page extends Element {
  render() {
    return html`<h1 class="conversation-title">${t('creations.title')}</h1><ul class="creations-cards">${all.value.map((item) => html`<li><button class="file-card" @click=${show(item)}>
      <span class="file-tile" aria-hidden="true">${item.kind.draw()}</span><span class="file-about"><span class="file-name" dir="auto">${item.name}</span><span class="file-meta">${item.changed && relativeTime(item.changed)}</span></span></button></li>`)}</ul>`
  }
}

define('app-creations', Page)
