// The drawer, after Manus' (D165): a new task, where each capability found leads, the tasks and
// the user at its foot, whose menu holds Settings, like the Claude apps' sidebar (D115, D150). On a
// wide window it stays open beside the conversation (Mail's list, D111), the header's name, Search
// (D133) and the button that puts it away above it; otherwise it slides over it, with those two.
import { html, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, effective, sidebarOpen, newConversation, openConversation, removeConversation, turnPage, switchTheme, setLocale, setLook, setSidebar, notify, chosenLook, offeredLocales, sitePage, legalPages, SHORTCUTS } from './state.js'
import { OWN, offeredLooks, baseOf } from './looks.js'
import { oneRowEach } from '../core/conversations.js'
import { serviceURL } from '../core/settings.js'
import { loaded, slots, unlock, isDenied } from './caps.js'
import { act } from './acts.js'
import { BRAND } from '../brand.js'
import { t, locale, intlLocales, languageName, preferredLocales } from '../core/i18n.js'
import { icons } from './menu-icons.js'
import { focusComposer } from './composer.js'
import { place, all as creations, show, reread } from './creations.js'

/** Routines whose earlier runs the user unfolded or folded in the list, by the routine's file (D122). */
const folds = signal(/** @type {Map<string, boolean>} */ (new Map()))
/** The task whose name is being changed, by its menu's id (D288). */
const renaming = signal(/** @type {string | null} */ (null))
/** A task named, pinned or marked read or unread (D288). @param {Parameters<typeof import('./title.js').markConversation>} args */
const mark = async (...args) => (await import('./title.js')).markConversation(...args)

/**
 * The tasks, newest first, the open one marked (D165), those the user pinned under their own
 * heading above the others, a bubble before each, with the creations pinned, each with its kind's glyph (D605).
 * One being answered has a light before its name, ringed while a decision waits there (D147), and one answered since it was last open a still one (D288).
 * What can be done with one is in a menu at its end (D181), saving it as a web page too (D305); a double click renames it too. A routine's runs are one row, its newest, which unfolds the earlier
 * ones under it by date; unfolded while one of them is open or under way (D122). Tab stops once
 * per task; the arrows do the rest (move).
 * @param {'drawer' | 'list'} where
 */
function conversationList(where) {
  const all = oneRowEach(app.conversations.value)
  const pinned = all.filter((item) => item.pinned), kept = creations.value.filter((item) => item.pinned)
  return html`${pinned.length || kept.length ? html`<h2 class="sidebar-heading">${t('history.pinned')}</h2>${pinned.length ? taskList(where, pinned) : nothing}${kept.length ? keptList(where, kept) : nothing}` : nothing}
    <h2 class="sidebar-heading">${t('history.title')}</h2>
    ${pinned.length < all.length ? taskList(where, all.filter((item) => !item.pinned)) : pinned.length ? nothing : html`<p class="muted">${t('history.empty')}</p>`}`
}

/** One list of tasks. @param {'drawer' | 'list'} where @param {ReturnType<typeof oneRowEach>} list */
function taskList(where, list) {
  const currentId = app.current.value?.id
  const running = app.running.value
  const waiting = [...app.decisions.value.map((decision) => decision.conversation), app.offering.value?.conversation]
  const [when, count] = [new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'medium', timeStyle: 'short' }), new Intl.NumberFormat(intlLocales())]
  const rows = list.flatMap((item) => {
    const earlier = item.earlier ?? []
    const open = earlier.some((run) => run.id === currentId || running.includes(run.path)) || Boolean(folds.value.get(item.routine ?? ''))
    return [{ item, earlier, open, run: false }, ...(open ? earlier.map((run) => ({ item: run, earlier: [], open: false, run: true })) : [])]
  })
  /** @param {string} routine @param {boolean} open */
  const fold = (routine, open) => { folds.value = new Map(folds.value).set(routine, !open) }
  return html`<ol class="history-list" @keydown=${move}>${repeat(rows, ({ item }) => item.id, ({ item, earlier, open, run }) => {
    const asks = running.includes(item.path) ? waiting.filter((path) => path === item.path).length : -1
    const menu = `task-${where}-${item.id}`
    const name = run ? when.format(new Date(item.createdAt)) : item.title || t('conversation.untitled')
    if (renaming.value === menu) return html`<li><input dir="auto" aria-label=${t('action.rename')} placeholder=${t('conversation.untitled')} .value=${item.title}
      @keydown=${(/** @type {KeyboardEvent} */ e) => named(e, item, menu)} @blur=${(/** @type {FocusEvent} */ e) => named(e, item, menu)}></li>`
    return html`<li class="${item.id === currentId ? 'is-current' : ''} ${run ? 'is-run' : ''}">
      <button class="history-item" aria-current=${item.id === currentId ? 'true' : 'false'}
        @click=${() => turnPage(() => openConversation(item.path))} @dblclick=${() => item.routine || rename(menu)}>
        ${asks < 0 ? item.unread ? html`<span class="ember" role="img" data-unread aria-label=${t('history.unread')}></span>` : nothing
          : html`<span class="ember" role="img" ?data-waiting=${asks} aria-label=${asks ? t('inbox.waiting', { count: asks }) : t('activity.working')}></span>`}
        ${item.routine && !run ? icons.alarm : item.pinned ? icons.task : nothing}<span class="history-title" dir="auto">${name}</span>
      </button>
      ${earlier.length ? html`<button class="runs-toggle" tabindex="-1" aria-expanded=${open} aria-label=${t('history.runs', { count: earlier.length })}
        @click=${() => fold(item.routine ?? '', open)}>${count.format(earlier.length)}${icons.chevron}</button>` : nothing}
      <button class="icon-button subtle" tabindex="-1" popovertarget=${menu} aria-label=${t('action.more')}>${icons.more}</button>
      <div id=${menu} class="menu task-menu" popover>${item.routine ? nothing : [
        action(menu, icons.pin, t(item.pinned ? 'action.unpin' : 'action.pin'), () => mark(item.path, { pinned: !item.pinned })),
        action(menu, icons.compose, t('action.rename'), () => rename(menu))]}
        ${action(menu, item.unread ? icons.check : icons.dot, t(item.unread ? 'history.markRead' : 'history.markUnread'), () => mark(item.path, { unread: !item.unread }))}
        ${action(menu, icons.download, t('history.save'), () => saveCopy(item), item.id === currentId ? SHORTCUTS.save : undefined)}
        ${slots('task').map((part) => part.draw(item, (/** @type {unknown} */ icon, /** @type {string} */ label, /** @type {(event: Event) => unknown} */ act, /** @type {string} */ shortcut) => action(menu, icon, label, act, item.id === currentId ? shortcut : undefined)))}
        ${action(menu, icons.trash, t('action.delete'), () => deleteTask(item.path))}</div>
    </li>`
  })}</ol>`
}

/** The creations pinned, as the tasks are listed: each opens beside the task, and its menu unpins it. @param {'drawer' | 'list'} where @param {typeof creations.value} list */
const keptList = (where, list) => html`<ol class="history-list" @keydown=${move}>${list.map((item) => { const menu = `kept-${where}-${item.path}`; return html`<li>
  <button class="history-item" @click=${show(item)}>${item.kind.draw()}<span class="history-title" dir="auto">${item.name}</span></button>
  <button class="icon-button subtle" tabindex="-1" popovertarget=${menu} aria-label=${t('action.more')}>${icons.more}</button>
  <div id=${menu} class="menu task-menu" popover>${action(menu, icons.pin, t('action.unpin'), () => item.kind.pin(item, false).then(reread))}</div></li>` })}</ol>`

/** One of a task's actions, which closes its menu, with its keys on the open task's. @param {string} menu @param {unknown} icon @param {string} label @param {(event: Event) => unknown} act @param {string} [shortcut] */
const action = (menu, icon, label, act, shortcut) => html`<button type="button" popovertarget=${menu} popovertargetaction="hide" aria-keyshortcuts=${shortcut ?? nothing}
  @click=${act}>${icon}${label}${shortcut ? keys(shortcut) : nothing}</button>`

/** Saves a copy of a task as a web page (D305), from its menu or ⌘S; sharing it by link is found then, where a host is named (D361). @param {{ path: string, title: string }} task */
export const saveCopy = async (task) => {
  await import('./export.js').then((module) => module.saveTask(app.fs, task))
  act('task.save', { task: task.path })
  if (serviceURL('share', app.settings.value, app.policy) && app.policy.rules?.share !== 'never') unlock('share')
}

/** Deletes a task once the user says so, from its menu (D313). @param {string} path */
export const deleteTask = async (path) => { if (confirm(t('history.confirmDelete'))) await removeConversation(path) }

/** A box in the task's place for its new name. @param {string} menu */
function rename(menu) {
  renaming.value = menu
  requestAnimationFrame(() => {
    const box = /** @type {HTMLInputElement | null} */ (document.querySelector('.history-list input'))
    box?.focus()
    box?.select()
  })
}

/**
 * Enter or leaving the box names the task, Escape doesn't, and the keyboard goes back to it.
 * @param {KeyboardEvent | FocusEvent} event @param {import('../core/types.js').ConversationSummary} item @param {string} menu
 */
function named(event, item, menu) {
  const key = event instanceof KeyboardEvent ? event.key : ''
  if (renaming.peek() !== menu || (event instanceof KeyboardEvent && (event.isComposing || !['Enter', 'Escape'].includes(key)))) return
  event.preventDefault()
  event.stopPropagation()
  const title = /** @type {HTMLInputElement} */ (event.target).value.trim()
  renaming.value = null
  if (key !== 'Escape' && title && title !== item.title) mark(item.path, { title })
  if (key) requestAnimationFrame(() => /** @type {HTMLElement | null | undefined} */ (document.getElementById(menu)?.closest('li')?.querySelector('.history-item'))?.focus())
}

/**
 * The keyboard in the lists: ↑ ↓ go from task to task, pinned or not, Home and End to the first
 * and the last, and ← → along a task to its count and its ⋮ button, the other way round right to left.
 * @param {KeyboardEvent} event
 */
function move(event) {
  const list = /** @type {HTMLElement} */ (event.currentTarget)
  const from = /** @type {HTMLElement} */ (event.target)
  const along = [...from.closest('li')?.querySelectorAll(':scope > button') ?? []]
  const at = along.indexOf(from)
  if (at < 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const tasks = [...list.parentElement?.querySelectorAll('.history-list > li > .history-item') ?? []]
  const row = tasks.indexOf(along[0])
  const [back, on] = list.matches(':dir(rtl)') ? ['ArrowRight', 'ArrowLeft'] : ['ArrowLeft', 'ArrowRight']
  const to = new Map([['ArrowDown', tasks[row + 1]], ['ArrowUp', tasks[row - 1]], ['Home', tasks[0]], ['End', tasks.at(-1)], [on, along[at + 1]], [back, along[at - 1]]]).get(event.key)
  if (!(to instanceof HTMLElement)) return
  event.preventDefault()
  to.focus()
}

/** The shortcut that goes back where this one goes on: ⌘⌥⇧E beside ⌘⇧E (D584). @param {string} shortcut */
export const backwards = (shortcut) => shortcut.replace('+', '+Alt+')
/** A shortcut as the keyboard shows it: ⌘⌥⇧L and ⇧↩ on Apple's systems, Ctrl+Alt+Shift+L and Shift+Enter elsewhere. @param {string} shortcut */
export const keyNames = (shortcut) => (SHORTCUTS.new.startsWith('Meta') ? shortcut.replace('Meta+', '⌘').replace('Alt+', '⌥').replace('Shift+', '⇧').replace('Enter', '↩')
  : shortcut.replace('Control', 'Ctrl')).replace('Escape', 'Esc').replace('ArrowUp ArrowDown', '↑ ↓')
/** The same, left to right in any language. @param {string} shortcut */
const keys = (shortcut) => html`<kbd aria-hidden="true"><bdi dir="ltr">${keyNames(shortcut)}</bdi></kbd>`

/** Where a capability found leads, under a new task, as Manus lists its own: its section of Settings. Skills and Connections are only in Settings (D554). */
const PLACES = /** @type {const} */ ([['routines', 'alarm']])

/**
 * What the drawer holds, open beside the conversation or over it: a new task, which brings the
 * keyboard to the box, the places found, Creations once there are some (D497), the tasks under their heading, and the user at its foot.
 * @param {'drawer' | 'list'} where
 */
export const sidebarBody = (where) => html`<button class="place" aria-keyshortcuts=${SHORTCUTS.new}
    @click=${() => turnPage(newConversation).then(focusComposer)}>${icons.compose}${t('action.new')}</button>
  ${PLACES.filter(([id]) => loaded.value.has(id)).map(([id, icon]) => html`<button class="place"
    @click=${() => import('./dialogs.js').then((module) => module.openSettings(id))}>${icons[icon]}${t(`cap.${id}.name`)}</button>`)}
  ${place()}
  ${conversationList(where)}
  ${profileEntry(where)}`

// ─── The user, at the foot (D150) ────────────────────────────────────────────

/** @typedef {'actions' | 'languages' | 'looks' | 'pages'} Page */
/** What the user's menu shows: its actions, the languages, the looks, or the pages to learn more on. */
const page = signal(/** @type {Page} */ ('actions'))

/** A name's first letter as it is read: a letter with its marks, upper case where the script has one. @param {string} name */
const initial = (name) => ([...new Intl.Segmenter(locale.value).segment(name)][0]?.segment ?? '').toLocaleUpperCase(locale.value)

/** Opens Settings on a section, from the menu. */
const toSettings = (/** @type {import('./dialogs.js').Section} */ section) => () => import('./dialogs.js').then((module) => module.openSettings(section))

/** Shows another page of the menu, with the keyboard on what it is about: the choice made, else its way back, or the row it came from. @param {Event} event @param {Page} next */
async function turn(event, next) {
  const menu = /** @type {HTMLElement} */ (event.currentTarget).closest('[popover]')
  const from = page.value
  // The themes' thumbnails are drawn by the dialogs' style sheet, which comes with them (D120, D154).
  if (next === 'looks') await import('./dialogs.js')
  page.value = next
  requestAnimationFrame(() => /** @type {HTMLElement | null | undefined} */ (menu?.querySelector(next === 'actions' ? `[data-page="${from}"]` : '[aria-current="true"]') ?? menu?.querySelector('.back'))?.focus())
}

/** A look's name: the organisation's (D500), or one of Jean's in the user's language. @param {string} id */
export const lookName = (id) => (id === OWN ? app.policy.look.name : t(`look.${id}.name`, { name: BRAND.name }))

/** The menu's actions: the profiles, or adding one (D228), then Settings and what is often reached for there. @param {string} id */
function actions(id) {
  const fixed = effective.value.locked.has('locale')
  return html`${loaded.value.has('profiles') ? slots('profiles').map((part) => part.draw(id)) : app.ephemeral.value || isDenied('profiles') ? nothing
      : html`<button type="button" popovertarget=${id} popovertargetaction="hide" @click=${() => import('../caps/profiles/profiles.js').then((module) => module.add())}>${icons.plus}${t('profiles.add')}</button><hr>`}
    <button type="button" popovertarget=${id} popovertargetaction="hide" aria-keyshortcuts=${SHORTCUTS.settings}
      @click=${toSettings('general')}>${icons.gear}${t('settings.title')}${keys(SHORTCUTS.settings)}</button>
    <button type="button" class="submenu" data-page="languages" ?disabled=${fixed} @click=${(/** @type {Event} */ e) => turn(e, 'languages')}>
      ${icons.language}${t('settings.language')}<span class="menu-value" lang=${locale.value}>${languageName(locale.value)}</span>${icons.chevron}</button>
    <button type="button" class="submenu" data-page="looks" ?disabled=${offeredLooks(app.policy).length < 2} @click=${(/** @type {Event} */ e) => turn(e, 'looks')}>
      ${icons.palette}${t('look.title')}<span class="menu-value">${lookName(chosenLook.value)}</span>${icons.chevron}</button>
    <button type="button" aria-keyshortcuts=${SHORTCUTS.theme} @click=${switchTheme}>
      ${icons.moon}${t('settings.mode')}<span class="menu-value">${t(`theme.${app.chosenTheme.value ?? 'auto'}`)}</span>${keys(SHORTCUTS.theme)}</button>
    <button type="button" popovertarget=${id} popovertargetaction="hide" @click=${toSettings('capabilities')}>${icons.trophy}${t('collection.title', { name: BRAND.name })}</button>
    ${links().length ? html`<button type="button" class="submenu" data-page="pages" @click=${(/** @type {Event} */ e) => turn(e, 'pages')}>${icons.signpost}${t('learn.title')}${icons.chevron}</button>` : nothing}
    ${slots('profile').map((part) => part.draw(id))}`
}

/**
 * The pages to learn more on, in groups (D538): About, the page about Jean, then whom Jean is for, on the brand's own site and from its
 * desktop app; then where files go, the privacy policy and the terms, which every copy has.
 */
const links = () => /** @type {Array<Array<[string, string]>>} */ ([[['welcome.about', sitePage('about')]], [['learn.family', sitePage('family')], ['learn.work', sitePage('work')],
  ['learn.teachers', sitePage('teachers')], ['learn.it', sitePage('enterprise')]], legalPages().map(([name, url]) => [`welcome.${name}`, url])].map((group) => group.filter(([, url]) => url)).filter((group) => group.length))

/** Each page to learn more on, opened in a new tab, which About Jean's page can hand a Try back from (site/about/). @param {string} id */
const pages = (id) => choices(t('learn.title'), links().map((group, i) => html`${i ? html`<hr>` : nothing}${group.map(([key, url]) => html`<button type="button" class="outside"
  popovertarget=${id} popovertargetaction="hide" @click=${() => open(url)}>${t(key)}${icons.external}</button>`)}`))

/** A page of choices: its title, which goes back, then each choice, the one in use marked. @param {string} title @param {unknown} list */
const choices = (title, list) => html`<button type="button" class="back" @click=${(/** @type {Event} */ e) => turn(e, 'actions')}>${icons.back}${title}</button>
  <hr>
  ${list}`

/** One choice: picked, it applies at once and the menu stays on its page (D153). @param {boolean} current @param {() => unknown} pick @param {unknown} label @param {string} [lang] */
const choice = (current, pick, label, lang) => html`<button type="button" lang=${lang ?? nothing} aria-current=${current ? 'true' : 'false'}
  @click=${pick}>${label}${current ? icons.check : nothing}</button>`

/** The languages offered (D500), the browser's first, each in its own words. */
function languages() {
  const yours = preferredLocales(offeredLocales(), navigator.languages)
  const option = (/** @type {string} */ code) => choice(code === locale.value, () => setLocale(code), languageName(code), code)
  return choices(t('settings.language'), html`${yours.length ? html`${yours.map(option)}<hr>` : nothing}
    ${offeredLocales().filter((code) => !yours.includes(code)).map(option)}`)
}

/** The looks offered (D500), each a small thumbnail and its name, as Settings' Appearance shows them (D111, D154). */
function looks() {
  const chosen = chosenLook.value
  return choices(t('look.title'), html`<div class="look-tiles">${offeredLooks(app.policy).map((id) => html`<button
    type="button" class="look-tile" aria-current=${id === chosen ? 'true' : 'false'} @click=${() => pickLook(id)}><span class="look-preview" data-look-preview=${baseOf(id, app.policy)} aria-hidden="true"><span></span><span></span><span></span></span>${lookName(id)}</button>`)}</div>`)
}

/**
 * Another look. The drawer open beside the conversation stays open whatever the new look would
 * have, since the user is in it, and the menu stays on its page (D153, D165).
 * @param {string} id
 */
function pickLook(id) {
  if (sidebarOpen.value && app.sidebar.value === null) setSidebar(true)
  setLook({ id })
}

/** The next look, in the gallery's order, the first again after the last, or the one before, its name shown, unless policy offers one (⌘⇧E, ⌘⌥⇧E, D238, D500, D584). @param {boolean} back */
export function nextLook(back) {
  const ids = offeredLooks(app.policy)
  if (ids.length < 2) return
  const id = ids[(ids.indexOf(chosenLook.value) + (back ? ids.length - 1 : 1)) % ids.length]
  setLook({ id })
  notify(lookName(id))
}

/** The next language, in the menu's order, the browser's first, or the one before, its name shown in its own words, unless policy sets it (⌘⇧L, ⌘⌥⇧L, D253, D584). @param {boolean} back */
export async function nextLanguage(back) {
  if (effective.value.locked.has('locale')) return
  const yours = preferredLocales(offeredLocales(), navigator.languages)
  const codes = [...yours, ...offeredLocales().filter((code) => !yours.includes(code))]
  const code = codes[(codes.indexOf(locale.value) + (back ? codes.length - 1 : 1)) % codes.length]
  await setLocale(code)
  notify(languageName(code))
}

/**
 * The user at the foot of the drawer, open beside the conversation or over it (D150, D165): their
 * initial and their name, the first name they set or else the first that capabilities' `person` slot
 * gives (the profile's, then what the account they signed in with calls them), or "You" until one is
 * known, opening a menu above them.
 * It goes back to its actions once closed.
 * @param {'drawer' | 'list'} where
 */
export function profileEntry(where) {
  const name = effective.value.settings.name || /** @type {string | undefined} */ (slots('person').map((part) => part.draw()).find(Boolean))
  const id = `profile-${where}`
  const shown = page.value
  return html`<button class="sidebar-settings profile" popovertarget=${id}>
      <span class="avatar" aria-hidden="true">${name ? initial(name) : icons.person}</span>
      <span class="profile-name" dir="auto">${name || t('profile.you')}</span>${icons.chevron}
    </button>
    <div id=${id} class="menu profile-menu" popover @toggle=${(/** @type {ToggleEvent} */ e) => {
      if (e.newState === 'closed' && !document.querySelector('.profile-menu:popover-open')) page.value = 'actions'
    }}>${shown === 'languages' ? languages() : shown === 'looks' ? looks() : shown === 'pages' ? pages(id) : actions(id)}</div>`
}

class Inbox extends Element {
  render() {
    return sidebarBody('list')
  }
}

define('app-inbox', Inbox)
