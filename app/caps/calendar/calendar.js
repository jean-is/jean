// SPDX-License-Identifier: MIT
// A collection shown as a calendar (caps/tables/view.js fetches this folder as one is first shown): a month, its weeks from the language's
// first day, each row on the day its date column holds, by its time, and on each day it lasts where another date column says until when.
// A row's name opens it as a sheet; dragged to another day, it is on that day, its time kept and its end as many days later; each day's +
// makes a row on it, which opens. Those with no day wait under the month, to open or drag onto one. Where the pane is narrow, the days
// are a list. The month's name, its days' and its moves' words are Intl's; Tables' own come from the view, whose strings they are.
import { html, nothing } from 'lit-html'
import { intlLocales } from '../../core/i18n.js'
import { notify } from '../../ui/state.js'
import { styleSheet } from '../../ui/sheet.js'
import { icons } from '../../ui/menu-icons.js'
import { change } from '../tables/tables.js'
import { titleOf } from '../tables/table.js'
import { textOf } from '../tables/export.js'
import { weeksOf, placed, monthOf, monthAfter, moved, addDays, daysBetween, dayOf } from './month.js'

await styleSheet(new URL('calendar.css', import.meta.url))

/** @import { Property } from '../tables/table.js' */
/** @import { Row } from '../tables/changes.js' */
/** @import { Loaded } from '../tables/tables.js' */
/**
 * What the view gives: the collection, its calendar's columns (table.js `calendarOf()`), the rows the view keeps, those Jean changed, the view's
 * own state, with the month on show ('' until first drawn) and what opens a row, what picks the columns, what its fields' ids start with, and Tables' words.
 * @typedef {{ id: string, one: Loaded, date: Property, until?: Property, dates: Property[], rows: Row[], fresh: Set<string>, state: import('../tables/view.js').State,
 *   pick: (columns: { date?: string, until?: string }) => unknown, words: { add: string, none: string, unnamed: string, wrong: string, date: string, end: string } }} Given
 */

/** A day of ISO 8601 as a moment for Intl, at noon in UTC, so no zone moves it. @param {string} day */
const at = (day) => new Date(`${day}T12:00:00Z`)
/** Today, here. */
const today = () => ((now) => new Date(now.getTime() - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 10))(new Date())
/** Words with their first letter a capital, as a button's name starts. @param {string} words @param {string[]} locales */
const named = (words, locales) => words.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase(locales))

/** @param {Given} given */
export default function calendar({ id, one, date, until, dates, rows, fresh, state: { month, openRow: open }, pick, words }) {
  const locales = intlLocales(), now = today(), title = /** @type {Property} */ (titleOf(one.table))
  if (!month.peek()) month.value = monthOf(rows.map((row) => dayOf(row.cells[date.id])).filter(Boolean), now)
  // The grid is Gregorian's: a language whose own calendar has other months says this one's days in Gregorian's words.
  const own = new Intl.DateTimeFormat(locales).resolvedOptions().calendar, how = { timeZone: 'UTC', ...(!/^(gregory|buddhist|japanese|roc)$/.test(own) && { calendar: 'gregory' }) }
  const say = (/** @type {Intl.DateTimeFormatOptions} */ options) => new Intl.DateTimeFormat(locales, { ...how, ...options })
  const [long, number, weekday, short, whole, time] = [say({ month: 'long', year: 'numeric' }), say({ day: 'numeric' }), say({ weekday: 'long' }), say({ weekday: 'short' }), say({ dateStyle: 'full' }), new Intl.DateTimeFormat(locales, { timeStyle: 'short' })]
  const locale = new Intl.Locale(locales[0]), first = /** @type {{ firstDay?: number } | undefined} */ (/** @type {any} */ (locale).getWeekInfo?.() ?? /** @type {any} */ (locale).weekInfo)?.firstDay ?? 1
  const weeks = weeksOf(month.value, first), { days, none } = placed(rows, date.id, until?.id, month.value), name = long.format(at(`${month.value}-01`)), moves = new Intl.RelativeTimeFormat(locales, { numeric: 'auto' })
  /** A row on another day: its time kept, and its end as many days later. @param {DragEvent} event @param {string} day */
  const drop = (event, day) => {
    const row = rows.find(({ id }) => id === event.dataTransfer?.getData('text/x-row')), start = row && dayOf(row.cells[date.id]), end = row && until && dayOf(row.cells[until.id])
    if (!row || start === day) return
    event.preventDefault()
    change(one, [{ row: row.id, set: { [date.id]: moved(row.cells[date.id], day), ...(until && start && end && { [until.id]: moved(row.cells[until.id], addDays(end, daysBetween(start, day))) }) } }], 'user').catch(() => notify(words.wrong, { alert: true }))
  }
  const over = (/** @type {DragEvent} */ event) => { if (event.dataTransfer?.types.includes('text/x-row')) event.preventDefault() }
  /** A row made on a day, which opens to be named. @param {string} day */
  const add = (day) => change(one, [{ set: { [title.id]: null, [date.id]: day } }], 'user').then(([id]) => id && open(id), () => notify(words.wrong, { alert: true }))
  /** A row by its name, after its time on the day it starts: it opens its sheet, and is dragged to another day. @param {Row} row @param {string} [clock] its date's value, where it has a time */
  const chip = (row, clock) => html`<li><button type="button" class=${`cal-row${fresh.has(row.id) ? ' is-jean' : ''}`} draggable="true" @dragstart=${(/** @type {DragEvent} */ event) => event.dataTransfer?.setData('text/x-row', row.id)}
    @click=${() => open(row.id)}>${clock ? html`<span class="muted">${time.format(new Date(clock))}</span> ` : nothing}<bdi>${textOf(row, title) || words.unnamed}</bdi></button></li>`
  /** One of its date columns picked, by a field its label names: the one its rows are on, or the one they last until, none with —. */
  const picker = (/** @type {string} */ field, /** @type {string} */ label, /** @type {Property | undefined} */ picked, /** @type {(id: string) => unknown} */ set, /** @type {Property[]} */ among, /** @type {boolean} */ empty) => html`<label for=${field}>${label}</label><select id=${field}
    @change=${(/** @type {Event} */ event) => set(/** @type {HTMLSelectElement} */ (event.target).value)}>${empty ? html`<option value="" ?selected=${!picked}>—</option>` : nothing}${among.map((property) => html`<option value=${property.id} ?selected=${property === picked}>${property.name}</option>`)}</select>`
  return html`<div class="cal"><div class="cal-bar"><h3 dir="auto"><span role="status">${name}</span></h3>
      ${dates.length > 1 ? html`${picker(`${id}-date`, words.date, date, (column) => pick({ date: column }), dates, false)}${picker(`${id}-end`, words.end, until, (column) => pick({ until: column }), dates.filter((property) => property !== date), true)}` : nothing}
      <div class="cal-moves" role="group" aria-label=${name}><button type="button" class="icon-button" aria-label=${named(moves.format(-1, 'month'), locales)} @click=${() => { month.value = monthAfter(month.peek(), -1) }}>${icons.back}</button>
        <button type="button" class="button subtle" ?disabled=${month.value === now.slice(0, 7)} @click=${() => { month.value = now.slice(0, 7) }}>${named(moves.format(0, 'month'), locales)}</button>
        <button type="button" class="icon-button" aria-label=${named(moves.format(1, 'month'), locales)} @click=${() => { month.value = monthAfter(month.peek(), 1) }}>${icons.arrow}</button></div></div>
    <table class="cal-grid" aria-label=${name}><thead><tr>${weeks[1].map((day) => html`<th scope="col" abbr=${weekday.format(at(String(day)))}>${short.format(at(String(day)))}</th>`)}</tr></thead>
      <tbody>${weeks.map((week) => html`<tr>${week.map((day) => (day ? html`<td aria-current=${day === now ? 'date' : nothing} @dragover=${over} @drop=${(/** @type {DragEvent} */ event) => drop(event, day)}>
        <div class="cal-day"><time datetime=${day}><span class="cal-weekday">${short.format(at(day))} </span>${number.format(at(day))}</time><button type="button" class="icon-button cal-add" aria-label=${words.add} title=${whole.format(at(day))} @click=${() => add(day)}>${icons.plus}</button></div>
        ${days.has(day) ? html`<ul>${days.get(day)?.map(({ row, time: clock, on }) => chip(row, clock && !on ? String(row.cells[date.id]) : ''))}</ul>` : nothing}</td>` : html`<td class="is-out"></td>`))}</tr>`)}</tbody></table>
    ${none.length ? html`<section class="cal-none" aria-label=${words.none}><h4 dir="auto">${words.none}</h4><ul>${none.map((row) => chip(row))}</ul></section>` : nothing}</div>`
}
