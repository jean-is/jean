// The drawer and settings dialogs (native <dialog>: focus trap and Escape for free), and the house
// of what Jean can do, in Settings.
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import {
  app, effective, setLocale, setRule, updateSettings, notify, loadModels,
  theme, setTheme, setLook, offeredLocales, CITED, SHORTCUTS, rememberUnlocked,
} from './state.js'
import { unlock, isDenied, loaded, slots, configureCapabilities, SIZES as BYTES, WEIGHTS } from './caps.js'
import { CATALOGUE, FINDABLE, SEARCHABLE, BROWSED, STEPPED, everywhere, accept, begin, unlockAll } from './discovery.js'
import { ulid } from '../core/ulid.js'
import { saveSettings } from '../core/settings.js'
import { BRAND } from '../brand.js'
import { RULE_KINDS, resolveRule } from '../core/rules.js'
import { PAGE_DEFAULTS, pageRights, site } from './csp.js'
import { t, locale, intlLocales, formatBytes, useStrings, languageName, preferredLocales } from '../core/i18n.js'
import { deviceVoices } from './voices.js'
import { rankVoices } from './language.js'
import { icons } from './menu-icons.js'
import { sidebarBody, keyNames, lookName } from './inbox.js'
import { findButton, placeToasts } from './shell.js'
import { dictation } from './dictation.js'
import { LOOKS, OWN, lookId, baseOf, offeredLooks, touched } from './looks.js'
import { FONTS, SIZES } from './touches.js'
import { styleSheet } from './sheet.js'

/** @typedef {import('../core/types.js').BrainConfig} BrainConfig */

// The dialogs' own strings and style sheet come with them (D97, D120): every module that shows a
// dialog imports this one. The sheet goes after ui/style.css, so its rules win a tie. Its lists to
// pick from have the chevron that all have (ui/select.css).
await Promise.all([useStrings('dialogs'), styleSheet('ui/dialogs.css'), styleSheet('ui/select.css')])

/** Whether each dialog was last told to be open. @type {WeakMap<HTMLDialogElement, boolean>} */
const told = new WeakMap()
/** What had the keyboard when each dialog opened. @type {WeakMap<HTMLDialogElement, globalThis.Element | null>} */
const before = new WeakMap()

/**
 * Opens or closes a dialog when app.dialog comes to name it or stops: a render meanwhile never
 * opens again one the browser closed (Escape) before its close event says so. Closed, the keyboard
 * goes back to what had it, as the browser does itself, except WebKit now and then when the dialog
 * goes without a transition (reduced motion): the page is still inert to it until the next frame.
 * Opened before the user did anything, as Settings is by the address a page loads with, the dialog
 * itself takes the keyboard rather than its close button, which a ring would show; Tab leads to it.
 * @param {Element} host @param {string} name
 */
export function syncDialog(host, name) {
  const dialog = host.querySelector('dialog')
  const open = app.dialog.value === name
  if (dialog && told.get(dialog) !== open) {
    told.set(dialog, open)
    if (open && !dialog.open) {
      before.set(dialog, document.activeElement)
      dialog.showModal()
      if (navigator.userActivation?.hasBeenActive === false) { dialog.tabIndex = -1; dialog.focus() }
    } else if (!open && dialog.open) {
      const back = before.get(dialog)
      const [start, end] = back instanceof HTMLTextAreaElement ? [back.selectionStart, back.selectionEnd] : []
      dialog.close()
      // Chromium gives the box the keyboard back with its caret at the start: it goes back where it was.
      if (back instanceof HTMLTextAreaElement && back === document.activeElement) back.setSelectionRange(start ?? 0, end ?? 0)
      requestAnimationFrame(() => { if (document.activeElement === document.body && back instanceof HTMLElement && back.isConnected) back.focus() })
    }
  }
  placeToasts()
}

export const close = () => { app.dialog.value = null }
/** What a locked setting says: whose it is, an organisation's or, in a child's profile, a parent's (D228). */
export const lockedBy = () => t(app.policy.child ? 'policy.parent' : 'policy.locked')
/**
 * A dialog closed (Escape, or another one opening): forget it only if it is still the open one, and
 * still closed. The event comes after the fact (a frame later in Chromium), maybe once it opened again.
 * @param {string} name
 */
export const closed = (name) => (/** @type {Event} */ event) => {
  if (app.dialog.value === name && !(/** @type {HTMLDialogElement} */ (event.target)).open) app.dialog.value = null
}
/** @param {MouseEvent} event */
export const backdrop = (event) => { if (event.target === event.currentTarget) close() }

/** @param {string} title */
export const head = (title) => html`<header class="dialog-head">
  <h2>${title}</h2>
  <button class="icon-button" @click=${close} aria-label=${t('action.close')}>${icons.close}</button>
</header>`

// ─── The drawer ──────────────────────────────────────────────────────────────

// Over the conversation, on a narrow window (D165): Search and the button that puts it away at its top, as in Manus.
class History extends Element {
  render() {
    return html`<dialog class="drawer" aria-label=${t('history.title')} @close=${closed('history')} @click=${backdrop}>
      <header class="dialog-head">${findButton()}
        <button class="icon-button" @click=${close} aria-keyshortcuts=${SHORTCUTS.sidebar} aria-label=${t('sidebar.close')}>${icons.sidebar}</button>
      </header>
      ${sidebarBody('drawer')}
    </dialog>`
  }

  updated() {
    syncDialog(this, 'history')
  }
}

// ─── Projects ────────────────────────────────────────────────────────────────

/** A project as its menu names it: the home project goes by the assistant's name. @param {import('../core/settings.js').Project} project */
export const projectName = (project) => String(project.data.default === true ? project.data.assistantName || BRAND.name : project.data.name)

/** Whether a brain or a connection can be kept to projects: once there are several, or while it is kept to some. @param {{ projects?: string[] }} item */
export const placeable = (item) => loaded.value.has('projects') && (app.projects.value.length > 1 || Boolean(item.projects))

/**
 * Where a brain or a connection is used (D191, D194): every project, or only those ticked, at
 * least one. Unticking "Every project" keeps it to the room's.
 * @param {{ projects?: string[] }} item @param {(projects: string[] | undefined) => unknown} keep
 */
export function where(item, keep) {
  const only = item.projects
  const kept = only ? app.projects.value.filter((project) => only.includes(project.id)) : []
  /** @param {Event} event */
  const ticked = (event) => /** @type {HTMLInputElement} */ (event.target).checked
  return html`<fieldset class="where">
    <legend>${t('projects.where')}</legend>
    <label><input type="checkbox" .checked=${live(!only)} @change=${(/** @type {Event} */ e) => keep(ticked(e) ? undefined : [app.project.value.id])}>${t('projects.everywhere')}</label>
    ${only ? app.projects.value.map((project) => {
      const on = kept.includes(project)
      return html`<label><input type="checkbox" .checked=${live(on)} ?disabled=${on && kept.length === 1}
        @change=${(/** @type {Event} */ e) => keep(ticked(e) ? [...only, project.id] : only.filter((id) => id !== project.id))}><bdi>${projectName(project)}</bdi></label>`
    }) : nothing}
  </fieldset>`
}

// ─── Settings ────────────────────────────────────────────────────────────────

/** The language menu: of those offered (D500), the browser's languages first, in its order, then the others. */
function languageOptions() {
  const option = (/** @type {string} */ code) => html`<option value=${code} lang=${code} ?selected=${code === locale.value}>${languageName(code)}</option>`
  const yours = preferredLocales(offeredLocales(), navigator.languages)
  if (!yours.length) return offeredLocales().map(option)
  return html`<optgroup label=${t('settings.languagesYours')}>${yours.map(option)}</optgroup>
    <optgroup label=${t('settings.languagesOther')}>${offeredLocales().filter((code) => !yours.includes(code)).map(option)}</optgroup>`
}

/** A setting: what it is on one side, how it is set on the other. @param {unknown} label @param {unknown} text @param {unknown} control */
export const setting = (label, text, control) => html`<section class="setting">
  <div><h3>${label}</h3>${text ? html`<p class="muted">${text}</p>` : nothing}</div>
  ${control}
</section>`

function general() {
  const { settings, locked } = effective.value
  const voices = deviceVoices()
  return html`
    ${setting(t('settings.language'), null, html`<select aria-label=${t('settings.language')} ?disabled=${locked.has('locale')}
      aria-keyshortcuts=${locked.has('locale') ? nothing : SHORTCUTS.language} @change=${(/** @type {Event} */ e) => setLocale(valueOf(e))}>${languageOptions()}</select>`)}
    ${voices.some((voice) => voice.localService) ? setting(t('settings.voice'), t('settings.voiceText'),
      html`<select aria-label=${t('settings.voice')} @change=${(/** @type {Event} */ e) => updateSettings({ voice: valueOf(e) || null })}>
        <option value="">${t('settings.voiceAuto')}</option>
        ${rankVoices(voices, locale.value, [locale.value, ...navigator.languages])
          .map((voice) => html`<option value=${voice.name} ?selected=${voice.name === settings.voice}>${voice.name}</option>`)}
      </select>`) : nothing}
    ${slots('general').map((part) => part.draw({ setting }))}`
}

const appearance = () => html`
  ${setting(t('settings.mode'), null, html`<span class="segmented" role="radiogroup" aria-label=${t('settings.mode')} aria-keyshortcuts=${SHORTCUTS.theme}>
    ${(/** @type {const} */ (['auto', 'light', 'dark'])).map((option) => html`<label>
      <input type="radio" name="theme" .checked=${(app.chosenTheme.value ?? 'auto') === option} @change=${() => setTheme(option === 'auto' ? null : option)}>
      <span>${t(`theme.${option}`)}</span>
    </label>`)}
  </span>`)}
  <section>${looks(effective.value.settings.look)}</section>`

/** ⌘/, beside ⌘,: Settings on its keyboard shortcuts (D257). */
const KEYBOARD_KEYS = SHORTCUTS.settings.replace(',', '/')
/**
 * The shortcuts in groups, the most used first, each under a name the user already knows: the tasks', in their ⋮ menu's
 * words, the box's, then the rest under the section of Settings where each is set (D313). Each with the capability it
 * waits for, or dictation, which this browser may not have, or the language, which policy may set. `about` reads them too (D423).
 * @type {[string, [string, string, string?][]][]}
 */
export const KEYS = [
  ['history.title', [['action.new', SHORTCUTS.new], ['cap.find.name', SHORTCUTS.find, 'find'], ['history.save', SHORTCUTS.save], ['cap.share.name', SHORTCUTS.share, 'share']]],
  ['composer.label', [['action.send', 'Enter'], ['action.stop', 'Escape'], ['keyboard.line', 'Shift+Enter'], ['keyboard.recall', 'ArrowUp ArrowDown'], ['keyboard.edit', 'Enter'], ['dictation.start', SHORTCUTS.dictation, 'dictation'], ['live.start', SHORTCUTS.live, 'live']]],
  ['settings.general', [['keyboard.sidebar', SHORTCUTS.sidebar], ['cap.browser.name', SHORTCUTS.browser, 'browser'], ['cap.computer.name', SHORTCUTS.terminal, 'computer'],
    ['settings.title', SHORTCUTS.settings], ['settings.keyboard', KEYBOARD_KEYS], ['keyboard.language', SHORTCUTS.language, 'locale'], ['action.close', 'Escape']]],
  ['settings.appearance', [['settings.mode', SHORTCUTS.theme], ['keyboard.look', SHORTCUTS.look, 'look']]]]

/** Whether a shortcut is there: always, or once its capability is found, dictation where the browser has it, the language and the look unless policy sets them (D500). @param {string} [id] */
export const offered = (id) => !id || (id === 'dictation' ? dictation.value.state !== 'unavailable' : id === 'locale' ? !effective.value.locked.has(id) : id === 'look' ? offeredLooks(app.policy).length > 1 : loaded.value.has(id))

/** The keyboard's shortcuts, to read, never to change (D236): a capability's once it is found. */
const keyboard = () => KEYS.map(([heading, keys]) => html`<section><h3>${t(heading)}</h3><dl class="list keyboard">${keys.filter(([, , id]) => offered(id))
  .map(([label, shortcut]) => html`<div><dt>${t(label)}</dt><dd><kbd><bdi dir="ltr">${keyNames(shortcut)}</bdi></kbd></dd></div>`)}</dl></section>`)

function approvals() {
  const { settings, locked } = effective.value
  return html`<section>
    <h3>${t('settings.rules')}</h3>
    <p class="muted">${t('settings.rulesText', { name: BRAND.name })}</p>
    <ul class="rules">${[...RULE_KINDS, ...(loaded.value.has('plan') ? ['plan'] : [])].map((kind) => {
      const current = resolveRule(kind, { user: settings.rules })
      const isLocked = locked.has(`rules.${kind}`)
      return html`<li class="setting">
        <span class="rule-kind">${t(`kind.${kind}.label`)}${isLocked ? html` <span class="muted small">${lockedBy()}</span>` : nothing}</span>
        <span class="segmented" role="radiogroup" aria-label=${t(`kind.${kind}.label`)}>
          ${(/** @type {const} */ (['allow', 'ask', 'never'])).map((option) => html`<label>
            <input type="radio" name=${`rule-${kind}`} .checked=${current === option} ?disabled=${isLocked} @change=${() => setRule(kind, option)}>
            <span>${t(`rules.${option}`)}</span>
          </label>`)}
        </span>
      </li>`
    })}</ul>
  </section>
  ${guards()}
  ${pages()}
  ${seal()}
  ${slots('approvals').map((part) => part.draw({ lockedBy }))}`
}

/**
 * Guards (D295): rules for one kind of action or one service that only ever make Jean more careful,
 * the organisation's first and locked, then the person's, each removed with a click, and a line to add one.
 */
function guards() {
  const { settings } = effective.value
  const mine = settings.guards ?? []
  const services = loaded.value.has('connections') ? [...(app.policy.connections ?? []), ...(settings.connections ?? [])] : []
  /** @param {import('../core/rules.js').Guard} guard @param {boolean} locked */
  const row = (guard, locked) => html`<li class="setting"><span class="rule-kind" dir="auto">${guard.service ? services.find((one) => one.id === guard.service)?.name ?? guard.service
    : t(`kind.${guard.kind}.label`)} · ${t(`rules.${guard.then}`)}${locked ? html` <span class="muted small">${lockedBy()}</span>` : nothing}${guard.if
    ? html`<br><span class="muted small">${t('guards.when', { question: guard.if })}</span>` : nothing}</span>${locked ? nothing
    : html`<button type="button" class="icon-button subtle" aria-label=${t('guards.remove')} @click=${() => updateSettings({ guards: mine.filter((other) => other !== guard) })}>${icons.trash}</button>`}</li>`
  /** @param {SubmitEvent} event */
  const add = (event) => {
    event.preventDefault()
    const form = /** @type {HTMLFormElement} */ (event.target)
    const fields = new FormData(form)
    const [on, value] = String(fields.get('for')).split(':')
    const question = String(fields.get('if') ?? '').trim()
    updateSettings({ guards: [...mine, { id: ulid(), [on]: value, then: /** @type {'ask' | 'never'} */ (fields.get('then')), ...(question && { if: question }) }] })
    form.reset()
  }
  return html`<section>
    <h3>${t('guards.title')}</h3>
    <p class="muted">${t('guards.text')}</p>
    <ul class="rules">${(app.policy.guards ?? []).map((/** @type {any} */ guard) => row(guard, true))}${mine.map((guard) => row(guard, false))}</ul>
    <form class="row" @submit=${add}>
      <select name="for" aria-label=${t('guards.for')}>${RULE_KINDS.map((kind) => html`<option value=${`kind:${kind}`}>${t(`kind.${kind}.label`)}</option>`)}
        ${services.map((one) => html`<option value=${`service:${one.id}`}>${one.name}</option>`)}</select>
      <select name="then" aria-label=${t('guards.then')}><option value="ask">${t('rules.ask')}</option><option value="never">${t('rules.never')}</option></select>
      <input name="if" dir="auto" placeholder=${t('guards.if')} aria-label=${t('guards.if')}>
      <button class="button">${t('guards.add')}</button>
    </form>
  </section>`
}

/** This device's seal (D274), once About this answer is here: its key's fingerprint, which whoever relies on its certificates checks, or agrees on beforehand. */
const sealPrint = signal('')
function seal() {
  if (!loaded.value.has('receipt')) return nothing
  if (!sealPrint.value) import('../caps/receipt/receipt.js').then(({ fingerprint }) => fingerprint()).then((print) => (sealPrint.value = print))
  return html`<section>
    <h3>${t('seal.title')}</h3>
    <p class="muted">${t('seal.text')}</p>
    <span class="key-command"><code dir="ltr">${sealPrint.value.match(/.{1,4}/g)?.join(' ')}</code><button type="button" class="icon-button subtle" aria-label=${t('action.copy')}
      @click=${() => navigator.clipboard.writeText(sealPrint.value).then(() => notify(t('toast.copied')))}>${icons.copy}</button></span>
  </section>`
}

/** What a web page may do when it opens beside the conversation (D143), each unless the organisation set it. */
function pages() {
  const rights = pageRights(app.settings.value, app.policy)
  const { allows, locked } = rights
  return html`<section>
    <h3>${t('pages.title')}</h3>
    <p class="muted">${t('pages.text')}</p>
    <ul class="rules">${(/** @type {import('./csp.js').PageRight[]} */ (Object.keys(PAGE_DEFAULTS))).map((right) => html`<li class="setting">
      <div><span class="rule-kind">${t(`pages.${right}`)}</span><p class="muted small">${locked.has(right) ? lockedBy() : t(`pages.${right}Text`)}</p></div>
      <input type="checkbox" class="switch" role="switch" aria-label=${t(`pages.${right}`)} .checked=${allows[right]}
        ?disabled=${locked.has(right) || (right === 'network' && !allows.scripts)}
        @change=${(/** @type {Event} */ e) => setPages({ [right]: /** @type {HTMLInputElement} */ (e.target).checked })}>
      ${right === 'network' && allows.scripts && allows.network ? siteList({ sites: rights.sites, fixed: locked.has('sites'), set: (sites) => setPages({ sites }), any: true }) : nothing}
    </li>`)}</ul>
  </section>`
}

/** @param {import('./csp.js').PageSettings} change */
const setPages = (change) => updateSettings({ pages: { ...app.settings.value.pages, ...change } })

/**
 * Sites, inline after one another: those a page's code may reach (`any`: `*`, any, until one is
 * named), or the Computer's (D162). Enter adds what is typed when it is a site, and nothing else
 * adds it; × takes one away.
 * @param {{ sites: string[], fixed: boolean, set: (sites: string[]) => void, any?: boolean }} options
 */
export function siteList({ sites, fixed, set, any = false }) {
  /** @param {KeyboardEvent} event */
  const add = (event) => {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return
    event.preventDefault()
    const input = /** @type {HTMLInputElement} */ (event.target)
    const typed = site(input.value)
    input.setAttribute('aria-invalid', String(!typed))
    if (!typed) return
    input.value = ''
    set(typed === '*' && any ? [] : [...new Set([...sites, typed])])
  }
  /** @param {Event} event @param {string} gone */
  const remove = (event, gone) => {
    /** @type {HTMLElement} */ (event.currentTarget).closest('.sites')?.querySelector('input')?.focus()
    set(sites.filter((other) => other !== gone))
  }
  return html`<div class="reach">
    <div class="sites">
      <ul aria-label=${t('pages.sites')}>${(sites.length || !any ? sites : ['*']).map((entry) => html`<li><bdi>${entry}</bdi>${sites.length && !fixed
        ? html`<button class="icon-button subtle" aria-label=${t('pages.siteRemove', { site: entry })}
          @click=${(/** @type {Event} */ e) => remove(e, entry)}>${icons.close}</button>` : nothing}</li>`)}</ul>
      ${fixed ? nothing : html`<input dir="ltr" enterkeyhint="done" autocapitalize="off" spellcheck="false" aria-label=${t('pages.siteAdd')} aria-describedby="sites-hint"
        @keydown=${add} @input=${(/** @type {Event} */ e) => /** @type {HTMLInputElement} */ (e.target).removeAttribute('aria-invalid')}>`}
    </div>
    <p class="muted small" id="sites-hint">${fixed ? lockedBy() : t('pages.sitesText')}</p>
  </div>`
}

/** Settings' Your data and its pages (ui/data-pages.js, D519): loaded the first time it shows. */
const dataPages = signal(/** @type {typeof import('./data-pages.js') | null} */ (null))

/**
 * @typedef {'general' | 'brains' | 'appearance' | 'keyboard' | 'you' | 'connections' | 'search' | 'skills' | 'routines' | 'computer' | 'apps' | 'capabilities' | 'approvals' | 'data'} Section
 * @typedef {Object} Place
 * @property {number} at       its place in the menu, lowest first
 * @property {string} label    its name in the menu
 * @property {unknown} icon
 * @property {() => unknown} show
 * @property {() => boolean} [when]  shown once its capability is on
 * @property {() => string} [also]   more words it is found by (⌘K)
 * @property {boolean} [group]       starts a group of the menu
 */

/** What Jean knows about you (ui/knows.js): loaded the first time it is shown. */
const knows = signal(/** @type {typeof import('./knows.js') | null} */ (null))
/** @type {Promise<typeof import('./knows.js')> | null} */
let knowing = null
const KNOWN = ['you']
/** Settings' Brains and its pages (ui/brain-pages.js, D514): loaded the first time it shows. */
const brainPages = signal(/** @type {typeof import('./brain-pages.js') | null} */ (null))

/**
 * Settings is a menu beside the section open, like the Claude apps' (D113), in three groups (D134):
 * Jean itself; what it knows and can do, from the person outwards (D311): what it knows of them, its
 * skills and routines, then what it reaches and runs, a capability's own section once it is on (its
 * settings slot: Routines, Connections, Web search, the Computer, Apps), then the case of them all; and what
 * it may do and what it keeps. A section may open one of its pages, named after it: routines/<ulid> (D509), brains/<id> (D514), you/noticed (D521).
 * @type {Partial<Record<Section, Place>>}
 */
const SECTIONS = {
  general: { at: 10, label: 'settings.general', icon: icons.gear, show: general },
  brains: { at: 20, label: 'settings.brains', icon: icons.brain, show: () => brainPages.value?.section() ?? (import('./brain-pages.js').then((module) => { brainPages.value = module }), nothing) },
  appearance: { at: 30, label: 'settings.appearance', icon: icons.palette, show: appearance },
  keyboard: { at: 40, label: 'settings.keyboard', icon: icons.keyboard, show: keyboard, when: () => !matchMedia('(pointer: coarse)').matches },
  you: { at: 50, label: 'settings.you', icon: icons.person, show: () => knows.value?.you() ?? nothing, also: () => `${t('knows.title', { name: BRAND.name })} ${t('you.name')}`, group: true },
  capabilities: { at: 100, label: 'settings.capabilities', icon: icons.trophy, show: capabilities },
  approvals: { at: 110, label: 'settings.approvals', icon: icons.shield, show: approvals, group: true },
  data: { at: 120, label: 'settings.storage', icon: icons.cabinet, show: () => dataPages.value?.section() ?? (import('./data-pages.js').then((module) => { dataPages.value = module }), nothing) },
}
/** The sections shown now, in their order. @returns {[Section, Place][]} */
export const places = () => /** @type {[Section, Place][]} */ ([...Object.entries(SECTIONS), ...slots('settings').map((entry) => [entry.id, { ...entry, show: entry.draw }])])
  .filter(([, place]) => place.when?.() ?? true).sort(([, a], [, b]) => a.at - b.at)
/** Their names. */
export const sections = () => places().map(([id]) => id)

/** Opens Settings on one of its sections, or one of a section's pages. @param {Section | `${Section}/${string}`} [name] */
export function openSettings(name = 'general') {
  app.section.value = name
  app.dialog.value = 'settings'
}

/** The section open, without its page. */
export const sectionOpen = () => app.section.value.split('/')[0]

class Settings extends Element {
  render() {
    const shown = places()
    const [open, place] = shown.find(([id]) => id === sectionOpen()) ?? shown[0]
    // No title: the menu says where the user is. Closing sits above it, where the eye starts.
    return html`<dialog class="sheet settings" aria-label=${t('settings.title')} @close=${closed('settings')} @click=${backdrop}>
      <button class="icon-button settings-close" @click=${close} aria-label=${t('action.close')}>${icons.close}</button>
      <nav class="settings-nav" aria-label=${t('settings.title')}>
        ${shown.map(([id, { group, icon, label }]) => html`${group ? html`<hr>` : nothing}<button aria-current=${id === open ? 'page' : 'false'}
          aria-keyshortcuts=${id === 'keyboard' ? KEYBOARD_KEYS : nothing} @click=${() => { app.section.value = id }}>${icon}${t(label)}</button>`)}
      </nav>
      <div class="settings-panel">${place.show()}</div>
    </dialog>`
  }

  #shown = ''

  updated() {
    syncDialog(this, 'settings')
    const open = app.dialog.value === 'settings'
    const section = sectionOpen()
    if (!open) { this.#shown = ''; return }
    // An address may name a section not shown, or not yet (capabilities come back after the first paint): then General.
    const missing = () => !sections().some((id) => id === sectionOpen())
    if (missing()) app.ready.then(() => { if (missing()) app.section.value = 'general' })
    if (this.#shown !== app.section.value) {
      // Each brain's versions are asked for as Routines (a routine's own brain, D303) is entered, not one of its pages: on each repaint, a list still on its way was asked for again. Brains asks its own (D514).
      const entered = section !== this.#shown.split('/')[0]
      if (entered && section === 'routines') for (const brain of effective.value.settings.brains) if (brain.api !== 'device') loadModels(brain)
      // What Jean knows is read again each time it is entered.
      if (entered && KNOWN.includes(section)) {
        knowing ??= import('./knows.js').then((module) => (knows.value = module))
        knowing.then((module) => module.refresh())
      }
      // A section or a page entered opens at its top, and on a phone, where the menu is a strip, its button stays in view.
      const panel = this.querySelector('.settings-panel')
      if (panel) panel.scrollTop = 0
      this.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      // Capabilities opens on the next to find.
      picked.value = ''
    }
    this.#shown = app.section.value
    // The trophies found catch the light one after another (CSSOM: the CSP forbids style attributes).
    this.querySelectorAll('.case > li').forEach((trophy, i) => /** @type {HTMLElement} */ (trophy).style.setProperty('--i', String(i)))
  }
}

// ─── What Jean can do ────────────────────────────────────────────────────────

// The house (docs/design.md), in Settings, is a case of trophies (D127) in Settings' own parts
// (D316): the wave, a size larger with each quarter of the case found, beside how many are found, over a
// bar of it; then a capability a row of a list, lit once found, a silhouette until
// then that says how it is found. The row open, at first the next to find, says what it does.
export const ROOM_ICONS = /** @type {Record<string, keyof typeof icons>} */ ({
  files: 'file', meaning: 'meaning', made: 'table', documents: 'compose', tables: 'board', computer: 'computer', reflexes: 'signpost', memory: 'note', find: 'search', projects: 'layers', folders: 'folder-open', skills: 'scroll', routines: 'alarm', flows: 'flow',
  search: 'websearch', browser: 'globe', connections: 'plug', helpers: 'helpers', check: 'double-check', since: 'since', notifications: 'bell', names: 'badge', live: 'voice', reader: 'speaker', backup: 'backup', share: 'share', sync: 'sync', lock: 'lock', 'brain-local': 'brain-device', machine: 'machine', pictures: 'image', apps: 'apps',
})
/** Where a lit room leads: its section of Settings, search, or the browser. */
const OPENS = /** @type {Record<string, () => void>} */ ({
  memory: () => openSettings('you'), skills: () => openSettings('skills'), routines: () => openSettings('routines'),
  connections: () => openSettings('connections'), search: () => openSettings('search'), apps: () => openSettings('apps'), computer: () => openSettings('computer'), pictures: () => openSettings('brains/pictures'), share: () => openSettings('data/links'), machine: () => import('../caps/machine/machine.js').then((module) => module.show()), sync: () => openSettings('data/sync'), lock: () => openSettings('data/lock'), notifications: () => openSettings('general'), find: () => { app.dialog.value = 'find' },
  browser: () => { app.dialog.value = null; import('../caps/browser/browser.js').then((module) => module.show()) },
  flows: () => { app.dialog.value = null; import('../caps/flows/flows.js').then((module) => module.here()) },
  folders: () => { app.dialog.value = null; import('../caps/folders/folders.js').then((module) => module.choose()) },
})
/** Trophies found by counting, as ui/discovery.js counts them: how far along, out of how many. */
const COUNTED = /** @type {Record<string, () => number[]>} */ ({ reflexes: () => [everywhere.value, 2], backup: () => [everywhere.value, 3],
  find: () => [everywhere.value, FINDABLE], lock: () => [everywhere.value, FINDABLE], search: () => [everywhere.value, SEARCHABLE],
  live: () => [effective.value.settings.dictated ?? 0, 3], check: () => [effective.value.settings.cited ?? 0, CITED],
  browser: () => [effective.value.settings.browsed ?? 0, BROWSED], flows: () => [effective.value.settings.stepped ?? 0, STEPPED] })
/** The row open: '' for the next to find, null once the user closed it. */
const picked = signal(/** @type {string | null} */ (''))
/**
 * Turns a capability found off (D433), written before it is said, since the page then goes: its module can't be unloaded,
 * so ui/update.js opens it afresh where it was once nothing is under way. Still found, it is denied from then on.
 * @param {string} id
 */
const turnOff = async (id) => { const settings = { ...app.settings.peek(), off: [...app.settings.peek().off ?? [], id] }; await saveSettings(app.fs, settings); app.settings.value = settings }

/** @param {string} id */
async function turnOn(id) {
  picked.value = id
  // Turned off before (D433), it is allowed again, and comes on at once.
  if (app.settings.peek().off?.includes(id)) await updateSettings({ off: app.settings.peek().off?.filter((other) => other !== id) })
  configureCapabilities({ deny: [...app.policy.capabilities?.deny ?? [], ...app.settings.peek().off ?? []], remember: rememberUnlocked })
  if (WEIGHTS.includes(id)) return accept(id)
  // Settings closed while it loaded, the user has gone: found, it leads nowhere, rather than open Settings again;
  // a section of Settings is gone to at once, before they can (D134).
  if (!(await unlock(id)) || app.dialog.peek() !== 'settings') return
  if (id === 'brain-local') openSettings('brains/device')
  else if (id === 'connections') openSettings('connections')
  else begin(id)
}

/**
 * How far along a capability found by counting is, a pip a step: seen in its row, and said once
 * it is open, as a button's content is never read as a progress bar. @param {string} id @param {boolean} [said]
 */
function pips(id, said = false) {
  const [done = 0, goal = 0] = COUNTED[id]?.() ?? []
  return goal ? html`<span class="pips" role=${said ? 'progressbar' : nothing} aria-hidden=${said ? nothing : 'true'} aria-labelledby=${said ? `how-${id}` : nothing}
    aria-valuemax=${goal} aria-valuenow=${Math.min(done, goal)}>${Array.from({ length: goal }, (_, i) => html`<i class=${i < done ? 'is-lit' : ''}></i>`)}</span>` : nothing
}

function capabilities() {
  const lit = loaded.value
  const off = effective.value.settings.off ?? []
  const ids = CATALOGUE.filter((id) => !isDenied(id) || off.includes(id))
  const count = ids.filter((id) => lit.has(id)).length
  const total = ids.length
  const rank = count === total ? 4 : Math.floor((4 * count) / total)
  const left = ids.filter((id) => !lit.has(id) && !off.includes(id))
  const shown = picked.value === null ? '' : ids.includes(picked.value) ? picked.value : left[0] ?? ''
  return html`<section class="house" data-rank=${rank}>
      <span class="house-light"><app-persona></app-persona></span>
      <div>
        <h3>${t('collection.title', { name: BRAND.name })}</h3>
        <p class="house-count">${t('collection.count', { count, total })}</p>
      </div>
      <meter min="0" max=${total} value=${count} aria-hidden="true"></meter>
    </section>
    <section>
      <ul class="list case">${ids.map((id) => trophy(id, lit.has(id) && !off.includes(id), id === shown, off.includes(id)))}</ul>
      ${left.length ? html`<button class="button subtle wide" @click=${unlockAll}>${t('collection.all')}</button>` : nothing}
    </section>`
}

/**
 * A capability's row, in the order of the case: lit and on once found, off once the user turned it off, else how
 * it is found. Open, what it does and what it offers now: to turn it on, early or again, Intuition's download while
 * it waits for one, where it leads, and to turn it off (D433): not what is always there, nor what is undone where it is set
 * (a lock, the brain on this device), nor in a private window, which opening afresh would empty.
 * @param {string} id @param {boolean} on @param {boolean} open @param {boolean} off
 */
const trophy = (id, on, open, off) => html`<li class=${on ? 'is-lit' : off ? 'is-off' : ''}>
  <button class="item" aria-expanded=${open} @click=${() => { picked.value = open ? null : id }}>
    <span class="item-icon">${icons[ROOM_ICONS[id]]}</span>
    <span class="item-text"><strong>${t(`cap.${id}.name`)}</strong>${on || off ? nothing
      : html`<small id="how-${id}"><span class="visually-hidden">${t('collection.how')}</span> ${t(`cap.${id}.hint`)}</small>${pips(id)}`}</span>
    ${on || off ? html`<small class="case-on">${on ? html`<span class="dot"></span>` : nothing}${t(on ? 'collection.on' : 'collection.off')}</small>` : nothing}${icons.chevron}
  </button>
  ${open ? html`<div class="item-body">
    ${on || off ? nothing : pips(id, true)}
    <p>${t(`cap.${id}.text`, { name: BRAND.name, size: formatBytes(BYTES[id] ?? 0) })}</p>
    ${!on ? html`<div class="row"><button class="button" @click=${() => turnOn(id)}>${t('collection.turnOn')}</button></div>`
      : html`<div class="row">${WEIGHTS.includes(id) && !loaded.value.get(id)?.ready && !app.offer.value ? html`<button class="button" @click=${() => accept(id)}>${icons.download} ${t(`cap.${id}.yes`, { size: formatBytes(BYTES[id]) })}</button>`
      : OPENS[id] ? html`<button class="button" @click=${OPENS[id]}>${t('collection.open')}</button>` : nothing}${['made', 'lock', 'brain-local'].includes(id) || app.ephemeral.value ? nothing
      : html`<button class="button subtle" @click=${() => turnOff(id)}>${t('collection.turnOff')}</button>`}</div>`}
  </div>` : nothing}
</li>`

/** @typedef {import('../core/settings.js').Look} Look */
/** @param {Event} event */
export const valueOf = (event) => /** @type {HTMLInputElement} */ (event.target).value
/** What the user's own CSS starts from, commented out (ui/touches.css): kept only once changed, emptied included. */
const starter = await fetch(new URL('touches.css', import.meta.url)).then((response) => (response.ok ? response.text() : ''), () => '')

/**
 * Jean's looks, or those policy offers, its own first (D500), then the user's touches over the one chosen, shown as they
 * change (D111). With one look offered, it is the organisation's to set. @param {Look} [look]
 */
function looks(look = {}) {
  const ids = offeredLooks(app.policy)
  const chosen = lookId(look.id, app.policy)
  const [base, own] = [baseOf(chosen, app.policy), chosen === OWN ? app.policy.look : {}]
  const size = look.size ?? 1
  return html`<fieldset class="looks" ?disabled=${ids.length < 2} aria-keyshortcuts=${ids.length < 2 ? nothing : SHORTCUTS.look}>
      <legend>${t('look.title')}${ids.length < 2 ? html` <span class="muted small">${lockedBy()}</span>` : nothing}</legend>
      ${ids.map((id) => html`<label class="choice-option look">
        <input type="radio" name="look" .checked=${id === chosen} @change=${() => setLook({ id })}>
        <span class="look-preview" data-look-preview=${baseOf(id, app.policy)} aria-hidden="true"><span></span><span></span><span></span></span>
        <span><strong>${lookName(id)}</strong></span>
      </label>`)}
    </fieldset>
    <details class="other">
      <summary>${t('look.custom')}</summary>
      <div class="stack">
        <div class="look-colours">
          <label>${t('look.accent')}<input type="color" .value=${live(look.accent ?? own.accent ?? LOOKS[base].accent)}
            @input=${(/** @type {Event} */ e) => setLook({ accent: valueOf(e) }, { later: true })}></label>
          <label>${t('look.background')}<input type="color" .value=${live(look.background ?? own.background ?? LOOKS[base].bar[theme.value === 'light' ? 1 : 0])}
            @input=${(/** @type {Event} */ e) => setLook({ background: valueOf(e) }, { later: true })}></label>
        </div>
        <label><span class="look-size">${t('look.size')}<output>${new Intl.NumberFormat(intlLocales(), { style: 'percent' }).format(size)}</output></span>
          <input type="range" min=${SIZES.min} max=${SIZES.max} step=${SIZES.step} .value=${live(String(size))}
            @input=${(/** @type {Event} */ e) => setLook({ size: Number(valueOf(e)) }, { later: true })}></label>
        <label>${t('look.font')}
          <select @change=${(/** @type {Event} */ e) => setLook({ font: valueOf(e) || undefined })}>
            <option value="">${t('look.font.look')}</option>
            ${Object.keys(FONTS).map((id) => html`<option value=${id} ?selected=${id === look.font}>${t(`look.font.${id}`)}</option>`)}
          </select></label>
        <label>${t('look.css')}<textarea class="look-css" rows="6" dir="ltr" spellcheck="false" autocapitalize="off" .value=${live(look.css ?? starter)}
          @input=${(/** @type {Event} */ e) => setLook({ css: valueOf(e) === starter ? undefined : valueOf(e) }, { later: true })}></textarea></label>
        <p class="hint">${t('look.cssHint')}</p>
        <div class="row"><button class="button subtle" ?disabled=${!touched(look)} @click=${(/** @type {Event} */ e) => {
          const summary = /** @type {HTMLElement} */ (e.currentTarget).closest('details')?.querySelector('summary')
          setLook(null)
          summary?.focus()
        }}>${t('look.reset')}</button></div>
      </div>
    </details>`
}

export async function backup() {
  if (!(await unlock('backup'))) return
  const { downloadBackup } = await import('../caps/backup/backup.js')
  await downloadBackup()
}

define('app-history', History)
define('app-settings', Settings)
