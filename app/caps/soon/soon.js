// SPDX-License-Identifier: MIT
// Coming up, over a collection's rows (caps/tables/view.js fetches this folder for a collection with a date): the rows due within two weeks and,
// where a status says what is done, those whose day went by (./due.js), each by its name, which opens its row's sheet, its day and how far it
// is; a late one is said late in words and offers Chase it, which writes the start of a request in the box, never sent. Its head folds it and
// says how many. At its foot, which date it goes by, where there are several, and when a notice comes (./how.js, ./tell.js).
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { t, useStrings, intlLocales } from '../../core/i18n.js'
import { app } from '../../ui/state.js'
import { BRAND } from '../../brand.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { coming, datesOf, dayOf } from './due.js'
import { howOf, keepHow } from './how.js'

await Promise.all([useStrings('soon'), styleSheet(new URL('soon.css', import.meta.url))])

/** @import { Due } from './due.js' */
/** The collections whose band is folded, until the page is left. */
const folded = signal(/** @type {Set<string>} */ (new Set()))
const utc = (/** @type {string} */ day) => new Date(`${day}T00:00:00Z`)

/** The start of a request about a late row, in the box for the person to finish, the caret at its end; the pane makes way where it covers the box. @param {string} folder @param {Due} due */
function chase(folder, due) {
  const words = t('soon.draft', { name: due.name, date: new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'long', timeZone: 'UTC' }).format(utc(due.day)) })
  app.draft.value = words
  if (document.documentElement.dataset.dock === 'over') import('../../ui/preview.js').then(({ unshow }) => unshow(folder))
  requestAnimationFrame(() => { const box = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('prompt')); box?.focus(); box?.setSelectionRange(words.length, words.length) })
}

/** @param {{ one: import('../tables/tables.js').Loaded, open: (row: string) => void }} given the collection and what opens a row's sheet */
export default function soon({ one, open }) {
  const { dir, folder, table } = one, how = howOf(dir, folder).value, dues = coming(table, one.rows, { today: dayOf(new Date()), column: how.column }), dates = datesOf(table)
  if (!dues.length) return nothing
  const id = `soon-${folder.slice(12, 38)}`, shut = folded.value.has(folder), locales = intlLocales()
  const day = new Intl.DateTimeFormat(locales, { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }), far = new Intl.RelativeTimeFormat(locales, { numeric: 'auto' })
  const fold = () => { const next = new Set(folded.peek()); if (!next.delete(folder)) next.add(folder); folded.value = next }
  const picked = (/** @type {Event} */ event) => /** @type {HTMLSelectElement} */ (event.target).value
  return html`<section class="soon" aria-labelledby=${id}>
    <h3 id=${id}><button type="button" aria-expanded=${String(!shut)} @click=${fold}>${icons.bell}<span>${t('soon.title')}</span><span class="soon-count">${new Intl.NumberFormat(locales).format(dues.length)}</span>${icons.chevron}</button></h3>
    ${shut ? nothing : html`<ul>${dues.slice(0, 6).map((due) => html`<li><button type="button" class="soon-row" @click=${() => open(due.id)}><b dir="auto">${due.name || day.format(utc(due.day))}</b>
        <span class="soon-when"><span>${day.format(utc(due.day))}</span>${due.away < 0 ? html`<strong>${t('soon.late')}</strong>` : nothing}<span>${far.format(due.away, 'day')}</span></span></button>
        ${due.away < 0 ? html`<button type="button" class="button" @click=${() => chase(folder, due)}>${t('soon.chase')}</button>` : nothing}</li>`)}</ul>
      <div class="soon-how">${dates.length > 1 ? html`<label for=${`${id}-by`}>${t('soon.by')}</label><select id=${`${id}-by`} .value=${live(how.column ?? dates[0].id)} @change=${(/** @type {Event} */ e) => keepHow(dir, folder, { ...how, column: picked(e) })}>
          ${dates.map((property) => html`<option value=${property.id} ?selected=${property.id === (how.column ?? dates[0].id)}>${property.name}</option>`)}</select>` : nothing}
        <label for=${`${id}-tell`}>${t('soon.tell')}</label><select id=${`${id}-tell`} .value=${live(String(how.before))} @change=${(/** @type {Event} */ e) => keepHow(dir, folder, { ...how, before: Number(picked(e)) })}>
          ${[[-1, 'never'], [0, 'day'], [1, 'before'], [7, 'week']].map(([days, key]) => html`<option value=${days} ?selected=${days === how.before}>${t(`soon.${key}`)}</option>`)}</select>
        <p class="hint">${t('soon.says', { app: BRAND.name })}</p></div>`}
  </section>`
}
