// The room: header, welcome or conversation, composer, dialogs, toasts.
import { html, nothing } from 'lit-html'
import { effect } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, newConversation, turnPage, assistantName, switchTheme, sidebarOpen, toggleSidebar, APPLE, SHORTCUTS } from './state.js'
import { SIZES, loaded, unlock, isDenied } from './caps.js'
import { BRAND } from '../brand.js'
import { t, formatBytes } from '../core/i18n.js'
import { icons } from './icons.js'
import { focusComposer } from './composer.js'
import { toggleDictation } from './dictation.js'
import './chat.js'
import './persona.js'

const STARTERS = ['summarize', 'email', 'explain', 'savings']

class Shell extends Element {
  render() {
    const current = app.current.value
    const open = sidebarOpen.value
    // Open beside the conversation (D165), the drawer has the header's top as its own: the name,
    // then what it opens, Search and the button that puts it away, at the far end, as in Manus.
    // What opens beside the conversation, the browser and the terminal, keeps the main area's top
    // end: the header's, or, with the drawer open, the same place beside it (D170). The folder's
    // name goes before them, there and never in the drawer (D149).
    const views = ['folders', 'computer', 'browser', 'flows'].some((name) => loaded.value.has(name)) ? html`<div class="views">
      ${loaded.value.has('folders') ? html`<app-folder></app-folder>` : nothing}
      ${loaded.value.has('computer') ? html`<app-terminal-toggle></app-terminal-toggle>` : nothing}
      ${loaded.value.has('browser') ? html`<button class="icon-button browser-toggle" @click=${() => import('../caps/browser/browser.js').then((module) => module.toggle())}
        aria-label=${t('cap.browser.name')} aria-keyshortcuts=${SHORTCUTS.browser}>${icons.globe}</button>` : nothing}
      ${loaded.value.has('flows') && current?.records.length ? html`<button class="icon-button flows-toggle" @click=${() => import('../caps/flows/flows.js').then((module) => module.toggle())}
        aria-label=${t('cap.flows.name')}>${icons.flow}</button>` : nothing}</div>` : nothing
    // On a new task, a capability may show something of its own in place of the welcome: Flows' flow mode (D218).
    const instead = current?.records.length ? null : [...loaded.value.values()].map((capability) => capability.main?.()).find(Boolean)
    return html`
      <a class="skip" href="#prompt">${t('a11y.skip')}</a>
      <header class="bar">
        <button class="icon-button sidebar-toggle" @click=${toggleSidebar} aria-expanded=${app.wide.value ? String(open) : nothing} aria-keyshortcuts=${SHORTCUTS.sidebar}
          aria-label=${t(open ? 'sidebar.close' : 'sidebar.open')}>${icons.sidebar}</button>
        ${loaded.value.has('projects') ? html`<app-projects></app-projects>`
          : html`<button class="wordmark" @click=${() => turnPage(newConversation)} title=${t('action.new')} aria-keyshortcuts=${SHORTCUTS.new}><app-persona></app-persona>${assistantName()}</button>`}
        ${open ? findButton() : views}
      </header>
      ${open ? html`<app-inbox role="complementary" aria-label=${t('history.title')}></app-inbox>${views}` : nothing}
      ${app.ephemeral.value ? html`<p class="notice" role="status">${t('storage.ephemeral')}</p>` : nothing}
      <main id="main">${current?.records.length ? html`<app-conversation></app-conversation>` : instead ?? welcome()}</main>
      ${offerAside()}
      ${loaded.value.has('folders') ? html`<app-folder-ask></app-folder-ask>` : nothing}
      <app-composer></app-composer>
      <app-history></app-history>
      <app-find></app-find>
      <app-settings></app-settings>
      <app-picker></app-picker>
      <app-project-dialog></app-project-dialog>
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

// As in the Claude apps (D118): ⌘, for Settings, ⌘N for a new task, and ⌘⇧O, as in ChatGPT, since a browser
// tab keeps ⌘N (D236); Ctrl outside Apple's systems. ⌘⇧D light or dark, ⌘⇧E the next theme, ⌘⇧S dictation,
// ⌘⇧H hands-free once found (D130, D238); ⌘K opens search once it is found, or closes it (D133);
// ⌘⇧B opens the browser once it is found, or closes it (D142). ⌘J opens the terminal, as in code editors,
// brings the keys to it, or closes it once they are there, and turns the computer on first (D166, D170, D184).
// ⌘B opens the drawer or puts it away, as in code editors (D234).
/** The key pressed, whatever the keyboard's alphabet: a Cyrillic or Arabic layout still sends the key's place. */
const PLACES = /** @type {Record<string, string>} */ ({ Comma: ',', KeyN: 'n', KeyO: 'o', KeyD: 'd', KeyE: 'e', KeyS: 's', KeyH: 'h', KeyK: 'k', KeyB: 'b', KeyJ: 'j' })

document.addEventListener('keydown', (event) => {
  const command = APPLE ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (!command || event.altKey || event.isComposing) return
  const key = /^[ -~]$/.test(event.key) ? event.key.toLowerCase() : PLACES[event.code]
  if (key === ',' && !event.shiftKey) {
    event.preventDefault()
    if (app.dialog.value !== 'settings') import('./dialogs.js').then((module) => module.openSettings())
  } else if (key === (event.shiftKey ? 'o' : 'n')) {
    event.preventDefault()
    turnPage(newConversation)
    focusComposer()
  } else if (key === 'd' && event.shiftKey) {
    event.preventDefault()
    switchTheme()
  } else if (key === 'e' && event.shiftKey) {
    event.preventDefault()
    import('./inbox.js').then((module) => module.nextLook())
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
  }
})

/** A capability offered in one sentence, above the box (docs/product.md, progressive discovery). */
function offerAside() {
  const offer = app.offer.value
  if (!offer) return nothing
  const { id, progress } = offer
  const params = { name: assistantName(), size: formatBytes(SIZES[id] ?? 0) }
  return html`<aside class="offer" role="status">
    <p>${t(`cap.${id}.offer`, params)}</p>
    ${progress === undefined ? html`<div class="row">
      <button class="button primary" @click=${() => discovery().then((module) => module.accept(id))}>${t(`cap.${id}.yes`, params)}</button>
      <button class="button subtle" @click=${() => discovery().then((module) => module.decline(id))}>${t('offer.no')}</button>
    </div>` : html`<progress max="1" value=${progress} aria-label=${t('cap.reflexes.downloading')}></progress>`}
  </aside>`
}

function welcome() {
  return html`<section class="welcome">
    <app-persona></app-persona>
    <h1 class="hero-question">${t('welcome.question')}</h1>
    <ul class="starters">${STARTERS.map((key) => html`<li>
      <button class="starter" @click=${() => { app.draft.value = t(`starter.${key}.prompt`); focusComposer() }}>${t(`starter.${key}`)}</button>
    </li>`)}</ul>
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
