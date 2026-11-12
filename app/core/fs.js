// SPDX-License-Identifier: MIT
// Paths, an in-memory FS (tests, fallback), and JSON helpers.
// The browser FS lives in ui/opfs.js; both implement the FS type in types.d.ts.

/** @import { FS, DirEntry } from './types.js' */

/** Like normalizePath, but '' (the root) is allowed. @param {string} path @returns {string} */
export function normalizeDir(path) {
  if (typeof path !== 'string') throw new TypeError(`Path must be a string, got ${typeof path}`)
  if (path.startsWith('/') || path.includes('\\')) throw new TypeError(`Invalid path: ${path}`)
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  if (trimmed && trimmed.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) throw new TypeError(`Invalid path: ${path}`)
  return trimmed
}

/** @param {string} path relative POSIX path, e.g. "projects/x/project.md" @returns {string} */
export const normalizePath = (path) => normalizeDir(path) || (() => { throw new TypeError('Empty path') })()

/** Empty parts are ignored; joining nothing gives '' (the root). @param {...string} parts */
export const join = (...parts) => parts.map(normalizeDir).filter(Boolean).join('/')

/** @param {string} path @returns {string} '' for top-level entries */
export const dirname = (path) => ((normalized) => normalized.slice(0, Math.max(normalized.lastIndexOf('/'), 0)))(normalizePath(path))

/** @param {string} path @returns {string} */
export const basename = (path) => ((normalized) => normalized.slice(normalized.lastIndexOf('/') + 1))(normalizePath(path))

/** Entries in the order of their names' code units, as every FS lists them. @param {DirEntry} a @param {DirEntry} b */
export const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** File content as text, or a TypeError. @param {unknown} text @returns {string} */
export function assertText(text) { if (typeof text !== 'string') throw new TypeError(`File content must be a string, got ${typeof text}`); return text }

/** File content as bytes, or a TypeError. @param {unknown} bytes @returns {Uint8Array} */
export function assertBytes(bytes) { if (!(bytes instanceof Uint8Array)) throw new TypeError('File content must be a Uint8Array'); return bytes }

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
  const put = (key, value) => { files.set(key, value); changed.set(key, (clock = Math.max(clock + 1, Date.now()))) }
  /** @param {string} key */
  const text = (key) => ((value) => (value === undefined ? null : typeof value === 'string' ? value : decoder.decode(value)))(files.get(key))
  for (const [path, value] of Object.entries(initial)) put(normalizePath(path), value)

  /** @param {string} path */
  const isDir = (path) => [...files.keys()].some((key) => key.startsWith(path + '/'))

  /** A path a file can be written at, normalized: not a directory, and under none of the files. @param {string} path */
  const writable = (path) => {
    const key = normalizePath(path)
    if (isDir(key)) throw new DOMException(`Is a directory: ${key}`, 'TypeMismatchError')
    for (let dir = dirname(key); dir; dir = dirname(dir)) if (files.has(dir)) throw new DOMException(`Not a directory: ${dir}`, 'TypeMismatchError')
    return key
  }

  return {
    read: async (path) => text(normalizePath(path)),
    readBytes: async (path) => ((value) => (value === undefined ? null : typeof value === 'string' ? encoder.encode(value) : value.slice()))(files.get(normalizePath(path))),
    write: async (path, value) => put(writable(path), assertText(value)),
    writeBytes: async (path, bytes) => put(writable(path), assertBytes(bytes).slice()),
    append: async (path, value) => ((key) => put(key, (text(key) ?? '') + assertText(value)))(writable(path)),
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
    remove: async (path) => { const key = normalizePath(path); for (const file of [...files.keys()]) if (file === key || file.startsWith(key + '/')) files.delete(file) },
    exists: async (path) => ((key) => files.has(key) || isDir(key))(normalizePath(path)),
    stat: async (path) => ((key, value) => (value === undefined ? null : { size: typeof value === 'string' ? encoder.encode(value).length : value.length, lastModified: changed.get(key) ?? 0 }))(normalizePath(path), files.get(normalizePath(path))),
    watch: () => () => {},
    estimate: async () => ({ usage: [...files.values()].reduce((usage, value) => usage + value.length, 0) }),
  }
}

/** The FS seen from one of its folders as its root, a profile's (D228): nothing above is reached or heard of. @param {FS} fs @param {string} dir @returns {FS} */
export function rootedFS(fs, dir) {
  const at = (/** @type {string} */ path) => join(dir, normalizePath(path))
  const view = /** @type {any} */ (Object.fromEntries(['read', 'readBytes', 'write', 'writeBytes', 'append', 'remove', 'exists', 'stat']
    .map((op) => [op, (/** @type {string} */ path, /** @type {any} */ value) => /** @type {any} */ (fs)[op](at(path), value)])))
  return { ...view, list: (path) => fs.list(join(dir, path)), estimate: fs.estimate,
    watch: (cb, options) => fs.watch?.((path) => { if (path.startsWith(`${dir}/`)) cb(path.slice(dir.length + 1)) }, options) ?? (() => {}) }
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
  try { return JSON.parse(text) } catch { return fallback }
}

/** @param {FS} fs @param {string} path @param {any} value */
export const writeJSON = (fs, path, value) => fs.write(path, JSON.stringify(value, null, 2) + '\n')
