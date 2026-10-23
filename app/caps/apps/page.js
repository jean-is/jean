// Settings' Apps (D296, D535): the apps added, each a row with its mark, its few words, the strongest thing it may do in a
// word and its switch, opening its page, apps/<name>: where it comes from, its maker's words, what it shows here, a switch
// for each right it holds, what it can't do, Look for a new version and Remove, asked in the page. apps/add holds the ready-made apps policy names and an address, each read on apps/read before it is added. Safe
// mode, or an app that kept failing, takes the line under the title. Loaded the first time Settings shows Apps.
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
import { DIR, LARGEST, installed, running, safe, switches, granted, refresh, stop, drawn, leaveSafe, take } from './apps.js'

// Your data's heads and rows, as Approvals has them.
await styleSheet(new URL('../../ui/data-pages.css', import.meta.url))

/** @typedef {import('./manifest.js').Manifest} Manifest */

/** An app read from an address, shown before it is added. */
const reading = signal(/** @type {{ manifest?: Manifest, json?: string, code?: string, base?: string, failed?: string } | null} */ (null))
/** The app whose Remove is being asked about, in its page. */
const removing = signal('')
/** The ready-made apps policy names, read once Add an app shows: an address's files, and its manifest unless it can't be read. */
const ready = signal(/** @type {[string, Manifest | null][] | null} */ (null))
/** What can't reach an app, whatever it asks. */
const CANT = ['internet', 'files', 'others']
const name = BRAND.name

/** The page open: '' for the list, add, read or an app's name. */
const pageOpen = () => app.section.value.split('/')[1] ?? ''

/** Opens the list ('') or a page, the keyboard on its title, or back on the list on the app's row. @param {string} to */
function go(to) {
  const from = pageOpen()
  if (to !== 'read') reading.value = null
  removing.value = ''
  app.section.value = to ? `apps/${to}` : 'apps'
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '.data-head h2[tabindex]' : `[data-app="${from}"]`))?.focus())
}

// ─── Adding, changing, removing ──────────────────────────────────────────────

/** Reads an app from an address, then shows it before it is added; what is wrong is said under the address. @param {string} address */
async function look(address) {
  const base = baseOf(address.trim())
  if (!base) return void (reading.value = { failed: 'address' })
  reading.value = { base }
  try {
    const json = await fetch(new URL('app.json', base)).then((response) => (response.ok ? response.text() : Promise.reject(new Error('fetch'))))
    const manifest = readManifest(json)
    const code = await fetch(new URL(manifest.main, base)).then((response) => (response.ok ? response.text() : Promise.reject(new Error('fetch'))))
    if (code.length > LARGEST) throw new Error('size')
    reading.value = { manifest, json, code, base }
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    reading.value = { base, failed: ['json', 'format', 'name', 'main', 'rights', 'size'].includes(code) ? code : 'fetch' }
  }
}

/** Reads an app, then opens its page before it is added. @param {string} address */
const readFrom = (address) => look(address).then(() => reading.peek()?.manifest && go('read'))

/** Adds the app read, as it came, and turns it on: added again, it takes the earlier one's place, with every right it asks, and keeps its data. */
async function add() {
  const { manifest, json, code, base } = reading.peek() ?? {}
  if (!manifest || !json || code === undefined) return
  // The one it replaces stops, and starts again as the new one, with the rights granted now.
  stop(manifest.name)
  await app.fs.write(join(DIR, manifest.name, 'app.json'), json)
  await app.fs.write(join(DIR, manifest.name, manifest.main), code)
  await refresh()
  await updateSettings(/** @type {any} */ ({ apps: { ...switches(), [manifest.name]: { on: true, from: base } } }))
  notify(t('apps.added', { title: shownIn(manifest, locale.peek()).title }))
  go(manifest.name)
}

/** Turned on, it starts again, failed or not; its address and the rights taken back stay. @param {Manifest} manifest @param {boolean} on */
function turn(manifest, on) {
  const { failed, ...own } = switches()[manifest.name] ?? {}
  return updateSettings(/** @type {any} */ ({ apps: { ...switches(), [manifest.name]: { ...own, on } } }))
}

/** Reads it again from where it came: the same, it says so; else its new version shows before it takes this one's place. @param {Manifest} manifest @param {string} from */
async function update(manifest, from) {
  await look(from)
  const { manifest: now, code, failed } = reading.peek() ?? {}
  if (failed) return notify(t(`apps.error.${failed}`))
  if (now?.version !== manifest.version || code !== await app.fs.read(join(DIR, manifest.name, manifest.main))) return go('read')
  reading.value = null
  notify(t('apps.current', { title: shownIn(manifest, locale.peek()).title }))
}

/** @param {Manifest} manifest */
async function remove(manifest) {
  stop(manifest.name)
  await app.fs.remove(join(DIR, manifest.name))
  const { [manifest.name]: gone, ...rest } = switches()
  await updateSettings(/** @type {any} */ ({ apps: rest }))
  await refresh()
  go('')
}

/** Opens Jean again with no app running, the way back when one gets in the way (D309). */
function once() {
  const url = new URL(location.href)
  url.searchParams.set('safe', '')
  location.assign(url)
}

// ─── The list and the pages ──────────────────────────────────────────────────

/** An app's mark: the glyph of Jean's it names, else its first letter, on a colour of its own. @param {Manifest} manifest @param {string} title */
const mark = (manifest, title) => html`<span class="item-icon apps-mark is-${[...manifest.name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 8}" aria-hidden="true">${manifest.icon
  && Object.hasOwn(icons, manifest.icon) ? icons[/** @type {keyof typeof icons} */ (manifest.icon)] : [...title][0]?.toLocaleUpperCase()}</span>`

/** The strongest thing it may do, in a word: let actions go ahead, else see the conversations. @param {Manifest} manifest */
const strongest = (manifest) => (granted(manifest, 'loosen') ? html`<span class="data-state is-wait">${t('apps.skips')}</span>`
  : granted(manifest, 'watch') ? html`<span class="data-state">${t('apps.sees')}</span>` : nothing)

/** Its version, who made it and where from. @param {Manifest} manifest @param {string} [from] */
const about = (manifest, from) => [manifest.version && t('apps.version', { version: manifest.version }), manifest.author && t('apps.by', { author: manifest.author }),
  from && t('apps.from', { site: siteOf(from) })].filter(Boolean).join(' · ')

/** A line that waits for the user, with what to do. @param {string} text @param {string} label @param {() => unknown} run */
const wait = (text, label, run) => html`<div class="apps-wait" role="status"><p dir="auto">${text}</p><button class="button primary" @click=${run}>${label}</button></div>`

/** The way back, to the list or Add an app. @param {string} to */
const back = (to, label = t('cap.apps.name')) => html`<button class="back button subtle" @click=${() => go(to)}>${icons.back} ${label}</button>`

/** Settings' Apps: the list, or the page open. */
export function section() {
  const open = pageOpen()
  const manifest = installed.value.find((one) => one.name === open)
  return manifest ? page(manifest) : open === 'read' && reading.value?.manifest ? read(reading.value)
    : open === 'add' ? html`${back('')}<header class="data-head"><div><h2 tabindex="-1">${t('apps.adding')}</h2><p class="lede">${t('apps.addText', { name })}</p></div></header>${adding()}` : listed()
}

/** The line, or what waits for the user; the apps, each opening its page, and the way to open Jean with none; with none, the ways to add one. */
function listed() {
  const failed = installed.value.find((manifest) => switches()[manifest.name]?.failed)
  return html`<header class="data-head"><h2>${t('cap.apps.name')}</h2>${installed.value.length ? html`<button class="button" @click=${() => go('add')}>${icons.plus} ${t('apps.adding')}</button>` : nothing}</header>
    ${safe.value ? wait(t('apps.safe'), t('apps.leaveSafe'), leaveSafe) : failed ? wait(t('apps.off', { title: shownIn(failed, locale.value).title }), t('apps.again'), () => turn(failed, true))
      : html`<p class="lede">${t('apps.text')}</p>`}
    ${!installed.value.length ? adding() : html`<ul class="list data-rows apps">${installed.value.map(row)}</ul>
      ${safe.value ? nothing : html`<ul class="list data-rows"><li><button class="item" @click=${once}><span class="item-icon">${icons.shield}</span>
        <span class="item-text"><strong>${t('apps.once', { name })}</strong><small>${t('apps.onceText')}</small></span>${icons.chevron}</button></li></ul>`}`}`
}

/** An app's row: its mark, title and few words, or that it kept failing; the most it may do; its switch, or Paused in safe mode. @param {Manifest} manifest */
function row(manifest) {
  const { title, description } = shownIn(manifest, locale.value)
  const { on, failed } = switches()[manifest.name] ?? {}
  return html`<li><button class="item" data-app=${manifest.name} @click=${() => go(manifest.name)}>${mark(manifest, title)}
      <span class="item-text"><strong dir="auto">${title}</strong><small dir="auto" class=${failed ? 'is-error' : ''}>${failed ? t('apps.failing') : description}</small></span>
      ${strongest(manifest)}${icons.chevron}</button>
    ${safe.value ? html`<span class="data-state">${t('apps.paused')}</span>` : html`<input type="checkbox" class="switch" role="switch" aria-label=${title} .checked=${on === true}
      @change=${(/** @type {Event} */ e) => turn(manifest, /** @type {HTMLInputElement} */ (e.target).checked)}>`}</li>`
}

/** What it asks, or may do: each right in plain words, with its switch once added; letting actions go ahead marked apart. @param {Manifest} manifest @param {boolean} added */
const rights = (manifest, added) => html`<section><h3>${t(added ? 'apps.may' : 'apps.asks', { name })}</h3>${manifest.rights.length
  ? html`<ul class="rules apps-rights">${manifest.rights.map((right) => html`<li class="setting ${right === 'loosen' ? 'is-loose' : ''}"><div>
    <span class="rule-kind">${t(`apps.right.${right}`)}</span>${right === 'loosen' ? html`<span class="data-state is-wait">${t('apps.skips')}</span>` : nothing}${right === 'watch' || right === 'loosen' ? html`<p class="muted small">${t(`apps.rightText.${right}`)}</p>` : nothing}</div>
    ${added ? html`<input type="checkbox" class="switch" role="switch" aria-label=${t(`apps.right.${right}`)} .checked=${granted(manifest, right)}
      @change=${(/** @type {Event} */ e) => take(manifest, right, !(/** @type {HTMLInputElement} */ (e.target).checked))}>` : nothing}</li>`)}</ul>`
  : html`<p class="muted small">${t('apps.nothing')}</p>`}</section>
  <section><h3>${t('apps.cant')}</h3><ul class="apps-cant">${CANT.map((what) => html`<li>${icons.close}${t(`apps.cant.${what}`)}</li>`)}</ul></section>`

/** An app's page: where it comes from and its switch, its maker's words, what it shows here, what it may do, then its version and Remove. @param {Manifest} manifest */
function page(manifest) {
  const { title, description } = shownIn(manifest, locale.value)
  const { on, from } = switches()[manifest.name] ?? {}
  const host = running.value.get(manifest.name)
  return html`${back('')}
    <header class="data-head">${mark(manifest, title)}<div><h2 dir="auto" tabindex="-1">${title}</h2><p class="lede" dir="auto">${about(manifest, from)}</p></div>
      ${safe.value ? html`<span class="data-state">${t('apps.paused')}</span>` : html`<input type="checkbox" class="switch" role="switch" aria-label=${title} .checked=${on === true}
        @change=${(/** @type {Event} */ e) => turn(manifest, /** @type {HTMLInputElement} */ (e.target).checked)}>`}</header>
    <p class="apps-words" dir="auto">${description}</p>
    ${host?.slots.includes('settings') ? html`<section class="apps-own" aria-label=${t('apps.shownBy', { title })}><p class="apps-label">${t('apps.shownBy', { title })}</p>${drawn(host, 'settings', {})}</section>` : nothing}
    ${rights(manifest, true)}
    ${removing.value === manifest.name ? html`<div class="apps-wait" role="alert"><p dir="auto">${t('apps.confirmRemove', { title })}</p>
      <button class="button primary danger" @click=${() => remove(manifest)}>${icons.trash} ${t('action.remove')}</button><button class="button subtle" @click=${() => { removing.value = '' }}>${t('apps.cancel')}</button></div>`
    : html`<div class="row apps-foot">${from ? html`<button class="button subtle" @click=${() => update(manifest, from)}>${icons.sync} ${t('apps.update')}</button>` : nothing}
      <button class="button subtle danger" @click=${() => { removing.value = manifest.name }}>${icons.trash} ${t('action.remove')}</button></div>`}`
}

/** An app read before it is added: who made it and where from, its maker's words apart from what Jean will let it do, Add it, and its code. @param {NonNullable<typeof reading.value>} state */
function read({ manifest, code, base }) {
  if (!manifest) return nothing
  const { title, description } = shownIn(manifest, locale.value)
  // A new version goes back to the app's page, one to add to Add an app.
  return html`${installed.value.some((one) => one.name === manifest.name) ? back(manifest.name, title) : back('add', t('apps.adding'))}
    <header class="data-head">${mark(manifest, title)}<div><h2 dir="auto" tabindex="-1">${title}</h2><p class="lede" dir="auto">${about(manifest, base)}</p></div></header>
    <section><h3>${t('apps.words')}</h3><p class="apps-words" dir="auto">${description}</p></section>
    ${rights(manifest, false)}
    <div class="row apps-foot"><span class="row"><button class="button primary" @click=${add}>${t('apps.add')}</button>
      <button class="button subtle" @click=${() => go(installed.value.some((one) => one.name === manifest.name) ? manifest.name : 'add')}>${t('apps.cancel')}</button></span></div>
    <details class="apps-code"><summary>${t('apps.code')}</summary><pre dir="ltr"><code>${code}</code></pre></details>`
}

/** The ready-made apps policy names, each read once, those added marked so; then an address, and what is wrong with it. */
function adding() {
  const addresses = /** @type {string[]} */ (app.policy.apps?.ready ?? [])
  if (!ready.value && addresses.length) {
    ready.value = []
    Promise.all(addresses.map(async (address) => {
      const base = baseOf(address) ?? ''
      return /** @type {[string, Manifest | null]} */ ([base, await fetch(new URL('app.json', base)).then((response) => response.text()).then(readManifest).catch(() => null)])
    })).then((read) => { ready.value = read })
  }
  const state = reading.value
  return html`${ready.value?.some(([, manifest]) => manifest) ? html`<section><h3>${t('apps.readyMade')}</h3><ul class="services ready-made">${ready.value.map(([base, manifest]) => {
      if (!manifest) return nothing
      const { title, description } = shownIn(manifest, locale.value)
      const had = installed.value.some((one) => one.name === manifest.name)
      return html`<li><button class="service" @click=${() => (had ? go(manifest.name) : readFrom(base))}>${mark(manifest, title)}<span><strong dir="auto">${title}</strong><small dir="auto">${description}</small></span>
        ${had ? html`<span class="apps-had">${icons.check}<span class="visually-hidden">${t('apps.had')}</span></span>` : icons.plus}</button></li>`
    })}</ul></section>` : nothing}
    <section><h3 id="apps-address">${t('apps.address')}</h3>
      <form class="row apps-address" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); readFrom(String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get('address') ?? '')) }}>
        <input name="address" dir="ltr" inputmode="url" autocomplete="off" spellcheck="false" aria-labelledby="apps-address" aria-describedby="apps-hint">
        <button class="button">${t('apps.look')}</button>
      </form>
      ${state && !state.manifest ? html`<p class=${state.failed ? 'status is-error' : 'muted'} role=${state.failed ? 'alert' : 'status'}>${t(state.failed ? `apps.error.${state.failed}` : 'apps.reading')}</p>`
        : html`<p class="hint" id="apps-hint">${t('apps.addHint')}</p>`}
    </section>`
}
