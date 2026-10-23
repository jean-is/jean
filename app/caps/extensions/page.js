// Settings' Extensions (D296, D535): the extensions added, each a row with its mark, its few words, the strongest thing it may do in a
// word and its switch, opening its page, extensions/<name>: where it comes from, its maker's words, what it shows here, a switch
// for each right it holds, what it can't do, Look for a new version and Remove, asked in the page. extensions/add holds the ready-made extensions policy names and an address, each read on extensions/read before it is added. Safe
// mode, or an extension that kept failing, takes the line under the title. Loaded the first time Settings shows Extensions.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { app, notify, updateSettings } from '../../ui/state.js'
import { sectionOpen } from '../../ui/dialogs.js'
import { join } from '../../core/fs.js'
import { t, locale } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { readManifest, shownIn, baseOf, siteOf } from './manifest.js'
import { DIR, LARGEST, installed, running, safe, switches, granted, refresh, stop, drawn, leaveSafe, take } from './extensions.js'

// Your data's heads and rows, as Approvals has them.
await styleSheet(new URL('../../ui/data-pages.css', import.meta.url))

/** @typedef {import('./manifest.js').Manifest} Manifest */

/** An extension read from an address, shown before it is added. */
const reading = signal(/** @type {{ manifest?: Manifest, json?: string, code?: string, base?: string, failed?: string } | null} */ (null))
/** The extension whose Remove is being asked about, in its page. */
const removing = signal('')
/** The ready-made extensions policy names, read once Add an extension shows: an address's files, and its manifest unless it can't be read. */
const ready = signal(/** @type {[string, Manifest | null][] | null} */ (null))
/** What can't reach an extension, whatever it asks. */
const CANT = ['internet', 'files', 'others']
const name = BRAND.name

/** The page open: '' for the list, add, read or an extension's name. */
const pageOpen = () => app.section.value.split('/')[1] ?? ''

/** Opens the list ('') or a page, the keyboard on its title, or back on the list on the extension's row. @param {string} to */
function go(to) {
  const from = pageOpen()
  if (to !== 'read') reading.value = null
  removing.value = ''
  app.section.value = to ? `extensions/${to}` : 'extensions'
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '.data-head h2[tabindex]' : `[data-extension="${from}"]`))?.focus())
}

// ─── Adding, changing, removing ──────────────────────────────────────────────

/** Reads an extension from an address, then shows it before it is added; what is wrong is said under the address. @param {string} address */
async function look(address) {
  const base = baseOf(address.trim())
  if (!base) return void (reading.value = { failed: 'address' })
  reading.value = { base }
  try {
    const json = await fetch(new URL('extension.json', base)).then((response) => (response.ok ? response.text() : Promise.reject(new Error('fetch'))))
    const manifest = readManifest(json)
    const code = await fetch(new URL(manifest.main, base)).then((response) => (response.ok ? response.text() : Promise.reject(new Error('fetch'))))
    if (code.length > LARGEST) throw new Error('size')
    reading.value = { manifest, json, code, base }
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    reading.value = { base, failed: ['json', 'format', 'name', 'main', 'rights', 'size'].includes(code) ? code : 'fetch' }
  }
}

/** Reads an extension, then opens its page before it is added. @param {string} address */
const readFrom = (address) => look(address).then(() => reading.peek()?.manifest && go('read'))

/** Adds the extension read, as it came, and turns it on: added again, it takes the earlier one's place, with every right it asks, and keeps its data. */
async function add() {
  const { manifest, json, code, base } = reading.peek() ?? {}
  if (!manifest || !json || code === undefined) return
  // The one it replaces stops, and starts again as the new one, with the rights granted now.
  stop(manifest.name)
  await app.fs.write(join(DIR, manifest.name, 'extension.json'), json)
  await app.fs.write(join(DIR, manifest.name, manifest.main), code)
  await refresh()
  await updateSettings(/** @type {any} */ ({ extensions: { ...switches(), [manifest.name]: { on: true, from: base } } }))
  notify(t('extensions.added', { title: shownIn(manifest, locale.peek()).title }))
  go(manifest.name)
}

/** Turned on, it starts again, failed or not; its address and the rights taken back stay. @param {Manifest} manifest @param {boolean} on */
function turn(manifest, on) {
  const { failed, ...own } = switches()[manifest.name] ?? {}
  return updateSettings(/** @type {any} */ ({ extensions: { ...switches(), [manifest.name]: { ...own, on } } }))
}

/** Reads it again from where it came: the same, it says so; else its new version shows before it takes this one's place. @param {Manifest} manifest @param {string} from */
async function update(manifest, from) {
  await look(from)
  const { manifest: now, code, failed } = reading.peek() ?? {}
  if (failed) return notify(t(`extensions.error.${failed}`))
  if (now?.version !== manifest.version || code !== await app.fs.read(join(DIR, manifest.name, manifest.main))) return go('read')
  reading.value = null
  notify(t('extensions.current', { title: shownIn(manifest, locale.peek()).title }))
}

/** @param {Manifest} manifest */
async function remove(manifest) {
  stop(manifest.name)
  await app.fs.remove(join(DIR, manifest.name))
  const { [manifest.name]: gone, ...rest } = switches()
  await updateSettings(/** @type {any} */ ({ extensions: rest }))
  await refresh()
  go('')
}

/** Opens Jean again with no extension running, the way back when one gets in the way (D309). */
function once() {
  const url = new URL(location.href)
  url.searchParams.set('safe', '')
  location.assign(url)
}

// ─── The list and the pages ──────────────────────────────────────────────────

/** An extension's mark: the glyph of Jean's it names, else its first letter, on a colour of its own. @param {Manifest} manifest @param {string} title */
const mark = (manifest, title) => html`<span class="item-icon extensions-mark is-${[...manifest.name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 8}" aria-hidden="true">${manifest.icon
  && Object.hasOwn(icons, manifest.icon) ? icons[/** @type {keyof typeof icons} */ (manifest.icon)] : [...title][0]?.toLocaleUpperCase()}</span>`

/** The strongest thing it may do, in a word: let actions go ahead, else see the conversations. @param {Manifest} manifest */
const strongest = (manifest) => (granted(manifest, 'loosen') ? html`<span class="data-state is-wait">${t('extensions.skips')}</span>`
  : granted(manifest, 'watch') ? html`<span class="data-state">${t('extensions.sees')}</span>` : nothing)

/** Its version, who made it and where from. @param {Manifest} manifest @param {string} [from] */
const about = (manifest, from) => [manifest.version && t('extensions.version', { version: manifest.version }), manifest.author && t('extensions.by', { author: manifest.author }),
  from && t('extensions.from', { site: siteOf(from) })].filter(Boolean).join(' · ')

/** A line that waits for the user, with what to do. @param {string} text @param {string} label @param {() => unknown} run */
const wait = (text, label, run) => html`<div class="extensions-wait" role="status"><p dir="auto">${text}</p><button class="button primary" @click=${run}>${label}</button></div>`

/** The way back, to the list or Add an extension. @param {string} to */
const back = (to, label = t('cap.extensions.name')) => html`<button class="back button subtle" @click=${() => go(to)}>${icons.back} ${label}</button>`

/** Settings' Extensions: the list, or the page open. */
export function section() {
  const open = pageOpen()
  const manifest = installed.value.find((one) => one.name === open)
  return manifest ? page(manifest) : open === 'read' && reading.value?.manifest ? read(reading.value)
    : open === 'add' ? html`${back('')}<header class="data-head"><div><h2 tabindex="-1">${t('extensions.adding')}</h2><p class="lede">${t('extensions.addText', { name })}</p></div></header>${adding()}` : listed()
}

/** The line, or what waits for the user; the extensions, each opening its page, and the way to open Jean with none; with none, the ways to add one. */
function listed() {
  const failed = installed.value.find((manifest) => switches()[manifest.name]?.failed)
  return html`<header class="data-head"><h2>${t('cap.extensions.name')}</h2>${installed.value.length ? html`<button class="button" @click=${() => go('add')}>${icons.plus} ${t('extensions.adding')}</button>` : nothing}</header>
    ${safe.value ? wait(t('extensions.safe'), t('extensions.leaveSafe'), leaveSafe) : failed ? wait(t('extensions.off', { title: shownIn(failed, locale.value).title }), t('extensions.again'), () => turn(failed, true))
      : html`<p class="lede">${t('extensions.text')}</p>`}
    ${!installed.value.length ? adding() : html`<ul class="list data-rows extensions">${installed.value.map(row)}</ul>
      ${safe.value ? nothing : html`<ul class="list data-rows"><li><button class="item" @click=${once}><span class="item-icon">${icons.shield}</span>
        <span class="item-text"><strong>${t('extensions.once', { name })}</strong><small>${t('extensions.onceText')}</small></span>${icons.chevron}</button></li></ul>`}`}`
}

/** An extension's row: its mark, title and few words, or that it kept failing; the most it may do; its switch, or Paused in safe mode. @param {Manifest} manifest */
function row(manifest) {
  const { title, description } = shownIn(manifest, locale.value)
  const { on, failed } = switches()[manifest.name] ?? {}
  return html`<li><button class="item" data-extension=${manifest.name} @click=${() => go(manifest.name)}>${mark(manifest, title)}
      <span class="item-text"><strong dir="auto">${title}</strong><small dir="auto" class=${failed ? 'is-error' : ''}>${failed ? t('extensions.failing') : description}</small></span>
      ${strongest(manifest)}${icons.chevron}</button>
    ${safe.value ? html`<span class="data-state">${t('extensions.paused')}</span>` : html`<input type="checkbox" class="switch" role="switch" aria-label=${title} .checked=${on === true}
      @change=${(/** @type {Event} */ e) => turn(manifest, /** @type {HTMLInputElement} */ (e.target).checked)}>`}</li>`
}

/** What it asks, or may do: each right in plain words, with its switch once added; letting actions go ahead marked apart. @param {Manifest} manifest @param {boolean} added */
const rights = (manifest, added) => html`<section><h3>${t(added ? 'extensions.may' : 'extensions.asks', { name })}</h3>${manifest.rights.length
  ? html`<ul class="rules extensions-rights">${manifest.rights.map((right) => html`<li class="setting ${right === 'loosen' ? 'is-loose' : ''}"><div>
    <span class="rule-kind">${t(`extensions.right.${right}`)}</span>${right === 'loosen' ? html`<span class="data-state is-wait">${t('extensions.skips')}</span>` : nothing}${right === 'watch' || right === 'loosen' ? html`<p class="muted small">${t(`extensions.rightText.${right}`)}</p>` : nothing}</div>
    ${added ? html`<input type="checkbox" class="switch" role="switch" aria-label=${t(`extensions.right.${right}`)} .checked=${granted(manifest, right)}
      @change=${(/** @type {Event} */ e) => take(manifest, right, !(/** @type {HTMLInputElement} */ (e.target).checked))}>` : nothing}</li>`)}</ul>`
  : html`<p class="muted small">${t('extensions.nothing')}</p>`}</section>
  <section><h3>${t('extensions.cant')}</h3><ul class="extensions-cant">${CANT.map((what) => html`<li>${icons.close}${t(`extensions.cant.${what}`)}</li>`)}</ul></section>`

/** An extension's page: where it comes from and its switch, its maker's words, what it shows here, what it may do, then its version and Remove. @param {Manifest} manifest */
function page(manifest) {
  const { title, description } = shownIn(manifest, locale.value)
  const { on, from } = switches()[manifest.name] ?? {}
  const host = running.value.get(manifest.name)
  return html`${back('')}
    <header class="data-head">${mark(manifest, title)}<div><h2 dir="auto" tabindex="-1">${title}</h2><p class="lede" dir="auto">${about(manifest, from)}</p></div>
      ${safe.value ? html`<span class="data-state">${t('extensions.paused')}</span>` : html`<input type="checkbox" class="switch" role="switch" aria-label=${title} .checked=${on === true}
        @change=${(/** @type {Event} */ e) => turn(manifest, /** @type {HTMLInputElement} */ (e.target).checked)}>`}</header>
    <p class="extensions-words" dir="auto">${description}</p>
    ${host?.slots.includes('settings') ? html`<section class="extensions-own" aria-label=${t('extensions.shownBy', { title })}><p class="extensions-label">${t('extensions.shownBy', { title })}</p>${drawn(host, 'settings', {})}</section>` : nothing}
    ${rights(manifest, true)}
    ${removing.value === manifest.name ? html`<div class="extensions-wait" role="alert"><p dir="auto">${t('extensions.confirmRemove', { title })}</p>
      <button class="button primary danger" @click=${() => remove(manifest)}>${icons.trash} ${t('action.remove')}</button><button class="button subtle" @click=${() => { removing.value = '' }}>${t('extensions.cancel')}</button></div>`
    : html`<div class="row extensions-foot">${from ? html`<button class="button subtle" @click=${() => update(manifest, from)}>${icons.sync} ${t('extensions.update')}</button>` : nothing}
      <button class="button subtle danger" @click=${() => { removing.value = manifest.name }}>${icons.trash} ${t('action.remove')}</button></div>`}`
}

/** An extension read before it is added: who made it and where from, its maker's words apart from what Jean will let it do, Add it, and its code. @param {NonNullable<typeof reading.value>} state */
function read({ manifest, code, base }) {
  if (!manifest) return nothing
  const { title, description } = shownIn(manifest, locale.value)
  // A new version goes back to the extension's page, one to add to Add an extension.
  return html`${installed.value.some((one) => one.name === manifest.name) ? back(manifest.name, title) : back('add', t('extensions.adding'))}
    <header class="data-head">${mark(manifest, title)}<div><h2 dir="auto" tabindex="-1">${title}</h2><p class="lede" dir="auto">${about(manifest, base)}</p></div></header>
    <section><h3>${t('extensions.words')}</h3><p class="extensions-words" dir="auto">${description}</p></section>
    ${rights(manifest, false)}
    <div class="row extensions-foot"><span class="row"><button class="button primary" @click=${add}>${t('extensions.add')}</button>
      <button class="button subtle" @click=${() => go(installed.value.some((one) => one.name === manifest.name) ? manifest.name : 'add')}>${t('extensions.cancel')}</button></span></div>
    <details class="extensions-code"><summary>${t('extensions.code')}</summary><pre dir="ltr"><code>${code}</code></pre></details>`
}

/** The ready-made extensions policy names, each read once, those added marked so; then an address, and what is wrong with it. */
function adding() {
  const addresses = /** @type {string[]} */ (app.policy.extensions?.ready ?? [])
  if (!ready.value && addresses.length) {
    ready.value = []
    Promise.all(addresses.map(async (address) => {
      const base = baseOf(address) ?? ''
      return /** @type {[string, Manifest | null]} */ ([base, await fetch(new URL('extension.json', base)).then((response) => response.text()).then(readManifest).catch(() => null)])
    })).then((read) => { ready.value = read })
  }
  const state = reading.value
  return html`${ready.value?.some(([, manifest]) => manifest) ? html`<section><h3>${t('extensions.readyMade')}</h3><ul class="services ready-made">${ready.value.map(([base, manifest]) => {
      if (!manifest) return nothing
      const { title, description } = shownIn(manifest, locale.value)
      const had = installed.value.some((one) => one.name === manifest.name)
      return html`<li><button class="service" @click=${() => (had ? go(manifest.name) : readFrom(base))}>${mark(manifest, title)}<span><strong dir="auto">${title}</strong><small dir="auto">${description}</small></span>
        ${had ? html`<span class="extensions-had">${icons.check}<span class="visually-hidden">${t('extensions.had')}</span></span>` : icons.plus}</button></li>`
    })}</ul></section>` : nothing}
    <section><h3 id="extensions-address">${t('extensions.address')}</h3>
      <form class="row extensions-address" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); readFrom(String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get('address') ?? '')) }}>
        <input name="address" dir="ltr" inputmode="url" autocomplete="off" spellcheck="false" aria-labelledby="extensions-address" aria-describedby="extensions-hint">
        <button class="button">${t('extensions.look')}</button>
      </form>
      ${state && !state.manifest ? html`<p class=${state.failed ? 'status is-error' : 'muted'} role=${state.failed ? 'alert' : 'status'}>${t(state.failed ? `extensions.error.${state.failed}` : 'extensions.reading')}</p>`
        : html`<p class="hint" id="extensions-hint">${t('extensions.addHint')}</p>`}
    </section>`
}
