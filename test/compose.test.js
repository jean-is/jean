// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D763): a reference's grammar, the graph read from the consumers' files, loops refused, the reader's right
// asked at each resolution, and what a reference shows of a collection, read again from its journal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRef, refsIn, loops, refused, tableOf } from '../app/caps/compose/refs.js'
import { createTable } from '../app/caps/tables/table.js'
import { stringifyChanges, reading } from '../app/caps/tables/changes.js'

const PLACE = 'collections/01JX0000000000000000000000-artisans'
const how = { locales: ['en'], labels: { yes: '✓', no: '' }, today: new Date(2026, 10, 21) }

/** A collection as Tables reads it: its table, and its rows folded from the lines of its journal. @param {object[]} lines */
function collection(lines) {
  const table = createTable({ name: 'Artisans', columns: [{ name: 'Name', type: 'text' }, { name: 'Trade', type: 'text' }, { name: 'Checked', type: 'checkbox' }] }, { id: '01JX0000000000000000000000', author: 'user', at: '2026-11-21T10:00:00.000Z' })
  return { table, rows: reading(PLACE, stringifyChanges(/** @type {any} */ (lines))).rows() }
}

test('a reference is the ```table block documents hold: a collection’s place, read live, then its recipe’s lines', () => {
  assert.deepEqual(parseRef(`${PLACE}\n`), { place: PLACE, at: 'live', recipe: {} })
  assert.deepEqual(parseRef(` ${PLACE}\nFields: Name | Trade\nwhere: Checked is yes\nnot a line of it`), { place: PLACE, at: 'live', recipe: { fields: 'Name | Trade', where: 'Checked is yes' } })
  for (const text of ['', 'decks/01JX0000000000000000000000-a.deck.html', 'collections/nope', `../${PLACE}`]) assert.equal(parseRef(text), null, text)
})

test('the references a consumer holds are its ```table blocks, whatever their fence, and only those naming a collection', () => {
  const markdown = `# Slide\n\n\`\`\`table\n${PLACE}\n\`\`\`\n\n---\n\n~~~~table\n${PLACE}\nwhere: Checked is yes\n~~~~\n\n\`\`\`table\nnot a place\n\`\`\`\n\n\`\`\`js\n${PLACE}\n\`\`\``
  assert.deepEqual(refsIn(markdown).map((ref) => [ref.place, ref.recipe.where]), [[PLACE, undefined], [PLACE, 'Checked is yes']])
})

test('a reference that would close a loop is refused, however long the loop; any other is not', () => {
  const edges = /** @type {const} */ ([{ from: 'a', to: 'b', at: 'live' }, { from: 'b', to: 'c', at: 'live' }, { from: 'd', to: 'c', at: 'live' }])
  assert.equal(loops([...edges], 'c', 'a'), true)
  assert.equal(loops([...edges], 'a', 'a'), true)
  assert.equal(loops([...edges], 'd', 'b'), false)
  assert.equal(loops([...edges], 'a', 'd'), false)
  assert.equal(loops([{ from: 'x', to: 'y', at: 'live' }, { from: 'y', to: 'x', at: 'live' }], 'z', 'x'), false, 'a loop elsewhere stops nothing')
})

test('the reader’s right is asked in order at each resolution: Tables off, a task from someone else’s, a loop, none there', () => {
  assert.equal(refused({ found: true }), '')
  assert.equal(refused({ denied: true, shared: true, loop: true, found: true }), 'denied')
  assert.equal(refused({ shared: true, loop: true, found: true }), 'shared')
  assert.equal(refused({ loop: true, found: true }), 'loop')
  assert.equal(refused({}), 'missing')
})

test('a reference shows the rows of its collection as its journal’s head has them: a row changed is shown changed', () => {
  const made = { row: '01JX0000000000000000000001', set: { name: 'Ana', trade: 'Baker', checked: true }, at: '2026-11-21T10:01:00.000Z', by: 'user' }
  const before = collection([made])
  assert.deepEqual(tableOf(before, {}, how), [['Name', 'Trade', 'Checked'], ['Ana', 'Baker', '✓']])
  const after = collection([made, { row: made.row, set: { trade: 'Potter' }, at: '2026-11-21T10:02:00.000Z', by: 'user' }])
  assert.deepEqual(tableOf(after, {}, how), [['Name', 'Trade', 'Checked'], ['Ana', 'Potter', '✓']])
  assert.deepEqual(tableOf(after, { fields: 'Trade', where: 'Checked is no' }, how), [['Trade']])
  assert.equal(tableOf(collection(Array.from({ length: 20 }, (_, i) => ({ ...made, row: `01JX00000000000000000000${String(i).padStart(2, '0')}` }))), {}, how).length, 13, 'a slide shows twelve rows at most')
})
