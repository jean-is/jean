// The drawer, after Manus' (D165): a new task, where each capability found leads, the tasks and
// the user at its foot, whose menu holds Settings, like the Claude apps' sidebar (D115, D150). On a
// wide window it stays open beside the conversation (Mail's list, D111), the header's name, Search
// (D133) and the button that puts it away above it; otherwise it slides over it, with those two.
import { html, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, effective, theme, sidebarOpen, newConversation, openConversation, removeConversation, turnPage, switchTheme, setLocale, setLook, setSidebar, notify, LOCALES, SHORTCUTS } from './state.js'
import { LOOKS, lookId } from './looks.js'
import { oneRowEach } from '../core/conversations.js'
import { loaded } from './caps.js'
import { BRAND } from '../brand.js'
import { t, locale, languageName, preferredLocales } from '../core/i18n.js'
import { icons } from './icons.js'
import { focusComposer } from './composer.js'

/** Routines whose earlier runs the user unfolded or folded in the list, by the routine's file (D122). */
const folds = signal(/** @type {Map<string, boolean>} */ (new Map()))

/**
 * The tasks, newest first, the open one marked (D165). One started before the open one (ULIDs
 * sort by time), or any from a new page, is back (D125). One being answered has a light before its name, ringed while a decision waits there (D147).
 * What can be done with one is in a menu at its end (D181). A routine's runs are one row, its newest, which unfolds the earlier
 * ones under it by date; unfolded while one of them is open or under way (D122).
 * @param {'drawer' | 'list'} where
 */
function conversationList(where) {
  const currentId = app.current.value?.id
  const running = app.running.value
  const waiting = [...app.decisions.value.map((decision) => decision.conversation), app.offering.value?.conversation]
  const [when, count] = [new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }), new Intl.NumberFormat(locale.value)]
  const rows = oneRowEach(app.conversations.value).flatMap((item) => {
    const earlier = item.earlier ?? []
    const open = earlier.some((run) => run.id === currentId || running.includes(run.path)) || Boolean(folds.value.get(item.routine ?? ''))
    return [{ item, earlier, open, run: false }, ...(open ? earlier.map((run) => ({ item: run, earlier: [], open: false, run: true })) : [])]
  })
  /** @param {string} routine @param {boolean} open */
  const fold = (routine, open) => { folds.value = new Map(folds.value).set(routine, !open) }
  return rows.length ? html`<ol class="history-list">${repeat(rows, ({ item }) => item.id, ({ item, earlier, open, run }) => {
    const asks = running.includes(item.path) ? waiting.filter((path) => path === item.path).length : -1
    const menu = `task-${where}-${item.id}`
    return html`<li class="${item.id === currentId ? 'is-current' : ''} ${run ? 'is-run' : ''}">
      <button class="history-item" aria-current=${item.id === currentId ? 'true' : 'false'}
        @click=${() => turnPage(() => openConversation(item.path), !currentId || item.id < currentId)}>
        ${asks < 0 ? nothing : html`<span class="ember" role="img" ?data-waiting=${asks} aria-label=${asks ? t('inbox.waiting', { count: asks }) : t('activity.working')}></span>`}
        ${item.routine && !run ? icons.alarm : nothing}<span class="history-title" dir="auto">${run ? when.format(new Date(item.createdAt)) : item.title || t('conversation.untitled')}</span>
      </button>
      ${earlier.length ? html`<button class="runs-toggle" aria-expanded=${open} aria-label=${t('history.runs', { count: earlier.length })}
        @click=${() => fold(item.routine ?? '', open)}>${count.format(earlier.length)}${icons.chevron}</button>` : nothing}
      <button class="icon-button subtle" popovertarget=${menu} aria-label=${t('action.more')}>${icons.more}</button>
      <div id=${menu} class="menu task-menu" popover><button type="button" popovertarget=${menu} popovertargetaction="hide"
        @click=${() => confirm(t('history.confirmDelete')) && removeConversation(item.path)}>${icons.trash}${t('action.delete')}</button></div>
    </li>`
  })}</ol>` : html`<p class="muted">${t('history.empty')}</p>`
}

/** A shortcut as the keyboard shows it: ⌘⇧D and ⇧↩ on Apple's systems, Ctrl+Shift+D and Shift+Enter elsewhere. @param {string} shortcut */
export const keyNames = (shortcut) => (SHORTCUTS.new.startsWith('Meta') ? shortcut.replace('Meta+', '⌘').replace('Shift+', '⇧').replace('Enter', '↩')
  : shortcut.replace('Control', 'Ctrl')).replace('Escape', 'Esc').replace('ArrowUp ArrowDown', '↑ ↓')
/** The same, left to right in any language. @param {string} shortcut */
const keys = (shortcut) => html`<kbd aria-hidden="true"><bdi dir="ltr">${keyNames(shortcut)}</bdi></kbd>`

/** Where a capability found leads, under a new task, as Manus lists its own: its section of Settings, in Settings' order. */
const PLACES = /** @type {const} */ ([['connections', 'plug'], ['skills', 'scroll'], ['routines', 'alarm']])

/**
 * What the drawer holds, open beside the conversation or over it: a new task, which brings the
 * keyboard to the box, the places found, the tasks under their heading, and the user at its foot.
 * @param {'drawer' | 'list'} where
 */
export const sidebarBody = (where) => html`<button class="place" aria-keyshortcuts=${SHORTCUTS.new}
    @click=${() => turnPage(newConversation).then(focusComposer)}>${icons.compose}${t('action.new')}</button>
  ${PLACES.filter(([id]) => loaded.value.has(id)).map(([id, icon]) => html`<button class="place"
    @click=${() => import('./dialogs.js').then((module) => module.openSettings(id))}>${icons[icon]}${t(`cap.${id}.name`)}</button>`)}
  <h2 class="sidebar-heading">${t('history.title')}</h2>
  ${conversationList(where)}
  ${profileEntry(where)}`

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

/** The menu's actions: Settings and what is often reached for there. @param {string} id */
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
    <button type="button" popovertarget=${id} popovertargetaction="hide" @click=${toSettings('capabilities')}>${icons.tiles}${t('collection.title', { name: BRAND.name })}</button>`
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
 * Another look. The drawer open beside the conversation stays open whatever the new look would
 * have, since the user is in it, and the menu stays on its page (D153, D165).
 * @param {import('./looks.js').LookId} id
 */
function pickLook(id) {
  if (sidebarOpen.value && app.sidebar.value === null) setSidebar(true)
  setLook({ id })
}

/** The next look, in the gallery's order, Human again after the last, its name shown (⌘⇧E, D238). */
export function nextLook() {
  const ids = Object.keys(LOOKS)
  const id = ids[(ids.indexOf(chosenLook()) + 1) % ids.length]
  setLook({ id })
  notify(t(`look.${id}.name`))
}

/**
 * The user at the foot of the drawer, open beside the conversation or over it (D150, D165): their
 * initial and their name, or "You" until it is known, opening a menu above them. It goes back to
 * its actions once closed.
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
    return sidebarBody('list')
  }
}

define('app-inbox', Inbox)
