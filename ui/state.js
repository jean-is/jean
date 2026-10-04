// Application state (signals) and the actions that change it.
import { signal, computed } from '@preact/signals-core'
import { BRAND } from '../brand.js'
import { DEFAULT_SETTINGS, saveSettings, applyPolicy, serviceURL, listProjects, parseFrontMatter, isLocal } from '../core/settings.js'
import { loadConversation, listConversations, deleteConversation } from '../core/conversations.js'
import { linkedFiles } from '../core/events.js'
import { t, useLocale } from '../core/i18n.js'

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
 * A decision waiting for the user, in the decision inbox: an approval, or questions from Jean or
 * one of its helpers (`from`, the part it works on; D146), in the conversation at `conversation` (D147).
 * @typedef {{ id: number, conversation?: string, toolCall: ToolCallInfo, resolve: (option: PermissionOption) => void }
 *   | { id: number, conversation?: string, questions: Question[], from?: string, resolve: (answers: Answer[] | null) => void }} Decision
 */
/** @import { Question, Answer } from '../caps/ask/answers.js' */

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
  /** The conversations being answered, on screen or not, by path (D147). */
  running: signal(/** @type {string[]} */ ([])),
  /** @type {import('@preact/signals-core').Signal<{ code: string, message: string } | null>} */
  error: signal(null),
  presence: signal(/** @type {Presence} */ ('idle')),
  /** Light or dark: what the device shows (ui/app.js follows it), and the user's pick on this device; null is Auto. */
  deviceTheme: signal(/** @type {Theme} */ ('dark')),
  chosenTheme: signal(/** @type {Theme | null} */ (null)),
  /** The look on screen (D111), once its style sheet is in; settings hold the one chosen. */
  look: signal(/** @type {import('./looks.js').LookId} */ ('room')),
  /** @type {import('@preact/signals-core').Signal<'settings' | 'history' | 'find' | 'picker' | 'project' | 'skill' | null>} */
  dialog: signal(null),
  section: signal('general'),
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
  offering: signal(/** @type {{ id: string, conversation?: string, resolve: (yes: boolean) => void } | null} */ (null)),
  /** Follow-ups the reflexes picked from the catalogue, by the answer's turn. */
  actions: signal(/** @type {Record<string, string[]>} */ ({})),
  /** Capabilities the user turned on and policy's preUnlock, loaded at start. */
  ready: /** @type {Promise<unknown>} */ (Promise.resolve()),
  /** When the user was last here, if Jean opened after time away ("Since last time"); 0 otherwise. */
  back: signal(0),
}

// Answers citing their sources before Double-check is offered.
export const CITED = 3
// Opening Jean this long after it was last on screen is coming back after time away.
export const AWAY_MS = 8 * 3600_000
// Kept on the device, like its id: when Jean was last on screen here.
export const SEEN_KEY = 'app.seen'

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

/** Light or dark, kept on this device, or null: Auto, what the device shows. @param {Theme | null} next */
export function setTheme(next) {
  app.chosenTheme.value = next
  if (next) localStorage.setItem(THEME_KEY, next)
  else localStorage.removeItem(THEME_KEY)
}

/** Light to dark and back (⌘⇧L, D130): switching back to what the device shows is Auto again (D85). */
export function switchTheme() {
  const next = theme.value === 'light' ? 'dark' : 'light'
  setTheme(next === app.deviceTheme.value ? null : next)
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
    const [{ listModels }, { getSecret }] = await Promise.all([import('../core/llm.js'), import('./secrets.js')])
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
  // What is under way stops: its calls work in the room on screen.
  for (const run of runs.values()) halt(run)
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
  app.current.value = null
  app.error.value = null
  app.dialog.value = null
  showRun()
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
  const was = runs.get(path)
  let loaded = await loadConversation(app.fs, path)
  // Its answer ended while it was read: read all of it.
  if (was && !runs.has(path)) loaded = await loadConversation(app.fs, path)
  const run = runs.get(path)
  // What its answer kept so far shows as the live answer.
  const kept = new Set(run?.settled.map((record) => JSON.stringify(record)))
  app.error.value = null
  app.dialog.value = null
  if (loaded) app.current.value = { id: loaded.header.id, path, records: loaded.records.filter((record) => !kept.has(JSON.stringify(record))) }
  showRun()
}

/** @param {string} path */
export async function removeConversation(path) {
  halt(runs.get(path))
  await deleteConversation(app.fs, path)
  if (app.current.value?.path === path) {
    app.current.value = null
    showRun()
  }
  await refreshConversations()
}

/**
 * A conversation being answered, on screen or not (D147): `records` as sent, `turn` the answer so far, `settled` what of it is in the file.
 * @typedef {{ id: string, path: string, records: Envelope[], turn: Turn, settled: Envelope[], controller: AbortController }} Run
 */
/** @type {Map<string, Run>} by path */
const runs = new Map()

/**
 * The conversation a call works for, by its run's signal (D147); without one, the one on screen.
 * @param {AbortSignal} [signal] @returns {{ id: string, path: string, records: Envelope[], turn?: Turn } | null}
 */
export function conversationOf(signal) {
  for (const run of runs.values()) if (run.controller.signal === signal) return run
  return app.current.peek()
}

/** Stops the answer on screen. */
export const stop = () => halt(runs.get(app.current.peek()?.path ?? ''))

/** Stops a run. What it waits for (a card, a question, an offer) is declined, so it ends now. @param {Run | undefined} run */
function halt(run) {
  run?.controller.abort()
  if (run) decline(run.path)
}

/** Declines what waits for the user's answer in a conversation. @param {string} path */
function decline(path) {
  for (const decision of app.decisions.value) if (decision.conversation === path) 'toolCall' in decision ? decision.resolve('reject_once') : decision.resolve(null)
  if (app.offering.value?.conversation === path) app.offering.value.resolve(false)
}

/** The decisions waiting in the conversation on screen. */
export const decisionsHere = () => app.decisions.value.filter((decision) => decision.conversation === app.current.value?.path)

/** The box, the live answer and the presence follow the conversation on screen: its run's, if any. It has the box until it ends. */
function showRun() {
  const run = runs.get(app.current.peek()?.path ?? '')
  app.busy.value = Boolean(run)
  app.live.value = run ? { turn: run.turn } : null
  if (run) setPresence('thinking')
  else if (['thinking', 'answering'].includes(app.presence.peek())) setPresence('idle')
}

/** A run begins (send.js): kept by its path, and shown at once if its conversation is on screen. @param {Run} run */
export function beginRun(run) {
  runs.set(run.path, run)
  app.running.value = [...runs.keys()]
  if (app.current.peek()?.path !== run.path) return
  app.error.value = null
  showRun()
}

/** A run ends: what still waits for the user in its conversation is declined. @param {Run} run */
export function endRun(run) {
  runs.delete(run.path)
  app.running.value = [...runs.keys()]
  decline(run.path)
}

// ─── Files ───────────────────────────────────────────────────────────────────

/** Every file the brain may read in a conversation (a run's, by its signal): linked ones, then those about to be sent. @param {AbortSignal} [signal] */
export function currentFiles(signal) {
  const conversation = conversationOf(signal)
  const pending = conversation === app.current.peek() ? app.attachments.value.flatMap((item) => (item.link ? [item.link] : [])) : []
  return [...linkedFiles(conversation?.records ?? []), ...pending]
}

/** Opens a file in the preview (D126), never in a tab of Jean's own origin, where a page would run. @param {ResourceLink} link */
export function openFile(link) {
  return import('./preview.js').then((module) => module.preview(link))
}

/** @param {string} key */
export function removeAttachment(key) {
  app.attachments.value = app.attachments.value.filter((item) => item.key !== key)
}

// ─── Sending ─────────────────────────────────────────────────────────────────
// The prompt, the brain and the run are send.js, which loads when the user starts typing or
// sends, not with the first screen (D148).

const sending = () => import('./send.js')

/**
 * Sends a message, once a page being turned is: that frees the box.
 * @param {string} text @param {{ boost?: number, notes?: Envelope[] }} [options] as send.js takes them
 */
export async function send(text, options) {
  await turning
  return (await sending()).send(text, options)
}

/** Runs the brain again on the conversation on screen, up to its last user message. */
export const retry = async () => (await sending()).retry()

/** The user started typing, or a file is ready: the provider's cache may need writing again (D49). */
export const warm = async () => (await sending()).warm()

/** The body of one of Jean's Markdown files ('' when missing). @param {string} path */
export const readBody = async (path) => parseFrontMatter((await app.fs.read(path)) ?? '').body.trim()

/** Whether "Ask a smarter brain" can step up from an answer Auto chose. @param {ToolCallInfo | undefined} entry */
export function canStepUp(entry) {
  const { settings } = effective.value
  return settings.auto && cloudAllowed() && (entry?.rawInput?.auto?.level ?? 2) < 2 && settings.brains.some((brain) => !isLocal(brain))
}

/** Asks again, one level up. */
export function askSmarter() {
  send(t('auto.smarter.prompt'), { boost: 1 })
}

/** @param {unknown} error */
export function showError(error) {
  const err = /** @type {{ code?: string, message?: string }} */ (error ?? {})
  const code = err.code ?? 'unknown'
  const brain = activeBrain.value
  app.error.value = { code, message: t(`error.${code}`, { brain: brain ? brainLabel(brain) : BRAND.name, origin: location.origin }) }
  console.warn(error)
}
