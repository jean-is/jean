// SPDX-License-Identifier: MIT
// A collection's timeline, its days: the whole months it runs over, from its first row's to the one after its last row's, where the names of
// the last bars read; where each row lies among them, from the day its date column holds to the one it lasts until; and how wide a day is at
// least, narrower as the months are more. Days are ISO 8601's, as caps/calendar/month.js has them. Pure, so Node's tests run it.
import { dayOf, addDays, daysBetween, monthAfter } from '../calendar/month.js'

/**
 * @template {{ id: string, cells: Record<string, unknown> }} R @param {R[]} rows @param {string} date @param {string | undefined} until @param {string} today
 * @returns {{ from: string, days: number, wide: number, months: { month: string, at: number, days: number }[], places: Map<string, { at: number, days: number, start: string, end: string }>, none: R[], now: number }}
 *   its first day, how many it runs over, a day's least width in rem, its months, each with the day it starts at and how many it has, each row's
 *   place by its id, the day it starts at and how many it lasts, an end before its start none; the rows with no day; and today's day, -1 outside
 */
export function spanOf(rows, date, until, today) {
  const dated = rows.flatMap((row) => ((start, end) => (start ? [{ id: row.id, start, end: end > start ? end : start }] : []))(dayOf(row.cells[date]), until ? dayOf(row.cells[until]) : ''))
  const first = dated.reduce((day, { start }) => (start < day ? start : day), dated[0]?.start ?? today), last = dated.reduce((day, { end }) => (end > day ? end : day), first)
  const from = `${first.slice(0, 7)}-01`, months = /** @type {{ month: string, at: number, days: number }[]} */ ([])
  for (let month = from.slice(0, 7); month <= monthAfter(last.slice(0, 7), 1); month = monthAfter(month, 1)) months.push({ month, at: daysBetween(from, `${month}-01`), days: daysBetween(`${month}-01`, `${monthAfter(month, 1)}-01`) })
  const days = months.reduce((sum, month) => sum + month.days, 0), now = daysBetween(from, today)
  return { from, days, wide: days > 400 ? 0.15 : days > 130 ? 0.3 : 0.6, months, places: new Map(dated.map(({ id, start, end }) => [id, { at: daysBetween(from, start), days: daysBetween(start, end) + 1, start, end }])),
    none: rows.filter((row) => !dayOf(row.cells[date])), now: now >= 0 && now < days ? now : -1 }
}

/** The day a point along a timeline is on, a share of its width from its start, less the days a bar was held from its own. @param {string} from @param {number} days @param {number} share @param {number} [held] */
export const dayAt = (from, days, share, held = 0) => addDays(from, Math.max(0, Math.min(days - 1, Math.floor(share * days))) - held)
