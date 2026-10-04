// Connecting, choosing and removing brains, and the OpenRouter sign-in. Loaded with the
// dialogs, or when the page comes back from signing in; Auto's loadModels() stays in state.js.
import { BRAND } from '../brand.js'
import { PROVIDERS, listModels, checkKey } from '../core/llm.js'
import { createVerifier, challengeS256, openRouterAuthURL, exchangeOpenRouterCode } from '../core/oauth.js'
import { t } from '../core/i18n.js'
import { ulid } from '../core/ulid.js'
import { setSecret, deleteSecret } from './secrets.js'
import { app, updateSettings, notify, send, showError } from './state.js'

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
  const models = await listModels({ brain, apiKey })
  if (!brain.model) brain.model = models[0]?.id ?? ''
  if (apiKey) await setSecret(app.fs, brain.id, apiKey)
  app.models.value = { ...app.models.value, [brain.id]: models }
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
  await updateSettings({ brains, activeBrain: brains[0]?.id ?? null })
}

/** Changes a brain's version, without choosing it. @param {string} id @param {string} model */
export async function setVersion(id, model) {
  if (model) await updateSettings({ brains: app.settings.value.brains.map((brain) => (brain.id === id ? { ...brain, model } : brain)) })
}

/** @param {string} id @param {string} [model] */
export async function useBrain(id, model) {
  const brains = app.settings.value.brains.map((brain) => (brain.id === id && model ? { ...brain, model } : brain))
  await updateSettings({ brains, activeBrain: id })
}

export async function startOpenRouter() {
  const verifier = createVerifier()
  sessionStorage.setItem('app.pkce', verifier)
  sessionStorage.setItem('app.draft', app.draft.value)
  sessionStorage.setItem('app.route', location.hash)
  const callbackURL = location.origin + location.pathname
  location.assign(openRouterAuthURL({ callbackURL, challenge: await challengeS256(verifier) }))
}

/** Finish the OpenRouter sign-in when the page comes back with ?code=… */
export async function finishOpenRouter() {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const verifier = sessionStorage.getItem('app.pkce')
  if (!code || !verifier) return
  sessionStorage.removeItem('app.pkce')
  app.draft.value = sessionStorage.getItem('app.draft') ?? ''
  sessionStorage.removeItem('app.draft')
  history.replaceState(null, '', location.pathname + (sessionStorage.getItem('app.route') ?? ''))
  sessionStorage.removeItem('app.route')
  dispatchEvent(new HashChangeEvent('hashchange'))
  try {
    const apiKey = await exchangeOpenRouterCode({ code, verifier })
    await connectBrain({ provider: 'openrouter', apiKey })
    notify(t('brain.connected'))
    continueWithBrain()
  } catch (error) {
    showError(error)
  }
}
