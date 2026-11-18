// SPDX-License-Identifier: MIT
// A row's card, the same in a collection's list, board and gallery (D757), in a folder of its own that those layouts import: its name, which opens the
// row as a sheet, then the first four of its other cells shown that hold something, each read as its kind reads, a choice as its pill, a person with
// their face, a day or money in the user's words, the others after their column's name; then its menu: opened, given another of its group's values,
// which moves it with no drag, asked about, or deleted. And a group's head, as a lane and a list's group say it. The cards' parts and Tables' words
// come from the view, whose they are.
import { html, nothing, render } from 'lit-html'
import { t, intlLocales } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { groupName } from '../tables/tables.js'
import { titleOf, hueOf, canonical } from '../tables/table.js'
import { valueOf } from '../tables/query.js'
import { textOf, format, calcOf } from '../tables/export.js'

/** @import { Property } from '../tables/table.js' */
/** @import { Row } from '../tables/changes.js' */
/** @import { Loaded } from '../tables/tables.js' */
/** @import { State } from '../tables/view.js' */
/**
 * What the view gives a layout: what its ids start with, the collection, its columns, the rows the view keeps, the columns it hides, the rows and cells
 * Jean changed, the view's own state, its parts, the column its groups are by, the one its pictures are from, and Tables' words.
 * @typedef {{ id: string, one: Loaded, columns: Property[], rows: Row[], hidden: string[], fresh: Set<string>, state: State, parts: typeof import('../tables/view.js').parts, by?: Property, covers?: Property,
 *   words: { add: string, unnamed: string, subtotal: string, open: string, ask: string, last: string, me: string, changed: (count: number) => string, of: (shown: number, count: number) => string, about: (row: Row) => string } }} Given
 */
/** The column a card's row is moved by from its menu, and the values it takes: its groups'. @typedef {{ by: Property, values: unknown[] }} Moves */

/** The kinds a card reads without their column's name: they say what they are. */
const TELLING = /^(status|select|multi-select|person|date)$/

/**
 * @param {Given} given @param {Row} row
 * @param {{ skip?: (Property | undefined)[], lead?: unknown, moves?: Moves, drag?: boolean }} [how] the columns its layout already says, what leads it, a picture, and how it moves
 */
export function card(given, row, { skip = [], lead = nothing, moves, drag = false } = {}) {
  const { one, columns, hidden, fresh, state, parts, words } = given, title = /** @type {Property} */ (titleOf(one.table)), jean = fresh.has(row.id)
  const held = (/** @type {unknown} */ value) => value !== null && value !== false && value !== '' && !(Array.isArray(value) && !value.length)
  const cells = columns.filter((property) => property !== title && !skip.includes(property) && !hidden.includes(property.id) && !/^(picture|files)$/.test(property.type) && held(valueOf(row, property, one.names))).slice(0, 4)
  return html`<article class=${`table-card${jean ? ' is-jean' : ''}`} title=${jean ? words.changed(Math.max(1, [...fresh].filter((at) => at.startsWith(`${row.id} `)).length)) : nothing}
      draggable=${drag ? 'true' : nothing} @dragstart=${(/** @type {DragEvent} */ e) => e.dataTransfer?.setData('text/x-row', row.id)}>${lead}
    <h4><button type="button" class="table-open" dir="auto" @click=${() => state.openRow(row.id)}>${textOf(row, title) || words.unnamed}</button></h4>
    ${cells.length ? html`<dl>${cells.map((property) => {
      const value = valueOf(row, property, one.names), named = !TELLING.test(property.type) && !property.format
      return html`<div class="table-field"><dt class=${named ? 'muted' : 'visually-hidden'} dir="auto">${property.name}</dt><dd dir="auto" title=${named ? nothing : property.name}>${property.type === 'person' ? html`${parts.face(String(value))}${value}`
        : /select|status/.test(property.type) ? [value].flat().map((name) => parts.pill(property, name)) : parts.said(row, property, one.names)}</dd></div>`
    })}</dl>` : nothing}
    <button type="button" class="icon-button table-more" aria-label=${t('action.more')} popovertarget=${`${state.id}-card`} @click=${() => menu(given, row, moves)}>${icons.more}</button>
    ${jean ? html`<div class="table-decide">${parts.decide(one, row.id)}</div>` : nothing}</article>`
}

/**
 * The cards' one menu, drawn for the card whose button opens it: its row opened as a sheet; under its group's column's name, each value a row there takes,
 * the row's own ticked, a press giving it that one; then asked about, in the box, and deleted, with an Undo.
 * @param {Given} given @param {Row} row @param {Moves} [moves]
 */
function menu({ one, state, parts, words }, row, moves) {
  const id = `${state.id}-card`, item = parts.option.bind(null, id), at = moves && canonical(valueOf(row, moves.by))
  render(html`${parts.listed([item(icons.fullscreen, words.open, () => state.openRow(row.id))])}${moves ? html`<hr><h3 id=${`${id}-by`} dir="auto">${moves.by.name}</h3><ul aria-labelledby=${`${id}-by`}>${moves.values.map((value) => html`<li><button type="button"
      aria-current=${String(canonical(value) === at)} popovertarget=${id} popovertargetaction="hide" @click=${() => parts.edit(one, { row: row.id, set: { [moves.by.id]: value } })}>${dot(moves.by, value)}<span dir="auto">${groupName(value, moves.by)}</span>${canonical(value) === at ? icons.check : nothing}</button></li>`)}</ul>` : nothing}
    <hr>${parts.listed([item(icons.brain, words.ask, () => parts.ask(one, words.about(row)))], [item(icons.trash, t('action.delete'), () => parts.rid(one, row), false, 'danger')])}`, /** @type {HTMLElement} */ (state.box.querySelector(`#${id}`)))
}

/** A choice's colour, a dot before its name, where it has one. @param {Property} by @param {unknown} value */
const dot = (by, value) => ((hue) => (hue === undefined ? nothing : html`<i class="table-dot" data-hue=${hue}></i>`))(hueOf(by, value))

/**
 * A group's head, as a board's lane and a list's group say it: its colour before its name, then its subtotal, of the first column whose foot works out
 * a number, and how many rows. @param {Given} given @param {Property} by @param {{ value: unknown, rows: Row[] }} group
 */
export function head({ columns, state, parts, words }, by, { value, rows }) {
  const summed = columns.find((property) => /^(sum|average|min|max)$/.test(calcOf(property, state.calculate))), how = summed && calcOf(summed, state.calculate)
  return html`<span dir="auto">${dot(by, value)} ${groupName(value, by)}</span> <span class="muted">${summed && how ? html`<span class="table-sub"><span class="visually-hidden">${words.subtotal}</span>${parts.totalOf(rows, summed, how, state.digits?.get(summed.id))}</span> · ` : nothing}${format('NumberFormat', intlLocales()).format(rows.length)}</span>`
}
