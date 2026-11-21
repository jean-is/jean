// SPDX-License-Identifier: MIT
// A collection's versions (docs/composition.md, D763): frozen snapshots, `versions/<n>.json` in its folder, numbered 1, 2, 3…, made when its
// author publishes one or its columns change, never on a row's change, which its journal (changes.jsonl) keeps. A version never breaks what
// the one before exposed: a column renamed keeps its old name, which a recipe still reads, marked old; a deleted one stays readable to a
// recipe that names it, marked old too; a column turned into a kind whose values read otherwise is a break, and no version is made of it.
// Pure, so Node's tests run it.
import { canonical } from '../tables/table.js'

/** @import { Table } from '../tables/table.js' */
/** @import { Row, Line } from '../tables/changes.js' */
/**
 * A version: its number, when, by whom and why it was made, the journal's head it was taken at, its columns, its rows and its relations' names.
 * @typedef {{ format: 1, n: number, at: string, by: string, why: 'published' | 'schema', head: string, table: Pick<Table, 'name' | 'properties'>, rows: Pick<Row, 'id' | 'cells' | 'created' | 'changed'>[], names?: [string, string][] }} Version
 */

/** Kinds whose values read alike, so that a column turned from one into another breaks no recipe. */
const ALIKE = [['text', 'email', 'link', 'phone', 'place'], ['select', 'status']]
const key = (/** @type {string} */ name) => name.trim().normalize('NFKC').toLocaleLowerCase()

/** The journal's head: the time of its latest line, '' while it has none. @param {Line[]} lines */
export const headOf = (lines) => lines.reduce((head, line) => ((at) => (at > head ? at : head))('at' in line ? line.at : line.compacted), '')

/** A collection frozen as a version. @param {{ table: Table, rows: Row[], lines: Line[], names?: Map<string, string> }} one @param {Pick<Version, 'n' | 'at' | 'by' | 'why'>} made @returns {Version} */
export const versionOf = ({ table, rows, lines, names }, made) => ({ format: 1, ...made, head: headOf(lines), table: { name: table.name, properties: table.properties },
  rows: rows.map(({ id, cells, created, changed }) => ({ id, cells, created, changed })), ...(names?.size ? { names: [...names] } : {}) })

/** A version as a collection loaded is, for what reads one (caps/fill). @param {Version} version */
export const loadedOf = (version) => ({ table: /** @type {Table} */ (/** @type {unknown} */ ({ ...version.table, views: [] })), rows: /** @type {Row[]} */ (version.rows), names: new Map(version.names ?? []) })

/** What a collection's columns are, to tell whether they changed: each one's id, name, kind, choices and whether it is deleted. @param {Pick<Table, 'properties'>} table */
const shapeOf = (table) => canonical(table.properties.map(({ id, name, type, options, deleted }) => ({ id, name, type, options: options?.map((option) => option.name) ?? [], deleted: Boolean(deleted) })))
/** Whether a collection's columns are other than a version's. @param {Version} version @param {Pick<Table, 'properties'>} table */
export const reshaped = (version, table) => shapeOf(version.table) !== shapeOf(table)

/** The names of the columns turning `before` into `after` breaks: one gone, or turned into a kind whose values read otherwise. @param {Pick<Table, 'properties'>} before @param {Pick<Table, 'properties'>} after */
export const breaks = (before, after) => before.properties.flatMap((was) => ((now) => (!now || (now.type !== was.type && !ALIKE.some((kinds) => kinds.includes(now.type) && kinds.includes(was.type))) ? [was.name] : []))(after.properties.find((one) => one.id === was.id)))

/**
 * A recipe as a collection reads it now: each column it names by a name that column had in an earlier version taken to its name now, those old
 * names said to whoever reads the reference, and a deleted column it names readable again. @param {Table} table @param {Version[]} versions
 * @param {Record<string, string>} recipe @returns {{ table: Table, recipe: Record<string, string>, old: [string, string][] }}
 */
export function current(table, versions, recipe) {
  const now = new Map(table.properties.map((one) => [one.id, one])), taken = new Set(table.properties.map((one) => key(one.name)))
  const old = new Map(versions.flatMap((version) => version.table.properties).flatMap((was) => ((one) => (one && !taken.has(key(was.name)) ? [[key(was.name), one]] : []))(now.get(was.id))))
  const gone = new Map(table.properties.filter((one) => one.deleted).map((one) => [key(one.name), one])), names = [...old.keys(), ...gone.keys()].sort((a, b) => b.length - a.length)
  const said = /** @type {[string, string][]} */ ([]), revived = new Set()
  // Each part of a line, as fill() reads them: between `|`, commas, `and` and `or`, a name first.
  const named = (/** @type {string} */ text) => text.split(/(\s+(?:and|or)\s+|\s*[|,]\s*)/i).map((part, i) => {
    const name = i % 2 ? undefined : names.find((one) => key(part).startsWith(one) && /^(\s|[!=<>≠≥≤]|$)/.test(part.slice(one.length))), one = name === undefined ? undefined : old.get(name) ?? gone.get(name)
    if (!name || !one) return part
    if (old.has(name)) said.push([part.slice(0, name.length), one.name]); else revived.add(one.id)
    return `${one.name}${part.slice(name.length)}`
  }).join('')
  const shown = Object.fromEntries(Object.entries(recipe).map(([what, text]) => [what, /^(fields|where|sort)$/.test(what) ? named(text) : text]))
  const fields = shown.fields ?? (revived.size ? table.properties.filter((one) => !one.deleted).map((one) => one.name).join(' | ') : undefined)
  return { table: { ...table, properties: table.properties.map((one) => (revived.has(one.id) ? { ...one, deleted: undefined } : one)) }, recipe: { ...shown, ...(fields ? { fields } : {}) }, old: said }
}
