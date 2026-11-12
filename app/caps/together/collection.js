// SPDX-License-Identifier: MIT
// A collection worked on together (D733): its changes are lines of its changes.jsonl and its collection.json, which already merge in
// any order (caps/tables/changes.js `merge`, table.js `mergeTables`), as Sync merges them. A line that comes is appended, never written
// over what the person changes meanwhile; a table that comes is merged into the one here. What the person changes here goes as the
// lines the journal doesn't hold yet, and the table when it differs from the last one the journal had.
import { app } from '../../ui/state.js'
import { parseChanges, stringifyChanges } from '../tables/changes.js'
import { readTable, mergeTables, canonical } from '../tables/table.js'

/** Where a collection is: its project's folder and its own. @typedef {{ dir: string, folder: string }} Place */
/** What the journal holds of it: each line, as text, and its table's. @typedef {{ lines: Set<string>, table: string }} Held */

/** @param {Place} place */
const paths = ({ dir, folder }) => ({ table: `${dir}/${folder}/collection.json`, lines: `${dir}/${folder}/changes.jsonl` })
/** @param {Place} place */
const read = async (place) => ({ table: tableOf(await app.fs.read(paths(place).table)), lines: parseChanges(await app.fs.read(paths(place).lines) ?? '') })
/** A table, or none where there is none yet, as a newcomer has, or what is there isn't one. @param {string | null} text */
const tableOf = (text) => { try { return text ? readTable(text) : null } catch { return null } }
/** Tables' views shown, read again. @param {Place} place */
const shown = (place) => import('../tables/tables.js').then((tables) => { if (place.dir === app.projectDir) return tables.came([`${place.dir}/${place.folder}/changes.jsonl`]) })

/** A collection's own name, for a card or a toast. @param {Place} place */
export const titleOf = async (place) => (await read(place)).table?.name ?? ''

/** All of it, for a seed: its table and its lines. @param {Place} place */
export const seedOf = (place) => read(place)

/** What a seed holds, taken as the journal's, so that none of it goes again as a change. @param {Held} held @param {{ table: any, lines: any[] }} content */
export const hold = (held, { table, lines }) => { for (const line of lines) held.lines.add(canonical(line)); if (table) held.table = canonical(table) }

/**
 * What came, taken in: lines appended where they aren't here yet, a table merged into this one, or made where there is none, as a
 * newcomer's first seed makes the collection. @param {Place} place @param {{ table?: any, lines?: any[] }} body @param {Held} held
 */
export async function take(place, body, held) {
  const here = await read(place)
  const lines = parseChanges(stringifyChanges(Array.isArray(body.lines) ? body.lines : []))
  for (const line of lines) held.lines.add(canonical(line))
  const known = new Set(here.lines.map(canonical)), fresh = lines.filter((line) => !known.has(canonical(line)))
  if (fresh.length) await app.fs.append(paths(place).lines, stringifyChanges(fresh))
  const table = body.table && tableOf(JSON.stringify(body.table))
  if (table) {
    const merged = here.table ? mergeTables(here.table, table) : table
    held.table = canonical(merged)
    if (!here.table || canonical(merged) !== canonical(here.table)) await app.fs.write(paths(place).table, `${JSON.stringify(merged, null, 2)}\n`)
  }
  if (fresh.length || table) await shown(place)
}

/**
 * What the person changed here that the journal doesn't hold, posted as it is written, in any tab: the new lines, and the table once it
 * differs. @param {Place} place @param {Held} held @param {(body: { lines?: any[], table?: any }) => Promise<unknown>} post @returns {() => void} what stops it
 */
export function watch(place, held, post) {
  const { table, lines } = paths(place)
  let running = Promise.resolve()
  const look = () => (running = running.then(async () => {
    const here = await read(place)
    const fresh = here.lines.filter((line) => !held.lines.has(canonical(line)))
    if (fresh.length) {
      for (const line of fresh) held.lines.add(canonical(line))
      await post({ lines: fresh })
    }
    if (here.table && canonical(here.table) !== held.table) {
      held.table = canonical(here.table)
      await post({ table: here.table })
    }
  }).catch((error) => console.warn('Together', error)))
  return app.fs.watch?.((path) => { if (path === table || path === lines) look() }, { all: true }) ?? (() => {})
}
