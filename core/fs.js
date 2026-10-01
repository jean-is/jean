// Paths, an in-memory FS (tests, fallback), and JSON helpers.
// The browser FS lives in ui/opfs.js; both implement the FS typedef in types.js.

/**
 * @typedef {import('./types.js').FS} FS
 * @typedef {import('./types.js').DirEntry} DirEntry
 */

/**
 * Like normalizePath, but '' (the root) is allowed.
 * @param {string} path
 * @returns {string}
 */
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

/**
 * @param {string} path relative POSIX path, e.g. "projects/x/project.md"
 * @returns {string}
 */
export function normalizePath(path) {
  const normalized = normalizeDir(path)
  if (normalized === '') throw new TypeError('Empty path')
  return normalized
}

/**
 * Empty parts are ignored; joining nothing gives '' (the root).
 * @param {...string} parts
 */
export function join(...parts) {
  return parts.map(normalizeDir).filter(Boolean).join('/')
}

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

/** @param {DirEntry} a @param {DirEntry} b */
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** @param {unknown} text */
function assertText(text) {
  if (typeof text !== 'string') throw new TypeError(`File content must be a string, got ${typeof text}`)
}

/**
 * FS backed by a Map. Directories are implicit: one exists while a file lives under it.
 * Mirrors OPFS type conflicts (a file where a directory is expected, or the reverse).
 * @param {Record<string, string>} [initial] seed files, keyed by path
 * @returns {FS}
 */
export function memoryFS(initial = {}) {
  /** @type {Map<string, string>} */
  const files = new Map()
  for (const [path, text] of Object.entries(initial)) files.set(normalizePath(path), text)

  /** @param {string} path */
  const isDir = (path) => {
    for (const key of files.keys()) if (key.startsWith(path + '/')) return true
    return false
  }

  /** @param {string} path */
  const assertWritable = (path) => {
    if (isDir(path)) throw new DOMException(`Is a directory: ${path}`, 'TypeMismatchError')
    for (let dir = dirname(path); dir; dir = dirname(dir)) {
      if (files.has(dir)) throw new DOMException(`Not a directory: ${dir}`, 'TypeMismatchError')
    }
  }

  return {
    async read(path) {
      return files.get(normalizePath(path)) ?? null
    },
    async write(path, text) {
      const key = normalizePath(path)
      assertText(text)
      assertWritable(key)
      files.set(key, text)
    },
    async append(path, text) {
      const key = normalizePath(path)
      assertText(text)
      assertWritable(key)
      files.set(key, (files.get(key) ?? '') + text)
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
    watch: () => () => {},
    async estimate() {
      let usage = 0
      for (const text of files.values()) usage += text.length
      return { usage }
    },
  }
}

/**
 * @param {FS} fs
 * @param {string} path
 * @param {any} [fallback] returned when the file is missing or not valid JSON
 */
export async function readJSON(fs, path, fallback = null) {
  const text = await fs.read(path)
  if (text === null) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/**
 * @param {FS} fs
 * @param {string} path
 * @param {any} value
 */
export async function writeJSON(fs, path, value) {
  await fs.write(path, JSON.stringify(value, null, 2) + '\n')
}
