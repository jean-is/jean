// SPDX-License-Identifier: MIT
// A collection worked on together (D733): its changes are lines of its changes.jsonl and its collection.json, which already merge in
// any order (caps/tables/changes.js `merge`, table.js `mergeTables`), as Sync merges them. A line that comes is appended, never written
// over what the person changes meanwhile; a table that comes is merged into the one here. What the person changes here goes as the
// lines the journal doesn't hold yet, and the table when it differs from the last one the journal had. The files its cells name, in its folder
// by their content's hash, go before the lines that name them, and one that comes is kept only if its content is what its name says. Its
// versions go too, each once, frozen, and its port as its owner opens or shuts it (caps/compose).
import { app } from '../../ui/state.js'
import { sha256Hex } from '../../core/files.js'
import { encode, decode } from '../../ui/seal.js'
import { parseChanges, stringifyChanges, reading } from '../tables/changes.js'
import { readTable, mergeTables, canonical, FILE } from '../tables/table.js'

/** Where a collection is: its project's folder and its own. @typedef {{ dir: string, folder: string }} Place */
/** What the journal holds of it: each line, as text, its table's, its cells' files, by their places in its folder, its versions' numbers and its port's. @typedef {{ lines: Set<string>, table: string, files?: Set<string>, versions?: Set<string>, port?: string }} Held */

/** @param {Place} place */
const paths = ({ dir, folder }) => ({ table: `${dir}/${folder}/collection.json`, lines: `${dir}/${folder}/changes.jsonl`, versions: `${dir}/${folder}/versions`, port: `${dir}/${folder}/port.json` })
/** @param {Place} place */
const read = async (place) => ({ table: tableOf(await app.fs.read(paths(place).table)), lines: reading(`${place.dir}/${place.folder}`, await app.fs.read(paths(place).lines) ?? '').lines,
  versions: Object.fromEntries(await Promise.all((await app.fs.list(paths(place).versions).catch(() => [])).filter(({ name }) => /^\d+\.json$/.test(name)).map(async ({ name }) => [name, JSON.parse((await app.fs.read(`${paths(place).versions}/${name}`)) ?? 'null')]))),
  port: (await app.fs.read(paths(place).port).catch(() => null)) ?? '' })
/** A line as the journal holds it, worked out once for each line read (D747): a file read again keeps the lines it had. @type {WeakMap<object, string>} */
const keys = new WeakMap()
/** @param {object} line */
const keyOf = (line) => keys.get(line) ?? /** @type {string} */ (keys.set(line, canonical(line)).get(line))
/** A table, or none where there is none yet, as a newcomer has, or what is there isn't one. @param {string | null} text */
const tableOf = (text) => { try { return text ? readTable(text) : null } catch { return null } }
/** Tables' views shown, read again. @param {Place} place */
const shown = (place) => import('../tables/tables.js').then((tables) => { if (place.dir === app.projectDir) return tables.came([`${place.dir}/${place.folder}/changes.jsonl`]) })

/** A collection's own name, for a card or a toast. @param {Place} place */
export const titleOf = async (place) => (await read(place)).table?.name ?? ''

/** The files its cells name, those of its folder's `files`, each as base64 by its place there, but those `held`. @param {Place} place @param {Set<string>} [held] */
async function filesOf(place, held) {
  const dir = `${place.dir}/${place.folder}`, files = /** @type {Record<string, string>} */ ({})
  for (const path of (await app.fs.list(`${dir}/files`).catch(() => [])).map(({ name }) => `files/${name}`)) {
    const bytes = FILE.test(path) && !held?.has(path) && await app.fs.readBytes(`${dir}/${path}`)
    if (bytes) files[path] = encode(bytes)
  }
  return files
}

/** All of it, for a seed: its table, its lines and its cells' files. @param {Place} place */
export const seedOf = async (place) => ({ ...await read(place), files: await filesOf(place) })

/** What a seed holds, taken as the journal's, so that none of it goes again as a change. @param {Held} held @param {{ table: any, lines: any[], files?: Record<string, string>, versions?: Record<string, unknown>, port?: string }} content */
export const hold = (held, { table, lines, files, versions, port }) => { for (const line of lines) held.lines.add(canonical(line)); if (table) held.table = canonical(table); for (const path of Object.keys(files ?? {})) (held.files ??= new Set()).add(path); for (const name of Object.keys(versions ?? {})) (held.versions ??= new Set()).add(name); if (port !== undefined) held.port = port }

/**
 * What came, taken in: lines appended where they aren't here yet, a table merged into this one, or made where there is none, as a
 * newcomer's first seed makes the collection; a file kept first, where its name says its content is, and left out when its content isn't that
 * or its place is no cell's file's; a version kept where there is none of its number, never written over, and its port as it came. @param {Place} place
 * @param {{ table?: any, lines?: any[], files?: Record<string, unknown>, versions?: Record<string, unknown>, port?: string }} body @param {Held} held
 */
export async function take(place, body, held) {
  for (const [name, version] of Object.entries(body.versions ?? {})) if (/^\d+\.json$/.test(name) && version && typeof version === 'object' && ((held.versions ??= new Set()).add(name), !(await app.fs.exists(`${paths(place).versions}/${name}`)))) await app.fs.write(`${paths(place).versions}/${name}`, `${JSON.stringify(version, null, 1)}\n`)
  if (typeof body.port === 'string' && body.port !== ((await app.fs.read(paths(place).port).catch(() => null)) ?? '')) (held.port = body.port), await (body.port ? app.fs.write(paths(place).port, body.port) : app.fs.remove(paths(place).port))
  for (const [path, value] of Object.entries(body.files ?? {})) {
    const bytes = FILE.test(path) && typeof value === 'string' ? await Promise.resolve(value).then(decode).catch(() => null) : null, at = `${place.dir}/${place.folder}/${path}`
    if (!bytes || `files/${await sha256Hex(bytes)}` !== path.replace(/\.[^.]+$/, '')) continue
    ;(held.files ??= new Set()).add(path)
    if (!(await app.fs.exists(at))) await app.fs.writeBytes(at, bytes)
  }
  const here = await read(place)
  const lines = parseChanges(stringifyChanges(Array.isArray(body.lines) ? body.lines : []))
  for (const line of lines) held.lines.add(canonical(line))
  const known = new Set(here.lines.map(keyOf)), fresh = lines.filter((line) => !known.has(canonical(line)))
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
 * differs; a version once, and its port once it changes. @param {Place} place @param {Held} held @param {(body: { lines?: any[], table?: any, files?: Record<string, string>, versions?: Record<string, unknown>, port?: string }) => Promise<unknown>} post @returns {() => void} what stops it
 */
export function watch(place, held, post) {
  const { table, lines, versions, port } = paths(place), kept = `${place.dir}/${place.folder}/files/`
  let running = Promise.resolve()
  const look = () => (running = running.then(async () => {
    // Its cells' files first, so that no line names one that isn't there yet.
    const files = await filesOf(place, held.files ??= new Set())
    for (const path of Object.keys(files)) held.files.add(path)
    if (Object.keys(files).length) await post({ files })
    const here = await read(place)
    const fresh = here.lines.filter((line) => !held.lines.has(keyOf(line)))
    if (fresh.length) {
      for (const line of fresh) held.lines.add(keyOf(line))
      await post({ lines: fresh })
    }
    if (here.table && canonical(here.table) !== held.table) {
      held.table = canonical(here.table)
      await post({ table: here.table })
    }
    const made = Object.fromEntries(Object.entries(here.versions).filter(([name]) => !held.versions?.has(name)))
    if (Object.keys(made).length) { for (const name of Object.keys(made)) (held.versions ??= new Set()).add(name); await post({ versions: made }) }
    if (here.port !== (held.port ?? '')) (held.port = here.port), await post({ port: here.port })
  }).catch((error) => console.warn('Together', error)))
  // What changed here before the watch began, between the seed taken and the journal caught up, goes now, not with the next change.
  look()
  return app.fs.watch?.((path) => { if (path === table || path === lines || path === port || path.startsWith(kept) || path.startsWith(`${versions}/`)) look() }, { all: true }) ?? (() => {})
}
