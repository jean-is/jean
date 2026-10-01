// FS backed by the origin private file system. All I/O runs in ui/storage-worker.js,
// which can use synchronous access handles; this module is a thin RPC client.

import { normalizeDir, normalizePath } from '../core/fs.js'
import { scriptURL } from './trusted.js'

/** @typedef {import('../core/types.js').FS} FS */

const PROBE_TIMEOUT_MS = 3000

/**
 * @param {{ workerURL?: URL | string }} [options]
 * @returns {Promise<FS | null>} null when OPFS is unusable here (unsupported, private window, worker failure)
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
  if (!(await probe(call, from))) {
    worker.terminate()
    return null
  }
  return {
    read: async (path) => call('read', normalizePath(path)),
    write: async (path, text) => call('write', normalizePath(path), assertText(text)),
    append: async (path, text) => call('append', normalizePath(path), assertText(text)),
    list: async (dir) => call('list', normalizeDir(dir)),
    remove: async (path) => call('remove', normalizePath(path)),
    exists: async (path) => call('exists', normalizePath(path)),
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
}

/** @param {unknown} text */
function assertText(text) {
  if (typeof text !== 'string') throw new TypeError(`File content must be a string, got ${typeof text}`)
  return text
}

/**
 * @typedef {(op: string, path?: string, text?: string) => Promise<any>} Call
 * @param {Worker} worker
 * @param {string} from this tab's client id, so watch() can skip our own changes
 * @returns {Call}
 */
function rpc(worker, from) {
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
 * Round-trips a small file. Fails (rather than hangs) in Firefox private windows and the like.
 * The probe path is per tab so two tabs starting together don't remove each other's probe.
 * @param {Call} call
 * @param {string} from
 */
async function probe(call, from) {
  const path = `.cache/probe-${from}`
  const steps = async () => {
    await call('ping')
    await call('write', path, 'ok')
    const back = await call('read', path)
    await call('remove', path)
    return back === 'ok'
  }
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const timeout = new Promise((resolve) => (timer = setTimeout(resolve, PROBE_TIMEOUT_MS, false)))
  try {
    return await Promise.race([steps(), timeout])
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
