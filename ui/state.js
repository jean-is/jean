// Application state (signals) and the actions that change it.
import { signal, computed } from '@preact/signals-core'
import { BRAND } from '../brand.js'
import { DEFAULT_SETTINGS, saveSettings, applyPolicy, serviceURL, listProjects, parseFrontMatter } from '../core/settings.js'
import { createConversation, appendRecords, loadConversation, listConversations, deleteConversation } from '../core/conversations.js'
import { userRecords, toChatMessages, applyUpdate, titleOf, linkedFiles, foldTurns } from '../core/events.js'
import { buildSystemPrompt, promptState, promptRecord, frozenPrompt, changeNotes } from '../core/prompt.js'
import { resolveRule, ruleFromPermission } from '../core/rules.js'
import { t, locale, useLocale, languageName } from '../core/i18n.js'
import { fileText, documentPart, pagesThatFit, estimateTokens, sourceNumber, isPicture } from '../core/files.js'
import { getSecret } from './secrets.js'
import { loaded, unlock, contributions } from './caps.js'
import { chooseBrain, isLocal, TIERS } from './auto.js'

/** @import { FS, BrainConfig, Envelope, ModelInfo, ToolCallInfo, ResourceLink } from '../core/types.js' */
/** @import { Turn } from '../core/events.js' */
/**
 * A file the user is about to send. `pages` holds its extracted text, page by page; `preview`
 * a picture's address while it waits.
 * @typedef {{ key: string, name: string, status: 'reading' | 'ready' | 'failed', link?: ResourceLink, pages?: string[], error?: string, preview?: string }} Attachment
 */
/** @import { Settings, Project } from '../core/settings.js' */
/** @typedef {'idle' | 'listening' | 'thinking' | 'answering' | 'done'} Presence */
/** @typedef {'light' | 'dark'} Theme */
/** @typedef {import('../core/loop.js').PermissionOption} PermissionOption */
/**
 * A decision waiting for the user, in the decision inbox: an approval, or a helper's question.
 * @typedef {{ id: number, toolCall: ToolCallInfo, resolve: (option: PermissionOption) => void }
 *   | { id: number, question: string, from: string, resolve: (answer: string | null) => void }} Decision
 */

// The 33 launch languages (docs/architecture.md#languages-i18n), machine-translated (D44).
export const LOCALES = ['am', 'ar', 'bn', 'de', 'en', 'es', 'fa', 'fr', 'ha', 'he', 'hi', 'id', 'it', 'ja', 'ko', 'mr', 'ms', 'nl', 'pl', 'pt', 'ru', 'sw', 'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'yo', 'zh-Hans', 'zh-Hant']

export const app = {
  fs: /** @type {FS} */ (/** @type {unknown} */ (null)),
  deviceId: '',
  /** Every project, and the one the room is in: its conversations, files, memory and light. */
  projects: signal(/** @type {Project[]} */ ([])),
  project: signal(/** @type {Project} */ ({ dir: '', id: '', data: {}, body: '' })),
  get projectDir() { return app.project.value.dir },
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
  /** Light or dark: what the device shows (ui/app.js follows it), and the user's pick on this device, if any. */
  deviceTheme: signal(/** @type {Theme} */ ('dark')),
  chosenTheme: signal(/** @type {Theme | null} */ (null)),
  /** The look on screen (D111), once its style sheet is in; settings hold the one chosen. */
  look: signal(/** @type {import('./looks.js').LookId} */ ('room')),
  /** @type {import('@preact/signals-core').Signal<'brain' | 'settings' | 'history' | 'picker' | 'knows' | 'project' | 'connections' | 'skill' | null>} */
  dialog: signal(null),
  draft: signal(''),
  /** The decision inbox: approvals and questions, answered one by one while the work goes on. */
  decisions: signal(/** @type {Decision[]} */ ([])),
  /** @type {import('@preact/signals-core').Signal<ServiceWorker | null>} */
  updateReady: signal(null),
  /** @type {import('@preact/signals-core').Signal<{ message: string, action?: { label: string, run: () => void } } | null>} */
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
  /** When the user was last here, if Jean opened after time away ("Since last time"); 0 otherwise. */
  back: signal(0),
}

// A shared file's share of the brain's context (see docs/architecture.md#retrieval-and-extraction).
const DOCUMENT_SHARE = 0.25
const DEVICE_CONTEXT = 32768
const DEFAULT_CONTEXT = 128000
// Answers citing their sources before Double-check is offered.
export const CITED = 3
// Opening Jean this long after it was last on screen is coming back after time away.
export const AWAY_MS = 8 * 3600_000
// Kept on the device, like its id: when Jean was last on screen here.
export const SEEN_KEY = 'app.seen'
// What a read-only turn may do ("Since last time"): read, search, look things up, work things out.
const READING = new Set(['read', 'search', 'fetch', 'think', 'execute'])
// Anthropic's default cache lifetime is 5 minutes (D49).
const CACHE_TTL_MS = 5 * 60_000

export const effective = computed(() => applyPolicy(app.settings.value, app.policy))
export const activeBrain = computed(() => {
  const { settings } = effective.value
  return settings.brains.find((brain) => brain.id === settings.activeBrain) ?? settings.brains[0] ?? null
})

export const theme = computed(() => app.chosenTheme.value ?? app.deviceTheme.value)

/** What the chip in the box says: Auto, or the brain's own name (its provider is in the picker). */
export const chipLabel = computed(() => {
  const brain = activeBrain.value
  if (!brain) return t('brain.choose')
  return effective.value.settings.auto ? t('auto.name') : brain.api === 'device' ? t('provider.device') : brain.model.split('/').at(-1)
})

/** @param {BrainConfig} brain */
export function brainLabel(brain) {
  if (brain.api === 'device') return t('provider.device')
  return `${t(`provider.${brain.provider}`)} · ${brain.model.split('/').at(-1)}`
}

/** Where on-device weights (brain, dictation) are downloaded from. */
export const weightsHost = () => serviceURL('modelWeights', app.settings.value, app.policy)

/** @param {Partial<Settings>} patch */
export async function updateSettings(patch) {
  app.settings.value = { ...app.settings.value, ...patch }
  await saveSettings(app.fs, app.settings.value)
}

/** @param {Presence} presence */
export function setPresence(presence) {
  app.presence.value = presence
}

/** @param {string} message @param {{ label: string, run: () => void }} [action] e.g. Undo */
export function notify(message, action) {
  const toast = { message, action }
  app.toast.value = toast
  setTimeout(() => {
    if (app.toast.value === toast) app.toast.value = null
  }, action ? 6000 : 2600)
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

// The pick belongs to this device, like the device's own mode, so it lives in localStorage:
// index.html reads it before the first paint, and the room never flashes the other colour.
export const THEME_KEY = 'app.theme'

/** Light or dark. Picking what the device shows follows the device again. @param {Theme} next */
export function setTheme(next) {
  app.chosenTheme.value = next === app.deviceTheme.value ? null : next
  if (app.chosenTheme.value) localStorage.setItem(THEME_KEY, next)
  else localStorage.removeItem(THEME_KEY)
}

let lookWrite = 0
/**
 * Another look, or a touch over it (D111), shown at once. `later` waits for a pause before
 * writing settings.json, for a slider being dragged or CSS being typed.
 * @param {import('../core/settings.js').Look | null} patch  null: back to the look as it comes
 * @param {{ later?: boolean }} [options]
 */
export function setLook(patch, { later = false } = {}) {
  const look = app.settings.value.look ?? {}
  app.settings.value = { ...app.settings.value, look: patch ? { ...look, ...patch } : { id: look.id } }
  clearTimeout(lookWrite)
  lookWrite = setTimeout(() => saveSettings(app.fs, app.settings.value).catch(showError), later ? 500 : 0)
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
// Connecting, choosing and removing them is in brains.js, loaded with the dialogs.

/** Models offered by a connected brain (cached). @param {BrainConfig} brain */
export async function loadModels(brain) {
  if (app.models.value[brain.id]) return
  try {
    const { listModels } = await import('../core/llm.js')
    const models = await listModels({ brain, apiKey: (await getSecret(app.fs, brain.id)) ?? undefined })
    app.models.value = { ...app.models.value, [brain.id]: models }
  } catch {
    app.models.value = { ...app.models.value, [brain.id]: [] }
  }
}

// ─── Projects ────────────────────────────────────────────────────────────────

/** Reads every project.md again, and the room's own. */
export async function refreshProjects() {
  app.projects.value = await listProjects(app.fs)
  app.project.value = app.projects.value.find((project) => project.dir === app.projectDir) ?? app.project.value
}

/** Walks into another project's room. @param {Project} project */
export async function enterProject(project) {
  if (project.dir === app.projectDir) return
  newConversation()
  app.project.value = project
  app.conversations.value = []
  await refreshConversations()
}

/** What the assistant is called in this room: the name the project gave it, or Jean's. */
export const assistantName = () => String(app.project.value.data.assistantName || BRAND.name)

/** Whether this message may go to the cloud: the user's switch, and the project's. */
export const cloudAllowed = () => effective.value.settings.cloud && app.project.value.data.cloud !== false

// ─── Conversations ───────────────────────────────────────────────────────────

export async function refreshConversations() {
  app.conversations.value = await listConversations(app.fs, app.projectDir)
}

export function newConversation() {
  leave()
  app.current.value = null
  lastRequestAt = 0
  app.error.value = null
  app.dialog.value = null
}

/**
 * A page the user asked for, as a view transition where there is one (D120): the title morphs, a
 * look may stage it. The root's data-turn says "from" while the page left is captured, then "to"
 * until the turn ends, with "back" when it goes to an older conversation (D125). It turns a frame
 * later: what is typed meanwhile is the new page's draft, and a message sent meanwhile waits.
 * Code that needs the new page at once changes it directly.
 * @param {() => unknown} change @param {boolean} [back]
 */
export async function turnPage(change, back = false) {
  if (!document.startViewTransition) return change()
  const root = document.documentElement
  const way = back ? ' back' : ''
  const before = app.draft.peek()
  root.dataset.turn = `from${way}`
  const transition = document.startViewTransition(async () => {
    const typed = app.draft.peek()
    if (typed !== before) app.draft.value = before
    await change()
    if (typed !== before) app.draft.value = typed
    root.dataset.turn = `to${way}`
  })
  lastTurn = transition
  transition.ready.catch(() => {}) // skipped in a hidden tab, the change made all the same
  transition.finished.catch(() => {}).then(() => lastTurn === transition && root.removeAttribute('data-turn'))
  turning = transition.updateCallbackDone.catch(() => {})
  await transition.updateCallbackDone
}
/** The page change under way, which a message waits for, and the last one asked for. */
let turning = Promise.resolve()
/** @type {ViewTransition | null} */
let lastTurn = null

/** @param {string} path */
export async function openConversation(path) {
  leave()
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

/** The run whose answer is on screen: it has the box until it ends, even once stopped. @type {AbortController | null} */
let controller = null

/** Stops the answer being written. What it waits for (a card, a question, an offer) is declined, so it ends now. */
export function stop() {
  controller?.abort()
  decline()
}

/** Declines what waits for the user's answer. */
function decline() {
  for (const decision of app.decisions.value) 'toolCall' in decision ? decision.resolve('reject_once') : decision.resolve(null)
  app.offering.value?.resolve(false)
}

/**
 * Leaves the conversation on screen while it is being answered. The answer stops and winds down
 * out of sight, and the box is free at once: a message sent next is neither held up nor dropped.
 */
function leave() {
  if (!controller) return
  stop()
  controller = null
  app.busy.value = false
  app.live.value = null
  setPresence('idle')
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

/** @type {Map<string, string | undefined>} uri → a picture's bytes, base64, for brains that can see */
const pictures = new Map()

/** What the brain reads for each linked file, and the pictures it sees if it can. @param {Envelope[]} records @param {BrainConfig} brain */
async function documents(records, brain) {
  const sees = seesPictures(brain)
  for (const link of linkedFiles(records)) {
    if (!texts.has(link.uri)) texts.set(link.uri, await fileText(app.fs, app.projectDir, link.uri))
    if (sees && isPicture(link) && !pictures.has(link.uri)) pictures.set(link.uri, await base64(await app.fs.readBytes(`${app.projectDir}/${link.uri}`)))
  }
  return (/** @type {ResourceLink} */ link) => documentPart(link, texts.get(link.uri) ?? null, sees ? pictures.get(link.uri) : undefined)
}

/** @param {Uint8Array | null} bytes @returns {Promise<string | undefined>} */
function base64(bytes) {
  return new Promise((resolve) => {
    if (!bytes) return resolve(undefined)
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^[^,]*,/, ''))
    reader.onerror = () => resolve(undefined)
    reader.readAsDataURL(new Blob([/** @type {BlobPart} */ (bytes)]))
  })
}

/**
 * Whether a brain is shown pictures: not the one on this device yet (its eyes come later, D42),
 * nor a model its provider lists as reading text only. Others are trusted to see.
 * @param {BrainConfig} brain
 */
export function seesPictures(brain) {
  const input = app.models.value[brain.id]?.find((model) => model.id === brain.model)?.input
  return brain.api !== 'device' && (!input || input.includes('image'))
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

// ─── The decision inbox ──────────────────────────────────────────────────────

let decisionId = 0

/**
 * Queues a decision for the user and waits for the answer. Helpers keep working meanwhile,
 * so several can wait at once, each answered on its own.
 * @param {Omit<Decision, 'id' | 'resolve'>} decision @returns {Promise<any>}
 */
function queue(decision) {
  return new Promise((resolve) => {
    const item = /** @type {Decision} */ ({ ...decision, id: ++decisionId, resolve: (/** @type {any} */ answer) => {
      app.decisions.value = app.decisions.value.filter((other) => other !== item)
      resolve(answer)
    } })
    app.decisions.value = [...app.decisions.value, item]
  })
}

/** A helper's question; null when the user doesn't answer. @param {string} question @param {string} from @returns {Promise<string | null>} */
export const askUser = (question, from) => queue({ question, from })

/** An approval card. "Always allow" and "Never" set the rule, which the other cards of that kind then follow. @param {ToolCallInfo} toolCall */
async function approve(toolCall) {
  const option = /** @type {PermissionOption} */ (await queue({ toolCall }))
  const rule = ruleFromPermission(option)
  if (rule && toolCall.kind) {
    await setRule(toolCall.kind, rule)
    for (const other of app.decisions.value) if ('toolCall' in other && other.toolCall.kind === toolCall.kind) other.resolve(rule === 'allow' ? 'allow_once' : 'reject_once')
  }
  return option
}

// ─── Sending ─────────────────────────────────────────────────────────────────

/** The body of one of Jean's Markdown files ('' when missing). @param {string} path */
export const readBody = async (path) => parseFrontMatter((await app.fs.read(path)) ?? '').body.trim()

/**
 * What the brain knows of the user and the room: the project, the instructions (the
 * organisation's, the user's, the project's), and what capabilities add (memory, skills).
 * @returns {Promise<import('../core/prompt.js').Sections>}
 */
async function context() {
  const { dir, data, body } = app.project.value
  const home = data.default === true
  const instructions = [app.policy.instructions, await readBody('instructions.md'), home ? '' : await readBody(`${dir}/instructions.md`)].filter(Boolean).join('\n\n')
  const added = await Promise.all(contributions().sections.map((section) => section()))
  // The project's name, then what the user calls its assistant there and how it should be.
  const project = [String(data.name), ...(data.assistantName ? [`The user calls you ${data.assistantName} here.`] : []), ...(body.trim() ? [`How to be: ${body.trim()}`] : [])].join('\n')
  return Object.assign({ ...(!home && { project }), ...(instructions && { instructions }) }, ...added)
}

/**
 * The records a message adds: the frozen prompt when the conversation has none yet, or
 * notes for what changed since (D46), any notes the message comes with, then the message itself.
 * @param {string} text @param {BrainConfig} brain @param {Envelope[]} records @param {Envelope[]} [notes]
 */
async function prepare(text, brain, records, notes = []) {
  // Things Jean made comes with the first message, so a file can be made from the start (D119).
  await Promise.all([app.ready, unlock('made')])
  const { tools, lines, rules } = contributions()
  // Connections' tools are deferred: found with find_tools, never declared upfront (D47).
  const names = tools.filter((tool) => !tool.hidden && !tool.deferred).map((tool) => tool.spec.name)
  const sections = await context()
  const now = promptState({ language: languageName(locale.value, 'en'), tools: names, sections })
  const frozen = frozenPrompt(records)
  const head = frozen
    ? changeNotes(frozen.state, now, sections)
    : [promptRecord(app.deviceId, buildSystemPrompt({ assistantName: assistantName(), uiLanguage: now.language, tools: lines, rules, sections, now: new Date() }), now)]
  return [...head, ...notes, ...userRecords(text, attachedLinks(brain, records), app.deviceId)]
}

// ─── Auto ────────────────────────────────────────────────────────────────────

/** The highest level Auto used in a conversation: it never steps down within one. @param {Envelope[]} records */
const autoLevel = (records) => Math.max(0, ...records.map((record) => /** @type {any} */ (record.update)?.rawInput?.auto?.level ?? 0))

/** The number the turn's first new source is cited by: after every file and source so far (D71). @param {Envelope[]} records */
const nextSource = (records) => 1 + Math.max(0, ...records.flatMap(({ update }) => (update?.sessionUpdate === 'user_message_chunk' && update.content.type === 'resource_link'
  ? [update.content._meta?.source ?? 0] : update?.sessionUpdate === 'tool_call' ? (update._meta?.sources ?? []).map((source) => source.n) : [])))

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
    return brain && (cloudAllowed() || isLocal(brain)) ? { brain } : null
  }
  await Promise.all(settings.brains.filter((brain) => !isLocal(brain)).map(loadModels))
  const choice = chooseBrain({
    brains: settings.brains,
    preferred: settings.activeBrain,
    cloud: cloudAllowed(),
    // A conversation with a picture needs a brain that can see it.
    signals: { ...signals, pictures: currentFiles().some(isPicture) },
    floor: Math.min(2, autoLevel(records) + boost),
    has: (brain, model) => (app.models.value[brain.id] ?? []).some((info) => info.id === model),
    sees: seesPictures,
    tiers: app.policy.tiers ?? TIERS,
  })
  return choice && { brain: choice.brain, meta: { auto: { level: choice.level, reason: choice.reason } } }
}

/** Whether "Ask a smarter brain" can step up from an answer Auto chose. @param {ToolCallInfo | undefined} entry */
export function canStepUp(entry) {
  const { settings } = effective.value
  return settings.auto && cloudAllowed() && (entry?.rawInput?.auto?.level ?? 2) < 2 && settings.brains.some((brain) => !isLocal(brain))
}

/** Asks again, one level up. */
export function askSmarter() {
  send(t('auto.smarter.prompt'), { boost: 1 })
}

/**
 * @param {string} text
 * @param {{ boost?: number, notes?: Envelope[] }} [options] boost: Auto's levels above the last
 *   answer's; notes: what the brain is told just before the message ("Since last time")
 */
export async function send(text, { boost = 0, notes = [] } = {}) {
  await turning
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
  const added = await prepare(text.trim(), brain, current?.records ?? [], notes)
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
  // The title is written alongside the answer (D112).
  if (!titleOf(next.records)) import('./title.js').then(({ nameConversation }) => nameConversation(next.path, next.records, brain))
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
  // A brief of what's new since last time only reads, whatever the rules say.
  const readOnly = foldTurns(current.records).at(-1)?.notes.some((note) => note.data.kind === 'since')
  // The loop and the brains' adapters load with the first message, not with the first screen.
  const [{ runTurn }] = await Promise.all([import('../core/loop.js'), app.ready])
  const frozen = frozenPrompt(current.records)
  const messages = toChatMessages(current.records, await documents(current.records, brain))
  const lastUser = messages.findLastIndex((message) => message.role === 'user')
  if (brain.api === 'device') await unlock('brain-local')
  const stream = brain.api === 'device' ? loaded.value.get('brain-local')?.stream : undefined
  lastRequestAt = Date.now()
  /** @type {Envelope[]} */
  const settled = []
  /** @type {Turn} */
  const turn = { user: null, notes: [], steps: [], at: new Date().toISOString() }
  const run = new AbortController()
  // Once the user has gone to another conversation, nothing on screen is this run's any more.
  const shown = () => controller === run
  let frame = 0
  const repaint = () => {
    frame ||= requestAnimationFrame(() => {
      frame = 0
      if (shown()) app.live.value = { turn }
    })
  }

  controller = run
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
      firstSource: nextSource(current.records),
      signal: run.signal,
      rule: (kind, reserved) => (readOnly && !READING.has(kind) ? 'never' : resolveRule(kind, { user: settings.rules, policy: app.policy.rules, reserved })),
      askPermission: (request) => approve(request.toolCall),
      onUpdate: (update, step) => {
        if (!shown()) return
        if (update.sessionUpdate === 'agent_message_chunk') setPresence('answering')
        applyUpdate(turn, update, step)
        repaint()
      },
      persist: async (records) => {
        settled.push(...records)
        await appendRecords(app.fs, current.path, records)
      },
    })
    if (shown()) setPresence('done')
  } catch (error) {
    if (shown()) {
      setPresence('idle')
      if (/** @type {any} */ (error)?.code !== 'aborted') showError(error)
    }
  } finally {
    cancelAnimationFrame(frame)
    // Unless the user went to another conversation: the box is theirs already, and maybe another run's.
    if (shown()) {
      controller = null
      app.busy.value = false
      app.live.value = null
      decline()
    }
    // What was kept meanwhile, like the title, stays.
    const latest = app.current.peek()
    const records = [...(latest?.path === current.path ? latest.records : current.records), ...settled]
    if (app.current.value?.path === current.path) app.current.value = { ...current, records }
    await refreshConversations()
    setTimeout(() => app.presence.value === 'done' && setPresence('idle'), 1800)
    const answer = lastAnswer(settled)
    const at = foldTurns(records).at(-1)?.at
    if (answer && at) suggestActions(at, answer, records, current)
    if (answer && at && /\[\d+(?:,\s*\d+)*\]/.test(answer) && nextSource(records) > 1) cited(current.path, at, records)
  }
}

/**
 * An answer that cites its sources: Double-check checks it, and until it is on, citations in
 * regular use offer it (counted, an event with no language, D6).
 * @param {string} path @param {string} at @param {Envelope[]} records
 */
async function cited(path, at, records) {
  if (loaded.value.has('check')) return (await import('../caps/check/check.js')).check(path, at, records)
  const count = effective.value.settings.cited ?? 0
  if (count < CITED) await updateSettings({ cited: count + 1 })
}

/**
 * Follow-ups from the catalogue, picked by the reflexes when they're on.
 * @param {string} at @param {string} answer @param {Envelope[]} records
 * @param {{ id: string, path: string }} conversation the one answered, which may no longer be on screen
 */
async function suggestActions(at, answer, records, conversation) {
  const { followUps } = await import('./discovery.js')
  const ids = await followUps(answer, records, conversation)
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
    const messages = toChatMessages(all, await documents(all, brain))
    const { warmCache } = await import('../core/llm.js')
    await warmCache({ brain, apiKey: (await getSecret(app.fs, brain.id)) ?? undefined, system: frozen?.system, messages, tools })
  } catch (error) {
    console.debug('Cache warm-up skipped', error)
  }
}
