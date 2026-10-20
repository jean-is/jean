// The menus beside + in the box (D292): pointed at or pressed, its Skills or Connections row opens
// a menu beside it, the room's skills by name or its connections, each picked to be named in the
// message as / names it (D199), then a way to add one, in Settings. It is a popover inside +'s, so
// opening it keeps + open, and Escape closes it alone, the keyboard back on its row. Loaded the
// first time one opens.
import { html, nothing } from 'lit-html'
import { sub } from './composer.js'
import { drawn, logoOf } from './complete.js'
import { openSettings } from './dialogs.js'
import { t, locale } from '../core/i18n.js'
import { byName } from '../core/search.js'
import { icons } from './icons.js'

/** @typedef {'skills' | 'connections'} Id */
/** What a menu lists: its icon, its name, and the word that names it in the box. @typedef {{ icon: unknown, label: string, word: string }} Item */

// How long the pointer rests on a row before its menu opens, or another's closes: on its way to a
// menu, it can cross another row.
const WAIT = 150

/** The room's skills, by the name the user reads (D222), each drawn as / draws it. @returns {Promise<Item[]>} */
async function skills() {
  const [module, { shownIn }] = await Promise.all([import('../caps/skills/skills.js'), import('../caps/skills/directory.js')])
  const [list, own] = await Promise.all([module.skills(), module.directory()])
  return byName(list.map((skill) => ({ icon: drawn(skill.source ? undefined : own.find((entry) => entry.name === skill.name)?.icon), label: shownIn(skill, locale.value).title, word: `/${skill.name}` })),
    (item) => item.label, locale.value)
}

/** The room's connections, by name, as Settings lists them. @returns {Promise<Item[]>} */
const connections = async () => (await import('../caps/connections/connections.js')).offered().map(({ name, logo }) => ({ icon: logoOf(name, logo), label: name, word: `/${name}` }))

let timer = 0
/** @param {() => unknown} run */
const later = (run) => {
  clearTimeout(timer)
  timer = setTimeout(run, WAIT)
}
/** Counts what was asked for, so a list read late doesn't open a menu the pointer has left. */
let asked = 0
const close = () => {
  asked++
  sub.value = null
}

/**
 * A row pointed at opens its menu once the pointer rests; pressed, at once, the keyboard in it
 * when pressed from the keyboard. @param {Event} event
 */
export function open(event) {
  const id = /** @type {Id} */ (/** @type {HTMLElement} */ (/** @type {Element} */ (event.target).closest('[data-page]')).dataset.page)
  if (event.type !== 'click') return later(() => show(id))
  clearTimeout(timer)
  show(id).then(() => /** @type {MouseEvent} */ (event).detail || document.querySelector('#add-sub')?.querySelector('button')?.focus())
}

/** Opens the menu of a row, its list read first, while + is open. @param {Id} id */
async function show(id) {
  if (sub.peek()?.id !== id) {
    const mine = ++asked
    const list = await (id === 'skills' ? skills() : connections())
    if (mine !== asked || !document.querySelector('#add-menu:popover-open')) return
    sub.value = { id, view: () => view(id, list) }
  }
  const menu = document.getElementById('add-sub')
  if (menu && !menu.matches(':popover-open')) menu.showPopover()
}

// The pointer on another row of + closes the menu beside it, and on that menu keeps it open.
addEventListener('pointerover', (event) => {
  const target = event.target
  if (!sub.peek() || !(target instanceof Element)) return
  if (target.closest('#add-sub')) clearTimeout(timer)
  else if (target.closest('#add-menu') && !target.closest('[data-page]')) later(close)
})

/** Escape closes the menu alone, and gives the keyboard back to its row. @param {KeyboardEvent} event */
function escape(event) {
  if (event.key !== 'Escape') return
  const row = /** @type {HTMLElement | null} */ (document.querySelector('#add-menu [aria-expanded="true"]'))
  event.preventDefault()
  event.stopPropagation()
  row?.focus()
  close()
}

/** @param {Id} id @param {Item[]} list */
const view = (id, list) => html`<div id="add-sub" class="menu add-sub" popover @keydown=${escape} @toggle=${(/** @type {ToggleEvent} */ e) => e.newState === 'closed' && close()}>
  ${list.map(({ icon, label, word }) => html`<button type="button" popovertarget="add-menu" popovertargetaction="hide" @click=${() => put(word)}>
    ${icon}<span class="complete-label" dir="auto">${label}</span></button>`)}
  ${list.length ? html`<hr>` : nothing}
  <button type="button" popovertarget="add-menu" popovertargetaction="hide" @click=${() => openSettings(id)}>
    ${icons.plus}${t(id === 'skills' ? 'skills.addOne' : 'cap.connections.yes')}</button>
</div>`

/**
 * Names a skill or a connection in the box where the caret was, as / would have: the word, then
 * a space, the caret after it, so / doesn't open on it; from search too (D133). @param {string} word
 */
export function put(word) {
  const area = /** @type {HTMLTextAreaElement} */ (document.getElementById('prompt'))
  const { value, selectionStart: start, selectionEnd: end } = area
  const spaced = /^\s/.test(value.slice(end))
  area.setRangeText(`${/\S$/.test(value.slice(0, start)) ? ' ' : ''}${word}${spaced ? '' : ' '}`, start, end, 'end')
  if (spaced) area.setSelectionRange(area.selectionEnd + 1, area.selectionEnd + 1)
  area.dispatchEvent(new Event('input', { bubbles: true }))
  area.focus()
}
