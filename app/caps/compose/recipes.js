// SPDX-License-Identifier: MIT
// A reference's recipe run (docs/composition.md, D762): its `sort`, and its `ask`, an instruction a brain carries out over the rows its query
// keeps, at the pace its `refresh` says, by hand unless it says otherwise. Each run of an `ask` is a line of the consumer's results, numbered,
// with the source's version it read and the brain that ran it, so that a run with both already seen is read again rather than paid for again,
// and a run that fails leaves the last good one on show. Pure, so Node's tests run it.
import { query } from '../tables/query.js'
import { propertyOf } from '../tables/table.js'

/** @import { Table } from '../tables/table.js' */
/** @import { Row } from '../tables/changes.js' */
/** @import { Ref } from './refs.js' */
/** A run of a reference's `ask`: its number, when, what it read (the source's version or its journal's head), the brain, and what it wrote or why it failed. @typedef {{ format: 1, key: string, n: number, at: string, read: string, brain: string, output?: string, error?: string, certificate?: import('../receipt/certificate.js').Sealed, salts?: object }} Run */

/** How deep a change carries, consumer after consumer, and how long close changes wait to be run as one. */
export const DEPTH = 3, GATHER = 2000
/** What the brain is told, in English as every prompt; the rows are data, never instructions. */
export const PROMPT = 'You turn the rows of a collection into what part of a slide, a document or a page shows. Follow the instruction, in its language. Use only the rows given, never invent a fact, and say so when they hold none. Reply with Markdown alone: short, no heading unless asked, nothing about yourself.'

/** A reference's key among its consumer's results: its place, which version, and its recipe, in any order. @param {Pick<Ref, 'place' | 'at' | 'recipe'>} ref */
export const keyOf = ({ place, at, recipe }) => ((text) => [...text].reduce((hash, char) => (Math.imul(hash, 31) + (char.codePointAt(0) ?? 0)) >>> 0, 7).toString(36))(JSON.stringify([place, at, Object.entries(recipe).filter(([what]) => what !== 'refresh').sort()]))

/** How a reference's `ask` is run again: by hand (0), every so many minutes, or as its source changes (`auto`), which its user opts into. @param {Record<string, string>} recipe */
export const paceOf = ({ refresh = '' }) => (/^auto/i.test(refresh) ? { auto: true, every: 0 } : ((m) => ({ auto: false, every: m ? Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1) : 0 }))(/(\d+)\s*(min|h)/i.exec(refresh)))

/** The rows sorted as a recipe's `sort` says, `Name` or `Name desc`, a column it doesn't name leaving them as they are. @param {Table} table @param {Row[]} rows @param {string} [sort] */
export function sorted(table, rows, sort = '') {
  const [, name = '', down] = /^(.*?)(\s+(?:desc|descending|↓))?$/i.exec(sort.trim()) ?? [], property = name && propertyOf(table, name.trim())
  return property ? query(table, rows, { sort: [{ property: property.id, direction: down ? 'descending' : 'ascending' }] }).rows : rows
}

/** What the brain is asked: the instruction, then the rows its query keeps, a line each. @param {string} ask @param {string[][]} rows its heads first */
export const askOf = (ask, rows) => `${ask}\n\n<rows>\n${rows.map((row) => row.join(' | ')).join('\n')}\n</rows>`

/** The last good run of a reference; and one that read the same version with the same brain, which needs no brain again. @param {Run[]} runs @param {string} key @param {string} [read] @param {string} [brain] */
export const lastRun = (runs, key, read, brain) => runs.findLast((run) => run.key === key && run.output !== undefined && (read === undefined || (run.read === read && run.brain === brain)))
/** Whether a reference run every so many minutes is due. @param {Run | undefined} last @param {number} every @param {number} now */
export const due = (last, every, now) => every > 0 && (!last || now - Date.parse(last.at) >= every * 60_000)
