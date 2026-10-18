// FS backed by the origin private file system. All I/O runs in ui/storage-worker.js,
// which can use synchronous access handles; this module is a thin RPC client. The same worker
// works in a folder of the user's, on its handle (D141). The FS is rooted in a profile's folder (D228).

import { normalizeDir, normalizePath, rootedFS } from '../core/fs.js'
import { profileOf } from '../core/settings.js'
import { ulid } from '../core/ulid.js'
import { scriptURL } from './trusted.js'

/** @typedef {import('../core/types.js').FS} FS */

const PROBE_TIMEOUT_MS = 3000
// This tab's profile, by its folder, for its reloads; in localStorage, the last opened, for a new tab.
const PROFILE = 'app.profile'
export const here = () => sessionStorage.getItem(PROFILE) ?? ''
/** A key of this browser's storage, kept per profile. @param {string} key */
export const mine = (key) => `${key}:${here()}`
/** Another profile, opened afresh (D138). @param {string} dir */
export function switchTo(dir) {
  for (const store of [sessionStorage, localStorage]) store.setItem(PROFILE, dir)
  location.replace(location.pathname)
}

/**
 * The profile's FS, its folder, and the whole FS.
 * @param {{ workerURL?: URL | string }} [options]
 * @returns {Promise<FS & { root: string, whole: FS } | null>} null when OPFS is unusable here (unsupported, private window, worker failure)
 */
export async function opfsFS({ workerURL = new URL('./storage-worker.js', import.meta.url) } = {}) {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory || typeof Worker === 'undefined') {
    return null
  }
  /** @type {Worker} */
  let worker
  try {
    worker = new Worker(scriptURL(workerURL), { type: 'module' })
  } catch {
    return null
  }
  const from = crypto.randomUUID()
  const call = rpc(worker, from)
  const root = await quickly(profile(call))
  if (!root || !(await probe(call, from, root))) {
    worker.terminate()
    return null
  }
  /** @type {FS} */
  const whole = {
    ...files(call),
    watch(cb) {
      const channel = new BroadcastChannel('app-fs')
      channel.onmessage = ({ data }) => {
        if (data?.from !== from && typeof data?.path === 'string') cb(data.path)
      }
      return () => channel.close()
    },
    async estimate() {
      const { usage, quota } = (await navigator.storage.estimate?.()) ?? {}
      return { usage, quota, persisted: await navigator.storage.persisted?.() }
    },
  }
  return Object.assign(rootedFS(whole, root), { root, whole })
}

/** The profile opened: the address's, else this tab's, else the last, else the first; a first run makes one. @param {Call} call */
async function profile(call) {
  const dirs = /** @type {string[]} */ ((await call('list', 'profiles')).map((/** @type {{ name: string }} */ entry) => `profiles/${entry.name}`))
  // The address's first ULID is its project's, else its task's.
  const id = dirs.length > 1 && /[0-9A-HJKMNP-TV-Z]{26}/.exec(location.hash)?.[0]
  const named = id && await profileOf(files(call), dirs, id)
  const kept = sessionStorage.getItem(PROFILE) ?? localStorage.getItem(PROFILE)
  const root = named || dirs.find((dir) => dir === kept) || dirs[0] || `profiles/${ulid()}-profile`
  for (const store of [sessionStorage, localStorage]) store.setItem(PROFILE, root)
  return root
}

/**
 * FS on a folder of the user's (D141): the storage worker works there, in place. Nothing is probed,
 * since nothing of Jean's is ever written into the folder.
 * @param {FileSystemDirectoryHandle} handle @param {{ workerURL?: URL | string }} [options]
 * @returns {Promise<FS & { close: () => void }>}
 */
export async function folderFS(handle, { workerURL = new URL('./storage-worker.js', import.meta.url) } = {}) {
  const worker = new Worker(scriptURL(workerURL), { type: 'module' })
  const call = rpc(worker, crypto.randomUUID())
  await call('root', '', handle)
  return { ...files(call), close: () => worker.terminate() }
}

/** @param {Call} call @returns {FS} */
export const files = (call) => ({
  read: async (path) => call('read', normalizePath(path)),
  readBytes: async (path) => call('readBytes', normalizePath(path)),
  write: async (path, text) => call('write', normalizePath(path), assertText(text)),
  writeBytes: async (path, bytes) => call('writeBytes', normalizePath(path), assertBytes(bytes)),
  append: async (path, text) => call('append', normalizePath(path), assertText(text)),
  list: async (dir) => call('list', normalizeDir(dir)),
  remove: async (path) => call('remove', normalizePath(path)),
  exists: async (path) => call('exists', normalizePath(path)),
  stat: async (path) => call('stat', normalizePath(path)),
})

/** @param {unknown} text */
function assertText(text) {
  if (typeof text !== 'string') throw new TypeError(`File content must be a string, got ${typeof text}`)
  return text
}

/** @param {unknown} bytes */
function assertBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('File content must be a Uint8Array')
  return bytes
}

/**
 * @typedef {(op: string, path?: string, text?: string | Uint8Array | FileSystemDirectoryHandle) => Promise<any>} Call
 * @param {Worker} worker
 * @param {string} from this tab's client id, so watch() can skip our own changes
 * @returns {Call}
 */
export function rpc(worker, from) {
  /** @type {Map<number, { resolve: (value: any) => void, reject: (err: Error) => void }>} */
  const pending = new Map()
  let nextId = 0
  worker.onmessage = ({ data }) => {
    const request = pending.get(data?.id)
    if (!request) return
    pending.delete(data.id)
    if (data.error) request.reject(Object.assign(new Error(data.error.message), { name: data.error.name }))
    else request.resolve(data.result)
  }
  // Fires when the worker fails to load or throws outside a request.
  worker.onerror = (event) => {
    const err = new Error(event.message || 'Storage worker failed')
    for (const request of pending.values()) request.reject(err)
    pending.clear()
  }
  return (op, path = '', text) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      worker.postMessage({ id, op, path, text, from })
    })
}

/**
 * Opens the vault, through the lock when it has one (docs/encryption.md), then round-trips a small
 * file. Fails (rather than hangs) in Firefox private windows and the like. The probe path is per
 * tab so two tabs starting together don't remove each other's probe.
 * @param {Call} call
 * @param {string} from
 * @param {string} root the profile's folder
 */
async function probe(call, from, root) {
  const path = `${root}/.cache/probe-${from}`
  const state = await quickly(call('ping', root))
  if (state === 'locked' || state === 'sealed') await (await import('../caps/lock/lock.js')).locked(call, state, root)
  else if (state !== 'open') return false
  return quickly((async () => {
    await call('write', path, 'ok')
    const back = await call('read', path)
    await call('remove', path)
    return back === 'ok'
  })())
}

/** What a step of the start gives, or false when it fails or hangs. @template T @param {Promise<T>} promise */
async function quickly(promise) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const timeout = new Promise((resolve) => (timer = setTimeout(resolve, PROBE_TIMEOUT_MS, false)))
  try {
    return await Promise.race([promise, timeout])
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
