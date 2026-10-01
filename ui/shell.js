// The room: header, welcome or conversation, composer, dialogs, toasts.
import { html, nothing } from 'lit-html'
import { Element, define } from './base.js'
import { app, LOCALES, setLocale, newConversation } from './state.js'
import { BRAND } from '../brand.js'
import { t, locale, languageName } from '../core/i18n.js'
import { icons } from './icons.js'
import { focusComposer } from './composer.js'
import { scriptURL } from './trusted.js'
import './chat.js'
import './dialogs.js'

const STARTERS = ['summarize', 'email', 'explain']

class Shell extends Element {
  render() {
    const current = app.current.value
    return html`
      <a class="skip" href="#prompt">${t('a11y.skip')}</a>
      <header class="bar">
        <button class="wordmark" @click=${newConversation} title=${t('action.new')}>${BRAND.name}</button>
        <nav class="bar-actions" aria-label=${t('a11y.menu')}>
          <button class="icon-button" @click=${() => { app.dialog.value = 'history' }} aria-label=${t('history.title')} title=${t('history.title')}>${icons.history}</button>
          <label class="language" title=${t('settings.language')}>
            ${icons.globe}<span class="visually-hidden">${t('settings.language')}</span>
            <select @change=${(/** @type {Event} */ e) => setLocale(/** @type {HTMLSelectElement} */ (e.target).value)}>
              ${LOCALES.map((code) => html`<option value=${code} lang=${code} ?selected=${code === locale.value}>${languageName(code)}</option>`)}
            </select>
          </label>
          <button class="icon-button" @click=${() => { app.dialog.value = 'settings' }} aria-label=${t('settings.title')} title=${t('settings.title')}>${icons.gear}</button>
        </nav>
      </header>
      ${app.ephemeral.value ? html`<p class="notice" role="status">${t('storage.ephemeral')}</p>` : nothing}
      <main id="main">${current?.records.length ? html`<app-conversation></app-conversation>` : welcome()}</main>
      <app-composer></app-composer>
      <app-history></app-history>
      <app-brain-dialog></app-brain-dialog>
      <app-settings></app-settings>
      ${toasts()}`
  }
}

function welcome() {
  return html`<section class="welcome">
    <h1 class="hero-question">${t('welcome.question')}</h1>
    <ul class="starters">${STARTERS.map((key) => html`<li>
      <button class="starter" @click=${() => { app.draft.value = t(`starter.${key}.prompt`); focusComposer() }}>${t(`starter.${key}`)}</button>
    </li>`)}</ul>
  </section>`
}

function toasts() {
  const waiting = app.updateReady.value
  const message = app.toast.value
  return html`<div class="toasts" role="status" aria-live="polite">
    ${waiting ? html`<p class="toast">${t('update.ready', { name: BRAND.name })}
      <button class="button primary" @click=${() => applyUpdate(waiting)}>${t('update.reload')}</button></p>` : nothing}
    ${message ? html`<p class="toast">${message}</p>` : nothing}
  </div>`
}

let updating = false
/** @param {ServiceWorker} worker */
function applyUpdate(worker) {
  updating = true
  worker.postMessage({ type: 'SKIP_WAITING' })
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('controllerchange', () => updating && location.reload())
  navigator.serviceWorker.register(scriptURL('./sw.js')).then((registration) => {
    const check = () => {
      if (registration.waiting && navigator.serviceWorker.controller) app.updateReady.value = registration.waiting
    }
    check()
    registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', check))
  }).catch((error) => console.warn('Service worker', error))
}

define('app-shell', Shell)
