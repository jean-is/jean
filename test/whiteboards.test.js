// SPDX-License-Identifier: MIT
// Whiteboards (D747): where everything on one lies, the same on every screen, and the rows the brain's tools make, each area Jean
// makes placed where nothing lies, by Jean's code.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layout, free, snap, arrowPath, placeOf, footOf, NOTE, GAP, HEAD, WIDE } from '../app/caps/whiteboards/layout.js'
import { made, changed, rowsOf, editsOf } from '../app/caps/whiteboards/tool.js'
import { svgOf } from '../app/caps/whiteboards/picture.js'
import { fold, stamp } from '../app/caps/tables/changes.js'
import { readFile } from 'node:fs/promises'
import { DIRECTORY, readFor, readDirectory, listedOwn } from '../app/caps/skills/directory.js'
import { skillLines } from '../app/core/skills.js'

/** A row's ULID, by number. @param {number} n */
const R = (n) => `01K8${String(n).padStart(22, '0')}`
/** @param {number} minutes */
const T = (minutes) => new Date(Date.UTC(2026, 10, 14, 9, minutes)).toISOString()
/** @param {string} row @param {Record<string, unknown>} set @param {number} at */
const line = (row, set, at) => ({ row, set, at: T(at), by: 'user' })
/** Ids in order, as core/ulid.js gives them. */
const counter = () => { let n = 100; return () => R(n++) }

test('layout: an area at its spot, four notes to a row in its flow, one placed by hand where it was put, and the area as large as what it holds', () => {
  const rows = fold([line(R(1), { note: 'Went well', '@kind': 'area', '@spot': { area: null, x: 0, y: 0 } }, 1),
    ...[2, 3, 4, 5, 6].map((n) => line(R(n), { note: `Note ${n}`, area: R(1) }, 2)),
    line(R(7), { note: 'Far', area: R(1), '@spot': { area: R(1), x: 1000, y: 40 } }, 3)])
  const { areas, items } = layout(rows), at = (/** @type {string} */ id) => items.find((one) => one.row.id === id)
  assert.deepEqual([at(R(2))?.x, at(R(2))?.y], [GAP, HEAD + GAP])
  assert.deepEqual([at(R(5))?.x, at(R(6))?.x, at(R(6))?.y], [GAP + 3 * (NOTE.w + GAP), GAP, HEAD + GAP + NOTE.h + GAP])
  assert.deepEqual([at(R(7))?.x, at(R(7))?.placed], [1000, true])
  assert.deepEqual([areas[0].w, areas[0].h], [1000 + NOTE.w + GAP, HEAD + 2 * (NOTE.h + GAP) + GAP])
})

test('layout: what an area holds moves with it; a note on the ground stays where it was dropped; the shelf, the newest first; the one moved last on top', () => {
  const lines = [line(R(1), { note: 'A', '@kind': 'area', '@spot': { area: null, x: 2000, y: 400 } }, 1), line(R(2), { note: 'In A', area: R(1), '@spot': { area: R(1), x: 20, y: 60 } }, 2),
    line(R(3), { note: 'Ground', '@spot': { area: null, x: 40, y: 900 } }, 2), line(R(4), { note: 'First' }, 3), line(R(5), { note: 'Second' }, 4),
    line(R(6), { '@kind': 'text', note: 'Title', '@size': 'title', '@spot': { area: null, x: 40, y: 860 } }, 5)]
  const one = layout(fold(lines))
  assert.deepEqual(one.items.map((item) => [item.row.id, item.x, item.y]), [[R(2), 2020, 460], [R(3), 40, 900], [R(6), 40, 860]])
  assert.deepEqual(one.shelf.map((row) => row.id), [R(5), R(4)])
  // Moved later, the ground's note lies over the text.
  assert.deepEqual(layout(fold([...lines, line(R(3), { '@spot': { area: null, x: 40, y: 880 } }, 6)])).items.map((item) => item.row.id), [R(2), R(6), R(3)])
  // Its area gone, a note is on the shelf again.
  assert.deepEqual(layout(fold([...lines, { row: R(1), delete: true, at: T(7), by: 'user' }])).shelf.map((row) => row.id), [R(5), R(4), R(2)])
})

test('free: Jean puts an area it makes at the first place in rows of four where it lies over none; an area with no spot is laid out so too', () => {
  const first = free([], 3), second = free([first], 9)
  assert.deepEqual([first.x, first.y, first.w], [0, 0, WIDE])
  assert.equal(second.y, 0)
  assert.ok(second.x >= WIDE + GAP)
  const four = [first, second, free([first, second], 1), free([first, second, free([first, second], 1)], 1)]
  assert.ok(free(four, 1).y > Math.max(...four.map((box) => box.y)))
  assert.equal(snap(29), 20)
  assert.equal(snap(31), 40)
  const unplaced = layout(fold([line(R(1), { note: 'A', '@kind': 'area', '@spot': { area: null, x: 0, y: 0 } }, 1), line(R(2), { note: 'B', '@kind': 'area' }, 1)]))
  assert.ok(Number(unplaced.areas.find((area) => area.row.id === R(2))?.x) >= WIDE + GAP)
})

test('the whiteboard\'s rows: its areas first, each placed by Jean\'s code, then its notes in them; a change\'s new area placed where nothing lies, notes moved back into a flow', () => {
  const board = made({ name: 'Launch', areas: ['Week 1', 'Week 2'], notes: [{ words: 'Brief', area: 'Week 1' }, { words: 'Ship', area: 'Week 2', owner: 'Sam', due: '2026-12-01' }] })
  const edits = rowsOf(board, counter())
  assert.deepEqual(edits.map((edit) => edit.set['@kind'] ?? 'note'), ['area', 'area', 'note', 'note'])
  assert.deepEqual(edits[3].set, { note: 'Ship', area: R(101), owner: 'Sam', due: '2026-12-01' })
  assert.notDeepEqual(edits[0].set['@spot'], edits[1].set['@spot'])
  const rows = fold(stamp([], edits, { by: 'jean' })), areas = rows.filter((row) => row.cells['@kind'] === 'area').map((row) => ({ id: row.id, name: String(row.cells.note) }))
  const change = changed({ move: [{ note: R(102), area: 'Later' }], rename: [{ area: R(100), name: 'First week' }] }, new Set([R(102), R(103)]), areas)
  const more = editsOf(change, layout(rows).areas, () => R(200))
  assert.deepEqual(more.map((edit) => [edit.row, edit.set.note ?? edit.set.area]), [[R(200), 'Later'], [R(102), R(200)], [R(100), 'First week']])
  const later = /** @type {{ x: number, y: number }} */ (more[0].set['@spot']), laid = layout(rows).areas
  assert.ok(laid.every((box) => later.x >= box.x + box.w || later.y >= box.y + box.h || later.x + WIDE <= box.x), 'the new area lies over none')
})

test('a note\'s colour is the person\'s alone: a brain\'s arguments that give one, or any own cell, come to nothing in the rows its tools make', () => {
  const board = made({ name: 'Launch', areas: ['Week 1'], notes: [{ words: 'Brief', area: 'Week 1', '@hue': 3, hue: 3, '@spot': { area: null, x: 0, y: 0 } }] })
  const edits = rowsOf(board, counter())
  assert.deepEqual(edits[1].set, { note: 'Brief', area: R(100) })
  const change = changed({ add: [{ words: 'Ship', area: R(100), '@hue': 2 }], move: [{ note: R(101), area: R(100), '@hue': 2 }] }, new Set([R(101)]), [{ id: R(100), name: 'Week 1' }])
  assert.ok(editsOf(change, [], counter()).every((edit) => Object.keys(edit.set).every((key) => !key.startsWith('@') || key === '@kind' || key === '@spot')))
  assert.ok(editsOf(change, [], counter()).every((edit) => !('@hue' in edit.set)))
})

test('arrows: from the edge of one thing to the edge of the other, under all that lies on the board; none while an end is gone or waits on the shelf', () => {
  const lines = [line(R(1), { note: 'A', '@spot': { area: null, x: 0, y: 0 } }, 1), line(R(2), { note: 'B', '@spot': { area: null, x: 400, y: 0 } }, 1),
    line(R(3), { '@kind': 'arrow', '@ends': [R(1), R(2)] }, 2), line(R(4), { note: 'Waits' }, 2), line(R(5), { '@kind': 'arrow', '@ends': [R(1), R(4)] }, 2),
    line(R(6), { note: 'Area', '@kind': 'area', '@spot': { area: null, x: 0, y: 600 } }, 2), line(R(7), { '@kind': 'arrow', '@ends': [R(2), R(6)] }, 3)]
  const { items, shelf } = layout(fold(lines)), arrows = items.filter((item) => item.kind === 'arrow')
  assert.deepEqual(arrows.map((item) => item.row.id), [R(3), R(7)])
  assert.deepEqual(arrows[0].ends, [NOTE.w + 6, NOTE.h / 2, 400 - 6, NOTE.h / 2])
  assert.deepEqual([arrows[0].x, arrows[0].y, arrows[0].w, arrows[0].area], [NOTE.w + 6 - GAP, NOTE.h / 2 - GAP, 400 - 12 - NOTE.w + 2 * GAP, null])
  // Into a section, it ends at the section's edge.
  assert.equal(arrows[1].ends[3], 600 - 6)
  assert.deepEqual(items.slice(0, 2).map((item) => item.kind), ['arrow', 'arrow'])
  // Under a note in a section's rows too, which has no spot of its own.
  const flow = layout(fold([...lines, line(R(8), { note: 'In the area', area: R(6) }, 1), line(R(9), { '@kind': 'arrow', '@ends': [R(8), R(1)] }, 5)])).items
  assert.ok(flow.findIndex((item) => item.row.id === R(9)) < flow.findIndex((item) => item.row.id === R(8)))
  assert.deepEqual(shelf.map((row) => row.id), [R(4)])
  assert.deepEqual(layout(fold([...lines, { row: R(2), delete: true, at: T(4), by: 'user' }])).items.filter((item) => item.kind === 'arrow'), [])
  // Its head at the second end, two strokes back from it.
  assert.equal(arrowPath([0, 0, 100, 0]), 'M0 0L100 0M87 -6L100 0L87 6')
})

test('placeOf: a note whose words, whole, are a creation\'s place, as a Creations card gives it dragged: a link, a table\'s block, or the place alone', () => {
  assert.equal(placeOf('[[documents/01K8.md|Plan, v2]]'), 'documents/01K8.md')
  assert.equal(placeOf(' [[collections/01K8-budget]]\n'), 'collections/01K8-budget')
  assert.equal(placeOf('```table\ncollections/01K8-budget\n```'), 'collections/01K8-budget')
  assert.equal(placeOf('decks/01K8-launch.md'), 'decks/01K8-launch.md')
  for (const words of ['Ship the beta', 'yes / no', 'see [[documents/01K8.md|Plan]]', '[[documents/01K8.md|Plan]] first', '', undefined]) assert.equal(placeOf(words), null, String(words))
})

test('svgOf: the board as a picture, its words escaped in HTML that wraps in its own direction, each section\'s and note\'s colour, lines and arrows as paths, mirrored right to left, or the part in view alone', () => {
  const palette = { room: '#fff', soft: '#777', board: '#eee', ink: '#111', wait: '#cde', hues: Array.from({ length: 7 }, (_, i) => ({ area: `#a${i}0`, edge: `#e${i}0`, note: `#b${i}0`, ink: `#c${i}0` })) }
  const rows = fold([line(R(1), { note: 'Risks', '@kind': 'area', '@spot': { area: null, x: 0, y: 0 } }, 1), line(R(2), { note: '<b>Flaky</b> & slow', area: R(1), owner: 'Sam', due: '2026-12-01' }, 2),
    line(R(3), { note: 'Lunch', '@hue': 3, '@spot': { area: null, x: 0, y: 400 } }, 2), line(R(4), { '@kind': 'line', '@path': [0, 0, 40, 20], '@ink': 2, '@spot': { area: null, x: 400, y: 400 } }, 2),
    line(R(5), { '@kind': 'arrow', '@ends': [R(3), R(1)] }, 3), line(R(6), { note: 'Plan', '@kind': 'text', '@size': 'title', '@spot': { area: null, x: 0, y: -100 } }, 3)])
  const columns = [{ id: 'note' }, { id: 'area' }, { id: 'gone', deleted: '2026-11-01' }, { id: 'owner' }, { id: 'due' }]
  const { svg, w, h } = svgOf(rows, { palette, font: 'system-ui, "Noto Sans"', columns }), { bounds } = layout(rows)
  assert.deepEqual([w, h], [bounds.w + 48, bounds.h + 48])
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+"/)
  assert.match(svg, /&lt;b&gt;Flaky&lt;\/b&gt; &amp; slow/)
  assert.doesNotMatch(svg, /<b>/)
  assert.match(svg, /dir="auto"/)
  assert.match(svg, /font-family: system-ui, &quot;Noto Sans&quot;/)
  for (const colour of ['#a00', '#b00', '#b30', '#c20']) assert.ok(svg.includes(`: ${colour}`), colour)
  assert.equal(svg.match(/<path /g)?.length, 2)
  assert.match(svg, /font-size: 28px/)
  // A section's head says how many notes it holds, and a note's foot its owner and its date, as the board shows them.
  assert.match(svg, /Risks<\/span><span style="color: #777[^>]*>1<\/span>/)
  assert.match(svg, />Sam<\/span><span [^>]*>2026-12-01<\/span>/)
  assert.deepEqual(footOf(columns, rows[1]), ['Sam', '2026-12-01'])
  assert.match(svgOf(rows, { palette, font: 'serif', dir: 'rtl', columns }).svg, /<div xmlns="http:\/\/www\.w3\.org\/1999\/xhtml" dir="rtl"[^>]*><span dir="auto"[^>]*>Risks/)
  // Right to left, what lies at the board's start lies at the picture's right.
  const first = (/** @type {string} */ text) => Number(/<foreignObject x="(-?\d+)"/.exec(text)?.[1])
  assert.equal(first(svg), 24)
  assert.equal(first(svgOf(rows, { palette, font: 'serif', dir: 'rtl' }).svg), w - 24 - bounds.w)
  // The part in view: what lies outside it isn't drawn.
  const part = svgOf(rows, { palette, font: 'serif', view: { x: 0, y: 380, w: 300, h: 200 } })
  assert.deepEqual([part.w, part.h], [300, 200])
  assert.match(part.svg, /Lunch/)
  assert.doesNotMatch(part.svg, /Risks|Flaky/)
})

test('found through its skill: `skill`’s line says what whiteboard is read for after the names, in the words measured, and nothing once policy leaves it out', () => {
  const names = DIRECTORY.map((entry) => entry.name)
  assert.equal(readFor(names), '; read whiteboard for a brainstorm, a retrospective or things to sort into groups with others, in place of a list or a table')
  assert.equal(readFor(names.filter((name) => name !== 'whiteboard')), '')
  assert.equal(readFor([]), '')
})

test('found through its skill once Skills is found: <skills> gives whiteboard what it is read for after its few words, the room’s copy too, and nothing once policy leaves it out', async () => {
  const own = await readDirectory({ fetch: /** @type {any} */ (async (/** @type {string} */ url) => new Response(await readFile(new URL(url)))), base: new URL('../app/caps/skills/directory/', import.meta.url) })
  const said = 'Notes in sections, to sort ideas together; read whiteboard for a brainstorm, a retrospective or things to sort into groups with others, in place of a list or a table'
  assert.equal(listedOwn(own, []).find((one) => one.name === 'whiteboard')?.description, said)
  assert.equal(listedOwn(own, [/** @type {any} */ (own.find((entry) => entry.name === 'whiteboard'))]).find((one) => one.name === 'whiteboard')?.description, said)
  assert.ok(listedOwn(own, []).every((one) => one.name === 'whiteboard' || !one.description.includes('; read ')))
  // Policy denying Whiteboards keeps the skill from the directory Skills lists (directory() in caps/skills/skills.js), and its words with it.
  assert.ok(!skillLines(listedOwn(own.filter((entry) => entry.cap !== 'whiteboards'), [])).includes('whiteboard'))
})
