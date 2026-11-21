// SPDX-License-Identifier: MIT
// How a collection tells what is coming up (caps/soon): by which date column, the first unless one is named, and how many days before a notice
// comes, the day before unless changed, never at -1. Kept with the collection, as soon.json in its folder, so it goes where the collection does.
import { signal } from '@preact/signals-core'
import { app } from '../../ui/state.js'

/** @typedef {{ before: number, column?: string }} How */
const DAYS = [-1, 0, 1, 7]
/** Each collection's, by its file's place, read once. @type {Map<string, import('@preact/signals-core').Signal<How>>} */
const kept = new Map()
/** Each one's file being read. @type {Map<string, Promise<void>>} */
const reads = new Map()
const placeOf = (/** @type {string} */ dir, /** @type {string} */ folder) => `${dir}/${folder}/soon.json`

/** A collection's, as its file says once read; the day before, by its first date, until then and with no file. @param {string} dir @param {string} folder */
export function howOf(dir, folder) {
  const at = placeOf(dir, folder), was = kept.get(at)
  if (was) return was
  const how = signal(/** @type {How} */ ({ before: 1 }))
  kept.set(at, how)
  reads.set(at, app.fs.read(at).then((text) => { const said = text ? JSON.parse(text) : null; if (said?.format === 1) how.value = { before: DAYS.includes(said.before) ? said.before : 1, ...(typeof said.column === 'string' && { column: said.column }) } }, () => {}))
  return how
}
/** A collection's, once its file is read. @param {string} dir @param {string} folder @returns {Promise<How>} */
export const readHow = async (dir, folder) => { const how = howOf(dir, folder); await reads.get(placeOf(dir, folder)); return how.peek() }
/** A collection's, changed and kept. @param {string} dir @param {string} folder @param {How} how */
export const keepHow = (dir, folder, how) => { howOf(dir, folder).value = how; return app.fs.write(placeOf(dir, folder), JSON.stringify({ format: 1, ...how })) }
