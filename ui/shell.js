// The room: header, welcome or conversation, composer, dialogs, toasts.
import { html, nothing } from 'lit-html'
import { effect } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, setLocale, newConversation, assistantName, LOCALES } from './state.js'
import { SIZES } from './caps.js'
import { BRAND } from '../brand.js'
import { t, locale, languageName, preferredLocales, formatBytes } from '../core/i18n.js'
import { icons } from './icons.js'
import { focusComposer } from './composer.js'
import { LOOKS } from './looks.js'
import { scriptURL } from './trusted.js'
import './chat.js'
import './persona.js'

const STARTERS = ['summarize', 'email', 'explain']

class Shell extends Element {
  render() {
    const current = app.current.value
    const { data } = app.project.value
    return html`
      <a class="skip" href="#prompt">${t('a11y.skip')}</a>
      <header class="bar">
        <button class="icon-button" @click=${() => { app.dialog.value = 'history' }} aria-label=${t('history.title')} title=${t('history.title')}>${icons.history}</button>
        <button class="wordmark" @click=${newConversation} title=${t('action.new')}><app-persona></app-persona>${assistantName()}${data.default === true ? nothing
          : html`<span class="wordmark-project" dir="auto">${data.name}</span>`}</button>
        <nav class="bar-actions" aria-label=${t('a11y.menu')}>
          <button class="icon-button" @click=${openCollection} aria-label=${t('collection.title', { name: BRAND.name })} title=${t('collection.title', { name: BRAND.name })}>${icons.tiles}</button>
          <label class="language" title=${t('settings.language')}>
            ${icons.globe}<span class="visually-hidden">${t('settings.language')}</span>
            <select @change=${(/** @type {Event} */ e) => setLocale(/** @type {HTMLSelectElement} */ (e.target).value)}>
              ${languageOptions()}
            </select>
          </label>
          <button class="icon-button" @click=${() => { app.dialog.value = 'settings' }} aria-label=${t('settings.title')} title=${t('settings.title')}>${icons.gear}</button>
        </nav>
      </header>
      ${LOOKS[app.look.value].list ? html`<app-inbox class="inbox" role="complementary" aria-label=${t('history.title')}></app-inbox>` : nothing}
      ${app.ephemeral.value ? html`<p class="notice" role="status">${t('storage.ephemeral')}</p>` : nothing}
      <main id="main">${current?.records.length ? html`<app-conversation></app-conversation>` : welcome()}</main>
      ${offerAside()}
      <app-composer></app-composer>
      <app-history></app-history>
      <app-brain-dialog></app-brain-dialog>
      <app-settings></app-settings>
      <app-picker></app-picker>
      <app-collection></app-collection>
      <app-knows></app-knows>
      <app-project-dialog></app-project-dialog>
      <app-connections></app-connections>
      ${toasts()}
      <div class="drop-zone" aria-hidden="true"><p>${t('files.drop')}</p></div>`
  }
}

// The dialogs above are defined the first time one opens, and upgrade then; Mail's list too (D111).
effect(() => {
  if (app.dialog.value) import('./dialogs.js')
  if (app.dialog.value === 'knows') import('./knows.js')
  if (LOOKS[app.look.value].list) import('./inbox.js')
})

const discovery = () => import('./discovery.js')

export async function openCollection() {
  await import('./collection.js')
  app.dialog.value = 'collection'
}

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

/** The language menu: the browser's languages first, in its order, then the others. */
export function languageOptions() {
  const option = (/** @type {string} */ code) => html`<option value=${code} lang=${code} ?selected=${code === locale.value}>${languageName(code)}</option>`
  const yours = preferredLocales(LOCALES, navigator.languages)
  if (!yours.length) return LOCALES.map(option)
  return html`<optgroup label=${t('settings.languagesYours')}>${yours.map(option)}</optgroup>
    <optgroup label=${t('settings.languagesOther')}>${LOCALES.filter((code) => !yours.includes(code)).map(option)}</optgroup>`
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
      <button class="button primary" @click=${() => applyUpdate(waiting)}>${t('update.reload')}</button></p>` : nothing}
    ${toast ? html`<p class="toast"><span dir="auto">${toast.message}</span>${toast.action
      ? html`<button class="button" @click=${act(toast.action.run)}>${toast.action.label}</button>` : nothing}</p>` : nothing}
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
