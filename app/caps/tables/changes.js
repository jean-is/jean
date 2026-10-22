// A table's changes.jsonl (D474, D491): one line per row a change
// touches, { row, set: { column: value }, at, by, why? }, or { row, delete: true|false, at, by }.
// Each cell is its latest change: by time, then author, then value as JSON, so two copies merge by
// the union of their lines, in any order, the same everywhere. A row is gone while its latest
// deletion is later than every change to its cells: a change stamped after it brings it back whole.
// Times come from a hybrid clock: a change is stamped after every line its copy holds, so a clock
// that is behind never buries a change made after another was seen. Lines of one change share
// their stamp; undo writes the values from before an author's latest change, not past a compacted
// mark, which a file compacted later starts with. Pure, so Node's tests run it.
import { canonical, TIME } from './table.js'

/** @typedef {{ row: string, set?: Record<string, unknown>, delete?: boolean, at: string, by: string, why?: string, undoes?: string }} Change */
/** Where a file was compacted: undo stops there. @typedef {{ compacted: string }} Mark */
/** @typedef {Change | Mark} Line */
/** @typedef {{ at: string, by: string }} Stamp */
/** @typedef {{ row: string, set?: Record<string, unknown>, delete?: boolean }} Edit */
/** stamps: who wrote each cell's value, and when; deleted: only on a row that is gone. @typedef {{ id: string, cells: Record<string, unknown>, stamps: Record<string, Stamp>, created: Stamp, changed: Stamp, deleted?: Stamp }} Row */
/** @typedef {Stamp & { value: unknown, json: string }} Candidate */
/** @typedef {{ cells: Map<string, Candidate>, gone?: Candidate, created: Stamp, changed?: Stamp }} Winners */

/** @param {any} line @returns {line is Line} */
const isLine = (line) => Boolean(line) && typeof line === 'object' && (typeof line.compacted === 'string'
  ? TIME.test(line.compacted)
  : typeof line.row === 'string' && TIME.test(line.at) && typeof line.by === 'string' && (line.set !== undefined || line.delete !== undefined)
    && (line.set === undefined || (Boolean(line.set) && typeof line.set === 'object' && !Array.isArray(line.set)))
    && (line.delete === undefined || typeof line.delete === 'boolean'))

/** A changes.jsonl's lines; a half-written last line, after a crash, and what isn't a change are left out. @param {string} text @returns {Line[]} */
export function parseChanges(text) {
  /** @type {Line[]} */
  const lines = []
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    try {
      const line = JSON.parse(raw)
      if (isLine(line)) lines.push(line)
    } catch {}
  }
  return lines
}

/** @param {Line[]} lines */
export const stringifyChanges = (lines) => lines.map((line) => `${JSON.stringify(line)}\n`).join('')

/** @param {Line} line */
const timeOf = (line) => ('compacted' in line ? line.compacted : line.at)

/** When the next change is stamped: now, unless the copy holds a line from later, then just after it. @param {Line[]} lines @param {number} [now] */
export function nextAt(lines, now = Date.now()) {
  const latest = lines.reduce((most, line) => Math.max(most, Date.parse(timeOf(line))), 0)
  return new Date(Math.max(now, latest + 1)).toISOString()
}

/**
 * The lines one change writes, after `lines`, all with its stamp.
 * @param {Line[]} lines @param {Edit[]} edits @param {{ by: string, now?: number, why?: string, undoes?: string }} options
 * @returns {Change[]}
 */
export function stamp(lines, edits, { by, now, why, undoes }) {
  const at = nextAt(lines, now)
  return edits.map((edit) => ({ row: edit.row, ...(edit.set ? { set: edit.set } : {}), ...(edit.delete !== undefined ? { delete: edit.delete } : {}), at, by, ...(why ? { why } : {}), ...(undoes ? { undoes } : {}) }))
}

/** The later of two values: by time, then author, then JSON. @param {Candidate} a @param {Candidate} b */
const order = (a, b) => (a.at !== b.at ? (a.at < b.at ? -1 : 1) : a.by !== b.by ? (a.by < b.by ? -1 : 1) : a.json < b.json ? -1 : a.json > b.json ? 1 : 0)
/** @param {Stamp} a @param {Stamp} b */
const before = (a, b) => a.at < b.at || (a.at === b.at && a.by < b.by)

/** Each row's winning value for each cell, and for whether it is deleted. @param {Line[]} lines @returns {Map<string, Winners>} */
function winners(lines) {
  /** @type {Map<string, Winners>} */
  const rows = new Map()
  for (const line of lines) {
    if (!('row' in line)) continue
    const stamp = { at: line.at, by: line.by }
    let row = rows.get(line.row)
    if (!row) rows.set(line.row, (row = { cells: new Map(), created: stamp }))
    else if (before(stamp, row.created)) row.created = stamp
    if (line.set) {
      if (!row.changed || before(row.changed, stamp)) row.changed = stamp
      for (const [id, value] of Object.entries(line.set)) {
        const candidate = { ...stamp, value, json: canonical(value) }
        const kept = row.cells.get(id)
        if (!kept || order(kept, candidate) < 0) row.cells.set(id, candidate)
      }
    }
    if (line.delete !== undefined) {
      const candidate = { ...stamp, value: line.delete, json: String(line.delete) }
      if (!row.gone || order(row.gone, candidate) < 0) row.gone = candidate
    }
  }
  return rows
}

/** Whether a row is gone: its latest deletion is later than every change to its cells. @param {Winners} row */
const isGone = (row) => row.gone?.value === true && !(row.changed && row.changed.at > row.gone.at)

/**
 * The rows the lines make, in the order they were made; with `deleted`, those gone too.
 * @param {Line[]} lines @param {{ deleted?: boolean }} [options] @returns {Row[]}
 */
export function fold(lines, { deleted = false } = {}) {
  /** @type {Row[]} */
  const rows = []
  for (const [id, row] of winners(lines)) {
    const gone = isGone(row)
    if (gone && !deleted) continue
    const cells = Object.fromEntries([...row.cells].filter(([, candidate]) => candidate.value !== null).map(([key, candidate]) => [key, candidate.value]))
    const stamps = Object.fromEntries([...row.cells].map(([key, { at, by }]) => [key, { at, by }]))
    rows.push({ id, cells, stamps, created: row.created, changed: row.changed ?? row.created, ...(gone && row.gone ? { deleted: { at: row.gone.at, by: row.gone.by } } : {}) })
  }
  return rows.sort((a, b) => (before(a.created, b.created) ? -1 : before(b.created, a.created) ? 1 : a.id < b.id ? -1 : 1))
}

/** Lines in the file's order: marks first, then by time, author and text. @param {Line} a @param {Line} b */
const lineOrder = (a, b) => {
  const [x, y] = [a, b].map((line) => `${'compacted' in line ? 0 : 1}\u0000${timeOf(line)}\u0000${'by' in line ? line.by : ''}\u0000${canonical(line)}`)
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Two copies' lines as one: every line of either, once, however its keys were ordered.
 * @param {Line[]} a @param {Line[]} b @returns {Line[]}
 */
export function merge(a, b) {
  /** @type {Map<string, Line>} */
  const lines = new Map()
  for (const line of [...a, ...b]) if (!lines.has(canonical(line))) lines.set(canonical(line), line)
  return [...lines.values()].sort(lineOrder)
}

/**
 * Undoes `author`'s latest change not undone yet, since the file was last compacted: each cell it
 * set goes back to its value before, unless someone changed it since (skipped); a row it made goes,
 * unless someone wrote in it since; a row it deleted comes back. The lines are `by`'s, and say which
 * change they undo. Null when there is none.
 * @param {Line[]} lines @param {{ author: string, by: string, now?: number }} options
 * @returns {{ lines: Change[], skipped: { row: string, property: string }[] } | null}
 */
export function undo(lines, { author, by, now }) {
  const horizon = lines.reduce((latest, line) => ('compacted' in line && line.compacted > latest ? line.compacted : latest), '')
  const changes = /** @type {Change[]} */ (lines.filter((line) => 'row' in line))
  const undone = new Set(changes.map((line) => line.undoes))
  const at = changes.reduce((latest, line) => (line.by === author && !line.undoes && line.at >= horizon && !undone.has(line.at) && line.at > latest ? line.at : latest), '')
  if (!at) return null
  const current = winners(changes)
  const previous = winners(changes.filter((line) => before(line, { at, by: author })))
  /** @type {Map<string, Edit>} */
  const edits = new Map()
  /** @type {{ row: string, property: string }[]} */
  const skipped = []
  for (const line of changes.filter((one) => one.by === author && one.at === at)) {
    const latest = /** @type {Winners} */ (current.get(line.row))
    const then = previous.get(line.row)
    const edit = edits.get(line.row) ?? /** @type {Edit} */ (edits.set(line.row, { row: line.row }).get(line.row))
    const untouched = [...latest.cells.values(), ...(latest.gone ? [latest.gone] : [])].every((candidate) => candidate.at === at && candidate.by === author)
    if (!then && untouched) {
      edit.delete = true
      continue
    }
    for (const [key, value] of Object.entries(line.set ?? {})) {
      if (latest.cells.get(key)?.json !== canonical(value)) skipped.push({ row: line.row, property: key })
      else (edit.set ??= {})[key] = then?.cells.get(key)?.value ?? null
    }
    if (line.delete !== undefined && latest.gone?.json === String(line.delete)) edit.delete = Boolean(then?.gone?.value)
  }
  const written = [...edits.values()].filter((edit) => edit.set || edit.delete !== undefined)
  return { lines: written.length ? stamp(lines, written, { by, now, undoes: at }) : [], skipped }
}
