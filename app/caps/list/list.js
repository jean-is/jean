// SPDX-License-Identifier: MIT
// A collection shown as a list (caps/tables/view.js fetches this folder as one is first shown), the layout a narrow view starts in (D757): a card for each
// row the view keeps, one under the other on one ground, its first picture small at its start, the whole card pressed opening its row. Grouped, as Arrange asks or as a board's
// lanes are, each group is under a head that folds it: its name, its subtotal and how many rows; Find unfolds what it keeps. The cards are caps/card's;
// their parts and Tables' words come from the view, whose they are.
import { html, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { locale } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { groupName } from '../tables/tables.js'
import { query } from '../tables/query.js'
import { card, head, pictureOf } from '../card/card.js'

/** @import { Row } from '../tables/changes.js' */

/** @param {import('../card/card.js').Given} given */
export default function list(given) {
  const { one, by, rows, covers, state } = given
  const groups = by ? query(one.table, rows, { group: { property: by.id }, locale: locale.value, names: one.names }).groups ?? [] : []
  // A row takes another group's value from its menu, but a month's, which no row is given.
  const moves = by && by.type !== 'date' ? { by, values: groups.map(({ value }) => value) } : undefined
  const cards = (/** @type {Row[]} */ rows) => html`<ul class="table-list">${repeat(rows, (row) => row.id, (row) => html`<li>${card(given, row, { skip: [by, covers], moves, lead: pictureOf(given, row, true) })}</li>`)}</ul>`
  return html`<div class="table-listed">${by ? groups.map((group) => {
    const key = String(group.value), shut = state.folded.value.has(key) && !state.search.value
    const fold = () => { const all = new Set(state.folded.peek()); if (!all.delete(key)) all.add(key); state.folded.value = all }
    return html`<section aria-label=${groupName(group.value, by)}><h3><button type="button" class="table-fold" aria-expanded=${String(!shut)} @click=${fold}>${icons.chevron}${head(given, by, group)}</button></h3>${shut ? nothing : cards(group.rows)}</section>`
  }) : cards(rows)}</div>`
}
