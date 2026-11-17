// SPDX-License-Identifier: MIT
// A collection's calendar, its days: a month as weeks from the language's first day, where each row lies by the day its date column
// holds, one that lasts on each of its days, the month a calendar opens on, and a row moved to another day with its time. Days are
// ISO 8601's, 2026-11-20, as a date's cell writes them, the grid Gregorian's. Pure, so Node's tests run it.

/** @param {string} day */
const utc = (day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
/** @param {number} ms */
const iso = (ms) => new Date(ms).toISOString().slice(0, 10)

/** The day a cell's value is on, a date's with or without a time; '' when it holds none on the calendar. @param {unknown} value */
export const dayOf = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}($|T)/.test(value) && iso(utc(value)) === value.slice(0, 10) ? value.slice(0, 10) : '')
/** Its time of day as written, 14:30, to sort a day's rows by; '' without one. @param {unknown} value */
const timeOf = (value) => (typeof value === 'string' && value[10] === 'T' ? value.slice(11, 16) : '')
/** A day some days after another, or before. @param {string} day @param {number} days */
export const addDays = (day, days) => iso(utc(day) + days * 864e5)
/** How many days from one day to another. @param {string} from @param {string} to */
export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / 864e5)
/** A month, 2026-11, some months after another, or before. @param {string} month @param {number} months */
export const monthAfter = (month, months) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + months, 1)).toISOString().slice(0, 7)
/** A date's value on another day, its time and zone as they were. @param {unknown} value @param {string} day */
export const moved = (value, day) => `${day}${typeof value === 'string' ? value.slice(10) : ''}`

/**
 * A month as weeks of seven days from `firstDay`, 1 a Monday to 7 a Sunday, as Intl's week info says it; null where a week's day is
 * another month's. @param {string} month @param {number} [firstDay] @returns {(string | null)[][]}
 */
export function weeksOf(month, firstDay = 1) {
  const first = `${month}-01`, lead = ((new Date(utc(first)).getUTCDay() || 7) - firstDay + 7) % 7
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysBetween(first, `${monthAfter(month, 1)}-01`) }, (_, i) => addDays(first, i))]
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7))
}

/**
 * Where a month's rows lie: each on the day its `date` column holds, by its time then as it came; with a column to last `until`, on each
 * day up to that one, `on` after its first; and those with no day, apart. An end before its start is none.
 * @template {{ cells: Record<string, unknown> }} R @param {R[]} rows @param {string} date @param {string | undefined} until @param {string} month
 * @returns {{ days: Map<string, { row: R, time: string, on: boolean }[]>, none: R[] }}
 */
export function placed(rows, date, until, month) {
  const first = `${month}-01`, last = addDays(`${monthAfter(month, 1)}-01`, -1), days = /** @type {Map<string, { row: R, time: string, on: boolean }[]>} */ (new Map()), none = /** @type {R[]} */ ([])
  for (const row of rows) {
    const start = dayOf(row.cells[date]), end = until ? dayOf(row.cells[until]) : ''
    if (!start) { none.push(row); continue }
    for (let day = start < first ? first : start; day <= (end > start ? end : start) && day <= last; day = addDays(day, 1)) days.set(day, [...days.get(day) ?? [], { row, time: day === start ? timeOf(row.cells[date]) : '', on: day !== start }])
  }
  for (const all of days.values()) all.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
  return { days, none }
}

/**
 * The month a calendar opens on: this one while a row is in it or none has a day; else the month of the next row to come, else of the
 * last one gone. @param {string[]} days each row's @param {string} today
 */
export const monthOf = (days, today) => (!days.length || days.some((day) => day.startsWith(today.slice(0, 7))) ? today : days.filter((day) => day > today).sort()[0] ?? [...days].sort().at(-1) ?? today).slice(0, 7)
