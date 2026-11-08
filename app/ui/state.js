// Application state (signals) and the actions that change it.
import { signal, computed, batch } from '@preact/signals-core'
import { BRAND, PAGES } from '../brand.js'
import { DEFAULT_SETTINGS, saveSettings, applyPolicy, serviceURL, listProjects, parseFrontMatter, isLocal, usedIn } from '../core/settings.js'
import { loadConversation, listConversations, deleteConversation, appendRecords } from '../core/conversations.js'
import { linkedFiles, unanswered } from '../core/events.js'
import { t, locale, useLocale, LOCALES } from '../core/i18n.js'
import { LOOKS, lookId } from './looks.js'
import { contributions } from './caps.js'
import { mine } from './opfs.js'

/** @import { FS, BrainConfig, Envelope, ModelInfo, ToolCallInfo, ResourceLink } from '../core/types.js' */
/** @import { Turn } from '../core/events.js' */
/**
 * A file the user is about to send. `pages` holds its extracted text, page by page; `preview`
 * a picture's address while it waits.
 * @typedef {{ key: string, name: string, status: 'reading' | 'ready' | 'failed', link?: ResourceLink, pages?: string[], error?: string, preview?: string, progress?: number }} Attachment
 */
/** @import { Settings, Project } from '../core/settings.js' */
/** @typedef {'idle' | 'listening' | 'thinking' | 'answering' | 'done'} Presence */
/** @typedef {'light' | 'dark'} Theme */
/** @typedef {import('../core/loop.js').PermissionOption} PermissionOption */
/**
 * A decision waiting for the user, in the decision inbox: an approval, or questions from Jean or
 * one of its helpers (`from`, the part it works on; D146), in the conversation at `conversation` (D147).
 * task: whether For this task is offered. @typedef {{ id: number, conversation?: string, toolCall: ToolCallInfo, task?: boolean, resolve: (option: PermissionOption | 'allow_task') => void }
 *   | { id: number, conversation?: string, questions: Question[], from?: string, resolve: (answers: Answer[] | null) => void }} Decision
 */
/** @import { Question, Answer } from '../caps/ask/answers.js' */

export { LOCALES }

export const app = {
  fs: /** @type {FS} */ (/** @type {unknown} */ (null)),
  /** The whole FS, every profile's (D228), which only Profiles reaches; null where nothing is kept. */
  whole: /** @type {FS | null} */ (null),
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
  /** @type {import('@preact/signals-core').Signal<{ turn: Turn, steers?: string[] } | null>} steers: D365 */
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
  look: signal(/** @type {import('./looks.js').LookId} */ ('tilde')),
  /** The drawer kept open beside the conversation, or put away, as the user left it on this device; null until then (D165). */
  sidebar: signal(/** @type {boolean | null} */ (null)),
  /** The headings folded on this device: 'pinned', 'tasks', 'creations'. */
  folded: signal(/** @type {Set<string>} */ (new Set())),
  /** Whether the window is wide enough for the drawer to stay open beside the conversation. */
  wide: signal(false),
  /** @type {import('@preact/signals-core').Signal<'settings' | 'history' | 'find' | 'project' | 'skill' | 'first' | 'share' | 'profile' | null>} */
  dialog: signal(null),
  section: signal('general'),
  draft: signal(''),
  /** The decision inbox: approvals and questions, answered one by one while the work goes on. */
  decisions: signal(/** @type {Decision[]} */ ([])),
  /** @type {import('@preact/signals-core').Signal<ServiceWorker | null>} */
  updateReady: signal(null),
  /** @type {import('@preact/signals-core').Signal<{ message: string, action?: { label: string, run: () => void, undo?: true } | { alert: true }, seconds: number } | null>} */
  toast: signal(null),
  said: signal(''),
  /** Whether a pane is open (ui/dock.js), which takes the homepage's place as the main content. */
  docked: signal(false),
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
/** The brains of the room's project: those of every project, and those kept to this one (D194). */
export const brainsHere = computed(() => effective.value.settings.brains.filter((brain) => usedIn(brain, app.project.value.id)))
/** The brain chosen, while it is used here; or else the first that is. */
export const activeBrain = computed(() => brainsHere.value.find((brain) => brain.id === effective.value.settings.activeBrain) ?? brainsHere.value[0] ?? null)

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
export async function updateSettings(patch) { app.settings.value = { ...app.settings.value, ...patch }; await changeSettings(patch, true) }

/** settings.json as this tab last read or wrote it. @type {Partial<Settings>} */
let known = {}
/**
 * Writes settings.json one tab at a time, the patch over the file as it is, or reads it again. Only the fields another
 * tab changed since come in, so what this tab holds alone stays (a look being tried, a child's profile being set). A
 * patch already shown (updateSettings, setLook) is never put back once written: something newer may be on screen since.
 * A file that doesn't read as JSON is never written over, nor read as the defaults.
 * @param {Partial<Settings>} [patch] @param {boolean} [shown]
 */
export function changeSettings(patch, shown = false) {
  const run = async () => {
    let file; try { file = JSON.parse(await app.fs.read('settings.json') ?? '{}') } catch (error) { if (patch) throw error; return }
    const fresh = { ...DEFAULT_SETTINGS, ...file, ...patch }
    if (patch) await saveSettings(app.fs, fresh)
    const theirs = Object.fromEntries(Object.entries(fresh).filter(([key, value]) => (!shown || !patch || !(key in patch)) && JSON.stringify(value) !== JSON.stringify(known[/** @type {keyof Settings} */ (key)])))
    known = fresh
    app.settings.value = { ...app.settings.peek(), ...theirs }
  }
  return navigator.locks?.request(mine('app-settings'), run) ?? run()
}

/** @param {Presence} presence */
export function setPresence(presence) { app.presence.value = presence }

/**
 * @param {string} message @param {{ label: string, run: () => void, undo?: true } | { alert: true } | { quiet: true }} [action] e.g. Undo, which
 * says how long it lasts; alert: what went wrong; quiet: unseen @param {number} [ms] how long it shows, and longer while the keyboard is in it
 */
export function notify(message, action, ms = Math.max(action ? 6000 : 2600, message.length * 80)) {
  if (action && 'quiet' in action) return void (app.said.value = message, setTimeout(() => { app.said.value = '' }, ms))
  const toast = (app.toast.value = { message, action, seconds: Math.round(ms / 1000) })
  const end = () => { if (app.toast.value === toast) held() ? setTimeout(end, 1000) : (app.toast.value = null) }
  setTimeout(end, ms)
}
/** Whether a toast has the keyboard in it, which keeps it, and what it would undo (RGAA 11.12); a pointer resting where one shows would keep it for ever. */
export const held = () => Boolean(document.querySelector('.toast:focus-within'))

// ─── Language and rules ──────────────────────────────────────────────────────

/** The languages offered: policy's `locales`, or all. */
export const offeredLocales = () => /** @type {string[]} */ (app.policy.locales ?? LOCALES)

/** @param {string} lang */
export async function setLocale(lang) {
  // Kept first: on jean.is, the page under the first screen may follow it to another address (D397).
  await updateSettings({ locale: lang })
  await useLocale(lang)
}

/** @param {string} kind @param {import('../core/types.js').RuleValue} value */
export const setRule = (kind, value) => updateSettings({ rules: { ...app.settings.value.rules, [kind]: value } })

// The pick belongs to this device, like the device's own mode, so it lives in localStorage:
// index.html reads it before the first paint, and the room never flashes the other colour.
export const THEME_KEY = 'app.theme'

export const APPLE = /Mac|iPhone|iPad/.test(navigator.platform)
const MODIFIER = APPLE ? 'Meta' : 'Control'
/** For aria-keyshortcuts. */
export const SHORTCUTS = { settings: `${MODIFIER}+,`, new: `${MODIFIER}+Shift+O`, theme: `${MODIFIER}+Shift+D`, look: `${MODIFIER}+Shift+E`, language: `${MODIFIER}+Shift+L`, profile: `${MODIFIER}+Shift+P`, dictation: `${MODIFIER}+Shift+S`, live: `${MODIFIER}+Shift+H`, find: `${MODIFIER}+K`, browser: `${MODIFIER}+Shift+B`, terminal: `${MODIFIER}+J`, sidebar: `${MODIFIER}+B`, save: `${MODIFIER}+S`, share: `${MODIFIER}+Shift+U` }

/** Light or dark, kept on this device, or null: Auto, what the device shows. @param {Theme | null} next */
export function setTheme(next) {
  app.chosenTheme.value = next
  if (next) localStorage.setItem(mine(THEME_KEY), next)
  else localStorage.removeItem(mine(THEME_KEY))
}

/** Light to dark and back (⌘⇧D, D130, D238): switching back to what the device shows is Auto again (D85). */
export function switchTheme() {
  const next = theme.value === 'light' ? 'dark' : 'light'
  setTheme(next === app.deviceTheme.value ? null : next)
}

// The drawer open beside the conversation or put away (D165) belongs to this device too, as the
// user left it; until then, to the look: Tilde, Mail and Human keep it open once the room has a task (D369), the others put it away.
export const SIDEBAR_KEY = 'app.sidebar'

/** Whether the drawer is open beside the conversation now, on a wide window. */
export const sidebarOpen = computed(() => app.wide.value && (app.sidebar.value ?? (LOOKS[app.look.value].list === true && app.conversations.value.length > 0)))

/** The drawer open beside the conversation, or put away, from now on on this device. @param {boolean} open */
export function setSidebar(open) {
  app.sidebar.value = open
  localStorage.setItem(mine(SIDEBAR_KEY), open ? 'open' : 'closed')
}

// So are the headings folded.
export const FOLDED_KEY = 'app.folded'

/** A heading folded, or unfolded. @param {string} name */
export function fold(name) {
  const next = new Set(app.folded.value)
  if (!next.delete(name)) next.add(name)
  app.folded.value = next
  localStorage.setItem(mine(FOLDED_KEY), [...next].join(' '))
}

/** The header's button and ⌘B: the drawer beside the conversation on a wide window, over it on a narrow one. */
export function toggleSidebar() {
  if (!app.wide.value) return void (app.dialog.value = app.dialog.value === 'history' ? null : 'history')
  // Held: a first task arriving meanwhile would open it, and the press put it away.
  app.sidebar.value = sidebarOpen.value
  if (!document.startViewTransition) setSidebar(!sidebarOpen.value)
  // Beside the conversation, it slides (D234).
  else import('./slide.js').then(({ slide }) => slide())
}

/** The look chosen, of those offered. */
export const chosenLook = computed(() => lookId(effective.value.settings.look?.id, app.policy))

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
  lookWrite = setTimeout(() => changeSettings({ look: app.settings.peek().look }, true).catch(showError), later ? 500 : 0)
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
  const conversations = await listConversations(app.fs, project.dir)
  // In one step, once its conversations are read: the address and the box's draft go from the task
  // left to a new one there, never through a new one in the room left.
  batch(() => { newConversation(); app.project.value = project; app.conversations.value = conversations })
}

/** Before any task, in a browser's tab (not the desktop app, whose key the tab keeps). */
export const firstVisit = () => !app.conversations.value.length && !sessionStorage.getItem('app.host') && matchMedia('(display-mode: browser)').matches

/** A page of the brand's site in the app's language or English: beside the app there, the site's from its desktop app, else none. @param {keyof typeof PAGES} name */
export function sitePage(name) {
  const at = /** @type {Record<string, string>} */ (PAGES[name])[locale.value] ?? PAGES[name].en
  if (document.querySelector('body > .home')) return new URL(at, `${location.origin}/`).href
  return sessionStorage.getItem('app.host') && !document.querySelector('meta[name="app-policy"]') ? `https://${BRAND.domain}/${at}` : null
}

/** Privacy and terms: policy's or every copy's, French's in French. */
export const legalPages = () => /** @type {const} */ (['privacy', 'terms']).map((name) => [name, serviceURL(name, app.settings.value, app.policy)])
  .filter(([, url]) => url).map(([name, url]) => [name, url === name && locale.value === 'fr' ? `fr/${url}` : url])

/** What the assistant is called in this room: the name the project gave it, or Jean's. */
export const assistantName = () => String(app.project.value.data.assistantName || BRAND.name)

/** Whether this message may go to the cloud: the user's switch, and the project's. */
export const cloudAllowed = () => effective.value.settings.cloud && app.project.value.data.cloud !== false

// ─── Conversations ───────────────────────────────────────────────────────────

export async function refreshConversations() {
  app.conversations.value = await listConversations(app.fs, app.projectDir)
}

/** New tasks asked for: a message sent meanwhile is answered out of sight (send.js), a page in the welcome's place left (D497). */
export const newTasks = signal(0)
export function newConversation() {
  newTasks.value++
  app.current.value = null
  app.error.value = null
  app.dialog.value = null
  showRun()
}

/**
 * A page the user asked for, once the one asked for before it shows: a conversation read quickly
 * never shows before one asked for earlier, and a message sent meanwhile waits for it (D120). It
 * changes at once, with nothing over the page: the list stays at hand. Code that must not wait
 * changes the page directly.
 * @param {() => unknown} change
 */
export async function turnPage(change) {
  const changed = turning.then(change)
  turning = changed.catch(() => {})
  await changed
}
/** The page change under way, which a message and the next page wait for. @type {Promise<unknown>} */
let turning = Promise.resolve()

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
  if (loaded?.unread) import('./title.js').then((module) => module.markConversation(path, { unread: false }))
  // A question or an approval the page closed on is asked again (D212).
  if (loaded && !run && unanswered(loaded.records)) sending().then((module) => { if (app.current.peek()?.path === path) module.retry() })
}

/** @param {string} path */
export async function removeConversation(path) {
  halt(runs.get(path))
  if (!(await removing([{ task: path, all: true }], () => deleteConversation(app.fs, path)))) return
  if (app.current.value?.path === path) {
    app.current.value = null
    showRun()
  }
  await refreshConversations()
}

/**
 * Keeps records at the end of a conversation, and when `shown` in the one on screen if it is that one, then fires record with each, for whoever follows them (D299):
 * hooks that only watch, told once it is kept, so they never hold it up or change it. @param {string} path @param {Envelope[]} records
 */
export async function keepRecords(path, records, shown = false) {
  await appendRecords(app.fs, path, records)
  const current = app.current.peek()
  if (shown && current?.path === path) app.current.value = { ...current, records: [...current.records, ...records] }
  const hooks = contributions().hooks.filter((hook) => hook.on === 'record')
  if (hooks.length) import('../core/hooks.js').then(({ fire }) => { for (const record of records) fire(hooks, 'record', { task: path, type: record.update?.sessionUpdate ?? 'meta', record }, () => {}) })
}

/**
 * A conversation being answered, on screen or not (D147): `records` as sent, `turn` the answer so far, `settled` what of it is in the file.
 * @typedef {{ id: string, path: string, records: Envelope[], brain: BrainConfig, turn: Turn, settled: Envelope[], controller: AbortController, steers?: string[], held?: Envelope[] }} Run
 *   held: a look's, until it says something (D645)
 */
/** @type {Map<string, Run>} by path, which a task's pane reads (caps/split) as it writes */
export const runs = new Map(), stirred = signal(0)

/**
 * The conversation a call works for, by its run's signal (D147); without one, the one on screen.
 * @param {AbortSignal} [signal] @returns {{ id: string, path: string, records: Envelope[], brain?: BrainConfig, turn?: Turn, settled?: Envelope[] } | null}
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
export const decisionsHere = (path = app.current.value?.path) => app.decisions.value.filter((decision) => decision.conversation === path)

/** The box, the live answer and the presence follow the conversation on screen: its run's, if any. It has the box until it ends. */
export function showRun() {
  const run = runs.get(app.current.peek()?.path ?? '')
  const seen = run && !run.held
  app.busy.value = Boolean(run)
  app.live.value = seen ? { turn: run.turn, steers: run.steers } : null
  if (seen) setPresence('thinking')
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

/** Opens a file for a look (D126, D640), never in a tab of Jean's own origin, where a page would run, by its title; at where a citation points (D481). @param {ResourceLink} link @param {string} [at] */
export function openFile(link, at) {
  return Promise.all([import('./preview.js'), import('../core/files.js')]).then(([module, { fileTitle }]) => module.preview({ ...link, title: link.title ?? fileTitle(link.name), ...(at && { at }) }, true))
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
 * @param {string} text @param {Parameters<typeof import('./send.js').send>[1]} [options] as send.js takes them
 */
export async function send(text, options) {
  await turning
  return (await sending()).send(text, options)
}

/** Runs the brain again on the conversation on screen, up to its last user message. */
export const retry = async () => (await sending()).retry()

/** Goes back to a request, leaving out what came after it, and answers it again (D188). @param {number} upTo */
export const rewind = async (upTo) => (await sending()).rewind(upTo)

/** Duplicates the conversation up to a request into a new one, which answers it (D230). @param {number} upTo */
export const fork = async (upTo) => (await sending()).fork(upTo)

/** Records leave for good once the hooks on `remove` let them, `act` removing them; then `record` tells it (D412). @param {Parameters<typeof import('./send.js').removing>} args */
export const removing = async (...args) => (await sending()).removing(...args)

/** The box's words steer the task at work (D365). @param {string} text */
export const steer = async (text) => (await sending()).steer(text)

/** The user started typing, or a file is ready: the provider's cache may need writing again (D49). */
export const warm = async () => (await sending()).warm()

/** The body of one of Jean's Markdown files ('' when missing). @param {string} path */
export const readBody = async (path) => parseFrontMatter((await app.fs.read(path)) ?? '').body.trim()

/** Whether "Ask a smarter brain" can step up from an answer Auto chose. @param {ToolCallInfo | undefined} entry */
export function canStepUp(entry) {
  const { settings } = effective.value
  return settings.auto && cloudAllowed() && (entry?.rawInput?.auto?.level ?? 2) < 2 && brainsHere.value.some((brain) => !isLocal(brain))
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
