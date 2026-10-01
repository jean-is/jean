// Application state (signals) and the actions that change it.
import { signal, computed } from '@preact/signals-core'
import { BRAND } from '../brand.js'
import { DEFAULT_SETTINGS, saveSettings, applyPolicy } from '../core/settings.js'
import { createConversation, appendRecords, loadConversation, listConversations, deleteConversation } from '../core/conversations.js'
import { userRecord, metaRecord, toChatMessages, applyUpdate, titleOf } from '../core/events.js'
import { runTurn } from '../core/loop.js'
import { buildSystemPrompt } from '../core/prompt.js'
import { resolveRule, ruleFromPermission } from '../core/rules.js'
import { t, locale, useLocale, languageName, firstWords } from '../core/i18n.js'
import { PROVIDERS, listModels } from '../core/llm.js'
import { createVerifier, challengeS256, openRouterAuthURL, exchangeOpenRouterCode } from '../core/oauth.js'
import { ulid } from '../core/ulid.js'
import { getSecret, setSecret, deleteSecret } from './secrets.js'

/** @typedef {import('../core/types.js').FS} FS */
/** @typedef {import('../core/types.js').BrainConfig} BrainConfig */
/** @typedef {import('../core/types.js').Envelope} Envelope */
/** @typedef {import('../core/types.js').ModelInfo} ModelInfo */
/** @typedef {import('../core/types.js').ToolCallInfo} ToolCallInfo */
/** @typedef {import('../core/events.js').Turn} Turn */
/** @typedef {import('../core/settings.js').Settings} Settings */
/** @typedef {'idle' | 'listening' | 'thinking' | 'answering' | 'done'} Presence */

export const LOCALES = ['en', 'fr', 'ar']

export const app = {
  fs: /** @type {FS} */ (/** @type {unknown} */ (null)),
  deviceId: '',
  projectDir: '',
  /** @type {Record<string, any>} */
  policy: {},
  ephemeral: signal(false),
  settings: signal(/** @type {Settings} */ (DEFAULT_SETTINGS)),
  conversations: signal(/** @type {import('../core/types.js').ConversationSummary[]} */ ([])),
  /** @type {import('@preact/signals-core').Signal<{ id: string, path: string, records: Envelope[] } | null>} */
  current: signal(null),
  /** @type {import('@preact/signals-core').Signal<{ turn: Turn } | null>} */
  live: signal(null),
  busy: signal(false),
  /** @type {import('@preact/signals-core').Signal<{ code: string, message: string } | null>} */
  error: signal(null),
  presence: signal(/** @type {Presence} */ ('idle')),
  /** @type {import('@preact/signals-core').Signal<'brain' | 'settings' | 'history' | null>} */
  dialog: signal(null),
  draft: signal(''),
  /** @type {import('@preact/signals-core').Signal<{ toolCall: ToolCallInfo, resolve: (option: any) => void } | null>} */
  permission: signal(null),
  /** @type {import('@preact/signals-core').Signal<ServiceWorker | null>} */
  updateReady: signal(null),
  /** @type {import('@preact/signals-core').Signal<string | null>} */
  toast: signal(null),
  models: signal(/** @type {Record<string, ModelInfo[]>} */ ({})),
}

export const effective = computed(() => applyPolicy(app.settings.value, app.policy))
export const activeBrain = computed(() => {
  const { settings } = effective.value
  return settings.brains.find((brain) => brain.id === settings.activeBrain) ?? settings.brains[0] ?? null
})

/** @param {BrainConfig} brain */
export function brainLabel(brain) {
  return `${t(`provider.${brain.provider}`)} · ${brain.model.split('/').at(-1)}`
}

/** @param {Partial<Settings>} patch */
async function updateSettings(patch) {
  app.settings.value = { ...app.settings.value, ...patch }
  await saveSettings(app.fs, app.settings.value)
}

/** @param {Presence} presence */
export function setPresence(presence) {
  app.presence.value = presence
}

/** @param {string} message */
export function notify(message) {
  app.toast.value = message
  setTimeout(() => {
    if (app.toast.value === message) app.toast.value = null
  }, 2600)
}

// ─── Language and rules ──────────────────────────────────────────────────────

/** @param {string} lang */
export async function setLocale(lang) {
  await useLocale(lang)
  await updateSettings({ locale: lang })
}

/** @param {string} kind @param {import('../core/types.js').RuleValue} value */
export async function setRule(kind, value) {
  await updateSettings({ rules: { ...app.settings.value.rules, [kind]: value } })
}

/** @param {string | null} voice */
export async function setVoice(voice) {
  await updateSettings({ voice })
}

// ─── Brains ──────────────────────────────────────────────────────────────────

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
  const models = await listModels({ brain, apiKey })
  if (!brain.model) brain.model = models[0]?.id ?? ''
  if (apiKey) await setSecret(app.fs, brain.id, apiKey)
  app.models.value = { ...app.models.value, [brain.id]: models }
  await updateSettings({ brains: [...app.settings.value.brains, brain], activeBrain: brain.id })
  return brain
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

/** @param {string} id @param {string} [model] */
export async function useBrain(id, model) {
  const brains = app.settings.value.brains.map((brain) => (brain.id === id && model ? { ...brain, model } : brain))
  await updateSettings({ brains, activeBrain: id })
}

/** Models offered by a connected brain (cached). @param {BrainConfig} brain */
export async function loadModels(brain) {
  if (app.models.value[brain.id]) return
  try {
    const models = await listModels({ brain, apiKey: (await getSecret(app.fs, brain.id)) ?? undefined })
    app.models.value = { ...app.models.value, [brain.id]: models }
  } catch {
    app.models.value = { ...app.models.value, [brain.id]: [] }
  }
}

export async function startOpenRouter() {
  const verifier = createVerifier()
  sessionStorage.setItem('app.pkce', verifier)
  sessionStorage.setItem('app.draft', app.draft.value)
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
  history.replaceState(null, '', location.pathname)
  try {
    const apiKey = await exchangeOpenRouterCode({ code, verifier })
    await connectBrain({ provider: 'openrouter', apiKey })
    notify(t('brain.connected'))
    continueWithBrain()
  } catch (error) {
    showError(error)
  }
}

// ─── Conversations ───────────────────────────────────────────────────────────

export async function refreshConversations() {
  app.conversations.value = await listConversations(app.fs, app.projectDir)
}

export function newConversation() {
  stop()
  app.current.value = null
  app.error.value = null
  app.dialog.value = null
}

/** @param {string} path */
export async function openConversation(path) {
  stop()
  const loaded = await loadConversation(app.fs, path)
  app.error.value = null
  app.dialog.value = null
  if (loaded) app.current.value = { id: loaded.header.id, path, records: loaded.records }
}

/** @param {string} path */
export async function removeConversation(path) {
  await deleteConversation(app.fs, path)
  if (app.current.value?.path === path) app.current.value = null
  await refreshConversations()
}

/** @type {AbortController | null} */
let controller = null

export function stop() {
  controller?.abort()
  controller = null
}

/** @param {string} text */
export async function send(text) {
  const brain = activeBrain.value
  if (!text.trim() || app.busy.value) return
  if (!brain) {
    app.draft.value = text
    app.dialog.value = 'brain'
    return
  }
  app.draft.value = ''
  let current = app.current.value
  if (!current) {
    const created = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    current = { id: created.id, path: created.path, records: [] }
  }
  const record = userRecord(text, app.deviceId)
  await appendRecords(app.fs, current.path, [record])
  const next = { ...current, records: [...current.records, record] }
  const show = () => { app.current.value = next }
  // The big welcome question morphs into the conversation title.
  if (!current.records.length && document.startViewTransition) await document.startViewTransition(show).updateCallbackDone
  else show()
  await runAgent(brain)
}

/** Run the agent on the current conversation, up to its last user message. */
export async function retry() {
  const brain = activeBrain.value
  if (brain && app.current.value && !app.busy.value) await runAgent(brain)
}

/** @param {BrainConfig} brain */
async function runAgent(brain) {
  const current = /** @type {NonNullable<typeof app.current.value>} */ (app.current.value)
  const messages = toChatMessages(current.records)
  const lastUser = messages.findLastIndex((message) => message.role === 'user')
  /** @type {Envelope[]} */
  const settled = []
  /** @type {Turn} */
  const turn = { user: null, steps: [], at: new Date().toISOString() }
  let frame = 0
  const repaint = () => {
    frame ||= requestAnimationFrame(() => {
      frame = 0
      app.live.value = { turn }
    })
  }

  controller = new AbortController()
  app.busy.value = true
  app.error.value = null
  app.live.value = { turn }
  setPresence('thinking')
  const { settings } = effective.value
  try {
    await runTurn({
      brain,
      apiKey: (await getSecret(app.fs, brain.id)) ?? undefined,
      system: buildSystemPrompt({ assistantName: BRAND.name, uiLanguage: languageName(locale.value, 'en'), now: new Date() }),
      history: messages.slice(0, lastUser + 1),
      label: brainLabel(brain),
      signal: controller.signal,
      rule: (kind, reserved) => resolveRule(kind, { user: settings.rules, policy: app.policy.rules, reserved }),
      askPermission: (request) => new Promise((resolve) => {
        app.permission.value = {
          toolCall: request.toolCall,
          resolve: (option) => {
            app.permission.value = null
            const rule = ruleFromPermission(option)
            if (rule && request.toolCall.kind) setRule(request.toolCall.kind, rule)
            resolve(option)
          },
        }
      }),
      onUpdate: (update, step) => {
        if (update.sessionUpdate === 'agent_message_chunk') setPresence('answering')
        applyUpdate(turn, update, step)
        repaint()
      },
      persist: async (records) => {
        settled.push(...records)
        await appendRecords(app.fs, current.path, records)
      },
    })
    setPresence('done')
  } catch (error) {
    setPresence('idle')
    if (/** @type {any} */ (error)?.code !== 'aborted') showError(error)
  } finally {
    cancelAnimationFrame(frame)
    controller = null
    app.busy.value = false
    app.live.value = null
    app.permission.value?.resolve('reject_once')
    let records = [...current.records, ...settled]
    if (!titleOf(records)) {
      const first = records.map((record) => record.update).find((update) => update?.sessionUpdate === 'user_message_chunk')
      const title = first?.sessionUpdate === 'user_message_chunk' ? firstWords(first.content.text) : ''
      if (title) {
        const meta = metaRecord(app.deviceId, { title })
        await appendRecords(app.fs, current.path, [meta])
        records = [...records, meta]
      }
    }
    if (app.current.value?.path === current.path) app.current.value = { ...current, records }
    await refreshConversations()
    setTimeout(() => app.presence.value === 'done' && setPresence('idle'), 1800)
  }
}

/** @param {unknown} error */
export function showError(error) {
  const err = /** @type {{ code?: string, message?: string }} */ (error ?? {})
  const code = err.code ?? 'unknown'
  const brain = activeBrain.value
  app.error.value = { code, message: t(`error.${code}`, { brain: brain ? brainLabel(brain) : BRAND.name, origin: location.origin }) }
  console.warn(error)
}
