// History, brain and settings dialogs (native <dialog>: focus trap and Escape for free).
import { html, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import {
  app, effective, activeBrain, setLocale, setRule, setVoice, notify, loadModels,
  newConversation, openConversation, removeConversation, showError,
} from './state.js'
import { connectBrain, continueWithBrain, addBrain, removeBrain, useBrain, startOpenRouter } from './brains.js'
import { unlock, isDenied } from './caps.js'
import { ulid } from '../core/ulid.js'
import { BRAND } from '../brand.js'
import { PROVIDERS } from '../core/llm.js'
import { RULE_KINDS, resolveRule } from '../core/rules.js'
import { t, locale, relativeTime } from '../core/i18n.js'
import { voicesFor } from './speech.js'
import { icons } from './icons.js'
import { formatBytes, languageOptions } from './shell.js'

/** @param {Element} host @param {string} name */
export function syncDialog(host, name) {
  const dialog = host.querySelector('dialog')
  const open = app.dialog.value === name
  if (open && !dialog?.open) dialog?.showModal()
  else if (!open && dialog?.open) dialog.close()
}

export const close = () => { app.dialog.value = null }
/** @param {MouseEvent} event */
export const backdrop = (event) => { if (event.target === event.currentTarget) close() }

/** @param {string} title */
export const head = (title) => html`<header class="dialog-head">
  <h2>${title}</h2>
  <button class="icon-button" @click=${close} aria-label=${t('action.close')}>${icons.close}</button>
</header>`

// ─── History ─────────────────────────────────────────────────────────────────

class History extends Element {
  render() {
    const list = app.conversations.value
    const currentId = app.current.value?.id
    return html`<dialog class="drawer" @close=${close} @click=${backdrop}>
      ${head(t('history.title'))}
      <button class="button wide" @click=${newConversation}>${icons.plus} ${t('action.new')}</button>
      ${list.length ? html`<ol class="history-list">${repeat(list, (item) => item.id, (item) => html`
        <li class=${item.id === currentId ? 'is-current' : ''}>
          <button class="history-item" @click=${() => openConversation(item.path)}>
            <span class="history-title" dir="auto">${item.title || t('conversation.untitled')}</span>
            <time datetime=${item.updatedAt}>${relativeTime(item.updatedAt)}</time>
          </button>
          <button class="icon-button subtle" aria-label=${t('action.delete')} title=${t('action.delete')}
            @click=${() => confirm(t('history.confirmDelete')) && removeConversation(item.path)}>${icons.trash}</button>
        </li>`)}</ol>` : html`<p class="muted">${t('history.empty')}</p>`}
    </dialog>`
  }

  updated() {
    syncDialog(this, 'history')
  }
}

// ─── Brains ──────────────────────────────────────────────────────────────────

const status = signal(/** @type {{ kind: 'busy' | 'error', message: string } | null} */ (null))
/** The on-device brain's module, loaded when the dialog first opens to check this device. */
const local = signal(/** @type {typeof import('../caps/brain-local/brain-local.js') | null} */ (null))
const deviceCheck = signal(/** @type {{ ok: boolean, reason?: string } | null} */ (null))
let checking = false

async function checkDevice() {
  if (checking || isDenied('brain-local')) return
  checking = true
  try {
    const module = await import('../caps/brain-local/brain-local.js')
    local.value = module
    deviceCheck.value = await module.checkDevice()
  } catch (error) {
    console.warn('Device check', error)
    deviceCheck.value = { ok: false }
  }
}

async function useDevice() {
  const module = local.value
  if (!module || !(await unlock('brain-local'))) return
  try {
    await module.prepare()
    await addBrain({ id: ulid(), provider: 'device', api: 'device', baseURL: '', model: module.GEMMA.model })
    notify(t('brain.device.ready'))
    continueWithBrain()
  } catch (error) {
    console.warn('On-device brain', error)
  }
}

/** The first rung: shown only where the brain can run. @param {boolean} hasDevice */
function deviceChoice(hasDevice) {
  const module = local.value
  if (!module || !deviceCheck.value?.ok || hasDevice) return nothing
  const progress = module.download.value
  return html`<section class="choice is-device">
    <h3>${icons.chip} ${t('brain.device.title')}</h3>
    <p>${t('brain.device.text', { name: BRAND.name })}</p>
    ${progress.state === 'downloading' ? html`
      <progress max=${progress.total} value=${progress.loaded} aria-label=${t('brain.device.downloading')}></progress>
      <p class="hint">${t('brain.device.progress', { done: formatBytes(progress.loaded), total: formatBytes(progress.total) })}</p>`
    : progress.state === 'loading' ? html`<p class="status" role="status">${t('brain.device.loading')}</p>`
    : html`
      ${progress.state === 'failed' ? html`<p class="status is-error" role="alert">${t('brain.device.failed')}</p>` : nothing}
      <button class="button primary" @click=${useDevice}>${icons.download} ${t('brain.device.action', { size: formatBytes(module.GEMMA.bytes) })}</button>
      <p class="hint">${t('brain.device.alternative')}</p>`}
  </section>`
}
const localProvider = signal(/** @type {'ollama' | 'lmstudio' | 'custom'} */ ('ollama'))
// What the user typed survives re-renders; picking another app resets it to that app's default.
const localAddress = signal(PROVIDERS.ollama.baseURL)

/** @param {() => Promise<unknown>} task */
async function attempt(task) {
  status.value = { kind: 'busy', message: t('brain.connecting') }
  try {
    await task()
    status.value = null
    continueWithBrain()
  } catch (error) {
    const code = /** @type {any} */ (error)?.code ?? 'unknown'
    status.value = { kind: 'error', message: t(`error.${code}`, { brain: t('brain.this'), origin: location.origin }) }
  }
}

/** @param {SubmitEvent} event */
function connectKey(event) {
  event.preventDefault()
  const form = new FormData(/** @type {HTMLFormElement} */ (event.target))
  const provider = /** @type {'openai' | 'anthropic' | 'openrouter'} */ (form.get('provider'))
  attempt(() => connectBrain({ provider, apiKey: String(form.get('key')).trim() }))
}

/** @param {SubmitEvent} event */
function connectLocal(event) {
  event.preventDefault()
  const form = new FormData(/** @type {HTMLFormElement} */ (event.target))
  attempt(() => connectBrain({ provider: localProvider.value, baseURL: String(form.get('baseURL')).trim() }))
}

class BrainDialog extends Element {
  render() {
    const { settings, locked } = effective.value
    const brainsLocked = locked.has('brains')
    return html`<dialog class="sheet" @close=${close} @click=${backdrop}>
      ${head(t('brain.title'))}
      <p class="lede">${t('brain.lede', { name: BRAND.name })}</p>
      ${settings.brains.length ? this.#connected(settings.brains, brainsLocked) : nothing}
      ${brainsLocked ? html`<p class="muted">${t('policy.locked')}</p>` : html`
        ${deviceChoice(settings.brains.some((brain) => brain.provider === 'device'))}
        <section class="choice">
          <h3>${icons.spark} ${t('brain.quick.title')}</h3>
          <p>${t('brain.quick.text')}</p>
          <button class="button primary" @click=${startOpenRouter}>${t('brain.quick.action')} ${icons.arrow}</button>
        </section>
        <section class="choice">
          <h3>${icons.key} ${t('brain.key.title')}</h3>
          <p>${t('brain.key.text')}</p>
          <form class="stack" @submit=${connectKey}>
            <label>${t('brain.key.provider')}
              <select name="provider">${['openai', 'anthropic', 'openrouter'].map((id) => html`<option value=${id}>${t(`provider.${id}`)}</option>`)}</select>
            </label>
            <label>${t('brain.key.label')}<input name="key" type="password" autocomplete="off" spellcheck="false" required dir="ltr"></label>
            <button class="button">${t('brain.connect')}</button>
          </form>
        </section>
        <section class="choice">
          <h3>${icons.computer} ${t('brain.local.title')}</h3>
          <p>${t('brain.local.text')}</p>
          <form class="stack" @submit=${connectLocal}>
            <label>${t('brain.local.app')}
              <select @change=${(/** @type {Event} */ e) => {
                localProvider.value = /** @type {any} */ (e.target).value
                localAddress.value = PROVIDERS[localProvider.value].baseURL
              }}>
                ${['ollama', 'lmstudio', 'custom'].map((id) => html`<option value=${id} ?selected=${id === localProvider.value}>${t(`provider.${id}`)}</option>`)}
              </select>
            </label>
            <label>${t('brain.local.address')}<input name="baseURL" type="url" required dir="ltr" placeholder="http://localhost:11434/v1"
              .value=${live(localAddress.value)} @input=${(/** @type {Event} */ e) => { localAddress.value = /** @type {HTMLInputElement} */ (e.target).value }}></label>
            <button class="button">${t('brain.connect')}</button>
          </form>
          <p class="hint">${t('brain.local.hint', { origin: location.origin })}</p>
        </section>`}
      ${status.value ? html`<p class="status is-${status.value.kind}" role="status">${status.value.message}</p>` : nothing}
    </dialog>`
  }

  /** @param {import('../core/types.js').BrainConfig[]} brains @param {boolean} brainsLocked */
  #connected(brains, brainsLocked) {
    const active = activeBrain.value
    return html`<section class="connected">
      <h3>${t('brain.connectedTitle')}</h3>
      <ul>${brains.map((brain) => html`<li class=${brain.id === active?.id ? 'is-active' : ''}>
        <label class="radio">
          <input type="radio" name="active-brain" .checked=${brain.id === active?.id} @change=${() => useBrain(brain.id)}>
          <span>${t(`provider.${brain.provider}`)}</span>
        </label>
        ${brain.api === 'device' ? html`<span class="muted small">${t('brain.device.private')}</span>` : html`
          <input class="model-input" list=${`models-${brain.id}`} .value=${live(brain.model)} dir="ltr" aria-label=${t('brain.model')}
            @change=${(/** @type {Event} */ e) => useBrain(brain.id, /** @type {HTMLInputElement} */ (e.target).value.trim())}>
          <datalist id=${`models-${brain.id}`}>${(app.models.value[brain.id] ?? []).map((model) => html`<option value=${model.id}>${model.name ?? ''}</option>`)}</datalist>`}
        ${brainsLocked ? nothing : html`<button class="icon-button subtle" aria-label=${t('action.remove')} title=${t('action.remove')}
          @click=${() => removeBrain(brain.id).catch(showError)}>${icons.trash}</button>`}
      </li>`)}</ul>
    </section>`
  }

  updated() {
    syncDialog(this, 'brain')
    if (app.dialog.value === 'brain') {
      checkDevice()
      for (const brain of effective.value.settings.brains) if (brain.api !== 'device') loadModels(brain)
    }
    else if (status.value?.kind === 'error') status.value = null
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

const storage = signal(/** @type {{ usage?: number, quota?: number, persisted?: boolean } | null} */ (null))

class Settings extends Element {
  render() {
    const { settings, locked } = effective.value
    const voices = voicesFor(locale.value)
    const usage = storage.value?.usage
    return html`<dialog class="sheet" @close=${close} @click=${backdrop}>
      ${head(t('settings.title'))}
      <section>
        <h3>${t('settings.language')}</h3>
        <select aria-label=${t('settings.language')} ?disabled=${locked.has('locale')}
          @change=${(/** @type {Event} */ e) => setLocale(/** @type {HTMLSelectElement} */ (e.target).value)}>
          ${languageOptions()}
        </select>
      </section>
      <section>
        <h3>${t('settings.rules')}</h3>
        <p class="muted">${t('settings.rulesText', { name: BRAND.name })}</p>
        <ul class="rules">${RULE_KINDS.map((kind) => this.#rule(kind, locked.has(`rules.${kind}`)))}</ul>
      </section>
      ${voices.length ? html`<section>
        <h3>${t('settings.voice')}</h3>
        <select aria-label=${t('settings.voice')} @change=${(/** @type {Event} */ e) => setVoice(/** @type {HTMLSelectElement} */ (e.target).value || null)}>
          <option value="">${t('settings.voiceDefault')}</option>
          ${voices.map((voice) => html`<option value=${voice.name} ?selected=${voice.name === settings.voice}>${voice.name}</option>`)}
        </select>
      </section>` : nothing}
      <section>
        <h3>${t('settings.storage')}</h3>
        <p>${app.ephemeral.value ? t('storage.ephemeral') : usage === undefined ? '' : t('storage.usage', { name: BRAND.name, size: formatBytes(usage) })}</p>
        ${storage.value?.persisted ? html`<p class="muted">${icons.check} ${t('storage.persisted')}</p>`
          : app.ephemeral.value ? nothing
          : html`<button class="button" @click=${persist}>${t('storage.persist')}</button>`}
        ${isDenied('backup') ? nothing : html`
          <p class="muted">${t('backup.text', { name: BRAND.name })}</p>
          <div class="row">
            <button class="button" @click=${backup}>${icons.download} ${t('backup.download')}</button>
            <label class="button subtle">${icons.upload} ${t('backup.restore')}
              <input type="file" accept=".zip,application/zip" class="visually-hidden" @change=${restore}>
            </label>
          </div>`}
      </section>
      ${isDenied('compute') ? nothing : html`<section>
        <h3>${t('collection.title', { name: BRAND.name })}</h3>
        <p class="muted">${t('collection.lede', { name: BRAND.name })}</p>
        <button class="button" @click=${async () => (await import('./discovery.js')).unlockAll()}>${t('collection.all')}</button>
      </section>`}
      <section class="about"><p class="muted">${BRAND.name} 0.3 · ${t('settings.about')}</p></section>
    </dialog>`
  }

  /** @param {string} kind @param {boolean} isLocked */
  #rule(kind, isLocked) {
    const current = resolveRule(kind, { user: effective.value.settings.rules })
    return html`<li>
      <span class="rule-kind">${t(`kind.${kind}.label`)}</span>
      <span class="segmented" role="radiogroup" aria-label=${t(`kind.${kind}.label`)}>
        ${(/** @type {const} */ (['allow', 'ask', 'never'])).map((option) => html`<label>
          <input type="radio" name=${`rule-${kind}`} .checked=${current === option} ?disabled=${isLocked} @change=${() => setRule(kind, option)}>
          <span>${t(`rules.${option}`)}</span>
        </label>`)}
      </span>
      ${isLocked ? html`<span class="muted small">${t('policy.locked')}</span>` : nothing}
    </li>`
  }

  updated() {
    syncDialog(this, 'settings')
    if (app.dialog.value === 'settings' && !storage.value) app.fs.estimate?.().then((value) => { storage.value = value })
  }
}

export async function backup() {
  if (!(await unlock('backup'))) return
  const { downloadBackup } = await import('../caps/backup/backup.js')
  await downloadBackup()
}

/** @param {Event} event */
async function restore(event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const file = input.files?.[0]
  input.value = ''
  if (!file || !confirm(t('backup.confirmRestore')) || !(await unlock('backup'))) return
  const { restoreBackup } = await import('../caps/backup/backup.js')
  await restoreBackup(file)
}

async function persist() {
  const persisted = await navigator.storage?.persist?.()
  storage.value = { ...storage.value, persisted: Boolean(persisted) }
}

define('app-history', History)
define('app-brain-dialog', BrainDialog)
define('app-settings', Settings)
