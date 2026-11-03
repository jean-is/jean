// The FS type (core/types.d.ts) on a folder of this computer, for Jean outside a browser: the folder
// Sync mirrors Jean's files to, or the one an editor works in. In Jean's, a file written whole goes to
// a .tmp beside it first, then takes its place; a mirror never carries a .tmp (caps/sync/mirror.js), so
// a round never takes in half a file. In the user's own folder, it is written where it is, as the
// browser's folderFS does, keeping its links and permissions.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { release } from 'node:os'
import { dirname, join } from 'node:path'
import { byName, normalizeDir, normalizePath } from '../app/core/fs.js'

/** @import { FS } from '../app/core/types.js' */

/** What reading something that isn't there, or isn't a file, gives. */
const none = () => null
/** Where a Mac keeps a folder's mark, `#S` for one that syncs, as iCloud Drive does. */
const MARK = 'com.apple.icon.folder#S'

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

/**
 * On a Mac from macOS 26, the ～ Finder draws on a folder Sync now keeps, in the folder's own colour and
 * style (D686): the mark Customize Folder writes, which iCloud keeps, and the custom-icon flag (0x0400 in
 * FinderInfo's flags, at byte 8) that has Finder read it. Never over an icon or a mark the person chose;
 * where it fails, the folder stays as it was.
 * @param {string} folder an absolute path
 */
export async function showTilde(folder) {
  if (process.platform !== 'darwin' || Number(release().split('.')[0]) < 25) return
  const xattr = (/** @type {string[]} */ ...args) => new Promise((done, failed) => execFile('/usr/bin/xattr', [...args, folder], (error, out) => (error ? failed(error) : done(out))))
  const info = await xattr('-px', 'com.apple.FinderInfo').then((hex) => Buffer.from(String(hex).replace(/\s/g, ''), 'hex'), () => Buffer.alloc(32))
  if (info[8] & 0x04 || (await xattr('-p', MARK).then(() => true, () => false))) return
  info[8] |= 0x04
  await xattr('-w', MARK, JSON.stringify({ emoji: '～' })).then(() => xattr('-wx', 'com.apple.FinderInfo', info.toString('hex'))).catch(() => {})
}
