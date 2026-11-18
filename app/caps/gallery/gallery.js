// SPDX-License-Identifier: MIT
// A collection shown as a gallery (caps/tables/view.js fetches this folder as one is first shown), where a column holds pictures: a card for
// each row the view keeps, its first picture over caps/card's card, the same as in a list and a board, the whole card pressed opening its row.
// Its cards' parts and Tables' words come from the view, whose they are.
import { html } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { filesOf } from '../tables/table.js'
import { valueOf } from '../tables/query.js'
import { card } from '../card/card.js'

/** @import { Property } from '../tables/table.js' */

/** @param {import('../card/card.js').Given & { covers: Property }} given the column its covers are from */
export default function gallery(given) {
  const { one, covers, rows, parts } = given
  return html`<ul class="table-gallery">${repeat(rows, (row) => row.id, (row) => html`<li>${card(given, row, { skip: [covers],
    lead: html`<div class="table-cover">${filesOf(valueOf(row, covers)).slice(0, 1).map((file) => parts.pictured(one, file))}</div>` })}</li>`)}</ul>`
}
