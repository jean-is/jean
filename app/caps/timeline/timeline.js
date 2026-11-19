// SPDX-License-Identifier: MIT
// A collection shown as a timeline (caps/tables/view.js fetches this folder as one is first shown): its months side by side, from its first row's
// to the one after its last row's, a day narrower as they are more, and each row a bar on a line of its own, from the day its date column holds to
// the one it lasts until, a mark where it lasts a day. Its columns are the calendar's, picked in either. A bar says its row's name, in sight while
// the bar is, in the colour of the choice Arrange names, else its step's or its first choice's; pressed, it opens its row; dragged along, the row is as many days later or sooner, its time
// kept and its end with it. Grouped, as Arrange asks, each group's rows are under its head. Today is a line, in sight as the timeline first shows,
// which a button goes back to. Rows with no day wait under it, to open or drag onto one. The months' names and Today are Intl's; Tables' words
// come from the view, whose strings they are; what a calendar shares is caps/calendar's.
import { html, nothing } from 'lit-html'
import { ref } from 'lit-html/directives/ref.js'
import { locale, intlLocales } from '../../core/i18n.js'
import { styleSheet } from '../../ui/sheet.js'
import { groupName } from '../tables/tables.js'
import { titleOf } from '../tables/table.js'
import { query } from '../tables/query.js'
import { textOf } from '../tables/export.js'
import { head, tintOf } from '../card/card.js'
import { addDays } from '../calendar/month.js'
import { at, today, named, sayer, chip, picks, shift } from '../calendar/calendar.js'
import { spanOf, dayAt } from './span.js'

await styleSheet(new URL('timeline.css', import.meta.url))

/** @import { Property } from '../tables/table.js' */
/** @import { Row } from '../tables/changes.js' */

/** Numbers its style sheet places with, set through the CSSOM, as the policy refuses a style attribute. @param {Record<string, number | string>} values */
const vars = (values) => ref((element) => { for (const [name, value] of Object.entries(element ? values : {})) /** @type {HTMLElement} */ (element).style.setProperty(name, String(value)) })
/** Today's line brought to the middle of what shows, along the months alone. @param {Element | null | undefined} scroll */
const see = (scroll) => ((line) => line && scroll?.scrollBy({ left: line.getBoundingClientRect().left - scroll.getBoundingClientRect().left - scroll.clientWidth / 2 }))(scroll?.querySelector('.line-now'))
/** Those already shown, so that today comes in sight once, as one first shows. @type {WeakSet<Element>} */
const shown = new WeakSet()
const first = ref((scroll) => { if (scroll && !shown.has(scroll)) shown.add(scroll), requestAnimationFrame(() => see(scroll)) })
const over = (/** @type {DragEvent} */ event) => { if (event.dataTransfer?.types.includes('text/x-row')) event.preventDefault() }
/** How far along a box a pointer is, a share of its width from its start, in the page's direction. @param {DragEvent} event */
const along = (event) => ((box, rtl) => (rtl ? box.right - event.clientX : event.clientX - box.left) / box.width)(/** @type {Element} */ (event.currentTarget).getBoundingClientRect(), getComputedStyle(/** @type {Element} */ (event.currentTarget)).direction === 'rtl')

/** @param {import('../card/card.js').Given & Pick<import('../calendar/calendar.js').Given, 'date' | 'until' | 'dates' | 'pick'> & { words: import('../calendar/calendar.js').Given['words'] }} given */
export default function timeline(given) {
  const { one, date, until, rows, columns, hidden, by, fresh, state, words } = given, locales = intlLocales(), title = /** @type {Property} */ (titleOf(one.table))
  const { from, days, wide, months, places, none, now } = spanOf(rows, date.id, until?.id, today()), say = sayer(locales)
  const [month, year, whole] = [say({ month: 'short' }), say({ month: 'short', year: 'numeric' }), say({ dateStyle: 'medium' })]
  // A bar's colour: the choice Arrange names, else its row's step, else its first choice, as their pills have it.
  const tint = given.tint ?? ((shown) => shown.find(({ type }) => type === 'status') ?? shown.find(({ type }) => type === 'select'))(columns.filter(({ id }) => !hidden.includes(id)))
  const groups = by ? (query(one.table, rows, { group: { property: by.id }, locale: locale.value, names: one.names }).groups ?? []).filter((group) => group.rows.some(({ id }) => places.has(id))) : []
  /** A bar held: how many days from its start, kept as it lands. @param {DragEvent} event @param {Row} row */
  const hold = (event, row) => { event.dataTransfer?.setData('text/x-row', row.id); event.dataTransfer?.setData('text/x-held', String(Math.floor(Math.max(0, Math.min(0.999, along(event))) * (places.get(row.id)?.days ?? 1)))) }
  /** A row let go on a day: its start there, less the days it was held from. @param {DragEvent} event */
  const drop = (event) => {
    const row = rows.find(({ id }) => id === event.dataTransfer?.getData('text/x-row'))
    if (!row) return
    event.preventDefault()
    shift(given, row, dayAt(from, days, along(event), Number(event.dataTransfer?.getData('text/x-held')) || 0))
  }
  /** @param {Row} row */
  const bar = (row) => {
    const { at: start, days: length, start: on, end } = /** @type {{ at: number, days: number, start: string, end: string }} */ (places.get(row.id)), shade = tintOf(tint, row)
    return html`<li><button type="button" class=${`line-bar${fresh.has(row.id) ? ' is-jean' : ''}`} draggable="true" data-hue=${shade.hue} data-group=${shade.group}
      title=${on === end ? whole.format(at(on)) : whole.formatRange(at(on), at(end))} ${vars({ '--at': start, '--len': length })} @dragstart=${(/** @type {DragEvent} */ event) => hold(event, row)} @click=${() => state.openRow(row.id)}><bdi>${textOf(row, title) || words.unnamed}</bdi>${shade.name ? html` <span class="visually-hidden" dir="auto">${shade.name}</span>` : nothing}</button></li>`
  }
  const bars = (/** @type {Row[]} */ rows) => html`<ul class="line-rows">${rows.filter(({ id }) => places.has(id)).map(bar)}</ul>`
  return html`<div class="cal line"><div class="cal-bar"><h3 dir="auto">${year.formatRange(at(from), at(addDays(from, days - 1)))}</h3>
      <button type="button" class="button subtle" ?disabled=${now < 0} @click=${(/** @type {Event} */ event) => see(/** @type {Element} */ (event.currentTarget).closest('.line')?.querySelector('.line-scroll'))}>${named(new Intl.RelativeTimeFormat(locales, { numeric: 'auto' }).format(0, 'day'), locales)}</button>${picks(given)}</div>
    <div class="line-scroll" ${first}><div class="line-track" ${vars({ '--days': days, '--wide': `${wide}rem` })} @dragover=${over} @drop=${drop}>
      <div class="line-months" aria-hidden="true">${months.map(({ month: name, at: start, days: length }, i) => html`<span ${vars({ '--at': start, '--len': length })}><b>${(i && !name.endsWith('-01') ? month : year).format(at(`${name}-01`))}</b></span>`)}</div>
      ${now < 0 ? nothing : html`<i class="line-now" ${vars({ '--at': now })}></i>`}
      ${by ? groups.map((group) => html`<section aria-label=${groupName(group.value, by)}><h4>${head(given, by, group)}</h4>${bars(group.rows)}</section>`) : bars(rows)}</div></div>
    ${none.length ? html`<section class="cal-none" aria-label=${words.none}><h4 dir="auto">${words.none}</h4><ul>${none.map((row) => chip(given, row))}</ul></section>` : nothing}</div>`
}
