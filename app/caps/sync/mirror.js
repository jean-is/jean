// Sync's work (D157), on any two FS: Jean's files here, their mirror there, a folder the user's
// cloud drive keeps in sync with their other computers (a drive of its own would be another FS). A
// round compares each side with what it was at the last round (the base, in .cache/): what changed
// on one side goes to the other, a deletion too; what changed on both is settled by the file's kind.
// A conversation grows (unless gone back to a request, D188), so the longer wins; two that went apart both stay, the mirror's as a
// new conversation; a table's changes and columns merge (D474, D491); a Markdown file's words merge line by line from the
// version both last had (ui/merge.js); a file named by its hash never differs; anything else, the newer wins. Keys,
// caches, settings.json and what drives and systems leave in a folder stay where they are. What a round
// takes from a conversation here goes only as `removing` lets it, as any removal does (D412).
import { walk, dirname, readJSON, writeJSON } from '../../core/fs.js'
import { ulid } from '../../core/ulid.js'
import { listProjects, stringifyFrontMatter } from '../../core/settings.js'
import { parseLine, deleteConversation } from '../../core/conversations.js'

/** @typedef {import('../../core/types.js').FS} FS */
/** @typedef {import('../../core/types.js').Envelope} Envelope */
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
/** A collection's two files, which merge (D491, D507). */
const TABLE = /\/collections\/[^/]+\/(changes\.jsonl|collection\.json)$/
/** A Markdown file, whose version both sides had after a round is kept, which a change on both merges from. */
const MARKDOWN = /\.md$/
/** What a first round takes first: words before pictures and films. */
const TEXT = /\.(jsonl|md|json)$/
/** A Markdown file's front matter. @param {string} text */
const head = (text) => /^---\n[\s\S]*?\n---\n?/.exec(text)?.[0] ?? ''

/**
 * Two versions of a table's file as one: every change of either, each cell its latest; the newer
 * collection.json with the other's columns and choices. Null when one can't be read: the newer then wins.
 * @param {string} path @param {Uint8Array} x @param {Uint8Array} y
 */
function mergedTable(path, x, y) {
  const [a, b] = [x, y].map((bytes) => new TextDecoder().decode(bytes))
  return (path.endsWith('.jsonl') ? import('../tables/changes.js').then(({ merge, parseChanges, stringifyChanges }) => stringifyChanges(merge(parseChanges(a), parseChanges(b))))
    : import('../tables/table.js').then(({ mergeTables, readTable }) => `${JSON.stringify(mergeTables(readTable(a), readTable(b)), null, 2)}\n`)).then((text) => new TextEncoder().encode(text), () => null)
}

/**
 * Two versions of a Markdown file as one, from the version both had: its words line by line, every change of either kept, and
 * the newer one's front matter. Null without that version, or when they can't be lined up: the newer then wins.
 * @param {Uint8Array | null} base @param {Uint8Array} x @param {Uint8Array} y @param {boolean} newer whether x is
 */
async function mergedText(base, x, y, newer) {
  const [o, a, b] = [base, x, y].map((bytes) => new TextDecoder().decode(bytes ?? undefined))
  const body = base && (await import('../../ui/merge.js')).merge3(o.slice(head(o).length), a.slice(head(a).length), b.slice(head(b).length))
  return typeof body === 'string' ? new TextEncoder().encode(head(newer ? a : b) + body) : null
}

/** @param {FS} fs @param {string} path @returns {Promise<Stat>} */
const stat = (fs, path) => /** @type {NonNullable<FS['stat']>} */ (fs.stat)(path)
/** @param {Stat} a @param {Stat} b */
const alike = (a, b) => (a && b ? a.size === b.size && a.lastModified === b.lastModified : a === b)
/** @param {Stat} a @param {number[]} [was] */
const as = (a, was = []) => alike(a, was.length ? { size: was[0], lastModified: was[1] } : null)

/** @param {Uint8Array} bytes @param {Uint8Array} prefix */
const startsWith = (bytes, prefix) => prefix.length <= bytes.length && prefix.every((byte, i) => byte === bytes[i])
/** @param {Uint8Array} x @param {Uint8Array | null} y */
const equal = (x, y) => y?.length === x.length && startsWith(x, y)
/** A write or a removal the other side refused, its file having moved since it was read (the store's conditional writes): false. @param {any} error */
const refused = (error) => { if (error?.name === 'InvalidModificationError') return false; throw error }

/** A conversation file's lines. @param {Uint8Array | null} bytes */
const lines = (bytes) => new TextDecoder().decode(bytes ?? undefined).split('\n')
/** A conversation's records, past its header, that the file taking its place doesn't hold. @param {Uint8Array | null} mine @param {Uint8Array | null} theirs @returns {Envelope[]} */
const lost = (mine, theirs, held = new Set(lines(theirs))) => lines(mine).slice(1).filter((line) => !held.has(line)).map(parseLine).filter(Boolean)

/**
 * Whether Jean can sync with a folder: one it syncs with already, or an empty one, which gets the
 * mark. A folder of other files is refused, so nothing of the user's comes in.
 * @param {FS} there @param {{ by: string, now?: Date }} options
 */
export async function claim(there, { by, now = new Date() }) {
  if (await there.exists(MARK)) return true
  if ((await there.list('')).some((entry) => carried(entry.name))) return false
  return writeJSON(there, MARK, { format: 1, kind: 'mirror', createdAt: now.toISOString(), by }).then(() => true)
}

/**
 * One round, both sides made the same as far as they can be. A file that changes while the round works on it, is `busy`
 * (a conversation being answered), whose records `removing` won't let go, or that fails, waits for the next round; the
 * others go on, and the first failure is thrown once the base is kept, with the paths that came in all the same. `cache` names where the base is kept, `<cache>.json`,
 * and the versions Markdown merges from, `<cache>/<path>`; `carry` what goes, the base's paths too.
 * @param {FS} here @param {FS} there
 * @param {{ cache?: string, carry?: (path: string) => boolean, busy?: (path: string) => boolean,
 *   removing?: (removals: { task: string, records: Envelope[], all: boolean }[], act: () => Promise<unknown>) => Promise<boolean> }} [options]
 * @returns {Promise<string[]>} the paths that came in here
 */
export async function syncRound(here, there, { cache = BASE.slice(0, -5), carry = carried, busy = () => false, removing = (_, act) => act().then(() => true) } = {}) {
  /** @type {Base} */
  let base = (await readJSON(here, `${cache}.json`, null))?.files ?? {}
  const had = (/** @type {string} */ path) => `${cache}/${path}`
  const [mine, theirs] = await Promise.all([here, there].map(async (fs) => new Set((await walk(fs)).filter(carry))))
  // A side that holds nothing it held (a folder emptied, a drive not down yet) is new: nothing on it is taken as deleted.
  const known = Object.keys(base)
  if (known.length && (!known.some((path) => mine.has(path)) || !known.some((path) => theirs.has(path)))) base = {}
  /** @type {Base} */
  const next = {}
  /** @type {string[]} */
  const came = []
  /** @param {string} path @param {Stat} a @param {Stat} b */
  const keep = (path, a, b) => { if (a && b) next[path] = [a.size, a.lastModified, b.size, b.lastModified] }
  /**
   * Writes over what was seen, unless it moved meanwhile or is the same already (a drive's copy, dated anew); a Markdown file's
   * version both have is kept once written, and only `held`, both sides then holding it. @param {FS} fs @param {string} path
   * @param {Uint8Array | null} bytes @param {Stat} seen
   */
  const put = async (fs, path, bytes, seen, held = true) => {
    const now = await stat(fs, path)
    if (!bytes || !alike(now, seen)) return null
    const same = now?.size === bytes.length && equal(bytes, await fs.readBytes(path))
    if (!same && !(await fs.writeBytes(path, bytes).then(() => true, refused))) return null
    if (held && MARKDOWN.test(path)) await here.writeBytes(had(path), bytes)
    if (!same && fs === here) came.push(path)
    return same ? now : stat(fs, path)
  }
  /** @param {FS} fs @param {string} path @param {Stat} seen */
  const drop = async (fs, path, seen) => {
    if (!seen || !alike(await stat(fs, path), seen)) return
    // As a conversation goes, so a record that comes late can't bring it back without its header.
    if (!(await deleteConversation(fs, path).then(() => true, refused))) return
    if (MARKDOWN.test(path)) await here.remove(had(path)).catch(() => {})
    if (fs === here) came.push(path)
    for (let dir = dirname(path); dir && !(await fs.list(dir)).length; dir = dir.includes('/') ? dirname(dir) : '') await fs.remove(dir)
  }
  /** A conversation kept as a new one, with its own ULID, on both sides. @param {string} path @param {Uint8Array | null} bytes */
  const fork = async (path, bytes) => {
    const id = ulid()
    const [head, ...rest] = lines(bytes)
    const to = `${dirname(path)}/${id}.jsonl`
    const copy = new TextEncoder().encode([JSON.stringify({ ...JSON.parse(head), id }), ...rest].join('\n'))
    await Promise.all([here.writeBytes(to, copy), there.writeBytes(to, copy)])
    came.push(to)
    keep(to, await stat(here, to), await stat(there, to))
  }

  /** @type {unknown} */
  let failed
  /** @param {string} path */
  const one = async (path) => {
    const was = base[path]
    if (busy(path)) { if (was) next[path] = was; return }
    const [a, b] = await Promise.all([stat(here, path), stat(there, path)])
    const movedHere = !was || !as(a, was)
    const movedThere = !was || !as(b, was.slice(2))
    if (!movedHere && !movedThere) next[path] = was
    else if (movedHere && (!movedThere || !b)) {
      if (a) keep(path, a, await put(there, path, await here.readBytes(path), b))
      else await drop(there, path, b)
      // A table's file that moved only there merges too: a drive that settles two computers by keeping one's file has dropped the other's changes.
    } else if ((!movedHere && !(a && b && TABLE.test(path))) || !a) {
      // Deleted there, or gone back to a request: what the conversation loses here is asked about first.
      const records = a && CONVERSATION.test(path) ? lost(await here.readBytes(path).catch(() => null), b && await there.readBytes(path)) : []
      const went = await removing(records.length ? [{ task: path, records, all: !b }] : [], async () => {
        if (!b) await drop(here, path, a)
        // A drive that couldn't settle two versions keeps one under another name: a conversation of its own.
        else if (!a && CONVERSATION.test(path) && !BY_ULID.test(path) && await fork(path, await there.readBytes(path)).then(() => true, () => false)) await drop(there, path, b)
        else keep(path, await put(here, path, await there.readBytes(path), a), b)
      })
      if (!went && was) next[path] = was
    } else {
      const [x, y] = await Promise.all([here.readBytes(path), there.readBytes(path)])
      if (!x || !y) return
      const same = equal(x, y)
      const merged = !same && (TABLE.test(path) ? await mergedTable(path, x, y) : MARKDOWN.test(path) && await mergedText(await here.readBytes(had(path)), x, y, Number(a?.lastModified) >= Number(b?.lastModified)))
      if (same && MARKDOWN.test(path)) await here.writeBytes(had(path), x)
      if (same) keep(path, a, b)
      // Merged, the version both have is kept only once both hold it: a write refused there leaves the last one.
      else if (merged) { const took = await put(here, path, merged, a, false); keep(path, took, await put(there, path, merged, b, Boolean(took))) }
      else if (path.endsWith('.jsonl') && startsWith(y, x)) keep(path, await put(here, path, y, a), b)
      else if (path.endsWith('.jsonl') && !startsWith(x, y)) {
        await fork(path, y)
        keep(path, a, await put(there, path, x, b))
      } else if (path.endsWith('.jsonl') || (a && b && a.lastModified >= b.lastModified)) keep(path, a, await put(there, path, x, b))
      else keep(path, await put(here, path, y, a), b)
    }
  }
  const paths = [...new Set([...mine, ...theirs, ...Object.keys(base).filter(carry)])]
  // A first round, with nothing known, takes four paths at a time, words first: a new device's whole store.
  if (!Object.keys(base).length) paths.sort((p, q) => Number(!TEXT.test(p)) - Number(!TEXT.test(q)))
  await Promise.all(Array.from({ length: Object.keys(base).length ? 1 : 4 }, async () => {
    for (let path; (path = paths.shift()) !== undefined;) await one(path).catch((error) => { failed ??= error; if (base[path]) next[path] = base[path] })
  }))
  await writeJSON(here, `${cache}.json`, { format: 1, files: next })
  // What came in all the same goes with the failure, to be shown.
  if (failed) throw Object.assign(/** @type {object} */ (failed), { came })
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
