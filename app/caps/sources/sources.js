// SPDX-License-Identifier: MIT
// Sources, over a collection's rows (caps/over draws it), once the collection has one, or as one is being added from its links menu (caps/compose):
// where its rows come from by themselves. A source is a routine whose request names the collection by its place: each morning, or as a file is shared, Jean reads what the
// person said to read and adds a row for each thing the collection doesn't hold yet. Those rows are Jean's changes, so they wait there to be
// accepted or rejected, as any. The band lists the collection's sources, each with its switch, and Add a source asks what to read and when.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { t, useStrings, intlLocales } from '../../core/i18n.js'
import { app } from '../../ui/state.js'
import { loaded, unlock, slots } from '../../ui/caps.js'
import { icons } from '../../ui/menu-icons.js'
import { listRoutines, newRoutine, writeRoutine } from '../routines/schedule.js'

await useStrings('sources')

/** @import { Routine } from '../routines/schedule.js' */
/** @import { Loaded } from '../tables/tables.js' */
/** Where the project's routines are, as Routines has them: the default project's with no folder. */
const place = () => (app.project.value.data.default === true ? '' : app.projectDir)
/** Each collection's sources, by its place, read as its band first shows and after each change; the collections whose band is open, and the one adding. */
const kept = /** @type {Map<string, import('@preact/signals-core').Signal<Routine[]>>} */ (new Map()), open = signal(/** @type {Set<string>} */ (new Set())), adding = signal('')
const reread = (/** @type {string} */ folder) => listRoutines(app.fs, place()).then((all) => { sourcesOf(folder).value = all.filter((routine) => routine.request.includes(folder)) }, () => {})
/** @param {string} folder */
function sourcesOf(folder) {
  const was = kept.get(folder)
  if (was) return was
  kept.set(folder, signal(/** @type {Routine[]} */ ([])))
  reread(folder)
  return /** @type {import('@preact/signals-core').Signal<Routine[]>} */ (kept.get(folder))
}

/** A source made: a routine, on, each morning at eight or as a file is shared, whose request says what to read and names the collection. @param {Loaded} one @param {SubmitEvent} event */
async function add(one, event) {
  event.preventDefault()
  const form = /** @type {HTMLFormElement} */ (event.target), said = new FormData(form), what = String(said.get('what') ?? '').trim(), file = said.get('when') === 'file'
  if (!what || !(await unlock('routines'))) return
  const words = { what, name: one.table.name, place: one.folder }
  await writeRoutine(app.fs, newRoutine(place(), { title: t('sources.named', words), request: t(file ? 'sources.fileRequest' : 'sources.request', words), by: app.deviceId, device: slots('runs')[0]?.here(), ...(file ? { when: /** @type {const} */ ('file') } : { every: /** @type {const} */ ('day'), at: '08:00' }) }))
  adding.value = ''
  await reread(one.folder)
}
/** A source turned off or on, as Routines does: back on, the times it fell due meanwhile make no run. @param {Loaded} one @param {Routine} routine */
const turn = (one, routine) => writeRoutine(app.fs, { ...routine, active: !routine.active, ...(!routine.active && { resumed: new Date().toISOString() }) }).then(() => reread(one.folder))

/**
 * Where a collection's rows come from, in its links menu (caps/compose), once Routines is found or it has one: Add a source, which shows its band
 * open on the form, how many it has beside it. @param {string} folder @param {string} menu the menu's id
 */
export function linked(folder, menu) {
  const mine = sourcesOf(folder).value, id = `sources-${folder.slice(12, 38)}`
  if (!mine.length && !loaded.value.has('routines')) return nothing
  const begin = () => { adding.value = folder; open.value = new Set(open.peek()).add(folder); requestAnimationFrame(() => document.getElementById(`${id}-what`)?.focus()) }
  return html`<div role="group" aria-label=${t('sources.head')}><p class="menu-heading" aria-hidden="true">${t('sources.head')}</p><ul><li><button type="button" popovertarget=${menu} popovertargetaction="hide" @click=${begin}>${icons.download}<span>${t('sources.add')}</span>${mine.length ? html`<span class="menu-value">${new Intl.NumberFormat(intlLocales()).format(mine.length)}</span>` : nothing}</button></li></ul></div>`
}

/** @param {{ one: Loaded }} given the collection */
export default function sources({ one }) {
  const { folder } = one, mine = sourcesOf(folder).value
  if (!mine.length && adding.value !== folder) return nothing
  const id = `sources-${folder.slice(12, 38)}`, shown = open.value.has(folder), fold = () => { const next = new Set(open.peek()); if (next.delete(folder)) adding.value = ''; else next.add(folder); open.value = next }
  return html`<section class="over-band sources" aria-labelledby=${id}>
    <h3 id=${id}><button type="button" aria-expanded=${String(shown)} @click=${fold}>${icons.download}<span>${t('sources.head')}</span><span class="over-count">${new Intl.NumberFormat(intlLocales()).format(mine.length)}</span>${icons.chevron}</button></h3>
    ${!shown ? nothing : html`${mine.length ? html`<ul>${mine.map((routine, i) => html`<li><label for=${`${id}-${i}`}><bdi>${routine.title}</bdi></label><input id=${`${id}-${i}`} type="checkbox" class="switch" role="switch" .checked=${routine.active} @change=${() => turn(one, routine)}></li>`)}</ul>` : nothing}
      ${adding.value === folder ? html`<form class="sources-add" @submit=${(/** @type {SubmitEvent} */ e) => add(one, e)}><label for=${`${id}-what`}>${t('sources.what')}</label><input id=${`${id}-what`} name="what" dir="auto" required>
          <label for=${`${id}-when`}>${t('sources.when')}</label><select id=${`${id}-when`} name="when"><option value="morning">${t('sources.morning')}</option><option value="file">${t('sources.file')}</option></select>
          <button class="button small primary">${t('sources.make')}</button></form>`
        : html`<button type="button" class="button small sources-new" @click=${() => { adding.value = folder }}>${t('sources.add')}</button>`}
      <p class="hint">${t('sources.waits')}</p>`}
  </section>`
}
