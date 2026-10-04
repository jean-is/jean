// A folder the browser can't open in place (Safari, Firefox; D141): a read-only copy, its files read
// as they are on the computer, what Jean changes kept beside them, and saved as one zip. It lasts
// the visit.
import { normalizeDir, normalizePath } from '../../core/fs.js'
import { writeZip } from '../../core/zip.js'

/** @typedef {import('../../core/types.js').FS & { changed: () => string[], zip: () => Promise<Uint8Array> }} CopyFS */

// Never copied, whatever is in them (D141's listing leaves them out too).
const SKIP = /(^|\/)(\.git|node_modules)(\/|$)/
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** @param {Map<string, File>} files by path in the folder @returns {CopyFS} */
export function copyFS(files) {
  /** @type {Map<string, Uint8Array>} what Jean wrote */
  const written = new Map()
  /** @type {Map<string, number>} */
  const stamps = new Map()
  const removed = new Set()
  let clock = Date.now()
  const paths = () => [...new Set([...files.keys(), ...written.keys()])].filter((path) => !removed.has(path))
  /** @param {string} path */
  const bytes = async (path) => {
    const key = normalizePath(path)
    if (removed.has(key)) return null
    const file = files.get(key)
    return written.get(key) ?? (file ? new Uint8Array(await file.arrayBuffer()) : null)
  }
  /** @param {string} path @param {Uint8Array} data */
  const put = async (path, data) => {
    const key = normalizePath(path)
    removed.delete(key)
    written.set(key, data)
    stamps.set(key, (clock = Math.max(clock + 1, Date.now())))
  }
  return {
    read: async (path) => {
      const data = await bytes(path)
      return data && decoder.decode(data)
    },
    readBytes: bytes,
    write: (path, text) => put(path, encoder.encode(text)),
    writeBytes: (path, data) => put(path, data.slice()),
    append: async (path, text) => {
      const data = await bytes(path)
      await put(path, encoder.encode((data ? decoder.decode(data) : '') + text))
    },
    async list(dir) {
      const prefix = normalizeDir(dir) ? `${normalizeDir(dir)}/` : ''
      /** @type {Map<string, 'file' | 'directory'>} */
      const children = new Map()
      for (const path of paths()) {
        if (!path.startsWith(prefix)) continue
        const [name, ...rest] = path.slice(prefix.length).split('/')
        children.set(name, rest.length ? 'directory' : 'file')
      }
      return [...children].map(([name, kind]) => ({ name, kind })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    },
    async remove(path) {
      const key = normalizePath(path)
      for (const each of paths()) {
        if (each !== key && !each.startsWith(`${key}/`)) continue
        removed.add(each)
        written.delete(each)
      }
    },
    async exists(path) {
      const key = normalizePath(path)
      return paths().some((each) => each === key || each.startsWith(`${key}/`))
    },
    async stat(path) {
      const key = normalizePath(path)
      if (removed.has(key)) return null
      const data = written.get(key)
      const file = files.get(key)
      return data ? { size: data.length, lastModified: stamps.get(key) ?? 0 } : file ? { size: file.size, lastModified: file.lastModified } : null
    },
    changed: () => [...written.keys()].filter((path) => !removed.has(path)).sort(),
    zip() {
      return writeZip([...written].filter(([path]) => !removed.has(path)).map(([name, data]) => ({ name, bytes: data })))
    },
  }
}

/**
 * The files of a folder picked with `<input webkitdirectory>`, by path inside it, and its name.
 * @param {Iterable<File>} list @returns {{ name: string, files: Map<string, File> }}
 */
export function pickedFiles(list) {
  /** @type {Map<string, File>} */
  const files = new Map()
  let name = ''
  for (const file of list) {
    const [top, ...rest] = (file.webkitRelativePath || file.name).split('/')
    name ||= top
    const path = rest.join('/')
    if (path && !SKIP.test(path)) files.set(path, file)
  }
  return { name, files }
}

/**
 * The files of a dropped folder (`webkitGetAsEntry`), by path inside it.
 * @param {FileSystemDirectoryEntry} root @returns {Promise<Map<string, File>>}
 */
export async function droppedFiles(root) {
  /** @type {Map<string, File>} */
  const files = new Map()
  /** @param {FileSystemDirectoryEntry} dir @param {string} at */
  const visit = async (dir, at) => {
    const reader = dir.createReader()
    // A directory reader gives its entries a hundred at a time, then nothing.
    for (let batch = await read(reader); batch.length; batch = await read(reader)) {
      for (const entry of batch) {
        const path = at ? `${at}/${entry.name}` : entry.name
        if (SKIP.test(path)) continue
        if (entry.isDirectory) await visit(/** @type {FileSystemDirectoryEntry} */ (entry), path)
        else files.set(path, await new Promise((resolve, reject) => /** @type {FileSystemFileEntry} */ (entry).file(resolve, reject)))
      }
    }
  }
  await visit(root, '')
  return files
}

/** @param {FileSystemDirectoryReader} reader @returns {Promise<FileSystemEntry[]>} */
const read = (reader) => new Promise((resolve, reject) => reader.readEntries(resolve, reject))
