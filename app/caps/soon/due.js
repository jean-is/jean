// SPDX-License-Identifier: MIT
// What is coming up in a collection (caps/soon): its rows by a date column, those due within two weeks, and, where it has a status, those whose
// day went by before they were done; rows done are left out. And which of them a notice is owed for, a number of days before. Days are the
// person's own, as their cells write them. Pure, so Node's tests run it.
import { titleOf } from '../tables/table.js'

/** @import { Table } from '../tables/table.js' */
/** A row coming up: its name, its day, and how many days away it is, less than nothing once gone by. @typedef {{ id: string, name: string, day: string, away: number }} Due */

/** A date as the person's day, 2026-11-21. @param {Date} date */
export const dayOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
/** The days from one day to another. @param {string} from @param {string} to */
const apart = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
/** A collection's date columns. @param {Table} table */
export const datesOf = (table) => table.properties.filter((property) => !property.deleted && property.type === 'date')

/**
 * The rows coming up, the earliest first, by the date column named, else the first: those due from today within `within` days, and, where the
 * collection has a status, those whose day went by; never one whose status is done. @param {Table} table
 * @param {{ id: string, cells: Record<string, unknown>, deleted?: unknown }[]} rows @param {{ today: string, column?: string, within?: number }} how @returns {Due[]}
 */
export function coming(table, rows, { today, column, within = 14 }) {
  const all = datesOf(table), by = all.find((property) => property.id === column) ?? all[0], title = titleOf(table), step = table.properties.find((property) => !property.deleted && property.type === 'status')
  if (!by) return []
  const done = new Set((step?.options ?? []).filter((option) => option.group === 'done').map((option) => option.name))
  return rows.flatMap((row) => {
    const day = String(row.cells[by.id] ?? '').slice(0, 10), away = /^\d{4}-\d\d-\d\d$/.test(day) ? apart(today, day) : NaN
    return row.deleted || Number.isNaN(away) || away > within || (away < 0 && !step) || (step && done.has(String(row.cells[step.id] ?? ''))) ? [] : [{ id: row.id, name: String(row.cells[title?.id ?? ''] ?? '').trim(), day, away }]
  }).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}

/** What a notice says a row by: its id and its day, so that a day changed is told again. @param {Due} due */
export const keyOf = (due) => `${due.id} ${due.day}`
/** Those a notice is owed for: due in `before` days or fewer, not gone by, and not told yet. @param {Due[]} dues @param {number} before @param {Set<string>} told */
export const owed = (dues, before, told) => dues.filter((due) => due.away >= 0 && due.away <= before && !told.has(keyOf(due)))
