// Plans (D364), as text: the steps the brain gave, read the way small brains write them, and what the records of the
// request at work say of its plan: whether the user confirmed it, and whether it moved in a block of steps. No DOM, so
// it runs under `node --test`.
import { foldTurns } from '../../core/events.js'

/** @import { Envelope, PlanEntry } from '../../core/types.js' */

/** At most this many steps, each cut at this many characters. */
export const MOST = 12
const LONG = 100
export const STATUSES = /** @type {const} */ (['pending', 'in_progress', 'completed'])
export const PRIORITIES = /** @type {const} */ (['high', 'medium', 'low'])

/** A list, or the JSON of one, as small brains sometimes send it. @param {unknown} value @returns {unknown[]} */
function list(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return [] }
  }
  return Array.isArray(value) ? value : []
}

/**
 * The steps, as ACP's entries: their words, cut short, a status (pending unless said) and a priority (medium unless
 * said), without empty ones, and no more than the plan holds. @param {any} args @returns {PlanEntry[]}
 */
export function entriesOf(args) {
  const given = args?.entries
  return list(given?.constructor === Object ? given.entries : given).flatMap((item) => {
    const entry = /** @type {any} */ (item)
    const content = String(typeof entry === 'string' ? entry : entry?.content ?? '').trim()
    if (!content) return []
    return [{ content: content.length > LONG ? `${content.slice(0, LONG - 1)}…` : content,
      status: STATUSES.includes(entry?.status) ? entry.status : 'pending', priority: PRIORITIES.includes(entry?.priority) ? entry.priority : 'medium' }]
  }).slice(0, MOST)
}

/** How many of a plan's steps are done. @param {PlanEntry[]} [entries] */
export const done = (entries = []) => entries.filter((entry) => entry.status === 'completed').length

/** The records of the request at work, from its words on. @param {Envelope[]} records */
const requestOf = (records) => records.slice(Math.max(0, records.findLastIndex(({ update }) => update?.sessionUpdate === 'user_message_chunk')))

/** The request's plans, oldest first, with the step each came in. @param {Envelope[]} records */
const plansOf = (records) => requestOf(records).flatMap(({ update, step = 0 }) => (update?.sessionUpdate === 'plan' ? [{ ...update, step }] : []))

/** Whether a plan of the request at work was confirmed, by the user or by their rule. @param {Envelope[]} records */
export const confirmed = (records) => plansOf(records).some((plan) => plan._meta?.confirmed)

/** Whether the request at work is a routine's, sent by Jean on its schedule, with nobody there to confirm (D122). @param {Envelope[]} records */
export const routine = (records) => Boolean(foldTurns(records).findLast((turn) => turn.user)?.notes.some((note) => note.data.kind === 'routine'))

/**
 * Whether the request's confirmed plan moved in the block of steps that began at `from`: one more of its steps is done
 * than before it. @param {Envelope[]} records @param {number} from
 */
export function moved(records, from) {
  const plans = plansOf(records)
  return plans.some((plan) => plan._meta?.confirmed) && done(plans.at(-1)?.entries) > done(plans.findLast((plan) => plan.step < from)?.entries)
}
