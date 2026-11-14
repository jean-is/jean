// SPDX-License-Identifier: MIT
// Whiteboards' two tools (D747), as phase 0 measured them (npm run whiteboard): what a brain is given, how Jean takes what it sends, and
// the rows that makes, each area at the next free place in rows of four from the board's corner (./layout.js), which Jean's code
// writes, never the brain. Pure, so node --test runs it.
import { free } from './layout.js'

/** The capability's lines, within its 40 tokens. */
export const LINES = [
  { name: 'whiteboard', line: 'notes in named areas, to brainstorm, plan or sort ideas with others' },
  { name: 'whiteboard_change', line: "move, add or regroup a whiteboard's notes" },
]

/** @type {import('../../core/types.js').ToolSpec} */
export const WHITEBOARD = {
  name: 'whiteboard',
  description: 'Make a whiteboard the user keeps, beside the conversation, of short notes in named areas: for a brainstorm, a retrospective, a plan by weeks or ideas to sort. Give it a few areas first, three to seven, in order (by time for a plan), then its notes, a few words each, each in one area; an owner and a date where the user gave them.',
  parameters: {
    type: 'object',
    required: ['name', 'areas', 'notes'],
    properties: {
      name: { type: 'string' },
      areas: { type: 'array', items: { type: 'string' }, description: 'Their names, in order' },
      notes: { type: 'array', items: { type: 'object', required: ['words', 'area'], properties: {
        words: { type: 'string' }, area: { type: 'string', description: 'One of areas' }, owner: { type: 'string' }, due: { type: 'string', description: 'YYYY-MM-DD' },
      } } },
    },
  },
}

/** @type {import('../../core/types.js').ToolSpec} */
export const WHITEBOARD_CHANGE = {
  name: 'whiteboard_change',
  description: 'Change a whiteboard the user keeps: move notes by their id to an area, by its id or a new name, which makes it; add notes; rename an area. Sorting notes, keep to a few areas, three to seven. Read its areas, its notes and their ids with table_rows first. The user accepts or rejects each change.',
  parameters: {
    type: 'object',
    required: ['whiteboard'],
    properties: {
      whiteboard: { type: 'string', description: 'Its place, as whiteboard gave it' },
      move: { type: 'array', items: { type: 'object', required: ['note', 'area'], properties: { note: { type: 'string', description: 'Its id' }, area: { type: 'string', description: 'Its id, or a new name' } } } },
      add: { type: 'array', items: { type: 'object', required: ['words', 'area'], properties: { words: { type: 'string' }, area: { type: 'string', description: 'Its id, or a new name' }, owner: { type: 'string' }, due: { type: 'string', description: 'YYYY-MM-DD' } } } },
      rename: { type: 'array', items: { type: 'object', required: ['area', 'name'], properties: { area: { type: 'string', description: 'Its id' }, name: { type: 'string' } } } },
    },
  },
}

/** A brain's text, trimmed; '' for what isn't text. @param {unknown} value */
const text = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * What Jean makes of `whiteboard`'s arguments: its areas, each named once, in order, and its notes, each in one of them; or what
 * to fix, in words a brain reads. An area a note names that isn't listed is added after the others.
 * @param {any} args @returns {{ name: string, areas: string[], notes: { words: string, area: string, owner?: string, due?: string }[] }}
 */
export function made(args) {
  const name = text(args?.name)
  if (!name) throw new Error('Give the whiteboard a name.')
  const areas = [...new Set((Array.isArray(args?.areas) ? args.areas : []).map(text).filter(Boolean))]
  /** @type {{ words: string, area: string, owner?: string, due?: string }[]} */
  const notes = (Array.isArray(args?.notes) ? args.notes : []).map((/** @type {any} */ note) => ({ words: text(note?.words), area: text(note?.area), ...(text(note?.owner) && { owner: text(note.owner) }), ...(text(note?.due) && { due: text(note.due) }) }))
  if (!notes.length || notes.some((note) => !note.words)) throw new Error('Give each note a few words.')
  for (const note of notes) if (note.area && !areas.includes(note.area)) areas.push(note.area)
  if (!areas.length) throw new Error('Name its areas, and put each note in one.')
  return { name, areas, notes: notes.map((note) => ({ ...note, area: note.area || areas[0] })) }
}

/**
 * What Jean makes of `whiteboard_change`'s arguments against the whiteboard as it is: each area named by its id, a name that is
 * one area's alone, or a new name (an area to make); or what to fix. @param {any} args @param {Set<string>} ids the notes' ids
 * @param {{ id: string, name: string }[]} areas
 * @returns {{ move: { note: string, area: string }[], add: { words: string, area: string, owner?: string, due?: string }[], rename: { area: string, name: string }[], made: string[] }}
 */
export function changed(args, ids, areas) {
  /** @type {string[]} */
  const made = []
  /** An area's id, or a new name made an area's (`made`). @param {string} ref */
  const areaOf = (ref) => {
    if (areas.some((area) => area.id === ref)) return ref
    const named = areas.filter((area) => area.name === ref)
    if (named.length > 1) throw new Error(`Two areas are named "${ref}": give its id.`)
    if (named.length) return named[0].id
    if (!made.includes(ref)) made.push(ref)
    return ref
  }
  /** @type {{ note: string, area: string }[]} */
  const move = (Array.isArray(args?.move) ? args.move : []).map((/** @type {any} */ one) => ({ note: text(one?.note), area: text(one?.area) }))
  const unknown = move.filter((one) => !ids.has(one.note)).map((one) => one.note || '(none)')
  if (unknown.length) throw new Error(`No note has the id ${unknown.join(', ')}: take each id from table_rows.`)
  if (move.some((one) => !one.area)) throw new Error('Name the area each note moves to.')
  /** @type {{ words: string, area: string, owner?: string, due?: string }[]} */
  const add = (Array.isArray(args?.add) ? args.add : []).map((/** @type {any} */ one) => ({ words: text(one?.words), area: text(one?.area), ...(text(one?.owner) && { owner: text(one.owner) }), ...(text(one?.due) && { due: text(one.due) }) }))
  if (add.some((one) => !one.words || !one.area)) throw new Error('Give each new note a few words and its area.')
  /** @type {{ area: string, name: string }[]} */
  const rename = (Array.isArray(args?.rename) ? args.rename : []).map((/** @type {any} */ one) => ({ area: text(one?.area), name: text(one?.name) })).filter((/** @type {{ area: string, name: string }} */ one) => one.area && one.name)
  const lost = rename.filter((one) => !areas.some((area) => area.id === one.area || area.name === one.area)).map((one) => one.area)
  if (lost.length) throw new Error(`No area is ${lost.join(', ')}: take its id from table_rows.`)
  if (!move.length && !add.length && !rename.length) throw new Error('Nothing changed: move, add or rename.')
  return { move: move.map((one) => ({ ...one, area: areaOf(one.area) })), add: add.map((one) => ({ ...one, area: areaOf(one.area) })), rename: rename.map((one) => ({ ...one, area: areaOf(one.area) })), made }
}

/** A new row's id (core/ulid.js), given so that this stays pure. @typedef {() => string} Ids */
/** As many new ids as asked, in order, so that rows made in one change keep the order they came in: a ULID's random part orders those of one millisecond. @param {Ids} id @param {number} count */
const ordered = (id, count) => { const ids = Array.from({ length: count }, id).sort(); return () => /** @type {string} */ (ids.shift()) }
/** @typedef {{ row: string, set: Record<string, unknown> }} Edit */

/** A note's cells from what a brain sent: its words, its area's row, and an owner and a date where given. @param {{ words: string, owner?: string, due?: string }} note @param {string} area */
const noteOf = (note, area) => ({ note: note.words, area, ...(note.owner && { owner: note.owner }), ...(note.due && { due: note.due }) })

/**
 * The rows a whiteboard `whiteboard` made starts with: its areas, placed one after the other, then its notes, so that it fills as written.
 * @param {ReturnType<typeof made>} board @param {Ids} given @returns {Edit[]}
 */
export function rowsOf(board, given) {
  const id = ordered(given, board.areas.length + board.notes.length), areas = board.areas.map(() => id()), placed = /** @type {import('./layout.js').Box[]} */ ([])
  return [...board.areas.map((name, i) => {
    const count = board.notes.filter((note) => note.area === name).length, spot = free(placed, count)
    placed.push(spot)
    return { row: areas[i], set: { note: name, '@kind': 'area', '@spot': { area: null, x: spot.x, y: spot.y } } }
  }), ...board.notes.map((note) => ({ row: id(), set: noteOf(note, areas[board.areas.indexOf(note.area)]) }))]
}

/**
 * The change `whiteboard_change` makes: the areas it names new, placed where nothing lies, notes moved to their areas (back into each one's
 * flow) and added, areas renamed. @param {ReturnType<typeof changed>} change @param {import('./layout.js').Box[]} taken the areas there now @param {Ids} given @returns {Edit[]}
 */
export function editsOf(change, taken, given) {
  const id = ordered(given, change.made.length + change.add.length), fresh = new Map(change.made.map((name) => [name, id()])), at = (/** @type {string} */ area) => fresh.get(area) ?? area, placed = [...taken]
  return [...change.made.map((name) => {
    const spot = free(placed, [...change.move, ...change.add].filter((one) => one.area === name).length)
    placed.push(spot)
    return { row: /** @type {string} */ (fresh.get(name)), set: { note: name, '@kind': 'area', '@spot': { area: null, x: spot.x, y: spot.y } } }
  }), ...change.move.map((one) => ({ row: one.note, set: { area: at(one.area) } })), ...change.add.map((one) => ({ row: id(), set: noteOf(one, at(one.area)) })),
  ...change.rename.map((one) => ({ row: one.area, set: { note: one.name } }))]
}
