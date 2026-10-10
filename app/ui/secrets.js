// API keys, encrypted with a non-extractable AES-GCM key kept in IndexedDB.
// The ciphertext lives in .secrets/, which is never exported, synced or shared.
import { readJSON, writeJSON } from '../core/fs.js'

/** @typedef {import('../core/types.js').FS} FS */

const FILE = '.secrets/keys.json'
/** @type {Map<string, string>} used when IndexedDB is unavailable */
const memory = new Map()
/** @type {Map<string, Promise<any>>} */
const keys = new Map()

/**
 * A key this device keeps in IndexedDB, made the first time it is asked for, and non-extractable
 * so it never leaves: the secrets' own, and the one that seals certificates (D252). Null where
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

/** @returns {Promise<CryptoKey | null>} */
const masterKey = () => deviceKey('main', () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))

/** @param {FS} fs @param {string} id @returns {Promise<string | null>} */
export async function getSecret(fs, id) {
  const key = await masterKey()
  if (!key) return memory.get(id) ?? null
  const entry = (await readJSON(fs, FILE, {}))[id]
  if (!entry) return null
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(entry.iv) }, key, decode(entry.data))
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}

/** @param {FS} fs @param {string} id @param {string} value */
export async function setSecret(fs, id, value) {
  const key = await masterKey()
  if (!key) return void memory.set(id, value)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value))
  const all = await readJSON(fs, FILE, {})
  all[id] = { iv: encode(iv), data: encode(new Uint8Array(data)) }
  await writeJSON(fs, FILE, all)
}

/** @param {FS} fs @param {string} id */
export async function deleteSecret(fs, id) {
  memory.delete(id)
  const all = await readJSON(fs, FILE, {})
  if (!(id in all)) return
  delete all[id]
  await writeJSON(fs, FILE, all)
}

/** @param {Uint8Array} bytes */
function encode(bytes) {
  return btoa(String.fromCharCode(...bytes))
}

/** @param {string} text */
function decode(text) {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}
