// Jean doing a task in Node, for npm run longtasks: core's loop (core/loop.js) with Jean's own capabilities, whose
// modules load as they are (made's write and edit, ask's questions, plan, compact), the room's modules (app/ui/) standing
// in for what only a page has; shared files read as Files reads them, and a folder worked on with the Folders tools as
// jean-cli runs them (cli/tools.js). A task runs as ui/send.js runs one: its frozen prompt and the user's message, blocks
// of 12 steps or 40 in a folder (D141, D364), what the user sends meanwhile read between steps (D365), Keep going pressed
// where it stopped. What a page alone does (Auto, the reflexes, titles, cards) isn't here.
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join as joinPath } from 'node:path'
import { signal } from '@preact/signals-core'
import { runTurn } from '../../app/core/loop.js'
import { streamChat, LLMError } from '../../app/core/llm.js'
import { appendRecords, createConversation, loadConversation } from '../../app/core/conversations.js'
import { applyUpdate, callsIn, envelope, filesMade, foldTurns, linkedFiles, userRecords } from '../../app/core/events.js'
import { buildSystemPrompt, frozenPrompt, promptRecord, promptState, toChatMessages } from '../../app/core/prompt.js'
import { addFile, documentPart, estimateMessages, estimateTokens, fileText, nextSource, pagesThatFit, preselect, readTool, sourceNumber } from '../../app/core/files.js'
import { resolveRule } from '../../app/core/rules.js'
import { languageName, setLoader } from '../../app/core/i18n.js'
import { BRAND } from '../../app/brand.js'
import { USE, topLevel, walkFolder } from '../../app/caps/folders/work.js'
import { extractPages } from '../../app/caps/files/extract.js'
import { start } from '../../app/caps/ask/answers.js'
import { nodeFS } from '../../cli/fs.js'
import { toolsFor } from '../../cli/tools.js'

/** @import { BrainConfig, Envelope, ResourceLink, ToolCallInfo, Usage } from '../../app/core/types.js' */
/** @import { Tool, PermissionOption } from '../../app/core/loop.js' */
/** @import { Question, Answer } from '../../app/caps/ask/answers.js' */
/** @import { Chosen } from '../../cli/brain.js' */
/** @typedef {Chosen & { body?: Record<string, unknown>, stream?: typeof streamChat }} Brain  body: JSON added to each request; stream: a brain of the tests' own */

// ─── The room, standing in ───────────────────────────────────────────────────
// A capability imports the room's modules (ui/caps.js, ui/state.js…): each loads here as a module of the same exports,
// whose values are this file's, or undefined for what a task never reaches.

const UI = new URL('../../app/ui/', import.meta.url).href
const OWN = Symbol.for('jean.longtasks.room')
/** @type {Record<string, Record<string, unknown>>} each module's exports, by its file */
const room = {}
Object.assign(globalThis, { [OWN]: room })

/** A module's export names. @param {string} source */
const exportsOf = (source) => [...new Set([
  ...[...source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/gm)].map((match) => match[1]),
  ...[...source.matchAll(/^export\s*\{([^}]*)\}/gm)].flatMap((match) => match[1].split(',').map((part) => part.trim().split(/\s+as\s+/).pop() ?? '').filter(Boolean)),
])]

registerHooks({
  load(url, context, next) {
    if (!url.startsWith(UI)) return next(url, context)
    const file = url.slice(UI.length).replace(/[?#].*$/, '')
    const lines = exportsOf(readFileSync(new URL(url), 'utf8')).map((name) => `export const ${name} = own.${name}`)
    return { format: 'module', shortCircuit: true, source: `const own = globalThis[Symbol.for('jean.longtasks.room')][${JSON.stringify(file)}] ?? {}\n${lines.join('\n')}\n` }
  },
})

/**
 * A run of a task, as ui/send.js keeps one: the records it was sent with, those it kept since, its live turn, and its
 * user, which the stand-ins find by the run's signal (conversationOf).
 * @typedef {{ path: string, records: Envelope[], settled: Envelope[], turn: import('../../app/core/events.js').Turn, controller: AbortController, user: User }} Run
 */
/** @type {Map<AbortSignal, Run>} */
const runs = new Map()
/** @type {Map<string, any>} capabilities that registered, by id */
const capabilities = new Map()
const app = { fs: /** @type {import('../../app/core/types.js').FS} */ (/** @type {unknown} */ (null)), projectDir: 'projects/longtasks', settings: signal({ brains: [] }), models: signal({}), policy: {},
  project: signal({ dir: 'projects/longtasks', data: {} }) }

Object.assign(room, {
  'caps.js': { register: (/** @type {any} */ cap) => capabilities.set(cap.id, cap), loaded: signal(new Map()), unlock: async () => false, isDenied: () => false, slots: () => [] },
  'base.js': { Element: class {}, define: () => {} },
  'sheet.js': { styleSheet: async () => {} },
  'icons.js': { icons: new Proxy({}, { get: () => '' }) },
  'menu-icons.js': { icon: () => '', icons: new Proxy({}, { get: () => '' }) },
  'markdown.js': { markdown: (/** @type {string} */ text) => text },
  'save.js': { save: async () => {} },
  // The project's look, which reads colours from a page's canvas (D601, D664): none here.
  'kit.js': { onPaper: async () => null, onScreen: async () => null, kits: signal(0) },
  'prices.js': { priceOf: () => null },
  'state.js': {
    app, theme: signal('light'), notify: () => {}, setRule: async () => {}, keepRecords: async () => {},
    conversationOf: (/** @type {AbortSignal | undefined} */ signal) => (signal ? runs.get(signal) : undefined),
    // Plans ask the user to confirm the first one of a request (D364), the rule left as it comes.
    effective: signal({ settings: { rules: {} }, locked: new Set() }),
  },
  'send.js': {
    askUser: async (/** @type {Question[]} */ questions, /** @type {string} */ _from, /** @type {AbortSignal} */ signal) => runs.get(signal)?.user.ask(questions) ?? null,
    keepGoing: async () => {},
  },
})

/** The capabilities a task can have, loaded once, with their words in English: the room's language, whatever the person's. */
let loading = /** @type {Promise<void> | null} */ (null)
const load = () => (loading ??= (async () => {
  setLoader(async (lang, part) => JSON.parse(await readFile(new URL(`../../app/locales/${part && `${part}/`}${lang}.json`, import.meta.url), 'utf8').catch(() => 'null')))
  for (const id of ['made', 'ask', 'plan', 'compact']) await import(`../../app/caps/${id}/${id}.js`)
})())

// ─── A task ──────────────────────────────────────────────────────────────────

/**
 * The person, as the task asks them: what they answer to Jean's questions and to its approvals (Ask me first), what they
 * send while it works (D365), once, after it took that many steps, and what they send once the answer is there.
 * @typedef {Object} User
 * @property {(questions: Question[]) => Promise<Answer[] | null>} ask
 * @property {(toolCall: ToolCallInfo) => Promise<PermissionOption>} approve
 * @property {{ after: number, text: string } | null} [steer]   while it works, read between steps
 * @property {string | null} [then]                           once it has answered: the same words, when they couldn't steer
 * @property {number} [done]                                  the brain steps done so far, which the task keeps up to date
 */

/**
 * @typedef {Object} Features  Jean's long-task features, each on or off
 * @property {boolean} plan      the plan tool, its rule, and a confirmed plan carrying the task on (D364)
 * @property {boolean} compact   summaries near the brain's window (D359, D363)
 * @property {number} keep       how many times the user presses Keep going where the task stopped at its limit
 */

/**
 * @typedef {Object} Task
 * @property {string} lang                 the person's, e.g. 'fr'
 * @property {string} request
 * @property {{ name: string, bytes: Uint8Array, pages?: string[] }[]} files  shared with the request, or the folder's
 * @property {'files' | 'folder'} where     shared in the message (12 steps), or a folder the task works in (40)
 * @property {Features} features
 * @property {number} window               the brain's window, in tokens: past it a request fails as too long, as a
 *   provider says it; 0 for none
 * @property {number} [steps]              its block of steps, if not 12 or 40
 * @property {number} [most]               the brain steps after which the eval stops it, whatever carries it on (60)
 * @property {Record<string, import('../../app/core/types.js').RuleValue>} [rules]  the person's (Ask me first)
 * @property {User} user
 */

/**
 * @typedef {Object} Outcome
 * @property {string} path                 the conversation's file, under the run's folder
 * @property {Envelope[]} records
 * @property {{ name: string, bytes: Uint8Array }[]} made  each file Jean made, its last version, and in a folder those it made or changed there
 * @property {{ after: number, stopped: boolean, plan: boolean, made: { name: string, bytes: Uint8Array }[] }[]} blocks  each run of the
 *   loop: the step it went on after (-1 for the first), whether it stopped at its limit, whether a plan carried it past
 *   one, and the files made by its end
 * @property {{ requests: number, inputTokens: number, outputTokens: number, ms: number }} spent
 * @property {boolean} [capped]            stopped at the eval's cap of brain steps, still going
 * @property {string} [error]              what stopped it, when it failed
 */

/** Files' share of the brain's window, and the window assumed for one that isn't said, as ui/send.js. */
const SHARE = 0.25
const DEVICE = 32768
const ASSUMED = 128000
const MAX_TOKENS = 8192

/** The ids of the capabilities a task has. @param {Features} features */
const capsOf = (features) => ['ask', 'made', ...(features.plan ? ['plan'] : []), ...(features.compact ? ['compact'] : [])]

/**
 * Runs a task to its end: its blocks of steps, what the user steers or sends after, Keep going as often as they press it.
 * @param {Brain} chosen @param {Task} task @param {string} dir the run's own folder, emptied first
 * @returns {Promise<Outcome>}
 */
export async function runTask(chosen, task, dir) {
  await load()
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  app.fs ??= nodeFS(joinPath(dir, '..', '.jean'))
  const window = task.window || ASSUMED
  const spent = { requests: 0, inputTokens: 0, outputTokens: 0, ms: 0 }
  const started = Date.now()
  const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: 'longtasks' })
  const steps = task.steps ?? (task.where === 'folder' ? 40 : 12)

  // A folder of the person's: the files as they are, worked on where they are.
  const folder = joinPath(dir, 'folder')
  const conversation = { records: /** @type {Envelope[]} */ ([]), settled: /** @type {Envelope[]} */ ([]) }
  /** @type {Tool[]} */
  let extra = []
  /** @type {import('../../app/core/prompt.js').Sections} */
  const sections = {}
  /** @type {ResourceLink[]} */
  let links = []
  if (task.where === 'folder') {
    const disk = nodeFS(folder, { swap: false })
    for (const file of task.files) await disk.writeBytes(file.name, file.bytes)
    const kit = await toolsFor(/** @type {any} */ ({ jean: app.fs, dir: app.projectDir, home: true, cwd: folder, path, folder: disk, buffers: disk, terminal: null, show: () => {},
      records: () => [...conversation.records, ...conversation.settled], always: new Set(), trust: async () => {} }), [])
    // Its tools, declared, as jean-cli declares them; the page finds them by the names <folder> gives (D141).
    extra = kit.tools.filter((tool) => ['list', 'find_in_files', 'open', 'change'].includes(tool.spec.name))
    // As caps/folders/folders.js words the section.
    sections.folder = [`The user's folder "folder" is open in this conversation, on their computer.`, `Its top level:\n${await topLevel(disk)}`, USE].join('\n')
  } else {
    extra = [readTool({ fs: app.fs, projectDir: () => app.projectDir, files: (signal) => linkedFiles(signal ? [...runs.get(signal)?.records ?? [], ...runs.get(signal)?.settled ?? []] : []) })]
    links = await shared(task.files, window, task.request)
  }

  // The frozen prompt, as ui/send.js's prepare writes it: the capabilities' lines and rules, then the message.
  const caps = capsOf(task.features).map((id) => capabilities.get(id))
  const tools = [...caps.flatMap((cap) => cap.tools ?? []), ...extra]
  const lines = [...caps.flatMap((cap) => cap.lines ?? []), ...(task.where === 'files' ? [{ name: 'read', line: 'read pages of a file' }] : [])]
  const rules = [...caps.flatMap((cap) => cap.rules ?? []), ...(task.where === 'files' ? ['Shared files are in the message, sometimes only some pages. Use read for the others.'] : [])]
  const hooks = caps.flatMap((cap) => (cap.hooks ?? []).map((/** @type {any} */ hook) => ({ ...hook, by: cap.id })))
  const language = languageName(task.lang, 'en')
  const state = promptState({ language, tools: tools.map((tool) => tool.spec.name), sections })
  const system = buildSystemPrompt({ assistantName: BRAND.name, uiLanguage: language, tools: lines, rules, sections, now: new Date() })
  let records = [promptRecord('longtasks', system, state), ...userRecords(task.request, links, 'longtasks')]
  await appendRecords(app.fs, path, records)

  // What Jean made: the files written under its answers, and in a folder those it made or changed there too.
  const madeNow = async (/** @type {Envelope[]} */ kept) => [...(task.where === 'folder' ? await changed(folder, task.files) : []), ...await madeFiles(kept)]
  const most = task.most ?? 60
  const stream = brainStream(chosen, task.window, spent, () => done >= most)
  /** @type {Outcome['blocks']} */
  const blocks = []
  let [pressed, steered, error, done] = [0, false, '', 0]
  /** @type {number | undefined} */
  let after
  try {
    for (;;) {
      conversation.records = records
      const run = /** @type {Run} */ ({ path, records, settled: conversation.settled = [], turn: fresh(), controller: new AbortController(), user: task.user })
      runs.set(run.controller.signal, run)
      /** @type {Envelope[]} */
      const all = []
      const plan = { carried: false }
      try {
        const ended = await runTurn({
          brain: chosen.brain, apiKey: chosen.apiKey, system, label: chosen.brain.model,
          history: await messagesOf(records, after),
          resume: after === undefined ? null : { step: after, calls: [] },
          tools, declared: state.tools, firstSource: nextSource(records),
          maxSteps: (after ?? -1) + 1 + steps,
          window: task.features.compact ? window : undefined,
          usage: lastUsage(records),
          signal: run.controller.signal,
          hooks: () => hooks.map((hook) => (hook.on === 'turn.limit' ? { ...hook, run: async (/** @type {any} */ e, /** @type {any} */ next) => (plan.carried = await hook.run(e, next)) } : hook)),
          about: { task: path, notes: [] },
          rule: (kind, reserved) => resolveRule(kind, { user: task.rules ?? {}, reserved }),
          askPermission: (request) => task.user.approve(request.toolCall),
          onUpdate: (update, step) => {
            applyUpdate(run.turn, update, step)
            if (update.sessionUpdate === 'tool_call_update' && update.status === 'completed' && update.toolCallId.startsWith('brain-') && !update._meta?.compact) task.user.done = ++done
          },
          persist: async (kept) => {
            all.push(...kept)
            await appendRecords(app.fs, path, kept)
            if (!kept.some(({ update }) => update?.sessionUpdate === 'user_message_chunk')) return void run.settled.push(...kept)
            ;[run.records, run.settled, run.turn] = [[...run.records, ...run.settled, ...kept], [], fresh()]
            ;[conversation.records, conversation.settled] = [run.records, run.settled]
          },
          // The person's change of mind, read between steps once that many are done (D365).
          steer: () => {
            const steer = task.user.steer
            if (steered || !steer || done < steer.after || !all.length) return []
            steered = true
            return [envelope('longtasks', { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: steer.text }, _meta: { steer: true } })]
          },
          stream,
        })
        records = /** @type {NonNullable<Awaited<ReturnType<typeof loadConversation>>>} */ (await loadConversation(app.fs, path)).records
        blocks.push({ after: after ?? -1, stopped: ended.stopReason === 'max_steps', plan: plan.carried, made: await madeNow(records) })
      } finally {
        runs.delete(run.controller.signal)
      }
      const last = blocks.at(-1)
      // What they couldn't say while it worked, or a steer not read before the last step answered, is their next request (D365).
      const left = steered ? null : task.user.then ?? task.user.steer?.text
      if (left) {
        steered = true
        const added = userRecords(left, [], 'longtasks')
        await appendRecords(app.fs, path, added)
        records = [...records, ...added]
        after = undefined
        continue
      }
      if (!last?.stopped || pressed >= task.features.keep) break
      pressed++
      after = foldTurns(records).at(-1)?.steps.at(-1)?.index
    }
  } catch (failure) {
    if (done < most) error = failure instanceof Error ? failure.message : String(failure)
    records = (await loadConversation(app.fs, path))?.records ?? records
    // The block it stopped in, with what it made by then.
    blocks.push({ after: after ?? -1, stopped: false, plan: false, made: await madeNow(records) })
  }
  spent.ms = Date.now() - started
  const made = await madeNow(records)
  return { path, records, made, blocks, spent, ...(done >= most && { capped: true }), ...(error && { error }) }
}

/** @returns {import('../../app/core/events.js').Turn} */
const fresh = () => ({ user: null, notes: [], steps: [], at: new Date().toISOString() })

/**
 * What the brain reads, as ui/send.js gives it: the records as messages, each shared file's pages in its message; the
 * whole conversation when it goes on where it stopped (Keep going).
 * @param {Envelope[]} records @param {number | undefined} after
 */
async function messagesOf(records, after) {
  /** @type {Map<string, string | null>} */
  const texts = new Map()
  for (const link of linkedFiles(records)) if (!texts.has(link.uri)) texts.set(link.uri, await fileText(app.fs, app.projectDir, link.uri))
  const resume = after === undefined ? null : { step: after, calls: [] }
  const messages = toChatMessages(records, (link) => documentPart(link, texts.get(link.uri) ?? null), resume)
  return resume ? messages : messages.slice(0, messages.findLastIndex((message) => message.role === 'user') + 1)
}

/** What the brain last read and wrote, unless a summary came since (D359). @param {Envelope[]} records @returns {Usage | undefined} */
function lastUsage(records) {
  const before = records.findLast(({ update }) => update?.sessionUpdate === 'compaction_update' || (update?.sessionUpdate === 'tool_call' && !update.name && !update._meta?.parent && update.rawOutput?.usage))?.update
  return before?.sessionUpdate === 'tool_call' ? before.rawOutput.usage : undefined
}

/**
 * The files shared with the message: kept in the project's files as Files keeps them, each with the pages that fit its
 * share of the window, or for a brain of 32k or less those that match the message, as ui/send.js's attachedLinks.
 * @param {Task['files']} files @param {number} window @param {string} text @returns {Promise<ResourceLink[]>}
 */
async function shared(files, window, text) {
  const small = window <= DEVICE
  let budget = window * SHARE
  /** @type {ResourceLink[]} */
  const links = []
  for (const file of files) {
    const pages = file.pages ?? (await extractPages(file.name, file.bytes)) ?? []
    const link = await addFile(app.fs, { projectDir: app.projectDir, name: file.name, mimeType: mimeOf(file.name), bytes: file.bytes, pages, by: 'longtasks' })
    const chosen = small ? preselect(pages, text, Math.max(budget, 1)) : [pagesThatFit(pages, Math.max(budget, 1))]
    budget -= chosen.reduce((sum, [first, last]) => sum + pages.slice(first - 1, last).reduce((n, page) => n + estimateTokens(page), 0), 0)
    const whole = chosen.length === 1 && chosen[0][1] >= pages.length
    links.push({ ...link, _meta: { ...(!whole && { pages: chosen, of: pages.length }), source: sourceNumber(links, link) } })
  }
  return links
}

/** @param {string} name */
const mimeOf = (name) => ({
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown',
})[/** @type {'docx'} */ (name.toLowerCase().split('.').pop())] ?? 'application/octet-stream'

/** The last version of each file Jean made in the conversation. @param {Envelope[]} records */
async function madeFiles(records) {
  const latest = new Map(filesMade(callsIn(records)).map((file) => [file.name, file]))
  const out = []
  for (const file of latest.values()) {
    const bytes = await app.fs.readBytes(`${app.projectDir}/${file.uri}`)
    if (bytes) out.push({ name: file.name, bytes })
  }
  return out
}

/** The folder's files Jean made or changed. @param {string} folder @param {Task['files']} before */
async function changed(folder, before) {
  const disk = nodeFS(folder, { swap: false })
  const was = new Map(before.map((file) => [file.name, file.bytes]))
  const out = []
  for (const entry of (await walkFolder(disk)).entries) {
    if (entry.kind !== 'file') continue
    const bytes = await disk.readBytes(entry.path)
    const old = was.get(entry.path)
    if (bytes && !(old && Buffer.from(old).equals(Buffer.from(bytes)))) out.push({ name: entry.path, bytes })
  }
  return out
}

/**
 * The brain, through core's adapters, as a brain of `window` tokens would answer: a request past it fails as too long,
 * as its provider says it, by the provider's own count where it gives one (D359). Each request is counted; none goes
 * once the task is past the eval's cap. @param {Brain} chosen @param {number} window @param {Outcome['spent']} spent @param {() => boolean} capped
 * @returns {typeof streamChat}
 */
function brainStream({ body, stream = streamChat }, window, spent, capped) {
  /** @type {typeof fetch} */
  const send = (url, init) => globalThis.fetch(url, body && typeof init?.body === 'string' ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...body }) } : init)
  return async function* (options) {
    if (capped()) throw new LLMError('Stopped at the eval\'s cap of steps', { code: 'aborted' })
    spent.requests++
    const events = []
    for await (const event of stream({ ...options, maxTokens: MAX_TOKENS, fetch: send })) {
      if (event.type === 'done') {
        spent.inputTokens += event.usage?.inputTokens ?? 0
        spent.outputTokens += event.usage?.outputTokens ?? 0
        const read = event.usage?.inputTokens || estimateMessages([options.system, options.tools, options.messages])
        if (window && read > window) throw new LLMError(`The brain read ${read} tokens, past its window of ${window}`, { code: 'too_long' })
      }
      events.push(event)
    }
    yield* events
  }
}

// ─── People ──────────────────────────────────────────────────────────────────

/** Someone who takes each recommended answer, allows what Jean asks to do, and confirms its plan, as offers' user does. @type {User} */
export const willing = {
  ask: async (questions) => questions.map(start),
  approve: async () => 'allow_once',
}

/** A file's text as Jean reads it, for those who grade it. @param {{ name: string, bytes: Uint8Array }} file */
export async function textOf(file) {
  const pages = await extractPages(file.name, file.bytes).catch(() => null)
  return pages ? pages.join('\n\n') : `(${file.name}: ${file.bytes.length} bytes Jean can't read as text)`
}
