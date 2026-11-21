// SPDX-License-Identifier: MIT
// To look at, over a collection's rows (caps/over draws it): what the collection's own check found (./checks.js), each finding in words with what
// mends it: the same row twice, Keep one, which deletes the others; a choice written two ways, Make them one; a number some rows lack, or rows that
// end before they start, Open the first. Each is the person's own change, which Undo takes back. A finding left, or said not one, is kept with the
// collection as look.json, and shows no more while it holds. Nothing shows where nothing is found.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { t, useStrings, intlLocales } from '../../core/i18n.js'
import { app } from '../../ui/state.js'
import { icons } from '../../ui/menu-icons.js'
import { change } from '../tables/tables.js'
import { findings } from './checks.js'

await useStrings('checks')

/** @import { Finding } from './checks.js' */
/** @import { Loaded } from '../tables/tables.js' */
/** The findings each collection's person left, by its file's place, read once; and the collections whose band is folded. @type {Map<string, import('@preact/signals-core').Signal<string[]>>} */
const lefts = new Map(), folded = signal(/** @type {Set<string>} */ (new Set()))
/** @param {Loaded} one */
function leftOf({ dir, folder }) {
  const at = `${dir}/${folder}/look.json`, was = lefts.get(at)
  if (was) return was
  const left = signal(/** @type {string[]} */ ([]))
  lefts.set(at, left)
  app.fs.read(at).then((text) => { const said = text ? JSON.parse(text) : null; if (said?.format === 1 && Array.isArray(said.left)) left.value = said.left.map(String) }, () => {})
  return left
}
/** A finding left: kept, with those still found, so the file never grows. @param {Loaded} one @param {Finding} finding @param {Finding[]} found */
const leave = (one, finding, found) => { const left = leftOf(one), now = [...left.peek().filter((key) => found.some((each) => each.key === key)), finding.key]; left.value = now; return app.fs.write(`${one.dir}/${one.folder}/look.json`, JSON.stringify({ format: 1, left: now })) }

/** @param {{ one: Loaded, open: (row: string) => void }} given the collection and what opens a row's sheet */
export default function look({ one, open }) {
  const all = findings(one.table, one.rows), left = leftOf(one).value, found = all.filter(({ key }) => !left.includes(key))
  if (!found.length) return nothing
  const id = `look-${one.folder.slice(12, 38)}`, shut = folded.value.has(one.folder), named = (/** @type {string | undefined} */ column) => one.table.properties.find((property) => property.id === column)?.name ?? ''
  const fold = () => { const next = new Set(folded.peek()); if (!next.delete(one.folder)) next.add(one.folder); folded.value = next }, count = (/** @type {number} */ n) => new Intl.NumberFormat(intlLocales()).format(n)
  const button = (/** @type {string} */ key, /** @type {() => unknown} */ run, main = false) => html`<button type="button" class=${main ? 'button small primary' : 'button small'} @click=${run}>${t(key)}</button>`
  /** A finding in words, then what mends it and what leaves it. @param {Finding} finding */
  const said = (finding) => { const { kind, rows, column } = finding, later = () => leave(one, finding, all)
    return kind === 'same' ? [t('checks.same', { name: finding.name ?? '' }), button('checks.keep', () => change(one, rows.slice(1).map((row) => ({ row, delete: true })), 'user'), true), button('checks.differ', later)]
      : kind === 'ways' ? [t('checks.ways', { column: named(column), a: finding.a ?? '', b: finding.b ?? '' }), button('checks.one', () => change(one, rows.map((row) => ({ row, set: { [String(column)]: finding.b } })), 'user'), true), button('checks.leave', later)]
      : [kind === 'empty' ? t('checks.empty', { column: named(column), count: count(rows.length) }) : t('checks.ends', { count: count(rows.length) }), button('checks.open', () => open(rows[0])), button('checks.leave', later)] }
  return html`<section class="over-band look" aria-labelledby=${id}>
    <h3 id=${id}><button type="button" aria-expanded=${String(!shut)} @click=${fold}><i class="look-dot" aria-hidden="true"></i><span>${t('checks.head')}</span><span class="over-count">${count(found.length)}</span>${icons.chevron}</button></h3>
    ${shut ? nothing : html`<ul>${found.map((finding) => { const [words, ...buttons] = said(finding); return html`<li><p dir="auto">${words}</p><span class="over-acts">${buttons}</span></li>` })}</ul><p class="hint">${t('checks.says')}</p>`}
  </section>`
}
