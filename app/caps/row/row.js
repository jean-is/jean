// SPDX-License-Identifier: MIT
// A row open as a sheet, over the page (caps/tables/view.js fetches this folder as a row is first opened): its first picture at its head, then every
// column, those the table hides too, its name beside its cell, changed there as in the table, a cell Jean changed marked; then its last changes, who made
// each and when, the columns it set, three by their names, and, for Jean's, what it came from. Its head goes to the row before or after it among those the view keeps, each
// button named by the row it opens, says its place among them, and holds its menu: asked about, in the box, or deleted. Escape closes it alone. The
// cells' parts and Tables' words come from the view, whose they are.
import { html, nothing } from 'lit-html'
import { t, locale, intlLocales } from '../../core/i18n.js'
import { assistantName } from '../../ui/state.js'
import { icons } from '../../ui/menu-icons.js'
import { titleOf, filesOf } from '../tables/table.js'
import { query, valueOf } from '../tables/query.js'
import { textOf, format } from '../tables/export.js'

/** @import { Property } from '../tables/table.js' */
/** @import { Row, Change } from '../tables/changes.js' */

/** @param {import('../card/card.js').Given & { row: Row }} given */
export default function sheet({ one, row, rows: kept, columns, covers, by, fresh, state, parts, words }) {
  // The rows in the order they show: by their groups, where they are grouped.
  const rows = by ? (query(one.table, kept, { group: { property: by.id }, locale: locale.value, names: one.names }).groups ?? []).flatMap((group) => group.rows) : kept
  const title = /** @type {Property} */ (titleOf(one.table)), named = (/** @type {Row} */ each) => textOf(each, title) || words.unnamed, pick = `${state.id}-sheet-pick`, menu = `${state.id}-sheet-menu`
  const at = rows.findIndex(({ id }) => id === row.id), [cover] = covers ? filesOf(valueOf(row, covers)) : []
  /** The row before or after it, where there is one. @param {number} step */
  const walk = (step) => ((to) => html`<button type="button" class="icon-button" aria-label=${named(to ?? row)} ?disabled=${at < 0 || !to} @click=${() => { state.open.value = to.id }}>${step < 0 ? icons.back : icons.arrow}</button>`)(rows[at + step])
  /** Closed, then what its menu asks, which the page takes once it is no longer under it. @param {() => unknown} act */
  const leave = (act) => (/** @type {Event} */ event) => { /** @type {Element} */ (event.currentTarget).closest('dialog')?.close(); act() }
  const last = /** @type {Change[]} */ (one.lines.filter((line) => 'row' in line && line.row === row.id && columns.some(({ id }) => line.set && id in line.set))).slice(-3).reverse()
  return html`<dialog class="sheet table-row" aria-label=${named(row)} @close=${() => { state.open.value = '' }} @keydown=${(/** @type {KeyboardEvent} */ e) => e.key === 'Escape' && e.stopPropagation()}>
    <header class="dialog-head">${walk(-1)}${walk(1)}<span class="muted" role="status">${at < 0 ? nothing : words.of(at + 1, rows.length)}</span>
      <button type="button" class="icon-button" aria-label=${t('action.more')} popovertarget=${menu}>${icons.more}</button>
      <div id=${menu} class="menu table-menu" popover @focusout=${parts.leaving}>${parts.listed([html`<button type="button" @click=${leave(() => parts.ask(one, words.about(row)))}>${icons.brain}${words.ask}</button>`],
        [html`<button type="button" class="danger" @click=${leave(() => parts.rid(one, row))}>${icons.trash}${t('action.delete')}</button>`])}</div>
      <button type="button" class="icon-button" aria-label=${t('action.close')} @click=${leave(() => {})}>${icons.close}</button><h2 dir="auto">${named(row)}</h2></header>
    ${cover ? html`<div class="table-cover">${parts.pictured(one, cover)}</div>` : nothing}
    <dl class="table-fields">${columns.map((property) => html`<div><dt>${parts.glyphs[property.type]}<span dir="auto">${property.name}</span></dt>
      <dd class=${`${fresh.has(`${row.id} ${property.id}`) ? 'is-jean ' : ''}${parts.reads.test(property.type) ? 'is-read' : ''}`}>${parts.cell(one, row, property, state, pick)}</dd></div>`)}</dl>
    ${last.length ? html`<h3>${words.last}</h3><ul class="table-last">${last.map((line) => html`<li><span dir="auto">${line.by === 'jean' ? assistantName() : line.by === 'user' ? words.me : line.by}</span>
      <time datetime=${line.at}>${format('DateTimeFormat', intlLocales(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(line.at))}</time>
      <span dir="auto">${((names) => new Intl.ListFormat(intlLocales(), { type: 'unit', style: 'narrow' }).format(names.length > 3 ? [...names.slice(0, 3), '…'] : names))(columns.flatMap(({ id, name }) => (line.set && id in line.set ? [name] : [])))}</span>${line.why ? html`<q dir="auto">${line.why}</q>` : nothing}</li>`)}</ul>` : nothing}
    <div id=${pick} class="menu table-menu table-picks" popover @focusout=${parts.leaving}></div></dialog>`
}
