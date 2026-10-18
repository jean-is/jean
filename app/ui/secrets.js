// API keys and tokens, in .secrets/, which is never exported, synced or shared, and sealed at
// rest as every file is, behind the lock when there is one (docs/encryption.md, D371).
import { readJSON, writeJSON } from '../core/fs.js'
import { mine } from './opfs.js'

/** @typedef {import('../core/types.js').FS} FS */

const FILE = '.secrets/keys.json'
/** @type {Map<string, Promise<any>>} */
const keys = new Map()

/**
 * A key this device keeps in IndexedDB for this profile (D228), made the first time it is asked for,
 * and non-extractable so it never leaves: the one that seals certificates (D252). Null where
 * IndexedDB is unavailable. @template T @param {string} name @param {() => Promise<T>} make @returns {Promise<T | null>}
 */
export function deviceKey(name, make) {
  if (!keys.has(name)) keys.set(name, new Promise((resolve) => {
    if (!globalThis.indexedDB) return resolve(null)
    const request = indexedDB.open('app-keys', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('keys')
    request.onerror = () => resolve(null)
    request.onsuccess = () => {
      const db = request.result
      const get = db.transaction('keys').objectStore('keys').get(mine(name))
      get.onerror = () => resolve(null)
      get.onsuccess = async () => {
        if (get.result) return resolve(get.result)
        const key = await make()
        const put = db.transaction('keys', 'readwrite').objectStore('keys').put(key, mine(name))
        put.onsuccess = () => resolve(key)
        put.onerror = () => resolve(null)
      }
    }
  }))
  return /** @type {Promise<T | null>} */ (keys.get(name))
}

/** @param {FS} fs @param {string} id @returns {Promise<string | null>} */
export const getSecret = async (fs, id) => (await readJSON(fs, FILE, {}))[id] ?? null

/**
 * Changes the secrets one change at a time, across tabs too, so that writers at once (a sign-in's
 * connections, brains, shares) keep each other's; never over a file that can't be read, which
 * JSON.parse throws on. @param {FS} fs @param {(all: Record<string, string>) => boolean} edit true when it changed them
 */
function changeSecrets(fs, edit) {
  const run = async () => {
    const all = JSON.parse((await fs.read(FILE)) ?? '{}')
    if (edit(all)) await writeJSON(fs, FILE, all)
  }
  return navigator.locks ? navigator.locks.request('app-secrets', run) : run()
}

/** @param {FS} fs @param {string} id @param {string} value @returns {Promise<void>} */
export const setSecret = (fs, id, value) => changeSecrets(fs, (all) => { all[id] = value; return true })

/** @param {FS} fs @param {string} id @returns {Promise<void>} */
export const deleteSecret = (fs, id) => changeSecrets(fs, (all) => id in all && delete all[id])
