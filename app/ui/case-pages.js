// Settings' Capabilities (D127, D316, D540): how many capabilities are found, over a bar, and the one thing most worth
// saying; then seven groups by what each is for, a row a capability, lit with what it does once found, a dashed
// silhouette saying how it comes until then, and a word only where it isn't simply on: Off, a download, Not set up, or
// whose it is when the organisation or a parent turned it on. Each row opens its page, settings/capabilities/<id>
// (D509): what it does, how it came or comes, then Turn on, its download, Open where it is, or Turn off, asked there
// first (D433). Loaded the first time it shows; its strings are a part of their own (locales/case/).
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { app, effective, CITED, rememberUnlocked } from './state.js'
import { unlock, isDenied, loaded, configureCapabilities, SIZES, WEIGHTS } from './caps.js'
import { CATALOGUE, FINDABLE, SEARCHABLE, BROWSED, STEPPED, everywhere, accept, begin, unlockAll } from './discovery.js'
import { openSettings, ROOM_ICONS, lockedBy, pageOpen } from './dialogs.js'
import { saveSettings } from '../core/settings.js'
import { BRAND } from '../brand.js'
import { t, formatBytes, useStrings } from '../core/i18n.js'
import { icons } from './menu-icons.js'
import { styleSheet } from './sheet.js'

await Promise.all([useStrings('case'), styleSheet(new URL('data-pages.css', import.meta.url)), styleSheet(new URL('case-pages.css', import.meta.url))])

/** The groups, by what each capability is for, each in the case's order (CATALOGUE). */
const GROUPS = /** @type {Record<string, string[]>} */ ({
  files: ['files', 'made', 'documents', 'tables', 'designs', 'folders', 'meaning', 'pictures'], remember: ['memory', 'projects', 'find', 'names'],
  again: ['skills', 'routines', 'flows'], web: ['search', 'browser', 'connections', 'since', 'extensions'],
  bigger: ['computer', 'machine', 'helpers', 'check', 'reflexes', 'brain-local'], voice: ['live', 'reader', 'notifications'], keep: ['backup', 'share', 'sync', 'lock'],
})
/** A capability's group. @param {string} id */
const groupOf = (id) => Object.keys(GROUPS).find((group) => GROUPS[group].includes(id)) ?? 'bigger'

/** Where a capability found leads: its section of Settings, a page of one, search, or the browser. */
const OPENS = /** @type {Record<string, () => void>} */ ({
  memory: () => openSettings('you'), skills: () => openSettings('skills'), routines: () => openSettings('routines'),
  connections: () => openSettings('connections'), search: () => openSettings('search'), extensions: () => openSettings('extensions'), computer: () => openSettings('computer'), pictures: () => import('../caps/pictures/pictures.js').then((module) => openSettings(module.paged() ? 'brains/pictures' : 'brains')),
  share: () => openSettings('data/links'), machine: () => import('../caps/machine/machine.js').then((module) => module.show()), sync: () => openSettings('data/sync'), lock: () => openSettings('data/lock'),
  'brain-local': () => openSettings('brains/device'), notifications: () => openSettings('general'), reader: () => openSettings('general/natural'), find: () => { app.dialog.value = 'find' },
  browser: () => { app.dialog.value = null; import('../caps/browser/browser.js').then((module) => module.show()) },
  flows: () => { app.dialog.value = null; import('../caps/flows/flows.js').then((module) => module.here()) },
  folders: () => { app.dialog.value = null; import('../caps/folders/folders.js').then((module) => module.choose()) },
})
/** Those found by counting, as ui/discovery.js counts them: how far along, out of how many. */
const COUNTED = /** @type {Record<string, () => number[]>} */ ({ reflexes: () => [everywhere.value, 2], backup: () => [everywhere.value, 3],
  find: () => [everywhere.value, FINDABLE], lock: () => [everywhere.value, FINDABLE], search: () => [everywhere.value, SEARCHABLE],
  live: () => [effective.value.settings.dictated ?? 0, 3], check: () => [effective.value.settings.cited ?? 0, CITED],
  browser: () => [effective.value.settings.browsed ?? 0, BROWSED], flows: () => [effective.value.settings.stepped ?? 0, STEPPED] })

/** What the user turned off (D433). */
const turnedOff = () => app.settings.value.off ?? []
/** What the organisation, or a parent in a child's profile, turned on: only they turn it off (D540). @param {string} id */
const theirs = (id) => (app.policy.capabilities?.preUnlock ?? []).includes(id)
/** Turn off asked in its page: the capability it is asked for. */
const asking = signal('')
// The page open (pageOpen()): a capability's id, or '' for the list.

/** Opens the list ('') or a capability's page, the keyboard on its title, or back on the list on the row it came from. @param {string} to */
function go(to) {
  const from = pageOpen()
  asking.value = ''
  app.section.value = to ? `capabilities/${to}` : 'capabilities'
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '.data-head h2' : `[data-cap="${from}"]`))?.focus())
}

/**
 * How a capability stands: still to find; off, still found (D433); on but waiting for its download or for the user to set it
 * up (a lock, a folder, the brain); turned on by the organisation or a parent, which only they turn off; or simply on.
 * @param {string} id @returns {'todo' | 'off' | 'download' | 'unset' | 'theirs' | 'on'}
 */
function stateOf(id) {
  if (turnedOff().includes(id)) return 'off'
  const capability = loaded.value.get(id)
  if (!capability) return 'todo'
  if (WEIGHTS.includes(id) && !capability.ready) return 'download'
  if (capability.waiting?.()) return 'unset'
  return theirs(id) ? 'theirs' : 'on'
}
/** What turning it on downloads, said. @param {string} id */
const size = (id) => formatBytes(SIZES[id] ?? 0)
/** Its words, the user's assistant named and its download said. @param {string} id */
const text = (id) => t(`cap.${id}.text`, { name: BRAND.name, size: size(id) })

/** How far along one found by counting is: a dot a step, said in words. @param {string} id */
function dots(id) {
  const [done = 0, goal = 0] = COUNTED[id]?.() ?? []
  return goal ? html`<span class="case-dots" role="img" aria-label=${t('case.so', { done: Math.min(done, goal), goal })}>${Array.from({ length: goal }, (_, i) => html`<i class=${i < done ? 'is-lit' : ''}></i>`)}</span>` : nothing
}

/** Its word at the row's end and under its page's title, where it isn't simply on. @param {string} id @param {ReturnType<typeof stateOf>} state */
const word = (id, state) => state === 'off' ? html`<span class="data-state">${t('collection.off')}</span>`
  : state === 'download' ? html`<span class="data-state is-wait">${t('case.download', { size: size(id) })}</span>`
  : state === 'unset' ? html`<span class="data-state is-wait">${t('case.unset')}</span>`
  : state === 'theirs' ? html`<span class="data-state">${icons.lock}${lockedBy()}</span>` : nothing

/** A capability's row: lit with what it does once found, a silhouette saying how it comes until then; the whole of it opens its page. @param {string} id */
function row(id) {
  const state = stateOf(id)
  const found = state !== 'todo'
  return html`<li class=${`is-${state}`}><button class="item" data-cap=${id} @click=${() => go(id)}>
    <span class="item-icon">${icons[ROOM_ICONS[id]]}</span>
    <span class="item-text"><strong>${t(`cap.${id}.name`)}</strong><small>${found ? text(id) : html`${t(`cap.${id}.hint`)}${dots(id)}`}</small></span>
    ${word(id, state)}${icons.chevron}</button></li>`
}

// ─── Turning on and off ──────────────────────────────────────────────────────

/**
 * Turns a capability on, early or again (D433): allowed again if it was turned off, its download asked for if it has one, else
 * loaded and led to what it begins, a section of Settings at once (D134); Settings closed while it loaded, it leads nowhere.
 * @param {string} id
 */
async function turnOn(id) {
  if (app.settings.peek().off?.includes(id)) {
    const settings = { ...app.settings.peek(), off: app.settings.peek().off?.filter((other) => other !== id) }
    await saveSettings(app.fs, settings)
    app.settings.value = settings
  }
  configureCapabilities({ deny: [...app.policy.capabilities?.deny ?? [], ...turnedOff()], remember: rememberUnlocked })
  if (WEIGHTS.includes(id)) return accept(id)
  if (!(await unlock(id)) || app.dialog.peek() !== 'settings') return
  if (id === 'brain-local') openSettings('brains/device')
  else if (id === 'connections') openSettings('connections')
  else begin(id)
}

/**
 * Turns a capability found off (D433), written before it is said, since the page then goes: its module can't be unloaded, so
 * ui/update.js opens it afresh where it was, on its page, once nothing is under way. Still found, it is denied from then on.
 * @param {string} id
 */
async function turnOff(id) {
  const settings = { ...app.settings.peek(), off: [...app.settings.peek().off ?? [], id] }
  await saveSettings(app.fs, settings)
  app.settings.value = settings
  asking.value = ''
}

/** Whether it turns off here: not what is always there (Things Jean made), nor what is undone where it is set (a lock, the brain on this device), nor what the organisation or a parent turned on, nor anything in a private window, which opening afresh would empty. @param {string} id */
const offable = (id) => !['made', 'lock', 'brain-local'].includes(id) && !theirs(id) && !app.ephemeral.value

// ─── The list and the pages ──────────────────────────────────────────────────

/** A capability's page: what it does and how it stands, then how it came or comes, then what it offers now. @param {string} id */
function page(id) {
  const state = stateOf(id)
  const found = state !== 'todo'
  const name = t(`cap.${id}.name`)
  const waiting = app.offer.value?.id === id
  const lede = found ? (state === 'off' ? t('collection.off') : t('collection.on')) : t('case.unfound')
  return html`<button class="back button subtle" @click=${() => go('')}>${icons.back} ${t('settings.capabilities')}</button>
    <header class="data-head case-head"><span class=${`item-icon is-${state}`}>${icons[ROOM_ICONS[id]]}</span>
      <div><h2 tabindex="-1">${name}</h2><p class="lede">${lede} · ${t(`case.group.${groupOf(id)}`)}</p></div>
      ${['on', 'theirs'].includes(state) && OPENS[id] ? html`<button class="button" @click=${OPENS[id]}>${t('collection.open')}</button>` : nothing}</header>
    <p class="case-words">${text(id)}</p>
    ${state === 'download' && !waiting ? html`<div class="case-wait"><p>${t('case.download', { size: size(id) })}</p>
      <button class="button primary" @click=${() => accept(id)}>${icons.download} ${t(`cap.${id}.yes`, { size: size(id) })}</button></div>` : nothing}
    ${state === 'unset' ? html`<div class="case-wait"><p>${t('case.unset')}</p><button class="button primary" @click=${OPENS[id]}>${t('collection.open')}</button></div>` : nothing}
    ${state === 'theirs' ? html`<p class="hint">${icons.lock} ${lockedBy()}</p>` : nothing}
    ${state === 'off' ? html`<p class="hint">${t('case.offText', { name: BRAND.name })}</p>` : nothing}
    <section><h3>${t(found ? 'case.came' : 'collection.how')}</h3><p>${t(`cap.${id}.hint`)}</p>${found ? nothing : dots(id)}</section>
    ${!found || state === 'off' ? html`<div class="row">${waiting ? nothing : html`<button class="button primary" @click=${() => turnOn(id)}>${WEIGHTS.includes(id)
      ? html`${icons.download} ${t(`cap.${id}.yes`, { size: size(id) })}` : t('collection.turnOn')}</button>`}</div>`
    : !offable(id) ? nothing
    : asking.value === id ? html`<div class="case-wait" role="alert"><p>${t('case.ask', { cap: name, name: BRAND.name })}</p>
      <button class="button subtle" @click=${() => { asking.value = '' }}>${t('case.cancel')}</button><button class="button primary" @click=${() => turnOff(id)}>${t('collection.turnOff')}</button></div>`
    : html`<div class="row case-foot"><button class="button subtle" @click=${() => { asking.value = id }}>${t('collection.turnOff')}</button></div>`}`
}

/** Settings' Capabilities: the list, or a capability's page. */
export function section() {
  const ids = CATALOGUE.filter((id) => !isDenied(id) || turnedOff().includes(id))
  const open = pageOpen()
  if (ids.includes(open)) return page(open)
  const states = ids.map(stateOf)
  const count = states.filter((state) => state !== 'todo').length
  const waiting = states.filter((state) => state === 'download' || state === 'unset').length
  const said = waiting ? t('case.waiting', { count: waiting }) : count < ids.length ? t('case.rest') : ''
  return html`<header class="data-head"><h2>${t('settings.capabilities')}</h2></header>
    <p class="lede"><strong>${t('collection.count', { count, total: ids.length })}</strong> ${said}</p>
    <div class="case-bar"><meter min="0" max=${ids.length} value=${count} aria-hidden="true"></meter></div>
    ${Object.entries(GROUPS).map(([group, members]) => {
      const shown = members.filter((id) => ids.includes(id))
      return shown.length ? html`<section class="case-group" aria-labelledby=${`case-${group}`}><h3 id=${`case-${group}`}>${t(`case.group.${group}`)}
        <span>${t('case.of', { count: shown.filter((id) => stateOf(id) !== 'todo').length, total: shown.length })}</span></h3>
        <ul class="list data-rows case">${shown.map(row)}</ul></section>` : nothing
    })}
    ${count < ids.length ? html`<div class="row case-all"><button class="button" @click=${unlockAll}>${t('collection.all')}</button><span class="hint">${t('case.allHint')}</span></div>` : nothing}`
}
