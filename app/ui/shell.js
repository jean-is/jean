// The room: header, welcome or conversation, composer, dialogs, toasts.
import { html, nothing } from 'lit-html'
import { effect } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, newConversation, turnPage, assistantName, switchTheme, sidebarOpen, toggleSidebar, APPLE, SHORTCUTS } from './state.js'
import { SIZES, loaded, unlock, isDenied, slots } from './caps.js'
import { BRAND } from '../brand.js'
import { t, formatBytes } from '../core/i18n.js'
import { icons } from './icons.js'
import { focusComposer } from './composer.js'
import { toggleDictation } from './dictation.js'
import './chat.js'
import './persona.js'

class Shell extends Element {
  render() {
    const current = app.current.value
    const open = sidebarOpen.value
    // Open beside the conversation (D165), the drawer has the header's top as its own: the name,
    // then what it opens, Search and the button that puts it away, at the far end, as in Manus.
    // What opens beside the conversation, the browser and the terminal, keeps the main area's top
    // end: the header's, or, with the drawer open, the same place beside it (D170). The folder's
    // name goes before them, there and never in the drawer (D149). Each is its capability's, in the views slot.
    const shown = slots('views')
    const views = shown.length ? html`<div class="views">${shown.map((view) => view.draw(current))}</div>` : nothing
    // On a new task, a capability may show something of its own in place of the welcome: Flows' flow mode (D218).
    const instead = current?.records.length ? null : slots('main').map((main) => main.draw()).find(Boolean)
    return html`
      <a class="skip" href="#prompt">${t('a11y.skip')}</a>
      <header class="bar">
        <button class="icon-button sidebar-toggle" @click=${toggleSidebar} aria-expanded=${app.wide.value ? String(open) : nothing} aria-keyshortcuts=${SHORTCUTS.sidebar}
          aria-label=${t(open ? 'sidebar.close' : 'sidebar.open')}>${icons.sidebar}</button>
        ${loaded.value.has('projects') ? html`<app-projects></app-projects>`
          : html`<button class="wordmark" @click=${() => turnPage(newConversation)} title=${t('action.new')} aria-keyshortcuts=${SHORTCUTS.new}><app-persona></app-persona><span dir="auto">${assistantName()}</span></button>`}
        ${open ? findButton() : views}
      </header>
      ${open ? html`<app-inbox role="complementary" aria-label=${t('history.title')}></app-inbox>${views}` : nothing}
      ${app.ephemeral.value ? html`<p class="notice" role="status">${t('storage.ephemeral')}</p>` : nothing}
      <p class="print-mark"><app-persona still></app-persona><span>${BRAND.name}<small dir="auto">${BRAND.domain}</small></span></p>
      <main id="main">${current?.records.length ? html`<app-conversation></app-conversation>` : instead ?? welcome()}</main>
      ${offerAside()}
      ${slots('above').map((above) => above.draw())}
      <app-composer></app-composer>
      <app-history></app-history>
      <app-find></app-find>
      <app-settings></app-settings>
      <app-picker></app-picker>
      <app-project-dialog></app-project-dialog>
      ${slots('dialog').map((dialog) => dialog.draw())}
      <app-toasts class="toasts" role="status" aria-live="polite" popover="manual"></app-toasts>
      <div class="drop-zone" aria-hidden="true"><p>${t('files.drop')}</p></div>`
  }
}

// The dialogs above are defined the first time one opens, and upgrade then; the drawer open beside the conversation too (D111, D165).
effect(() => {
  if (app.dialog.value) import('./dialogs.js')
  if (sidebarOpen.value) import('./inbox.js')
})

/** Search, once it is found, at the top of the drawer, as in Manus (D133, D165). */
export const findButton = () => (loaded.value.has('find') ? html`<button class="icon-button" aria-keyshortcuts=${SHORTCUTS.find}
  aria-label=${t('cap.find.name')} @click=${() => { app.dialog.value = 'find' }}>${icons.search}</button>` : nothing)

const discovery = () => import('./discovery.js')

// ─── Shortcuts ───────────────────────────────────────────────────────────────

// As in the Claude apps, Ctrl outside Apple's systems (D118): ⌘, Settings, ⌘/ its shortcuts (D257), ⌘N and ⌘⇧O a new task (D236),
// ⌘⇧D light or dark, ⌘⇧E the next theme, ⌘⇧L the next language, ⌘⇧S dictation, ⌘⇧H hands-free (D130, D238,
// D253), ⌘K search (D133), ⌘⇧B the browser (D142), ⌘J the terminal (D166, D170, D184), ⌘B the drawer (D234),
// ⌘S a copy of the open task and ⌘⌫ deleting it (D313), ⌘⇧U sharing it (D377).
/** The key pressed, whatever the keyboard's alphabet: a Cyrillic or Arabic layout still sends the key's place. */
const PLACES = /** @type {Record<string, string>} */ ({ Comma: ',', Slash: '/', KeyN: 'n', KeyO: 'o', KeyD: 'd', KeyE: 'e', KeyL: 'l', KeyS: 's', KeyH: 'h', KeyK: 'k', KeyB: 'b', KeyJ: 'j', KeyU: 'u' })
/** Whether the field with the keyboard has text, whose ⌘⌫ is then its own. @param {EventTarget | null} field */
const hasText = (field) => field instanceof HTMLElement && field.matches(':read-write') && Boolean(/** @type {HTMLInputElement} */ (field).value ?? field.textContent)

document.addEventListener('keydown', (event) => {
  const command = APPLE ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (!command || event.altKey || event.isComposing) return
  const key = /^[ -~]$/.test(event.key) ? event.key.toLowerCase() : PLACES[event.code]
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
    import('./inbox.js').then((module) => (key === 'e' ? module.nextLook() : module.nextLanguage()))
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
  } else if (/^(Backspace|Delete)$/.test(event.key) && !event.shiftKey && app.current.value && [null, 'history'].includes(app.dialog.value) && !hasText(event.target)) {
    event.preventDefault()
    const { path } = app.current.value
    import('./inbox.js').then((module) => module.deleteTask(path))
  }
})

/** A capability offered in one sentence, above the box (docs/product.md, progressive discovery). */
function offerAside() {
  const offer = app.offer.value
  if (!offer || app.dialog.value === 'first') return nothing
  const { id, progress } = offer
  const params = { name: assistantName(), size: formatBytes(SIZES[id] ?? 0) }
  return html`<aside class="offer" role="status">
    <p>${t(`cap.${id}.offer`, params)}</p>
    ${progress === undefined ? html`<div class="row">
      <button class="button primary" @click=${() => discovery().then((module) => module.accept(id))}>${t(`cap.${id}.yes`, params)}</button>
      <button class="button subtle" @click=${() => discovery().then((module) => module.decline(id))}>${t('offer.no')}</button>
    </div>` : html`<progress max="1" value=${progress} aria-label=${t(`cap.${id}.downloading`)}></progress>`}
  </aside>`
}

// Before any task, in a browser's tab (not the desktop app, whose key the tab keeps): what Jean is (D366).
function welcome() {
  const pitch = !app.conversations.value.length && app.dialog.value !== 'first' && !sessionStorage.getItem('app.host') && matchMedia('(display-mode: browser)').matches
  return html`<section class="welcome">
    <app-persona></app-persona>
    <h1 class="hero-question">${t('welcome.question')}</h1>
    ${pitch ? html`<div class="pitch"><p>${t('welcome.promise')}</p><ul>${['install', 'device', 'open'].map((key) => html`<li>${t(`welcome.${key}`)}</li>`)}</ul></div>` : nothing}
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
    const waiting = app.updateReady.value
    const toast = app.toast.value
    const act = (/** @type {() => void} */ run) => () => { app.toast.value = null; run() }
    return html`${waiting ? html`<p class="toast">${t('update.ready', { name: BRAND.name })}
      <button class="button primary" @click=${() => import('./update.js').then((update) => update.apply(waiting))}>${t('update.reload')}</button></p>` : nothing}
    ${toast ? html`<p class="toast"><span dir="auto">${toast.message}</span>${toast.action
      ? html`<button class="button" @click=${act(toast.action.run)}>${toast.action.label}</button>` : nothing}</p>` : nothing}`
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
