// SPDX-License-Identifier: MIT
// The rows that relate to a row, in its sheet (./row.js): for each collection of the project with a relation to this row's collection, this one
// too, the rows whose cell is this row, how many, the totals of that collection's first two numbers over them, as their columns write them,
// the first five by their names, and a button that opens that collection beside the task. The project's collections are read as a sheet
// first opens, and again half a minute later at the soonest.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { t, useStrings, intlLocales } from '../../core/i18n.js'
import { styleSheet } from '../../ui/sheet.js'
import { collections, load } from '../tables/tables.js'
import { titleOf } from '../tables/table.js'
import { amount, textOf } from '../tables/export.js'

await Promise.all([useStrings('row'), styleSheet(new URL('related.css', import.meta.url))])

/** @import { Loaded } from '../tables/tables.js' */
/** The collections that relate to each collection, by its place, with when they were read. @type {Map<string, { at: number, those: import('@preact/signals-core').Signal<Loaded[]> }>} */
const read = new Map()
/** @param {Loaded} one */
function relating(one) {
  const was = read.get(one.folder), kept = was ?? { at: 0, those: signal(/** @type {Loaded[]} */ ([])) }
  if (Date.now() - kept.at > 30_000) {
    read.set(one.folder, Object.assign(kept, { at: Date.now() }))
    collections(one.dir).then((all) => Promise.all(all.map(({ folder }) => load(folder, one.dir).catch(() => null)))).then((all) => { kept.those.value = /** @type {Loaded[]} */ (all.filter((each) => each && !each.table.kind && each.table.properties.some((property) => !property.deleted && property.type === 'relation' && property.collection === one.folder))) }, () => {})
  }
  return kept.those.value
}

/** @param {Loaded} one the row's collection @param {{ id: string }} row */
export function related(one, row) {
  const locales = intlLocales(), whole = new Intl.NumberFormat(locales)
  return relating(one).map((other) => {
    const to = other.table.properties.filter((property) => !property.deleted && property.type === 'relation' && property.collection === one.folder), rows = other.rows.filter((each) => !each.deleted && to.some((property) => each.cells[property.id] === row.id))
    if (!rows.length) return nothing
    const title = titleOf(other.table), sums = other.table.properties.filter((property) => !property.deleted && property.type === 'number').slice(0, 2)
    const opens = (/** @type {Event} */ event) => { /** @type {HTMLElement} */ (event.currentTarget).closest('dialog')?.close(); import('../../ui/preview.js').then(({ preview }) => preview({ uri: other.folder, name: other.table.name, title: other.table.name })) }
    return html`<h3><span dir="auto">${other.table.name}</span> ${whole.format(rows.length)}</h3>
      ${sums.length ? html`<dl class="row-sums">${sums.map((property) => html`<div><dt dir="auto">${property.name}</dt><dd>${amount(rows.reduce((sum, each) => sum + (typeof each.cells[property.id] === 'number' ? Number(each.cells[property.id]) : 0), 0), property, locales)}</dd></div>`)}</dl>` : nothing}
      <ul class="row-related">${rows.slice(0, 5).map((each) => html`<li dir="auto">${(title && textOf(each, title)) || '—'}</li>`)}</ul>
      <button type="button" class="button row-open" @click=${opens}>${t('row.open', { name: other.table.name })}</button>`
  })
}
