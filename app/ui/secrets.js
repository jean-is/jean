// API keys and tokens, in .secrets/, which is never exported, synced or shared, and sealed at
// rest as every file is, behind the lock when there is one (docs/encryption.md, D371).
import { readJSON, writeJSON } from '../core/fs.js'
import { isLocal } from '../core/settings.js'
import { mine } from './opfs.js'

/** @typedef {import('../core/types.js').FS} FS */
/** @typedef {import('../core/settings.js').Settings} Settings */

const FILE = '.secrets/keys.json'
/** This device's own, which never cross whatever a brain or a connection is called: its identity in the profile and the devices it knows (caps/devices/). */
const OWN = ['device', 'devices']
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
/**
 * Whether a secret is a key the person typed by what it holds, whatever the record beside it says, which another device's older copy
 * may have changed: never an object, as a sign-in's tokens or the bridge's port and key are, but a Google service account's key file,
 * which a Vertex AI brain takes (core/vertex.js), and a search service's key and engine (caps/web-search/). @param {string} id @param {unknown} value
 */
function typed(id, value) {
  if (typeof value !== 'string') return false
  try {
    const held = JSON.parse(value)
    return !held || typeof held !== 'object' || held.type === 'service_account' || (id.startsWith('search:') && typeof held.key === 'string')
  } catch { return true }
}
/** @type {Map<string, Promise<unknown>>} */
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
 * The secrets that go to the person's other devices (D700), chosen by what each is, never by its id alone, since a brain's
 * id holds a key typed, the bridge's for a plan, or the organisation's token (oidc): a cloud brain's key, a connection's that
 * takes one, search services'. A sign-in's, a connection's tokens (they rotate), the bridge's, the Computer's registries' (which go
 * only to the address typed with them, on that device), an authority's seal, shares', this device's own, an organisation's brains'
 * (`policy.brains`, which settings.json doesn't hold), any id this doesn't know and any value that isn't typed() stay. Only
 * caps/devices/ reads it (scripts/security.js).
 * @param {FS} fs @param {Settings} settings @param {{ brains?: { id: string }[] }} [policy] @returns {Promise<Record<string, string>>}
 */
export async function crossing(fs, settings, policy = {}) {
  const theirs = new Set((policy.brains ?? []).map((brain) => brain.id))
  // Only ids Jean gives brains and connections, ULIDs, which no secret that stays has, whatever another device names a brain.
  const brains = new Set(settings.brains.filter((brain) => ULID.test(brain.id) && !/^(claudecode|copilot|chatgpt)$/.test(brain.provider) && brain.auth !== 'oidc' && !isLocal(brain)).map((brain) => brain.id))
  const keyed = new Set((settings.connections ?? []).filter((connection) => ULID.test(connection.id) && connection.auth === 'key').map((connection) => connection.id))
  const all = /** @type {Record<string, string>} */ (await readJSON(fs, FILE, {}))
  return Object.fromEntries(Object.entries(all).filter(([id, value]) => typed(id, value) && !OWN.includes(id) && !theirs.has(id) && (brains.has(id) || keyed.has(id) || id.startsWith('search:'))))
}

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

/** Several at once, in one write, so that none is ever seen without the others; null deletes one. @param {FS} fs @param {Record<string, string | null>} values @returns {Promise<void>} */
export const setSecrets = (fs, values) => changeSecrets(fs, (all) => { for (const [id, value] of Object.entries(values)) if (value === null) delete all[id]; else all[id] = value; return true })
