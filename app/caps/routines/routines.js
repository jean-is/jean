// Routines (docs/product.md, D122): a task the user wants done regularly, or once later, which
// Jean does on its own, on a schedule: a request it sends itself, in a conversation of its own, under the same
// rules as any (approvals wait in the inbox). There is no server: a routine runs while Jean is
// open, when it falls due, or as soon as Jean is opened after it fell due, and the times missed
// meanwhile make one run. It shows in the user's place when they aren't there (nothing under way
// or typed, and nobody reading), and otherwise runs out of sight (D147, D317). A routine runs in its project,
// when the room is there. The brain makes one with `schedule` when the user asks, on; Settings'
// Routines lists, turns off or on (D430), changes and deletes them, with their runs. A run comes with the last one as it
// went, and `routine_runs` reads the others. One may run each time a file is shared or made instead
// (D294), the file coming with its request, if it passes the routine's question: its hooks hear of
// each file, but never in a routine's own run, so a routine never sets another off.
import { effect } from '@preact/signals-core'
import { register, loaded, unlock } from '../../ui/caps.js'
import { app, brainsHere, newConversation, notify, send, conversationOf } from '../../ui/state.js'
import { act } from '../../ui/acts.js'
import { yes } from '../../ui/yes.js'
import { fileText, splitPages } from '../../core/files.js'
import { loadConversation } from '../../core/conversations.js'
import { noteRecord, routineOf } from '../../core/events.js'
import { t } from '../../core/i18n.js'
import { digest } from '../../ui/mentions.js'
import { EVERY, WHEN, due, dueTime, inEnglish, listRoutines, localStamp, newRoutine, schedule, trigger, writeRoutine } from './schedule.js'

/** @typedef {import('./schedule.js').Routine} Routine */
/** @typedef {import('../../core/types.js').ResourceLink} ResourceLink */

/** Where the room's routines are: the home project's at the root, another's in its folder. */
export const folder = () => (app.project.value.data.default === true ? '' : app.projectDir)

/** The room's routines. */
export const routines = () => listRoutines(app.fs, folder())

/** Week facts where the user lives (the browser's region): the weekend's days, and the first day. */
export function week() {
  const where = /** @type {any} */ (new Intl.Locale(navigator.language))
  const info = where.getWeekInfo?.() ?? where.weekInfo ?? {}
  return { weekend: /** @type {number[]} */ (info.weekend ?? [6, 7]).map((day) => day % 7), first: (info.firstDay ?? 1) % 7 }
}

/** When a routine runs next, for the page: never while it is off. @param {Routine} routine */
export const next = (routine) => (routine.active ? dueTime(routine, new Date(), week().weekend, 1) : null)

/** A routine's runs in the room, newest first. @param {string} path */
const runsOf = (path) => app.conversations.peek().filter((item) => item.routine === path).sort((a, b) => (a.id < b.id ? 1 : -1))

/** @type {import('../../core/loop.js').Tool} */
const scheduleTool = {
  spec: {
    name: 'schedule',
    description: 'Make a routine: a request you send yourself on a schedule, in a conversation of its own, when the user wants something done regularly, or once later (a reminder). title: a few words; request: what to do, as the user would ask it, standing on its own since a run doesn’t see this conversation (where the data is, what to work out, what to report); both in the user’s language. Or flow: the name of one of the user’s flows, which the routine runs instead. every: once, hour, day, weekday (working days), week or month; on: the day of the week (monday…sunday) or of the month (1–31), or once the date (YYYY-MM-DD) or the day of the week, the next one; at: the local time, HH:MM, of which an hour takes the minutes. Or, instead of every and at, when: file, each time the user shares a file, or made, each time you make one; the file comes with the request; if: a yes-or-no question in the user’s language the file must pass (Is it an invoice?).',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' }, request: { type: 'string' }, flow: { type: 'string' },
        every: { type: 'string', enum: [...EVERY] }, on: { type: 'string' }, at: { type: 'string' },
        when: { type: 'string', enum: [...WHEN] }, if: { type: 'string' },
      },
      required: ['title'],
    },
  },
  kind: 'edit',
  title: (args) => `Make the routine ${args?.title ?? ''}`,
  run: async (args, ctx) => {
    const plan = schedule(args ?? {}) ?? trigger(args ?? {})
    const title = String(args?.title ?? '').trim()
    // A flow it runs, by name (D218): its request is then the flow's name.
    const flow = args?.flow && loaded.peek().has('flows') ? (await import('../flows/graph.js')).flowNamed(await (await import('../flows/flows.js')).refresh(), args.flow) : undefined
    if (args?.flow && !flow) throw new Error(`No flow is called "${args.flow}".`)
    const request = flow?.name ?? String(args?.request ?? '').trim()
    if (!plan) throw new Error('A routine needs every (once, hour, day, weekday, week or month), at (HH:MM), and on for a week (monday…sunday), a month (1–31) or once (YYYY-MM-DD); or when (file or made).')
    if (!title || !request) throw new Error('A routine needs a title and a request.')
    if ('every' in plan && !dueTime(plan, new Date(), week().weekend, 1)) throw new Error(`${inEnglish(plan)} has passed: it is ${localStamp(new Date())}.`)
    const routine = newRoutine(folder(), { title, request, by: 'jean', ...(flow && { flow: /** @type {any} */ (flow).id }), ...plan })
    await writeRoutine(app.fs, routine)
    act('routine.add', { task: conversationOf(ctx.signal)?.path, path: routine.path, title, flow: Boolean(flow) || undefined, ...('every' in plan ? { every: plan.every } : { when: plan.when }) })
    notify(t('routines.saved', { title }), { label: t('skills.open'), run: () => import('../../ui/dialogs.js').then((dialogs) => dialogs.openSettings('routines')) })
    return `Made the routine "${title}": ${inEnglish(plan)}. It runs while the user has you open${'when' in plan ? '.' : `, or as soon as they open you after it falls due.${plan.every === 'once' ? ''
      : ' Suggest they run it once now with Run now in Settings › Routines, to allow what it needs while they watch.'}`}`
  },
}

/** @type {import('../../core/loop.js').Tool} */
const runsTool = {
  spec: {
    name: 'routine_runs',
    description: 'A routine’s earlier runs. With no date: when each fell due and ran, newest first. With a date (YYYY-MM-DD, local): that day’s runs as they went, what each asked, answered and made. routine: its title.',
    parameters: { type: 'object', properties: { routine: { type: 'string' }, date: { type: 'string' } }, required: ['routine'] },
  },
  kind: 'read',
  title: (args) => `Read the runs of ${args?.routine ?? ''}`,
  run: async (args) => {
    const all = await routines()
    const routine = all.find((one) => one.title.trim().toLowerCase() === String(args?.routine ?? '').trim().toLowerCase())
    if (!routine) return all.length ? `No routine is called "${args?.routine ?? ''}". The routines: ${all.map((one) => `"${one.title}"`).join(', ')}.` : 'There are no routines here.'
    const date = String(args?.date ?? '').trim()
    const runs = await Promise.all(runsOf(routine.path).map(async (run) => ({ ran: localStamp(new Date(run.createdAt)), records: (await loadConversation(app.fs, run.path))?.records ?? [] })))
    if (!date) return runs.length ? runs.map(({ ran, records }) => {
      const data = routineOf(records)
      return `- ran ${ran}, ${data?.file ? `set off by ${data.file}` : data?.asked ? 'run by the user' : `fell due ${localStamp(new Date(data?.due ?? ''))}`}`
    }).join('\n') : `"${routine.title}" hasn't run yet.`
    const that = runs.filter(({ ran }) => ran.startsWith(date))
    return that.length ? that.map(({ ran, records }) => `The run of ${ran}, as it went:\n\n${digest(records)}`).join('\n\n---\n\n') : `"${routine.title}" didn't run on ${date}: call routine_runs without a date for when it ran.`
  },
}

// ─── Running them ────────────────────────────────────────────────────────────

// With a conversation on screen, a routine's run shows only once the user has left Jean alone this long.
const ALONE_MS = 60_000
let touched = 0
for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => { touched = Date.now() }, { capture: true, passive: true })

/**
 * Whether a routine's run may show in the user's place: nothing under way, typed or waiting, no
 * dialog open, no brief of what's new about to start, and nobody reading a conversation.
 */
function free() {
  return !app.busy.peek() && !app.draft.peek().trim() && !app.attachments.peek().length
    && !app.dialog.peek() && !app.decisions.peek().length && !app.offering.peek() && !(app.back.peek() && loaded.peek().has('since'))
    && (document.hidden || !app.current.peek() || Date.now() - touched > ALONE_MS)
}

/**
 * What the brain reads before the request: whose it is, how often, and when it fell due, that the
 * user ran it, or the file that set it off; then how often it ran before, and the last run as it went.
 * @param {Routine} routine @param {Date} time @param {boolean} [asked] @param {ResourceLink} [file]
 */
async function note(routine, time, asked = false, file) {
  const runs = runsOf(routine.path)
  const last = runs.length ? await loadConversation(app.fs, runs[0].path) : null
  const before = last ? ` It ran ${runs.length === 1 ? 'once' : `${runs.length} times`} before, last on ${localStamp(new Date(runs[0].createdAt))}; what is new is what came after that. routine_runs reads any earlier run.${
    loaded.peek().has('computer') ? ' What you keep in /workspace stays there for its next runs.' : ''}\n\nThe last run, as it went, for reference:\n\n${digest(last.records, 8_000)}` : ''
  const now = file ? `this time it is ${file.name}, ${'when' in routine && routine.when === 'made' ? 'which you made' : 'which the user shared'} in another task, shared with it. The user may not be watching`
    : asked ? 'the user ran it now' : `it fell due on ${localStamp(time)}, local time. The user may not be watching`
  return noteRecord(`The next message is the user's routine "${routine.title}", which you send yourself ${inEnglish(routine)}; ${now}.${before}`,
    { kind: 'routine', routine: routine.path, title: routine.title, due: time.toISOString(), ...(asked && { asked }), ...(file && { file: file.name }) })
}

// ─── What sets them off (D294) ───────────────────────────────────────────────

/** Files that set a routine off, oldest first, waiting for its run in this tab, where they were shared or made. @type {{ routine: string, file: ResourceLink }[]} */
const waiting = []

/** A file was shared or made: each of the room's routines it sets off, those on, waits for its run. @param {'file' | 'made'} when @param {ResourceLink} file */
async function setOff(when, file) {
  try {
    for (const routine of await routines()) {
      if (routine.active && 'when' in routine && routine.when === when && (!routine.if || await passes(routine.if, file))) waiting.push({ routine: routine.path, file })
    }
    later()
  } catch (error) {
    console.warn('Routines', error)
  }
}

/** Whether a file is what a routine asks for, by its name and the start of its text; unsure, it isn't. @param {string} question @param {ResourceLink} file */
const passes = async (question, file) => yes(question, `${file.name}\n\n${((await fileText(app.fs, app.projectDir, file.uri)) ?? '').slice(0, 2000)}`).catch(() => false)

let checking = false

/** Begins the first of the room's routines that fell due, else one a file set off, with a brain to ask. */
export async function check(now = new Date()) {
  if (checking || !brainsHere.peek().length) return
  checking = true
  try {
    const routine = (await routines()).find((candidate) => due(candidate, now, week().weekend))
    // One tab runs it: another that looks finds it ran.
    if (routine && navigator.locks) await navigator.locks.request(`routine:${routine.path}`, { ifAvailable: true }, (lock) => lock && run(routine.path, now))
    else if (routine) await run(routine.path, now)
    else if (waiting.length) {
      const { routine: path, file } = /** @type {typeof waiting[number]} */ (waiting.shift())
      await run(path, now, false, file)
    }
  } finally {
    checking = false
  }
}

/**
 * A routine that fell due, one the user asked for now (Settings' Routines), which counts as the run due,
 * or one a file set off, which comes with it unless it was turned off since. It shows when the user asked for it or Jean is free, and
 * otherwise runs out of sight at once (D317), rather than waiting for the user to leave Jean alone. It
 * returns once begun: what a run waits for, an approval or a question, holds up no other routine.
 * @param {string} path @param {Date} now @param {boolean} [asked] @param {ResourceLink} [file]
 */
async function run(path, now, asked = false, file) {
  const routine = (await routines()).find((candidate) => candidate.path === path)
  const time = asked || (file && routine?.active) ? now : routine && due(routine, now, week().weekend)
  if (!routine || !time) return
  await writeRoutine(app.fs, { ...routine, lastRun: now.toISOString() })
  const told = await note(routine, time, asked, file)
  const files = file ? [{ key: file.uri, name: file.name, status: /** @type {const} */ ('ready'), link: file, pages: splitPages((await fileText(app.fs, app.projectDir, file.uri)) ?? '') }] : []
  // A routine that runs a flow: its steps are the turn (D218).
  const call = routine.flow && await unlock('flows') ? { name: 'run_flow', args: { flow: routine.flow, name: routine.request } } : undefined
  const options = { notes: [told], call, files, brain: brainOf(routine) }
  const shown = asked || free()
  if (shown) newConversation()
  const sent = shown ? send(routine.request, options) : import('../../ui/send.js').then((module) => module.sendAside(routine.request, options))
  sent.catch((error) => console.warn('Routines', error))
}
/**
 * Who answers a routine's runs (D303): Auto, or its brain at its version while the room still has it;
 * otherwise nobody in particular, so the brain the user's messages have. @param {Routine} routine
 */
function brainOf(routine) {
  if (routine.brain === 'auto') return /** @type {const} */ ('auto')
  const brain = brainsHere.peek().find((one) => one.id === routine.brain)
  return brain && { ...brain, model: routine.model || brain.model }
}

/** @param {string} path */
export const runNow = (path) => run(path, new Date(), true)

let soon = 0
const later = () => {
  clearTimeout(soon)
  soon = setTimeout(() => check(), 1000)
}
// Every half minute, and a moment after the tab comes back, the room changes, or Jean comes free to show one.
setInterval(() => check(), 30_000)
document.addEventListener('visibilitychange', later)
effect(() => {
  void [app.busy.value, app.dialog.value, app.back.value, app.project.value, app.current.value]
  later()
})

register({
  id: 'routines',
  tools: [scheduleTool, runsTool],
  lines: [{ name: 'schedule', line: 'make a routine, when the user wants something done regularly, later, or each time a file comes' }, { name: 'routine_runs', line: 'read a routine’s earlier runs: what each did, answered and made' }],
  // What sets routines off (D294): a file shared, or one Jean made; never in a routine's own run.
  hooks: [
    { on: 'file.add', run: (e, next) => { if (!e.routine) setOff('file', e.file); return next(e) } },
    { on: 'turn.end', run: (e, next) => { if (!e.routine) for (const file of e.made) setOff('made', file); return next(e) } },
  ],
})
