// The drawer and settings dialogs (native <dialog>: focus trap and Escape for free): Settings' menu, with General and
// the keyboard's shortcuts here, its other sections each a module loaded the first time it shows.
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import {
  app, effective, setLocale, updateSettings, loadModels,
  offeredLocales, SHORTCUTS,
} from './state.js'
import { unlock, loaded, slots } from './caps.js'
import { BRAND } from '../brand.js'
import { site } from './csp.js'
import { t, tParts, locale, intlLocales, useStrings, languageName, preferredLocales } from '../core/i18n.js'
import { deviceVoices, listen, natural, SPEAKERS } from './voices.js'
import { voiceMenu } from './language.js'
import { speaking } from './speech.js'
import { icons } from './menu-icons.js'
import { sidebarBody, keyNames, backwards } from './inbox.js'
import { findButton, placeToasts } from './shell.js'
import { dictation } from './dictation.js'
import { offeredLooks } from './looks.js'
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
      ${app.dialog.value === 'history' ? sidebarBody('drawer') : nothing}
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

/** The language menu: of those offered, the browser's languages first, in its order, then the others. */
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

/** The page of General open, a capability's: the natural voice's; '' for the section. */
const generalPage = () => app.section.value.split('/')[1] ?? ''

/** @typedef {{ version?: string, date?: string }} Release */
const release = signal(/** @type {Release} */ ({}))
/** @type {Promise<Release> | null} */
let releasing = null
/** This copy's version and when it was made, as `npm run manifest` wrote them in capabilities.json: read once. */
export const released = () => (releasing ??= fetch(new URL('../capabilities.json', import.meta.url)).then((response) => response.json())
  .then((listing) => listing.release ?? {}, () => ({})).then((found) => (release.value = found)))
/** When a version was made, as General's foot says it. @param {string} date */
export const madeOn = (date) => new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'long', timeStyle: 'short' }).format(new Date(date))

/**
 * Settings' General: its title; the language, with its shortcut or who set it; Reading aloud, the voice that reads
 * the interface's language with Listen, and what capabilities add (the natural voice's row, which opens its page); While
 * you're away, Notifications once found; at its foot, the version and when it was made. A capability's part is a
 * row in a group, `{ id, at, group, draw, page? }`.
 */
function general() {
  const { settings, locked } = effective.value
  const parts = slots('general')
  const page = parts.find((part) => part.id === generalPage())?.page
  if (page) return page()
  const tag = locale.value
  const lang = tag.split('-')[0]
  const [plain, others] = voiceMenu(deviceVoices(), lang, [tag, ...navigator.languages], intlLocales())
  // The natural voice first where it reads this language (D455); a voice picked here reads it instead.
  const reads = natural.live?.can(lang) ?? false
  const chosen = [...plain, ...others].some(({ voice }) => voice.name === settings.voice) ? settings.voice : reads ? '' : plain[0]?.voice.name
  const option = (/** @type {{ voice: SpeechSynthesisVoice, label: string }} */ { voice, label }) => html`<option value=${voice.name} ?selected=${voice.name === chosen}>${label}</option>`
  const sample = speaking.value === 'sample'
  const voice = plain.length || others.length || reads ? html`<li><span class="item-icon">${icons.speaker}</span>
    <span class="item-text"><strong id="general-voice">${t('settings.voice')}</strong><small>${t('settings.voiceText')}</small></span>
    <button type="button" class="icon-button listen" aria-label=${t(sample ? 'action.stop' : 'settings.listen')} @click=${() => listen(t('settings.sample'), tag, settings.voice)}>${sample ? icons.stop : icons.play}</button>
    <select aria-labelledby="general-voice" @change=${(/** @type {Event} */ e) => updateSettings({ voice: valueOf(e) || null })}>
      ${reads ? html`<option value="" ?selected=${chosen === ''}>${t('cap.reader.name')} · ${SPEAKERS[lang].split(' ')[0]}</option>` : nothing}
      ${plain.map(option)}${others.length ? html`<optgroup label=${t('settings.voicesOther')}>${others.map(option)}</optgroup>` : nothing}
    </select></li>` : nothing
  /** @param {'reading' | 'away'} group @param {unknown[]} rows */
  const group = (group, rows) => rows.length ? html`<section><h3>${t(`settings.${group}`)}</h3><ul class="list general">${rows}</ul></section>` : nothing
  const drawn = (/** @type {string} */ group) => parts.filter((part) => part.group === group).map((part) => part.draw())
  released()
  const { version, date } = release.value
  return html`<header class="general-head"><h2>${t('settings.general')}</h2></header>
    <ul class="list general"><li><span class="item-icon">${icons.language}</span>
      <span class="item-text"><strong id="general-language">${t('settings.language')}</strong>${locked.has('locale') ? html`<small>${icons.lock} ${lockedBy()}</small>`
        : html`<small class="keys"><kbd><bdi dir="ltr">${keyNames(SHORTCUTS.language)}</bdi></kbd> ${t('keyboard.language')}</small>`}</span>
      <select aria-labelledby="general-language" ?disabled=${locked.has('locale')} aria-keyshortcuts=${locked.has('locale') ? nothing : `${SHORTCUTS.language} ${backwards(SHORTCUTS.language)}`}
        @change=${(/** @type {Event} */ e) => setLocale(valueOf(e))}>${languageOptions()}</select></li></ul>
    ${group('reading', [voice, ...drawn('reading')].filter((row) => row !== nothing))}
    ${group('away', drawn('away'))}
    ${version && date ? html`<p class="muted small version">${tParts('settings.version', { name: BRAND.name, version, date: html`<time datetime=${date}>${madeOn(date)}</time>` })}</p>` : nothing}`
}

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
    ['settings.title', SHORTCUTS.settings], ['settings.keyboard', KEYBOARD_KEYS], ['keyboard.language', SHORTCUTS.language, 'locale'],
    ['keyboard.languageBefore', backwards(SHORTCUTS.language), 'locale'], ['action.close', 'Escape']]],
  ['settings.appearance', [['settings.mode', SHORTCUTS.theme], ['keyboard.look', SHORTCUTS.look, 'look'], ['keyboard.lookBefore', backwards(SHORTCUTS.look), 'look']]]]

/** Whether a shortcut is there: always, or once its capability is found, dictation where the browser has it, the language and the look unless policy sets them. @param {string} [id] */
export const offered = (id) => !id || (id === 'dictation' ? dictation.value.state !== 'unavailable' : id === 'locale' ? !effective.value.locked.has(id) : id === 'look' ? offeredLooks(app.policy).length > 1 : loaded.value.has(id))

/** The keyboard's shortcuts under their title, General's, to read, never to change (D236): a capability's once it is found. */
const keyboard = () => html`<header class="general-head"><h2>${t('settings.keyboard')}</h2></header>${KEYS.map(([heading, keys]) => html`<section><h3>${t(heading)}</h3>
  <dl class="list keyboard">${keys.filter(([, , id]) => offered(id)).map(([label, shortcut]) => html`<div><dt>${t(label)}</dt><dd><kbd><bdi dir="ltr">${keyNames(shortcut)}</bdi></kbd></dd></div>`)}</dl></section>`)}`

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

/** Settings' Your data and its pages (ui/data-pages.js): loaded the first time it shows. */
const dataPages = signal(/** @type {typeof import('./data-pages.js') | null} */ (null))
/** Settings' Capabilities and its pages (ui/case-pages.js): loaded the first time it shows. */
const casePages = signal(/** @type {typeof import('./case-pages.js') | null} */ (null))
/** Settings' Approvals and its pages (ui/approval-pages.js): loaded the first time it shows. */
const approvalPages = signal(/** @type {typeof import('./approval-pages.js') | null} */ (null))

/**
 * @typedef {'general' | 'brains' | 'appearance' | 'keyboard' | 'you' | 'connections' | 'search' | 'skills' | 'routines' | 'computer' | 'extensions' | 'capabilities' | 'approvals' | 'data'} Section
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
/** Settings' Brains and its pages (ui/brain-pages.js): loaded the first time it shows. */
const brainPages = signal(/** @type {typeof import('./brain-pages.js') | null} */ (null))
/** Settings' Appearance and its page (ui/look-page.js): loaded the first time it shows. */
const lookPage = signal(/** @type {typeof import('./look-page.js') | null} */ (null))

/**
 * Settings is a menu beside the section open, like the Claude apps' (D113), in three groups (D134):
 * Jean itself; what it knows and can do, from the person outwards (D311): what it knows of them, its
 * skills and routines, then what it reaches and runs, a capability's own section once it is on (its
 * settings slot: Routines, Connections, Web search, the Computer, Extensions), then the case of them all; and what
 * it may do and what it keeps. A section may open one of its pages, named after it: routines/<ulid> (D509), brains/<id>, you/noticed, appearance/css, general/natural, approvals/<kind>.
 * @type {Partial<Record<Section, Place>>}
 */
const SECTIONS = {
  general: { at: 10, label: 'settings.general', icon: icons.gear, show: general },
  brains: { at: 20, label: 'settings.brains', icon: icons.brain, show: () => brainPages.value?.section() ?? (import('./brain-pages.js').then((module) => { brainPages.value = module }), nothing) },
  appearance: { at: 30, label: 'settings.appearance', icon: icons.palette, show: () => lookPage.value?.section() ?? (import('./look-page.js').then((module) => { lookPage.value = module }), nothing) },
  keyboard: { at: 40, label: 'settings.keyboard', icon: icons.keyboard, show: keyboard, when: () => !matchMedia('(pointer: coarse)').matches },
  you: { at: 50, label: 'settings.you', icon: icons.person, show: () => knows.value?.you() ?? nothing, also: () => `${t('knows.title', { name: BRAND.name })} ${t('you.name')}`, group: true },
  capabilities: { at: 100, label: 'settings.capabilities', icon: icons.trophy, show: () => casePages.value?.section() ?? (import('./case-pages.js').then((module) => { casePages.value = module }), nothing) },
  approvals: { at: 110, label: 'settings.approvals', icon: icons.shield, show: () => approvalPages.value?.section() ?? (import('./approval-pages.js').then((module) => { approvalPages.value = module }), nothing), group: true },
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
/** The page open in the section, or none. */
export const pageOpen = () => app.section.value.split('/')[1] ?? ''

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
      // Each brain's versions are asked for as Routines (a routine's own brain, D303) is entered, not one of its pages: on each repaint, a list still on its way was asked for again. Brains asks its own.
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
    }
    this.#shown = app.section.value
  }
}

// ─── What Jean can do ────────────────────────────────────────────────────────

// Its glyph for each capability: the case's rows (ui/case-pages.js) and the box's / menu (ui/complete.js).
export const ROOM_ICONS = /** @type {Record<string, keyof typeof icons>} */ ({
  files: 'file', meaning: 'meaning', made: 'table', documents: 'compose', tables: 'board', designs: 'palette', computer: 'computer', reflexes: 'signpost', memory: 'note', find: 'search', projects: 'layers', folders: 'folder-open', skills: 'scroll', routines: 'alarm', flows: 'flow',
  search: 'websearch', browser: 'globe', connections: 'plug', helpers: 'helpers', check: 'double-check', since: 'since', notifications: 'bell', names: 'badge', live: 'voice', camera: 'camera', reader: 'speaker', backup: 'backup', share: 'share', sync: 'sync', lock: 'lock', 'brain-local': 'brain-device', machine: 'machine', pictures: 'image', extensions: 'extensions',
})

/** @typedef {import('../core/settings.js').Look} Look */
/** @param {Event} event */
export const valueOf = (event) => /** @type {HTMLInputElement} */ (event.target).value
export async function backup() {
  if (!(await unlock('backup'))) return
  const { downloadBackup } = await import('../caps/backup/backup.js')
  await downloadBackup()
}

define('app-history', History)
define('app-settings', Settings)
