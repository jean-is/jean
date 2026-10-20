// Sending a message and answering it: the prompt and the notes since (D46), what the brain reads of
// the files shared, Auto's choice of a brain, the run with its approvals, and the provider's cache
// kept warm (D49). Loaded when the user starts typing or sends, not with the first screen (D148):
// state.js's send, retry, rewind, fork and warm load it, and so do editing a request (ui/edit.js, D312) and a
// routine's run out of sight (D317).
import { effect } from '@preact/signals-core'
import { isLocal } from '../core/settings.js'
import { createConversation, rewriteRecords, loadConversation } from '../core/conversations.js'
import { envelope, userRecords, applyUpdate, titleOf, linkedFiles, foldTurns, isPicture, unanswered, routineOf, filesMade, callsIn } from '../core/events.js'
import { buildSystemPrompt, promptState, promptRecord, frozenPrompt, changeNotes, toChatMessages } from '../core/prompt.js'
import { resolveRule, ruleFromPermission, guardHooks } from '../core/rules.js'
import { yes } from './yes.js'
import { fire } from '../core/hooks.js'
import { removal } from './removal.js'
import { t, locale, languageName } from '../core/i18n.js'
import { fileText, documentPart, pagesThatFit, preselect, estimateTokens, estimateMessages, sourceNumber, nextSource } from '../core/files.js'
import { getSecret } from './secrets.js'
import { unlock, contributions, slots } from './caps.js'
import {
  app, effective, activeBrain, brainsHere, brainLabel, assistantName, cloudAllowed, currentFiles, conversationOf, readBody, loadModels,
  notify, setPresence, setRule, showError, updateSettings, refreshConversations, sidebarOpen, openConversation, turnPage, beginRun, endRun, stop, CITED, keepRecords,
} from './state.js'

/** @import { BrainConfig, Envelope, ToolCallInfo, ResourceLink } from '../core/types.js' */
/** @import { Decision, PermissionOption, Run } from './state.js' */
/** @import { Question, Answer } from '../caps/ask/answers.js' */

// A shared file's share of the brain's context (see docs/architecture.md#retrieval-and-extraction).
const DOCUMENT_SHARE = 0.25
const DEVICE_CONTEXT = 32768
const DEFAULT_CONTEXT = 128000
// Anthropic's default cache lifetime is 5 minutes (D49).
const CACHE_TTL_MS = 5 * 60_000
// A turn's block of steps, and in a folder, where work takes more (D141), before it stops or a moving plan goes on (D364).
const STEPS = 12
const FOLDER_STEPS = 40
// Local servers whose window is asked of them, the smallest Ollama gives being 4,096 (D359).
const SERVERS = ['ollama', 'lmstudio']

// ─── Files ───────────────────────────────────────────────────────────────────

/** @type {Map<string, string | null>} uri → extracted text; files are named by content, so this never goes stale */
const texts = new Map()

/** @param {ResourceLink} link @param {string[]} pages */
export function rememberText(link, pages) {
  texts.set(link.uri, pages.map((page, i) => `[[page ${i + 1}]]\n${page}`).join('\n\n'))
}

/** @type {Map<string, { mimeType: string, data: string | undefined }>} uri → a picture as brains that can see take it, base64 */
const pictures = new Map()

/** What the brain reads for each linked file, and the pictures it sees if it can. @param {Envelope[]} records @param {BrainConfig} brain */
async function documents(records, brain) {
  const sees = seesPictures(brain)
  for (const link of linkedFiles(records)) {
    if (!texts.has(link.uri)) texts.set(link.uri, await fileText(app.fs, app.projectDir, link.uri))
    if (sees && isPicture(link) && !pictures.has(link.uri)) pictures.set(link.uri, await seen(link))
  }
  return (/** @type {ResourceLink} */ link) => {
    const picture = sees ? pictures.get(link.uri) : undefined
    return documentPart(picture ? { ...link, mimeType: picture.mimeType } : link, texts.get(link.uri) ?? null, picture?.data)
  }
}

/** A shared picture, kept as given, as brains see it: smaller when it is large (D324). @param {ResourceLink} link */
async function seen(link) {
  const bytes = await app.fs.readBytes(`${app.projectDir}/${link.uri}`)
  if (!bytes) return { mimeType: String(link.mimeType), data: undefined }
  const { seenBy } = await import('../caps/files/pictures.js')
  const picture = await seenBy(bytes, String(link.mimeType))
  return { mimeType: picture.mimeType, data: await base64(picture.bytes) }
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
function seesPictures(brain) {
  const input = app.models.value[brain.id]?.find((model) => model.id === brain.model)?.input
  return brain.api !== 'device' && (!input || input.includes('image'))
}

/** @param {BrainConfig} brain */
function contextTokens(brain) {
  if (brain.api === 'device') return DEVICE_CONTEXT
  return app.models.value[brain.id]?.find((model) => model.id === brain.model)?.contextLength ?? DEFAULT_CONTEXT
}

/**
 * Links for the files about to be sent. Each records which pages go into the context,
 * decided now against the brain's budget and then frozen (files.js): the first ones, or for a
 * brain of 32k or less, such as the device's, those that match the message (D55).
 * @param {BrainConfig} brain @param {Envelope[]} records @param {import('./state.js').Attachment[]} items @param {string} text
 */
function attachedLinks(brain, records, items, text) {
  const small = contextTokens(brain) <= DEVICE_CONTEXT
  let budget = contextTokens(brain) * DOCUMENT_SHARE
  /** @type {ResourceLink[]} */
  const links = []
  for (const item of items) {
    if (item.status !== 'ready' || !item.link || !item.pages) continue
    const pages = item.pages
    const chosen = small ? preselect(pages, text, Math.max(budget, 1)) : [pagesThatFit(pages, Math.max(budget, 1))]
    budget -= chosen.reduce((sum, [first, last]) => sum + pages.slice(first - 1, last).reduce((n, page) => n + estimateTokens(page), 0), 0)
    const whole = chosen.length === 1 && chosen[0][1] >= pages.length
    // The number the brain cites it by, kept if the same file was shared before.
    const source = sourceNumber([...linkedFiles(records), ...links], item.link)
    links.push({ ...item.link, _meta: { ...(!whole && { pages: chosen, of: pages.length }), source } })
  }
  return links
}

// ─── The decision inbox ──────────────────────────────────────────────────────

let decisionId = 0

/**
 * Queues a decision for the user and waits for the answer. Helpers keep working meanwhile,
 * so several can wait at once, each answered on its own.
 * @param {Partial<Decision>} decision @returns {Promise<any>}
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

/** Questions from Jean or a helper; null when the user doesn't answer. @param {Question[]} questions @param {string} [from] @param {AbortSignal} [signal] @returns {Promise<Answer[] | null>} */
export const askUser = (questions, from, signal) => queue({ questions, from, conversation: conversationOf(signal)?.path })

/** What an approval is kept to, when its tool keeps "Always allow" itself; or a guard's, which keeps asking (D295). */
const SCOPES = ['folder', 'site', 'projects', 'film', 'guard']

/**
 * An approval card. "Always allow" and "Never" set the rule, which the other cards of that kind then
 * follow. In the user's folder, "Always allow" holds for that folder only, which its tool keeps (D141);
 * for a site the computer reaches, for that site only (D162); for a meeting, for its projects only (D224);
 * for a film, for films (D251).
 * @param {ToolCallInfo} toolCall @param {string} conversation
 */
async function approve(toolCall, conversation) {
  const option = /** @type {PermissionOption} */ (await queue({ toolCall, conversation }))
  const scope = SCOPES.find((key) => toolCall._meta?.[key]) ?? ''
  if (scope && option === 'allow_always') {
    for (const other of app.decisions.value) if ('toolCall' in other && other.toolCall.name === toolCall.name && other.toolCall._meta?.[scope] === toolCall._meta?.[scope]) other.resolve('allow_once')
  }
  const rule = scope ? null : ruleFromPermission(option)
  if (rule && toolCall.kind) {
    await setRule(toolCall.kind, rule)
    for (const other of app.decisions.value) if ('toolCall' in other && other.toolCall.kind === toolCall.kind && !SCOPES.some((key) => other.toolCall._meta?.[key])) other.resolve(rule === 'allow' ? 'allow_once' : 'reject_once')
  }
  return option
}

// ─── Sending ─────────────────────────────────────────────────────────────────

/**
 * What the brain knows of the user and the room: the project, the instructions (the
 * organisation's, the user's, the project's), and what capabilities add (memory, skills) for the task.
 * @param {{ id: string, path: string, records: Envelope[] } | null} task null: one about to start on screen
 * @returns {Promise<import('../core/prompt.js').Sections>}
 */
async function context(task) {
  const { dir, data, body } = app.project.value
  const home = data.default === true
  const instructions = [app.policy.instructions, await readBody('instructions.md'), home ? '' : await readBody(`${dir}/instructions.md`)].filter(Boolean).join('\n\n')
  const added = await Promise.all(contributions().sections.map((section) => section(task)))
  // The project's name, then what the user calls its assistant there and how it should be.
  const project = [String(data.name), ...(data.assistantName ? [`The user calls you ${data.assistantName} here.`] : []), ...(body.trim() ? [`How to be: ${body.trim()}`] : [])].join('\n')
  return Object.assign({ ...(!home && { project }), ...(instructions && { instructions }) }, ...added)
}

/**
 * The records a message adds: the frozen prompt when the conversation has none yet, or
 * notes for what changed since (D46), any notes the message comes with, then the message itself.
 * @param {string} text @param {BrainConfig} brain @param {{ id: string, path: string, records: Envelope[] } | null} task the conversation it goes to, null for a new one on screen
 * @param {Envelope[]} [notes] @param {import('./state.js').Attachment[]} [items] the files it shares
 */
async function prepare(text, brain, task, notes = [], items = app.attachments.value) {
  const records = task?.records ?? []
  // Things Jean made comes with the first message, so a file can be made from the start (D119), and
  // so do questions, so the brain can ask from the start (D146), noting the user's name (D150), Jean's
  // own skills, which the brain may read before Skills is found (D406), and the receipt, so the browser's
  // record of what the page reached covers the first answer (D252), and pages, for their rule (D289);
  // each comes back at the next visit, so pages already written show again.
  await Promise.all([app.ready, unlock('made'), unlock('ask'), unlock('you'), unlock('own-skills'), unlock('receipt'), unlock('interactive')])
  const { tools, lines, rules } = contributions()
  // Connections' tools are deferred: found with find_tools, never declared upfront (D47); one the user turned off isn't either (D304).
  const names = tools.filter((tool) => !tool.hidden && !tool.deferred && !tool.off).map((tool) => tool.spec.name)
  const sections = await context(task)
  const now = promptState({ language: languageName(locale.value, 'en'), tools: names, sections })
  const frozen = frozenPrompt(records)
  const head = frozen
    ? changeNotes(frozen.state, now, sections, tools.filter((tool) => tool.off).map((tool) => tool.spec.name))
    : [promptRecord(app.deviceId, buildSystemPrompt({ assistantName: assistantName(), uiLanguage: now.language, tools: lines, rules, sections, now: new Date() }), now)]
  return [...head, ...notes, ...userRecords(text, attachedLinks(brain, records, items, text), app.deviceId)]
}

// ─── Auto ────────────────────────────────────────────────────────────────────

/** The highest level Auto used in a conversation: it never steps down within one. @param {Envelope[]} records */
const autoLevel = (records) => Math.max(0, ...records.map((record) => /** @type {any} */ (record.update)?.rawInput?.auto?.level ?? 0))

/** The most thinking asked of a brain in a conversation, by its index among `efforts`: Auto never asks for less within one (D414). @param {Envelope[]} records @param {readonly string[]} efforts */
const effortLevel = (records, efforts) => Math.max(-1, ...records.map((record) => efforts.indexOf(/** @type {any} */ (record.update)?.rawInput?.effort)))

/** The last answer's text, for "is the user unhappy with it?". @param {Envelope[]} records */
const lastAnswer = (records) => {
  const update = records.findLast((record) => record.update?.sessionUpdate === 'agent_message_chunk')?.update
  return update?.sessionUpdate === 'agent_message_chunk' ? update.content.text : undefined
}

/**
 * The brain for the next answer: the one the user picked, or Auto's choice from what the
 * reflexes make of the message (they also offer a capability when one would help). Auto
 * loads with the first message, not with the first screen (D140).
 * @param {string} text @param {Envelope[]} records @param {number} [boost] levels above the last one
 * @param {BrainConfig | 'auto'} [chosen] who answers whatever the box has: a routine's own brain, or Auto (D303)
 * @returns {Promise<{ brain: BrainConfig, meta?: Record<string, any>, signals: import('./auto.js').Signals } | null>}
 */
async function pickBrain(text, records, boost = 0, chosen) {
  const { settings } = effective.value
  const [{ sense }, { chooseBrain, chooseEffort, EFFORTS, TIERS }, { mayRead }] = await Promise.all([import('./discovery.js'), import('./auto.js'), import('../core/llm.js')])
  const signals = await sense(text, lastAnswer(records))
  // How much it thinks: the brain's own setting, or as much as the request demands, never less than before (D414).
  const floor = effortLevel(records, EFFORTS)
  const meta = (/** @type {BrainConfig} */ brain, /** @type {Record<string, any>} */ more = {}) => ({ ...more, effort: chooseEffort({ setting: brain.effort, signals: { ...signals, unhappy: signals.unhappy || boost > 0 }, floor }) })
  if (chosen !== 'auto' && (chosen || !settings.auto)) {
    const brain = chosen || activeBrain.value
    return brain && (cloudAllowed() || isLocal(brain)) ? { brain, meta: meta(brain), signals } : null
  }
  // A task that used Google's services, among the brains that may read it, if any; with none, the request says why (D440).
  const allowed = brainsHere.value.filter((brain) => mayRead(brain, records, app.policy))
  const brains = allowed.length ? allowed : brainsHere.value
  await Promise.all(brains.filter((brain) => !isLocal(brain)).map(loadModels))
  const choice = chooseBrain({
    brains,
    preferred: settings.activeBrain,
    cloud: cloudAllowed(),
    online: navigator.onLine,
    // A conversation with a picture needs a brain that can see it.
    signals: { ...signals, pictures: currentFiles().some(isPicture) },
    floor: Math.min(2, autoLevel(records) + boost),
    has: (brain, model) => (app.models.value[brain.id] ?? []).some((info) => info.id === model),
    sees: seesPictures,
    tiers: app.policy.tiers ?? TIERS,
  })
  return choice && { brain: choice.brain, meta: meta(choice.brain, { auto: { level: choice.level, reason: choice.reason } }), signals }
}

/**
 * Sends a message, once a page being turned is (state.js's send waits for it).
 * @param {string} text
 * @param {{ boost?: number, notes?: Envelope[], call?: { name: string, args: any }, files?: import('./state.js').Attachment[], brain?: BrainConfig | 'auto' }} [options] boost: Auto's levels above the last
 *   answer's; notes: what the brain is told just before the message ("Since last time"); call: the one call the turn is,
 *   whose result is the answer, with no brain before or after it (a flow run by hand or by a routine, D218); files: what it
 *   shares, if not the box's (the file that set a routine off, D294); brain: who answers, if not the box's choice (a routine's, D303)
 */
export async function send(text, { boost = 0, notes = [], call, files = app.attachments.value, brain: chosen } = {}) {
  if ((!text.trim() && !files.some((item) => item.status === 'ready')) || app.busy.value) return
  if (files.some((item) => item.status === 'reading')) return notify(t('files.stillReading'))
  if (!brainsHere.value.length) {
    app.draft.value = text
    import('../caps/first/first.js').then((module) => module.open())
    return
  }
  let current = app.current.value
  const from = current?.path
  app.busy.value = true
  setPresence('thinking')
  const picked = await pickBrain(text.trim(), current?.records ?? [], boost, chosen).finally(() => { app.busy.value = false })
  if (!picked) {
    setPresence('idle')
    notify(t('auto.noPrivate'))
    import('./picker.js').then((module) => module.openPicker())
    return
  }
  const { brain, meta, signals } = picked
  const named = await mentioned(text)
  // What the box's modes ask of it (Visual answers, D300), and what the reflexes read in it (a danger, D228), told just before it too.
  const modes = slots('modes').flatMap((mode) => mode.notes?.(current?.records ?? [], signals) ?? [])
  const added = await prepare(text.trim(), brain, current, [...notes, ...named, ...modes], files)
  app.draft.value = ''
  if (files === app.attachments.value) app.attachments.value = []
  if (!current) {
    const created = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    current = { id: created.id, path: created.path, records: [] }
    // What it keeps from the start, like the folder it starts on (D149).
    await fire(contributions().hooks, 'task.start', { task: created.path, id: created.id }, () => {})
  }
  await keepRecords(current.path, added)
  // Listed at once, to come back to; the room's first as the page turns below, the drawer it opens with it (D369).
  const first = !current.records.length && !app.conversations.value.length
  if (!current.records.length && !first) refreshConversations()
  const next = { ...current, records: [...current.records, ...added] }
  // Each file it shares may set a routine off (D294), unless this is a routine's own run.
  const routine = routineOf(next.records)?.routine
  for (const file of linkedFiles(added)) fire(contributions().hooks, 'file.add', { task: next.path, file, routine }, () => {})
  const show = async () => {
    if (first) await refreshConversations()
    // Drawn before the new view is captured, as when it slides (D234).
    if (first && sidebarOpen.peek()) await import('./inbox.js')
    app.current.value = next
  }
  // Unless the user went elsewhere meanwhile: then it is answered out of sight (D147).
  if (app.current.peek()?.path === from) {
    // The big welcome question morphs into the conversation title.
    if (!current.records.length && document.startViewTransition) await document.startViewTransition(show).updateCallbackDone
    else await show()
  } else if (first) refreshConversations()
  // The title is written alongside the answer (D112).
  if (!titleOf(next.records)) import('./title.js').then(({ nameConversation }) => nameConversation(next.path, next.records, brain))
  await runAgent(next, brain, meta, call)
}

/** What / and @ named in a message, told just before it (D199). @param {string} text @returns {Promise<Envelope[]>} */
const mentioned = async (text) => (/(?:^|\s)[/@]\S/u.test(text) ? import('./complete.js').then((module) => module.pointed(text)).catch((error) => (console.warn(error), [])) : [])

/**
 * Sends a request in a task of its own, out of sight (D147), the page, the box and its files as they are: a routine's run
 * while the user is busy (D317). The task starts on its project's folder, never one chosen on screen, and without the
 * box's modes. @param {string} text @param {{ notes?: Envelope[], call?: { name: string, args: any }, files?: import('./state.js').Attachment[], brain?: BrainConfig | 'auto' }} [options] as send()'s
 */
export async function sendAside(text, { notes = [], call, files = [], brain: chosen } = {}) {
  const picked = await pickBrain(text, [], 0, chosen)
  if (!picked) return notify(t('auto.noPrivate'))
  const created = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
  await fire(contributions().hooks, 'task.start', { task: created.path, id: created.id, aside: true }, () => {})
  const task = { id: created.id, path: created.path, records: /** @type {Envelope[]} */ ([]) }
  task.records = await prepare(text, picked.brain, task, [...notes, ...await mentioned(text)], files)
  await keepRecords(task.path, task.records)
  refreshConversations()
  for (const file of linkedFiles(task.records)) fire(contributions().hooks, 'file.add', { task: task.path, file, routine: routineOf(task.records)?.routine }, () => {})
  import('./title.js').then(({ nameConversation }) => nameConversation(task.path, task.records, picked.brain))
  await runAgent(task, picked.brain, picked.meta, call)
}

/** Run the agent on the current conversation, up to its last user message. @param {string} [text] its words, for Auto */
export async function retry(text = '') {
  const current = app.current.value
  if (!current || app.busy.value) return
  const picked = await pickBrain(text, current.records)
  if (picked) await runAgent(current, picked.brain, picked.meta)
}

/**
 * Records leave for good once the hooks on `remove` let them (D412): a task's, all of them as it or its project goes, or those
 * asking a request again leaves out (D188); or a profile, whose tasks this one can't read. A hook may keep them first, or refuse,
 * which a toast says; `act` removes them, and only then does `record` tell whoever follows the records.
 * @param {Parameters<typeof removal>[1]} removals @param {() => Promise<unknown>} act @returns {Promise<boolean>} whether they went
 */
export async function removing(removals, act) {
  const refuse = await removal(contributions().hooks, removals, act, async (task) => (await loadConversation(app.fs, task).catch(() => null))?.records ?? [])
  if (refuse) notify(refuse)
  return !refuse
}

/**
 * Goes back to a request: what came after it is gone from the conversation, but its title and pin, and the
 * request is answered again (D188); edited, it is asked now in its new words (D312).
 * @param {number} upTo how many records lead up to its end @param {string} [text] its new words
 */
export async function rewind(upTo, text) {
  // An answer being written to a later request stops, and ends, before anything is left out.
  const path = app.current.value?.path
  stop()
  await new Promise((resolve) => { const done = effect(() => { if (!app.running.value.includes(path ?? '')) queueMicrotask(() => resolve(done())) }) })
  const current = app.current.value
  if (!current || current.path !== path || app.busy.value) return
  // Edited, its words go too, with its files, which come just before them (a request before ends with its own words),
  // and so does its note of what / and @ named (D199), unless the new words name all it did.
  const from = text === undefined ? upTo : current.records.slice(0, upTo - 1).findLastIndex(({ update }) => update?.sessionUpdate !== 'user_message_chunk' || update.content.type !== 'resource_link') + 1
  const start = current.records.slice(0, from).findLastIndex((record) => record.update && record.update.sessionUpdate !== '_system_note') + 1
  const told = current.records.slice(start, from).find(({ update }) => update?.sessionUpdate === '_system_note' && update.data.kind === 'mentions')
  const words = /** @type {string[]} */ (/** @type {any} */ (told?.update)?.data.words ?? [])
  const kept = text === undefined || !told || (await import('./mentions.js')).holds(text, words).length === words.length
  const records = [...current.records.slice(0, from).filter((record) => kept || record !== told),
    ...current.records.slice(upTo).filter((record) => record.meta?.title || typeof record.meta?.pinned === 'boolean')]
  const left = current.records.filter((record) => !records.includes(record))
  if (!(await removing([{ task: current.path, records: left }], () => rewriteRecords(app.fs, current.path, records)))) return
  const named = text && /(?:^|\s)[/@]\S/u.test(text) ? await import('./complete.js').then((module) => module.pointed(text, kept ? words : [])) : []
  const added = text === undefined ? [] : [...named, ...userRecords(text, linkedFiles(current.records.slice(from, upTo)), app.deviceId)]
  await keepRecords(current.path, added)
  app.current.value = { ...current, records: [...records, ...added] }
  await retry(text)
}

/**
 * Duplicates the conversation up to the end of a request into a new one, which answers it; the
 * conversation stays as it is (D230). @param {number} upTo how many records lead up to its end
 */
export async function fork(upTo) {
  const current = app.current.value
  if (!current) return
  // What led up to the request keeps its times, and its title, which may have come after it; the request is asked now.
  const from = current.records.slice(0, upTo - 1).findLastIndex(({ update }) => update?.sessionUpdate !== 'user_message_chunk' || update.content.type !== 'resource_link') + 1
  const at = new Date().toISOString()
  const records = [...current.records.slice(0, from), ...current.records.slice(upTo).filter((record) => record.meta?.title),
    ...current.records.slice(from, upTo).map((record) => ({ ...record, at }))]
  const created = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
  await keepRecords(created.path, records)
  // What it keeps from the one it comes from, like its folder (D149).
  await fire(contributions().hooks, 'task.start', { task: created.path, id: created.id, from: current }, () => {})
  await turnPage(() => openConversation(created.path))
  refreshConversations()
  const picked = await pickBrain('', records)
  if (!picked) return
  if (!titleOf(records)) import('./title.js').then(({ nameConversation }) => nameConversation(created.path, records, picked.brain))
  await runAgent({ id: created.id, path: created.path, records }, picked.brain, picked.meta)
}

// ─── Steering (D365) ─────────────────────────────────────────────────────────

/** The answers being written, by their conversation's path, for what the user sends meanwhile. @type {Map<string, Run>} */
const working = new Map()

/** Shows a run's waiting steers under its live answer, when it is on screen. @param {Run} run */
const showSteers = (run) => app.current.peek()?.path === run.path && (app.live.value = { turn: run.turn, steers: run.steers })

/** What the user sends while the task on screen works steers it: its brain reads it before the next step; until then it waits under the live answer. @param {string} text */
export function steer(text) {
  const run = working.get(app.current.peek()?.path ?? '')
  if (!run) return void (app.draft.value = text)
  run.steers = [...run.steers ?? [], text]
  showSteers(run)
}

/** A steer taken back to the box before it was read. @param {number} i */
export function takeBack(i) {
  const run = working.get(app.current.peek()?.path ?? '')
  const text = run?.steers?.[i]
  if (!run || !text) return
  run.steers = run.steers?.filter((_, j) => j !== i)
  app.draft.value = [app.draft.peek().trim(), text].filter(Boolean).join('\n\n')
  showSteers(run)
}

/** Steers not read yet go back to the box. @param {string[]} texts */
const backToBox = (texts) => { app.draft.value = [app.draft.peek().trim(), ...texts].filter(Boolean).join('\n\n') }

// A reload puts what the task on screen hasn't read back in the box, whose words the tab keeps (ui/router.js).
addEventListener('pagehide', (event) => {
  const steers = working.get(app.current.peek()?.path ?? '')?.steers
  if (!event.persisted && steers?.length) backToBox(steers)
})

/**
 * Goes on with the task on screen where it stopped between steps, at its limit or when its page closed (D364): the next
 * block of steps, on the turn's own brain, whose thinking replays to the model that wrote it.
 */
export async function keepGoing() {
  const current = app.current.value
  if (!current || app.busy.value) return
  const step = foldTurns(current.records).at(-1)?.steps.at(-1)
  const { provider, model, auto, effort } = step?.tools.findLast((tool) => tool.kind === 'think' && !tool.name && !tool._meta?.parent && !tool._meta?.compact)?.rawInput ?? {}
  const own = brainsHere.value.find((brain) => brain.provider === provider && (cloudAllowed() || isLocal(brain)))
  const picked = own ? { brain: { ...own, model }, meta: { auto, effort } } : await pickBrain('', current.records)
  if (step && picked) await runAgent(current, picked.brain, picked.meta, undefined, step.index)
}

// ─── Answer now (D414) ───────────────────────────────────────────────────────

/** What tells the brain answering each task to answer now while it thinks, by the task's path. @type {Map<string, { now?: () => void }>} */
const hurries = new Map()

/** Tells the brain answering the task on screen to answer now, from what it thought so far. */
export const answerNow = () => hurries.get(app.current.peek()?.path ?? '')?.now?.()

/** The first time a brain is told to answer now, the user hears that how much each brain thinks can be set, unless policy keeps the brains. */
async function hurried() {
  const { settings, locked } = effective.value
  if (settings.hurried) return
  await updateSettings({ hurried: true })
  if (!locked.has('brains')) notify(t('thinking.found'), { label: t('settings.title'), run: () => import('./dialogs.js').then((dialogs) => dialogs.openSettings('brains')) })
}

/**
 * Answers a conversation up to its last user message, on screen or not (D147). @param {{ id: string, path: string, records: Envelope[] }} conversation
 * @param {BrainConfig} brain @param {Record<string, any>} [meta] why Auto chose it @param {{ name: string, args: any }} [call] the one call the turn is (D218)
 * @param {number} [after] the step it goes on after, with a block of steps more (Keep going, D364)
 */
async function runAgent(conversation, brain, meta, call, after) {
  /** @type {Run} */
  const run = { ...conversation, brain, turn: { user: null, notes: [], steps: [], at: new Date().toISOString() }, settled: [], controller: new AbortController() }
  const { path, records: sent } = run
  /** @type {Envelope[]} everything the run kept, steers' work included */
  const all = []
  const shown = () => app.current.peek()?.path === path
  let frame = 0
  const repaint = () => {
    frame ||= requestAnimationFrame(() => {
      frame = 0
      if (shown()) app.live.value = { turn: run.turn, steers: run.steers }
    })
  }

  let [stopped, failed] = [false, false]
  const hurry = /** @type {{ now?: () => void }} */ ({})
  hurries.set(path, hurry)
  working.set(path, run)
  beginRun(run)
  try {
    // The loop and the brains' adapters load with the first message, not with the first screen.
    const [{ runTurn }] = await Promise.all([import('../core/loop.js'), app.ready])
    const frozen = frozenPrompt(sent)
    // A turn the page closed on while it waited for the user goes on from there, asking again (D212); one that is a single call starts on it.
    const one = call && { id: `call-${Date.now().toString(36)}`, ...call }
    const resume = one ? { step: 0, calls: [one] } : after === undefined ? unanswered(sent) : { step: after, calls: [] }
    const messages = toChatMessages(sent, await documents(sent, brain), resume)
    // The device's brain answers its steps itself, through its turn.step hook.
    if (brain.api === 'device') await unlock('brain-local')
    // What the brain last read and wrote says how full its window is, unless a summary came since. Compaction comes in once
    // the conversation passes half of it (D359), as a request counted it or Jean estimates it, with what each call brings in.
    const window = contextTokens(brain)
    const before = sent.findLast(({ update }) => update?.sessionUpdate === 'compaction_update' || (update?.sessionUpdate === 'tool_call' && !update.name && !update._meta?.parent && update.rawOutput?.usage))?.update
    const usage = before?.sessionUpdate === 'tool_call' ? before.rawOutput.usage : undefined
    const counted = (/** @type {import('../core/types.js').Usage | undefined} */ used) => (used?.inputTokens ?? 0) + (used?.outputTokens ?? 0)
    let size = 0
    const grown = (/** @type {number} */ now) => (size = now) > (SERVERS.includes(brain.provider) ? 4096 : window) / 2 && unlock('compact')
    await grown(Math.max(estimateMessages([frozen?.system, messages]), counted(usage)))
    asked.set(path, Date.now())
    const { settings } = effective.value
    const ended = await runTurn({
      brain,
      apiKey: (await getSecret(app.fs, brain.id)) ?? undefined,
      system: frozen?.system ?? '',
      history: resume ? messages : messages.slice(0, messages.findLastIndex((message) => message.role === 'user') + 1),
      resume,
      // Every tool can be called from a script; the brain sees the declared ones (D47).
      tools: () => contributions().tools,
      declared: frozen?.state.tools ?? [],
      label: brainLabel(brain),
      meta,
      effort: meta?.effort,
      hurry,
      firstSource: nextSource(sent),
      maxSteps: one ? 1 : (after ?? -1) + 1 + (frozen?.state.sections?.folder ? FOLDER_STEPS : STEPS),
      window,
      usage,
      signal: run.controller.signal,
      // The organisation's guards and the person's (D295), then the capabilities' hooks, with the task and the kinds of
      // note its turn came with (a brief of what's new since last time only reads).
      hooks: () => [...guardHooks(app.policy.guards ?? [], 'policy', yes), ...guardHooks(app.settings.value.guards ?? [], 'user', yes), ...contributions().hooks],
      about: { task: path, notes: foldTurns(sent).at(-1)?.notes.map((note) => note.data.kind) ?? [] },
      rule: (kind, reserved) => resolveRule(kind, { user: settings.rules, policy: app.policy.rules, reserved }),
      askPermission: (request) => approve(request.toolCall, path),
      onUpdate: (update, step) => {
        if (update.sessionUpdate === 'agent_message_chunk' && shown()) setPresence('answering')
        if (update.sessionUpdate === 'tool_call_update' && update._meta?.hurried) hurried()
        if (update.sessionUpdate === 'tool_call_update' && update.status === 'completed' && !update._meta?.parent) grown(update.rawOutput?.usage ? counted(update.rawOutput.usage) : size + estimateMessages(update.rawOutput))
        applyUpdate(run.turn, update, step)
        repaint()
      },
      persist: async (records) => {
        all.push(...records)
        await keepRecords(path, records)
        if (!records.some(({ update }) => update?.sessionUpdate === 'user_message_chunk')) return void run.settled.push(...records)
        // A steer read: what came before it is the conversation's now, and the live answer starts again under it (D365).
        const before = [...run.settled, ...records]
        ;[run.records, run.settled, run.turn] = [[...run.records, ...before], [], { user: null, notes: [], steps: [], at: new Date().toISOString() }]
        const latest = app.current.peek()
        if (latest?.path !== path) return
        app.current.value = { ...latest, records: [...latest.records, ...before] }
        showSteers(run)
      },
      // What the user sent meanwhile, read before the next step as one message of theirs, never before anything of the answer,
      // where it would join the request's words (D365).
      steer: () => {
        const texts = all.length ? run.steers ?? [] : []
        if (!texts.length) return []
        run.steers = []
        return [envelope(app.deviceId, { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: texts.join('\n\n') }, _meta: { steer: true } })]
      },
    })
    stopped = ended.stopReason === 'max_steps'
    // What the one call gave for the user to read is the answer.
    const gave = one && all.findLast(({ update }) => update?.sessionUpdate === 'tool_call' && update.toolCallId === one.id)?.update
    const text = gave?.sessionUpdate === 'tool_call' && gave.status === 'completed' ? String(gave._meta?.answer ?? '').trim() : ''
    if (text) {
      const answer = envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }, 0)
      run.settled.push(answer)
      all.push(answer)
      await keepRecords(path, [answer])
    }
    if (shown()) setPresence('done')
  } catch (error) {
    failed = true
    if (shown()) {
      setPresence('idle')
      if (/** @type {any} */ (error)?.code !== 'aborted') showError(error)
    }
  } finally {
    cancelAnimationFrame(frame)
    working.delete(path)
    hurries.delete(path)
    endRun(run)
    // What was kept meanwhile, like the title, stays.
    const latest = app.current.peek()
    const records = [...(latest?.path === path ? latest.records : run.records), ...run.settled]
    if (shown()) {
      app.current.value = { ...conversation, records }
      app.busy.value = false
      app.live.value = null
    }
    const answer = lastAnswer(all)
    // An answer that came while the user was elsewhere waits for them, unread (D288), as does a task paused at its limit (D364); not one stopped, or deleted.
    if ((answer || stopped) && !shown() && !run.controller.signal.aborted) await (await import('./title.js')).markConversation(path, { unread: true }, 'jean')
    else await refreshConversations()
    setTimeout(() => app.presence.value === 'done' && setPresence('idle'), 1800)
    const at = foldTurns(records).at(-1)?.at
    if (answer && at) suggestActions(at, answer, records, conversation)
    if (at) fire(contributions().hooks, 'turn.end', { task: path, at, answer: answer ?? '', records, aborted: run.controller.signal.aborted, stopped,
      made: filesMade(callsIn(all)), routine: routineOf(records)?.routine,
      cites: Boolean(answer && /\[\d+(?:,\s*\d+)*\]/.test(answer) && nextSource(records) > 1) }, cited)
    // What the user sent as the last step answered is the next request, on screen or not; stopped or failed, it goes back to the box (D365).
    const left = run.steers ?? []
    if (left.length && (run.controller.signal.aborted || failed)) { if (shown()) backToBox(left) }
    else if (left.length && shown()) send(left.join('\n\n'))
    else if (left.length) {
      const added = await prepare(left.join('\n\n'), brain, { ...conversation, records }, [], [])
      await keepRecords(path, added)
      runAgent({ ...conversation, records: [...records, ...added] }, brain, meta)
    }
  }
}

/**
 * An answer that cites its sources: until Double-check is here to check it (its turn.end hook), citations
 * in regular use offer it (counted, an event with no language, D6). @param {{ cites: boolean }} turn
 */
async function cited({ cites }) {
  const count = effective.value.settings.cited ?? 0
  if (cites && count < CITED) await updateSettings({ cited: count + 1 })
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

// Escape stops the answer on screen, as Stop does, unless something else takes it first: a dialog, a menu,
// the box's / and @ menu, a pane with the keyboard, or a field of its own, as a request being edited (D315).
document.addEventListener('keydown', (event) => {
  const at = /** @type {Element} */ (event.target)
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || !app.busy.peek() || at.closest('.pane')
    || (at.matches(':read-write') && at.id !== 'prompt') || document.querySelector('dialog:modal, [popover]:not([popover=manual]):popover-open')) return
  event.preventDefault()
  stop()
})

// ─── Cache warming (D49) ─────────────────────────────────────────────────────

/** When a brain was last asked, by conversation ('' before one exists): one answered out of sight (D147) keeps only its own cache warm. */
const asked = new Map()

/**
 * Called when the user starts typing or a file is ready: if the provider's cache has
 * probably expired, write it now with the prefix the next message will share.
 */
export async function warm() {
  const brain = activeBrain.value
  const current = app.current.value
  if (brain?.api !== 'anthropic' || app.busy.value) return
  const records = current?.records ?? []
  const lastActivity = Math.max(asked.get(current?.path ?? '') ?? 0, Date.parse(records.at(-1)?.at ?? '') || 0)
  if (Date.now() - lastActivity < CACHE_TTL_MS - 30_000) return
  if (!records.length && !app.attachments.value.some((item) => item.status === 'ready')) return
  asked.set(current?.path ?? '', Date.now())
  try {
    const all = [...records, ...await prepare('', brain, current)]
    const frozen = frozenPrompt(all)
    const declared = frozen?.state.tools ?? []
    const tools = contributions().tools.filter((tool) => declared.includes(tool.spec.name)).map((tool) => tool.spec)
    const messages = toChatMessages(all, await documents(all, brain))
    const [{ warmCache }, { EFFORTS }] = await Promise.all([import('../core/llm.js'), import('./auto.js')])
    // How much it thinks is part of what the cache holds: the brain's own setting, or as much as Auto asked so far (D414).
    const effort = brain.effort ?? EFFORTS[effortLevel(records, EFFORTS)]
    await warmCache({ brain, apiKey: (await getSecret(app.fs, brain.id)) ?? undefined, system: frozen?.system, messages, tools, effort })
  } catch (error) {
    console.debug('Cache warm-up skipped', error)
  }
}
