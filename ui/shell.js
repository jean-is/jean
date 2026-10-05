// The room: header, welcome or conversation, composer, dialogs, toasts.
import { html, nothing } from 'lit-html'
import { effect } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, newConversation, turnPage, assistantName, switchTheme, sidebarOpen, toggleSidebar } from './state.js'
import { SIZES, loaded } from './caps.js'
import { BRAND } from '../brand.js'
import { t, formatBytes } from '../core/i18n.js'
import { icons } from './icons.js'
import { focusComposer } from './composer.js'
import './chat.js'
import './persona.js'

const STARTERS = ['summarize', 'email', 'explain', 'savings']

class Shell extends Element {
  render() {
    const current = app.current.value
    const open = sidebarOpen.value
    // Open beside the conversation (D165), the drawer has the header's top as its own: the name,
    // then what it opens, Search and the button that puts it away, at the far end, as in Manus.
    return html`
      <a class="skip" href="#prompt">${t('a11y.skip')}</a>
      <header class="bar">
        <button class="icon-button sidebar-toggle" @click=${toggleSidebar} aria-expanded=${app.wide.value ? String(open) : nothing}
          aria-label=${t(open ? 'sidebar.close' : 'sidebar.open')} title=${t(open ? 'sidebar.close' : 'sidebar.open')}>${icons.sidebar}</button>
        ${loaded.value.has('projects') ? html`<app-projects></app-projects>`
          : html`<button class="wordmark" @click=${() => turnPage(newConversation)} title=${t('action.new')} aria-keyshortcuts=${SHORTCUTS.new}><app-persona></app-persona>${assistantName()}</button>`}
        ${loaded.value.has('folders') ? html`<app-folder></app-folder>` : nothing}
        ${loaded.value.has('browser') ? html`<button class="icon-button browser-toggle" @click=${() => import('../caps/browser/browser.js').then((module) => module.toggle())}
          aria-label=${t('cap.browser.name')} title=${t('cap.browser.name')} aria-keyshortcuts=${SHORTCUTS.browser}>${icons.globe}</button>` : nothing}
        ${open ? findButton() : nothing}
      </header>
      ${open ? html`<app-inbox role="complementary" aria-label=${t('history.title')}></app-inbox>` : nothing}
      ${app.ephemeral.value ? html`<p class="notice" role="status">${t('storage.ephemeral')}</p>` : nothing}
      <main id="main">${current?.records.length ? html`<app-conversation></app-conversation>` : welcome()}</main>
      ${offerAside()}
      ${loaded.value.has('folders') ? html`<app-folder-ask></app-folder-ask>` : nothing}
      <app-composer></app-composer>
      <app-history></app-history>
      <app-find></app-find>
      <app-settings></app-settings>
      <app-picker></app-picker>
      <app-project-dialog></app-project-dialog>
      ${toasts()}
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
  aria-label=${t('cap.find.name')} title=${t('cap.find.name')} @click=${() => { app.dialog.value = 'find' }}>${icons.search}</button>` : nothing)

const discovery = () => import('./discovery.js')

// ─── Shortcuts ───────────────────────────────────────────────────────────────

// As in the Claude apps (D118): ⌘, for Settings, ⌘N for a new conversation; Ctrl outside Apple's
// systems. A browser tab keeps ⌘N for a new window; an installed Jean, or Firefox, lets it through.
// ⌘⇧L switches between light and dark (D130); ⌘K opens search once it is found, or closes it (D133);
// ⌘⇧B opens the browser once it is found, or closes it (D142).
const APPLE = /Mac|iPhone|iPad/.test(navigator.platform)
const MODIFIER = APPLE ? 'Meta' : 'Control'
/** For aria-keyshortcuts. */
export const SHORTCUTS = { settings: `${MODIFIER}+,`, new: `${MODIFIER}+N`, theme: `${MODIFIER}+Shift+L`, find: `${MODIFIER}+K`, browser: `${MODIFIER}+Shift+B` }
/** The key pressed, whatever the keyboard's alphabet: a Cyrillic or Arabic layout still sends the key's place. */
const PLACES = /** @type {Record<string, string>} */ ({ Comma: ',', KeyN: 'n', KeyL: 'l', KeyK: 'k', KeyB: 'b' })

document.addEventListener('keydown', (event) => {
  const command = APPLE ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (!command || event.altKey || event.isComposing) return
  const key = /^[ -~]$/.test(event.key) ? event.key.toLowerCase() : PLACES[event.code]
  if (key === ',' && !event.shiftKey) {
    event.preventDefault()
    if (app.dialog.value !== 'settings') import('./dialogs.js').then((module) => module.openSettings())
  } else if (key === 'n' && !event.shiftKey) {
    event.preventDefault()
    turnPage(newConversation)
    focusComposer()
  } else if (key === 'l' && event.shiftKey) {
    event.preventDefault()
    switchTheme()
  } else if (key === 'k' && !event.shiftKey && loaded.value.has('find')) {
    event.preventDefault()
    app.dialog.value = app.dialog.value === 'find' ? null : 'find'
  } else if (key === 'b' && event.shiftKey && loaded.value.has('browser')) {
    event.preventDefault()
    // A dialog over the room closes, and the pane shows.
    const over = app.dialog.value
    app.dialog.value = null
    import('../caps/browser/browser.js').then((module) => (over ? module.show() : module.toggle()))
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

function toasts() {
  const waiting = app.updateReady.value
  const toast = app.toast.value
  const act = (/** @type {() => void} */ run) => () => { app.toast.value = null; run() }
  return html`<div class="toasts" role="status" aria-live="polite">
    ${waiting ? html`<p class="toast">${t('update.ready', { name: BRAND.name })}
      <button class="button primary" @click=${() => import('./update.js').then((update) => update.apply(waiting))}>${t('update.reload')}</button></p>` : nothing}
    ${toast ? html`<p class="toast"><span dir="auto">${toast.message}</span>${toast.action
      ? html`<button class="button" @click=${act(toast.action.run)}>${toast.action.label}</button>` : nothing}</p>` : nothing}
  </div>`
}

define('app-shell', Shell)
