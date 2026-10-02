// Application state (signals) and the actions that change it.
import { signal, computed } from '@preact/signals-core'
import { BRAND } from '../brand.js'
import { DEFAULT_SETTINGS, saveSettings, applyPolicy, serviceURL } from '../core/settings.js'
import { createConversation, appendRecords, loadConversation, listConversations, deleteConversation } from '../core/conversations.js'
import { userRecords, metaRecord, toChatMessages, applyUpdate, titleOf, linkedFiles } from '../core/events.js'
import { runTurn } from '../core/loop.js'
import { buildSystemPrompt, promptState, promptRecord, frozenPrompt, changeNotes } from '../core/prompt.js'
import { resolveRule, ruleFromPermission } from '../core/rules.js'
import { t, locale, useLocale, languageName, firstWords } from '../core/i18n.js'
import { PROVIDERS, listModels, warmCache } from '../core/llm.js'
import { fileText, documentPart, splitPages, pagesThatFit, estimateTokens } from '../core/files.js'
import { createVerifier, challengeS256, openRouterAuthURL, exchangeOpenRouterCode } from '../core/oauth.js'
import { ulid } from '../core/ulid.js'
import { getSecret, setSecret, deleteSecret } from './secrets.js'
import { loaded, unlock, contributions } from './caps.js'

/** @typedef {import('../core/types.js').FS} FS */
/** @typedef {import('../core/types.js').BrainConfig} BrainConfig */
/** @typedef {import('../core/types.js').Envelope} Envelope */
/** @typedef {import('../core/types.js').ModelInfo} ModelInfo */
/** @typedef {import('../core/types.js').ToolCallInfo} ToolCallInfo */
/** @typedef {import('../core/events.js').Turn} Turn */
/** @typedef {import('../core/types.js').ResourceLink} ResourceLink */
/**
 * A file the user is about to send. `pages` holds its extracted text, page by page.
 * @typedef {{ key: string, name: string, status: 'reading' | 'ready' | 'failed', link?: ResourceLink, pages?: string[], error?: string }} Attachment
 */
/** @typedef {import('../core/settings.js').Settings} Settings */
/** @typedef {'idle' | 'listening' | 'thinking' | 'answering' | 'done'} Presence */

export const LOCALES = ['en', 'fr', 'ar', 'ja']

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
  attachments: signal(/** @type {Attachment[]} */ ([])),
  /** Capabilities the user turned on and policy's preUnlock, loaded at start. */
  ready: /** @type {Promise<unknown>} */ (Promise.resolve()),
}

// A shared file's share of the brain's context (see docs/architecture.md#retrieval-and-extraction).
const DOCUMENT_SHARE = 0.25
const DEVICE_CONTEXT = 32768
const DEFAULT_CONTEXT = 128000
// Anthropic's default cache lifetime is 5 minutes (D49).
const CACHE_TTL_MS = 5 * 60_000

export const effective = computed(() => applyPolicy(app.settings.value, app.policy))
export const activeBrain = computed(() => {
  const { settings } = effective.value
  return settings.brains.find((brain) => brain.id === settings.activeBrain) ?? settings.brains[0] ?? null
})

/** @param {BrainConfig} brain */
export function brainLabel(brain) {
  if (brain.api === 'device') return t('provider.device')
  return `${t(`provider.${brain.provider}`)} · ${brain.model.split('/').at(-1)}`
}

/** Where on-device weights (brain, dictation) are downloaded from. */
export const weightsHost = () => serviceURL('modelWeights', app.settings.value, app.policy)

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

/** @param {string} id */
export function rememberUnlocked(id) {
  if (!app.settings.value.unlocked.includes(id)) updateSettings({ unlocked: [...app.settings.value.unlocked, id] })
}

/** @param {string} id */
export async function answerOffer(id) {
  await updateSettings({ offers: { ...app.settings.value.offers, [id]: new Date().toISOString() } })
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

// ─── Conversations ───────────────────────────────────────────────────────────

export async function refreshConversations() {
  app.conversations.value = await listConversations(app.fs, app.projectDir)
}

export function newConversation() {
  stop()
  app.current.value = null
  lastRequestAt = 0
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
  lastRequestAt = 0
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

// ─── Files ───────────────────────────────────────────────────────────────────

/** Every file the brain may read in this conversation: linked ones, then those about to be sent. */
export function currentFiles() {
  const pending = app.attachments.value.flatMap((item) => (item.link ? [item.link] : []))
  return [...linkedFiles(app.current.value?.records ?? []), ...pending]
}

/** Opens a shared file in a new tab (or downloads it, for types the browser can't show). @param {ResourceLink} link */
export async function openFile(link) {
  const bytes = await app.fs.readBytes(`${app.projectDir}/${link.uri}`)
  if (!bytes) return notify(t('files.missing', { name: link.name }))
  const url = URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type: link.mimeType || 'application/octet-stream' }))
  open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** @param {string} key */
export function removeAttachment(key) {
  app.attachments.value = app.attachments.value.filter((item) => item.key !== key)
}

/** @type {Map<string, string | null>} uri → extracted text; files are named by content, so this never goes stale */
const texts = new Map()

/** @param {ResourceLink} link @param {string[]} pages */
export function rememberText(link, pages) {
  texts.set(link.uri, pages.map((page, i) => `[[page ${i + 1}]]\n${page}`).join('\n\n'))
}

/** @param {Envelope[]} records */
async function documents(records) {
  for (const link of linkedFiles(records)) {
    if (!texts.has(link.uri)) texts.set(link.uri, await fileText(app.fs, app.projectDir, link.uri))
  }
  return (/** @type {ResourceLink} */ link) => documentPart(link, texts.get(link.uri) ?? null)
}

/** @param {BrainConfig} brain */
export function contextTokens(brain) {
  if (brain.api === 'device') return DEVICE_CONTEXT
  return app.models.value[brain.id]?.find((model) => model.id === brain.model)?.contextLength ?? DEFAULT_CONTEXT
}

/**
 * Links for the files about to be sent. Each records which pages go into the context,
 * decided now against the brain's budget and then frozen (files.js).
 * @param {BrainConfig} brain
 */
function attachedLinks(brain) {
  let budget = contextTokens(brain) * DOCUMENT_SHARE
  /** @type {ResourceLink[]} */
  const links = []
  for (const item of app.attachments.value) {
    if (item.status !== 'ready' || !item.link || !item.pages) continue
    const [first, last] = pagesThatFit(item.pages, Math.max(budget, 1))
    budget -= item.pages.slice(0, last).reduce((sum, page) => sum + estimateTokens(page), 0)
    links.push(last < item.pages.length ? { ...item.link, _meta: { pages: [first, last], of: item.pages.length } } : item.link)
  }
  return links
}

// ─── Sending ─────────────────────────────────────────────────────────────────

/**
 * The records a message adds: the frozen prompt when the conversation has none yet, or
 * notes for what changed since (D46), then the user message itself.
 * @param {string} text @param {BrainConfig} brain @param {Envelope[]} records
 */
async function prepare(text, brain, records) {
  await app.ready
  const { tools, lines, rules } = contributions()
  const now = promptState({ language: languageName(locale.value, 'en'), tools: tools.map((tool) => tool.spec.name) })
  const frozen = frozenPrompt(records)
  const head = frozen
    ? changeNotes(frozen.state, now)
    : [promptRecord(app.deviceId, buildSystemPrompt({ assistantName: BRAND.name, uiLanguage: now.language, tools: lines, rules, now: new Date() }), now)]
  return [...head, ...userRecords(text, attachedLinks(brain), app.deviceId)]
}

/** @param {string} text */
export async function send(text) {
  const brain = activeBrain.value
  const files = app.attachments.value
  if ((!text.trim() && !files.some((item) => item.status === 'ready')) || app.busy.value) return
  if (files.some((item) => item.status === 'reading')) return notify(t('files.stillReading'))
  if (!brain) {
    app.draft.value = text
    app.dialog.value = 'brain'
    return
  }
  let current = app.current.value
  const added = await prepare(text.trim(), brain, current?.records ?? [])
  app.draft.value = ''
  app.attachments.value = []
  if (!current) {
    const created = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    current = { id: created.id, path: created.path, records: [] }
  }
  await appendRecords(app.fs, current.path, added)
  const next = { ...current, records: [...current.records, ...added] }
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
  await app.ready
  const frozen = frozenPrompt(current.records)
  const messages = toChatMessages(current.records, await documents(current.records))
  const lastUser = messages.findLastIndex((message) => message.role === 'user')
  const declared = frozen?.state.tools ?? []
  const tools = contributions().tools.filter((tool) => declared.includes(tool.spec.name))
  if (brain.api === 'device') await unlock('brain-local')
  const stream = brain.api === 'device' ? loaded.value.get('brain-local')?.stream : undefined
  lastRequestAt = Date.now()
  /** @type {Envelope[]} */
  const settled = []
  /** @type {Turn} */
  const turn = { user: null, notes: [], steps: [], at: new Date().toISOString() }
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
      system: frozen?.system ?? '',
      history: messages.slice(0, lastUser + 1),
      tools,
      ...(stream && { stream }),
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
      const chunks = records.flatMap((record) => (record.update?.sessionUpdate === 'user_message_chunk' ? [record.update.content] : []))
      const words = chunks.find((chunk) => chunk.type === 'text' && chunk.text)
      const file = chunks.find((chunk) => chunk.type === 'resource_link')
      const title = words?.type === 'text' ? firstWords(words.text) : file?.type === 'resource_link' ? file.name : ''
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

// ─── Cache warming (D49) ─────────────────────────────────────────────────────

let lastRequestAt = 0

/**
 * Called when the user starts typing or a file is ready: if the provider's cache has
 * probably expired, write it now with the prefix the next message will share.
 */
export async function warm() {
  const brain = activeBrain.value
  const current = app.current.value
  if (brain?.api !== 'anthropic' || app.busy.value) return
  const records = current?.records ?? []
  const lastActivity = Math.max(lastRequestAt, Date.parse(records.at(-1)?.at ?? '') || 0)
  if (Date.now() - lastActivity < CACHE_TTL_MS - 30_000) return
  if (!records.length && !app.attachments.value.some((item) => item.status === 'ready')) return
  lastRequestAt = Date.now()
  try {
    const all = [...records, ...await prepare('', brain, records)]
    const frozen = frozenPrompt(all)
    const declared = frozen?.state.tools ?? []
    const tools = contributions().tools.filter((tool) => declared.includes(tool.spec.name)).map((tool) => tool.spec)
    const messages = toChatMessages(all, await documents(all))
    await warmCache({ brain, apiKey: (await getSecret(app.fs, brain.id)) ?? undefined, system: frozen?.system, messages, tools })
  } catch (error) {
    console.debug('Cache warm-up skipped', error)
  }
}
