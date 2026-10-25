// Settings' Brains (D128, D134, D514): who answers, as Auto truly does it, then the brains, each opening its page at its
// own address (D509): brains/<id>, brains/auto for how Auto chooses, brains/add for the ways to add one, grouped by what
// the user already has, each way a page of its own (brains/<way>), and brains/pictures for the pictures this device makes.
// A brain that can't answer says so atop the section, on its row and on its page. Loaded the first time Brains shows,
// or the first brain's ways (caps/first); its strings are a part of their own (locales/brains/).
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal, effect } from '@preact/signals-core'
import { app, effective, activeBrain, brainsHere, updateSettings, cloudAllowed, showError, notify } from './state.js'
import { connectBrain, continueWithBrain, addBrain, removeBrain, useBrain, setVersion, setEffort, keepBrain, startOpenRouter, leave, keepOnDevice } from './brains.js'
import { isLocal, TIERS } from './auto.js'
import { unlock, isDenied, loaded, slots } from './caps.js'
import { openSettings, sectionOpen, pageOpen, placeable, where, projectName, lockedBy, valueOf } from './dialogs.js'
import { choices, cost } from './picker.js'
import { priceOf, PLANS } from './prices.js'
import { getSecret, setSecret } from './secrets.js'
import { ulid } from '../core/ulid.js'
import { BRAND } from '../brand.js'
import { PROVIDERS, listModels, checkKey } from '../core/llm.js'
import { t, intlLocales, formatBytes, useStrings } from '../core/i18n.js'
import { icons } from './menu-icons.js'
import { styleSheet } from './sheet.js'

/** @typedef {import('../core/types.js').BrainConfig} BrainConfig */

await Promise.all([useStrings('brains'), styleSheet(new URL('brain-pages.css', import.meta.url))])

// The page open (pageOpen()): a brain's id, auto, add, a way, pictures, or '' for the list.

/** Opens the list ('') or a page, the keyboard on its title, or back on the list on the row it came from. @param {string} to */
function go(to) {
  const from = pageOpen()
  app.section.value = to ? `brains/${to}` : 'brains'
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to && to !== 'add' ? '.brain-head h2' : `[data-brain="${from}"]`) ?? document.querySelector('.brain-head h2'))?.focus())
}

// ─── Whether each brain can answer ───────────────────────────────────────────

/** What went wrong when each brain was last asked for its versions, by its id: an error's code, or '' once it answers. */
const troubles = signal(/** @type {Record<string, string>} */ ({}))

/** Asks a brain for its versions, its key first where the list is public, and keeps what went wrong. @param {BrainConfig} brain */
async function ask(brain) {
  try {
    const apiKey = (await getSecret(app.fs, brain.id)) ?? undefined
    await checkKey({ brain, apiKey })
    app.models.value = { ...app.models.value, [brain.id]: await listModels({ brain, apiKey }) }
    troubles.value = { ...troubles.value, [brain.id]: '' }
  } catch (error) {
    troubles.value = { ...troubles.value, [brain.id]: /** @type {any} */ (error)?.code ?? 'unknown' }
  }
}

/** What a way to add a brain says back: connecting, or why it didn't. */
const status = signal(/** @type {{ way: string, kind: 'busy' | 'error', message: string } | null} */ (null))

/** What a brain that can't answer says, its service named, as a conversation would. @param {BrainConfig} brain */
const said = (brain) => t(`error.${troubles.value[brain.id]}`, { brain: describe(brain).name, origin: location.origin })

// ─── Ways to add a brain ─────────────────────────────────────────────────────

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

/** Back from ChatGPT's sign-in (D262): its way's page, connecting, or saying why it can't. @param {string} outcome signed-in, declined or failed */
export function chatgptBack(outcome) {
  openSettings('brains/chatgpt')
  if (outcome === 'signed-in') return connectPlan('chatgpt')
  status.value = { way: 'chatgpt', kind: 'error', message: t(outcome === 'declined' ? 'brain.chatgpt.declined' : 'brain.chatgpt.failed') }
}

/** Settings where a page of the site leads (D445): a way's page, or Your data's Bring in (D519). @param {string | null} way */
export const openAt = (way) => openSettings(way === null ? 'data/import' : `brains/${way}`)

/** The services whose key can be pasted: each takes requests from a browser, under its own published terms. */
const KEYED = ['openai', 'anthropic', 'gemini', 'vertex', 'mistral', 'meta', 'openrouter', 'vercel', 'huggingface', 'groq', 'cerebras', 'together', 'fireworks', 'xai']
/** One of their logos, its own file in logos/ (Lobe Icons', MIT): a mark in one colour on its brand's tile, to read in the dark too. @param {string} id */
const logo = (id) => html`<img src=${new URL(`logos/${id}.svg`, import.meta.url).href} alt="">`
/** The service picked in the key's form: Vertex AI also needs the Google Cloud project. */
const keyProvider = signal('openai')

/** Where each service makes keys, signing in first (provider identities, D33). Hugging Face's comes ready to call its providers. */
const KEY_PAGES = /** @type {Record<string, string>} */ ({
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://platform.claude.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
  mistral: 'https://console.mistral.ai/api-keys',
  meta: 'https://dev.meta.ai/api-keys',
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
const outside = (href, text) => html`<a href=${href} target="_blank" rel="noopener noreferrer">${text} ${icons.external}</a>`

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
const providers = (ids) => new Intl.ListFormat(intlLocales(), { type: 'conjunction', style: 'narrow' }).format(ids.map((id) => t(`provider.${id}`)))

/**
 * The ways to add a brain, by what the user has (D514): a plan they pay for, a key, or nothing yet, each with what it is,
 * what it needs in a line and the rest. The device's, where it can run, and OpenRouter's (never in a child's profile) only
 * with `all`: the first brain's step offers them on its own (D329).
 * @param {boolean} all @returns {{ id: string, group: string, icon: unknown, title: string, needs: string, body: unknown }[]}
 */
function waysOf(all) {
  const device = all ? fit() : null
  const progress = device?.download.value
  const busy = status.value?.kind === 'busy'
  return [
    ...(isDenied('machine') ? [] : /** @type {(keyof typeof PLANNED)[]} */ (['claude', 'chatgpt', 'copilot']).map((id) => ({ id, group: 'paid', icon: icons.terminal, title: t(`brain.${id}.title`), needs: t(`provider.${PLANNED[id]}`), body: html`
      <p>${t(`brain.${id}.text`, { computer: t('cap.machine.name') })}</p>
      <div class="row"><button class="button primary" ?disabled=${busy} @click=${() => connectPlan(id)}>${t(id === 'chatgpt' ? 'brain.chatgpt.action' : 'brain.connect')}</button></div>` }))),
    { id: 'key', group: 'keyed', icon: icons.key, title: t('brain.key.title'), needs: providers(KEYED), body: html`
      <p>${t('brain.key.text')}</p>
      <form class="stack" @submit=${connectKey}>
        <label>${t('brain.key.provider')}
          <select name="provider" class="key-provider" @change=${(/** @type {Event} */ e) => { keyProvider.value = valueOf(e) }}><button><selectedcontent></selectedcontent></button>
            ${KEYED.map((id) => html`<option value=${id} ?selected=${id === keyProvider.value}>${logo(id)}${t(`provider.${id}`)}</option>`)}
          </select>
        </label>
        ${keySteps(keyProvider.value)}
        ${keyProvider.value === 'vertex' ? html`
          <label>${t('brain.key.project')}<input name="project" required autocomplete="off" spellcheck="false" dir="ltr"></label>` : nothing}
        <label>${t('brain.key.label')}<input name="key" type="password" autocomplete="off" spellcheck="false" required dir="ltr"></label>
        <div class="row"><button class="button primary" ?disabled=${busy}>${t('brain.connect')}</button></div>
      </form>` },
    ...(device && progress ? [{ id: 'device', group: 'free', icon: icons['brain-device'], title: t('brain.device.title'), needs: t('brain.device.private'), body: html`
      <p>${t('brain.device.text', { name: BRAND.name })}</p>
      ${progressOf(device) ?? html`
        ${progress.state === 'failed' ? html`<p class="status is-error" role="alert">${t('brain.device.failed')}</p>` : nothing}
        <div class="row"><button class="button primary" @click=${useDevice}>${icons.download} ${t('brain.device.action', { size: formatBytes(device.GEMMA.bytes) })}</button></div>`}` }] : []),
    ...(all && !app.policy.child ? [{ id: 'quick', group: 'free', icon: icons.cloud, title: t('brain.quick.title'), needs: t('provider.openrouter'), body: html`
      <p>${t('brain.quick.text')}</p>
      <div class="row"><button class="button primary" @click=${startOpenRouter}>${t('brain.quick.action')} ${icons.external}</button></div>` }] : []),
    { id: 'local', group: 'free', icon: icons['brain-device'], title: t('brain.local.title'), needs: providers(['ollama', 'lmstudio']), body: html`
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
      </form>` },
  ]
}
const WAYS = ['claude', 'chatgpt', 'copilot', 'key', 'device', 'quick', 'local']

/** What a way said back, under it. @param {string} id */
const reply = (id) => (status.value?.way === id ? html`<p class="status is-${status.value.kind}" role="status">${status.value.message}</p>` : nothing)

/** The ways the first brain's step offers to whoever already pays for a brain or has a key, one open at a time (caps/first). */
export const ways = () => html`<ul class="list ways">${waysOf(false).map(({ id, icon, title, needs, body }) => html`<li><details name="brain-way" class="way is-${id}" ?open=${status.value?.way === id}>
  <summary><span class="item-icon">${icon}</span><span class="item-text"><strong>${title}</strong><small>${needs}</small></span>${icons.chevron}</summary>
  <div class="item-body">${body}${reply(id)}</div>
</details></li>`)}</ul>`

// ─── The list and the pages ──────────────────────────────────────────────────

/** Settings' Brains: before any, the ways to add one; after, who answers and the brains, or the page open. */
export function section() {
  const { settings, locked } = effective.value
  const [open, closed] = [pageOpen(), locked.has('brains')]
  const brain = settings.brains.find((one) => one.id === open)
  if (brain) return page(brain, closed)
  if (open === 'pictures') return html`${head(t('cap.pictures.name'))}${slots('pictures').map((part) => part.draw())}`
  if (!closed && WAYS.includes(open)) return way(open)
  if (!closed && (open === 'add' || !settings.brains.length)) return adding(!settings.brains.length)
  return open === 'auto' ? auto() : listed(closed)
}

/** Back to the list, or to the ways from one of them, then the page's title and a line under it. @param {string} title @param {unknown} [line] @param {string} [back] */
const head = (title, line = nothing, back = '') => html`<button class="back button subtle" @click=${() => go(back)}>${icons.back} ${t(back ? 'brain.add' : 'settings.brains')}</button>
  <header class="brain-head"><div><h2 tabindex="-1">${title}</h2>${line === nothing ? nothing : html`<p class="lede">${line}</p>`}</div></header>`

/** A brain's icon, name and where it runs: this device, this computer, or the cloud, a service's with its logo. @param {BrainConfig} brain */
function describe(brain) {
  if (brain.api === 'device') return { icon: icons['brain-device'], name: t('provider.device'), where: t('brain.device.private') }
  const name = brain.provider === 'custom' ? new URL(brain.baseURL).host : t(`provider.${brain.provider}`)
  return isLocal(brain) ? { icon: icons['brain-device'], name, where: t('picker.local') } : { icon: KEYED.includes(brain.provider) ? logo(brain.provider) : icons.cloud, name, where: t('brain.cloud') }
}

/** Where a brain runs, and the projects it is kept to (D194). @param {BrainConfig} brain */
function line(brain) {
  const names = brain.projects ? app.projects.value.filter((project) => brain.projects?.includes(project.id)).map(projectName) : []
  return html`${describe(brain).where}${names.length ? html` · <bdi>${new Intl.ListFormat(intlLocales(), { type: 'unit', style: 'short' }).format(names)}</bdi>` : nothing}`
}

/** What Auto does, truly (D514): the brain in the cloud it leans on as each message needs, and this device for anything personal, which Intuition tells. */
function autoLine() {
  const remote = cloudAllowed() ? [activeBrain.value, ...brainsHere.value].find((brain) => brain && !isLocal(brain)) : undefined
  return remote ? t(brainsHere.value.some(isLocal) && loaded.value.has('reflexes') ? 'auto.both' : 'auto.cloud', { brain: describe(remote).name }) : t('auto.text')
}

/**
 * One way of answering: its radio, what it means and, for Always the same, the brain it is; the one chosen tinted. In a
 * project kept on this device only Keep on this device can be chosen (D307). @param {string} id @param {string} mode
 * @param {unknown} icon @param {string} name @param {unknown} text @param {() => unknown} choose @param {unknown} [end] @param {boolean} [closed]
 */
const choice = (id, mode, icon, name, text, choose, end = nothing, closed = false) => html`<div class=${mode === id ? 'is-selected' : ''}><label class="item">
  <input type="radio" name="answers" .checked=${live(mode === id)} ?disabled=${closed || (app.project.value.data.cloud === false && id !== 'device')} @change=${choose}>
  <span class="item-icon">${icon}</span><span class="item-text"><strong>${name}</strong><small>${text}</small></span></label>${end}</div>`

/** The brain Always the same answers with: the picker's choices, each its tier, its plan or where it answers from, and its model ("Fast · Claude · haiku", "LM Studio · flint"), the one picked by hand selected, at a version the picker no longer offers too. */
function same() {
  const [offered, active] = [choices(), activeBrain.value]
  const named = (/** @type {BrainConfig} */ brain, /** @type {string} */ model, tier = '') => [tier, PLANS[brain.provider] ?? describe(brain).name, model.split('/').at(-1)].filter(Boolean).join(' · ')
  const at = offered.findIndex(({ brain, model }) => brain.id === active?.id && model === active.model)
  if (!offered.length && !active) return nothing
  return html`<select class="brain-same" aria-label=${t('brain.same')} ?disabled=${app.project.value.data.cloud === false}
    @change=${(/** @type {Event} */ e) => { const { brain, model } = offered[Number(valueOf(e))]; updateSettings({ auto: false, cloud: true }).then(() => useBrain(brain.id, model)) }}>
    ${offered.map(({ label, tier, brain, model }, i) => html`<option value=${i} ?selected=${i === at}>${named(brain, model, tier ? label : '')}</option>`)}
    ${active && at < 0 ? html`<option selected>${named(active, active.model)}</option>` : nothing}
  </select>`
}

/** Who answers, what needs the user, then every brain as a row that opens its page, and what capabilities add. @param {boolean} closed */
function listed(closed) {
  const { settings } = effective.value
  const cloud = brainsHere.value.some((brain) => !isLocal(brain))
  const troubled = settings.brains.find((brain) => troubles.value[brain.id])
  const mode = cloud && !cloudAllowed() ? 'device' : settings.auto ? 'auto' : 'same'
  const kept = app.project.value.data.cloud === false
  return html`<header class="brain-head"><h2>${t('settings.brains')}</h2>${closed ? nothing : html`<button class="button" @click=${() => go('add')}>${icons.plus} ${t('brain.add')}</button>`}</header>
    ${troubled ? html`<div class="brain-wait" role="status"><p>${said(troubled)}</p><button class="button" @click=${() => go(troubled.id)}>${t('brain.fix')}</button></div>` : nothing}
    <section><h3 id="brains-who">${t('brain.who')}</h3>
      <div class="list brains" role="radiogroup" aria-labelledby="brains-who">
        ${choice('auto', mode, icons.brain, t('auto.name'), autoLine(), () => updateSettings({ auto: true, cloud: true }))}
        ${choice('same', mode, icons.pin, t('brain.same'), t('brain.sameText'), () => updateSettings({ auto: false, cloud: true }), same())}
        ${cloud ? choice('device', mode, icons.lock, t('picker.keepOnDevice'), t(kept ? 'picker.projectKept' : brainsHere.value.some(isLocal) ? 'brain.onlyText' : 'auto.noPrivate'), () => keepOnDevice(true), nothing, !brainsHere.value.some(isLocal)) : nothing}
      </div>
      <button class="link-button brain-link" data-brain="auto" @click=${() => go('auto')}>${t('auto.how')} ${icons.chevron}</button>
    </section>
    <section><h3>${t('brain.connectedTitle')}</h3>
      <ul class="list brain-rows">${settings.brains.map((brain) => html`<li><button class="item" data-brain=${brain.id} @click=${() => go(brain.id)}>
        <span class="item-icon">${describe(brain).icon}</span><span class="item-text"><strong><bdi>${describe(brain).name}</bdi>${brain.model ? html` · <bdi>${brain.model.split('/').at(-1)}</bdi>` : nothing}</strong><small>${line(brain)}</small></span>
        ${troubles.value[brain.id] ? html`<span class="brain-trouble">${t('brain.trouble')}</span>` : nothing}${icons.chevron}</button></li>`)}</ul>
      ${closed ? html`<p class="muted">${lockedBy()}</p>` : nothing}
    </section>
    ${slots('brains').map((part) => part.draw())}`
}

/** The levels of Auto's tiers, by their names in the picker. */
const LEVELS = ['picker.fast', 'picker.smart', 'picker.best']

/**
 * How Auto chooses (D514), as ui/auto.js does: the brain in the cloud it leans on, which to change; then, for each kind of
 * message, the version it asks for with its price, the device's for anything personal or offline. Without Intuition there
 * is no telling one message from another: every one gets Smart.
 */
function auto() {
  const cloud = cloudAllowed() ? brainsHere.value.filter((brain) => !isLocal(brain)) : []
  const remote = [activeBrain.value, ...cloud].find((brain) => brain && !isLocal(brain) && cloud.includes(brain))
  const near = brainsHere.value.find((brain) => brain.api === 'device') ?? brainsHere.value.find(isLocal)
  const sensed = loaded.value.has('reflexes')
  const tiers = remote ? /** @type {Record<string, string[]>} */ (app.policy.tiers ?? TIERS)[remote.provider] ?? [] : []
  const models = remote ? app.models.value[remote.id] ?? [] : []
  /** A kind of message, the version Auto asks for and what it costs. @param {unknown} icon @param {string} kind @param {number} level */
  const step = (icon, kind, level) => {
    const model = models.some((info) => info.id === tiers[level]) ? tiers[level] : /** @type {BrainConfig} */ (remote).model
    const info = models.find((one) => one.id === model)
    return html`<li><span class="item-icon">${icon}</span><span class="item-text"><strong>${t(`auto.${kind}`)}</strong><small>${model === tiers[level] ? `${t(LEVELS[level])} · ` : ''}<bdi>${info?.name ?? model.split('/').at(-1)}</bdi></small></span>
      <span class="brain-price">${price(/** @type {BrainConfig} */ (remote), model, info?.pricing)}</span></li>`
  }
  const here = (/** @type {unknown} */ icon, /** @type {string} */ kind) => html`<li><span class="item-icon">${icon}</span><span class="item-text"><strong>${t(`auto.${kind}`)}</strong>
    <small><bdi>${describe(/** @type {BrainConfig} */ (near)).name}</bdi></small></span><span class="brain-price">${t('brain.free')}</span></li>`
  return html`${head(t('auto.name'), autoLine())}
    ${cloud.length > 1 ? html`<label class="brain-lean">${t('auto.uses')}<select @change=${(/** @type {Event} */ e) => updateSettings({ activeBrain: valueOf(e) })}>
      ${cloud.map((brain) => html`<option value=${brain.id} ?selected=${brain === remote}>${describe(brain).name}</option>`)}</select></label>` : nothing}
    <ul class="list auto-steps">
      ${remote ? (sensed ? [step(icons.bolt, 'quick', 0), step(icons.lamp, 'everyday', 1), step(icons.star, 'demanding', 2)] : step(icons.lamp, 'all', 1)) : nothing}
      ${near && sensed && remote ? here(icons.lock, 'personal') : nothing}
      ${near ? here(icons['brain-device'], remote ? 'offline' : 'all') : nothing}
    </ul>
    <p class="hint">${t('auto.steps')}</p>`
}

/** A version's price for a typical answer, or the plan it is in (D255, D235). @param {BrainConfig} brain @param {string} model @param {any} listed */
const price = (brain, model, listed) => (PLANS[brain.provider] ? t('picker.plan', { plan: PLANS[brain.provider] }) : cost(priceOf(brain.provider, model, listed)))

/** The brain whose key is being replaced. */
const rekeying = signal(/** @type {string | null} */ (null))

/** A brain's key replaced, then the brain asked again, which says whether its service takes it. @param {SubmitEvent} event @param {BrainConfig} brain */
async function rekey(event, brain) {
  event.preventDefault()
  await setSecret(app.fs, brain.id, String(new FormData(/** @type {HTMLFormElement} */ (event.target)).get('key')).trim())
  rekeying.value = null
  await ask(brain)
}

/**
 * A brain's page: what it says when it can't answer; its versions, Fast, Smart and Best by name with their price, what
 * Auto asks for said above them, any other found by name; how much it thinks, once the user asked for an answer now
 * (D414); the projects it is used in (D194); its key; Remove at its foot. @param {BrainConfig} brain @param {boolean} closed
 */
function page(brain, closed) {
  const { name } = describe(brain)
  const models = app.models.value[brain.id] ?? []
  const tiers = (/** @type {Record<string, string[]>} */ (app.policy.tiers ?? TIERS)[brain.provider] ?? []).filter((model) => models.some((info) => info.id === model))
  const version = (/** @type {string} */ model, level = tiers.indexOf(model)) => {
    const info = models.find((one) => one.id === model)
    return html`<div class=${brain.model === model ? 'is-selected' : ''}><label class="item"><input type="radio" name="version" .checked=${live(brain.model === model)} @change=${() => setVersion(brain.id, model)}>
      <span class="item-text"><strong><bdi>${info?.name ?? model.split('/').at(-1)}</bdi></strong><small>${level < 0 ? '' : `${t(LEVELS[level])} · `}${price(brain, model, info?.pricing)}</small></span></label></div>`
  }
  return html`${head(name, line(brain))}
    ${troubles.value[brain.id] ? html`<div class="brain-wait" role="status"><p>${said(brain)}</p><button class="button" @click=${() => ask(brain)}>${t('action.retry')}</button></div>` : nothing}
    ${brain.api === 'device' ? nothing : html`<section><h3 id="brain-version">${t('brain.model')}</h3>
      ${tiers.length ? html`<p class="muted small">${t('brain.versionHint', { brain: name })}</p>
        <div class="list brains" role="radiogroup" aria-labelledby="brain-version">${tiers.map((model) => version(model))}${tiers.includes(brain.model) ? nothing : version(brain.model)}</div>` : nothing}
      <input class="model-input" aria-labelledby="brain-version" list=${`models-${brain.id}`} .value=${live(brain.model)} dir="ltr" @change=${(/** @type {Event} */ e) => setVersion(brain.id, valueOf(e).trim())}>
      <datalist id=${`models-${brain.id}`}>${models.map((model) => html`<option value=${model.id}>${model.name ?? ''}</option>`)}</datalist>
      ${!closed && !/^c(laudecode|opilot)$/.test(brain.provider) && (effective.value.settings.hurried || brain.effort) ? html`<label>${t('brain.thinking')}<select @change=${(/** @type {Event} */ e) => setEffort(brain.id, valueOf(e)).catch(showError)}>
        ${['', 'low', 'medium', 'high'].map((effort) => html`<option value=${effort} ?selected=${(brain.effort ?? '') === effort}>${t(effort ? `brain.thinking.${effort}` : 'auto.name')}</option>`)}</select></label>` : nothing}
    </section>`}
    ${closed || !placeable(brain) ? nothing : html`<section>${where(brain, (projects) => keepBrain(brain.id, projects).catch(showError))}</section>`}
    ${closed || !KEYED.includes(brain.provider) ? nothing : html`<section><h3>${t('brain.key.label')}</h3><p class="muted small">${t('brain.key.text')}</p>${rekeying.value === brain.id
      ? html`<form class="stack" @submit=${(/** @type {SubmitEvent} */ e) => rekey(e, brain).catch(showError)}><label>${t('brain.key.label')}<input name="key" type="password" autocomplete="off" spellcheck="false" required dir="ltr"></label>
        <div class="row"><button class="button primary">${t('brain.connect')}</button></div></form>`
      : html`<div class="row"><button class="button" @click=${() => { rekeying.value = brain.id }}>${t('brain.key.change')}</button></div>`}</section>`}
    ${closed ? nothing : html`<div class="row"><button class="button subtle danger" @click=${() => confirm(t('brain.confirmRemove')) && removeBrain(brain.id).then(() => go(''), showError)}>${icons.trash} ${t('action.remove')}</button></div>`}`
}

/** Adding a brain: before the first, why one is needed; the ways by what the user has, each opening its page. @param {boolean} first */
function adding(first) {
  const all = waysOf(true)
  // What was downloaded for the device's brain, on a device short of memory for it, has just been deleted (D319).
  const freed = deviceCheck.value?.freed
  return html`${first ? html`<p class="lede">${t('brain.lede', { name: BRAND.name })}</p>` : head(t('brain.add'))}
    ${freed && local.value ? html`<p class="hint">${local.value.unfit(freed)}</p>` : nothing}
    ${['paid', 'keyed', 'free'].map((group) => all.some((one) => one.group === group) ? html`<section><h3>${t(`brain.${group}`)}</h3><ul class="list brain-rows">
      ${all.filter((one) => one.group === group).map(({ id, icon, title, needs }) => html`<li><button class="item" data-brain=${id} @click=${() => go(id)}>
        <span class="item-icon">${icon}</span><span class="item-text"><strong>${title}</strong><small>${needs}</small></span>${icons.chevron}</button></li>`)}</ul></section>` : nothing)}
    ${first ? slots('brains').map((part) => part.draw()) : nothing}`
}

/** A way's page: what it needs, then the rest, and what it says back. @param {string} id */
function way(id) {
  const one = waysOf(true).find((each) => each.id === id)
  return one ? html`${head(one.title, one.needs, 'add')}<section class="brain-way">${one.body}${reply(id)}</section>` : adding(!effective.value.settings.brains.length)
}

// Entering Brains, each brain is asked again, as a key refused in a conversation sends the user here (D514); this device
// is checked for its own; a way that failed to connect is forgotten once Brains is left.
let inside = false
effect(() => {
  const here = app.dialog.value === 'settings' && sectionOpen() === 'brains'
  if (here && !inside && navigator.onLine) for (const brain of effective.peek().settings.brains) if (brain.api !== 'device') ask(brain)
  if (here) checkDevice()
  else if (status.peek()?.kind === 'error') status.value = null
  inside = here
})
