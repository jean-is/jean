// The room: header, welcome or conversation, composer, dialogs, toasts.
import { html, nothing } from 'lit-html'
import { effect, signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, newConversation, turnPage, assistantName, switchTheme, sidebarOpen, toggleSidebar, firstVisit, pairs, APPLE, SHORTCUTS } from './state.js'
import { loaded, unlock, isDenied, slots } from './caps.js'
import { BRAND } from '../brand.js'
import { t, tParts, locale } from '../core/i18n.js'
import { icons } from './icons.js'
import { focusComposer, offerAside } from './composer.js'
import { toggleDictation } from './dictation.js'
import './chat.js'
import './persona.js'

// jean.is's page (D397): on a first visit, at ?index=1 or from Homepage, until a request (ui/home.js).
const under = /** @type {HTMLElement | null} */ (document.querySelector('body > .home'))
if (under) under.hidden = true
export const homepage = signal(new URLSearchParams(location.search).has('index'))

class Shell extends Element {
  connectedCallback() {
    super.connectedCallback()
    if (under) effect(() => { const empty = !app.current.value?.records.length, lang = locale.value; if (!empty) homepage.value = false; const shown = (homepage.value || firstVisit()) && empty; under.hidden ||= !shown; import('./home.js').then((module) => module.follow(under, shown, lang)) })
  }

  render() {
    const current = app.current.value
    const open = sidebarOpen.value
    // Open beside the conversation (D165), the drawer has the header's top as its own. What opens beside the conversation
    // keeps the main area's top end (D170), after the folder's name (D149), each its capability's, in the views slot.
    const shown = slots('views')
    const views = shown.length ? html`<div class="views">${shown.map((view) => view.draw(current))}</div>` : nothing
    // A capability may take the welcome's place: Flows' flow mode (D218), or a part of the board (D635).
    const instead = current?.records.length ? null : slots('main').map((main) => main.draw()).find(Boolean)
    return html`
      <a class="skip" href="#main">${t('a11y.main')}</a><a class="skip" href="#prompt">${t('a11y.skip')}</a>
      <header class="bar">
        <button class="icon-button sidebar-toggle" @click=${toggleSidebar} aria-expanded=${app.wide.value ? String(open) : nothing} aria-keyshortcuts=${SHORTCUTS.sidebar}
          aria-label=${t(open ? 'sidebar.close' : 'sidebar.open')}>${icons.sidebar}</button>
        ${loaded.value.has('projects') ? html`<app-projects></app-projects>`
          : html`<button class="wordmark" @click=${() => turnPage(newConversation)} title=${t('action.new')} aria-keyshortcuts=${SHORTCUTS.new}><app-persona></app-persona><span dir=${/[\u0590-\u08FF]/.test(assistantName()) ? 'rtl' : 'ltr'} translate="no">${assistantName()}</span></button>`}
        ${findButton()}${open ? nothing : views}
      </header>
      ${open ? html`<app-inbox role="complementary" aria-label=${t('history.title')}></app-inbox>${views}` : nothing}
      ${app.ephemeral.value ? html`<p class="notice" role="alert">${t('storage.ephemeral')}</p>` : nothing}
      <p class="print-mark"><app-persona still></app-persona><span dir=${/[\u0590-\u08FF]/.test(BRAND.name) ? 'rtl' : 'ltr'}>${BRAND.name}<small dir="ltr">${BRAND.domain}</small></span></p>
      <div class="board"><div class="here">${under && !current?.records.length && !instead && !app.docked.value && (homepage.value || firstVisit()) ? html`<div class="main">${welcome()}</div>` : html`<main id="main">${current?.records.length ? html`<app-conversation></app-conversation>` : instead ?? welcome()}</main>`}
      ${current?.records.length ? offerAside() : nothing}
      ${slots('above').map((above) => above.draw())}
      <app-composer></app-composer></div></div>
      <app-history></app-history>
      <app-find></app-find>
      <app-settings></app-settings>
      <app-picker></app-picker>
      <app-project-dialog></app-project-dialog>
      ${slots('dialog').map((dialog) => dialog.draw())}
      <app-toasts class="toasts" popover="manual"></app-toasts>
      <div class="drop-zone" aria-hidden="true"><p>${t('files.drop')}</p></div>`
  }
}

// The dialogs above are defined the first time one opens, and upgrade then; the drawer open beside the conversation too (D111, D165).
effect(() => {
  if (app.dialog.value) import('./dialogs.js')
  if (sidebarOpen.value) import('./inbox.js')
})

/** Search, there from the start (D5), in the bar, at the top of the drawer while it is open, as in Manus (D165). */
export const findButton = () => (loaded.value.has('find') ? html`<search><button class="icon-button" aria-keyshortcuts=${SHORTCUTS.find}
  aria-label=${t('cap.find.name')} @click=${() => { app.dialog.value = 'find' }}>${icons.search}</button></search>` : nothing)

// ─── Shortcuts ───────────────────────────────────────────────────────────────

// As in the Claude apps, Ctrl outside Apple's systems (D118): each key and why in product.md's Keyboard shortcuts, their names in SHORTCUTS.
/** The key pressed, whatever the keyboard's alphabet: a Cyrillic or Arabic layout still sends the key's place. */
const PLACES = /** @type {Record<string, string>} */ ({ Comma: ',', Slash: '/', KeyN: 'n', KeyO: 'o', KeyD: 'd', KeyE: 'e', KeyL: 'l', KeyP: 'p', KeyS: 's', KeyH: 'h', KeyK: 'k', KeyB: 'b', KeyJ: 'j', KeyU: 'u' })

document.addEventListener('keydown', (event) => {
  const command = APPLE ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  // ⌥ goes back a theme, a language or a profile, by the key's place, never as AltGr, which types Ę and Ł (D584).
  if (!command || event.isComposing || (event.altKey && (!/^Key[ELP]$/.test(event.code) || (!APPLE && event.getModifierState('AltGraph'))))) return
  const key = /^[ -~]$/.test(event.key) && !event.altKey ? event.key.toLowerCase() : PLACES[event.code]
  if (key === ',' && !event.shiftKey) {
    event.preventDefault()
    if (app.dialog.value !== 'settings') import('./dialogs.js').then((module) => module.openSettings())
  } else if (key === '/') {
    event.preventDefault()
    import('./dialogs.js').then((module) => module.sections().includes('keyboard') && module.openSettings('keyboard'))
  } else if (key === (event.shiftKey ? 'o' : 'n')) {
    event.preventDefault()
    turnPage(newConversation)
    focusComposer()
  } else if (key === 'd' && event.shiftKey) {
    event.preventDefault()
    switchTheme()
  } else if ((key === 'e' || key === 'l') && event.shiftKey) {
    event.preventDefault()
    import('./inbox.js').then((module) => (key === 'e' ? module.nextLook : module.nextLanguage)(event.altKey))
  } else if (key === 'p' && event.shiftKey && loaded.value.has('profiles')) {
    event.preventDefault()
    import('../caps/profiles/profiles.js').then((module) => module.nextProfile(event.altKey))
  } else if ((key === 's' || (key === 'h' && loaded.value.has('live'))) && event.shiftKey) {
    event.preventDefault()
    app.dialog.value = null
    if (key === 's') toggleDictation()
    else import('../caps/live/live.js').then((module) => module.toggle())
  } else if (key === 'k' && !event.shiftKey && loaded.value.has('find')) {
    event.preventDefault()
    app.dialog.value = app.dialog.value === 'find' ? null : 'find'
  } else if (key === 'b' && event.shiftKey && loaded.value.has('browser')) {
    event.preventDefault()
    // A dialog over the room closes, and the pane shows.
    const over = app.dialog.value
    app.dialog.value = null
    import('../caps/browser/browser.js').then((module) => (over ? module.show() : module.toggle()))
  } else if (key === 'b' && !event.shiftKey) {
    event.preventDefault()
    // A dialog over the room closes, and the drawer shows.
    const over = app.dialog.value !== null && app.dialog.value !== 'history'
    if (over) app.dialog.value = null
    if (!over || !sidebarOpen.value) toggleSidebar()
  } else if (key === 'j' && !event.shiftKey && !isDenied('computer')) {
    event.preventDefault()
    app.dialog.value = null
    unlock('computer').then(async (ok) => ok && (await import('../caps/computer/terminal.js')).toggle(true))
  } else if ((key === 's' && !event.shiftKey) || (key === 'u' && event.shiftKey && loaded.value.has('share'))) {
    // The task, never the browser's copy of Jean's own page; shared through the dialog that asks how first (D361).
    event.preventDefault()
    const task = app.conversations.value.find((item) => item.path === app.current.value?.path)
    if (task && key === 's') import('./inbox.js').then((module) => module.saveCopy(task))
    else if (task && app.dialog.value !== 'share') import('../caps/share/share.js').then((module) => module.openShare({ path: task.path, title: task.title }))
  }
})

const bringHere = () => unlock('devices').then((on) => { if (on) import('./dialogs.js').then((dialogs) => dialogs.openSettings('devices/join')) })

// Before any task, until Your devices is found, a way to bring Jean here (D726).
function welcome() {
  const bring = !app.conversations.value.length && pairs() && !loaded.value.has('devices') && !isDenied('devices') && !app.ephemeral.value
  return html`<section class="welcome">
    <app-persona></app-persona>
    <h1 class="hero-question">${t('welcome.question')}</h1>
    ${bring ? html`<p class="muted">${tParts('welcome.join', { name: BRAND.name, link: html`<button type="button" class="link-button" @click=${bringHere}>${t('welcome.bring')}</button>` })}</p>` : nothing}
  </section>`
}

/** @type {Toasts | undefined} */
let toasts
/** Where the room has the toasts. @type {{ parent: Node, next: Node | null } | undefined} */
let home

// The toasts, in the top layer, above what is open. A modal dialog makes everything outside it
// inert, so while one is open they go inside it, where their buttons can still be pressed.
class Toasts extends Element {
  connectedCallback() {
    toasts = this
    home ??= { parent: /** @type {Node} */ (this.parentNode), next: this.nextSibling }
    super.connectedCallback()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    // Gone with the dialog they were in: back in the room.
    queueMicrotask(() => { if (!this.isConnected) placeToasts() })
  }

  render() {
    // In Settings, General's foot says a new version is ready, with its Reload (ui/dialogs.js).
    const waiting = app.dialog.value === 'settings' ? null : app.updateReady.value
    const toast = app.toast.value, action = toast?.action, wrong = action && 'alert' in action
    const close = (/** @type {() => void} */ away) => html`<button class="icon-button subtle" aria-label=${t('action.close')} @click=${away}>${icons.close}</button>`
    const said = toast && html`<p class="toast" role=${wrong ? 'alert' : nothing}><span dir="auto">${toast.message}${action && 'undo' in action ? html` ${t('toast.undoFor', { count: toast.seconds })}` : nothing}</span>${action && 'run' in action
      ? html`<button class="button" @click=${() => { app.toast.value = null; action.run() }}>${action.label}</button>` : nothing}${close(() => { app.toast.value = null })}</p>`
    // What went wrong is said at once, the rest in a region there before its words, when the reader gets to them.
    return html`${wrong ? said : nothing}<div role="status"><span class="visually-hidden">${app.said.value}</span>${waiting ? html`<p class="toast">${t('update.ready', { name: BRAND.name })}
      <button class="button primary" @click=${() => import('./update.js').then((update) => update.apply(waiting))}>${t('update.reload')}</button>${close(() => { app.updateReady.value = null })}</p>` : nothing}${wrong ? nothing : said}</div>`
  }

  updated() {
    // Popovers are newer than Jean's floor (D12): without them, the toasts are only fixed in place.
    if (this.showPopover && !this.matches(':popover-open')) this.showPopover()
  }
}

/** Puts the toasts in the open modal dialog, or back where the room has them: each dialog calls it as it opens and closes. */
export function placeToasts() {
  if (!toasts || !home) return
  const dialog = document.querySelector('dialog:modal')
  if (dialog) { if (toasts.parentNode !== dialog) dialog.prepend(toasts) }
  else if (toasts.parentNode !== home.parent) home.parent.insertBefore(toasts, home.next)
}

define('app-toasts', Toasts)
define('app-shell', Shell)
