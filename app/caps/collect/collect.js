// SPDX-License-Identifier: MIT
// Collect replies, Share's third tab for a collection (caps/share/dialog.js fetches this folder as the dialog first opens on one), where the
// host offers sites: the collection's columns a form can ask, each ticked, the row's name always, beside the form as people will see it; then
// Put the form online, which makes the form a site of one page whose page is the collection (./form.js; caps/sites' publishPage()) and opens
// Publish's dialog, for its name, its link and its recovery code. Published, its replies, sealed in the visitor's browser (D751), come into
// the collection as rows, by its columns' names. Under them, whether the collection takes proposals from a site Jean made, whose form says
// `data-to` (caps/compose's port), and which columns that form can fill.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { t, useStrings, locale, dir } from '../../core/i18n.js'
import { unlock } from '../../ui/caps.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { load } from '../tables/tables.js'
import { offered } from '../sites/offer.js'
import { propose, proposalsOf } from '../compose/compose.js'
import { askable, partsOf, pageOf } from './form.js'

await Promise.all([useStrings('collect'), styleSheet(new URL('collect.css', import.meta.url))])

/** @import { Field, Part } from './form.js' */

/** Whether the host offers sites, asked once; the collection shown, with the columns a form can ask; those unticked; and whether the form is being made. */
const offer = signal(false), shown = signal(/** @type {{ folder: string, name: string, fields: Field[] } | null} */ (null)), left = signal(/** @type {Set<string>} */ (new Set())), busy = signal(false)
offered().then((sites) => { offer.value = Boolean(sites) })
let reading = ''
/** Whether the collection shown takes proposals from a site, through its port (caps/compose), and which columns a site's form fills, in words. */
const port = signal(/** @type {{ folder: string, columns: string | null } | null} */ (null))
const ported = (/** @type {string} */ folder) => proposalsOf(folder).then((columns) => { port.value = { folder, columns } }, () => {})
/** The collection read, as the tab first shows it. @param {string} folder */
const read = (folder) => { if (reading !== folder) (reading = folder, ported(folder), load(folder).then((one) => { if (one && reading === folder) (left.value = new Set(), shown.value = { folder, name: one.table.name, fields: askable(one.table) }) }, () => {})) }

/** Whether the tab shows: for a collection, where the host offers sites. @param {{ thing?: { kind: string, uri: string } }} what */
export const when = (what) => offer.value && what.thing?.kind === 'collection'
export const label = () => t('collect.tab')

/** A part as people will see it: its column's name, then its field, which nothing here fills. @param {Part} part */
const seen = ({ as, id, name, attrs, options }) => html`<div class="collect-field">${as === 'tick' ? nothing : html`<span dir="auto">${name}</span>`}${as === 'tick' ? html`<span><input type="checkbox" title=${name}> <bdi>${name}</bdi></span>`
  : as === 'radios' ? options.map((option) => html`<span><input type="radio" name=${`collect-${id}`} title=${option}> <bdi>${option}</bdi></span>`)
  : as === 'select' ? html`<select title=${name}><option>${t('collect.pick')}</option></select>` : as === 'area' ? html`<textarea title=${name} rows="2"></textarea>` : html`<input title=${name} type=${attrs.type === true ? 'text' : attrs.type ?? 'text'}>`}</div>`

/** The form made a site of one page, in the person's language, and Publish's dialog opened on it. @param {{ folder: string, name: string }} one @param {Part[]} parts */
async function online({ folder, name }, parts) {
  busy.value = true
  try {
    const files = pageOf({ name, lang: locale.peek(), dir: dir(), parts, words: { pick: t('collect.pick'), send: t('collect.send'), sent: t('collect.sent'), unsent: t('collect.unsent') } })
    if (await unlock('sites')) await (await import('../sites/sites.js')).publishPage({ uri: folder, title: name }, files)
  } finally { busy.value = false }
}

/** The tab's panel. @param {{ thing?: { kind: string, uri: string } }} what */
export function draw(what) {
  const folder = what.thing?.uri ?? '', now = shown.value
  if (!now || now.folder !== folder) return (read(folder), nothing)
  const off = left.value, parts = partsOf(now.fields.filter((field) => field.title || !off.has(field.id)))
  const toggle = (/** @type {string} */ id) => { const next = new Set(off); if (!next.delete(id)) next.add(id); left.value = next }
  return html`<p class="share-says">${t('collect.says')}</p>
    <div class="collect"><fieldset><legend>${t('collect.asks')}</legend><p class="hint">${t('collect.hint')}</p>
      <ul>${now.fields.map((field) => html`<li><label for=${`collect-${field.id}`}><input id=${`collect-${field.id}`} type="checkbox" .checked=${field.title || !off.has(field.id)} ?disabled=${field.title} @change=${() => toggle(field.id)}>
        <bdi>${field.name}</bdi>${field.title ? html`<small>${t('collect.always')}</small>` : nothing}</label></li>`)}</ul></fieldset>
      <section aria-labelledby="collect-sees"><h3 id="collect-sees">${t('collect.sees')}</h3>
        <div class="collect-see" inert><b dir="auto">${now.name}</b>${parts.map(seen)}<span class="collect-send">${t('collect.send')}</span></div></section></div>
    <p class="hint">${t('collect.sealed')}</p>
    ${port.value?.folder === folder ? ((columns) => html`<div class="collect-port"><label for="collect-port">${t('collect.proposals')}</label><input id="collect-port" type="checkbox" class="switch" role="switch" .checked=${columns !== null}
      @change=${(/** @type {Event} */ e) => propose(folder, /** @type {HTMLInputElement} */ (e.target).checked).then(() => ported(folder))}><p class="hint" role="status">${columns === null ? nothing : t('collect.port', { columns })}</p></div>`)(port.value.columns) : nothing}
    <footer class="dialog-foot"><button class="button primary" ?disabled=${busy.value} @click=${() => online(now, parts)}>${icons.globe} ${t('collect.online')}</button></footer>`
}
