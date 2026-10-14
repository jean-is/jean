// The drawer and settings dialogs (native <dialog>: focus trap and Escape for free), and the brains
// and the house of what Jean can do, in Settings.
import { html, svg, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import {
  app, effective, activeBrain, setLocale, setRule, updateSettings, notify, loadModels, cloudAllowed,
  showError, theme, setTheme, setLook, LOCALES, CITED, SHORTCUTS,
} from './state.js'
import { connectBrain, continueWithBrain, addBrain, removeBrain, useBrain, setVersion, keepBrain, startOpenRouter, leave, keepOnDevice } from './brains.js'
import { isLocal } from './auto.js'
import { unlock, isDenied, loaded, slots, SIZES as BYTES, WEIGHTS } from './caps.js'
import { CATALOGUE, FINDABLE, SEARCHABLE, BROWSED, STEPPED, everywhere, accept, begin, unlockAll } from './discovery.js'
import { ulid } from '../core/ulid.js'
import { weigh } from '../core/files.js'
import { usedIn } from '../core/settings.js'
import { BRAND } from '../brand.js'
import { PROVIDERS } from '../core/llm.js'
import { RULE_KINDS, resolveRule } from '../core/rules.js'
import { PAGE_DEFAULTS, pageRights, site } from './csp.js'
import { t, locale, formatBytes, useStrings, languageName, preferredLocales } from '../core/i18n.js'
import { deviceVoices } from './voices.js'
import { rankVoices } from './language.js'
import { icons } from './icons.js'
import { sidebarBody, keyNames } from './inbox.js'
import { findButton, placeToasts } from './shell.js'
import { dictation } from './dictation.js'
import { LOOKS, lookId, touched } from './looks.js'
import { FONTS, SIZES } from './touches.js'
import { styleSheet } from './sheet.js'

/** @typedef {import('../core/types.js').BrainConfig} BrainConfig */

// The dialogs' own strings and style sheet come with them (D97, D120): every module that shows a
// dialog imports this one. The sheet goes after ui/style.css, so its rules win a tie. Its lists to
// pick from have the chevron that all have (ui/select.css).
await Promise.all([useStrings('dialogs'), styleSheet('ui/dialogs.css'), styleSheet('ui/select.css')])

/** Whether each dialog was last told to be open. @type {WeakMap<HTMLDialogElement, boolean>} */
const told = new WeakMap()
/** What had the keyboard when each dialog opened. @type {WeakMap<HTMLDialogElement, globalThis.Element | null>} */
const before = new WeakMap()

/**
 * Opens or closes a dialog when app.dialog comes to name it or stops: a render meanwhile never
 * opens again one the browser closed (Escape) before its close event says so. Closed, the keyboard
 * goes back to what had it, as the browser does itself, except WebKit now and then when the dialog
 * goes without a transition (reduced motion): the page is still inert to it until the next frame.
 * Opened before the user did anything, as Settings is by the address a page loads with, the dialog
 * itself takes the keyboard rather than its close button, which a ring would show; Tab leads to it.
 * @param {Element} host @param {string} name
 */
export function syncDialog(host, name) {
  const dialog = host.querySelector('dialog')
  const open = app.dialog.value === name
  if (dialog && told.get(dialog) !== open) {
    told.set(dialog, open)
    if (open && !dialog.open) {
      before.set(dialog, document.activeElement)
      dialog.showModal()
      if (navigator.userActivation?.hasBeenActive === false) { dialog.tabIndex = -1; dialog.focus() }
    } else if (!open && dialog.open) {
      dialog.close()
      const back = before.get(dialog)
      requestAnimationFrame(() => { if (document.activeElement === document.body && back instanceof HTMLElement && back.isConnected) back.focus() })
    }
  }
  placeToasts()
}

export const close = () => { app.dialog.value = null }
/**
 * A dialog closed (Escape, or another one opening): forget it only if it is still the open one, and
 * still closed. The event comes after the fact (a frame later in Chromium), maybe once it opened again.
 * @param {string} name
 */
export const closed = (name) => (/** @type {Event} */ event) => {
  if (app.dialog.value === name && !(/** @type {HTMLDialogElement} */ (event.target)).open) app.dialog.value = null
}
/** @param {MouseEvent} event */
export const backdrop = (event) => { if (event.target === event.currentTarget) close() }

/** @param {string} title */
export const head = (title) => html`<header class="dialog-head">
  <h2>${title}</h2>
  <button class="icon-button" @click=${close} aria-label=${t('action.close')}>${icons.close}</button>
</header>`

// ─── The drawer ──────────────────────────────────────────────────────────────

// Over the conversation, on a narrow window (D165): Search and the button that puts it away at its top, as in Manus.
class History extends Element {
  render() {
    return html`<dialog class="drawer" aria-label=${t('history.title')} @close=${closed('history')} @click=${backdrop}>
      <header class="dialog-head">${findButton()}
        <button class="icon-button" @click=${close} aria-keyshortcuts=${SHORTCUTS.sidebar} aria-label=${t('sidebar.close')}>${icons.sidebar}</button>
      </header>
      ${sidebarBody('drawer')}
    </dialog>`
  }

  updated() {
    syncDialog(this, 'history')
  }
}

// ─── Brains ──────────────────────────────────────────────────────────────────

// Settings' Brains (D128, D134): the brains connected, as one choice of who answers, Auto first,
// as the picker offers it, each used in every project or kept to some (D194); then the ways to add
// one, one open at a time, each saying what it needs in a line and, once open, the rest, with what
// it says back under its own form.

/** What a way to add a brain says back: connecting, or why it didn't. */
const status = signal(/** @type {{ way: string, kind: 'busy' | 'error', message: string } | null} */ (null))
/** The on-device brain's module, loaded when Brains first opens to check this device. */
const local = signal(/** @type {typeof import('../caps/brain-local/brain-local.js') | null} */ (null))
const deviceCheck = signal(/** @type {{ ok: boolean, reason?: string, freed?: number } | null} */ (null))
let checking = false

export async function checkDevice() {
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

export async function useDevice() {
  const module = local.value
  if (!module || !(await unlock('brain-local'))) return
  try {
    await module.prepare()
    await addBrain({ id: ulid(), provider: 'device', api: 'device', baseURL: '', model: module.GEMMA.model })
    // Private from now on: the legend's card says what that means, once, in place of the toast (D270).
    if (!module.onDevice.peek()) notify(t('brain.device.ready'))
    continueWithBrain()
    if (module.onDevice.peek()) module.reveal()
  } catch (error) {
    console.warn('On-device brain', error)
  }
}

/** The device's brain's module, where it can run and isn't added yet. */
export const fit = () => (local.value && deviceCheck.value?.ok && !effective.value.settings.brains.some((brain) => brain.provider === 'device') ? local.value : null)

/** The device's brain on its way: how much has come, then almost ready; nothing before or after. @param {NonNullable<typeof local.value>} device */
export function progressOf(device) {
  const progress = device.download.value
  return progress.state === 'downloading' ? html`
    <progress max=${progress.total} value=${progress.loaded} aria-label=${t('brain.device.downloading')}></progress>
    <p class="hint">${t('brain.device.progress', { done: formatBytes(progress.loaded), total: formatBytes(progress.total) })}</p>`
    : progress.state === 'loading' ? html`<p class="status" role="status">${t('brain.device.loading')}</p>` : null
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

/** The plans' ways, by the brain each adds (D235, D262). */
const PLANNED = /** @type {const} */ ({ claude: 'claudecode', copilot: 'copilot', chatgpt: 'chatgpt' })

/**
 * A plan's brain, through This computer (D235, D262): turned on first, in Settings › Computer. Claude Code and
 * Copilot are the user's own, signed in on it; ChatGPT is signed in to first, the page going there and back.
 * @param {keyof typeof PLANNED} id
 */
async function connectPlan(id) {
  const provider = PLANNED[id]
  status.value = { way: id, kind: 'busy', message: t('brain.connecting') }
  const machine = await unlock('machine') && await import('../caps/machine/machine.js')
  const found = machine && await machine.plan(provider)
  if (machine && found && !found.ready && !found.old && id === 'chatgpt') return machine.chatgptSignIn().then(leave, () => { status.value = { way: id, kind: 'error', message: t('brain.chatgpt.failed') } })
  status.value = found && !found.ready ? { way: id, kind: 'error', message: t(found.old ? 'brain.claude.restart' : `brain.${id}.missing`, { computer: t('cap.machine.name') }) } : null
  if (!found) machine ? machine.show() : openSettings('computer')
  else if (found.ready) attempt(id, t(`provider.${provider}`), () => connectBrain({ provider, baseURL: found.baseURL, apiKey: found.apiKey }))
}

/** Back from ChatGPT's sign-in (D262): Settings › Brains, its way connecting, or saying why it can't. @param {string} outcome signed-in, declined or failed */
export function chatgptBack(outcome) {
  openSettings('brains')
  if (outcome === 'signed-in') return connectPlan('chatgpt')
  status.value = { way: 'chatgpt', kind: 'error', message: t(outcome === 'declined' ? 'brain.chatgpt.declined' : 'brain.chatgpt.failed') }
}

/** Whether the ways to add another brain are shown, once there are brains: asked for by Add a brain, for the visit. */
const adding = signal(false)

/**
 * Settings' Brains: before any, why one is needed and the ways to add it; after, who answers, and the ways to add
 * another only once asked for, or while one says something (back from ChatGPT's sign-in).
 */
function brains() {
  const { settings, locked } = effective.value
  const brainsLocked = locked.has('brains')
  const first = !settings.brains.length
  return html`${first ? html`<p class="lede">${t('brain.lede', { name: BRAND.name })}</p>` : answers(settings, brainsLocked)}
    ${brainsLocked ? html`<p class="muted">${t('policy.locked')}</p>` : first || adding.value || status.value ? html`<section class="brains-add">
      ${first ? nothing : html`<h3>${t('brain.add')}</h3>`}
      ${ways(first)}
    </section>` : nothing}
    ${slots('brains').map((part) => part.draw())}`
}

/** A brain's icon, name and where it runs: this device, this computer, or the cloud. @param {BrainConfig} brain */
function describe(brain) {
  if (brain.api === 'device') return { icon: icons.chip, name: t('provider.device'), where: t('brain.device.private') }
  const name = brain.provider === 'custom' ? new URL(brain.baseURL).host : t(`provider.${brain.provider}`)
  return isLocal(brain) ? { icon: icons.computer, name, where: t('picker.local') } : { icon: icons.globe, name, where: t('brain.cloud') }
}

/**
 * Who may answer: Auto, or a brain, which can't be chosen in a project it isn't used in, nor in the cloud while
 * messages are kept on this device; then its version, and the projects it is kept to. @param {boolean} checked @param {() => unknown} choose
 * @param {{ icon: unknown, name: string, where: string }} brain @param {{ projects?: string[], api?: string, model?: string }} [kept] @param {boolean} [closed]
 */
function answer(checked, choose, { icon, name, where }, kept = {}, closed = false) {
  const names = kept.projects ? app.projects.value.filter((project) => kept.projects?.includes(project.id)).map(projectName) : []
  return html`<label class="item">
    <input type="radio" name="answers" .checked=${checked} ?disabled=${closed || !usedIn(kept, app.project.value.id)} @change=${choose}>
    <span class="item-icon">${icon}</span><span class="item-text"><strong><bdi>${name}</bdi></strong><small>${where}${kept.api !== 'device' && kept.model ? html` · <bdi>${kept.model}</bdi>` : nothing}${names.length
      ? html` · <bdi>${new Intl.ListFormat(locale.value, { type: 'unit', style: 'short' }).format(names)}</bdi>` : nothing}</small></span>
  </label>`
}

/** A project as its menu names it: the home project goes by the assistant's name. @param {import('../core/settings.js').Project} project */
const projectName = (project) => String(project.data.default === true ? project.data.assistantName || BRAND.name : project.data.name)

/** Whether a brain or a connection can be kept to projects: once there are several, or while it is kept to some. @param {{ projects?: string[] }} item */
export const placeable = (item) => loaded.value.has('projects') && (app.projects.value.length > 1 || Boolean(item.projects))

/**
 * Where a brain or a connection is used (D191, D194): every project, or only those ticked, at
 * least one. Unticking "Every project" keeps it to the room's.
 * @param {{ projects?: string[] }} item @param {(projects: string[] | undefined) => unknown} keep
 */
export function where(item, keep) {
  const only = item.projects
  const kept = only ? app.projects.value.filter((project) => only.includes(project.id)) : []
  /** @param {Event} event */
  const ticked = (event) => /** @type {HTMLInputElement} */ (event.target).checked
  return html`<fieldset class="where">
    <legend>${t('projects.where')}</legend>
    <label><input type="checkbox" .checked=${live(!only)} @change=${(/** @type {Event} */ e) => keep(ticked(e) ? undefined : [app.project.value.id])}>${t('projects.everywhere')}</label>
    ${only ? app.projects.value.map((project) => {
      const on = kept.includes(project)
      return html`<label><input type="checkbox" .checked=${live(on)} ?disabled=${on && kept.length === 1}
        @change=${(/** @type {Event} */ e) => keep(ticked(e) ? [...only, project.id] : only.filter((id) => id !== project.id))}><bdi>${projectName(project)}</bdi></label>`
    }) : nothing}
  </fieldset>`
}

/** The brain whose version, projects and Remove are open under it. */
const opened = signal(/** @type {string | null} */ (null))

/**
 * Who answers, as the picker offers it: Auto, or one of the brains, each saying where it runs and its version, the
 * rest under its button: its version to change, the projects it is used in, Remove. Then, while one is in the cloud,
 * keeping messages on this device, which a project kept there holds on; Add a brain at the top, until it is asked for.
 * @param {import('../core/settings.js').Settings} settings @param {boolean} brainsLocked
 */
function answers(settings, brainsLocked) {
  const active = activeBrain.value, kept = app.project.value.data.cloud === false
  return html`<section>
      <header class="brains-head"><h3 id="brains-yours">${t('brain.connectedTitle')}</h3>${brainsLocked || adding.value || status.value ? nothing : html`<button class="button subtle"
        @click=${() => { adding.value = true; requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector('.brains-add summary'))?.focus()) }}>${icons.plus} ${t('brain.add')}</button>`}</header>
      <div class="list brains" role="radiogroup" aria-labelledby="brains-yours">
        <div class=${settings.auto ? 'is-selected' : ''}>${answer(settings.auto, () => updateSettings({ auto: true }), { icon: icons.spark, name: t('auto.name'), where: t('auto.text') })}</div>
        ${settings.brains.map((brain) => {
          const chosen = !settings.auto && brain.id === active?.id
          const open = opened.value === brain.id, version = brain.api !== 'device'
          return html`<div class=${chosen ? 'is-selected' : ''}>
            ${answer(chosen, () => updateSettings({ auto: false }).then(() => useBrain(brain.id)), describe(brain), brain, !cloudAllowed() && !isLocal(brain))}
            ${brainsLocked && !version ? nothing : html`<button class="icon-button subtle" aria-expanded=${String(open)} aria-label=${t('action.more')} @click=${() => { opened.value = open ? null : brain.id }}>${icons.chevron}</button>`}
            ${open ? html`<div class="brain-more">
              ${version ? html`<label>${t('brain.model')}<input class="model-input" list=${`models-${brain.id}`} .value=${live(brain.model)} dir="ltr" @change=${(/** @type {Event} */ e) => setVersion(brain.id, valueOf(e).trim())}></label>
                <datalist id=${`models-${brain.id}`}>${(app.models.value[brain.id] ?? []).map((model) => html`<option value=${model.id}>${model.name ?? ''}</option>`)}</datalist>` : nothing}
              ${brainsLocked || !placeable(brain) ? nothing : where(brain, (projects) => keepBrain(brain.id, projects).catch(showError))}
              ${brainsLocked ? nothing : html`<div class="row"><button class="button subtle danger" @click=${() => confirm(t('brain.confirmRemove')) && removeBrain(brain.id).catch(showError)}>${icons.trash} ${t('action.remove')}</button></div>`}
            </div>` : nothing}
          </div>`
        })}
      </div>
      ${settings.brains.some((brain) => !isLocal(brain)) ? html`<div class="setting"><div><span class="rule-kind">${t('picker.keepOnDevice')}</span>${kept ? html`<p class="muted small">${t('picker.projectKept')}</p>` : nothing}</div>
        <input type="checkbox" class="switch" role="switch" aria-label=${t('picker.keepOnDevice')} .checked=${kept || !settings.cloud} ?disabled=${kept} @change=${(/** @type {Event} */ e) => keepOnDevice(/** @type {HTMLInputElement} */ (e.target).checked)}></div>` : nothing}
    </section>`
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
        <span class="key-command"><code dir="ltr">${VERTEX_COMMAND}</code><button type="button" class="icon-button subtle" aria-label=${t('action.copy')}
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
 * while it downloads. Without those two, the ways the first brain's dialog leads to (D329).
 * @param {boolean} first @param {boolean} [all]
 */
export function ways(first, all = true) {
  const module = local.value
  const device = all ? fit() : null
  const progress = device?.download.value
  // The first way opens by itself, unless another says something (back from ChatGPT's sign-in): one at a time.
  const opens = first && !wayPicked && !status.value && (deviceCheck.value !== null || isDenied('brain-local'))
  const busy = status.value?.kind === 'busy'
  // What was downloaded for the device's brain, on a device short of memory for it, has just been deleted (D319).
  const freed = deviceCheck.value?.freed
  return html`${freed && module ? html`<p class="hint">${module.unfit(freed)}</p>` : nothing}<ul class="list ways">
    ${device && progress ? way('device', icons.chip, t('brain.device.title'), t('brain.device.private'), opens || progress.state !== 'idle', html`
      <p>${t('brain.device.text', { name: BRAND.name })}</p>
      ${progressOf(device) ?? html`
        ${progress.state === 'failed' ? html`<p class="status is-error" role="alert">${t('brain.device.failed')}</p>` : nothing}
        <div class="row"><button class="button primary" @click=${useDevice}>${icons.download} ${t('brain.device.action', { size: formatBytes(device.GEMMA.bytes) })}</button></div>`}`)
    : nothing}
    ${all ? way('quick', icons.spark, t('brain.quick.title'), t('provider.openrouter'), opens && !device, html`
      <p>${t('brain.quick.text')}</p>
      <div class="row"><button class="button primary" @click=${startOpenRouter}>${t('brain.quick.action')} ${icons.arrow}</button></div>`) : nothing}
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
    ${isDenied('machine') ? nothing : /** @type {(keyof typeof PLANNED)[]} */ (['claude', 'copilot', 'chatgpt']).map((id) => way(id, icons.terminal, t(`brain.${id}.title`), t(`provider.${PLANNED[id]}`), status.value?.way === id, html`
      <p>${t(`brain.${id}.text`, { computer: t('cap.machine.name') })}</p>
      <div class="row"><button class="button primary" ?disabled=${busy} @click=${() => connectPlan(id)}>${t(id === 'chatgpt' ? 'brain.chatgpt.action' : 'brain.connect')}</button></div>`))}
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
      aria-keyshortcuts=${locked.has('locale') ? nothing : SHORTCUTS.language} @change=${(/** @type {Event} */ e) => setLocale(valueOf(e))}>${languageOptions()}</select>`)}
    ${voices.some((voice) => voice.localService) ? setting(t('settings.voice'), t('settings.voiceText'),
      html`<select aria-label=${t('settings.voice')} @change=${(/** @type {Event} */ e) => updateSettings({ voice: valueOf(e) || null })}>
        <option value="">${t('settings.voiceAuto')}</option>
        ${rankVoices(voices, locale.value, [locale.value, ...navigator.languages])
          .map((voice) => html`<option value=${voice.name} ?selected=${voice.name === settings.voice}>${voice.name}</option>`)}
      </select>`) : nothing}`
}

const appearance = () => html`
  ${setting(t('settings.mode'), null, html`<span class="segmented" role="radiogroup" aria-label=${t('settings.mode')} aria-keyshortcuts=${SHORTCUTS.theme}>
    ${(/** @type {const} */ (['auto', 'light', 'dark'])).map((option) => html`<label>
      <input type="radio" name="theme" .checked=${(app.chosenTheme.value ?? 'auto') === option} @change=${() => setTheme(option === 'auto' ? null : option)}>
      <span>${t(`theme.${option}`)}</span>
    </label>`)}
  </span>`)}
  <section>${looks(effective.value.settings.look)}</section>`

/** Its place in the menu: a keyboard, drawn here rather than with the first screen's icons. */
const KEYBOARD = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${svg`<rect x="2.5" y="6" width="19" height="12" rx="2.5"/>
  <path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M6.5 14h.01M17.5 14h.01M9.5 14h5"/>`}</svg>`
/** ⌘/, beside ⌘,: Settings on its keyboard shortcuts (D257). */
const KEYBOARD_KEYS = SHORTCUTS.settings.replace(',', '/')
/**
 * The shortcuts in groups, the most used first, each under a name the user already knows: the tasks', in their ⋮ menu's
 * words, the box's, then the rest under the section of Settings where each is set (D313). Each with the capability it
 * waits for, or dictation, which this browser may not have, or the language, which policy may set.
 * @type {[string, [string, string, string?][]][]}
 */
const KEYS = [
  ['history.title', [['action.new', SHORTCUTS.new], ['cap.find.name', SHORTCUTS.find, 'find'], ['history.save', SHORTCUTS.save], ['action.delete', SHORTCUTS.delete]]],
  ['composer.label', [['action.send', 'Enter'], ['action.stop', 'Escape'], ['keyboard.line', 'Shift+Enter'], ['keyboard.recall', 'ArrowUp ArrowDown'], ['keyboard.edit', 'Enter'], ['dictation.start', SHORTCUTS.dictation, 'dictation'], ['live.start', SHORTCUTS.live, 'live']]],
  ['settings.general', [['keyboard.sidebar', SHORTCUTS.sidebar], ['cap.browser.name', SHORTCUTS.browser, 'browser'], ['cap.computer.name', SHORTCUTS.terminal, 'computer'],
    ['settings.title', SHORTCUTS.settings], ['settings.keyboard', KEYBOARD_KEYS], ['keyboard.language', SHORTCUTS.language, 'locale'], ['action.close', 'Escape']]],
  ['settings.appearance', [['settings.mode', SHORTCUTS.theme], ['keyboard.look', SHORTCUTS.look]]]]

/** Whether a shortcut is there: always, or once its capability is found, dictation where the browser has it, the language unless policy sets it. @param {string} [id] */
const offered = (id) => !id || (id === 'dictation' ? dictation.value.state !== 'unavailable' : id === 'locale' ? !effective.value.locked.has(id) : loaded.value.has(id))

/** The keyboard's shortcuts, to read, never to change (D236): a capability's once it is found. */
const keyboard = () => KEYS.map(([heading, keys]) => html`<section><h3>${t(heading)}</h3><dl class="list keyboard">${keys.filter(([, , id]) => offered(id))
  .map(([label, shortcut]) => html`<div><dt>${t(label)}</dt><dd><kbd><bdi dir="ltr">${keyNames(shortcut)}</bdi></kbd></dd></div>`)}</dl></section>`)

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
  ${guards()}
  ${pages()}
  ${seal()}`
}

/**
 * Guards (D295): rules for one kind of action or one service that only ever make Jean more careful,
 * the organisation's first and locked, then the person's, each removed with a click, and a line to add one.
 */
function guards() {
  const { settings } = effective.value
  const mine = settings.guards ?? []
  const services = loaded.value.has('connections') ? [...(app.policy.connections ?? []), ...(settings.connections ?? [])] : []
  /** @param {import('../core/rules.js').Guard} guard @param {boolean} locked */
  const row = (guard, locked) => html`<li class="setting"><span class="rule-kind" dir="auto">${guard.service ? services.find((one) => one.id === guard.service)?.name ?? guard.service
    : t(`kind.${guard.kind}.label`)} · ${t(`rules.${guard.then}`)}${locked ? html` <span class="muted small">${t('policy.locked')}</span>` : nothing}${guard.if
    ? html`<br><span class="muted small">${t('guards.when', { question: guard.if })}</span>` : nothing}</span>${locked ? nothing
    : html`<button type="button" class="icon-button subtle" aria-label=${t('guards.remove')} @click=${() => updateSettings({ guards: mine.filter((other) => other !== guard) })}>${icons.trash}</button>`}</li>`
  /** @param {SubmitEvent} event */
  const add = (event) => {
    event.preventDefault()
    const form = /** @type {HTMLFormElement} */ (event.target)
    const fields = new FormData(form)
    const [on, value] = String(fields.get('for')).split(':')
    const question = String(fields.get('if') ?? '').trim()
    updateSettings({ guards: [...mine, { id: ulid(), [on]: value, then: /** @type {'ask' | 'never'} */ (fields.get('then')), ...(question && { if: question }) }] })
    form.reset()
  }
  return html`<section>
    <h3>${t('guards.title')}</h3>
    <p class="muted">${t('guards.text')}</p>
    <ul class="rules">${(app.policy.guards ?? []).map((/** @type {any} */ guard) => row(guard, true))}${mine.map((guard) => row(guard, false))}</ul>
    <form class="row" @submit=${add}>
      <select name="for" aria-label=${t('guards.for')}>${RULE_KINDS.map((kind) => html`<option value=${`kind:${kind}`}>${t(`kind.${kind}.label`)}</option>`)}
        ${services.map((one) => html`<option value=${`service:${one.id}`}>${one.name}</option>`)}</select>
      <select name="then" aria-label=${t('guards.then')}><option value="ask">${t('rules.ask')}</option><option value="never">${t('rules.never')}</option></select>
      <input name="if" dir="auto" placeholder=${t('guards.if')} aria-label=${t('guards.if')}>
      <button class="button">${t('guards.add')}</button>
    </form>
  </section>`
}

/** This device's seal (D274), once About this answer is here: its key's fingerprint, which whoever relies on its certificates checks, or agrees on beforehand. */
const sealPrint = signal('')
function seal() {
  if (!loaded.value.has('receipt')) return nothing
  if (!sealPrint.value) import('../caps/receipt/receipt.js').then(({ fingerprint }) => fingerprint()).then((print) => (sealPrint.value = print))
  return html`<section>
    <h3>${t('seal.title')}</h3>
    <p class="muted">${t('seal.text')}</p>
    <span class="key-command"><code dir="ltr">${sealPrint.value.match(/.{1,4}/g)?.join(' ')}</code><button type="button" class="icon-button subtle" aria-label=${t('action.copy')}
      @click=${() => navigator.clipboard.writeText(sealPrint.value).then(() => notify(t('toast.copied')))}>${icons.copy}</button></span>
  </section>`
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
        ? html`<button class="icon-button subtle" aria-label=${t('pages.siteRemove', { site: entry })}
          @click=${(/** @type {Event} */ e) => remove(e, entry)}>${icons.close}</button>` : nothing}</li>`)}</ul>
      ${fixed ? nothing : html`<input dir="ltr" enterkeyhint="done" autocapitalize="off" spellcheck="false" aria-label=${t('pages.siteAdd')} aria-describedby="sites-hint"
        @keydown=${add} @input=${(/** @type {Event} */ e) => /** @type {HTMLInputElement} */ (e.target).removeAttribute('aria-invalid')}>`}
    </div>
    <p class="muted small" id="sites-hint">${fixed ? t('policy.locked') : t('pages.sitesText')}</p>
  </div>`
}

/** What takes up space, by kind, largest first and the rest last; null while it is measured. */
const parts = signal(/** @type {Array<{ id: keyof typeof PARTS, bytes: number }> | null} */ (null))
/** Each kind: its icon, its name and what it holds, when its name doesn't say. */
const PARTS = /** @type {const} */ ({
  conversations: ['history', 'history.title', ''], files: ['file', 'cap.files.name', ''], computer: ['computer', 'cap.computer.name', 'storage.computer.text'],
  brains: ['chip', 'storage.brains', 'storage.brains.text'], app: ['download', 'storage.app', 'storage.app.text'], rest: ['data', 'storage.rest', 'storage.rest.text'],
})

/** A cached response's size: its length as sent, unless it came compressed, then its body's. @param {Response | undefined} response */
const sizeOf = async (response) => (response && !response.headers.has('content-encoding') && Number(response.headers.get('content-length'))) || (await response?.blob())?.size || 0

/**
 * What the browser keeps for Jean in its caches: the brains downloaded to this device (Transformers.js's
 * cache), and Jean's own code, the Computer's apart, to work offline (sw.js's).
 */
async function cached() {
  const kept = { brains: 0, computer: 0, app: 0 }
  for (const name of await caches.keys()) {
    const kind = name === 'transformers-cache' ? 'brains' : /^app-cap-.*-computer$/.test(name) ? 'computer' : /^app-(shell|cap)-/.test(name) ? 'app' : null
    if (!kind) continue
    const cache = await caches.open(name)
    for (const size of await Promise.all((await cache.keys()).map(async (request) => sizeOf(await cache.match(request))))) kept[kind] += size
  }
  return kept
}

/** Measures what takes up space: Jean's files by kind (`weigh`), then its caches; what the browser counts beyond is the rest's. */
async function measure() {
  parts.value = null
  const [files, estimate, kept] = await Promise.all([weigh(app.fs), app.fs.estimate?.(), cached().catch(() => ({ brains: 0, computer: 0, app: 0 }))])
  const named = { conversations: files.conversations, files: files.files, computer: files.workspace + kept.computer, brains: kept.brains, app: kept.app }
  const sum = Object.values(named).reduce((total, bytes) => total + bytes, 0)
  const rest = Math.max(files.rest, (estimate?.usage ?? 0) - sum)
  storage.value = { ...storage.value, usage: sum + rest }
  parts.value = [...(/** @type {Array<[keyof typeof PARTS, number]>} */ (Object.entries(named))).filter(([, bytes]) => bytes > 0).sort((a, b) => b[1] - a[1]), /** @type {const} */ (['rest', rest])]
    .map(([id, bytes]) => ({ id, bytes }))
}

/** What takes up space, opened under Storage (D177): a row a kind, its size, and a bar of its share. */
function breakdown() {
  const total = parts.value?.reduce((sum, part) => sum + part.bytes, 0) ?? 0
  return html`<details class="other parts" @toggle=${(/** @type {Event} */ e) => { if (/** @type {HTMLDetailsElement} */ (e.target).open) measure() }}>
    <summary>${t('storage.parts')}</summary>
    ${parts.value ? html`<ul class="list">${parts.value.map(({ id, bytes }) => {
      const [icon, label, text] = PARTS[id]
      return html`<li>
        <span class="item-icon" aria-hidden="true">${icons[icon]}</span>
        <span class="item-text"><span id=${`part-${id}`}>${t(label)}</span>${text ? html`<small>${t(text, { name: BRAND.name })}</small>` : nothing}</span>
        <strong>${formatBytes(bytes)}</strong>
        <meter value=${total ? bytes / total : 0} aria-labelledby=${`part-${id}`}></meter>
      </li>`
    })}</ul>` : html`<p class="muted" role="status">${t('storage.measuring')}</p>`}
  </details>`
}

function data() {
  const usage = storage.value?.usage
  return html`
    <section>
      <div class="setting">
        <div><h3>${t('storage.title')}</h3><p class="muted">${app.ephemeral.value ? t('storage.ephemeral') : usage === undefined ? '' : t('storage.usage', { name: BRAND.name, size: formatBytes(usage) })}</p></div>
        ${storage.value?.persisted ? html`<p class="muted">${icons.check} ${t('storage.persisted')}</p>` : nothing}
      </div>
      ${app.ephemeral.value ? nothing : breakdown()}
    </section>
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
    ${slots('data').map((part) => part.draw())}`
}

/**
 * @typedef {'general' | 'brains' | 'appearance' | 'keyboard' | 'you' | 'connections' | 'search' | 'skills' | 'routines' | 'computer' | 'plugins' | 'capabilities' | 'approvals' | 'data'} Section
 * @typedef {Object} Place
 * @property {number} at       its place in the menu, lowest first
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
 * Jean itself; what it knows and can do, from the person outwards (D311): what it knows of them, its
 * skills and routines, then what it reaches and runs, a capability's own section once it is on (its
 * settings slot: Connections, Web search, the Computer, Plugins), then the case of them all; and what
 * it may do and what it keeps.
 * @type {Partial<Record<Section, Place>>}
 */
const SECTIONS = {
  general: { at: 10, label: 'settings.general', icon: icons.gear, show: general },
  brains: { at: 20, label: 'settings.brains', icon: icons.spark, show: brains },
  appearance: { at: 30, label: 'settings.appearance', icon: icons.contrast, show: appearance },
  keyboard: { at: 40, label: 'settings.keyboard', icon: KEYBOARD, show: keyboard, when: () => !matchMedia('(pointer: coarse)').matches },
  you: { at: 50, label: 'settings.you', icon: icons.person, show: () => knows.value?.you() ?? nothing, also: () => `${t('knows.title', { name: BRAND.name })} ${t('you.name')}`, group: true },
  skills: { at: 60, label: 'cap.skills.name', icon: icons.scroll, show: () => knows.value?.skills() ?? nothing, when: () => loaded.value.has('skills') },
  routines: { at: 70, label: 'cap.routines.name', icon: icons.alarm, show: () => knows.value?.routines() ?? nothing, when: () => loaded.value.has('routines') },
  capabilities: { at: 100, label: 'settings.capabilities', icon: icons.tiles, show: capabilities },
  approvals: { at: 110, label: 'settings.approvals', icon: icons.shield, show: approvals, group: true },
  data: { at: 120, label: 'settings.storage', icon: icons.data, show: data },
}
/** The sections shown now, in their order. @returns {[Section, Place][]} */
export const places = () => /** @type {[Section, Place][]} */ ([...Object.entries(SECTIONS), ...slots('settings').map((entry) => [entry.id, { ...entry, show: entry.draw }])])
  .filter(([, place]) => place.when?.() ?? true).sort(([, a], [, b]) => a.at - b.at)
/** Their names. */
export const sections = () => places().map(([id]) => id)

/** Opens Settings on one of its sections. @param {Section} [name] */
export function openSettings(name = 'general') {
  app.section.value = name
  app.dialog.value = 'settings'
}

class Settings extends Element {
  render() {
    const shown = places()
    const [open, place] = shown.find(([id]) => id === app.section.value) ?? shown[0]
    // No title: the menu says where the user is. Closing sits above it, where the eye starts.
    return html`<dialog class="sheet settings" aria-label=${t('settings.title')} @close=${closed('settings')} @click=${backdrop}>
      <button class="icon-button settings-close" @click=${close} aria-label=${t('action.close')}>${icons.close}</button>
      <nav class="settings-nav" aria-label=${t('settings.title')}>
        ${shown.map(([id, { group, icon, label }]) => html`${group ? html`<hr>` : nothing}<button aria-current=${id === open ? 'page' : 'false'}
          aria-keyshortcuts=${id === 'keyboard' ? KEYBOARD_KEYS : nothing} @click=${() => { app.section.value = id }}>${icon}${t(label)}</button>`)}
      </nav>
      <div class="settings-panel">${place.show()}</div>
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
    if (app.section.value === 'brains') checkDevice()
    if (this.#shown !== app.section.value) {
      // Each brain's versions are asked for as Brains or Routines (a routine's own brain, D303) is entered: on each repaint, a list still on its way was asked for again.
      if (app.section.value === 'brains' || app.section.value === 'routines') for (const brain of effective.value.settings.brains) if (brain.api !== 'device') loadModels(brain)
      // What Jean knows, its skills and routines are read again each time one is entered.
      if (KNOWN.includes(app.section.value)) {
        knowing ??= import('./knows.js').then((module) => (knows.value = module))
        knowing.then((module) => module.refresh())
      }
      // A section entered opens at its top, and on a phone, where the menu is a strip, its button stays in view.
      const panel = this.querySelector('.settings-panel')
      if (panel) panel.scrollTop = 0
      this.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      // Capabilities opens on the next to find; Brains with its brains' rows and its ways to add one closed.
      picked.value = ''; adding.value = false; opened.value = null
    }
    this.#shown = app.section.value
    // The trophies found catch the light one after another (CSSOM: the CSP forbids style attributes).
    this.querySelectorAll('.case > li').forEach((trophy, i) => /** @type {HTMLElement} */ (trophy).style.setProperty('--i', String(i)))
  }
}

// ─── What Jean can do ────────────────────────────────────────────────────────

// The house (docs/design.md), in Settings, is a case of trophies (D127) in Settings' own parts
// (D316): the little light, whose rank rises a quarter of the case at a time, to daylight, over a
// bar of how much is found; then a capability a row of a list, lit once found, a silhouette until
// then that says how it is found. The row open, at first the next to find, says what it does.
export const ROOM_ICONS = /** @type {Record<string, keyof typeof icons>} */ ({
  files: 'file', meaning: 'spark', made: 'table', computer: 'computer', reflexes: 'lamp', memory: 'note', find: 'search', projects: 'layers', folders: 'openfolder', skills: 'scroll', routines: 'alarm', flows: 'flow',
  search: 'websearch', browser: 'globe', connections: 'plug', helpers: 'helpers', check: 'check', since: 'clock', names: 'tag', live: 'wave', backup: 'download', sync: 'sync', 'brain-local': 'chip', machine: 'terminal', pictures: 'image', plugins: 'bolt',
})
/** Where a lit room leads: its section of Settings, search, or the browser. */
const OPENS = /** @type {Record<string, () => void>} */ ({
  memory: () => openSettings('you'), skills: () => openSettings('skills'), routines: () => openSettings('routines'),
  connections: () => openSettings('connections'), search: () => openSettings('search'), plugins: () => openSettings('plugins'), computer: () => openSettings('computer'), pictures: () => openSettings('brains'), machine: () => import('../caps/machine/machine.js').then((module) => module.show()), sync: () => openSettings('data'), find: () => { app.dialog.value = 'find' },
  browser: () => { app.dialog.value = null; import('../caps/browser/browser.js').then((module) => module.show()) },
  flows: () => { app.dialog.value = null; import('../caps/flows/flows.js').then((module) => module.here()) },
  folders: () => { app.dialog.value = null; import('../caps/folders/folders.js').then((module) => module.choose()) },
})
const RANKS = ['spark', 'candle', 'lantern', 'hearth', 'daylight']
/** Trophies found by counting, as ui/discovery.js counts them: how far along, out of how many. */
const COUNTED = /** @type {Record<string, () => number[]>} */ ({ reflexes: () => [everywhere.value, 2], backup: () => [everywhere.value, 3],
  find: () => [everywhere.value, FINDABLE], search: () => [everywhere.value, SEARCHABLE],
  live: () => [effective.value.settings.dictated ?? 0, 3], check: () => [effective.value.settings.cited ?? 0, CITED],
  browser: () => [effective.value.settings.browsed ?? 0, BROWSED], flows: () => [effective.value.settings.stepped ?? 0, STEPPED] })
/** The row open: '' for the next to find, null once the user closed it. */
const picked = signal(/** @type {string | null} */ (''))

/** @param {string} id */
async function turnOn(id) {
  picked.value = id
  if (WEIGHTS.includes(id)) return accept(id)
  if (!(await unlock(id))) return
  if (id === 'brain-local') openSettings('brains')
  else begin(id)
}

/**
 * How far along a capability found by counting is, a pip a step: seen in its row, and said once
 * it is open, as a button's content is never read as a progress bar. @param {string} id @param {boolean} [said]
 */
function pips(id, said = false) {
  const [done = 0, goal = 0] = COUNTED[id]?.() ?? []
  return goal ? html`<span class="pips" role=${said ? 'progressbar' : nothing} aria-hidden=${said ? nothing : 'true'} aria-labelledby=${said ? `how-${id}` : nothing}
    aria-valuemax=${goal} aria-valuenow=${Math.min(done, goal)}>${Array.from({ length: goal }, (_, i) => html`<i class=${i < done ? 'is-lit' : ''}></i>`)}</span>` : nothing
}

function capabilities() {
  const lit = loaded.value
  const ids = CATALOGUE.filter((id) => !isDenied(id))
  const count = ids.filter((id) => lit.has(id)).length
  const total = ids.length
  const rank = count === total ? 4 : Math.floor((4 * count) / total)
  const shown = picked.value === null ? '' : ids.includes(picked.value) ? picked.value : ids.find((id) => !lit.has(id)) ?? ''
  return html`<section class="house" data-rank=${rank}>
      <span class="house-light"><app-persona></app-persona></span>
      <div>
        <h3>${t('collection.title', { name: BRAND.name })}</h3>
        <p class="house-rank">${t(`collection.rank.${RANKS[rank]}`)}</p>
        <p class="muted small">${t('collection.count', { count, total })}${rank < 4 ? html` · ${t('collection.next', {
          count: Math.ceil(((rank + 1) * total) / 4) - count, rank: t(`collection.rank.${RANKS[rank + 1]}`) })}` : nothing}</p>
      </div>
      <meter min="0" max=${total} value=${count} aria-hidden="true"></meter>
    </section>
    <section>
      <ul class="list case">${ids.map((id) => trophy(id, lit.has(id), id === shown))}</ul>
      ${count < total ? html`<button class="button subtle wide" @click=${unlockAll}>${t('collection.all')}</button>` : nothing}
    </section>`
}

/**
 * A capability's row, in the order of the case: lit and on once found, else how it is found. Open, what it does
 * and what it offers now: to turn it on early, Intuition's download while it waits for one, or where it leads.
 * @param {string} id @param {boolean} on @param {boolean} open
 */
const trophy = (id, on, open) => html`<li class=${on ? 'is-lit' : ''}>
  <button class="item" aria-expanded=${open} @click=${() => { picked.value = open ? null : id }}>
    <span class="item-icon">${icons[ROOM_ICONS[id]]}</span>
    <span class="item-text"><strong>${t(`cap.${id}.name`)}</strong>${on ? nothing
      : html`<small id="how-${id}"><span class="visually-hidden">${t('collection.how')}</span> ${t(`cap.${id}.hint`)}</small>${pips(id)}`}</span>
    ${on ? html`<small class="case-on"><span class="dot"></span>${t('collection.on')}</small>` : nothing}${icons.chevron}
  </button>
  ${open ? html`<div class="item-body">
    ${on ? nothing : pips(id, true)}
    <p>${t(`cap.${id}.text`, { name: BRAND.name, size: formatBytes(BYTES[id] ?? 0) })}</p>
    ${!on ? html`<div class="row"><button class="button" @click=${() => turnOn(id)}>${t('collection.turnOn')}</button></div>`
      : WEIGHTS.includes(id) && !loaded.value.get(id)?.ready && !app.offer.value ? html`<div class="row"><button class="button" @click=${() => accept(id)}>${icons.download} ${t(`cap.${id}.yes`, { size: formatBytes(BYTES[id]) })}</button></div>`
      : OPENS[id] ? html`<div class="row"><button class="button" @click=${OPENS[id]}>${t('collection.open')}</button></div>` : nothing}
  </div>` : nothing}
</li>`

/** @typedef {import('../core/settings.js').Look} Look */
/** @param {Event} event */
const valueOf = (event) => /** @type {HTMLInputElement} */ (event.target).value
/** What the user's own CSS starts from, commented out (ui/touches.css): kept only once changed, emptied included. */
const starter = await fetch(new URL('touches.css', import.meta.url)).then((response) => (response.ok ? response.text() : ''), () => '')

/** Jean's looks, then the user's touches over the one chosen, shown as they change (D111). @param {Look} [look] */
function looks(look = {}) {
  const chosen = lookId(look.id)
  const size = look.size ?? 1
  return html`<fieldset class="looks" aria-keyshortcuts=${SHORTCUTS.look}>
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
        <label>${t('look.css')}<textarea class="look-css" rows="6" dir="ltr" spellcheck="false" autocapitalize="off" .value=${live(look.css ?? starter)}
          @input=${(/** @type {Event} */ e) => setLook({ css: valueOf(e) === starter ? undefined : valueOf(e) }, { later: true })}></textarea></label>
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
