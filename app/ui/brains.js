// Connecting, choosing and removing brains, and the OpenRouter and ChatGPT sign-ins. Loaded with the
// dialogs, or when the page comes back from signing in; Auto's loadModels() stays in state.js.
import { BRAND } from '../brand.js'
import { PROVIDERS, listModels, checkKey } from '../core/llm.js'
import { createVerifier, challengeS256, openRouterAuthURL, exchangeOpenRouterCode } from '../core/oauth.js'
import { t } from '../core/i18n.js'
import { ulid } from '../core/ulid.js'
import { isLocal } from '../core/settings.js'
import { setSecret, deleteSecret } from './secrets.js'
import { app, activeBrain, updateSettings, notify, send, showError } from './state.js'
import { loaded } from './caps.js'

/** @typedef {import('../core/types.js').BrainConfig} BrainConfig */

/**
 * Connect a brain: validate by listing its models, store the key encrypted.
 * @param {{ provider: BrainConfig['provider'], apiKey?: string, baseURL?: string, model?: string }} input
 */
export async function connectBrain({ provider, apiKey, baseURL, model }) {
  const defaults = PROVIDERS[provider]
  /** @type {BrainConfig} */
  const brain = {
    id: ulid(),
    provider,
    api: /** @type {BrainConfig['api']} */ (defaults.api),
    baseURL: (baseURL || defaults.baseURL).replace(/\/+$/, ''),
    model: model ?? defaults.defaultModel ?? '',
    ...(provider === 'openrouter' && { headers: { 'HTTP-Referer': location.origin, 'X-Title': BRAND.name } }),
  }
  await checkKey({ brain, apiKey })
  // A provider counts its list of models against the key's limits, and answers 429 only once it has taken the key:
  // with a model to start on, the brain is connected, and the list is asked for again later.
  const models = await listModels({ brain, apiKey }).catch((error) => {
    if (error?.code === 'rate_limit' && brain.model) return undefined
    throw error
  })
  if (!brain.model) brain.model = models?.[0]?.id ?? ''
  if (apiKey) await setSecret(app.fs, brain.id, apiKey)
  if (models) app.models.value = { ...app.models.value, [brain.id]: models }
  await updateSettings({ brains: [...app.settings.value.brains, brain], activeBrain: brain.id })
  return brain
}

/** Adds a brain that needs no connection check (the on-device one) and makes it active. @param {BrainConfig} brain */
export async function addBrain(brain) {
  const others = app.settings.value.brains.filter((existing) => existing.provider !== brain.provider || brain.provider !== 'device')
  await updateSettings({ brains: [...others, brain], activeBrain: brain.id })
}

/** After connecting a brain: close the dialog and send what the user had typed. */
export function continueWithBrain() {
  app.dialog.value = null
  const pending = app.draft.value.trim()
  if (pending && !app.current.value?.records.length) send(pending)
}

/** @param {string} id */
export async function removeBrain(id) {
  await deleteSecret(app.fs, id)
  const brains = app.settings.value.brains.filter((brain) => brain.id !== id)
  // The last ChatGPT brain gone, the bridge signs out of it (D262).
  const signOut = app.settings.value.brains.some((brain) => brain.id === id && brain.provider === 'chatgpt') && !brains.some((brain) => brain.provider === 'chatgpt')
  await updateSettings({ brains, activeBrain: brains[0]?.id ?? null })
  if (signOut && loaded.peek().has('machine')) (await import('../caps/machine/machine.js')).chatgptSignOut().catch(() => {})
}

/** Changes a brain's version, without choosing it. @param {string} id @param {string} model */
export async function setVersion(id, model) {
  if (model) await updateSettings({ brains: app.settings.value.brains.map((brain) => (brain.id === id ? { ...brain, model } : brain)) })
}

/** Sets how much a brain thinks, or, with none, lets Auto decide (D414). @param {string} id @param {string} effort */
export async function setEffort(id, effort) {
  await updateSettings({ brains: app.settings.value.brains.map((brain) => (brain.id === id ? { ...brain, effort: /** @type {BrainConfig['effort']} */ (effort || undefined) } : brain)) })
}

/** Keeps a brain to some projects, or, with none, uses it in every one (D194). @param {string} id @param {string[] | undefined} projects */
export async function keepBrain(id, projects) {
  await updateSettings({ brains: app.settings.value.brains.map((brain) => (brain.id === id ? { ...brain, projects } : brain)) })
}

/** @param {string} id @param {string} [model] */
export async function useBrain(id, model) {
  const brains = app.settings.value.brains.map((brain) => (brain.id === id && model ? { ...brain, model } : brain))
  await updateSettings({ brains, activeBrain: id })
}

/** Keeps messages on this device, or lets them go to the cloud; a brain there picked by hand gives way to Auto. @param {boolean} on */
export async function keepOnDevice(on) {
  const brain = activeBrain.value
  await updateSettings({ cloud: !on, ...(on && brain && !isLocal(brain) && { auto: true }) })
}

/** Leaves to sign in somewhere that comes back to this page, with what the user had typed and shared, and where they were. @param {string} url */
export function leave(url) {
  sessionStorage.setItem('app.draft', app.draft.value)
  // The files shared are kept in the project; the box's note of them comes back too, so the request goes with them (D366).
  try { sessionStorage.setItem('app.files', JSON.stringify(app.attachments.value.filter((item) => item.status === 'ready').map(({ preview, ...item }) => item))) } catch {}
  sessionStorage.setItem('app.route', location.hash)
  location.assign(url)
}

/** Back from signing in: what the user had typed and shared comes back, where they were. */
export function comeBack() {
  app.draft.value = sessionStorage.getItem('app.draft') ?? ''
  app.attachments.value = JSON.parse(sessionStorage.getItem('app.files') ?? '[]')
  for (const key of ['app.draft', 'app.files']) sessionStorage.removeItem(key)
  history.replaceState(null, '', location.pathname + (sessionStorage.getItem('app.route') ?? ''))
  sessionStorage.removeItem('app.route')
  dispatchEvent(new HashChangeEvent('hashchange'))
}

export async function startOpenRouter() {
  const verifier = createVerifier()
  sessionStorage.setItem('app.pkce', verifier)
  const callbackURL = location.origin + location.pathname
  leave(openRouterAuthURL({ callbackURL, challenge: await challengeS256(verifier) }))
}

/**
 * Finish a sign-in when the page comes back: from OpenRouter with ?code=…, from ChatGPT with ?chatgpt=… (D262). Or open
 * where a comparison page leads (D445): ?brain=<way>, Settings › Brains with that way open; ?restore, Settings › Your
 * data, whose Restore brings another assistant's export in; ?sample, the sample spreadsheet in the box with its request.
 */
export async function finishSignIn() {
  const params = new URLSearchParams(location.search)
  if (['brain', 'restore', 'sample'].some((name) => params.has(name))) {
    history.replaceState(null, '', location.pathname + location.hash)
    return params.has('sample') ? (await import('./composer.js')).idea('sample') : (await import('./dialogs.js')).openAt(params.get('brain'))
  }
  const code = params.get('code')
  const chatgpt = params.get('chatgpt')
  const verifier = sessionStorage.getItem('app.pkce')
  if (!(code && verifier) && !chatgpt) return
  sessionStorage.removeItem('app.pkce')
  comeBack()
  if (chatgpt) return (await import('./dialogs.js')).chatgptBack(chatgpt)
  try {
    const apiKey = await exchangeOpenRouterCode({ code: String(code), verifier: String(verifier) })
    await connectBrain({ provider: 'openrouter', apiKey })
    notify(t('brain.connected'))
    continueWithBrain()
    // The device's brain, asked for with this one on the first brain's dialog, comes while it answers (D329).
    if (sessionStorage.getItem('app.private')) import('../caps/first/first.js').then((module) => module.alsoPrivate())
  } catch (error) {
    showError(error)
  }
}
