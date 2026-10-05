// /workspace (D162): what a conversation's computer holds of its folder, or of its project's
// workspace. Before a run, Jean sends it what changed since it last sent; after, it writes back
// what the run changed, unless the file moved meanwhile. Works on any FS; tested in Node.
import { walkFolder, exactText } from '../folders/work.js'
import { join } from '../../core/fs.js'

/** @import { FS } from '../../core/types.js' */
/**
 * What a computer holds, by path: the size and date each file was at when it got it, or null for a
 * version of its own that Jean didn't keep (sent again next time).
 * @typedef {Map<string, [number, number] | null>} Held
 */

/** A file's size and date: its own where the FS keeps them, else its size. @param {FS} fs @param {string} path @param {Uint8Array} [bytes] */
async function stampOf(fs, path, bytes) {
  const stat = await fs.stat?.(path)
  if (stat) return /** @type {[number, number]} */ ([stat.size, stat.lastModified])
  const read = bytes ?? (await fs.readBytes(path))
  return read ? /** @type {[number, number]} */ ([read.length, 0]) : null
}

/** @param {[number, number] | null | undefined} a @param {[number, number] | null} b */
const same = (a, b) => Boolean(a && b && a[0] === b[0] && a[1] === b[1])

/**
 * What to send before a run: the files that changed since the computer got them, and the paths it
 * holds that are gone, `.git`, `node_modules` and what `.gitignore` names aside. Past `limit` bytes,
 * files are left out, and named.
 * @param {FS} fs @param {Held} held @param {{ limit: number }} options
 * @returns {Promise<{ put: Record<string, ArrayBuffer>, gone: string[], left: string[] }>}
 */
export async function outgoing(fs, held, { limit }) {
  const { entries, more } = await walkFolder(fs)
  /** @type {Record<string, ArrayBuffer>} */
  const put = {}
  const left = more ? ['…'] : []
  const listed = new Set()
  let total = 0
  for (const { path, kind } of entries) {
    if (kind !== 'file') continue
    const stamp = await stampOf(fs, path)
    if (!stamp) continue
    if (total + stamp[0] > limit) {
      left.push(path)
      continue
    }
    total += stamp[0]
    listed.add(path)
    if (same(held.get(path), stamp)) continue
    const bytes = await fs.readBytes(path)
    if (!bytes) continue
    put[path] = bytes.slice().buffer
    held.set(path, stamp)
  }
  const gone = [...held.keys()].filter((path) => !listed.has(path) && !left.includes(path))
  for (const path of gone) held.delete(path)
  return { put, gone, left }
}

/**
 * What a run changed, as the user sees it before it is kept: the text of each file before and after
 * (null before for a new one, null after for one taken away), or no text for what isn't text.
 * @param {FS} fs @param {{ put: Record<string, ArrayBuffer>, gone: string[] }} changes
 * @returns {Promise<{ path: string, oldText: string | null, newText: string | null, binary: boolean }[]>}
 */
export async function preview(fs, { put, gone }) {
  const shown = []
  for (const [path, buffer] of Object.entries(put)) {
    const was = await fs.readBytes(path)
    const before = was && exactText(was)
    const after = exactText(new Uint8Array(buffer))
    shown.push({ path, oldText: was ? before : null, newText: after, binary: after === null || (was !== null && before === null) })
  }
  for (const path of gone) {
    const was = await fs.readBytes(path)
    if (was) shown.push({ path, oldText: exactText(was), newText: null, binary: exactText(was) === null })
  }
  return shown
}

/**
 * Writes back what a run changed, file by file: refused where the file moved since the computer got
 * it (another program, a sync), which the computer then gets again.
 * @param {FS} fs @param {Held} held @param {{ put: Record<string, ArrayBuffer>, gone: string[] }} changes
 * @returns {Promise<{ saved: string[], removed: string[], refused: string[] }>}
 */
export async function incoming(fs, held, { put, gone }) {
  /** @type {{ saved: string[], removed: string[], refused: string[] }} */
  const done = { saved: [], removed: [], refused: [] }
  for (const [path, buffer] of Object.entries(put)) {
    const now = await stampOf(fs, path)
    if (now && held.has(path) && !same(held.get(path), now)) {
      held.set(path, null)
      done.refused.push(path)
      continue
    }
    const bytes = new Uint8Array(buffer)
    await fs.writeBytes(path, bytes)
    held.set(path, await stampOf(fs, path, bytes))
    done.saved.push(path)
  }
  for (const path of gone) {
    const now = await stampOf(fs, path)
    if (now && !same(held.get(path), now)) {
      held.set(path, null)
      done.refused.push(path)
      continue
    }
    await fs.remove(path)
    held.delete(path)
    done.removed.push(path)
  }
  return done
}

/** Changes Jean didn't keep (the user said no): the computer gets the files as they are next time. @param {Held} held @param {{ put: Record<string, ArrayBuffer>, gone: string[] }} changes */
export function decline(held, { put, gone }) {
  for (const path of [...Object.keys(put), ...gone]) held.set(path, null)
}

/** A folder of an FS as an FS of its own: a project's workspace. @param {FS} fs @param {string} dir @returns {FS} */
export function within(fs, dir) {
  const at = (/** @type {string} */ path) => join(dir, path)
  return {
    read: (path) => fs.read(at(path)),
    readBytes: (path) => fs.readBytes(at(path)),
    write: (path, text) => fs.write(at(path), text),
    writeBytes: (path, bytes) => fs.writeBytes(at(path), bytes),
    append: (path, text) => fs.append(at(path), text),
    list: (path) => fs.list(at(path)),
    remove: (path) => fs.remove(at(path)),
    exists: (path) => fs.exists(at(path)),
    ...(fs.stat && { stat: (/** @type {string} */ path) => /** @type {NonNullable<FS['stat']>} */ (fs.stat)(at(path)) }),
  }
}
