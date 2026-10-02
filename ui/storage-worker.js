// Storage worker: the only code that touches OPFS. Started as a module worker by ui/opfs.js,
// but written classic-compatible (no import/export, no top-level await) for older engines.
// Request { id, op, path, text, from } → { id, result } | { id, error: { name, message } }.
// `text` is a Uint8Array for writeBytes; readBytes answers with one (its buffer transferred).
// Paths arrive normalized (see core/fs.js); '' is the root and is only valid for list.

const channel = new BroadcastChannel('app-fs')
const encoder = new TextEncoder()
/** @type {Promise<FileSystemDirectoryHandle>} */
const rootPromise = Promise.resolve().then(() => navigator.storage.getDirectory())
rootPromise.catch(() => {}) // surfaced by ping and every op

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
  return navigator.locks ? navigator.locks.request('app-fs:' + path, { mode }, /** @type {any} */ (fn)) : fn()
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

/** @param {string} path @returns {Promise<string|null>} */
async function readText(path) {
  return (await readFile(path))?.text() ?? null
}

/** @param {string} path @returns {Promise<Uint8Array|null>} */
async function readBytes(path) {
  const file = await readFile(path)
  return file ? new Uint8Array(await file.arrayBuffer()) : null
}

/**
 * Sync access handles work from Safari 16.4 (whose methods became synchronous then; `await`
 * also copes with the older promise-returning ones). createWritable is the fallback.
 * @param {string} path
 * @param {Uint8Array} bytes
 * @param {boolean} append
 */
async function writeBytes(path, bytes, append) {
  /** @type {any} */
  const handle = await fileHandle(path, true)
  if (typeof handle.createSyncAccessHandle === 'function') {
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
    if (!entry.name.endsWith('.tmp')) entries.push({ name: entry.name, kind: entry.kind })
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

/**
 * Whole-file replace through a tmp copy, so a crash never leaves the file empty.
 * @param {string} path @param {Uint8Array} bytes
 */
function replace(path, bytes) {
  return locked(path, 'exclusive', async () => {
    await writeBytes(path + '.tmp', bytes, false)
    await writeBytes(path, bytes, false)
    await removeEntry(path + '.tmp')
  })
}

/** @type {Record<string, (path: string, text: any) => Promise<any>>} */
const ops = {
  ping: async () => {
    await rootPromise
    return true
  },
  // A crash between truncating the target and writing it leaves it empty: fall back to the tmp copy.
  read: (path) =>
    locked(path, 'shared', async () => {
      const text = await readText(path)
      if (text) return text
      return (await readText(path + '.tmp')) ?? text
    }),
  readBytes: (path) =>
    locked(path, 'shared', async () => {
      const bytes = await readBytes(path)
      if (bytes?.length) return bytes
      return (await readBytes(path + '.tmp')) ?? bytes
    }),
  write: (path, text) => replace(path, encoder.encode(text)),
  writeBytes: (path, bytes) => replace(path, bytes),
  append: (path, text) => locked(path, 'exclusive', () => writeBytes(path, encoder.encode(text), true)),
  // Also drop a leftover tmp copy, or read() would bring the file back.
  remove: (path) =>
    locked(path, 'exclusive', async () => {
      await removeEntry(path)
      await removeEntry(path + '.tmp')
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
    if (MUTATIONS.includes(op)) channel.postMessage({ path, from })
    self.postMessage({ id, result }, result instanceof Uint8Array ? [result.buffer] : [])
  } catch (err) {
    const { name = 'Error', message = String(err) } = /** @type {any} */ (err) ?? {}
    self.postMessage({ id, error: { name, message } })
  }
}
