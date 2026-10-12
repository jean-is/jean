// Routines (D115, D122): requests Jean sends itself on a schedule, or once later, one Markdown file each,
// routines/<ulid>.md in the project they belong to (the home project's at the root). The front
// matter holds the schedule, the body the request, in the user's words. With no server, a routine
// runs while Jean is open, or as soon as Jean is opened after it fell due: the times missed
// meanwhile make one run, not one each. Times are the device's local time. Or it runs each time
// something happens instead (D294): a file shared, or a file Jean made, which passes its question if it has one.
// Host-agnostic: no DOM, tested under node --test.
import { join } from '../../core/fs.js'
import { ulid } from '../../core/ulid.js'
import { parseFrontMatter, stringifyFrontMatter } from '../../core/settings.js'

/** @typedef {import('../../core/types.js').FS} FS */
/**
 * every: how often; on: the day, 0 (Sunday) to 6 for a week, 1 to 31 for a month (a shorter
 * month's last day instead), the date, "YYYY-MM-DD", once; at: the local time, "HH:MM", of which
 * an hour takes the minutes. weekday: the days that aren't the weekend where the user lives.
 * @typedef {{ every: 'once' | 'hour' | 'day' | 'weekday' | 'week' | 'month', on?: number | string, at: string }} Schedule
 * when: what sets it off instead, a file the user shares or one Jean makes; if: a yes-or-no question about the file, in the user's words (D294).
 * @typedef {{ when: typeof WHEN[number], if?: string }} Trigger
 * flow: the id of a flow the routine runs, its request then the flow's name (D218).
 * @typedef {(Schedule | Trigger) & { path: string, title: string, request: string, author: string, createdAt: string, lastRun?: string, flow?: string }} Routine
 */

export const EVERY = /** @type {const} */ (['once', 'hour', 'day', 'weekday', 'week', 'month'])
export const WHEN = /** @type {const} */ (['file', 'made'])
/** Day names as the brain writes them, Sunday first like Date#getDay. */
export const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const AT = /^([01]?\d|2[0-3]):([0-5]\d)$/

/**
 * A schedule from what the brain or the page gives (a day by its number, or its English name
 * for a week; once, a date, or a day's name or nothing for the next), or null when it isn't one.
 * @param {{ every?: unknown, on?: unknown, at?: unknown }} given @param {Date} [now] @returns {Schedule | null}
 */
export function schedule({ every, on, at }, now = new Date()) {
  const time = AT.exec(String(at ?? '').trim())
  if (!EVERY.includes(/** @type {any} */ (every)) || !time) return null
  const given = String(on ?? '').trim().toLowerCase()
  const named = DAYS.indexOf(given)
  const day = named >= 0 ? named : Number(on)
  const kind = /** @type {Schedule['every']} */ (every)
  const clock = `${time[1].padStart(2, '0')}:${time[2]}`
  const next = kind === 'once' && (named >= 0 || !given) && dueTime(named >= 0 ? { every: 'week', on: named, at: clock } : { every: 'day', at: clock }, now, [], 1)
  const date = next ? ymd(next) : given
  if (kind === 'once' && ymd(new Date(`${date}T00:00`)) !== date) return null
  if (kind === 'week' && !(Number.isInteger(day) && day >= 0 && day <= 6)) return null
  if (kind === 'month' && !(Number.isInteger(day) && day >= 1 && day <= 31)) return null
  return { every: kind, ...((kind === 'week' || kind === 'month') && { on: day }), ...(kind === 'once' && { on: date }), at: clock }
}

/** What sets a routine off, from what the brain or the page gives, or null when it isn't one. @param {{ when?: unknown, if?: unknown }} given @returns {Trigger | null} */
export function trigger({ when, if: question }) {
  if (!WHEN.includes(/** @type {any} */ (when))) return null
  const asked = String(question ?? '').trim()
  return { when: /** @type {Trigger['when']} */ (when), ...(asked && { if: asked }) }
}

/** Whether a routine runs on this day. @param {Schedule} plan @param {Date} day @param {number[]} weekend */
function runsOn(plan, day, weekend) {
  if (plan.every === 'once') return ymd(day) === plan.on
  if (plan.every === 'day') return true
  if (plan.every === 'weekday') return !weekend.includes(day.getDay())
  if (plan.every === 'week') return day.getDay() === plan.on
  return day.getDate() === Math.min(Number(plan.on ?? 1), new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate())
}

/** The time a routine runs on the day `offset` days from `now`'s. @param {Schedule} plan @param {Date} now @param {number} offset */
function on(plan, now, offset) {
  const [hours, minutes] = plan.at.split(':').map(Number)
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hours, minutes)
}

/**
 * When a routine last fell due, at or before now; or next falls due, after now.
 * @param {Schedule | Trigger} plan @param {Date} now @param {number[]} [weekend] days off, as Date#getDay numbers
 * @param {1 | -1} [way] -1: back to the last time, 1: on to the next
 * @returns {Date | null} never for one a file sets off
 */
export function dueTime(plan, now, weekend = [0, 6], way = -1) {
  if ('when' in plan) return null
  if (plan.every === 'hour') {
    const time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), Number(plan.at.slice(3)))
    return (way < 0 ? time <= now : time > now) ? time : new Date(time.getTime() + way * 3_600_000)
  }
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

const two = (/** @type {number} */ n) => String(n).padStart(2, '0')
/** A local date: "2026-10-05". @param {Date} time */
const ymd = (time) => `${time.getFullYear()}-${two(time.getMonth() + 1)}-${two(time.getDate())}`

/** A local time as the brain reads it: "2026-10-05 08:00 (Monday)". @param {Date} time */
export function localStamp(time) {
  return `${ymd(time)} ${two(time.getHours())}:${two(time.getMinutes())} (${DAYS[time.getDay()].replace(/^./, (c) => c.toUpperCase())})`
}

/** A schedule in English, for the brain. @param {Schedule | Trigger} plan */
export function inEnglish(plan) {
  if ('when' in plan) return `each time ${plan.when === 'file' ? 'the user shares a file' : 'you make a file'}${plan.if ? `, when the answer to "${plan.if}" about it is yes` : ''}`
  if (plan.every === 'once') return `once, on ${localStamp(new Date(`${plan.on}T${plan.at}`))}`
  if (plan.every === 'hour') return `every hour at :${plan.at.slice(3)}`
  const day = plan.every === 'week' ? `every ${DAYS[Number(plan.on ?? 0)].replace(/^./, (c) => c.toUpperCase())}` : plan.every === 'month' ? `on day ${plan.on} of every month` : plan.every === 'weekday' ? 'every working day' : 'every day'
  return `${day} at ${plan.at}`
}

/** @param {string} text @param {string} path @returns {Routine | null} */
export function parseRoutine(text, path) {
  const { data, body } = parseFrontMatter(text)
  const plan = schedule(data) ?? trigger(data)
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
 * @param {string} dir @param {{ title: string, request: string, by: string, now?: Date, flow?: string } & (Schedule | Trigger)} fields @returns {Routine}
 */
export function newRoutine(dir, { title, request, by, now = new Date(), flow, ...plan }) {
  return { ...plan, path: join(dir, 'routines', `${ulid(now.getTime())}.md`), title, request, author: by, createdAt: now.toISOString(), ...(flow && { flow }) }
}

/** Writes a routine whole (a change, or the time it last ran). @param {FS} fs @param {Routine} routine */
export async function writeRoutine(fs, { path, title, request, author, createdAt, lastRun, flow, ...plan }) {
  const when = 'when' in plan ? { when: plan.when, ...(plan.if && { if: plan.if }) } : { every: plan.every, ...(plan.on !== undefined && { on: plan.on }), at: plan.at }
  const data = { format: 1, title, ...when, ...(flow && { flow }), author, createdAt, ...(lastRun && { lastRun }) }
  await fs.write(path, stringifyFrontMatter(data, `${request.trim()}\n`))
}
