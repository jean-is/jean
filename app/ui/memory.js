// SPDX-License-Identifier: MIT
// Jean in memory, where the browser keeps no files, as a private window of Firefox's: core/fs.js's FS in memory, loaded only then
// (ui/app.js), whose watch for all changes hears this tab's, every change here being one, as OPFS's does (ui/opfs.js). So what
// watches for them works here too: Together sending what the person changes, an open document taking a change, People and Your devices.
import { memoryFS, normalizePath } from '../core/fs.js'

/** An FS in memory that tells a watch for all changes of each one, once it is made. @returns {import('../core/types.js').FS} */
export function inMemory() {
  const [fs, hearing] = [memoryFS(), /** @type {Set<(path: string) => void>} */ (new Set())]
  /** @param {'write' | 'writeBytes' | 'append' | 'remove'} op */
  const told = (op) => async (/** @type {string} */ path, /** @type {any[]} */ ...value) => { await /** @type {any} */ (fs)[op](path, ...value); for (const one of hearing) one(normalizePath(path)) }
  return { ...fs, write: told('write'), writeBytes: told('writeBytes'), append: told('append'), remove: told('remove'),
    watch: (cb, { all } = {}) => { const one = (/** @type {string} */ path) => cb(path); if (all) hearing.add(one); return () => void hearing.delete(one) } }
}
