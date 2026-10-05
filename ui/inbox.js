// Mail's list (D111): the drawer's conversations, kept in view beside the one open, with the
// header's name above it, Search under a new one once it is found (D133) and the user at its foot,
// whose menu holds Settings, like the Claude apps' sidebar (D115, D150).
import { html, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, effective, theme, newConversation, openConversation, removeConversation, turnPage, switchTheme, setLocale, setLook, LOCALES } from './state.js'
import { LOOKS, lookId } from './looks.js'
import { loaded } from './caps.js'
import { BRAND } from '../brand.js'
import { t, locale, languageName, preferredLocales } from '../core/i18n.js'
import { icons } from './icons.js'
import { SHORTCUTS } from './shell.js'

/**
 * The conversations, newest first, the open one marked: in the drawer, or in Mail's list. One
 * started before the open one (ULIDs sort by time), or any from a new page, is back (D125).
 * One being answered has a light before its name, ringed while a decision waits there (D147).
 */
export function conversationList() {
  const list = app.conversations.value
  const currentId = app.current.value?.id
  const running = app.running.value
  const waiting = [...app.decisions.value.map((decision) => decision.conversation), app.offering.value?.conversation]
  return list.length ? html`<ol class="history-list">${repeat(list, (item) => item.id, (item) => {
    const asks = running.includes(item.path) ? waiting.filter((path) => path === item.path).length : -1
    return html`<li class=${item.id === currentId ? 'is-current' : ''}>
      <button class="history-item" aria-current=${item.id === currentId ? 'true' : 'false'}
        @click=${() => turnPage(() => openConversation(item.path), !currentId || item.id < currentId)}>
        ${asks < 0 ? nothing : html`<span class="ember" role="img" ?data-waiting=${asks} aria-label=${asks ? t('inbox.waiting', { count: asks }) : t('activity.working')}></span>`}
        <span class="history-title" dir="auto">${item.title || t('conversation.untitled')}</span>
      </button>
      <button class="icon-button subtle" aria-label=${t('action.delete')} title=${t('action.delete')}
        @click=${() => confirm(t('history.confirmDelete')) && removeConversation(item.path)}>${icons.trash}</button>
    </li>`
  })}</ol>` : html`<p class="muted">${t('history.empty')}</p>`
}

/** A shortcut as the keyboard shows it, left to right in any language: ⌘⇧L on Apple's systems, Ctrl+Shift+L elsewhere. @param {string} shortcut */
const keys = (shortcut) => html`<kbd aria-hidden="true"><bdi dir="ltr">${shortcut.startsWith('Meta')
  ? shortcut.replace('Meta+', '⌘').replace('Shift+', '⇧') : shortcut.replace('Control', 'Ctrl')}</bdi></kbd>`

/** Search, under a new conversation once it is found, with its key shown as in the Claude apps (D133). */
export const findEntry = () => (loaded.value.has('find') ? html`<button class="sidebar-settings sidebar-find" aria-keyshortcuts=${SHORTCUTS.find}
  @click=${() => { app.dialog.value = 'find' }}>${icons.search}${t('cap.find.name')}${keys(SHORTCUTS.find)}</button>` : nothing)

// ─── The user, at the foot (D150) ────────────────────────────────────────────

/** @typedef {'actions' | 'languages' | 'looks'} Page */
/** What the user's menu shows: its actions, the languages, or the looks. */
const page = signal(/** @type {Page} */ ('actions'))

/** A name's first letter as it is read: a letter with its marks, upper case where the script has one. @param {string} name */
const initial = (name) => ([...new Intl.Segmenter(locale.value).segment(name)][0]?.segment ?? '').toLocaleUpperCase(locale.value)

/** Opens Settings on a section, from the menu. */
const toSettings = (/** @type {import('./dialogs.js').Section} */ section) => () => import('./dialogs.js').then((module) => module.openSettings(section))

/** Shows another page of the menu, with the keyboard on what it is about: the choice made, or the row it came from. @param {Event} event @param {Page} next */
async function turn(event, next) {
  const menu = /** @type {HTMLElement} */ (event.currentTarget).closest('[popover]')
  const from = page.value
  // The themes' thumbnails are drawn by the dialogs' style sheet, which comes with them (D120, D154).
  if (next === 'looks') await import('./dialogs.js')
  page.value = next
  requestAnimationFrame(() => /** @type {HTMLElement | null | undefined} */ (menu?.querySelector(next === 'actions' ? `[data-page="${from}"]` : '[aria-current="true"]'))?.focus())
}

/** The look chosen, which shows once its style sheet is in. */
const chosenLook = () => lookId(effective.value.settings.look?.id)

/** The menu's actions: Settings and what is often reached for there, then the manifesto. @param {string} id */
function actions(id) {
  const dark = theme.value === 'dark'
  const fixed = effective.value.locked.has('locale')
  return html`<button type="button" popovertarget=${id} popovertargetaction="hide" aria-keyshortcuts=${SHORTCUTS.settings}
      @click=${toSettings('general')}>${icons.gear}${t('settings.title')}${keys(SHORTCUTS.settings)}</button>
    <button type="button" popovertarget=${id} popovertargetaction="hide" @click=${toSettings('you')}>${icons.person}${t('settings.you')}</button>
    <button type="button" class="submenu" data-page="languages" ?disabled=${fixed} @click=${(/** @type {Event} */ e) => turn(e, 'languages')}>
      ${icons.language}${t('settings.language')}<span class="menu-value" lang=${locale.value}>${languageName(locale.value)}</span>${icons.chevron}</button>
    <button type="button" class="submenu" data-page="looks" @click=${(/** @type {Event} */ e) => turn(e, 'looks')}>
      ${icons.palette}${t('look.title')}<span class="menu-value">${t(`look.${chosenLook()}.name`)}</span>${icons.chevron}</button>
    <button type="button" role="switch" aria-checked=${dark ? 'true' : 'false'} aria-keyshortcuts=${SHORTCUTS.theme} @click=${switchTheme}>
      ${icons.contrast}${t('profile.dark')}${keys(SHORTCUTS.theme)}</button>
    <button type="button" popovertarget=${id} popovertargetaction="hide" @click=${toSettings('capabilities')}>${icons.tiles}${t('collection.title', { name: BRAND.name })}</button>
    <hr>
    <a href="manifesto.html" target="_blank" rel="noopener" @click=${(/** @type {Event} */ e) => /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.currentTarget).closest('[popover]'))?.hidePopover()}>
      ${icons.book}${t('profile.manifesto')}${icons.arrow}</a>`
}

/** A page of choices: its title, which goes back, then each choice, the one in use marked. @param {string} title @param {unknown} list */
const choices = (title, list) => html`<button type="button" class="back" @click=${(/** @type {Event} */ e) => turn(e, 'actions')}>${icons.arrow}${title}</button>
  <hr>
  ${list}`

/** One choice: picked, it applies at once and the menu stays on its page (D153). @param {boolean} current @param {() => unknown} pick @param {unknown} label @param {string} [lang] */
const choice = (current, pick, label, lang) => html`<button type="button" lang=${lang ?? nothing} aria-current=${current ? 'true' : 'false'}
  @click=${pick}>${label}${current ? icons.check : nothing}</button>`

/** The languages, the browser's first, each in its own words. */
function languages() {
  const yours = preferredLocales(LOCALES, navigator.languages)
  const option = (/** @type {string} */ code) => choice(code === locale.value, () => setLocale(code), languageName(code), code)
  return choices(t('settings.language'), html`${yours.length ? html`${yours.map(option)}<hr>` : nothing}
    ${LOCALES.filter((code) => !yours.includes(code)).map(option)}`)
}

/** The looks, each a small thumbnail and its name, as Settings' Appearance shows them (D111, D154). */
function looks() {
  const chosen = chosenLook()
  return choices(t('look.title'), html`<div class="look-tiles">${(/** @type {import('./looks.js').LookId[]} */ (Object.keys(LOOKS))).map((id) => html`<button
    type="button" class="look-tile" aria-current=${id === chosen ? 'true' : 'false'} @click=${() => pickLook(id)}><span class="look-preview" data-look-preview=${id} aria-hidden="true"><span></span><span></span><span></span></span>${t(`look.${id}.name`)}</button>`)}</div>`)
}

/**
 * Another look. One with a list beside the conversation (Mail's, Human's) moves the user's foot
 * there from the drawer, and one without moves it back: once the look shows, the menu opens
 * again where the foot is, on the same page, unless the user closed it meanwhile (D153).
 * @param {import('./looks.js').LookId} id
 */
function pickLook(id) {
  setLook({ id })
  const stop = app.look.subscribe((shown) => {
    if (shown === id) queueMicrotask(() => { stop(); requestAnimationFrame(follow) })
  })
}

async function follow() {
  if (page.value !== 'looks') return
  const list = document.querySelector('app-inbox .profile')
  const where = list?.checkVisibility() ? 'list' : 'drawer'
  const open = /** @type {HTMLElement | null} */ (document.querySelector('.profile-menu:popover-open'))
  if (open?.id === `profile-${where}`) return
  if (where === 'drawer') await import('./dialogs.js')
  open?.hidePopover()
  app.dialog.value = where === 'drawer' ? 'history' : null
  const menu = document.getElementById(`profile-${where}`)
  const chosen = /** @type {HTMLElement | null | undefined} */ (menu?.querySelector('[aria-current="true"]'))
  menu?.showPopover()
  chosen?.focus()
}

/**
 * The user at the foot of the conversations, in the drawer or in Mail's list (D150): their initial
 * and their name, or "You" until it is known, opening a menu above them. It goes back to its actions
 * once closed, not when it moves from one foot to the other (D153).
 * @param {'drawer' | 'list'} where
 */
export function profileEntry(where) {
  const name = effective.value.settings.name
  const id = `profile-${where}`
  const shown = page.value
  return html`<button class="sidebar-settings profile" popovertarget=${id}>
      <span class="avatar" aria-hidden="true">${name ? initial(name) : icons.person}</span>
      <span class="profile-name" dir="auto">${name || t('profile.you')}</span>${icons.chevron}
    </button>
    <div id=${id} class="menu profile-menu" popover @toggle=${(/** @type {ToggleEvent} */ e) => {
      if (e.newState === 'closed' && !document.querySelector('.profile-menu:popover-open')) page.value = 'actions'
    }}>${shown === 'languages' ? languages() : shown === 'looks' ? looks() : actions(id)}</div>`
}

class Inbox extends Element {
  render() {
    return html`<button class="button wide" aria-keyshortcuts=${SHORTCUTS.new} @click=${() => turnPage(newConversation)}>${icons.plus} ${t('action.new')}</button>
      ${findEntry()}
      ${conversationList()}
      ${profileEntry('list')}`
  }
}

define('app-inbox', Inbox)
