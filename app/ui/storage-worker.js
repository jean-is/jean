// Storage worker: the only code that touches OPFS. Started as a module worker by ui/opfs.js.
// Request { id, op, path, text, from } → { id, result } | { id, error: { name, message } }.
// `text` is a Uint8Array for writeBytes; readBytes answers with one (its buffer transferred).
// Paths arrive normalized (see core/fs.js); '' is the root and is only valid for list.
// Every file is sealed at rest (docs/encryption.md, D371): the vault opens at the first ping, with
// this device's key, or once the page hands in the key a lock gave back; until then, only the
// vault's own file, listing and removing work. Started on a folder of the user's instead (`root`,
// D141), it works there in place, sealing nothing: no .tmp copy, which would show in the folder,
// and no word to Jean's tabs, whose files these aren't.
import { seal, records, open, vaultKey, vaultId, close, unseal, deviceKey, encode, VAULT, HEADER } from './seal.js'

const channel = new BroadcastChannel('app-fs')
const encoder = new TextEncoder()
const decoder = new TextDecoder()
/** @type {Promise<FileSystemDirectoryHandle>} */
let rootPromise = Promise.resolve().then(() => navigator.storage.getDirectory())
rootPromise.catch(() => {}) // surfaced by ping and every op
/** Whether it works in a folder of the user's. */
let direct = false
/** The vault as vault.json keeps it: its id and its slots (ui/seal.js). @type {{ id: string, slots: import('./seal.js').Slot[] } | null} */
let known = null
/** What the first ping found: 'open', 'locked' (a lock's key is needed) or 'sealed' (nothing here opens the files). @type {Promise<string> | undefined} */
let state
/** @type {(vault: { key: CryptoKey, id: Uint8Array }) => void} */
let settle = () => {}
/** The vault's key and id, once open. */
const ready = new Promise((resolve) => { settle = resolve })
/** Files left as they are: a folder's, and the vault's own, which opens the others. @param {string} path */
const plain = (path) => direct || path === VAULT

/** The vault opened with its key, unless the key is another vault's. @param {CryptoKey} key */
async function use(key) {
  const id = await vaultId(key)
  if (encode(id) !== known?.id) throw new DOMException('Not this vault’s key', 'DataError')
  settle({ key, id })
  return 'open'
}

/** At the first ping: a first run makes the vault and its device slot; otherwise the device slot opens it, if it is there. */
async function openVault() {
  const kept = await readBytes(VAULT)
  known = kept && JSON.parse(decoder.decode(kept))
  if (!known) {
    // Files without a vault are another's, or kept before the seal: nothing opens them (D173).
    if ((await list('')).some((entry) => entry.name !== '.cache')) return 'sealed'
    const raw = crypto.getRandomValues(new Uint8Array(32))
    const device = await deviceKey('make')
    if (!device) throw new Error('No key can be kept on this device')
    const key = await vaultKey(raw)
    known = { id: encode(await vaultId(key)), slots: [await close(raw, device, { kind: 'device' })] }
    await replace(VAULT, encoder.encode(JSON.stringify({ format: 1, ...known }, null, 2) + '\n'))
    return use(key)
  }
  const slot = known.slots.find((each) => each.kind === 'device')
  const device = slot && await deviceKey('get')
  const raw = slot && device && await unseal(slot, device).catch(() => null)
  if (raw) return use(await vaultKey(raw))
  return known.slots.some((each) => each.kind !== 'device') ? 'locked' : 'sealed'
}

/** @param {any} err */
const isMissing = (err) => err?.name === 'NotFoundError' || err?.name === 'TypeMismatchError'

/** @param {string} path */
function split(path) {
  const segments = path.split('/')
  return { parents: segments.slice(0, -1), name: /** @type {string} */ (segments.at(-1)) }
}

/** @param {string[]} segments @param {boolean} create */
async function dirHandle(segments, create) {
  let dir = await rootPromise
  for (const segment of segments) dir = await dir.getDirectoryHandle(segment, { create })
  return dir
}

/** @param {string} path @param {boolean} create */
async function fileHandle(path, create) {
  const { parents, name } = split(path)
  return (await dirHandle(parents, create)).getFileHandle(name, { create })
}

/**
 * Serializes mutations per path across tabs; reads take a shared lock so they never see a
 * file between truncate and write.
 * @template T
 * @param {string} path
 * @param {'shared'|'exclusive'} mode
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function locked(path, mode, fn) {
  return navigator.locks ? navigator.locks.request((direct ? 'app-folder:' : 'app-fs:') + path, { mode }, /** @type {any} */ (fn)) : fn()
}

/** @param {string} path @returns {Promise<File|null>} */
async function readFile(path) {
  try {
    return await (await fileHandle(path, false)).getFile()
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
}

/** @param {string} path @returns {Promise<Uint8Array|null>} */
async function readBytes(path) {
  const file = await readFile(path)
  return file ? new Uint8Array(await file.arrayBuffer()) : null
}

/**
 * Sync access handles work from Safari 16.4 (whose methods became synchronous then; `await`
 * also copes with the older promise-returning ones). createWritable is the fallback, and the way
 * in a folder of the user's, which has no sync access handles; it swaps the file in when done.
 * @param {string} path
 * @param {Uint8Array} bytes
 * @param {boolean} append
 */
async function writeBytes(path, bytes, append) {
  /** @type {any} */
  const handle = await fileHandle(path, true)
  if (!direct && typeof handle.createSyncAccessHandle === 'function') {
    const access = await handle.createSyncAccessHandle()
    try {
      if (!append) await access.truncate(0)
      await access.write(bytes, { at: append ? await access.getSize() : 0 })
      await access.flush()
    } finally {
      await access.close()
    }
    return
  }
  const writable = await handle.createWritable({ keepExistingData: append })
  try {
    if (append) await writable.seek((await handle.getFile()).size)
    await writable.write(bytes)
    await writable.close()
  } catch (err) {
    await writable.abort().catch(() => {})
    throw err
  }
}

/** @param {string} path */
async function removeEntry(path) {
  const { parents, name } = split(path)
  try {
    await (await dirHandle(parents, false)).removeEntry(name, { recursive: true })
  } catch (err) {
    if (!isMissing(err)) throw err
  }
}

/** @param {string} dir */
async function list(dir) {
  /** @type {any} */
  let handle
  try {
    handle = await dirHandle(dir ? dir.split('/') : [], false)
  } catch (err) {
    if (isMissing(err)) return []
    throw err
  }
  /** @type {{ name: string, kind: 'file'|'directory' }[]} */
  const entries = []
  for await (const entry of handle.values()) {
    // A file being written in a folder of the user's has a swap file beside it meanwhile.
    if (!entry.name.endsWith(direct ? '.crswap' : '.tmp')) entries.push({ name: entry.name, kind: entry.kind })
  }
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/** @param {string} path */
async function exists(path) {
  const { parents, name } = split(path)
  let dir
  try {
    dir = await dirHandle(parents, false)
  } catch (err) {
    if (isMissing(err)) return false
    throw err
  }
  try {
    await dir.getFileHandle(name)
    return true
  } catch (err) {
    if (/** @type {any} */ (err)?.name === 'TypeMismatchError') return true // a directory
    if (isMissing(err)) return false
    throw err
  }
}

/** A file's bytes as kept, the tmp copy's when a crash between truncating and writing left it empty. @param {string} path */
const kept = (path) => locked(path, 'shared', async () => {
  const bytes = await readBytes(path)
  if (bytes?.length || direct) return bytes
  return (await readBytes(path + '.tmp')) ?? bytes
})

/** A file's content, opened from its seal. @param {string} path */
async function opened(path) {
  const bytes = await kept(path)
  if (!bytes || plain(path)) return bytes
  const { key, id } = await ready
  return open(key, id, path, bytes)
}

/** Bytes to write, sealed unless the file stays plain. @param {string} path @param {Uint8Array} bytes */
async function sealed(path, bytes) {
  if (plain(path)) return bytes
  const { key, id } = await ready
  return seal(key, id, path, bytes)
}

/**
 * Whole-file replace through a tmp copy, so a crash never leaves the file empty.
 * @param {string} path @param {Uint8Array} bytes
 */
function replace(path, bytes) {
  return locked(path, 'exclusive', async () => {
    if (direct) return writeBytes(path, bytes, false)
    await writeBytes(path + '.tmp', bytes, false)
    await writeBytes(path, bytes, false)
    await removeEntry(path + '.tmp')
  })
}

/** @type {Record<string, (path: string, text: any) => Promise<any>>} */
const ops = {
  ping: async () => {
    await rootPromise
    return (state ??= openVault())
  },
  // The vault's key from the page, once a lock gave it back.
  key: async (_, key) => {
    await state
    return use(key)
  },
  root: async (_, handle) => {
    rootPromise = Promise.resolve(handle)
    direct = true
    return true
  },
  // The size as stored, sealed or not: each side of Sync is compared with itself (docs/encryption.md).
  stat: async (path) => {
    const file = await readFile(path)
    return file && { size: file.size, lastModified: file.lastModified }
  },
  read: async (path) => {
    const bytes = await opened(path)
    return bytes && decoder.decode(bytes)
  },
  readBytes: opened,
  write: (path, text) => sealed(path, encoder.encode(text)).then((bytes) => replace(path, bytes)),
  writeBytes: (path, bytes) => sealed(path, bytes).then((sealed) => replace(path, sealed)),
  // Records after the last, under the file's header; a file not begun yet is sealed whole.
  append: (path, text) => locked(path, 'exclusive', async () => {
    const bytes = encoder.encode(text)
    if (plain(path)) return writeBytes(path, bytes, true)
    const { key, id } = await ready
    const head = new Uint8Array(await ((await readFile(path))?.slice(0, HEADER).arrayBuffer() ?? new ArrayBuffer(0)))
    if (head.length === HEADER) return writeBytes(path, await records(key, head, path, bytes), true)
    return writeBytes(path, await seal(key, id, path, bytes), false)
  }),
  // Also drop a leftover tmp copy, or read() would bring the file back.
  remove: (path) =>
    locked(path, 'exclusive', async () => {
      await removeEntry(path)
      if (!direct) await removeEntry(path + '.tmp')
    }),
  list,
  exists,
}

const MUTATIONS = ['write', 'writeBytes', 'append', 'remove']

self.onmessage = async ({ data }) => {
  const { id, op, path, text, from } = data ?? {}
  try {
    if (!Object.hasOwn(ops, op)) throw new TypeError(`Unknown storage op: ${op}`)
    const result = await ops[op](path, text)
    if (MUTATIONS.includes(op) && !direct) channel.postMessage({ path, from })
    self.postMessage({ id, result }, result instanceof Uint8Array ? [result.buffer] : [])
  } catch (err) {
    const { name = 'Error', message = String(err) } = /** @type {any} */ (err) ?? {}
    self.postMessage({ id, error: { name, message } })
  }
}
