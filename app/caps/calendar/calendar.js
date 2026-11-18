// SPDX-License-Identifier: MIT
// A collection shown as a calendar (caps/tables/view.js fetches this folder as one is first shown): a month, its weeks from the language's
// first day, each row on the day its date column holds, by its time, and on each day it lasts where another date column says until when.
// A row's name opens it as a sheet; dragged to another day, it is on that day, its time kept and its end as many days later; each day's +
// makes a row on it, which opens. Those with no day wait under the month, to open or drag onto one. Where the pane is narrow, the days
// are a list of its rows' cards (caps/card). The month's name, its days' and its moves' words are Intl's; Tables' own come from the view, whose strings they are. What a
// timeline shares (caps/timeline) is here too: the columns picked, a row by its name, a row moved, and Intl's words for a day.
import { html, nothing } from 'lit-html'
import { intlLocales } from '../../core/i18n.js'
import { notify } from '../../ui/state.js'
import { styleSheet } from '../../ui/sheet.js'
import { icons } from '../../ui/menu-icons.js'
import { change } from '../tables/tables.js'
import { titleOf } from '../tables/table.js'
import { textOf, format } from '../tables/export.js'
import { card, pictureOf } from '../card/card.js'
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
export const at = (day) => new Date(`${day}T12:00:00Z`)
/** Today, here. */
export const today = () => ((now) => new Date(now.getTime() - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 10))(new Date())
/** Words with their first letter a capital, as a button's name starts. @param {string} words @param {string[]} locales */
export const named = (words, locales) => words.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase(locales))
/** Intl's words for a day. The days are Gregorian's: a language whose own calendar has other months says them in Gregorian's words. @param {string[]} locales */
export function sayer(locales) {
  const own = new Intl.DateTimeFormat(locales).resolvedOptions().calendar, how = { timeZone: 'UTC', ...(!/^(gregory|buddhist|japanese|roc)$/.test(own) && { calendar: 'gregory' }) }
  return (/** @type {Intl.DateTimeFormatOptions} */ options) => new Intl.DateTimeFormat(locales, { ...how, ...options })
}

/**
 * A row by its name, after its time on the day it starts: it opens its sheet, and is dragged to another day.
 * @param {Pick<Given, 'one' | 'fresh' | 'state' | 'words'>} given @param {Row} row @param {string} [clock] its date's value, where it has a time
 */
export const chip = ({ one, fresh, state, words }, row, clock) => html`<li><button type="button" class=${`cal-row${fresh.has(row.id) ? ' is-jean' : ''}`} draggable="true" @dragstart=${(/** @type {DragEvent} */ event) => event.dataTransfer?.setData('text/x-row', row.id)}
  @click=${() => state.openRow(row.id)}>${clock ? html`<span class="muted">${format('DateTimeFormat', intlLocales(), { timeStyle: 'short' }).format(new Date(clock))}</span> ` : nothing}<bdi>${textOf(row, /** @type {Property} */ (titleOf(one.table))) || words.unnamed}</bdi></button></li>`

/** One of its date columns picked, by a field its label names. */
const picker = (/** @type {string} */ field, /** @type {string} */ label, /** @type {Property | undefined} */ picked, /** @type {(id: string) => unknown} */ set, /** @type {Property[]} */ among, /** @type {boolean} */ empty) => html`<span class="cal-pick"><label for=${field}>${label}</label><select id=${field}
  @change=${(/** @type {Event} */ event) => set(/** @type {HTMLSelectElement} */ (event.target).value)}>${empty ? html`<option value="" ?selected=${!picked}>—</option>` : nothing}${among.map((property) => html`<option value=${property.id} ?selected=${property === picked}>${property.name}</option>`)}</select></span>`
/** The columns picked, where it has more than one of dates: the one its rows are on, and the one they last until, none with —. @param {Pick<Given, 'id' | 'date' | 'until' | 'dates' | 'pick' | 'words'>} given */
export const picks = ({ id, date, until, dates, pick, words }) => (dates.length > 1 ? html`${picker(`${id}-date`, words.date, date, (column) => pick({ date: column }), dates, false)}${picker(`${id}-end`, words.end, until, (column) => pick({ until: column }), dates.filter((property) => property !== date), true)}` : nothing)

/** A row on another day: its time kept, and its end as many days later. @param {Pick<Given, 'one' | 'date' | 'until' | 'words'>} given @param {Row} row @param {string} day */
export function shift({ one, date, until, words }, row, day) {
  const start = dayOf(row.cells[date.id]), end = until && dayOf(row.cells[until.id])
  return start === day ? undefined : change(one, [{ row: row.id, set: { [date.id]: moved(row.cells[date.id], day), ...(until && start && end && { [until.id]: moved(row.cells[until.id], addDays(end, daysBetween(start, day))) }) } }], 'user').catch(() => notify(words.wrong, { alert: true }))
}

/** @param {Given & import('../card/card.js').Given} given */
export default function calendar(given) {
  const { one, date, until, rows, covers, state: { month, openRow: open, narrow, folded }, words } = given, locales = intlLocales(), now = today(), title = /** @type {Property} */ (titleOf(one.table))
  if (!month.peek()) month.value = monthOf(rows.map((row) => dayOf(row.cells[date.id])).filter(Boolean), now)
  const say = sayer(locales), [long, number, weekday, short, whole, span, head] = [say({ month: 'long', year: 'numeric' }), say({ day: 'numeric' }), say({ weekday: 'long' }), say({ weekday: 'short' }), say({ dateStyle: 'full' }), say({ day: 'numeric', month: 'short' }), say({ weekday: 'short', day: 'numeric', month: 'short' })]
  const locale = new Intl.Locale(locales[0]), first = /** @type {{ firstDay?: number } | undefined} */ (/** @type {any} */ (locale).getWeekInfo?.() ?? /** @type {any} */ (locale).weekInfo)?.firstDay ?? 1
  const weeks = weeksOf(month.value, first), { days, none } = placed(rows, date.id, until?.id, month.value), name = long.format(at(`${month.value}-01`)), moves = new Intl.RelativeTimeFormat(locales, { numeric: 'auto' })
  /** @param {DragEvent} event @param {string} day */
  const drop = (event, day) => {
    const row = rows.find(({ id }) => id === event.dataTransfer?.getData('text/x-row'))
    if (!row || dayOf(row.cells[date.id]) === day) return
    event.preventDefault()
    shift(given, row, day)
  }
  const over = (/** @type {DragEvent} */ event) => { if (event.dataTransfer?.types.includes('text/x-row')) event.preventDefault() }
  /** A row made on a day, which opens to be named. @param {string} day */
  const add = (day) => change(one, [{ set: { [title.id]: null, [date.id]: day } }], 'user').then(([id]) => id && open(id), () => notify(words.wrong, { alert: true }))
  /**
   * Where it is narrow, its days are a list (D757): those a row starts on, and today, each under its date, its rows their cards. A row that lasts is on its
   * first day, saying its days, and on today, never once a day. This month's days gone by are folded over the rest, by their dates; today with no row offers one.
   */
  const agenda = () => {
    const here = month.value === now.slice(0, 7), listed = /** @type {[string, { row: Row, time: string, on: boolean }[]][]} */ ([...days, ...(here && !days.has(now) ? [[now, []]] : [])])
      .map(([day, all]) => /** @type {[string, { row: Row, time: string, on: boolean }[]]} */ ([day, day === now ? all : all.filter(({ on }) => !on || day.endsWith('-01'))])).filter(([day, all]) => day === now || all.length).sort(([a], [b]) => (a < b ? -1 : 1))
    const past = here ? listed.filter(([day]) => day < now) : [], shut = !folded.value.has('@past')
    /** What a day's card says first of its row: its time, and its days where it lasts. @param {Row} row @param {string} clock */
    const more = (row, clock) => { const start = dayOf(row.cells[date.id]), end = until ? dayOf(row.cells[until.id]) : ''; return [...(clock ? [{ name: date.name, text: format('DateTimeFormat', locales, { timeStyle: 'short' }).format(new Date(String(row.cells[date.id]))) }] : []),
      ...(until && end > start ? [{ name: until.name, text: span.formatRange(at(start), at(end)) }] : [])] }
    return html`${past.length ? html`<button type="button" class="table-fold" aria-expanded=${String(!shut)} @click=${() => { const all = new Set(folded.peek()); if (!all.delete('@past')) all.add('@past'); folded.value = all }}>${icons.chevron}<span>${span.formatRange(at(past[0][0]), at(/** @type {[string, unknown]} */ (past.at(-1))[0]))}</span>
        <span class="muted">${format('NumberFormat', locales).format(past.reduce((sum, [, all]) => sum + all.length, 0))}</span></button>` : nothing}
      ${listed.filter(([day]) => !shut || !past.length || day >= now).map(([day, all]) => html`<section class="cal-on" aria-label=${whole.format(at(day))} aria-current=${day === now ? 'date' : nothing}>
        <h4><time datetime=${day}>${head.format(at(day))}</time>${Math.abs(daysBetween(now, day)) < 2 ? html` <span class="muted">${named(moves.format(daysBetween(now, day), 'day'), locales)}</span>` : nothing}</h4>
        ${all.length ? html`<ul class="table-list">${all.map(({ row, time: clock, on }) => html`<li>${card(given, row, { skip: [date, until, covers], lead: pictureOf(given, row, true), more: more(row, on ? '' : clock) })}</li>`)}</ul>`
          : html`<button type="button" class="table-add" @click=${() => add(day)}>${icons.plus}${words.add}</button>`}</section>`)}`
  }
  return html`<div class="cal"><div class="cal-bar"><div class="cal-moves" role="group" aria-label=${name}><button type="button" class="icon-button" aria-label=${named(moves.format(-1, 'month'), locales)} @click=${() => { month.value = monthAfter(month.peek(), -1) }}>${icons.back}</button>
        <h3 dir="auto"><span role="status">${name}</span></h3><button type="button" class="icon-button" aria-label=${named(moves.format(1, 'month'), locales)} @click=${() => { month.value = monthAfter(month.peek(), 1) }}>${icons.arrow}</button></div>
      <button type="button" class="button subtle" ?disabled=${month.value === now.slice(0, 7)} @click=${() => { month.value = now.slice(0, 7) }}>${named(moves.format(0, 'month'), locales)}</button>${picks(given)}</div>
    ${narrow.value ? agenda() : html`<table class="cal-grid" aria-label=${name}><thead><tr>${weeks[1].map((day) => html`<th scope="col" abbr=${weekday.format(at(String(day)))}>${short.format(at(String(day)))}</th>`)}</tr></thead>
      <tbody>${weeks.map((week) => html`<tr>${week.map((day) => (day ? html`<td aria-current=${day === now ? 'date' : nothing} @dragover=${over} @drop=${(/** @type {DragEvent} */ event) => drop(event, day)}>
        <div class="cal-day"><time datetime=${day}>${number.format(at(day))}</time><button type="button" class="icon-button cal-add" aria-label=${words.add} title=${whole.format(at(day))} @click=${() => add(day)}>${icons.plus}</button></div>
        ${days.has(day) ? html`<ul>${days.get(day)?.map(({ row, time: clock, on }) => chip(given, row, clock && !on ? String(row.cells[date.id]) : ''))}</ul>` : nothing}</td>` : html`<td class="is-out"></td>`))}</tr>`)}</tbody></table>`}
    ${none.length ? html`<section class="cal-none" aria-label=${words.none}><h4 dir="auto">${words.none}</h4><ul>${none.map((row) => chip(given, row))}</ul></section>` : nothing}</div>`
}
