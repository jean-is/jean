// History, brain and settings dialogs (native <dialog>: focus trap and Escape for free), and the
// house of what Jean can do, in Settings.
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import {
  app, effective, activeBrain, setLocale, setRule, setVoice, notify, loadModels,
  newConversation, turnPage, showError, theme, setTheme, setLook, LOCALES,
} from './state.js'
import { connectBrain, continueWithBrain, addBrain, removeBrain, useBrain, startOpenRouter } from './brains.js'
import { unlock, isDenied, loaded, SIZES as BYTES } from './caps.js'
import { CATALOGUE, accept, begin, unlockAll } from './discovery.js'
import { ulid } from '../core/ulid.js'
import { BRAND } from '../brand.js'
import { PROVIDERS } from '../core/llm.js'
import { RULE_KINDS, resolveRule } from '../core/rules.js'
import { t, locale, formatBytes, useStrings, languageName, preferredLocales } from '../core/i18n.js'
import { deviceVoices } from './voices.js'
import { rankVoices } from '../core/language.js'
import { icons } from './icons.js'
import { conversationList, settingsEntry } from './inbox.js'
import { SHORTCUTS } from './shell.js'
import { LOOKS, lookId, touched } from './looks.js'
import { FONTS, SIZES } from './touches.js'

// The dialogs' own strings and style sheet come with them (D97, D120): every module that shows a
// dialog imports this one. The sheet goes after ui/style.css, so its rules win a tie.
await Promise.all([useStrings('dialogs'), new Promise((resolve) => {
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'ui/dialogs.css' })
  link.addEventListener('load', resolve, { once: true })
  link.addEventListener('error', resolve, { once: true })
  document.head.append(link)
})])

/** @param {Element} host @param {string} name */
export function syncDialog(host, name) {
  const dialog = host.querySelector('dialog')
  const open = app.dialog.value === name
  if (open && !dialog?.open) dialog?.showModal()
  else if (!open && dialog?.open) dialog.close()
}

export const close = () => { app.dialog.value = null }
/** A dialog closed (Escape, or another one opening): forget it only if it is still the open one. @param {string} name */
export const closed = (name) => () => { if (app.dialog.value === name) app.dialog.value = null }
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
    return html`<dialog class="drawer" @close=${closed('history')} @click=${backdrop}>
      ${head(t('history.title'))}
      <app-projects></app-projects>
      <button class="button wide" aria-keyshortcuts=${SHORTCUTS.new} @click=${() => turnPage(newConversation)}>${icons.plus} ${t('action.new')}</button>
      ${conversationList()}
      ${settingsEntry()}
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
    return html`<dialog class="sheet" @close=${closed('brain')} @click=${backdrop}>
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

/** The language menu: the browser's languages first, in its order, then the others. */
function languageOptions() {
  const option = (/** @type {string} */ code) => html`<option value=${code} lang=${code} ?selected=${code === locale.value}>${languageName(code)}</option>`
  const yours = preferredLocales(LOCALES, navigator.languages)
  if (!yours.length) return LOCALES.map(option)
  return html`<optgroup label=${t('settings.languagesYours')}>${yours.map(option)}</optgroup>
    <optgroup label=${t('settings.languagesOther')}>${LOCALES.filter((code) => !yours.includes(code)).map(option)}</optgroup>`
}

/** A setting: what it is on one side, how it is set on the other. @param {unknown} label @param {unknown} text @param {unknown} control */
const setting = (label, text, control) => html`<section class="setting">
  <div><h3>${label}</h3>${text ? html`<p class="muted">${text}</p>` : nothing}</div>
  ${control}
</section>`

function general() {
  const { settings, locked } = effective.value
  const voices = deviceVoices()
  return html`
    ${setting(t('settings.language'), null, html`<select aria-label=${t('settings.language')} ?disabled=${locked.has('locale')}
      @change=${(/** @type {Event} */ e) => setLocale(valueOf(e))}>${languageOptions()}</select>`)}
    ${voices.some((voice) => voice.localService) ? setting(t('settings.voice'), t('settings.voiceText'),
      html`<select aria-label=${t('settings.voice')} @change=${(/** @type {Event} */ e) => setVoice(valueOf(e) || null)}>
        <option value="">${t('settings.voiceAuto')}</option>
        ${rankVoices(voices, locale.value, [locale.value, ...navigator.languages])
          .map((voice) => html`<option value=${voice.name} ?selected=${voice.name === settings.voice}>${voice.name}</option>`)}
      </select>`) : nothing}
    ${setting(t('knows.title', { name: BRAND.name }), t('knows.lede', { name: BRAND.name }),
      html`<button class="button" @click=${() => { app.dialog.value = 'knows' }}>${t('collection.open')}</button>`)}
    <p class="about muted small"><a href="manifesto.html" target="_blank" rel="noopener">${BRAND.name} 0.7</a> · ${t('settings.about')}</p>`
}

const appearance = () => html`
  ${setting(t('settings.mode'), null, html`<span class="segmented" role="radiogroup" aria-label=${t('settings.mode')}>
    ${(/** @type {const} */ (['light', 'dark'])).map((option) => html`<label>
      <input type="radio" name="theme" .checked=${theme.value === option} @change=${() => setTheme(option)}>
      <span>${t(`theme.${option}`)}</span>
    </label>`)}
  </span>`)}
  <section>${looks(effective.value.settings.look)}</section>`

function approvals() {
  const { settings, locked } = effective.value
  return html`<section>
    <h3>${t('settings.rules')}</h3>
    <p class="muted">${t('settings.rulesText', { name: BRAND.name })}</p>
    <ul class="rules">${RULE_KINDS.map((kind) => {
      const current = resolveRule(kind, { user: settings.rules })
      const isLocked = locked.has(`rules.${kind}`)
      return html`<li class="setting">
        <span class="rule-kind">${t(`kind.${kind}.label`)}${isLocked ? html` <span class="muted small">${t('policy.locked')}</span>` : nothing}</span>
        <span class="segmented" role="radiogroup" aria-label=${t(`kind.${kind}.label`)}>
          ${(/** @type {const} */ (['allow', 'ask', 'never'])).map((option) => html`<label>
            <input type="radio" name=${`rule-${kind}`} .checked=${current === option} ?disabled=${isLocked} @change=${() => setRule(kind, option)}>
            <span>${t(`rules.${option}`)}</span>
          </label>`)}
        </span>
      </li>`
    })}</ul>
  </section>`
}

function data() {
  const usage = storage.value?.usage
  return html`
    ${setting(t('storage.title'), app.ephemeral.value ? t('storage.ephemeral') : usage === undefined ? '' : t('storage.usage', { name: BRAND.name, size: formatBytes(usage) }),
      storage.value?.persisted ? html`<p class="muted">${icons.check} ${t('storage.persisted')}</p>`
        : app.ephemeral.value ? nothing
        : html`<button class="button" @click=${persist}>${t('storage.persist')}</button>`)}
    ${isDenied('backup') ? nothing : html`<section>
      <h3>${t('cap.backup.name')}</h3>
      <p class="muted">${t('backup.text', { name: BRAND.name })}</p>
      <div class="row">
        <button class="button" @click=${backup}>${icons.download} ${t('backup.download')}</button>
        <label class="button subtle">${icons.upload} ${t('backup.restore')}
          <input type="file" accept=".zip,application/zip" class="visually-hidden" @change=${restore}>
        </label>
      </div>
    </section>`}`
}

/** Settings is a menu beside the section open, like the Claude apps' (D113): each section's label, icon and what it shows. */
const SECTIONS = {
  general: { label: 'settings.general', icon: icons.gear, show: general },
  appearance: { label: 'settings.appearance', icon: icons.contrast, show: appearance },
  capabilities: { label: 'settings.capabilities', icon: icons.tiles, show: capabilities },
  approvals: { label: 'settings.approvals', icon: icons.shield, show: approvals },
  data: { label: 'settings.storage', icon: icons.data, show: data },
}
/** @typedef {keyof typeof SECTIONS} Section */
const section = signal(/** @type {Section} */ ('general'))

/** Opens Settings on one of its sections. @param {Section} [name] */
export function openSettings(name = 'general') {
  section.value = name
  app.dialog.value = 'settings'
}

class Settings extends Element {
  render() {
    const open = section.value
    return html`<dialog class="sheet settings" @close=${closed('settings')} @click=${backdrop}>
      ${head(t('settings.title'))}
      <nav class="settings-nav" aria-label=${t('settings.title')}>
        ${(/** @type {Section[]} */ (Object.keys(SECTIONS))).map((id) => html`<button aria-current=${id === open ? 'page' : 'false'}
          @click=${() => { section.value = id }}>${SECTIONS[id].icon}${t(SECTIONS[id].label)}</button>`)}
      </nav>
      <div class="settings-panel">${SECTIONS[open].show()}</div>
    </dialog>`
  }

  #shown = ''

  updated() {
    syncDialog(this, 'settings')
    if (app.dialog.value !== 'settings') return
    if (!storage.value) app.fs.estimate?.().then((value) => { storage.value = value })
    // On a phone the menu is a strip: the section open stays in view.
    if (this.#shown !== section.value) this.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    this.#shown = section.value
  }
}

// ─── What Jean can do ────────────────────────────────────────────────────────

// The house (docs/design.md), in Settings: discovered capabilities are lit rooms; the rest wait
// in the shadow, like a game's collection screen, and can be turned on early.
const ROOM_ICONS = /** @type {Record<string, keyof typeof icons>} */ ({
  files: 'file', made: 'table', compute: 'calc', reflexes: 'lamp', memory: 'note', projects: 'rooms', skills: 'repeat', routines: 'calendar', python: 'code',
  search: 'globe', connections: 'plug', helpers: 'helpers', check: 'check', since: 'clock', names: 'tag', live: 'wave', backup: 'download', 'brain-local': 'chip',
})
/** Where a lit room leads. */
const OPENS = /** @type {Record<string, typeof app.dialog.value>} */ ({ memory: 'knows', skills: 'knows', routines: 'knows', projects: 'history', connections: 'connections' })

/** @param {string} id */
async function turnOn(id) {
  if (id === 'reflexes') return accept('reflexes')
  if (!(await unlock(id))) return
  if (id === 'brain-local') app.dialog.value = 'brain'
  else begin(id)
}

/** Whether a lit capability still waits for a download (Intuition's weights). @param {string} id */
function waiting(id) {
  const module = loaded.value.get(id)
  return id === 'reflexes' && module && !module.decide
}

function capabilities() {
  const lit = loaded.value
  const ids = CATALOGUE.filter((id) => !isDenied(id))
  const count = ids.filter((id) => lit.has(id)).length
  return html`<section class="house">
    <h3>${t('collection.title', { name: BRAND.name })}</h3>
    <p class="muted">${t('collection.lede', { name: BRAND.name })}</p>
    <p class="muted small">${t('collection.count', { count, total: ids.length })}</p>
    <ul class="rooms">${ids.map((id) => html`<li class="room-card ${lit.has(id) ? 'is-lit' : ''}">
      <span class="room-icon" aria-hidden="true">${icons[ROOM_ICONS[id]]}</span>
      <div class="room-text">
        <h3>${t(`cap.${id}.name`)}</h3>
        <p>${t(`cap.${id}.text`, { name: BRAND.name, size: formatBytes(BYTES[id] ?? 0) })}</p>
      </div>
      ${!lit.has(id) ? html`<button class="button" @click=${() => turnOn(id)}>${t('collection.turnOn')}</button>`
        : waiting(id) && !app.offer.value ? html`<button class="button" @click=${() => accept(id)}>${icons.download} ${t('cap.reflexes.yes', { size: formatBytes(BYTES.reflexes) })}</button>`
        : OPENS[id] ? html`<button class="button" @click=${() => { app.dialog.value = OPENS[id] }}>${t('collection.open')}</button>`
        : html`<span class="room-on">${icons.check}<span class="visually-hidden">${t('collection.on')}</span></span>`}
    </li>`)}</ul>
    ${count < ids.length ? html`<button class="button wide" @click=${unlockAll}>${t('collection.all')}</button>` : nothing}
  </section>`
}

/** @typedef {import('../core/settings.js').Look} Look */
/** @param {Event} event */
const valueOf = (event) => /** @type {HTMLInputElement} */ (event.target).value

/** Jean's looks, then the user's touches over the one chosen, shown as they change (D111). @param {Look} [look] */
function looks(look = {}) {
  const chosen = lookId(look.id)
  const size = look.size ?? 1
  return html`<fieldset class="looks">
      <legend>${t('look.title')}</legend>
      ${Object.keys(LOOKS).map((id) => html`<label class="choice-option look">
        <input type="radio" name="look" .checked=${id === chosen} @change=${() => setLook({ id })}>
        <span class="look-preview" data-look-preview=${id} aria-hidden="true"><span></span><span></span><span></span></span>
        <span><strong>${t(`look.${id}`)}</strong><small>${t(`look.${id}.text`)}</small></span>
      </label>`)}
    </fieldset>
    <details class="other">
      <summary>${t('look.custom')}</summary>
      <div class="stack">
        <div class="look-colours">
          <label>${t('look.accent')}<input type="color" .value=${live(look.accent ?? LOOKS[chosen].accent)}
            @input=${(/** @type {Event} */ e) => setLook({ accent: valueOf(e) }, { later: true })}></label>
          <label>${t('look.background')}<input type="color" .value=${live(look.background ?? LOOKS[chosen].bar[theme.value === 'light' ? 1 : 0])}
            @input=${(/** @type {Event} */ e) => setLook({ background: valueOf(e) }, { later: true })}></label>
        </div>
        <label><span class="look-size">${t('look.size')}<output>${new Intl.NumberFormat(locale.value, { style: 'percent' }).format(size)}</output></span>
          <input type="range" min=${SIZES.min} max=${SIZES.max} step=${SIZES.step} .value=${live(String(size))}
            @input=${(/** @type {Event} */ e) => setLook({ size: Number(valueOf(e)) }, { later: true })}></label>
        <label>${t('look.font')}
          <select @change=${(/** @type {Event} */ e) => setLook({ font: valueOf(e) || undefined })}>
            <option value="">${t('look.font.look')}</option>
            ${Object.keys(FONTS).map((id) => html`<option value=${id} ?selected=${id === look.font}>${t(`look.font.${id}`)}</option>`)}
          </select></label>
        <label>${t('look.css')}<textarea class="look-css" rows="6" dir="ltr" spellcheck="false" autocapitalize="off" .value=${live(look.css ?? '')}
          @input=${(/** @type {Event} */ e) => setLook({ css: valueOf(e) || undefined }, { later: true })}></textarea></label>
        <p class="hint">${t('look.cssHint')}</p>
        <div class="row"><button class="button subtle" ?disabled=${!touched(look)} @click=${(/** @type {Event} */ e) => {
          const summary = /** @type {HTMLElement} */ (e.currentTarget).closest('details')?.querySelector('summary')
          setLook(null)
          summary?.focus()
        }}>${t('look.reset')}</button></div>
      </div>
    </details>`
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
