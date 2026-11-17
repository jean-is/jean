// SPDX-License-Identifier: MIT
// A collection shown as a board (caps/tables/view.js fetches this folder as one is first shown): a lane for each step or choice, in their
// order, its colour before its name, then one for rows with none, of the rows the view keeps; each card its row's name, which opens the row
// as a sheet, two of its other cells, and its own step or choice to move it; dragged, it moves to the lane it is dropped in. A card made at
// a lane's foot opens, to be named. Its cards' parts and Tables' words come from the view, whose they are.
import { html, nothing } from 'lit-html'
import { locale, intlLocales } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { groupName } from '../tables/tables.js'
import { hueOf } from '../tables/table.js'
import { query } from '../tables/query.js'
import { textOf, format, calcOf } from '../tables/export.js'

/** @import { Property } from '../tables/table.js' */
/** @import { Row } from '../tables/changes.js' */
/** @import { Loaded } from '../tables/tables.js' */
/** @import { State } from '../tables/view.js' */
/**
 * What the view gives: the collection, the column its lanes are by, its columns, the rows the view keeps, the columns it hides, the rows and
 * cells Jean changed, the view's own state, its cards' parts and Tables' words.
 * @typedef {{ one: Loaded, by: Property, columns: Property[], rows: Row[], hidden: string[], fresh: Set<string>, state: State, parts: typeof import('../tables/view.js').parts,
 *   words: { add: string, unnamed: string, subtotal: string, changed: (count: number) => string } }} Given
 */

/** @param {Given} given */
export default function board({ one, by, columns, rows, hidden, fresh, state, parts, words }) {
  const { groups = [] } = query(one.table, rows, { group: { property: by.id }, locale: locale.value })
  const title = columns.find((property) => property.type === 'text') ?? columns[0]
  const others = columns.filter((property) => property !== title && property !== by && !hidden.includes(property.id)).slice(0, 2)
  // Each lane's subtotal: of the first column whose foot works out a number.
  const summed = columns.find((property) => /^(sum|average|min|max)$/.test(calcOf(property, state.calculate)))
  const drop = (/** @type {unknown} */ value) => (/** @type {DragEvent} */ event) => {
    event.preventDefault()
    const row = event.dataTransfer?.getData('text/x-row')
    if (row) parts.edit(one, { row, set: { [by.id]: value } })
  }
  return html`<div class="table-board">${groups.map(({ value, rows }) => {
    const name = groupName(value, by), how = summed && calcOf(summed, state.calculate), hue = hueOf(by, value)
    return html`<section class="table-lane" aria-label=${name} @dragover=${(/** @type {DragEvent} */ e) => e.preventDefault()} @drop=${drop(value)}>
      <h3><span dir="auto">${hue === undefined ? nothing : html`<i class="table-dot" data-hue=${hue}></i> `}${name}</span> <span class="muted">${summed && how ? html`<span class="table-sub"><span class="visually-hidden">${words.subtotal}</span>${parts.totalOf(rows, summed, how, state.digits?.get(summed.id))}</span> · ` : nothing}${format('NumberFormat', intlLocales()).format(rows.length)}</span></h3>
      ${rows.length ? html`<ul>${rows.map((row) => {
        // Its cells shown, each a name and a value; one Jean changed says so in its tip.
        const changed = [...fresh].filter((at) => at.startsWith(`${row.id} `)).length
        return html`<li><article class=${`table-card${fresh.has(row.id) ? ' is-jean' : ''}`} title=${fresh.has(row.id) ? words.changed(Math.max(1, changed)) : nothing} draggable="true"
        @dragstart=${(/** @type {DragEvent} */ e) => e.dataTransfer?.setData('text/x-row', row.id)}>
        <h4><button type="button" class="table-open" dir="auto" @click=${() => state.openRow(row.id)}>${textOf(row, title) || words.unnamed}</button></h4>
        ${parts.facts(one, row, others)}
        ${parts.cell(one, row, by, state)}${fresh.has(row.id) ? html`<div class="table-decide">${parts.decide(one, row.id)}</div>` : nothing}
      </article></li>`
      })}</ul>` : nothing}
      <button type="button" class="table-add" @click=${() => parts.added(one, { [title.id]: null, [by.id]: value }, state)}>${icons.plus}${words.add}</button>
    </section>`
  })}</div>`
}
