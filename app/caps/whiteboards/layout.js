// SPDX-License-Identifier: MIT
// Where everything on a whiteboard lies (D747), the same on every screen: one fixed board, in its own units (a CSS pixel at 100%), from
// the start corner of the direction it was made in. Each area at its spot, as wide as four notes or what it holds, and as tall; its notes
// in rows of four under its head (its flow), those placed by hand at their spots in it, its texts and lines too; on the open ground, what
// was put there; on the shelf, the notes that wait, the newest first; arrows between what lies on the board. What lies on top was moved
// last: the newest spot, then the row's id, the same order on every copy, areas under the rest and arrows over them. Pure, so node --test runs it.
import { kindOf, spotOf } from '../tables/table.js'

/** A note's size, the gaps between notes, an area's head, and the fine grid a drop settles on, an eighth of a note. */
export const NOTE = { w: 160, h: 120 }, GAP = 16, HEAD = 48, GRID = 20
/** An area's least width: four notes and their gaps. */
export const WIDE = 4 * NOTE.w + 5 * GAP
/** How many colours areas take in turn, the eighth starting again. */
export const HUES = 7

/** @typedef {{ x: number, y: number, w: number, h: number }} Box */
/** @typedef {import('../tables/changes.js').Row} Row */
/** A thing on the board: where it lies, in its area or on the ground, and whether a person placed it there; an arrow's ends, x and y of each. @typedef {Box & { row: Row, kind: 'note' | 'text' | 'line' | 'arrow', area: string | null, placed: boolean, ends?: number[] }} Item */
/** @typedef {Box & { row: Row, hue: number }} Area */

/** A whole number on the fine grid. @param {number} n */
export const snap = (n) => Math.round(n / GRID) * GRID
/** How tall an area of `count` notes in its flow is. @param {number} count */
const tall = (count) => HEAD + Math.max(1, Math.ceil(count / 4)) * (NOTE.h + GAP) + GAP
/** @param {Box} a @param {Box} b */
const over = (a, b) => a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP

/**
 * Where an area of `count` notes goes that Jean makes: the first place, in rows of four from the board's corner, where it lies over none
 * already there. @param {Box[]} taken @param {number} count @returns {Box}
 */
export function free(taken, count) {
  const w = WIDE, h = tall(count), ys = [0, ...taken.map((box) => box.y + box.h + 3 * GAP)].sort((a, b) => a - b)
  for (const y of ys) for (let column = 0; column < 4; column++) {
    const box = { x: column * (WIDE + 3 * GAP), y, w, h }
    if (!taken.some((one) => over(box, one))) return box
  }
  return { x: 0, y: (ys.at(-1) ?? 0) + h, w, h }
}

/** A text's or a line's size: a text wraps at four notes wide, a title in larger words; a line is as large as its points. @param {Row} row */
function sized(row) {
  if (kindOf(row) === 'line') {
    const path = /** @type {number[]} */ (row.cells['@path'] ?? [])
    return { w: Math.max(GRID, ...path.filter((_, i) => i % 2 === 0)), h: Math.max(GRID, ...path.filter((_, i) => i % 2 === 1)) }
  }
  if (kindOf(row) === 'text') {
    const title = row.cells['@size'] === 'title', each = title ? 28 : 56, length = String(row.cells.note ?? '').length
    return { w: Math.min(WIDE, Math.max(NOTE.w, length * (title ? 24 : 12))), h: Math.max(1, Math.ceil(length / each)) * (title ? 44 : 26) }
  }
  return { ...NOTE }
}

/** Where a line from the middle of one box toward the middle of another leaves the first, a little past its edge. @param {Box} from @param {Box} to */
function edge(from, to) {
  const x = from.x + from.w / 2, y = from.y + from.h / 2, dx = to.x + to.w / 2 - x, dy = to.y + to.h / 2 - y, k = Math.min((from.w / 2 + 6) / Math.abs(dx), (from.h / 2 + 6) / Math.abs(dy))
  return Number.isFinite(k) ? [Math.round(x + dx * k), Math.round(y + dy * k)] : [x, y]
}
/** An arrow's path: its line, then its head at the second end. @param {number[]} ends */
export function arrowPath([x1, y1, x2, y2]) {
  const angle = Math.atan2(y2 - y1, x2 - x1), wing = (/** @type {number} */ turn) => `${Math.round(x2 - 14 * Math.cos(angle + turn))} ${Math.round(y2 - 14 * Math.sin(angle + turn))}`
  return `M${x1} ${y1}L${x2} ${y2}M${wing(0.45)}L${x2} ${y2}L${wing(-0.45)}`
}

/**
 * The place of a creation a note's words are, whole, as a Creations card gives it dragged: `[[place|name]]`, a table's block, or a place
 * alone; else null. @param {unknown} words
 */
export const placeOf = (words) => /^\s*(?:\[\[([^|\]\n]+)(?:\|[^\]\n]*)?\]\]|```table\n([^\s`]+)\n```|([a-z][\w-]*\/[^\s[\]|]+))\s*$/.exec(String(words ?? ''))?.slice(1).find(Boolean) ?? null

/** What a note shows at its foot: the first two of its other cells that hold something, as words. @param {{ id: string, deleted?: string }[]} properties @param {Row} row */
export const footOf = (properties, row) => properties.filter((property) => !property.deleted && property.id !== 'note' && property.id !== 'area' && row.cells[property.id] != null).slice(0, 2).map((property) => String(row.cells[property.id]))

/** What lies on top: the later spot, then the row's id. @param {{ row: Row }} a @param {{ row: Row }} b */
const above = (a, b) => ((x, y) => (x !== y ? (x < y ? -1 : 1) : a.row.id < b.row.id ? -1 : 1))(a.row.stamps['@spot']?.at ?? '', b.row.stamps['@spot']?.at ?? '')

/**
 * The board laid out: its areas, lowest first; what lies on them and on the ground, lowest first; the shelf's notes, the newest first; and
 * the box everything fits in. @param {Row[]} rows @returns {{ areas: Area[], items: Item[], shelf: Row[], bounds: Box }}
 */
export function layout(rows) {
  const areaRows = rows.filter((row) => kindOf(row) === 'area'), ids = new Set(areaRows.map((row) => row.id)), held = new Map(areaRows.map((row) => [row.id, /** @type {Row[]} */ ([])]))
  /** @type {Item[]} */
  const items = [], shelf = /** @type {Row[]} */ ([])
  for (const row of rows) {
    if (kindOf(row) === 'area' || kindOf(row) === 'arrow') continue
    const area = ids.has(/** @type {string} */ (row.cells.area)) ? /** @type {string} */ (row.cells.area) : null, spot = spotOf(row, ids)
    if (area) held.get(area)?.push(row)
    else if (spot) items.push({ row, kind: /** @type {Item['kind']} */ (kindOf(row)), area: null, placed: true, x: spot.x, y: spot.y, ...sized(row) })
    else if (kindOf(row) === 'note') shelf.push(row)
  }
  /** @type {Area[]} */
  const areas = [], taken = /** @type {Box[]} */ ([])
  // Those with a spot first, so that one without takes a place none has.
  for (const row of [...areaRows].sort((a, b) => Number(!spotOf(a, ids)) - Number(!spotOf(b, ids)))) {
    const inside = /** @type {Row[]} */ (held.get(row.id)), flow = inside.filter((one) => !spotOf(one, ids)), placed = inside.filter((one) => spotOf(one, ids))
    const mine = [...flow.map((one, i) => ({ row: one, kind: /** @type {Item['kind']} */ (kindOf(one)), area: row.id, placed: false, x: GAP + (i % 4) * (NOTE.w + GAP), y: HEAD + GAP + Math.floor(i / 4) * (NOTE.h + GAP), ...NOTE })),
      ...placed.map((one) => ({ row: one, kind: /** @type {Item['kind']} */ (kindOf(one)), area: row.id, placed: true, x: Number(spotOf(one, ids)?.x), y: Number(spotOf(one, ids)?.y), ...sized(one) }))]
    const w = Math.max(WIDE, ...mine.map((one) => one.x + one.w + GAP)), h = Math.max(tall(flow.length), ...mine.map((one) => one.y + one.h + GAP)), spot = spotOf(row, ids)
    const box = spot ? { x: spot.x, y: spot.y, w, h } : { ...free(taken, flow.length), w, h }
    taken.push(box)
    areas.push({ row, hue: areaRows.indexOf(row) % HUES, ...box })
    items.push(...mine.map((one) => ({ ...one, x: box.x + one.x, y: box.y + one.y })))
  }
  // Arrows, from the edge of one thing to the edge of the other, while both lie on the board; under everything but the areas.
  const at = new Map([...areas, ...items].map((one) => [one.row.id, one]))
  for (const row of rows) {
    const [a, b] = kindOf(row) === 'arrow' && Array.isArray(row.cells['@ends']) ? row.cells['@ends'].map((id) => at.get(id)) : []
    if (!a || !b) continue
    const ends = [...edge(a, b), ...edge(b, a)]
    items.push({ row, kind: 'arrow', area: null, placed: false, ends, x: Math.min(ends[0], ends[2]) - GAP, y: Math.min(ends[1], ends[3]) - GAP, w: Math.abs(ends[2] - ends[0]) + 2 * GAP, h: Math.abs(ends[3] - ends[1]) + 2 * GAP })
  }
  const all = [...areas, ...items], x = Math.min(0, ...all.map((one) => one.x)), y = Math.min(0, ...all.map((one) => one.y))
  return { areas: areas.sort(above), items: items.sort((a, b) => Number(b.kind === 'arrow') - Number(a.kind === 'arrow') || above(a, b)), shelf: shelf.reverse(), bounds: { x, y, w: Math.max(WIDE, ...all.map((one) => one.x + one.w)) - x, h: Math.max(NOTE.h, ...all.map((one) => one.y + one.h)) - y } }
}
