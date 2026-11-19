// SPDX-License-Identifier: MIT
// A row's card, the same in a collection's list, board, gallery and calendar's days (D757), in a folder of its own that those layouts import: its
// name, which opens the row as a sheet; then what tells it apart, picked by kind among the columns shown, in their order: two choices as their
// pills and a day, and where those leave room, its other cells after their column's name; at its end an amount and a person's face; along its start the
// colour of the choice Arrange names (`tintOf()`), which it then says first; then its menu:
// opened, given another of its group's values, which moves it with no drag, asked about, or deleted. And a group's head, as a lane and a list's group
// say it. The cards' parts and Tables' words come from the view, whose they are.
import { html, nothing, render } from 'lit-html'
import { t, intlLocales } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { groupName } from '../tables/tables.js'
import { titleOf, hueOf, canonical, filesOf } from '../tables/table.js'
import { valueOf, total } from '../tables/query.js'
import { textOf, format, calcOf, amount, digitsOf } from '../tables/export.js'

/** @import { Property } from '../tables/table.js' */
/** @import { Row } from '../tables/changes.js' */
/** @import { Loaded } from '../tables/tables.js' */
/** @import { State } from '../tables/view.js' */
/**
 * What the view gives a layout: what its ids start with, the collection, its columns, the rows the view keeps, the columns it hides, the rows and cells
 * Jean changed, the view's own state, its parts, the column its groups are by, the one its pictures are from, the choice its rows take their colour from, and Tables' words.
 * @typedef {{ id: string, one: Loaded, columns: Property[], rows: Row[], hidden: string[], fresh: Set<string>, state: State, parts: typeof import('../tables/view.js').parts, by?: Property, covers?: Property, tint?: Property,
 *   words: { add: string, unnamed: string, subtotal: string, open: string, ask: string, last: string, me: string, changed: (count: number) => string, of: (shown: number, count: number) => string, about: (row: Row) => string } }} Given
 */
/** The column a card's row is moved by from its menu, and the values it takes: its groups'. @typedef {{ by: Property, values: unknown[] }} Moves */

/**
 * A row's first picture, which leads its card: small in a list, a glyph in its place where the row has none; over a board's card, where it has one.
 * @param {Given} given @param {Row} row @param {boolean} [small]
 */
export function pictureOf({ one, covers, parts }, row, small) {
  const [file] = covers ? filesOf(valueOf(row, covers)) : []
  return !covers ? nothing : small ? html`<div class="table-thumb">${file ? parts.pictured(one, file) : parts.glyphs.picture}</div>` : file ? html`<div class="table-cover">${parts.pictured(one, file)}</div>` : nothing
}

/**
 * The colour a row takes from the choice Arrange names, as its pill has it: its hue, a step with none its group's look, and the choice's name, said where
 * its colour alone would tell it: a card's cell, a calendar row's tip, unseen words after a bar's name. @param {Property | undefined} tint @param {Row} row
 */
export const tintOf = (tint, row) => ((value) => ({ hue: (tint && hueOf(tint, value)) ?? nothing, group: tint?.options?.find((option) => option.name === value)?.group ?? nothing, name: tint && typeof value === 'string' ? value : '' }))(tint && valueOf(row, tint))

/** The kinds a card reads as pills. */
const CHOICE = /^(status|select|multi-select)$/
/** An amount as a card says it: money with no cents where none of the view's rows has any, else as the table writes it. @param {Row[]} rows @param {Property} property @param {unknown} value */
const sumOf = (rows, property, value, locales = intlLocales()) => (typeof value !== 'number' ? '' : property.format === 'money' && property.currency && !digitsOf(rows, property)
  ? format('NumberFormat', locales, { style: 'currency', currency: property.currency, maximumFractionDigits: 0 }).format(value) : amount(value, property, locales, property.format ? undefined : digitsOf(rows, property)))
/** A day as a card says it, short: its weekday, its day and its month, its year when it is another, its time where it has one. @param {unknown} value */
const dayOf = (value) => ((text, timed = text.includes('T'), at = new Date(timed ? text : `${text}T12:00`)) => (Number.isNaN(at.getTime()) ? text : format('DateTimeFormat', intlLocales(),
  { weekday: 'short', day: 'numeric', month: 'short', ...(at.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }), ...(timed && { hour: 'numeric', minute: '2-digit' }) }).format(at)))(String(value))

/**
 * @param {Given} given @param {Row} row
 * @param {{ skip?: (Property | undefined)[], lead?: unknown, more?: { name: string, text: string }[], moves?: Moves, drag?: boolean }} [how] the columns its layout already says, what leads it, a picture, what its layout says of it
 *   first, each under a name, and how it moves
 */
export function card(given, row, { skip = [], lead = nothing, more = [], moves, drag = false } = {}) {
  const { one, columns, hidden, fresh, state, parts, words, tint } = given, title = /** @type {Property} */ (titleOf(one.table)), jean = fresh.has(row.id), shade = tintOf(tint, row)
  const value = (/** @type {Property} */ property) => valueOf(row, property, one.names), held = (/** @type {unknown} */ value) => value !== null && value !== false && value !== '' && !(Array.isArray(value) && !value.length)
  const shown = columns.filter((property) => property !== title && !skip.includes(property) && !hidden.includes(property.id) && held(value(property))), kind = (/** @type {string} */ type) => shown.find((property) => property.type === type)
  // Two things tell it apart, on one line: what its layout says of it, then its day and its choices; where those leave room, its other cells.
  // The choice its colour is from comes first among them: a colour is never alone to say it.
  const day = kind('date'), sum = kind('number'), who = kind('person'), room = Math.max(0, 2 - more.length), told = shown.filter((property) => property === tint)
  const picked = [...told, ...(day && room ? [day] : []), ...shown.filter((property) => CHOICE.test(property.type) && property !== tint)].slice(0, Math.max(room, told.length))
  const others = shown.filter(({ type }) => !CHOICE.test(type) && !/^(date|number|person|picture|files)$/.test(type)).slice(0, Math.max(0, room - picked.length))
  const facts = shown.filter((property) => picked.includes(property) || others.includes(property))
  return html`<article class=${`table-card${jean ? ' is-jean' : ''}`} data-hue=${shade.hue} data-group=${shade.group} title=${jean ? words.changed(Math.max(1, [...fresh].filter((at) => at.startsWith(`${row.id} `)).length)) : nothing}
      draggable=${drag ? 'true' : nothing} @dragstart=${(/** @type {DragEvent} */ e) => e.dataTransfer?.setData('text/x-row', row.id)}>${lead}
    <h4><button type="button" class="table-open" dir="auto" @click=${() => state.openRow(row.id)}>${textOf(row, title) || words.unnamed}</button></h4>
    ${shade.name && !told.length && !skip.includes(tint) ? html`<p class="visually-hidden" dir="auto">${shade.name}</p>` : nothing}
    ${facts.length || more.length ? html`<dl class="table-facts">${more.map(({ name, text }) => html`<div class="table-field"><dt class="visually-hidden" dir="auto">${name}</dt><dd title=${name}>${text}</dd></div>`)}
      ${facts.map((property) => html`<div class="table-field"><dt class=${others.includes(property) ? 'muted' : 'visually-hidden'} dir="auto">${property.name}</dt>
      <dd dir="auto" title=${others.includes(property) ? nothing : property.name}>${CHOICE.test(property.type) ? [value(property)].flat().map((name) => parts.pill(property, name)) : property === day ? dayOf(value(day)) : parts.said(row, property, one.names)}</dd></div>`)}</dl>` : nothing}
    ${sum || who ? html`<dl class="table-ends">${sum ? html`<div class="table-field"><dt class="visually-hidden" dir="auto">${sum.name}</dt><dd class="table-sum" title=${sum.name}>${sumOf(given.rows, sum, value(sum))}</dd></div>` : nothing}
      ${who ? html`<div class="table-field is-who"><dt class="visually-hidden" dir="auto">${who.name}</dt><dd title=${String(value(who))}>${parts.face(String(value(who)))}<span class="visually-hidden" dir="auto">${value(who)}</span></dd></div>` : nothing}</dl>` : nothing}
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
      aria-current=${String(canonical(value) === at)} popovertarget=${id} popovertargetaction="hide" @click=${() => parts.edit(one, { row: row.id, set: { [moves.by.id]: value } })}>${named(parts, moves.by, value)}${canonical(value) === at ? icons.check : nothing}</button></li>`)}</ul>` : nothing}
    <hr>${parts.listed([item(icons.brain, words.ask, () => parts.ask(one, words.about(row)))], [item(icons.trash, t('action.delete'), () => parts.rid(one, row), false, 'danger')])}`, /** @type {HTMLElement} */ (state.box.querySelector(`#${id}`)))
}

/** A group by its name: a choice's as its pill, another's after its colour's dot, where it has one. @param {Given['parts']} parts @param {Property} by @param {unknown} value */
const named = (parts, by, value) => (CHOICE.test(by.type) && typeof value === 'string' && value ? parts.pill(by, value)
  : html`${((hue) => (hue === undefined ? nothing : html`<i class="table-dot" data-hue=${hue}></i>`))(hueOf(by, value))}<span dir="auto">${groupName(value, by)}</span>`)

/**
 * A group's head, as a board's lane and a list's group say it: its name, how many rows, and at its end its subtotal, of the first column whose foot
 * works out a number, named in its tip. @param {Given} given @param {Property} by @param {{ value: unknown, rows: Row[] }} group
 */
export function head({ columns, rows: all, state, parts, words }, by, { value, rows }) {
  const summed = columns.find((property) => /^(sum|average|min|max)$/.test(calcOf(property, state.calculate))), how = summed && calcOf(summed, state.calculate)
  return html`${named(parts, by, value)} <span class="muted">${format('NumberFormat', intlLocales()).format(rows.length)}</span>${summed && how ? html` <span class="table-sub" title=${summed.name}><span class="visually-hidden">${words.subtotal}</span>${sumOf(all, summed, total(rows, summed, /** @type {import('../tables/query.js').Total} */ (how)))}</span>` : nothing}`
}
