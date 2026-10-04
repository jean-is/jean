// Routines (docs/product.md, D122): a task the user wants done regularly, which Jean does on its
// own, on a schedule: a request it sends itself, in a conversation of its own, under the same
// rules as any (approvals wait in the inbox). There is no server: a routine runs while Jean is
// open, once it is free and the user has left it alone for a minute, or as soon as Jean is opened
// after it fell due, and the times missed meanwhile make one run. A routine runs in its project,
// when the room is there. The brain makes one with `schedule` when the user asks; Settings'
// Routines lists, changes and deletes them.
import { effect } from '@preact/signals-core'
import { register, loaded } from '../../ui/caps.js'
import { app, effective, newConversation, notify, send } from '../../ui/state.js'
import { noteRecord } from '../../core/events.js'
import { t } from '../../core/i18n.js'
import { due, dueTime, inEnglish, listRoutines, localStamp, newRoutine, schedule, writeRoutine } from './schedule.js'

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

/** @type {import('../../core/loop.js').Tool} */
const scheduleTool = {
  spec: {
    name: 'schedule',
    description: 'Make a routine: a request you send yourself on a schedule, in a conversation of its own, when the user wants something done regularly. title: a few words; request: what to do, as the user would ask it; both in the user’s language. every: day, weekday (working days), week or month; on: the day of the week (monday…sunday) or of the month (1–31); at: the local time, HH:MM.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' }, request: { type: 'string' },
        every: { type: 'string', enum: ['day', 'weekday', 'week', 'month'] }, on: { type: 'string' }, at: { type: 'string' },
      },
      required: ['title', 'request', 'every', 'at'],
    },
  },
  kind: 'edit',
  title: (args) => `Make the routine ${args?.title ?? ''}`,
  run: async (args) => {
    const plan = schedule(args ?? {})
    const title = String(args?.title ?? '').trim()
    const request = String(args?.request ?? '').trim()
    if (!plan) throw new Error('A routine needs every (day, weekday, week or month), at (HH:MM), and on for a week (monday…sunday) or a month (1–31).')
    if (!title || !request) throw new Error('A routine needs a title and a request.')
    await writeRoutine(app.fs, newRoutine(folder(), { title, request, by: 'jean', ...plan }))
    notify(t('routines.saved', { title }), { label: t('skills.open'), run: () => import('../../ui/dialogs.js').then((dialogs) => dialogs.openSettings('routines')) })
    return `Made the routine "${title}": ${inEnglish(plan)}. It runs while the user has you open, or as soon as they open you after it falls due.`
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
  return effective.peek().settings.brains.length > 0 && !app.busy.peek() && !app.draft.peek().trim() && !app.attachments.peek().length
    && !app.dialog.peek() && !app.decisions.peek().length && !app.offering.peek() && !(app.back.peek() && loaded.peek().has('since'))
    && (document.hidden || !app.current.peek() || Date.now() - touched > ALONE_MS)
}

/** What the brain reads before the request: whose it is, how often, and when it fell due. @param {Routine} routine @param {Date} time */
const note = (routine, time) => noteRecord(`The next message is the user's routine "${routine.title}", which you send yourself ${inEnglish(routine)}; it fell due on ${localStamp(time)}, local time. The user may not be watching.`,
  { kind: 'routine', routine: routine.path, title: routine.title, due: time.toISOString() })

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

/** @param {string} path @param {Date} now */
async function run(path, now) {
  const routine = (await routines()).find((candidate) => candidate.path === path)
  const time = routine && due(routine, now, week().weekend)
  if (!routine || !time || !free()) return
  await writeRoutine(app.fs, { ...routine, lastRun: now.toISOString() })
  newConversation()
  await send(routine.request, { notes: [note(routine, time)] })
}

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
  tools: [scheduleTool],
  lines: [{ name: 'schedule', line: 'make a routine, when the user wants something done regularly' }],
})
