// SPDX-License-Identifier: MIT
// FS backed by the origin private file system. All I/O runs in ui/storage-worker.js,
// with synchronous access handles; this is its RPC client. The same worker
// works in a folder of the user's, on its handle (D141). The FS is rooted in a profile's folder (D228).

import { normalizeDir, normalizePath, rootedFS, assertText, assertBytes } from '../core/fs.js'
import { profileOf } from '../core/settings.js'
import { ulid } from '../core/ulid.js'
import { scriptURL } from './trusted.js'

/** @typedef {import('../core/types.js').FS} FS */

// This tab's profile, by its folder, for its reloads; in localStorage, the last opened, for a new tab.
export const PROFILE = 'app.profile'
/** The profile this page opened, whichever the tab goes on to as the page leaves. @type {string | null} */
let opened = null
export const here = () => opened ?? sessionStorage.getItem(PROFILE) ?? ''
/** A key of this browser's storage, kept per profile. @param {string} key */
export const mine = (key) => `${key}:${here()}`
// Where this tab left a profile, kept as the unsent draft is (ui/curtain.js).
export const PLACE = 'app.place'
/** Where this tab left the profile it came back to, for the curtain to bring back its caret. @type {{ place: string, caret: [number, number] | null } | null} */
export let left = null

/**
 * The profile's FS, its folder, and the whole FS.
 * @param {{ workerURL?: URL | string }} [options]
 * @returns {Promise<FS & { root: string, whole: FS } | null>} null when OPFS is unusable here (unsupported, private window, worker failure)
 */
export async function opfsFS({ workerURL = new URL('./storage-worker.js', import.meta.url) } = {}) {
  if (!navigator.storage?.getDirectory) return null
  /** @type {Worker} */
  let worker
  try {
    worker = new Worker(scriptURL(workerURL), { type: 'module' })
  } catch {
    return null
  }
  const from = crypto.randomUUID()
  const call = rpc(worker, from)
  // One tab at a time: two starting on a device with nothing yet would find each other's profile half made.
  const first = () => quickly(profile(call).then(async (root) => ({ root, state: await call('ping', root) })))
  const { root = '', state = '' } = await (navigator.locks?.request('app-start', first) ?? first()) || {}
  if (!root || !(await probe(call, from, root, state))) {
    worker.terminate()
    return null
  }
  /** @type {FS} */
  const whole = {
    ...files(call),
    watch(cb, { all } = {}) {
      const channel = new BroadcastChannel('app-fs')
      channel.onmessage = ({ data }) => {
        if ((all || data?.from !== from) && typeof data?.path === 'string') cb(data.path)
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
  opened = root
  left = location.hash ? null : JSON.parse(sessionStorage.getItem(mine(PLACE)) ?? 'null')
  sessionStorage.removeItem(mine(PLACE))
  if (left) history.replaceState(null, '', location.pathname + location.search + left.place)
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
 * file, at a path per tab. Fails (rather than hangs) in Firefox private windows and the like.
 * @param {Call} call
 * @param {string} from
 * @param {string} root the profile's folder
 * @param {string} state what its vault's first ping found
 */
async function probe(call, from, root, state) {
  const path = `${root}/.cache/probe-${from}`
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
const quickly = (promise) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, 3000, false))]).catch(() => false)
