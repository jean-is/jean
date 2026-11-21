// SPDX-License-Identifier: MIT
// Summary, over a collection's rows (caps/over draws it), for one of three rows or more that has a number, a status or a choice: its head says
// how many rows and the total of its first number, and opens what they are shared by (./calc.js): its status or first choice, and the months
// of its first date, each share a line with its bar, a meter, and its amount as its column writes it. Folded until pressed.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { t, useStrings, intlLocales } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { amount } from '../tables/export.js'
import { summary } from './calc.js'

await useStrings('sum')

/** The collections whose summary is open, until the page is left. */
const open = signal(/** @type {Set<string>} */ (new Set()))

/** @param {{ one: import('../tables/tables.js').Loaded }} given the collection */
export default function sum({ one }) {
  const { count, number, total, by, groups, date, months } = summary(one.table, one.rows), locales = intlLocales()
  if (count < 3 || !(number || by)) return nothing
  const id = `sum-${one.folder.slice(12, 38)}`, shown = open.value.has(one.folder), whole = new Intl.NumberFormat(locales), month = new Intl.DateTimeFormat(locales, { month: 'short', year: 'numeric', timeZone: 'UTC' })
  const said = (/** @type {number} */ worth) => (number ? amount(worth, number, locales) : whole.format(worth)), fold = () => { const next = new Set(open.peek()); if (!next.delete(one.folder)) next.add(one.folder); open.value = next }
  /** Shares as lines, each with its bar against the largest. @param {string} title @param {[string, number][]} shares */
  const bars = (title, shares) => { const most = Math.max(...shares.map(([, worth]) => Math.abs(worth)), 1)
    return html`<h4 dir="auto">${title}</h4><ul class="sum-bars">${shares.map(([name, worth]) => html`<li><span dir="auto">${name}</span><meter min="0" max=${most} value=${Math.abs(worth)} title=${name}></meter><span class="sum-worth">${said(worth)}</span></li>`)}</ul>` }
  return html`<section class="over-band sum" aria-labelledby=${id}>
    <h3 id=${id}><button type="button" aria-expanded=${String(shown)} @click=${fold}>${icons.table}<span>${t('sum.title')}</span>
      <span class="sum-figure"><small>${t('sum.rows')}</small>${whole.format(count)}</span>${number ? html`<span class="sum-figure"><small dir="auto">${t('sum.total', { column: number.name })}</small>${said(total)}</span>` : nothing}${icons.chevron}</button></h3>
    ${shown ? html`${by && groups.length ? bars(by.name, groups.map(([name, worth]) => [name || t('sum.none'), worth])) : nothing}${date && months.length ? bars(date.name, months.map(([at, worth]) => [month.format(new Date(`${at}-01T00:00:00Z`)), worth])) : nothing}` : nothing}
  </section>`
}
