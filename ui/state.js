// Application state (signals) and the actions that change it.
import { signal, computed } from '@preact/signals-core'
import { BRAND } from '../brand.js'
import { DEFAULT_SETTINGS, saveSettings, applyPolicy, serviceURL } from '../core/settings.js'
import { createConversation, appendRecords, loadConversation, listConversations, deleteConversation } from '../core/conversations.js'
import { userRecords, metaRecord, toChatMessages, applyUpdate, titleOf, linkedFiles, foldTurns } from '../core/events.js'
import { runTurn } from '../core/loop.js'
import { buildSystemPrompt, promptState, promptRecord, frozenPrompt, changeNotes } from '../core/prompt.js'
import { resolveRule, ruleFromPermission } from '../core/rules.js'
import { t, locale, useLocale, languageName, firstWords } from '../core/i18n.js'
import { PROVIDERS, listModels, warmCache } from '../core/llm.js'
import { fileText, documentPart, pagesThatFit, estimateTokens, sourceNumber } from '../core/files.js'
import { createVerifier, challengeS256, openRouterAuthURL, exchangeOpenRouterCode } from '../core/oauth.js'
import { ulid } from '../core/ulid.js'
import { getSecret, setSecret, deleteSecret } from './secrets.js'
import { loaded, unlock, contributions } from './caps.js'
import { chooseBrain, isLocal, TIERS } from './auto.js'

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

// The 33 launch languages (docs/architecture.md#languages-i18n), machine-translated (D44).
export const LOCALES = ['am', 'ar', 'bn', 'de', 'en', 'es', 'fa', 'fr', 'ha', 'he', 'hi', 'id', 'it', 'ja', 'ko', 'mr', 'ms', 'nl', 'pl', 'pt', 'ru', 'sw', 'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'yo', 'zh-Hans', 'zh-Hant']

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
  /** @type {import('@preact/signals-core').Signal<'brain' | 'settings' | 'history' | 'collection' | 'picker' | null>} */
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
  /** A capability offered above the box (progressive discovery), with its download's progress. */
  offer: signal(/** @type {{ id: string, progress?: number } | null} */ (null)),
  /** The brain's offer, waiting in the reply for the user's answer. */
  offering: signal(/** @type {{ id: string, resolve: (yes: boolean) => void } | null} */ (null)),
  /** Follow-ups the reflexes picked from the catalogue, by the answer's turn. */
  actions: signal(/** @type {Record<string, string[]>} */ ({})),
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

/** What the chip in the box says. */
export const chipLabel = computed(() => {
  const { settings } = effective.value
  if (!settings.brains.length) return t('brain.choose')
  return settings.auto ? t('auto.name') : brainLabel(/** @type {BrainConfig} */ (activeBrain.value))
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

/** @param {Partial<Pick<Settings, 'auto' | 'cloud'>>} patch */
export async function setBrainMode(patch) {
  await updateSettings(patch)
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
 * @param {BrainConfig} brain @param {Envelope[]} records
 */
function attachedLinks(brain, records) {
  let budget = contextTokens(brain) * DOCUMENT_SHARE
  /** @type {ResourceLink[]} */
  const links = []
  for (const item of app.attachments.value) {
    if (item.status !== 'ready' || !item.link || !item.pages) continue
    const [first, last] = pagesThatFit(item.pages, Math.max(budget, 1))
    budget -= item.pages.slice(0, last).reduce((sum, page) => sum + estimateTokens(page), 0)
    // The number the brain cites it by, kept if the same file was shared before.
    const source = sourceNumber([...linkedFiles(records), ...links], item.link)
    links.push({ ...item.link, _meta: { ...(last < item.pages.length && { pages: [first, last], of: item.pages.length }), source } })
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
  const names = tools.filter((tool) => !tool.hidden).map((tool) => tool.spec.name)
  const now = promptState({ language: languageName(locale.value, 'en'), tools: names })
  const frozen = frozenPrompt(records)
  const head = frozen
    ? changeNotes(frozen.state, now)
    : [promptRecord(app.deviceId, buildSystemPrompt({ assistantName: BRAND.name, uiLanguage: now.language, tools: lines, rules, now: new Date() }), now)]
  return [...head, ...userRecords(text, attachedLinks(brain, records), app.deviceId)]
}

// ─── Auto ────────────────────────────────────────────────────────────────────

/** The highest level Auto used in a conversation: it never steps down within one. @param {Envelope[]} records */
const autoLevel = (records) => Math.max(0, ...records.map((record) => /** @type {any} */ (record.update)?.rawInput?.auto?.level ?? 0))

/** The last answer's text, for "is the user unhappy with it?". @param {Envelope[]} records */
const lastAnswer = (records) => {
  const update = records.findLast((record) => record.update?.sessionUpdate === 'agent_message_chunk')?.update
  return update?.sessionUpdate === 'agent_message_chunk' ? update.content.text : undefined
}

/**
 * The brain for the next answer: the one the user picked, or Auto's choice from what the
 * reflexes make of the message (they also offer a capability when one would help).
 * @param {string} text @param {Envelope[]} records @param {number} [boost] levels above the last one
 * @returns {Promise<{ brain: BrainConfig, meta?: Record<string, any> } | null>}
 */
async function pickBrain(text, records, boost = 0) {
  const { settings } = effective.value
  const { sense } = await import('./discovery.js')
  const signals = await sense(text, lastAnswer(records))
  if (!settings.auto) {
    const brain = activeBrain.value
    return brain && (settings.cloud || isLocal(brain)) ? { brain } : null
  }
  await Promise.all(settings.brains.filter((brain) => !isLocal(brain)).map(loadModels))
  const choice = chooseBrain({
    brains: settings.brains,
    preferred: settings.activeBrain,
    cloud: settings.cloud,
    signals,
    floor: Math.min(2, autoLevel(records) + boost),
    has: (brain, model) => (app.models.value[brain.id] ?? []).some((info) => info.id === model),
    tiers: app.policy.tiers ?? TIERS,
  })
  return choice && { brain: choice.brain, meta: { auto: { level: choice.level, reason: choice.reason } } }
}

/** Whether "Ask a smarter brain" can step up from an answer Auto chose. @param {ToolCallInfo | undefined} entry */
export function canStepUp(entry) {
  const { settings } = effective.value
  return settings.auto && settings.cloud && (entry?.rawInput?.auto?.level ?? 2) < 2 && settings.brains.some((brain) => !isLocal(brain))
}

/** Asks again, one level up. */
export function askSmarter() {
  send(t('auto.smarter.prompt'), 1)
}

/** @param {string} text @param {number} [boost] Auto: levels above the last answer's */
export async function send(text, boost = 0) {
  const files = app.attachments.value
  if ((!text.trim() && !files.some((item) => item.status === 'ready')) || app.busy.value) return
  if (files.some((item) => item.status === 'reading')) return notify(t('files.stillReading'))
  if (!effective.value.settings.brains.length) {
    app.draft.value = text
    app.dialog.value = 'brain'
    return
  }
  let current = app.current.value
  app.busy.value = true
  setPresence('thinking')
  const picked = await pickBrain(text.trim(), current?.records ?? [], boost).finally(() => { app.busy.value = false })
  if (!picked) {
    setPresence('idle')
    notify(t('auto.noPrivate'))
    app.dialog.value = 'picker'
    return
  }
  const { brain, meta } = picked
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
  await runAgent(brain, meta)
}

/** Run the agent on the current conversation, up to its last user message. */
export async function retry() {
  const current = app.current.value
  if (!current || app.busy.value) return
  const picked = await pickBrain('', current.records)
  if (picked) await runAgent(picked.brain, picked.meta)
}

/** @param {BrainConfig} brain @param {Record<string, any>} [meta] why Auto chose it */
async function runAgent(brain, meta) {
  const current = /** @type {NonNullable<typeof app.current.value>} */ (app.current.value)
  await app.ready
  const frozen = frozenPrompt(current.records)
  const messages = toChatMessages(current.records, await documents(current.records))
  const lastUser = messages.findLastIndex((message) => message.role === 'user')
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
      // Every tool can be called from a script; the brain sees the declared ones (D47).
      tools: () => contributions().tools,
      declared: frozen?.state.tools ?? [],
      ...(stream && { stream }),
      label: brainLabel(brain),
      meta,
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
    app.offering.value?.resolve(false)
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
    const answer = lastAnswer(settled)
    const at = foldTurns(records).at(-1)?.at
    if (answer && at) suggestActions(at, answer)
  }
}

/** Follow-ups from the catalogue, picked by the reflexes when they're on. @param {string} at @param {string} answer */
async function suggestActions(at, answer) {
  const { followUps } = await import('./discovery.js')
  const ids = await followUps(answer)
  if (ids.length) app.actions.value = { ...app.actions.value, [at]: ids }
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
