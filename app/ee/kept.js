// SPDX-FileCopyrightText: 2026 WAREHOUSE SAS
// SPDX-License-Identifier: Elastic-2.0

// Retention (D412): what leaves a task, deleted or left out by asking a request again, is kept first, for at
// least the period policy's `retention` names, from each record's own time; certificates are records too
// (`meta.certificate`), so they stay with the answers they vouch for. The copy is `.kept/<id>.jsonl`, a
// conversation file of its own: the task's header, then each removal, a note of when, by whom and from where,
// before what went. It is only ever added to, and goes as a whole once the last thing added has been kept its
// period. Pure: any FS.

import { join, basename } from '../core/fs.js'

/** @import { FS, Envelope } from '../core/types.js' */
/** @typedef {{ years: number, months: number, weeks: number, days: number }} Period */

export const DIR = '.kept'

/** An ISO 8601 duration in years, months, weeks and days ("P6M"), as Intl.DurationFormat reads one; throws on any other. @param {unknown} text @returns {Period} */
export function period(text) {
  const match = typeof text === 'string' && text !== 'P' ? /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(text) : null
  if (!match) throw new Error(`policy.json's retention is not a period such as "P6M": ${JSON.stringify(text)}`)
  const [years, months, weeks, days] = match.slice(1).map((n) => Number(n ?? 0))
  return { years, months, weeks, days }
}

/** When something from `at` has been kept its period: a month from 31 January ends in March, never sooner. @param {string | number} at @param {Period} keep */
export function until(at, { years, months, weeks, days }) {
  const date = new Date(at)
  return date.setUTCFullYear(date.getUTCFullYear() + years, date.getUTCMonth() + months, date.getUTCDate() + weeks * 7 + days)
}

/**
 * Keeps, before they go, those of a removal's records not yet kept their period; one without a time is kept.
 * @param {FS} fs @param {{ task: string, records: Envelope[], all?: boolean }} removal `all` when the whole task goes
 * @param {{ keep: Period, by: string, now?: number }} options @returns {Promise<number>} how many were kept
 */
export async function keep(fs, { task, records, all = false }, { keep, by, now = Date.now() }) {
  const young = records.filter((record) => !(until(record.at, keep) <= now))
  if (!young.length) return 0
  const path = join(DIR, basename(task))
  const note = { at: new Date(now).toISOString(), by, meta: { removed: { from: task, count: young.length, all } } }
  const text = [note, ...young].map((line) => JSON.stringify(line) + '\n').join('')
  if (await fs.exists(path)) await fs.append(path, text)
  else {
    const header = (await fs.read(task))?.split('\n', 1)[0] || JSON.stringify({ format: 1, kind: 'conversation', id: basename(task).replace(/\.jsonl$/, ''), createdAt: young[0].at, by })
    await fs.write(path, `${header}\n${text}`)
  }
  return young.length
}

/** Lets go of each copy whose last addition has been kept its period. @param {FS} fs @param {{ keep: Period, now?: number }} options @returns {Promise<string[]>} the copies gone */
export async function purge(fs, { keep, now = Date.now() }) {
  const gone = []
  for (const { name, kind } of await fs.list(DIR)) {
    const path = join(DIR, name)
    const stat = kind === 'file' && name.endsWith('.jsonl') ? await fs.stat?.(path) : null
    if (stat && until(stat.lastModified, keep) <= now) gone.push(path)
  }
  for (const path of gone) await fs.remove(path)
  return gone
}
