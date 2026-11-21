// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D763): a reference's grammar, the graph read from the consumers' files, loops refused, the reader's right
// asked at each resolution, and what a reference shows of a collection, read again from its journal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRef, placeOf, refsIn, withRef, filledPage, loops, refused, versionless, tableOf } from '../app/caps/compose/refs.js'
import { versionOf, loadedOf, headOf, reshaped, breaks, current } from '../app/caps/compose/versions.js'
import { keyOf, paceOf, sorted, askOf, lastRun, due } from '../app/caps/compose/recipes.js'
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

test('a reference reads the journal’s head, its collection’s latest version or one version, said after its place', () => {
  assert.deepEqual([parseRef(`${PLACE}@published`)?.at, parseRef(`${PLACE}@2\nwhere: Checked is yes`)?.at, parseRef(`${PLACE}@live`)?.at, parseRef(`${PLACE}@0`)], ['published', 2, 'live', null])
  assert.deepEqual([placeOf({ place: PLACE, at: 'live' }), placeOf({ place: PLACE, at: 3 })], [PLACE, `${PLACE}@3`])
  assert.deepEqual([versionless('published'), versionless(4)], ['unpublished', 'noVersion'])
  const markdown = `\`\`\`table\nnot one\n\`\`\`\n\n\`\`\`table\n${PLACE}\n\`\`\`\n\n\`\`\`table\n${PLACE}@published\nfields: Name\n\`\`\``
  assert.equal(withRef(markdown, 1, (ref) => ({ ...ref, at: 1 })), markdown.replace(`${PLACE}@published\n`, `${PLACE}@1\n`), 'the second reference, the first block naming none')
  assert.equal(withRef(markdown, 0, (ref) => ({ ...ref, at: 'published' })), markdown.replace(`${PLACE}\n\`\`\`\n\n`, `${PLACE}@published\n\`\`\`\n\n`))
})

test('a site’s page refers with a table that says data-from, filled as the page is read, its words escaped, one it can’t show as written', () => {
  const page = `<main><table class="t" data-from="${PLACE}@published" data-where="Checked is yes" data-fields="Name &amp; Trade"><tr><td>old</td></tr></table><table data-from="${PLACE}"></table></main>`
  assert.deepEqual(refsIn(page).map(({ at, recipe }) => [at, recipe]), [['published', { where: 'Checked is yes', fields: 'Name & Trade' }], ['live', {}]])
  assert.equal(filledPage(page, [[['Name'], ['Ana <3']], null]), `<main><table class="t" data-from="${PLACE}@published" data-where="Checked is yes" data-fields="Name &amp; Trade"><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Ana &lt;3</td></tr></tbody></table><table data-from="${PLACE}"></table></main>`)
})

test('a version freezes a collection: its columns, its rows and the journal’s head, and reads as the collection did then', () => {
  const made = { row: '01JX0000000000000000000001', set: { name: 'Ana', trade: 'Baker', checked: true }, at: '2026-11-21T10:01:00.000Z', by: 'user' }
  const one = { ...collection([made, { ...made, set: { trade: 'Potter' }, at: '2026-11-21T10:02:00.000Z' }]), lines: [made, { ...made, at: '2026-11-21T10:02:00.000Z' }] }
  const version = versionOf(one, { n: 1, at: '2026-11-21T11:00:00.000Z', by: 'user', why: 'published' })
  assert.equal(version.head, '2026-11-21T10:02:00.000Z')
  assert.equal(headOf([]), '')
  assert.deepEqual(JSON.parse(JSON.stringify(version)).rows[0].cells, { name: 'Ana', trade: 'Potter', checked: true })
  assert.deepEqual(tableOf(loadedOf(JSON.parse(JSON.stringify(version))), {}, how), [['Name', 'Trade', 'Checked'], ['Ana', 'Potter', '✓']])
  assert.equal(reshaped(version, one.table), false, 'rows changed, columns not')
  const renamed = { ...one.table, properties: one.table.properties.map((p) => (p.id === 'trade' ? { ...p, name: 'Craft' } : p)) }
  assert.equal(reshaped(version, renamed), true)
})

test('what breaks a version: a column gone, or turned into a kind whose values read otherwise; a rename, a deletion or a like kind don’t', () => {
  const table = collection([]).table, other = (/** @type {object} */ change, id = 'trade') => ({ properties: table.properties.map((p) => (p.id === id ? { ...p, ...change } : p)) })
  assert.deepEqual(breaks(table, table), [])
  assert.deepEqual(breaks(table, other({ name: 'Craft' })), [])
  assert.deepEqual(breaks(table, other({ deleted: true })), [])
  assert.deepEqual(breaks(table, other({ type: 'email' })), [])
  assert.deepEqual(breaks(table, other({ type: 'number' })), ['Trade'])
  assert.deepEqual(breaks(table, { properties: table.properties.filter((p) => p.id !== 'checked') }), ['Checked'])
})

test('a recipe reads a column by the name it had in an earlier version, said as old, and a deleted column it names, which the default columns leave out', () => {
  const one = collection([{ row: '01JX0000000000000000000001', set: { name: 'Ana', trade: 'Baker', checked: true }, at: '2026-11-21T10:01:00.000Z', by: 'user' }])
  const v1 = versionOf({ ...one, lines: [] }, { n: 1, at: '2026-11-21T11:00:00.000Z', by: 'user', why: 'published' })
  const now = { ...one.table, properties: one.table.properties.map((p) => (p.id === 'trade' ? { ...p, name: 'Craft' } : p.id === 'checked' ? { ...p, deleted: true } : p)) }
  const read = current(now, [v1], { fields: 'Name | trade', where: 'Trade is Baker and Checked is yes' })
  assert.deepEqual(read.recipe, { fields: 'Name | Craft', where: 'Craft is Baker and Checked is yes' })
  assert.deepEqual(read.old, [['trade', 'Craft'], ['Trade', 'Craft']])
  assert.deepEqual(tableOf({ ...one, table: read.table }, read.recipe, how), [['Name', 'Craft'], ['Ana', 'Baker']])
  const plain = current(now, [v1], { where: 'Checked is yes' })
  assert.deepEqual(tableOf({ ...one, table: plain.table }, plain.recipe, how), [['Name', 'Craft'], ['Ana', 'Baker']], 'the deleted column filters, and isn’t shown')
  assert.deepEqual(current(one.table, [v1], {}), { table: one.table, recipe: {}, old: [] })
})

test('a recipe sorts, and its reference is rewritten whole with its lines as the menu changes them', () => {
  const lines = ['Cy', 'ana', 'Bea'].map((name, i) => ({ row: `01JX000000000000000000000${i}`, set: { name, trade: 'Baker', checked: i !== 1 }, at: `2026-11-21T10:0${i}:00.000Z`, by: 'user' }))
  const one = collection(lines)
  assert.deepEqual(tableOf(one, { fields: 'Name', sort: 'Name' }, how).flat(), ['Name', 'ana', 'Bea', 'Cy'])
  assert.deepEqual(tableOf(one, { fields: 'Name', sort: 'name desc' }, how).flat(), ['Name', 'Cy', 'Bea', 'ana'])
  assert.deepEqual(sorted(one.table, one.rows, 'Nothing').map((row) => row.cells.name), ['Cy', 'ana', 'Bea'], 'a column it doesn’t name leaves the order')
  const markdown = `\`\`\`table\n${PLACE}@published\nask: Summarise them\n\`\`\``
  assert.equal(withRef(markdown, 0, (ref) => ({ ...ref, recipe: { ...ref.recipe, refresh: 'auto' } })), `\`\`\`table\n${PLACE}@published\nask: Summarise them\nrefresh: auto\n\`\`\``)
})

test('a run is kept by its reference’s key, which its pace leaves alone; one that read the same version with the same brain is read again, unpaid', () => {
  const ref = { place: PLACE, at: /** @type {const} */ ('published'), recipe: { where: 'Checked is yes', ask: 'Summarise' } }
  assert.equal(keyOf(ref), keyOf({ ...ref, recipe: { ask: 'Summarise', where: 'Checked is yes', refresh: 'auto' } }))
  assert.notEqual(keyOf(ref), keyOf({ ...ref, recipe: { ...ref.recipe, ask: 'Summarise in one slide' } }))
  assert.notEqual(keyOf(ref), keyOf({ ...ref, at: 2 }))
  assert.deepEqual([paceOf({}), paceOf({ refresh: 'auto' }), paceOf({ refresh: '5 min' }), paceOf({ refresh: 'every 2 h' })], [{ auto: false, every: 0 }, { auto: true, every: 0 }, { auto: false, every: 5 }, { auto: false, every: 120 }])
  assert.equal(askOf('Summarise', [['Name'], ['Ana']]), 'Summarise\n\n<rows>\nName\nAna\n</rows>')
  const key = keyOf(ref), runs = [{ format: 1, key, n: 1, at: '2026-11-21T10:00:00.000Z', read: 'v1', brain: 'anthropic:x', output: 'One' },
    { format: 1, key, n: 2, at: '2026-11-21T11:00:00.000Z', read: 'v2', brain: 'anthropic:x', error: 'HTTP 529' }]
  assert.equal(lastRun(/** @type {any} */ (runs), key)?.output, 'One', 'a failure leaves the last good run on show')
  assert.equal(lastRun(/** @type {any} */ (runs), key, 'v1', 'anthropic:x')?.n, 1)
  assert.equal(lastRun(/** @type {any} */ (runs), key, 'v2', 'anthropic:x'), undefined, 'a version not run yet with that brain')
  assert.equal(lastRun(/** @type {any} */ (runs), key, 'v1', 'openai:y'), undefined)
  const at = Date.parse('2026-11-21T10:04:00.000Z')
  assert.deepEqual([due(/** @type {any} */ (runs[0]), 5, at), due(/** @type {any} */ (runs[0]), 5, at + 60_000), due(undefined, 5, at), due(/** @type {any} */ (runs[0]), 0, at + 1e9)], [false, true, true, false])
})
