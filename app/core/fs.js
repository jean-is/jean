// Paths, an in-memory FS (tests, fallback), and JSON helpers.
// The browser FS lives in ui/opfs.js; both implement the FS type in types.d.ts.

/** @import { FS, DirEntry } from './types.js' */

/** Like normalizePath, but '' (the root) is allowed. @param {string} path @returns {string} */
export function normalizeDir(path) {
  if (typeof path !== 'string') throw new TypeError(`Path must be a string, got ${typeof path}`)
  if (path.startsWith('/') || path.includes('\\')) throw new TypeError(`Invalid path: ${path}`)
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  if (trimmed === '') return ''
  for (const segment of trimmed.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') throw new TypeError(`Invalid path: ${path}`)
  }
  return trimmed
}

/** @param {string} path relative POSIX path, e.g. "projects/x/project.md" @returns {string} */
export function normalizePath(path) {
  const normalized = normalizeDir(path)
  if (normalized === '') throw new TypeError('Empty path')
  return normalized
}

/** Empty parts are ignored; joining nothing gives '' (the root). @param {...string} parts */
export const join = (...parts) => parts.map(normalizeDir).filter(Boolean).join('/')

/** @param {string} path @returns {string} '' for top-level entries */
export function dirname(path) {
  const normalized = normalizePath(path)
  const slash = normalized.lastIndexOf('/')
  return slash < 0 ? '' : normalized.slice(0, slash)
}

/** @param {string} path */
export function basename(path) {
  const normalized = normalizePath(path)
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

/** Entries in the order of their names' code units, as every FS lists them. @param {DirEntry} a @param {DirEntry} b */
export const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** @param {unknown} text */
function assertText(text) {
  if (typeof text !== 'string') throw new TypeError(`File content must be a string, got ${typeof text}`)
}

/** @param {unknown} bytes */
function assertBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('File content must be a Uint8Array')
}

export const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * FS backed by a Map. Directories are implicit: one exists while a file lives under it.
 * Mirrors OPFS type conflicts (a file where a directory is expected, or the reverse).
 * @param {Record<string, string | Uint8Array>} [initial] seed files, keyed by path
 * @returns {FS}
 */
export function memoryFS(initial = {}) {
  /** @type {Map<string, string | Uint8Array>} */
  const files = new Map()
  // When each file last changed: always later than before, even within a millisecond.
  /** @type {Map<string, number>} */
  const changed = new Map()
  let clock = 0
  /** @param {string} key @param {string | Uint8Array} value */
  const put = (key, value) => {
    files.set(key, value)
    changed.set(key, (clock = Math.max(clock + 1, Date.now())))
  }
  /** @param {string} key */
  const text = (key) => {
    const value = files.get(key)
    return value === undefined ? null : typeof value === 'string' ? value : decoder.decode(value)
  }
  for (const [path, value] of Object.entries(initial)) put(normalizePath(path), value)

  /** @param {string} path */
  const isDir = (path) => {
    for (const key of files.keys()) if (key.startsWith(path + '/')) return true
    return false
  }

  /** A path a file can be written at, normalized: not a directory, and under none of the files. @param {string} path */
  const writable = (path) => {
    const key = normalizePath(path)
    if (isDir(key)) throw new DOMException(`Is a directory: ${key}`, 'TypeMismatchError')
    for (let dir = dirname(key); dir; dir = dirname(dir)) if (files.has(dir)) throw new DOMException(`Not a directory: ${dir}`, 'TypeMismatchError')
    return key
  }

  return {
    async read(path) {
      return text(normalizePath(path))
    },
    async readBytes(path) {
      const value = files.get(normalizePath(path))
      return value === undefined ? null : typeof value === 'string' ? encoder.encode(value) : value.slice()
    },
    async write(path, value) {
      assertText(value)
      put(writable(path), value)
    },
    async writeBytes(path, bytes) {
      assertBytes(bytes)
      put(writable(path), bytes.slice())
    },
    async append(path, value) {
      assertText(value)
      const key = writable(path)
      put(key, (text(key) ?? '') + value)
    },
    async list(dir) {
      const normalized = normalizeDir(dir)
      const prefix = normalized ? normalized + '/' : ''
      /** @type {Map<string, DirEntry['kind']>} */
      const children = new Map()
      for (const key of files.keys()) {
        if (!key.startsWith(prefix)) continue
        const [name, ...rest] = key.slice(prefix.length).split('/')
        children.set(name, rest.length ? 'directory' : 'file')
      }
      return [...children].map(([name, kind]) => ({ name, kind })).sort(byName)
    },
    async remove(path) {
      const key = normalizePath(path)
      for (const file of [...files.keys()]) {
        if (file === key || file.startsWith(key + '/')) files.delete(file)
      }
    },
    async exists(path) {
      const key = normalizePath(path)
      return files.has(key) || isDir(key)
    },
    async stat(path) {
      const key = normalizePath(path)
      const value = files.get(key)
      return value === undefined ? null : { size: typeof value === 'string' ? encoder.encode(value).length : value.length, lastModified: changed.get(key) ?? 0 }
    },
    watch: () => () => {},
    async estimate() {
      let usage = 0
      for (const value of files.values()) usage += value.length
      return { usage }
    },
  }
}

/** Every file under `dir`, recursively, as paths relative to the root. @param {FS} fs @param {string} [dir] @returns {Promise<string[]>} */
export async function walk(fs, dir = '') {
  /** @type {string[]} */
  const paths = []
  for (const entry of await fs.list(dir)) {
    const path = join(dir, entry.name)
    if (entry.kind === 'directory') paths.push(...await walk(fs, path))
    else paths.push(path)
  }
  return paths
}

/** @param {FS} fs @param {string} path @param {any} [fallback] returned when the file is missing or not valid JSON */
export async function readJSON(fs, path, fallback = null) {
  const text = await fs.read(path)
  if (text === null) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/** @param {FS} fs @param {string} path @param {any} value */
export const writeJSON = (fs, path, value) => fs.write(path, JSON.stringify(value, null, 2) + '\n')
