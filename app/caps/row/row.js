// SPDX-License-Identifier: MIT
// A row open as a sheet, over the page (caps/tables/view.js fetches this folder as a row is first opened): its first picture at its head, its name,
// large, in its own cell, then every other column, those the table hides too, its name beside its cell, changed there as in the table, a cell Jean changed marked; then
// the rows of other collections that relate to it (./related.js), then its changes, the last first, each by what it set, the value before it where there was one, who made it, when and, for Jean's, what it came from.
// Its head goes to the row before or after it among those the view keeps, each button named by the row it opens, as a swipe across it does, and ⌘ with
// the arrow up or down, Ctrl outside Apple's systems, the keyboard staying in the cell it is in; it says its place among them, and holds its menu: asked
// about, in the box, or deleted. Escape closes it alone, as a press outside it does. The cells' parts and Tables' words come from the view, whose they are.
import { html, nothing } from 'lit-html'
import { t, locale, intlLocales } from '../../core/i18n.js'
import { assistantName, APPLE } from '../../ui/state.js'
import { icons } from '../../ui/menu-icons.js'
import { titleOf, filesOf } from '../tables/table.js'
import { query, valueOf } from '../tables/query.js'
import { textOf, format } from '../tables/export.js'
import { related } from './related.js'

/** @import { Property } from '../tables/table.js' */
/** @import { Row, Change } from '../tables/changes.js' */

/** Where a press or a touch began: outside the sheet, and where across it. */
let began = { out: false, x: 0, y: 0 }
/** Whether a pointer is outside a box. @param {{ clientX: number, clientY: number }} at @param {Element} box */
const outside = ({ clientX: x, clientY: y }, box) => ((r) => x < r.left || x > r.right || y < r.top || y > r.bottom)(box.getBoundingClientRect())

/** @param {import('../card/card.js').Given & { row: Row }} given */
export default function sheet({ one, row, rows: kept, columns, covers, by, fresh, state, parts, words }) {
  // The rows in the order they show: by their groups, where they are grouped.
  const rows = by ? (query(one.table, kept, { group: { property: by.id }, locale: locale.value, names: one.names }).groups ?? []).flatMap((group) => group.rows) : kept
  const title = /** @type {Property} */ (titleOf(one.table)), named = (/** @type {Row} */ each) => textOf(each, title) || words.unnamed, pick = `${state.id}-sheet-pick`, menu = `${state.id}-sheet-menu`
  const at = rows.findIndex(({ id }) => id === row.id), [cover] = covers ? filesOf(valueOf(row, covers)) : []
  /** The row before or after it, where there is one. @param {number} step */
  const walk = (step) => ((to) => html`<button type="button" class="icon-button" aria-label=${named(to ?? row)} aria-keyshortcuts=${`${APPLE ? 'Meta' : 'Control'}+${step < 0 ? 'ArrowUp' : 'ArrowDown'}`} ?disabled=${at < 0 || !to} @click=${() => { state.open.value = to.id }}>${step < 0 ? icons.back : icons.arrow}</button>`)(rows[at + step])
  /**
   * Its keys. Escape closes it alone. ⌘ with the arrow up or down, Ctrl outside Apple's systems, goes to the row before or after: what is being written
   * in a cell is kept first, and the keyboard stays in that cell, the next row's. @param {KeyboardEvent} event
   */
  const keys = (event) => {
    if (event.key === 'Escape') return event.stopPropagation()
    const step = /** @type {Record<string, number>} */ ({ ArrowUp: -1, ArrowDown: 1 })[event.key], field = /** @type {HTMLElement | null} */ (document.activeElement)
    if (!step || event.isComposing || event.altKey || event.shiftKey || !(APPLE ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return
    event.preventDefault()
    event.stopPropagation()
    if (at < 0 || !rows[at + step]) return
    field?.blur()
    state.open.value = rows[at + step].id
    field?.focus()
  }
  /** Closed, then what its menu asks, which the page takes once it is no longer under it. @param {() => unknown} act */
  const leave = (act) => (/** @type {Event} */ event) => { /** @type {Element} */ (event.currentTarget).closest('dialog')?.close(); act() }
  /** A press outside it closes it, one that began outside too: words selected past its edge leave it open. @param {MouseEvent} event */
  const pressed = (event) => { const box = /** @type {HTMLDialogElement} */ (event.currentTarget); const out = event.target === box && outside(event, box); if (event.type === 'pointerdown') began = { ...began, out }; else if (began.out && out) box.close() }
  /** A swipe across it goes to the row after, or before, as the page's direction has them. @param {TouchEvent} event */
  const swiped = (event) => {
    const [{ clientX: x, clientY: y }] = event.changedTouches, across = x - began.x
    if (event.type === 'touchstart') began = { ...began, x, y }
    else if (Math.abs(across) > 70 && Math.abs(y - began.y) < 40) { const to = rows[at + (across < 0 ? 1 : -1) * (getComputedStyle(/** @type {Element} */ (event.currentTarget)).direction === 'rtl' ? -1 : 1)]; if (to) state.open.value = to.id }
  }
  // Its changes, the last first: each with the values its cells held before it.
  const held = /** @type {Record<string, unknown>} */ ({}), last = /** @type {{ line: Change, was: Record<string, unknown> }[]} */ ([])
  for (const line of /** @type {Change[]} */ (one.lines)) if (line.row === row.id && line.set) { if (columns.some(({ id }) => id in /** @type {object} */ (line.set))) last.unshift({ line, was: { ...held } }); Object.assign(held, line.set) }
  /** A value as its column reads it, a cell emptied as a dash. @param {Property} property @param {unknown} value */
  const read = (property, value) => parts.said({ ...row, cells: { ...row.cells, [property.id]: value } }, property, one.names) || '—'
  return html`<dialog class="sheet table-row" aria-label=${named(row)} @close=${() => { state.open.value = '' }} @keydown=${keys}
      @pointerdown=${pressed} @click=${pressed} @touchstart=${swiped} @touchend=${swiped}>
    <header class="dialog-head">${walk(-1)}${walk(1)}<span class="muted" role="status">${at < 0 ? nothing : words.of(at + 1, rows.length)}</span>
      <button type="button" class="icon-button" aria-label=${t('action.more')} popovertarget=${menu}>${icons.more}</button>
      <div id=${menu} class="menu table-menu" popover @focusout=${parts.leaving}>${parts.listed([html`<button type="button" @click=${leave(() => parts.ask(one, words.about(row)))}>${icons.brain}${words.ask}</button>`],
        [html`<button type="button" class="danger" @click=${leave(() => parts.rid(one, row))}>${icons.trash}${t('action.delete')}</button>`])}</div>
      <button type="button" class="icon-button" aria-label=${t('action.close')} @click=${leave(() => {})}>${icons.close}</button></header>
    ${cover ? html`<div class="table-cover">${parts.pictured(one, cover)}</div>` : nothing}
    <dl class="table-fields">${[title, ...columns.filter((property) => property !== title)].map((property) => html`<div class=${property === title ? 'table-title' : nothing}><dt>${parts.glyphs[property.type]}<span dir="auto">${property.name}</span></dt>
      <dd class=${`${fresh.has(`${row.id} ${property.id}`) ? 'is-jean ' : ''}${parts.reads.test(property.type) ? 'is-read' : ''}`}>${parts.cell(one, row, property, state, pick)}</dd></div>`)}</dl>
    ${related(one, row)}
    ${last.length ? html`<h3>${words.last}</h3><ul class="table-last">${last.map(({ line, was }) => { const who = line.by === 'jean' ? assistantName() : line.by === 'user' ? words.me : line.by, set = columns.filter(({ id }) => id in /** @type {object} */ (line.set)); return html`<li>
      ${line.by === 'jean' ? icons.brain : parts.face(who)}<dl>${set.map((property) => html`<div><dt class="muted" dir="auto">${property.name}</dt><dd dir="auto">${property.id in was && was[property.id] !== null && was[property.id] !== '' && read(property, was[property.id]) !== read(property, line.set?.[property.id]) ? html`<s>${read(property, was[property.id])}</s>${icons.arrow}` : nothing}<b>${read(property, line.set?.[property.id])}</b></dd></div>`)}</dl>
      <p class="muted"><span dir="auto">${who}</span> <time datetime=${line.at}>${format('DateTimeFormat', intlLocales(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(line.at))}</time>${line.why ? html` <q dir="auto">${line.why}</q>` : nothing}</p></li>` })}</ul>` : nothing}
    <div id=${pick} class="menu table-menu table-picks" popover @focusout=${parts.leaving}></div></dialog>`
}
