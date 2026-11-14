// SPDX-License-Identifier: MIT
// The whiteboard's tools as phase 0 measured them (test/whiteboard/tools.js): what Jean takes from what a brain sends.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { made, changed, LINES } from './whiteboard/tools.js'

test('whiteboard: its areas once each, in order, a note naming one not listed adding it; what to fix in words a brain reads', () => {
  const one = made({ name: ' Retro ', areas: ['Went well', 'Went well', 'To change'], notes: [{ words: 'Demo day', area: 'Went well' }, { words: 'Flaky tests', area: 'Risks', owner: 'Tom' }, { words: 'Lunch' }] })
  assert.deepEqual(one.areas, ['Went well', 'To change', 'Risks'])
  assert.deepEqual(one.notes.map((note) => [note.area, note.owner]), [['Went well', undefined], ['Risks', 'Tom'], ['Went well', undefined]])
  assert.throws(() => made({ areas: ['A'], notes: [{ words: 'x', area: 'A' }] }), /name/)
  assert.throws(() => made({ name: 'B', areas: ['A'], notes: [{ area: 'A' }] }), /few words/)
})

test('whiteboard_change: an area by its id, a name that is one area\'s alone, or a new name; unknown ids and twin names refused', () => {
  const areas = [{ id: 'A1', name: 'Wins' }, { id: 'A2', name: 'Risks' }, { id: 'A3', name: 'Risks' }]
  const ids = new Set(['n1', 'n2'])
  const done = changed({ move: [{ note: 'n1', area: 'A1' }, { note: 'n2', area: 'Ideas' }], add: [{ words: 'Book lunch', area: 'Wins', owner: 'Tom' }] }, ids, areas)
  assert.deepEqual(done.move, [{ note: 'n1', area: 'A1' }, { note: 'n2', area: 'Ideas' }])
  assert.deepEqual(done.add, [{ words: 'Book lunch', area: 'A1', owner: 'Tom' }])
  assert.deepEqual(done.made, ['Ideas'])
  assert.throws(() => changed({ move: [{ note: 'n9', area: 'A1' }] }, ids, areas), /n9/)
  assert.throws(() => changed({ move: [{ note: 'n1', area: 'Risks' }] }, ids, areas), /Two areas/)
  assert.throws(() => changed({}, ids, areas), /Nothing changed/)
})

test('the capability\'s lines hold within its 40 tokens, counted as the prompt\'s budget counts them (a token for four characters)', () => {
  const text = LINES.map((one) => `- ${one.name}: ${one.line}`).join('\n')
  assert.ok(Math.ceil(text.length / 4) <= 40, `${Math.ceil(text.length / 4)} tokens`)
})
