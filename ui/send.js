// Sending a message and answering it: the prompt and the notes since (D46), what the brain reads of
// the files shared, Auto's choice of a brain, the run with its approvals, and the provider's cache
// kept warm (D49). Loaded when the user starts typing or sends, not with the first screen (D148):
// state.js's send, retry and warm load it.
import { isLocal } from '../core/settings.js'
import { createConversation, appendRecords } from '../core/conversations.js'
import { userRecords, toChatMessages, applyUpdate, titleOf, linkedFiles, foldTurns, isPicture } from '../core/events.js'
import { buildSystemPrompt, promptState, promptRecord, frozenPrompt, changeNotes } from '../core/prompt.js'
import { resolveRule, ruleFromPermission } from '../core/rules.js'
import { t, locale, languageName } from '../core/i18n.js'
import { fileText, documentPart, pagesThatFit, estimateTokens, sourceNumber } from '../core/files.js'
import { getSecret } from './secrets.js'
import { loaded, unlock, contributions } from './caps.js'
import {
  app, effective, activeBrain, brainLabel, assistantName, cloudAllowed, currentFiles, conversationOf, readBody, loadModels,
  notify, setPresence, setRule, showError, updateSettings, refreshConversations, beginRun, endRun, CITED,
} from './state.js'

/** @import { BrainConfig, Envelope, ToolCallInfo, ResourceLink } from '../core/types.js' */
/** @import { Decision, PermissionOption, Run } from './state.js' */
/** @import { Question, Answer } from '../caps/ask/answers.js' */

// A shared file's share of the brain's context (see docs/architecture.md#retrieval-and-extraction).
const DOCUMENT_SHARE = 0.25
const DEVICE_CONTEXT = 32768
const DEFAULT_CONTEXT = 128000
// What a read-only turn may do ("Since last time"): read, search, look things up, work things out.
const READING = new Set(['read', 'search', 'fetch', 'think', 'execute'])
// Anthropic's default cache lifetime is 5 minutes (D49).
const CACHE_TTL_MS = 5 * 60_000

// ─── Files ───────────────────────────────────────────────────────────────────

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

/** An approval card. "Always allow" and "Never" set the rule, which the other cards of that kind then follow. @param {ToolCallInfo} toolCall @param {string} conversation */
async function approve(toolCall, conversation) {
  const option = /** @type {PermissionOption} */ (await queue({ toolCall, conversation }))
  const rule = ruleFromPermission(option)
  if (rule && toolCall.kind) {
    await setRule(toolCall.kind, rule)
    for (const other of app.decisions.value) if ('toolCall' in other && other.toolCall.kind === toolCall.kind) other.resolve(rule === 'allow' ? 'allow_once' : 'reject_once')
  }
  return option
}

// ─── Sending ─────────────────────────────────────────────────────────────────

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
  // Things Jean made comes with the first message, so a file can be made from the start (D119), and
  // so do questions, so the brain can ask from the start (D146), and noting the user's name (D150).
  await Promise.all([app.ready, unlock('made'), unlock('ask'), unlock('you')])
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
 * reflexes make of the message (they also offer a capability when one would help). Auto
 * loads with the first message, not with the first screen (D140).
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
  const [{ chooseBrain, TIERS }] = await Promise.all([import('./auto.js'), ...settings.brains.filter((brain) => !isLocal(brain)).map(loadModels)])
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

/**
 * Sends a message, once a page being turned is (state.js's send waits for it).
 * @param {string} text
 * @param {{ boost?: number, notes?: Envelope[] }} [options] boost: Auto's levels above the last
 *   answer's; notes: what the brain is told just before the message ("Since last time")
 */
export async function send(text, { boost = 0, notes = [] } = {}) {
  const files = app.attachments.value
  if ((!text.trim() && !files.some((item) => item.status === 'ready')) || app.busy.value) return
  if (files.some((item) => item.status === 'reading')) return notify(t('files.stillReading'))
  if (!effective.value.settings.brains.length) {
    app.draft.value = text
    import('./dialogs.js').then((module) => module.openSettings('brains'))
    return
  }
  let current = app.current.value
  const from = current?.path
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
  // Listed at once, to come back to.
  if (!current.records.length) refreshConversations()
  const next = { ...current, records: [...current.records, ...added] }
  const show = () => { app.current.value = next }
  // Unless the user went elsewhere meanwhile: then it is answered out of sight (D147).
  if (app.current.peek()?.path === from) {
    // The big welcome question morphs into the conversation title.
    if (!current.records.length && document.startViewTransition) await document.startViewTransition(show).updateCallbackDone
    else show()
  }
  // The title is written alongside the answer (D112).
  if (!titleOf(next.records)) import('./title.js').then(({ nameConversation }) => nameConversation(next.path, next.records, brain))
  await runAgent(next, brain, meta)
}

/** Run the agent on the current conversation, up to its last user message. */
export async function retry() {
  const current = app.current.value
  if (!current || app.busy.value) return
  const picked = await pickBrain('', current.records)
  if (picked) await runAgent(current, picked.brain, picked.meta)
}

/** Answers a conversation up to its last user message, on screen or not (D147). @param {{ id: string, path: string, records: Envelope[] }} conversation @param {BrainConfig} brain @param {Record<string, any>} [meta] why Auto chose it */
async function runAgent(conversation, brain, meta) {
  /** @type {Run} */
  const run = { ...conversation, turn: { user: null, notes: [], steps: [], at: new Date().toISOString() }, settled: [], controller: new AbortController() }
  const { path, records: sent, turn, settled } = run
  const shown = () => app.current.peek()?.path === path
  let frame = 0
  const repaint = () => {
    frame ||= requestAnimationFrame(() => {
      frame = 0
      if (shown()) app.live.value = { turn }
    })
  }

  beginRun(run)
  try {
    // A brief of what's new since last time only reads, whatever the rules say.
    const readOnly = foldTurns(sent).at(-1)?.notes.some((note) => note.data.kind === 'since')
    // The loop and the brains' adapters load with the first message, not with the first screen.
    const [{ runTurn }] = await Promise.all([import('../core/loop.js'), app.ready])
    const frozen = frozenPrompt(sent)
    const messages = toChatMessages(sent, await documents(sent, brain))
    const lastUser = messages.findLastIndex((message) => message.role === 'user')
    if (brain.api === 'device') await unlock('brain-local')
    const stream = brain.api === 'device' ? loaded.value.get('brain-local')?.stream : undefined
    asked.set(path, Date.now())
    const { settings } = effective.value
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
      firstSource: nextSource(sent),
      signal: run.controller.signal,
      rule: (kind, reserved) => (readOnly && !READING.has(kind) ? 'never' : resolveRule(kind, { user: settings.rules, policy: app.policy.rules, reserved })),
      askPermission: (request) => approve(request.toolCall, path),
      onUpdate: (update, step) => {
        if (update.sessionUpdate === 'agent_message_chunk' && shown()) setPresence('answering')
        applyUpdate(turn, update, step)
        repaint()
      },
      persist: async (records) => {
        settled.push(...records)
        await appendRecords(app.fs, path, records)
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
    endRun(run)
    // What was kept meanwhile, like the title, stays.
    const latest = app.current.peek()
    const records = [...(latest?.path === path ? latest.records : sent), ...settled]
    if (shown()) {
      app.current.value = { ...conversation, records }
      app.busy.value = false
      app.live.value = null
    }
    await refreshConversations()
    setTimeout(() => app.presence.value === 'done' && setPresence('idle'), 1800)
    const answer = lastAnswer(settled)
    const at = foldTurns(records).at(-1)?.at
    if (answer && at) suggestActions(at, answer, records, conversation)
    if (answer && at && /\[\d+(?:,\s*\d+)*\]/.test(answer) && nextSource(records) > 1) cited(path, at, records)
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
