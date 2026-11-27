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

/** Who a line is for, and a real day, as a document writes them (caps/documents/markdown.js, D774). */
const NAMED = /(?<![\p{L}\p{N}])@\[([^[\]\n]{1,80})\](?!\()/gu, DAY = /(?<![\d-])\d{4}-(?:0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?![\dT-])/g
const same = (/** @type {string} */ a, /** @type {string} */ b) => a.trim().normalize().toLocaleLowerCase() === b.trim().normalize().toLocaleLowerCase()
/**
 * A document's open tasks with a day from today within `within` days, those that name `me` or no one: each by its words, the person's own name and the day left
 * out, its day, how far, and which of the document's open tasks with that day it is, which opens it there. Never one in code. @param {string} markdown
 * @param {{ today: string, me?: string, within?: number }} how @returns {(Due & { nth: number })[]}
 */
export function todos(markdown, { today, me = '', within = 14 }) {
  let fence = ''
  const counts = /** @type {Record<string, number>} */ ({})
  return markdown.split('\n').flatMap((line) => {
    const mark = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1], task = !fence && /^\s*(?:>\s*)*(?:[-*+]|\d{1,9}[.)])\s+\[ \]\s+(.*)$/.exec(line)
    if (mark && (!fence || (mark[0] === fence[0] && mark.length >= fence.length))) fence = fence ? '' : mark
    const text = task ? task[1].replace(/`[^`]*`|\]\([^)]*\)|\w+:\/\/\S+/g, (code) => (code[0] === ']' ? ']' : ' ')) : ''
    const day = [...text.replace(NAMED, ' ').matchAll(DAY)].find((one) => new Date(`${one[0]}T00:00`).getDate() === Number(one[1]))?.[0], names = [...text.matchAll(NAMED)].map((one) => one[1])
    if (!day) return []
    const nth = (counts[day] = (counts[day] ?? -1) + 1), away = apart(today, day)
    if (away < 0 || away > within || (names.length && !(me && names.some((one) => same(one, me))))) return []
    const name = text.replace(NAMED, (_, one) => (me && same(one, me) ? '' : `@${one.trim()}`)).replace(DAY, '').replace(/\[([^\]]*)\]/g, '$1').replace(/\*\*|__|~~/g, '').replace(/\s+/g, ' ').trim()
    return [{ id: name, name, day, away, nth }]
  })
}

/** What a notice says a row by: its id and its day, so that a day changed is told again. @param {Due} due */
export const keyOf = (due) => `${due.id} ${due.day}`
/** Those a notice is owed for: due in `before` days or fewer, not gone by, and not told yet. @param {Due[]} dues @param {number} before @param {Set<string>} told */
export const owed = (dues, before, told) => dues.filter((due) => due.away >= 0 && due.away <= before && !told.has(keyOf(due)))
