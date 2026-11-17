// SPDX-License-Identifier: MIT
// A collection shown as a gallery (caps/tables/view.js fetches this folder as one is first shown), where a column holds pictures: a card for
// each row the view keeps, its first picture over its name, which opens the row as a sheet, the whole card pressing it, and two of its other
// cells; New row at its end opens one, to be named and given its picture. Its cards' parts and Tables' words come from the view, whose they are.
import { html, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { icons } from '../../ui/menu-icons.js'
import { titleOf, filesOf } from '../tables/table.js'
import { valueOf } from '../tables/query.js'
import { textOf } from '../tables/export.js'

/** @import { Property } from '../tables/table.js' */
/** @import { Row } from '../tables/changes.js' */
/** @import { Loaded } from '../tables/tables.js' */
/** @import { State } from '../tables/view.js' */
/**
 * What the view gives: the collection, the column its covers are from, its columns, the rows the view keeps, the columns it hides, the rows
 * Jean changed, the view's own state, its cards' parts and Tables' words.
 * @typedef {{ one: Loaded, covers: Property, columns: Property[], rows: Row[], hidden: string[], fresh: Set<string>, state: State, parts: typeof import('../tables/view.js').parts,
 *   words: { add: string, unnamed: string } }} Given
 */

/** @param {Given} given */
export default function gallery({ one, covers, columns, rows, hidden, fresh, state, parts, words }) {
  const title = /** @type {Property} */ (titleOf(one.table)), others = columns.filter((property) => property !== title && property.type !== 'picture' && !hidden.includes(property.id)).slice(0, 2)
  return html`<ul class="table-gallery">${repeat(rows, (row) => row.id, (row) => html`<li><article class=${`table-card${fresh.has(row.id) ? ' is-jean' : ''}`}>
      <div class="table-cover">${filesOf(valueOf(row, covers)).slice(0, 1).map((file) => parts.pictured(one, file))}</div>
      <h4><button type="button" class="table-open" dir="auto" @click=${() => state.openRow(row.id)}>${textOf(row, title) || words.unnamed}</button></h4>
      ${parts.facts(one, row, others)}${fresh.has(row.id) ? html`<div class="table-decide">${parts.decide(one, row.id)}</div>` : nothing}</article></li>`)}
    <li><button type="button" class="table-add" @click=${() => parts.added(one, { [title.id]: null }, state)}>${icons.plus}${words.add}</button></li></ul>`
}
