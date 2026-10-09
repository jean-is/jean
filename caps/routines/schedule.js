// Routines (D115, D122): requests Jean sends itself on a schedule, one Markdown file each,
// routines/<ulid>.md in the project they belong to (the home project's at the root). The front
// matter holds the schedule, the body the request, in the user's words. With no server, a routine
// runs while Jean is open, or as soon as Jean is opened after it fell due: the times missed
// meanwhile make one run, not one each. Times are the device's local time.
// Host-agnostic: no DOM, tested under node --test.
import { join } from '../../core/fs.js'
import { ulid } from '../../core/ulid.js'
import { parseFrontMatter, stringifyFrontMatter } from '../../core/settings.js'

/** @typedef {import('../../core/types.js').FS} FS */
/**
 * every: how often; on: the day, 0 (Sunday) to 6 for a week, 1 to 31 for a month (a shorter
 * month's last day instead); at: the local time, "HH:MM". weekday: the days that aren't the
 * weekend where the user lives.
 * @typedef {{ every: 'day' | 'weekday' | 'week' | 'month', on?: number, at: string }} Schedule
 * flow: the id of a flow the routine runs, its request then the flow's name (D218).
 * @typedef {Schedule & { path: string, title: string, request: string, author: string, createdAt: string, lastRun?: string, flow?: string }} Routine
 */

export const EVERY = /** @type {const} */ (['day', 'weekday', 'week', 'month'])
/** Day names as the brain writes them, Sunday first like Date#getDay. */
export const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const AT = /^([01]?\d|2[0-3]):([0-5]\d)$/

/**
 * A schedule from what the brain or the page gives (a day by its number, or its English name
 * for a week), or null when it isn't one.
 * @param {{ every?: unknown, on?: unknown, at?: unknown }} given @returns {Schedule | null}
 */
export function schedule({ every, on, at }) {
  const time = AT.exec(String(at ?? '').trim())
  if (!EVERY.includes(/** @type {any} */ (every)) || !time) return null
  const named = DAYS.indexOf(String(on ?? '').trim().toLowerCase())
  const day = named >= 0 ? named : Number(on)
  const kind = /** @type {Schedule['every']} */ (every)
  if (kind === 'week' && !(Number.isInteger(day) && day >= 0 && day <= 6)) return null
  if (kind === 'month' && !(Number.isInteger(day) && day >= 1 && day <= 31)) return null
  return { every: kind, ...((kind === 'week' || kind === 'month') && { on: day }), at: `${time[1].padStart(2, '0')}:${time[2]}` }
}

/** Whether a routine runs on this day. @param {Schedule} plan @param {Date} day @param {number[]} weekend */
function runsOn(plan, day, weekend) {
  if (plan.every === 'day') return true
  if (plan.every === 'weekday') return !weekend.includes(day.getDay())
  if (plan.every === 'week') return day.getDay() === plan.on
  return day.getDate() === Math.min(plan.on ?? 1, new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate())
}

/** The time a routine runs on the day `offset` days from `now`'s. @param {Schedule} plan @param {Date} now @param {number} offset */
function on(plan, now, offset) {
  const [hours, minutes] = plan.at.split(':').map(Number)
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hours, minutes)
}

/**
 * When a routine last fell due, at or before now; or next falls due, after now.
 * @param {Schedule} plan @param {Date} now @param {number[]} [weekend] days off, as Date#getDay numbers
 * @param {1 | -1} [way] -1: back to the last time, 1: on to the next
 * @returns {Date | null}
 */
export function dueTime(plan, now, weekend = [0, 6], way = -1) {
  for (let offset = 0; Math.abs(offset) < 400; offset += way) {
    const time = on(plan, now, offset)
    if ((way < 0 ? time <= now : time > now) && runsOn(plan, time, weekend)) return time
  }
  return null
}

/**
 * The time a routine fell due and hasn't run since (nor been made since), or null.
 * @param {Routine} routine @param {Date} now @param {number[]} [weekend]
 */
export function due(routine, now, weekend) {
  const time = dueTime(routine, now, weekend)
  const since = Math.max(Date.parse(routine.lastRun ?? '') || 0, Date.parse(routine.createdAt) || 0)
  return time && time.getTime() > since ? time : null
}

/** A local time as the brain reads it: "2026-10-05 08:00 (Monday)". @param {Date} time */
export function localStamp(time) {
  const two = (/** @type {number} */ n) => String(n).padStart(2, '0')
  return `${time.getFullYear()}-${two(time.getMonth() + 1)}-${two(time.getDate())} ${two(time.getHours())}:${two(time.getMinutes())} (${DAYS[time.getDay()].replace(/^./, (c) => c.toUpperCase())})`
}

/** A schedule in English, for the brain. @param {Schedule} plan */
export function inEnglish(plan) {
  const day = plan.every === 'week' ? `every ${DAYS[plan.on ?? 0].replace(/^./, (c) => c.toUpperCase())}` : plan.every === 'month' ? `on day ${plan.on} of every month` : plan.every === 'weekday' ? 'every working day' : 'every day'
  return `${day} at ${plan.at}`
}

/** @param {string} text @param {string} path @returns {Routine | null} */
export function parseRoutine(text, path) {
  const { data, body } = parseFrontMatter(text)
  const plan = schedule(data)
  const request = body.trim()
  if (!plan || !request || !data.title) return null
  return { ...plan, path, title: String(data.title), request, author: String(data.author ?? ''), createdAt: String(data.createdAt ?? ''), ...(data.lastRun && { lastRun: String(data.lastRun) }), ...(data.flow && { flow: String(data.flow) }) }
}

/** The routines in a folder ('' for the home project's), oldest first. @param {FS} fs @param {string} dir @returns {Promise<Routine[]>} */
export async function listRoutines(fs, dir) {
  const files = (await fs.list(join(dir, 'routines'))).filter((entry) => entry.kind === 'file' && entry.name.endsWith('.md')).map((entry) => entry.name).sort()
  const read = await Promise.all(files.map(async (name) => parseRoutine((await fs.read(join(dir, 'routines', name))) ?? '', join(dir, 'routines', name))))
  return read.filter((routine) => routine !== null)
}

/**
 * A new routine, in a file named by a ULID that never changes.
 * @param {string} dir @param {{ title: string, request: string, by: string, now?: Date, flow?: string } & Schedule} fields @returns {Routine}
 */
export function newRoutine(dir, { title, request, by, now = new Date(), flow, ...plan }) {
  return { ...plan, path: join(dir, 'routines', `${ulid(now.getTime())}.md`), title, request, author: by, createdAt: now.toISOString(), ...(flow && { flow }) }
}

/** Writes a routine whole (a change, or the time it last ran). @param {FS} fs @param {Routine} routine */
export async function writeRoutine(fs, { path, title, request, every, on, at, author, createdAt, lastRun, flow }) {
  const data = { format: 1, title, every, ...(on !== undefined && { on }), at, ...(flow && { flow }), author, createdAt, ...(lastRun && { lastRun }) }
  await fs.write(path, stringifyFrontMatter(data, `${request.trim()}\n`))
}
