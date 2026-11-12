// SPDX-License-Identifier: MIT
// A person's store on the relay (relay/store.js, D721) as one more FS, which Sync's round (caps/sync/mirror.js) runs against as
// against a folder. What it knows of the store is a manifest, `.cache/store-index.json` on this device, which pull() brings up to
// date from the store's feed and replaces whole: list, exists and stat answer from it. A file goes up sealed exactly as at rest
// (ui/seal.js), under the key of the store's epoch and bound to its path, cut into parts named by their SHA-256; a file that only
// grew goes up as one part more, sealed under the header it kept. Its meta, a deletion's too, is sealed and bound to its object,
// whose id is an HMAC of its path under a key the person's devices share, so the relay can neither read nor name nor move it. A
// change sealed under an epoch this device holds no key for waits in the manifest until one comes. Web-standard: node --test runs
// it against the relay itself.
import { seal, records, open, vaultKey, vaultId, encode, decode, HEADER } from '../../ui/seal.js'
import { byName } from '../../core/fs.js'

/** @typedef {import('../../core/types.js').FS} FS */
/**
 * What the manifest knows of an object: its path, its version and epoch, its words' size and SHA-256, its sealed header (for an append) and parts.
 * @typedef {{ path: string, rev: number, epoch: number, size: number, sha256: string, head: string, parts: string[] }} Entry
 * @typedef {{ oid: string, rev: number, epoch: number, meta: string, parts: string[], gone?: true }} Change
 * @typedef {{ format: 1, sid: string, after: number, objects: Record<string, Entry>, waiting: Change[] }} Manifest
 */

export const MANIFEST = '.cache/store-index.json'
/** Bytes of a part, a file's largest, and parts a file grows by before it goes up whole again. */
const PART = 4_194_304
const LARGEST = 256_000_000
const APPENDS = 32
const encoder = new TextEncoder()

/** @param {Uint8Array} bytes */
export const base64url = (bytes) => encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** @param {Uint8Array} bytes */
const sha256 = async (bytes) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes))))
/** @param {string} message @param {string} name */
const refusal = (message, name) => new DOMException(message, name)

/**
 * @param {{ base: string, sid: string, token: string, names: Uint8Array, epochs: Record<string, Uint8Array>, starts?: Record<string, number>, here: FS, fetch?: typeof globalThis.fetch }} options
 *   names: the key objects are named under; epochs: each epoch's key, the newest the one writes go under; starts: the rev each began after
 */
export function openStore({ base, sid, token, names, epochs, starts = {}, here, fetch = globalThis.fetch }) {
  /** @type {Manifest} */
  let manifest = { format: 1, sid, after: 0, objects: {}, waiting: [] }
  let refused = 0
  const loaded = here.read(MANIFEST).then((text) => { const kept = text && JSON.parse(text); if (kept?.sid === sid) manifest = kept }, () => {})
  const naming = crypto.subtle.importKey('raw', /** @type {BufferSource} */ (names), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  /** Each epoch's key as a vault's, and the id its seals carry. @type {Map<number, Promise<{ vault: CryptoKey, id: Uint8Array }>>} */
  const keys = new Map()
  /** @param {number} epoch @returns {Promise<{ vault: CryptoKey, id: Uint8Array }>} */
  const keyOf = (epoch) => {
    if (!keys.has(epoch)) keys.set(epoch, vaultKey(/** @type {Uint8Array} */ (epochs[epoch])).then(async (vault) => ({ vault, id: await vaultId(vault) })))
    return /** @type {Promise<{ vault: CryptoKey, id: Uint8Array }>} */ (keys.get(epoch))
  }
  const newest = () => Math.max(...Object.keys(epochs).map(Number))
  /** @param {string} path */
  const oidOf = async (path) => base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await naming, encoder.encode(path))).slice(0, 16))
  /** What the relay answers, or an Error with its status and body. @param {string} path @param {RequestInit & { headers?: Record<string, string> }} [init] */
  const ask = async (path, init = {}) => {
    const response = await fetch(`${base}v1/s/${sid}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } })
    if (response.ok) return response
    const body = await response.json().catch(() => ({}))
    throw Object.assign(new Error(body.error ?? `The store answered ${response.status}.`), { status: response.status, body })
  }
  /** A meta sealed under an epoch's key, bound to its object. @param {string} oid @param {number} epoch @param {object} value */
  const sealMeta = async (oid, epoch, value) => { const { vault, id } = await keyOf(epoch); return encode(await seal(vault, id, `.store/meta/${oid}`, encoder.encode(JSON.stringify(value)))) }
  /** A change's meta opened, or null: from no key of the person's, or for another object. @param {Change} change */
  const openMeta = async (change) => {
    try {
      const { vault, id } = await keyOf(change.epoch)
      const meta = JSON.parse(new TextDecoder().decode(await open(vault, id, `.store/meta/${change.oid}`, decode(change.meta))))
      return typeof meta.path === 'string' && await oidOf(meta.path) === change.oid ? meta : null
    } catch { return null }
  }
  /** A change taken into the manifest: a version, or a deletion; passed over when sealed under an epoch older than one begun before it (a removed device's old key); false when its epoch's key isn't here. @param {Change} change */
  const take = async (change) => {
    if (Object.entries(starts).some(([epoch, start]) => Number(epoch) > change.epoch && change.rev > start)) return true
    if (!epochs[change.epoch]) return false
    const meta = await openMeta(change)
    if (meta && (change.gone || meta.gone)) delete manifest.objects[change.oid]
    else if (meta) manifest.objects[change.oid] = { path: meta.path, rev: change.rev, epoch: change.epoch, size: meta.size, sha256: meta.sha256, head: meta.head, parts: change.parts }
    return true
  }
  /** The manifest's entry of a path. @param {string} path */
  const entryOf = async (path) => { await loaded; const oid = await oidOf(path); return { oid, entry: manifest.objects[oid] } }
  /** Every path the manifest knows. */
  const paths = () => Object.values(manifest.objects).map((one) => one.path)

  /**
   * Brings the manifest up to date from the feed, then keeps it whole; from the start again when the store says to, all of it read
   * before it replaces the last, so a round never sees half. Gives whether it started again, and whether changes wait for a key.
   */
  async function pull() {
    await loaded
    let next = structuredClone(manifest)
    let reset = false
    const was = JSON.stringify(manifest)
    const current = manifest
    manifest = next
    try {
      next.waiting = (await Promise.all(next.waiting.map(async (change) => ((await take(change)) ? [] : [change])))).flat()
      for (let more = true; more;) {
        const page = await (await ask(`/changes?after=${next.after}`)).json()
        if (page.reset) {
          if (reset) throw new Error('The store keeps starting again.')
          reset = true
          manifest = next = { format: 1, sid, after: 0, objects: {}, waiting: [] }
          continue
        }
        for (const change of page.changes) if (!(await take(change))) next.waiting.push(change)
        next.after = page.last
        more = page.more
      }
    } catch (error) {
      manifest = current
      throw error
    }
    if (JSON.stringify(next) !== was) await here.write(MANIFEST, JSON.stringify(next))
    return { reset, waiting: next.waiting.length > 0 }
  }

  /** A version written, or the one that won kept and the write refused. @param {string} oid @param {Record<string, string>} condition @param {RequestInit} init @param {(rev: number) => void} done */
  const put = async (oid, condition, init, done) => {
    try {
      done((await (await ask('/o', { ...init, headers: { 'store-object': oid, ...condition } })).json()).rev)
    } catch (error) {
      const { status, body } = /** @type {any} */ (error)
      // The version that won, taken in, or kept to take once its epoch's key comes; the relay saying none is, believed only from the feed.
      if (status === 412) {
        refused += 1
        if (body?.rev && !(await take(body))) manifest.waiting.push(body)
        throw refusal('It moved since it was read.', 'InvalidModificationError')
      }
      if (status === 409) throw refusal('The store has a newer epoch.', 'EpochError')
      if (status === 507) throw refusal('The store is full.', 'QuotaExceededError')
      throw error
    }
  }
  /** @param {string} path @param {Uint8Array} bytes */
  async function writeBytes(path, bytes) {
    if (bytes.length > LARGEST) throw refusal('Too large for the store: it stays on its device.', 'NotSupportedError')
    const { oid, entry } = await entryOf(path)
    const epoch = newest()
    const { vault, id } = await keyOf(epoch)
    const grows = entry && entry.epoch === epoch && entry.parts.length < APPENDS && bytes.length > entry.size && await sha256(bytes.subarray(0, entry.size)) === entry.sha256
    const head = grows ? decode(entry.head) : null
    const sealed = head ? await records(vault, head, path, bytes.subarray(entry.size)) : await seal(vault, id, path, bytes)
    const cut = Array.from({ length: Math.ceil(sealed.length / PART) }, (_, i) => sealed.subarray(i * PART, (i + 1) * PART))
    const added = await Promise.all(cut.map(async (part) => ({ part, name: await sha256(part) })))
    for (const { part, name } of added) await ask('/b', { method: 'PUT', body: /** @type {BodyInit} */ (part), headers: { 'store-part': name } })
    const parts = [...(head ? entry.parts : []), ...added.map((one) => one.name)]
    const value = { path, size: bytes.length, sha256: await sha256(bytes), head: encode(head ?? sealed.subarray(0, HEADER)) }
    const meta = await sealMeta(oid, epoch, value)
    await put(oid, entry ? { 'if-match': String(entry.rev) } : { 'if-none-match': '*' }, { method: 'PUT', body: JSON.stringify({ meta, parts, epoch }) },
      (rev) => { manifest.objects[oid] = { path, rev, epoch, size: bytes.length, sha256: value.sha256, head: value.head, parts } })
  }
  /** @param {string} path */
  async function readBytes(path) {
    const { entry } = await entryOf(path)
    if (!entry) return null
    const parts = /** @type {Uint8Array[]} */ ([])
    for (let at = 0; at < entry.parts.length; at += 3) {
      parts.push(...await Promise.all(entry.parts.slice(at, at + 3).map(async (name) => {
        const bytes = new Uint8Array(await (await ask('/b', { headers: { 'store-part': name } })).arrayBuffer())
        if (await sha256(bytes) !== name) throw refusal(`A part of ${path} isn't what its name says.`, 'DataError')
        return bytes
      })))
    }
    const sealed = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
    parts.reduce((at, part) => (sealed.set(part, at), at + part.length), 0)
    const { vault, id } = await keyOf(entry.epoch)
    const bytes = await open(vault, id, path, sealed)
    // open() leaves out a torn last record, as a crash leaves one: here, a part kept back or cut short.
    if (bytes.length !== entry.size || await sha256(bytes) !== entry.sha256) throw refusal(`${path} came incomplete.`, 'DataError')
    return bytes
  }
  /** @param {string} path */
  async function removeFile(path) {
    const { oid, entry } = await entryOf(path)
    if (!entry) return
    const epoch = newest()
    await put(oid, { 'if-match': String(entry.rev) }, { method: 'DELETE', body: JSON.stringify({ meta: await sealMeta(oid, epoch, { path, gone: true }), epoch }) },
      () => { delete manifest.objects[oid] })
  }
  /** @param {string} dir */
  const under = (dir) => paths().filter((path) => !dir || path.startsWith(`${dir}/`))

  /** @type {FS} */
  const fs = {
    readBytes,
    writeBytes,
    read: async (path) => ((bytes) => bytes && new TextDecoder().decode(bytes))(await readBytes(path)),
    write: (path, text) => writeBytes(path, encoder.encode(text)),
    async append(path, text) {
      const [old, added] = [(await readBytes(path)) ?? new Uint8Array(), encoder.encode(text)]
      const all = new Uint8Array(old.length + added.length)
      all.set(old)
      all.set(added, old.length)
      return writeBytes(path, all)
    },
    async list(dir) {
      await loaded
      /** @type {Map<string, 'file' | 'directory'>} */
      const children = new Map()
      for (const path of under(dir)) {
        const [name, ...rest] = path.slice(dir ? dir.length + 1 : 0).split('/')
        children.set(name, rest.length ? 'directory' : 'file')
      }
      return [...children].map(([name, kind]) => ({ name, kind })).sort(byName)
    },
    async remove(path) {
      if ((await entryOf(path)).entry) return removeFile(path)
      for (const one of under(path)) await removeFile(one)
    },
    exists: async (path) => Boolean((await entryOf(path)).entry) || under(path).length > 0,
    stat: async (path) => ((entry) => (entry ? { size: entry.size, lastModified: entry.rev } : null))((await entryOf(path)).entry),
  }
  return { fs, pull, refused: () => refused }
}
