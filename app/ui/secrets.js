// API keys and tokens, in .secrets/, which is never exported, synced or shared, and sealed at
// rest as every file is, behind the lock when there is one (docs/encryption.md, D371).
import { readJSON, writeJSON } from '../core/fs.js'

/** @typedef {import('../core/types.js').FS} FS */

const FILE = '.secrets/keys.json'
/** @type {Map<string, Promise<any>>} */
const keys = new Map()

/**
 * A key this device keeps in IndexedDB, made the first time it is asked for, and non-extractable
 * so it never leaves: the one that seals certificates (D252). Null where
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
      const get = db.transaction('keys').objectStore('keys').get(name)
      get.onerror = () => resolve(null)
      get.onsuccess = async () => {
        if (get.result) return resolve(get.result)
        const key = await make()
        const put = db.transaction('keys', 'readwrite').objectStore('keys').put(key, name)
        put.onsuccess = () => resolve(key)
        put.onerror = () => resolve(null)
      }
    }
  }))
  return /** @type {Promise<T | null>} */ (keys.get(name))
}

/** @param {FS} fs @param {string} id @returns {Promise<string | null>} */
export const getSecret = async (fs, id) => (await readJSON(fs, FILE, {}))[id] ?? null

/** @param {FS} fs @param {string} id @param {string} value */
export async function setSecret(fs, id, value) {
  const all = await readJSON(fs, FILE, {})
  all[id] = value
  await writeJSON(fs, FILE, all)
}

/** @param {FS} fs @param {string} id */
export async function deleteSecret(fs, id) {
  const all = await readJSON(fs, FILE, {})
  if (!(id in all)) return
  delete all[id]
  await writeJSON(fs, FILE, all)
}
