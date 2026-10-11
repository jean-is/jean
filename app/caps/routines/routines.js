// Routines (docs/product.md, D122): a task the user wants done regularly, or once later, which
// Jean does on its own, on a schedule: a request it sends itself, in a conversation of its own, under the same
// rules as any (approvals wait in the inbox). There is no server: a routine runs while Jean is
// open, once it is free and the user has left it alone for a minute, or as soon as Jean is opened
// after it fell due, and the times missed meanwhile make one run. A routine runs in its project,
// when the room is there. The brain makes one with `schedule` when the user asks; Settings'
// Routines lists, changes and deletes them, with their runs. A run comes with the last one as it
// went, and `routine_runs` reads the others.
import { effect } from '@preact/signals-core'
import { register, loaded, unlock } from '../../ui/caps.js'
import { app, brainsHere, newConversation, notify, send } from '../../ui/state.js'
import { loadConversation } from '../../core/conversations.js'
import { noteRecord, routineOf } from '../../core/events.js'
import { t } from '../../core/i18n.js'
import { digest } from '../../ui/mentions.js'
import { EVERY, due, dueTime, inEnglish, listRoutines, localStamp, newRoutine, schedule, writeRoutine } from './schedule.js'

/** @typedef {import('./schedule.js').Routine} Routine */

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

/** When a routine runs next, for the page. @param {Routine} routine */
export const next = (routine) => dueTime(routine, new Date(), week().weekend, 1)

/** A routine's runs in the room, newest first. @param {string} path */
const runsOf = (path) => app.conversations.peek().filter((item) => item.routine === path).sort((a, b) => (a.id < b.id ? 1 : -1))

/** @type {import('../../core/loop.js').Tool} */
const scheduleTool = {
  spec: {
    name: 'schedule',
    description: 'Make a routine: a request you send yourself on a schedule, in a conversation of its own, when the user wants something done regularly, or once later (a reminder). title: a few words; request: what to do, as the user would ask it, standing on its own since a run doesn’t see this conversation (where the data is, what to work out, what to report); both in the user’s language. Or flow: the name of one of the user’s flows, which the routine runs instead. every: once, hour, day, weekday (working days), week or month; on: the day of the week (monday…sunday) or of the month (1–31), or once the date (YYYY-MM-DD) or the day of the week, the next one; at: the local time, HH:MM, of which an hour takes the minutes.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' }, request: { type: 'string' }, flow: { type: 'string' },
        every: { type: 'string', enum: [...EVERY] }, on: { type: 'string' }, at: { type: 'string' },
      },
      required: ['title', 'every', 'at'],
    },
  },
  kind: 'edit',
  title: (args) => `Make the routine ${args?.title ?? ''}`,
  run: async (args) => {
    const plan = schedule(args ?? {})
    const title = String(args?.title ?? '').trim()
    // A flow it runs, by name (D218): its request is then the flow's name.
    const flow = args?.flow && loaded.peek().has('flows') ? (await import('../flows/graph.js')).flowNamed(await (await import('../flows/flows.js')).refresh(), args.flow) : undefined
    if (args?.flow && !flow) throw new Error(`No flow is called "${args.flow}".`)
    const request = flow?.name ?? String(args?.request ?? '').trim()
    if (!plan) throw new Error('A routine needs every (once, hour, day, weekday, week or month), at (HH:MM), and on for a week (monday…sunday), a month (1–31) or once (YYYY-MM-DD).')
    if (!title || !request) throw new Error('A routine needs a title and a request.')
    if (!dueTime(plan, new Date(), week().weekend, 1)) throw new Error(`${inEnglish(plan)} has passed: it is ${localStamp(new Date())}.`)
    await writeRoutine(app.fs, newRoutine(folder(), { title, request, by: 'jean', ...(flow && { flow: /** @type {any} */ (flow).id }), ...plan }))
    notify(t('routines.saved', { title }), { label: t('skills.open'), run: () => import('../../ui/dialogs.js').then((dialogs) => dialogs.openSettings('routines')) })
    return `Made the routine "${title}": ${inEnglish(plan)}. It runs while the user has you open, or as soon as they open you after it falls due.${plan.every === 'once' ? ''
      : ' Suggest they run it once now with Run now in Settings › Routines, to allow what it needs while they watch.'}`
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
      return `- ran ${ran}, ${data?.asked ? 'run by the user' : `fell due ${localStamp(new Date(data?.due ?? ''))}`}`
    }).join('\n') : `"${routine.title}" hasn't run yet.`
    const that = runs.filter(({ ran }) => ran.startsWith(date))
    return that.length ? that.map(({ ran, records }) => `The run of ${ran}, as it went:\n\n${digest(records)}`).join('\n\n---\n\n') : `"${routine.title}" didn't run on ${date}: call routine_runs without a date for when it ran.`
  },
}

// ─── Running them ────────────────────────────────────────────────────────────

// With a conversation on screen, a routine waits until the user has left Jean alone this long.
const ALONE_MS = 60_000
let touched = 0
for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => { touched = Date.now() }, { capture: true, passive: true })

/**
 * Whether Jean is free for a routine: a brain to ask, nothing under way, typed or waiting, no
 * dialog open, no brief of what's new about to start, and nobody reading a conversation.
 */
function free() {
  return brainsHere.peek().length > 0 && !app.busy.peek() && !app.draft.peek().trim() && !app.attachments.peek().length
    && !app.dialog.peek() && !app.decisions.peek().length && !app.offering.peek() && !(app.back.peek() && loaded.peek().has('since'))
    && (document.hidden || !app.current.peek() || Date.now() - touched > ALONE_MS)
}

/**
 * What the brain reads before the request: whose it is, how often, and when it fell due, or that
 * the user ran it; then how often it ran before, and the last run as it went.
 * @param {Routine} routine @param {Date} time
 */
async function note(routine, time, asked = false) {
  const runs = runsOf(routine.path)
  const last = runs.length ? await loadConversation(app.fs, runs[0].path) : null
  const before = last ? ` It ran ${runs.length === 1 ? 'once' : `${runs.length} times`} before, last on ${localStamp(new Date(runs[0].createdAt))}; what is new is what came after that. routine_runs reads any earlier run.${
    loaded.peek().has('computer') ? ' What you keep in /workspace stays there for its next runs.' : ''}\n\nThe last run, as it went, for reference:\n\n${digest(last.records, 8_000)}` : ''
  return noteRecord(`The next message is the user's routine "${routine.title}", which you send yourself ${inEnglish(routine)}; ${asked
    ? 'the user ran it now' : `it fell due on ${localStamp(time)}, local time. The user may not be watching`}.${before}`, { kind: 'routine', routine: routine.path, title: routine.title, due: time.toISOString(), ...(asked && { asked }) })
}

let checking = false

/** Runs the first of the room's routines that fell due, if Jean is free. */
export async function check(now = new Date()) {
  if (checking || !free()) return
  checking = true
  try {
    const routine = (await routines()).find((candidate) => due(candidate, now, week().weekend))
    // One tab runs it: another that looks finds it ran.
    if (routine && navigator.locks) await navigator.locks.request(`routine:${routine.path}`, { ifAvailable: true }, (lock) => lock && run(routine.path, now))
    else if (routine) await run(routine.path, now)
  } finally {
    checking = false
  }
}

/** A routine that fell due, or one the user asked for now (Settings' Routines), which counts as the run due. @param {string} path @param {Date} now */
async function run(path, now, asked = false) {
  const routine = (await routines()).find((candidate) => candidate.path === path)
  const time = asked ? now : routine && due(routine, now, week().weekend)
  if (!routine || !time || !(asked || free())) return
  await writeRoutine(app.fs, { ...routine, lastRun: now.toISOString() })
  const told = await note(routine, time, asked)
  newConversation()
  // A routine that runs a flow: its steps are the turn (D218).
  if (routine.flow && await unlock('flows')) await send(routine.request, { notes: [told], call: { name: 'run_flow', args: { flow: routine.flow, name: routine.request } } })
  else await send(routine.request, { notes: [told] })
}
/** @param {string} path */
export const runNow = (path) => run(path, new Date(), true)

let soon = 0
const later = () => {
  clearTimeout(soon)
  soon = setTimeout(() => check(), 1000)
}
// Every half minute, and a moment after Jean comes free, the tab comes back, or the room changes.
setInterval(() => check(), 30_000)
document.addEventListener('visibilitychange', later)
effect(() => {
  void [app.busy.value, app.dialog.value, app.back.value, app.project.value, app.current.value]
  later()
})

register({
  id: 'routines',
  tools: [scheduleTool, runsTool],
  lines: [{ name: 'schedule', line: 'make a routine, when the user wants something done regularly or later' }, { name: 'routine_runs', line: 'read a routine’s earlier runs: what each did, answered and made' }],
})
