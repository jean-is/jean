// SPDX-License-Identifier: MIT
// A collection shown as a board (caps/tables/view.js fetches this folder as one is first shown): a lane for each step or choice, in their
// order, its colour before its name, then one for rows with none, of the rows the view keeps; each card caps/card's, the same as in a list and
// a gallery, without the lanes' own column: dragged, it moves to the lane it is dropped in, and its menu gives it another lane's value with no
// drag. A card made at a lane's foot opens, to be named. Its cards' parts and Tables' words come from the view, whose they are.
import { html, nothing } from 'lit-html'
import { locale } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { groupName } from '../tables/tables.js'
import { titleOf } from '../tables/table.js'
import { query } from '../tables/query.js'
import { card, head } from '../card/card.js'

/** @import { Property } from '../tables/table.js' */

/** @param {import('../card/card.js').Given & { by: Property }} given the column its lanes are by */
export default function board(given) {
  const { one, by, rows, state, parts, words } = given, title = /** @type {Property} */ (titleOf(one.table))
  const { groups = [] } = query(one.table, rows, { group: { property: by.id }, locale: locale.value })
  const moves = { by, values: groups.map(({ value }) => value) }
  const drop = (/** @type {unknown} */ value) => (/** @type {DragEvent} */ event) => {
    event.preventDefault()
    const row = event.dataTransfer?.getData('text/x-row')
    if (row) parts.edit(one, { row, set: { [by.id]: value } })
  }
  return html`<div class="table-board">${groups.map((group) => html`<section class="table-lane" aria-label=${groupName(group.value, by)} @dragover=${(/** @type {DragEvent} */ e) => e.preventDefault()} @drop=${drop(group.value)}>
      <h3>${head(given, by, group)}</h3>
      ${group.rows.length ? html`<ul>${group.rows.map((row) => html`<li>${card(given, row, { skip: [by], moves, drag: true })}</li>`)}</ul>` : nothing}
      <button type="button" class="table-add" @click=${() => parts.added(one, { [title.id]: null, [by.id]: group.value }, state)}>${icons.plus}${words.add}</button>
    </section>`)}</div>`
}
