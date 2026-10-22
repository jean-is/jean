// Sync's work (D157), on any two FS: Jean's files here, their mirror there, a folder the user's
// cloud drive keeps in sync with their other computers (a drive of its own would be another FS). A
// round compares each side with what it was at the last round (the base, in .cache/): what changed
// on one side goes to the other, a deletion too; what changed on both is settled by the file's kind.
// A conversation grows (unless gone back to a request, D188), so the longer wins; two that went apart both stay, the mirror's as a
// new conversation; a table's changes and columns merge (D474, D491); a file named by its hash never differs; anything else,
// the newer wins. Keys,
// caches, settings.json and what drives and systems leave in a folder stay where they are.
import { walk, dirname, readJSON, writeJSON } from '../../core/fs.js'
import { ulid } from '../../core/ulid.js'
import { listProjects, stringifyFrontMatter } from '../../core/settings.js'

/** @typedef {import('../../core/types.js').FS} FS */
/** @typedef {{ size: number, lastModified: number } | null} Stat */
/** What each side's file was at the last round: its size and date here, then there. @typedef {Record<string, number[]>} Base */

/** The mark of a folder Jean syncs with, at its top. */
export const MARK = 'mirror.json'
/** The base, which a round reads and writes; lost, the next round takes nothing as deleted. */
export const BASE = '.cache/sync.json'

/** What a mirror carries: not keys, caches or this device's settings, nor what drives and systems leave in a folder. @param {string} path */
export const carried = (path) => path !== MARK && path !== 'settings.json' && !/(^|\/)(\.|~\$)|\\|\.tmp$|(^|\/)(desktop\.ini|Thumbs\.db|Icon\r)$/.test(path)

/** A conversation's file, by its ULID; a drive's copy of one has another name. */
const CONVERSATION = /\/conversations\/[^/]+\.jsonl$/
const BY_ULID = /\/[0-9A-HJKMNP-TV-Z]{26}\.jsonl$/
/** A table's two files, which merge (D491). */
const TABLE = /\/tables\/[^/]+\/(changes\.jsonl|table\.json)$/

/**
 * Two versions of a table's file as one: every change of either, each cell its latest; the newer
 * table.json with the other's columns and choices. Null when one can't be read: the newer then wins.
 * @param {string} path @param {Uint8Array} x @param {Uint8Array} y
 */
async function mergedTable(path, x, y) {
  const [a, b] = [x, y].map((bytes) => new TextDecoder().decode(bytes))
  try {
    if (path.endsWith('.jsonl')) {
      const { merge, parseChanges, stringifyChanges } = await import('../tables/changes.js')
      return new TextEncoder().encode(stringifyChanges(merge(parseChanges(a), parseChanges(b))))
    }
    const { mergeTables, readTable } = await import('../tables/table.js')
    return new TextEncoder().encode(`${JSON.stringify(mergeTables(readTable(a), readTable(b)), null, 2)}\n`)
  } catch {
    return null
  }
}

/** @param {FS} fs @param {string} path @returns {Promise<Stat>} */
const stat = (fs, path) => /** @type {NonNullable<FS['stat']>} */ (fs.stat)(path)
/** @param {Stat} a @param {Stat} b */
const alike = (a, b) => (a && b ? a.size === b.size && a.lastModified === b.lastModified : a === b)
/** @param {Stat} a @param {number[]} [was] */
const as = (a, was = []) => alike(a, was.length ? { size: was[0], lastModified: was[1] } : null)

/** @param {Uint8Array} bytes @param {Uint8Array} prefix */
function startsWith(bytes, prefix) {
  if (prefix.length > bytes.length) return false
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return false
  return true
}

/**
 * Whether Jean can sync with a folder: one it syncs with already, or an empty one, which gets the
 * mark. A folder of other files is refused, so nothing of the user's comes in.
 * @param {FS} there @param {{ by: string, now?: Date }} options
 */
export async function claim(there, { by, now = new Date() }) {
  if (await there.exists(MARK)) return true
  if ((await there.list('')).some((entry) => carried(entry.name))) return false
  await writeJSON(there, MARK, { format: 1, kind: 'mirror', createdAt: now.toISOString(), by })
  return true
}

/**
 * One round, both sides made the same as far as they can be. A file that changes while the round
 * works on it, or is `busy` (a conversation being answered), waits for the next round.
 * @param {FS} here @param {FS} there @param {{ busy?: (path: string) => boolean }} [options]
 * @returns {Promise<string[]>} the paths that came in here
 */
export async function syncRound(here, there, { busy = () => false } = {}) {
  /** @type {Base} */
  let base = (await readJSON(here, BASE, null))?.files ?? {}
  const [mine, theirs] = await Promise.all([here, there].map(async (fs) => new Set((await walk(fs)).filter(carried))))
  // A side that holds nothing it held (a folder emptied, a drive not down yet) is new: nothing on it is taken as deleted.
  const known = Object.keys(base)
  if (known.length && (!known.some((path) => mine.has(path)) || !known.some((path) => theirs.has(path)))) base = {}
  /** @type {Base} */
  const next = {}
  /** @type {string[]} */
  const came = []
  /** @param {string} path @param {Stat} a @param {Stat} b */
  const keep = (path, a, b) => { if (a && b) next[path] = [a.size, a.lastModified, b.size, b.lastModified] }
  /** Writes over what was seen, unless it moved meanwhile or is the same already (a drive's copy, dated anew). @param {FS} fs @param {string} path @param {Uint8Array | null} bytes @param {Stat} seen */
  const put = async (fs, path, bytes, seen) => {
    const now = await stat(fs, path)
    if (!bytes || !alike(now, seen)) return null
    if (now?.size === bytes.length && startsWith(bytes, (await fs.readBytes(path)) ?? new Uint8Array(1))) return now
    await fs.writeBytes(path, bytes)
    if (fs === here) came.push(path)
    return stat(fs, path)
  }
  /** @param {FS} fs @param {string} path @param {Stat} seen */
  const drop = async (fs, path, seen) => {
    if (!seen || !alike(await stat(fs, path), seen)) return
    await fs.remove(path)
    if (fs === here) came.push(path)
    for (let dir = dirname(path); dir && !(await fs.list(dir)).length; dir = dir.includes('/') ? dirname(dir) : '') await fs.remove(dir)
  }
  /** A conversation kept as a new one, with its own ULID, on both sides. @param {string} path @param {Uint8Array | null} bytes */
  const fork = async (path, bytes) => {
    const id = ulid()
    const [head, ...rest] = new TextDecoder().decode(bytes ?? undefined).split('\n')
    const header = JSON.parse(head)
    const to = `${dirname(path)}/${id}.jsonl`
    const copy = new TextEncoder().encode([JSON.stringify({ ...header, id }), ...rest].join('\n'))
    await Promise.all([here.writeBytes(to, copy), there.writeBytes(to, copy)])
    came.push(to)
    keep(to, await stat(here, to), await stat(there, to))
  }

  for (const path of new Set([...mine, ...theirs, ...Object.keys(base)])) {
    const was = base[path]
    if (busy(path)) {
      if (was) next[path] = was
      continue
    }
    const [a, b] = await Promise.all([stat(here, path), stat(there, path)])
    const movedHere = !was || !as(a, was)
    const movedThere = !was || !as(b, was.slice(2))
    if (!movedHere && !movedThere) next[path] = was
    else if (movedHere && (!movedThere || !b)) {
      if (a) keep(path, a, await put(there, path, await here.readBytes(path), b))
      else await drop(there, path, b)
    } else if (!movedHere || !a) {
      if (!b) await drop(here, path, a)
      // A drive that couldn't settle two versions keeps one under another name: a conversation of its own.
      else if (!a && CONVERSATION.test(path) && !BY_ULID.test(path) && await fork(path, await there.readBytes(path)).then(() => true, () => false)) await drop(there, path, b)
      else keep(path, await put(here, path, await there.readBytes(path), a), b)
    } else {
      const [x, y] = await Promise.all([here.readBytes(path), there.readBytes(path)])
      if (!x || !y) continue
      const merged = TABLE.test(path) && !(x.length === y.length && startsWith(x, y)) && await mergedTable(path, x, y)
      if (x.length === y.length && startsWith(x, y)) keep(path, a, b)
      else if (merged) keep(path, await put(here, path, merged, a), await put(there, path, merged, b))
      else if (path.endsWith('.jsonl') && startsWith(y, x)) keep(path, await put(here, path, y, a), b)
      else if (path.endsWith('.jsonl') && !startsWith(x, y)) {
        await fork(path, y)
        keep(path, a, await put(there, path, x, b))
      } else if (path.endsWith('.jsonl') || (a && b && a.lastModified >= b.lastModified)) keep(path, a, await put(there, path, x, b))
      else keep(path, await put(here, path, y, a), b)
    }
  }
  await writeJSON(here, BASE, { format: 1, files: next })
  return came
}

/**
 * Two computers each made a home project before they synced: the oldest stays the home. A newer
 * one with nothing in it goes; one with conversations stays, as a project. Each computer settles
 * them the same way, so both agree. @param {FS} fs @returns {Promise<boolean>} whether one changed
 */
export async function settleHomes(fs) {
  const homes = (await listProjects(fs)).filter((project) => project.data.default === true)
  for (const { dir, data, body } of homes.slice(1)) {
    if ((await walk(fs, dir)).every((path) => path === `${dir}/project.md`)) await fs.remove(dir)
    else {
      const { default: _, ...rest } = data
      await fs.write(`${dir}/project.md`, stringifyFrontMatter(rest, body))
    }
  }
  return homes.length > 1
}
