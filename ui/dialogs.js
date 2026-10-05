// History and settings dialogs (native <dialog>: focus trap and Escape for free), and the brains
// and the house of what Jean can do, in Settings.
import { html, svg, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import {
  app, effective, activeBrain, setLocale, setRule, setVoice, setBrainMode, updateSettings, notify, loadModels,
  newConversation, turnPage, showError, theme, setTheme, setLook, LOCALES, CITED,
} from './state.js'
import { connectBrain, continueWithBrain, addBrain, removeBrain, useBrain, setVersion, startOpenRouter } from './brains.js'
import { isLocal } from './auto.js'
import { unlock, isDenied, loaded, SIZES as BYTES } from './caps.js'
import { CATALOGUE, FINDABLE, SEARCHABLE, BROWSED, accept, begin, unlockAll } from './discovery.js'
import { ulid } from '../core/ulid.js'
import { BRAND } from '../brand.js'
import { PROVIDERS } from '../core/llm.js'
import { RULE_KINDS, resolveRule } from '../core/rules.js'
import { PAGE_DEFAULTS, pageRights, site } from './csp.js'
import { t, locale, formatBytes, useStrings, languageName, preferredLocales } from '../core/i18n.js'
import { deviceVoices } from './voices.js'
import { rankVoices } from './language.js'
import { icons } from './icons.js'
import { conversationList, findEntry, profileEntry } from './inbox.js'
import { SHORTCUTS } from './shell.js'
import { LOOKS, lookId, touched } from './looks.js'
import { FONTS, SIZES } from './touches.js'

/** @typedef {import('../core/types.js').BrainConfig} BrainConfig */

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
      <button class="button wide" aria-keyshortcuts=${SHORTCUTS.new} @click=${() => turnPage(newConversation)}>${icons.plus} ${t('action.new')}</button>
      ${findEntry()}
      ${conversationList()}
      ${profileEntry('drawer')}
    </dialog>`
  }

  updated() {
    syncDialog(this, 'history')
  }
}

// ─── Brains ──────────────────────────────────────────────────────────────────

// Settings' Brains (D128, D134): the brains connected, as one choice of who answers, Auto first,
// as the picker offers it; then the ways to add one, one open at a time, each saying what it
// needs in a line and, once open, the rest, with what it says back under its own form.

/** What a way to add a brain says back: connecting, or why it didn't. */
const status = signal(/** @type {{ way: string, kind: 'busy' | 'error', message: string } | null} */ (null))
/** The on-device brain's module, loaded when Brains first opens to check this device. */
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

const localProvider = signal(/** @type {'ollama' | 'lmstudio' | 'custom'} */ ('ollama'))
// What the user typed survives re-renders; picking another app resets it to that app's default.
const localAddress = signal(PROVIDERS.ollama.baseURL)

/**
 * Connects a brain from one of the ways, which says how it went. Connected, the way closes and
 * Settings with it; refused, the error names the service, or the address's host for another.
 * @param {string} way @param {string} name @param {() => Promise<unknown>} task
 */
async function attempt(way, name, task) {
  status.value = { way, kind: 'busy', message: t('brain.connecting') }
  try {
    await task()
    status.value = null
    document.querySelector('details.way[open]')?.removeAttribute('open')
    continueWithBrain()
  } catch (error) {
    const code = /** @type {any} */ (error)?.code ?? 'unknown'
    status.value = { way, kind: 'error', message: t(`error.${code}`, { brain: name, origin: location.origin }) }
  }
}

/** @param {SubmitEvent} event */
function connectKey(event) {
  event.preventDefault()
  const form = new FormData(/** @type {HTMLFormElement} */ (event.target))
  const provider = /** @type {BrainConfig['provider']} */ (form.get('provider'))
  const project = String(form.get('project') ?? '').trim()
  const baseURL = provider === 'vertex' ? PROVIDERS.vertex.baseURL.replace('{project}', encodeURIComponent(project)) : undefined
  attempt('key', t(`provider.${provider}`), () => connectBrain({ provider, apiKey: String(form.get('key')).trim(), baseURL }))
}

/** @param {SubmitEvent} event */
function connectLocal(event) {
  event.preventDefault()
  const provider = localProvider.value
  const baseURL = String(new FormData(/** @type {HTMLFormElement} */ (event.target)).get('baseURL')).trim()
  attempt('local', provider === 'custom' ? new URL(baseURL).host : t(`provider.${provider}`), () => connectBrain({ provider, baseURL }))
}

/** Settings' Brains: before any, why one is needed and the ways to add it; after, who answers, then the ways to add another. */
function brains() {
  const { settings, locked } = effective.value
  const brainsLocked = locked.has('brains')
  const first = !settings.brains.length
  return html`${first ? html`<p class="lede">${t('brain.lede', { name: BRAND.name })}</p>` : answers(settings, brainsLocked)}
    ${brainsLocked ? html`<p class="muted">${t('policy.locked')}</p>` : html`<section>
      ${first ? nothing : html`<h3>${t('brain.add')}</h3>`}
      ${ways(first)}
    </section>`}`
}

/** A brain's icon, name and where it runs: this device, this computer, or the cloud. @param {BrainConfig} brain */
function describe(brain) {
  if (brain.api === 'device') return { icon: icons.chip, name: t('provider.device'), where: t('brain.device.private') }
  const name = brain.provider === 'custom' ? new URL(brain.baseURL).host : t(`provider.${brain.provider}`)
  return isLocal(brain) ? { icon: icons.computer, name, where: t('picker.local') } : { icon: icons.globe, name, where: t('brain.cloud') }
}

/** @param {boolean} checked @param {() => unknown} choose @param {{ icon: unknown, name: string, where: string }} brain */
const answer = (checked, choose, { icon, name, where }) => html`<label class="item">
  <input type="radio" name="answers" .checked=${checked} @change=${choose}>
  <span class="item-icon">${icon}</span><span class="item-text"><strong><bdi>${name}</bdi></strong><small>${where}</small></span>
</label>`

/**
 * Who answers, as the picker offers it: Auto, or one of the brains, each with its version and a
 * way to remove it. Then, while one is in the cloud, never sending there.
 * @param {import('../core/settings.js').Settings} settings @param {boolean} brainsLocked
 */
function answers(settings, brainsLocked) {
  const active = activeBrain.value
  return html`<section>
      <h3 id="brains-yours">${t('brain.connectedTitle')}</h3>
      <div class="list brains" role="radiogroup" aria-labelledby="brains-yours">
        <div class=${settings.auto ? 'is-selected' : ''}>${answer(settings.auto, () => setBrainMode({ auto: true }), { icon: icons.spark, name: t('auto.name'), where: t('auto.text') })}</div>
        ${settings.brains.map((brain) => {
          const chosen = !settings.auto && brain.id === active?.id
          return html`<div class=${chosen ? 'is-selected' : ''}>
            ${answer(chosen, () => setBrainMode({ auto: false }).then(() => useBrain(brain.id)), describe(brain))}
            ${brain.api === 'device' ? nothing : html`<input class="model-input" list=${`models-${brain.id}`} .value=${live(brain.model)} dir="ltr"
                aria-label=${t('brain.model')} title=${t('brain.model')} @change=${(/** @type {Event} */ e) => setVersion(brain.id, valueOf(e).trim())}>
              <datalist id=${`models-${brain.id}`}>${(app.models.value[brain.id] ?? []).map((model) => html`<option value=${model.id}>${model.name ?? ''}</option>`)}</datalist>`}
            ${brainsLocked ? nothing : html`<button class="icon-button subtle" aria-label=${t('action.remove')} title=${t('action.remove')}
              @click=${() => confirm(t('brain.confirmRemove')) && removeBrain(brain.id).catch(showError)}>${icons.trash}</button>`}
          </div>`
        })}
      </div>
    </section>
    ${settings.brains.some((brain) => !isLocal(brain)) ? setting(t('picker.neverCloud'), null, html`<input type="checkbox" class="switch" role="switch"
      aria-label=${t('picker.neverCloud')} .checked=${!settings.cloud} @change=${(/** @type {Event} */ e) => setBrainMode({ cloud: !(/** @type {HTMLInputElement} */ (e.target).checked) })}>`) : nothing}`
}

/** Whether the user has opened or closed a way: then none opens on its own. */
let wayPicked = false

/**
 * One way to add a brain: what it is and what it needs in a line, then, once open, the rest, and
 * what it says back. One is open at a time.
 * @param {string} id @param {unknown} icon @param {string} title @param {string} needs @param {boolean} open @param {unknown} body
 */
const way = (id, icon, title, needs, open, body) => html`<li><details name="brain-way" class="way is-${id}" ?open=${open}>
  <summary @click=${() => { wayPicked = true }}><span class="item-icon">${icon}</span><span class="item-text"><strong>${title}</strong><small>${needs}</small></span>${icons.chevron}</summary>
  <div class="item-body">
    ${body}
    ${status.value?.way === id ? html`<p class="status is-${status.value.kind}" role="status">${status.value.message}</p>` : nothing}
  </div>
</details></li>`

/** The services whose key can be pasted: each takes requests from a browser, under its own published terms. */
const KEYED = ['openai', 'anthropic', 'gemini', 'vertex', 'mistral', 'openrouter', 'vercel', 'huggingface', 'groq', 'cerebras', 'together', 'fireworks', 'xai']
/** The service picked in the key's form: Vertex AI also needs the Google Cloud project. */
const keyProvider = signal('openai')

/** Where each service makes keys, signing in first (provider identities, D33). Hugging Face's comes ready to call its providers. */
const KEY_PAGES = /** @type {Record<string, string>} */ ({
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://platform.claude.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
  mistral: 'https://console.mistral.ai/api-keys',
  openrouter: 'https://openrouter.ai/settings/keys',
  vercel: 'https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys',
  huggingface: 'https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained',
  groq: 'https://console.groq.com/keys',
  cerebras: 'https://cloud.cerebras.ai/platform',
  together: 'https://api.together.ai/settings/api-keys',
  fireworks: 'https://app.fireworks.ai/settings/users/api-keys',
  xai: 'https://console.x.ai',
})
const VERTEX_COMMAND = 'gcloud auth print-access-token'

/** @param {string} href @param {string} text */
const outside = (href, text) => html`<a href=${href} target="_blank" rel="noopener noreferrer">${text} ${icons.arrow}</a>`

/** Copies the command, or, where the browser won't, selects it to copy by hand. @param {Event} event */
function copyCommand(event) {
  const code = /** @type {HTMLElement} */ (event.currentTarget).previousElementSibling
  navigator.clipboard.writeText(VERTEX_COMMAND).then(() => notify(t('toast.copied')), () => code && getSelection()?.selectAllChildren(code))
}

/** How to get a key for the service picked, for whoever has none yet. @param {string} id */
function keySteps(id) {
  if (id === 'vertex') {
    return html`<ol class="key-steps">
      <li>${outside('https://console.cloud.google.com/vertex-ai', t('brain.key.vertexOn'))}</li>
      <li>${outside('https://shell.cloud.google.com/?show=terminal', t('brain.key.shell'))}</li>
      <li>${t('brain.key.type')}
        <span class="key-command"><code dir="ltr">${VERTEX_COMMAND}</code><button type="button" class="icon-button subtle" aria-label=${t('action.copy')} title=${t('action.copy')}
          @click=${copyCommand}>${icons.copy}</button></span></li>
      <li>${t('brain.key.hour')}</li>
    </ol>`
  }
  return html`<ol class="key-steps">
    <li>${outside(KEY_PAGES[id], t('brain.key.open', { service: t(`provider.${id}`) }))}</li>
    <li>${t('brain.key.create')}</li>
    <li>${t('brain.key.paste')}</li>
  </ol>`
}

/** "OpenAI, Anthropic, OpenRouter", in the user's language. @param {string[]} ids */
const providers = (ids) => new Intl.ListFormat(locale.value, { type: 'conjunction', style: 'narrow' }).format(ids.map((id) => t(`provider.${id}`)))

/**
 * The ways to add a brain. Before the first, one is open once this device is checked (a way
 * added open beside an open one would close), unless the user picked one meanwhile: the
 * device's, where it can run (the first rung), or else OpenRouter's. The device's stays open
 * while it downloads.
 * @param {boolean} first
 */
function ways(first) {
  const module = local.value
  const device = module && deviceCheck.value?.ok && !effective.value.settings.brains.some((brain) => brain.provider === 'device') ? module : null
  const progress = device?.download.value
  const opens = first && !wayPicked && (deviceCheck.value !== null || isDenied('brain-local'))
  const busy = status.value?.kind === 'busy'
  return html`<ul class="list ways">
    ${device && progress ? way('device', icons.chip, t('brain.device.title'), t('brain.device.private'), opens || progress.state !== 'idle', html`
      <p>${t('brain.device.text', { name: BRAND.name })}</p>
      ${progress.state === 'downloading' ? html`
        <progress max=${progress.total} value=${progress.loaded} aria-label=${t('brain.device.downloading')}></progress>
        <p class="hint">${t('brain.device.progress', { done: formatBytes(progress.loaded), total: formatBytes(progress.total) })}</p>`
      : progress.state === 'loading' ? html`<p class="status" role="status">${t('brain.device.loading')}</p>`
      : html`
        ${progress.state === 'failed' ? html`<p class="status is-error" role="alert">${t('brain.device.failed')}</p>` : nothing}
        <div class="row"><button class="button primary" @click=${useDevice}>${icons.download} ${t('brain.device.action', { size: formatBytes(device.GEMMA.bytes) })}</button></div>`}`)
    : nothing}
    ${way('quick', icons.spark, t('brain.quick.title'), t('provider.openrouter'), opens && !device, html`
      <p>${t('brain.quick.text')}</p>
      <div class="row"><button class="button primary" @click=${startOpenRouter}>${t('brain.quick.action')} ${icons.arrow}</button></div>`)}
    ${way('key', icons.key, t('brain.key.title'), providers(KEYED), false, html`
      <p>${t('brain.key.text')}</p>
      <form class="stack" @submit=${connectKey}>
        <label>${t('brain.key.provider')}
          <select name="provider" @change=${(/** @type {Event} */ e) => { keyProvider.value = valueOf(e) }}>
            ${KEYED.map((id) => html`<option value=${id} ?selected=${id === keyProvider.value}>${t(`provider.${id}`)}</option>`)}
          </select>
        </label>
        ${keySteps(keyProvider.value)}
        ${keyProvider.value === 'vertex' ? html`
          <label>${t('brain.key.project')}<input name="project" required autocomplete="off" spellcheck="false" dir="ltr"></label>` : nothing}
        <label>${t('brain.key.label')}<input name="key" type="password" autocomplete="off" spellcheck="false" required dir="ltr"></label>
        <div class="row"><button class="button primary" ?disabled=${busy}>${t('brain.connect')}</button></div>
      </form>`)}
    ${way('local', icons.computer, t('brain.local.title'), providers(['ollama', 'lmstudio']), false, html`
      <p>${t('brain.local.text')}</p>
      <form class="stack" @submit=${connectLocal}>
        <label>${t('brain.local.app')}
          <select @change=${(/** @type {Event} */ e) => {
            localProvider.value = /** @type {any} */ (valueOf(e))
            localAddress.value = PROVIDERS[localProvider.value].baseURL
          }}>
            ${['ollama', 'lmstudio', 'custom'].map((id) => html`<option value=${id} ?selected=${id === localProvider.value}>${t(`provider.${id}`)}</option>`)}
          </select>
        </label>
        <label>${t('brain.local.address')}<input name="baseURL" type="url" required dir="ltr" placeholder="http://localhost:11434/v1"
          .value=${live(localAddress.value)} @input=${(/** @type {Event} */ e) => { localAddress.value = valueOf(e) }}></label>
        <p class="hint">${t('brain.local.hint', { origin: location.origin })}</p>
        <div class="row"><button class="button primary" ?disabled=${busy}>${t('brain.connect')}</button></div>
      </form>`)}
  </ul>`
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
export const setting = (label, text, control) => html`<section class="setting">
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
    <p class="about muted small"><a href="manifesto.html" target="_blank" rel="noopener">${BRAND.name} 0.7</a> · ${t('settings.about')}</p>`
}

const appearance = () => html`
  ${setting(t('settings.mode'), null, html`<span class="segmented" role="radiogroup" aria-label=${t('settings.mode')} aria-keyshortcuts=${SHORTCUTS.theme}>
    ${(/** @type {const} */ (['auto', 'light', 'dark'])).map((option) => html`<label>
      <input type="radio" name="theme" .checked=${(app.chosenTheme.value ?? 'auto') === option} @change=${() => setTheme(option === 'auto' ? null : option)}>
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
  </section>
  ${pages()}
  ${relay()}`
}

/**
 * The address the web is reached through, when there is one (D162): a relay with {url} in it, or
 * nothing, and the system's proxy alone. The Computer uses it; policy can set it (`relay`).
 */
function relay() {
  const set = app.policy.relay !== undefined
  return setting(t('relay.title'), set ? t('policy.locked') : t('relay.text'), html`<input dir="ltr" type="url" spellcheck="false" placeholder="https://…?url={url}"
    aria-label=${t('relay.title')} .value=${String(app.policy.relay ?? app.settings.value.relay ?? '')} ?disabled=${set}
    @change=${(/** @type {Event} */ e) => updateSettings({ relay: /** @type {HTMLInputElement} */ (e.target).value.trim() })}>`)
}

/** What a web page may do when it opens beside the conversation (D143), each unless the organisation set it. */
function pages() {
  const rights = pageRights(app.settings.value, app.policy)
  const { allows, locked } = rights
  return html`<section>
    <h3>${t('pages.title')}</h3>
    <p class="muted">${t('pages.text')}</p>
    <ul class="rules">${(/** @type {import('./csp.js').PageRight[]} */ (Object.keys(PAGE_DEFAULTS))).map((right) => html`<li class="setting">
      <div><span class="rule-kind">${t(`pages.${right}`)}</span><p class="muted small">${locked.has(right) ? t('policy.locked') : t(`pages.${right}Text`)}</p></div>
      <input type="checkbox" class="switch" role="switch" aria-label=${t(`pages.${right}`)} .checked=${allows[right]}
        ?disabled=${locked.has(right) || (right === 'network' && !allows.scripts)}
        @change=${(/** @type {Event} */ e) => setPages({ [right]: /** @type {HTMLInputElement} */ (e.target).checked })}>
      ${right === 'network' && allows.scripts && allows.network ? siteList({ sites: rights.sites, fixed: locked.has('sites'), set: (sites) => setPages({ sites }), any: true }) : nothing}
    </li>`)}</ul>
  </section>`
}

/** @param {import('./csp.js').PageSettings} change */
const setPages = (change) => updateSettings({ pages: { ...app.settings.value.pages, ...change } })

/**
 * Sites, inline after one another: those a page's code may reach (`any`: `*`, any, until one is
 * named), or the Computer's (D162). Enter adds what is typed when it is a site, and nothing else
 * adds it; × takes one away.
 * @param {{ sites: string[], fixed: boolean, set: (sites: string[]) => void, any?: boolean }} options
 */
export function siteList({ sites, fixed, set, any = false }) {
  /** @param {KeyboardEvent} event */
  const add = (event) => {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return
    event.preventDefault()
    const input = /** @type {HTMLInputElement} */ (event.target)
    const typed = site(input.value)
    input.setAttribute('aria-invalid', String(!typed))
    if (!typed) return
    input.value = ''
    set(typed === '*' && any ? [] : [...new Set([...sites, typed])])
  }
  /** @param {Event} event @param {string} gone */
  const remove = (event, gone) => {
    /** @type {HTMLElement} */ (event.currentTarget).closest('.sites')?.querySelector('input')?.focus()
    set(sites.filter((other) => other !== gone))
  }
  return html`<div class="reach">
    <div class="sites">
      <ul aria-label=${t('pages.sites')}>${(sites.length || !any ? sites : ['*']).map((entry) => html`<li><bdi>${entry}</bdi>${sites.length && !fixed
        ? html`<button class="icon-button subtle" aria-label=${t('pages.siteRemove', { site: entry })} title=${t('pages.siteRemove', { site: entry })}
          @click=${(/** @type {Event} */ e) => remove(e, entry)}>${icons.close}</button>` : nothing}</li>`)}</ul>
      ${fixed ? nothing : html`<input dir="ltr" enterkeyhint="done" autocapitalize="off" spellcheck="false" aria-label=${t('pages.siteAdd')} aria-describedby="sites-hint"
        @keydown=${add} @input=${(/** @type {Event} */ e) => /** @type {HTMLInputElement} */ (e.target).removeAttribute('aria-invalid')}>`}
    </div>
    <p class="muted small" id="sites-hint">${fixed ? t('policy.locked') : t('pages.sitesText')}</p>
  </div>`
}

function data() {
  const usage = storage.value?.usage
  return html`
    ${setting(t('storage.title'), app.ephemeral.value ? t('storage.ephemeral') : usage === undefined ? '' : t('storage.usage', { name: BRAND.name, size: formatBytes(usage) }),
      storage.value?.persisted ? html`<p class="muted">${icons.check} ${t('storage.persisted')}</p>` : nothing)}
    ${isDenied('backup') ? nothing : html`<section>
      <h3>${t('cap.backup.name')}</h3>
      <p class="muted">${t('backup.text', { name: BRAND.name })}</p>
      <div class="row">
        <button class="button" @click=${backup}>${icons.download} ${t('backup.download')}</button>
        <label class="button subtle">${icons.upload} ${t('backup.restore')}
          <input type="file" accept=".zip,application/zip" class="visually-hidden" @change=${restore}>
        </label>
      </div>
    </section>`}
    ${loaded.value.get('sync')?.panel?.() ?? nothing}`
}

/**
 * @typedef {'general' | 'brains' | 'appearance' | 'you' | 'connections' | 'skills' | 'routines' | 'computer' | 'capabilities' | 'approvals' | 'data'} Section
 * @typedef {Object} Place
 * @property {string} label    its name in the menu
 * @property {unknown} icon
 * @property {() => unknown} show
 * @property {() => boolean} [when]  shown once its capability is on
 * @property {() => string} [also]   more words it is found by (⌘K)
 * @property {boolean} [group]       starts a group of the menu
 */

/** What Jean knows about you, its skills and its routines (ui/knows.js): loaded the first time one is shown. */
const knows = signal(/** @type {typeof import('./knows.js') | null} */ (null))
/** @type {Promise<typeof import('./knows.js')> | null} */
let knowing = null
const KNOWN = ['you', 'skills', 'routines']

/**
 * Settings is a menu beside the section open, like the Claude apps' (D113), in three groups (D134):
 * Jean itself; what it knows and can do, where a capability's own section comes once it is on;
 * and what it may do and what it keeps.
 * @type {Record<Section, Place>}
 */
export const SECTIONS = {
  general: { label: 'settings.general', icon: icons.gear, show: general },
  brains: { label: 'settings.brains', icon: icons.spark, show: brains },
  appearance: { label: 'settings.appearance', icon: icons.contrast, show: appearance },
  you: { label: 'settings.you', icon: icons.person, show: () => knows.value?.you() ?? nothing, also: () => `${t('knows.title', { name: BRAND.name })} ${t('you.name')}`, group: true },
  connections: { label: 'cap.connections.name', icon: icons.plug, show: () => loaded.value.get('connections')?.panel?.() ?? nothing, when: () => loaded.value.has('connections') },
  skills: { label: 'cap.skills.name', icon: icons.scroll, show: () => knows.value?.skills() ?? nothing, when: () => loaded.value.has('skills') },
  routines: { label: 'cap.routines.name', icon: icons.alarm, show: () => knows.value?.routines() ?? nothing, when: () => loaded.value.has('routines') },
  capabilities: { label: 'settings.capabilities', icon: icons.tiles, show: capabilities },
  computer: { label: 'cap.computer.name', icon: icons.code, show: () => loaded.value.get('computer')?.panel?.() ?? nothing, when: () => loaded.value.has('computer') },
  approvals: { label: 'settings.approvals', icon: icons.shield, show: approvals, group: true },
  data: { label: 'settings.storage', icon: icons.data, show: data },
}
/** The sections shown now. */
export const sections = () => /** @type {Section[]} */ (Object.keys(SECTIONS)).filter((id) => SECTIONS[id].when?.() ?? true)

/** Opens Settings on one of its sections. @param {Section} [name] */
export function openSettings(name = 'general') {
  app.section.value = name
  app.dialog.value = 'settings'
}

class Settings extends Element {
  render() {
    const shown = sections()
    const open = shown.find((id) => id === app.section.value) ?? 'general'
    // No title: the menu says where the user is. Closing sits above it, where the eye starts.
    return html`<dialog class="sheet settings" aria-label=${t('settings.title')} @close=${closed('settings')} @click=${backdrop}>
      <button class="icon-button settings-close" @click=${close} aria-label=${t('action.close')} title=${t('action.close')}>${icons.close}</button>
      <nav class="settings-nav" aria-label=${t('settings.title')}>
        ${shown.map((id) => html`${SECTIONS[id].group ? html`<hr>` : nothing}<button aria-current=${id === open ? 'page' : 'false'}
          @click=${() => { app.section.value = id }}>${SECTIONS[id].icon}${t(SECTIONS[id].label)}</button>`)}
      </nav>
      <div class="settings-panel">${SECTIONS[open].show()}</div>
    </dialog>`
  }

  #shown = ''

  updated() {
    syncDialog(this, 'settings')
    const open = app.dialog.value === 'settings'
    // A brain that failed to connect is forgotten once Brains is left.
    if (!(open && app.section.value === 'brains') && status.value?.kind === 'error') status.value = null
    if (!open) { this.#shown = ''; return }
    // An address may name a section not shown, or not yet (capabilities come back after the first paint): then General.
    const missing = () => !sections().some((id) => id === app.section.value)
    if (missing()) app.ready.then(() => { if (missing()) app.section.value = 'general' })
    if (!storage.value) app.fs.estimate?.().then((value) => { storage.value = value })
    if (app.section.value === 'brains') {
      checkDevice()
      for (const brain of effective.value.settings.brains) if (brain.api !== 'device') loadModels(brain)
    }
    if (this.#shown !== app.section.value) {
      // What Jean knows, its skills and routines are read again each time one is entered.
      if (KNOWN.includes(app.section.value)) {
        knowing ??= import('./knows.js').then((module) => (knows.value = module))
        knowing.then((module) => module.refresh())
      }
      // A section entered opens at its top, and on a phone, where the menu is a strip, its button stays in view.
      const panel = this.querySelector('.settings-panel')
      if (panel) panel.scrollTop = 0
      this.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    this.#shown = app.section.value
    // The trophies found catch the light one after another (CSSOM: the CSP forbids style attributes).
    this.querySelectorAll('.trophy').forEach((trophy, i) => /** @type {HTMLElement} */ (trophy).style.setProperty('--i', String(i)))
  }
}

// ─── What Jean can do ────────────────────────────────────────────────────────

// The house (docs/design.md), in Settings, is a case of trophies (D127): each capability is one,
// lit once found, a silhouette until then that says how it is found. A ring of a segment each
// circles the little light, whose rank rises a quarter of the case at a time, to daylight. The
// trophy picked, at first the next to find, shows on a plaque that stays in view.
const ROOM_ICONS = /** @type {Record<string, keyof typeof icons>} */ ({
  files: 'file', made: 'table', computer: 'code', reflexes: 'lamp', memory: 'note', find: 'search', projects: 'folder', folders: 'computer', skills: 'scroll', routines: 'alarm',
  search: 'websearch', browser: 'globe', connections: 'plug', helpers: 'helpers', check: 'check', since: 'clock', names: 'tag', live: 'wave', backup: 'download', sync: 'sync', 'brain-local': 'chip',
})
/** Where a lit room leads: its section of Settings, search, or the browser. */
const OPENS = /** @type {Record<string, () => void>} */ ({
  memory: () => openSettings('you'), skills: () => openSettings('skills'), routines: () => openSettings('routines'),
  connections: () => openSettings('connections'), computer: () => openSettings('computer'), sync: () => openSettings('data'), find: () => { app.dialog.value = 'find' },
  browser: () => { app.dialog.value = null; import('../caps/browser/browser.js').then((module) => module.show()) },
  folders: () => { app.dialog.value = null; import('../caps/folders/folders.js').then((module) => module.choose()) },
})
const RANKS = ['spark', 'candle', 'lantern', 'hearth', 'daylight']
/** Trophies found by counting, as ui/discovery.js counts them: how far along, out of how many. */
const COUNTED = /** @type {Record<string, () => number[]>} */ ({ reflexes: () => [app.conversations.value.length, 2], backup: () => [app.conversations.value.length, 3],
  find: () => [app.conversations.value.length, FINDABLE], search: () => [app.conversations.value.length, SEARCHABLE],
  live: () => [effective.value.settings.dictated ?? 0, 3], check: () => [effective.value.settings.cited ?? 0, CITED],
  browser: () => [effective.value.settings.browsed ?? 0, BROWSED] })
const picked = signal('')

/** @param {string} id */
async function turnOn(id) {
  picked.value = id
  if (id === 'reflexes') return accept('reflexes')
  if (!(await unlock(id))) return
  if (id === 'brain-local') openSettings('brains')
  else begin(id)
}

/** How far along a trophy found by counting is, a pip a step. @param {string} id */
function pips(id) {
  const [done = 0, goal = 0] = COUNTED[id]?.() ?? []
  return goal ? html`<span class="pips" role="progressbar" aria-labelledby="trophy-how" aria-valuemax=${goal} aria-valuenow=${Math.min(done, goal)}>
    ${Array.from({ length: goal }, (_, i) => html`<i class=${i < done ? 'is-lit' : ''}></i>`)}</span>` : nothing
}

function capabilities() {
  const lit = loaded.value
  const ids = CATALOGUE.filter((id) => !isDenied(id))
  const count = ids.filter((id) => lit.has(id)).length
  const total = ids.length
  const rank = count === total ? 4 : Math.floor((4 * count) / total)
  const shown = ids.includes(picked.value) ? picked.value : ids.find((id) => !lit.has(id)) ?? ids[0]
  // The ring starts at the top: a segment a trophy, in the order of the case, with a gap after each.
  const arc = (2 * Math.PI * 46) / total
  return html`<section class="house" data-rank=${rank}>
    <header class="house-head">
      <span class="house-light">
        <svg class="house-ring" viewBox="0 0 100 100" aria-hidden="true">${ids.map((id, i) => svg`<circle cx="50" cy="50" r="46"
          stroke-dasharray="${arc * 0.8} ${arc * total}" stroke-dashoffset=${-i * arc} class=${lit.has(id) ? 'is-lit' : ''}/>`)}</svg>
        <app-persona></app-persona>
      </span>
      <div>
        <h3>${t('collection.title', { name: BRAND.name })}</h3>
        <p class="house-rank">${t(`collection.rank.${RANKS[rank]}`)}</p>
        <p class="muted small">${t('collection.count', { count, total })}${rank < 4 ? html` · ${t('collection.next', {
          count: Math.ceil(((rank + 1) * total) / 4) - count, rank: t(`collection.rank.${RANKS[rank + 1]}`) })}` : nothing}</p>
      </div>
    </header>
    <ul class="trophies">${ids.map((id) => html`<li><button class="trophy ${lit.has(id) ? 'is-lit' : ''}" aria-pressed=${id === shown}
      @click=${() => { picked.value = id; document.querySelector('.plaque')?.scrollIntoView({ block: 'nearest' }) }}>
      <span class="medal">${icons[ROOM_ICONS[id]]}</span>${t(`cap.${id}.name`)}
      ${lit.has(id) ? html`<span class="visually-hidden">${t('collection.on')}</span>` : pips(id)}
    </button></li>`)}</ul>
    ${shown ? plaque(shown, lit.has(shown)) : nothing}
    ${count < total ? html`<button class="button subtle wide" @click=${unlockAll}>${t('collection.all')}</button>` : nothing}
  </section>`
}

/**
 * The trophy picked: how it is found, what it does, and what it offers now: to turn it on early,
 * Intuition's download while it waits for one, or where it leads. @param {string} id @param {boolean} on
 */
const plaque = (id, on) => html`<article class="plaque ${on ? 'is-lit' : ''}" aria-live="polite">
  <span class="medal">${icons[ROOM_ICONS[id]]}</span>
  <div>
    <h3>${t(`cap.${id}.name`)}</h3>
    ${on ? nothing : html`<p class="plaque-how" id="trophy-how"><span>${t('collection.how')}</span>${t(`cap.${id}.hint`)}</p>${pips(id)}`}
    <p>${t(`cap.${id}.text`, { name: BRAND.name, size: formatBytes(BYTES[id] ?? 0) })}</p>
  </div>
  ${!on ? html`<button class="button" @click=${() => turnOn(id)}>${t('collection.turnOn')}</button>`
    : id === 'reflexes' && !loaded.value.get(id)?.decide && !app.offer.value ? html`<button class="button" @click=${() => accept(id)}>${icons.download} ${t('cap.reflexes.yes', { size: formatBytes(BYTES.reflexes) })}</button>`
    : OPENS[id] ? html`<button class="button" @click=${OPENS[id]}>${t('collection.open')}</button>`
    : html`<span class="plaque-on">${icons.check} ${t('collection.on')}</span>`}
</article>`

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
        <span><strong>${t(`look.${id}.name`)}</strong></span>
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

define('app-history', History)
define('app-settings', Settings)
