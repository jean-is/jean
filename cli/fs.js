// The FS type (core/types.d.ts) on a folder of this computer, for Jean outside a browser: the folder
// Sync mirrors Jean's files to, or the one an editor works in. In Jean's, a file written whole goes to
// a .tmp beside it first, then takes its place; a mirror never carries a .tmp (caps/sync/mirror.js), so
// a round never takes in half a file. In the user's own folder, it is written where it is, as the
// browser's folderFS does, keeping its links and permissions.
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { normalizeDir, normalizePath } from '../core/fs.js'

/** @import { FS, DirEntry } from '../core/types.js' */

/** What reading something that isn't there, or isn't a file, gives. */
const none = () => null

/** @param {DirEntry} a @param {DirEntry} b */
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** @param {string} root an absolute path @param {{ swap?: boolean }} [options] swap: through a .tmp @returns {FS} */
export function nodeFS(root, { swap = true } = {}) {
  const at = (/** @type {string} */ path) => join(root, normalizePath(path))
  /** @param {string} path @param {string | Uint8Array} data */
  const write = async (path, data) => {
    const file = at(path)
    await mkdir(dirname(file), { recursive: true })
    if (!swap) return writeFile(file, data)
    const temp = `${file}.${randomUUID().slice(0, 8)}.tmp`
    try {
      await writeFile(temp, data)
      await rename(temp, file)
    } catch (error) {
      await rm(temp, { force: true })
      throw error
    }
  }
  return {
    read: async (path) => readFile(at(path), 'utf8').catch(none),
    readBytes: async (path) => {
      const bytes = await readFile(at(path)).catch(none)
      return bytes && new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    },
    write: async (path, text) => {
      if (typeof text !== 'string') throw new TypeError(`File content must be a string, got ${typeof text}`)
      await write(path, text)
    },
    writeBytes: async (path, bytes) => {
      if (!(bytes instanceof Uint8Array)) throw new TypeError('File content must be a Uint8Array')
      await write(path, bytes)
    },
    append: async (path, text) => {
      if (typeof text !== 'string') throw new TypeError(`File content must be a string, got ${typeof text}`)
      await mkdir(dirname(at(path)), { recursive: true })
      await appendFile(at(path), text)
    },
    list: async (dir) => {
      const entries = await readdir(join(root, normalizeDir(dir)), { withFileTypes: true }).catch(() => [])
      return entries.flatMap((entry) => (entry.isFile() || entry.isDirectory() ? [{ name: entry.name, kind: entry.isDirectory() ? /** @type {const} */ ('directory') : /** @type {const} */ ('file') }] : [])).sort(byName)
    },
    remove: (path) => rm(at(path), { recursive: true, force: true }),
    exists: (path) => stat(at(path)).then(() => true, () => false),
    stat: async (path) => {
      const found = await stat(at(path)).catch(none)
      return found?.isFile() ? { size: found.size, lastModified: Math.floor(found.mtimeMs) } : null
    },
  }
}
