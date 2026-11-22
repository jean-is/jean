// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D763): a reference's grammar, the graph read from the consumers' files, loops refused, the reader's right
// asked at each resolution, and what a reference shows of a collection, read again from its journal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRef, placeOf, refsIn, withRef, filledPage, bare, formsTo, loops, refused, versionless, tableOf, chartOf, choiceIn, choicesIn, tinted, parseFigure, figureOf, written, linksIn, further, sectionOf, slugOf, withId, notesIn } from '../app/caps/compose/refs.js'
import { filledWith } from '../app/caps/designs/layout.js'
import { versionOf, loadedOf, headOf, reshaped, breaks, current } from '../app/caps/compose/versions.js'
import { keyOf, paceOf, sorted, askOf, lastRun, due } from '../app/caps/compose/recipes.js'
import { credentialOf, chainOf, holds, sriOf } from '../app/caps/compose/proof.js'
import { portOf, admitted, HOUR, LONGEST } from '../app/caps/compose/ports.js'
import { makeSeal, seal, imprint, disclose } from '../app/caps/receipt/certificate.js'
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
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

test('a collection’s relations and the files a text holds by their content are links of the graph, which say what a change touches but close no loop', () => {
  const OTHER = 'collections/01JX0000000000000000000001-orders', HASH = `files/sha256-${'a'.repeat(64)}.png`
  const table = { properties: [{ type: 'relation', name: 'Maker', collection: PLACE }, { type: 'relation', name: 'Itself', collection: OTHER }, { type: 'text', name: 'Note' }, { type: 'relation', name: 'Lost', collection: 'nowhere' }] }
  assert.deepEqual(linksIn(OTHER, table), [{ from: OTHER, to: PLACE, at: 'live', index: 0, kind: 'relation', recipe: { relation: 'Maker' } }], 'one to itself or to no collection is none')
  assert.deepEqual(linksIn('decks/a.deck.html', null, `![Ana](../${HASH})\n\n![Again](../${HASH} "twice")`).map(({ to, kind }) => [to, kind]), [[HASH, 'file']], 'each file once')
  const edges = [{ from: PLACE, to: OTHER, at: /** @type {const} */ ('live'), recipe: {}, index: 0, kind: /** @type {const} */ ('relation') }]
  assert.equal(loops(edges, OTHER, PLACE), false, 'a relation is no reference: it carries no loop')
  assert.equal(loops(edges.map(({ kind, ...edge }) => edge), OTHER, PLACE), true, 'as a reference would')
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
  assert.equal(bare(filledPage(page, [[['Name'], ['Ana <3']], [['Name'], ['Bob']]])), `<main><table class="t" data-from="${PLACE}@published" data-where="Checked is yes" data-fields="Name &amp; Trade"></table><table data-from="${PLACE}"></table></main>`, 'kept, a page holds none of the rows it showed')
  assert.equal(filledPage(page, [[['Name'], ['Ana <3']], null]), `<main><table class="t" data-from="${PLACE}@published" data-where="Checked is yes" data-fields="Name &amp; Trade"><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Ana &lt;3</td></tr></tbody></table><table data-from="${PLACE}"></table></main>`)
})

test('a document’s section is a source: found by the id after its heading, else by its words, as far as the next heading as high, its ids left out', () => {
  const DOC = 'documents/01JX0000000000000000000002-help.md', body = '# Help\n\nHello.\n\n## Prices {#prices}\n\nTen euros.\n\n### Children\n\nFree.\n\n## Questions fréquentes\n\n```md\n## Not a heading\n```\n\nAsk us.\n'
  assert.deepEqual(parseRef(`${DOC}#prices@2\nfields: x`), { place: DOC, at: 2, recipe: { section: 'prices', fields: 'x' } })
  assert.equal(placeOf({ place: DOC, at: 'published', recipe: { section: 'prices' } }), `${DOC}#prices@published`)
  assert.equal(parseRef('documents/nope.md#a'), null)
  assert.deepEqual(sectionOf(body, 'prices'), { text: '## Prices\n\nTen euros.\n\n### Children\n\nFree.', line: 4, id: 'prices' }, 'by its id, its sub-sections in it')
  assert.deepEqual(sectionOf(body, slugOf('Questions fréquentes')), { text: '## Questions fréquentes\n\n```md\n## Not a heading\n```\n\nAsk us.', line: 12, id: '' }, 'by its words, a fence’s lines no heading')
  assert.equal(sectionOf(body, 'gone'), null)
  assert.equal(sectionOf(body)?.text.startsWith('Hello.'), true, 'without a section, all but its title')
  assert.equal(slugOf('Questions fréquentes'), 'questions-fréquentes')
  assert.equal(slugOf('よくある質問 2'), 'よくある質問-2')
  const kept = withId(body, 12, 'questions-fréquentes')
  assert.equal(kept.split('\n')[12], '## Questions fréquentes {#questions-fréquentes}')
  assert.equal(withId(kept, 12, 'questions-fréquentes'), kept, 'written once, however often it is asked')
  assert.equal(sectionOf(kept.replace('## Questions fréquentes', '## FAQ'), 'questions-fréquentes')?.text.split('\n')[0], '## FAQ', 'renamed, it is found by its id')
  const withWords = withRef(`\`\`\`section\n${DOC}#prices\n\`\`\`\n`, 0, (ref) => ({ ...ref, at: 1 }))
  assert.equal(withWords, `\`\`\`section\n${DOC}#prices@1\n\`\`\`\n`, 'its section stays on its first line')
  const page = `<main><section data-from="${DOC}#prices"><p>old</p></section><table data-from="${PLACE}"></table></main>`
  assert.deepEqual(refsIn(page).map(({ place, recipe }) => [place, recipe.section]), [[DOC, 'prices'], [PLACE, undefined]])
  assert.equal(filledPage(page, ['<p>Ten euros.</p>', null]), `<main><section data-from="${DOC}#prices"><p>Ten euros.</p></section><table data-from="${PLACE}"></table></main>`)
  assert.equal(bare(filledPage(page, ['<p>Ten euros.</p>', null])), `<main><section data-from="${DOC}#prices"></section><table data-from="${PLACE}"></table></main>`)
})

test('a whiteboard’s section is its notes, found by its name or its name as an id; a design is drawn for a row, each {Column} its value', () => {
  const row = (/** @type {string} */ id, /** @type {Record<string, unknown>} */ cells) => /** @type {any} */ ({ id, cells })
  const rows = [row('a', { note: 'Ideas en vrac', '@kind': 'area' }), row('b', { note: 'Bake bread', area: 'a' }), row('c', { note: 'Ideas en vrac', '@kind': 'text', area: 'a' }), row('d', { note: 'Elsewhere' })]
  assert.deepEqual(notesIn(rows, 'Ideas en vrac'), ['Bake bread'], 'its notes alone, by its name')
  assert.deepEqual(notesIn(rows, 'ideas-en-vrac'), ['Bake bread'], 'or its name as an id')
  assert.equal(notesIn(rows, 'Later'), null)
  const design = /** @type {any} */ ({ parts: [{ id: 'title', role: 'title', text: '{Name}' }, { id: 'who', role: 'who', text: '{ Trade } · {Unknown}' }, { id: 'picture', role: 'picture', words: '{Name}' }] })
  assert.deepEqual(filledWith(design, { Name: 'Ana', Trade: 'Baker' }).parts.map((part) => part.text ?? part.words), ['Ana', 'Baker · {Unknown}', '{Name}'])
})

test('what is reached further from a place goes as far as the graph does, each through the link it starts from, never back to the place', () => {
  const edge = (/** @type {string} */ from, /** @type {string} */ to) => ({ from, to, at: /** @type {const} */ ('live'), recipe: {}, index: 0 })
  const edges = [edge('deck', 'orders'), edge('orders', 'artisans'), edge('report', 'deck'), edge('site', 'artisans'), edge('artisans', 'orders')]
  assert.deepEqual(further(edges, 'artisans', true), [['deck', 'orders'], ['report', 'orders']], 'what uses what uses it')
  assert.deepEqual(further(edges, 'report', false), [['orders', 'deck'], ['artisans', 'deck']], 'what feeds what it uses')
  assert.deepEqual(further([edge('a', 'b')], 'b', true), [], 'nothing beyond its own links')
})

test('what leaves Jean holds each reference as it shows: a block its rows’ table or its words, a figure its value, any other block as it was', async () => {
  const markdown = `# Report\n\n\`\`\`table\n${PLACE}@published\nfields: Name | Trade\n\`\`\`\n\nWe approved \`=${PLACE} count where Checked is yes\` artisans, \`=${PLACE}@2 sum Name\` before.\n\n\`\`\`table\n${PLACE}\nask: Sum it up\n\`\`\`\n\n\`\`\`js\n${PLACE}\n\`\`\``
  const asked = /** @type {string[]} */ ([])
  const shown = async (/** @type {import('../app/caps/compose/refs.js').Ref} */ ref) => (asked.push(`${placeOf(ref)} ${Object.keys(ref.recipe)}`), ref.recipe.ask ? { words: 'Two bakers.' } : ref.at === 2 ? { words: 'No such version' } : ref.recipe.total ? { rows: [['2']] } : { rows: [['Name', 'Trade'], ['Ana | Bo', 'Baker*']] })
  assert.equal(await written(markdown, shown), `# Report\n\n| Name | Trade |\n| --- | --- |\n| Ana \\| Bo | Baker\\* |\n\nWe approved 2 artisans, — before.\n\nTwo bakers.\n\n\`\`\`js\n${PLACE}\n\`\`\``)
  assert.deepEqual(asked, [`${PLACE}@published fields`, `${PLACE} ask`, `${PLACE} total,where`, `${PLACE}@2 total,column`], 'blocks first, then the figures of what they left')
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

test('a recipe that says `chart` shows a chart’s figures, its rows counted or added up by a column’s values, at a column’s old name too', () => {
  const lines = [['Ana', 'Baker', true], ['Bea', 'Potter', true], ['Cy', 'Baker', false]].map(([name, trade, checked], i) => ({ row: `01JX000000000000000000000${i}`, set: { name, trade, checked }, at: `2026-11-21T10:0${i}:00.000Z`, by: 'user' }))
  const one = collection(lines)
  const counted = tableOf(one, { chart: 'bar', by: 'Trade' }, how)
  assert.deepEqual(counted, [['Trade', 'Artisans'], ['Baker', '2'], ['Potter', '1']])
  assert.deepEqual(tableOf(one, { chart: 'pie', by: 'trade', where: 'Checked is yes' }, how), [['Trade', 'Artisans'], ['Baker', '1'], ['Potter', '1']], 'its `where` keeps some rows')
  assert.deepEqual(tableOf(one, { chart: 'bar', by: 'Trade', where: 'Name is Nobody' }, how), [['Trade', 'Artisans']], 'no row kept, no bar')
  assert.throws(() => tableOf(one, { chart: 'bar', by: 'Colour' }, how), 'a column it hasn’t is the recipe’s fault, said so')
  assert.deepEqual(chartOf(counted, 'Pie '), { kind: 'pie', labels: ['Baker', 'Potter'], series: [{ name: 'Artisans', data: [2, 1] }] })
  assert.equal(chartOf(counted, 'radar').kind, 'bar', 'a kind it doesn’t draw is bars')
  const v1 = versionOf({ ...one, lines: [] }, { n: 1, at: '2026-11-21T11:00:00.000Z', by: 'user', why: 'published' })
  const now = { ...one.table, properties: one.table.properties.map((p) => (p.id === 'trade' ? { ...p, name: 'Craft' } : p)) }, read = current(now, [v1], { chart: 'bar', by: 'Trade' })
  assert.deepEqual([read.recipe.by, read.old], ['Craft', [['Trade', 'Craft']]])
  assert.deepEqual(tableOf({ ...one, table: read.table }, read.recipe, how)[0], ['Craft', 'Artisans'])
})

test('a choice shows in the colour Tables gives it, in a cell or as a bar: its hue, else a step’s group; lines and other kinds keep theirs', () => {
  const table = createTable({ name: 'Jobs', columns: [{ name: 'Name', type: 'text' }, { name: 'Trade', type: 'select', options: ['Baker', 'Potter', { name: 'Weaver', hue: 5 }] }, { name: 'Tags', type: 'multi-select', options: ['Bread', 'Clay'] },
    { name: 'Stage', type: 'status', options: ['To do', 'Doing', 'Done'] }] }, { id: '01JX0000000000000000000000', author: 'user', at: '2026-11-21T10:00:00.000Z' })
  assert.equal(choiceIn(table, 'Name'), null)
  assert.equal(choiceIn(table, ' trade ')?.id, 'trade')
  const trade = /** @type {any} */ (choiceIn(table, 'Trade')), tags = /** @type {any} */ (choiceIn(table, 'Tags')), stage = /** @type {any} */ (choiceIn(table, 'Stage'))
  assert.deepEqual(choicesIn(trade, 'Potter'), [{ name: 'Potter', hue: 1, group: undefined }])
  assert.deepEqual(choicesIn(trade, 'Weaver')[0].hue, 5, 'the colour its user picked')
  assert.deepEqual(choicesIn(tags, 'Bread, Clay').map((one) => one.hue), [0, 1], 'each of a cell’s choices')
  assert.deepEqual(choicesIn(trade, 'Smith'), [{ name: 'Smith', hue: undefined, group: undefined }], 'a value no choice holds, as it is')
  assert.deepEqual(choicesIn(stage, 'Doing'), [{ name: 'Doing', hue: undefined, group: 'doing' }], 'a step, by its group until a colour is picked')
  const bars = { series: [{ type: 'bar', data: [2, 1] }] }, pie = { series: [{ type: 'pie', data: [{ name: 'Baker', value: 2 }, { name: 'Potter', value: 1 }] }] }
  assert.deepEqual(tinted(bars, ['#112233', undefined]), { series: [{ type: 'bar', data: [{ value: 2, itemStyle: { color: '#112233' } }, 1] }] }, 'its colours left alone while one bar has none')
  assert.deepEqual(tinted(bars, ['#112233', '#445566']).color, ['#112233', '#445566'])
  assert.deepEqual(tinted(pie, ['#112233', '#445566']).series[0].data[1], { name: 'Potter', value: 1, itemStyle: { color: '#445566' } })
  assert.deepEqual(tinted({ series: [{ type: 'line', data: [2, 1] }] }, ['#112233']), { series: [{ type: 'line', data: [2, 1] }] })
})

test('a figure in a slide’s words is inline code that starts with `=`: a collection’s place, then what it works out of which rows, worked out from them', () => {
  assert.deepEqual(parseFigure(`=${PLACE} count`), { place: PLACE, at: 'live', recipe: { total: 'count' } })
  assert.deepEqual(parseFigure(` = ${PLACE}@published SUM Hours where Trade is Baker `), { place: PLACE, at: 'published', recipe: { total: 'sum', column: 'Hours', where: 'Trade is Baker' } })
  assert.deepEqual(parseFigure(`=${PLACE}@2 percent Checked`), { place: PLACE, at: 2, recipe: { total: 'percent', column: 'Checked' } })
  for (const text of [`${PLACE} count`, `=${PLACE}`, `=${PLACE} median Hours`, '=collections/nope count', '=1+1']) assert.equal(parseFigure(text), null, text)
  const table = createTable({ name: 'Jobs', columns: [{ name: 'Name', type: 'text' }, { name: 'Trade', type: 'text' }, { name: 'Hours', type: 'number' }, { name: 'Paid', type: 'number', format: 'money', currency: 'EUR' }, { name: 'Checked', type: 'checkbox' }] },
    { id: '01JX0000000000000000000000', author: 'user', at: '2026-11-21T10:00:00.000Z' })
  const lines = [['Ana', 'Baker', 4, 1200.5, true], ['Bea', 'Potter', 1.5, 300, false], ['Cy', 'Baker', 2, 4000, true]].map(([name, trade, hours, paid, checked], i) => ({ row: `01JX000000000000000000000${i}`, set: { name, trade, hours, paid, checked }, at: `2026-11-21T10:0${i}:00.000Z`, by: 'user' }))
  const one = { table, rows: reading(PLACE, stringifyChanges(/** @type {any} */ (lines))).rows() }, of = (/** @type {string} */ text, /** @type {any} */ at = how) => figureOf(one, /** @type {any} */ (parseFigure(`=${PLACE} ${text}`)).recipe, at)
  assert.deepEqual(['count', 'count where Trade is Baker', 'sum Hours', 'average Hours where Trade is Baker', 'min Hours', 'max hours', 'percent Checked'].map((text) => of(text)), ['3', '2', '7.5', '3', '1.5', '4', '66.7%'])
  assert.equal(of('sum Paid'), '€5,500.50', 'an amount as its column writes it')
  assert.equal(of('sum Paid', { ...how, locales: ['fr'] }).replace(/\s/g, ' '), '5 500,50 €', 'in the language’s digits')
  assert.equal(of('average Hours where Trade is Smith'), '—', 'no number, no average')
  assert.throws(() => of('sum Colour'))
  assert.throws(() => of('sum'), 'a sum of no column')
  assert.deepEqual(tableOf(one, { total: 'count', where: 'Checked is yes' }, how), [['2']], 'resolved as a reference is, versions and old names too')
  const deck = `# Figures\n\n- **\`=${PLACE} count\`** artisans\n- **\`=${PLACE}@published sum Hours\`** hours\n\n\`\`\`table\n${PLACE}\n\`\`\`\n`
  assert.deepEqual(refsIn(deck).map((ref) => [ref.at, ref.recipe.total]), [['live', undefined], ['live', 'count'], ['published', 'sum']], 'its blocks, then its figures')
  assert.equal(withRef(deck, 2, (ref) => ({ ...ref, at: 1 })), deck.replace(`${PLACE}@published sum`, `${PLACE}@1 sum`))
  assert.equal(withRef(deck, 1, (ref) => ({ ...ref, at: 'published' })), deck.replace(`=${PLACE} count`, `=${PLACE}@published count`))
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

const schema = JSON.parse(readFileSync(new URL('../app/caps/compose/version.schema.json', import.meta.url), 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strictTypes: false })
ajv.addFormat('date-time', (text) => !Number.isNaN(Date.parse(text)))
const valid = ajv.compile(schema)

test('a version and a run are certified as answers are, each run naming the version it read by its certificate, and the chain checks back to it', async () => {
  const own = await makeSeal(new Date('2026-11-21T09:00:00.000Z')), at = '2026-11-21T10:00:00.000Z', content = JSON.stringify({ n: 2, rows: [] })
  const version = await credentialOf({ kind: 'collection', creation: '01JX0000000000000000000000', n: 2, at, by: 'user', content })
  const sealedVersion = await seal(version.credential, own, new Date(at))
  const run = await credentialOf({ kind: 'run', creation: '01JX00000000000000000000RR', n: 3, at, by: 'jean', content: 'Summary: Ana.', recipe: { where: 'Approved is yes', ask: 'Sum up' },
    brain: { provider: 'anthropic', model: 'claude', local: false }, ingredients: [{ kind: 'collection', creation: '01JX0000000000000000000000', read: 'v2', certificate: await imprint(sealedVersion) }] })
  const sealedRun = await seal(run.credential, own, new Date(at))
  for (const one of [sealedVersion, sealedRun]) assert.equal(valid(JSON.parse(Buffer.from(one.payload, 'base64url').toString())), true, ajv.errorsText(valid.errors))
  assert.equal(run.credential.credentialSubject.where, 'cloud')
  // Only digests: the words and the recipe stay with their holder, who proves them with the salts kept.
  assert.doesNotMatch(Buffer.from(sealedRun.payload, 'base64url').toString(), /Summary|Approved/)
  assert.equal((await disclose(run.salts.content, 'digestSRI', await sriOf('Summary: Ana.'))).digest, run.credential.credentialSubject.content._sd[0])
  const chain = await chainOf([sealedRun, sealedVersion])
  assert.equal(chain.intact, true)
  assert.deepEqual(chain.chain.map(({ read, given, intact, depth }) => [read, given, intact, depth]), [['v2', true, true, 0]])
  assert.equal(holds(chain), true)
  // The version's certificate missing, or changed: the chain no longer holds.
  assert.equal(holds(await chainOf([sealedRun])), false)
  const says = JSON.parse(Buffer.from(sealedVersion.payload, 'base64url').toString())
  const forged = { ...sealedVersion, payload: Buffer.from(JSON.stringify({ ...says, credentialSubject: { ...says.credentialSubject, version: 1 } })).toString('base64url') }
  assert.deepEqual((await chainOf([sealedRun, forged])).chain.map(({ given, intact }) => [given, intact]), [[true, false]])
  assert.equal(holds(await chainOf([sealedRun, forged])), false)
  // A run that read the rows live names no certificate: nothing to check further, and it holds on its own.
  const live = await credentialOf({ kind: 'run', creation: '01JX00000000000000000000RR', n: 1, at, by: 'jean', content: 'x', ingredients: [{ kind: 'collection', creation: '01JX0000000000000000000000', read: at }] })
  assert.equal(holds(await chainOf([await seal(live.credential, own, new Date(at))])), true)
})

test('a port lets in what a site’s form proposes: the port’s columns alone, by their labels, once, so many an hour; the collection judges nothing', () => {
  const one = collection([{ row: '01JX0000000000000000000001', set: { name: 'Ana', trade: 'Baker', checked: true }, at: '2026-11-21T10:00:00.000Z', by: 'user' }])
  const port = portOf(one.table, '2026-11-21T10:00:00.000Z')
  assert.deepEqual([port.columns, port.hour, Object.keys(port).sort()], [['name', 'trade'], HOUR, ['at', 'by', 'columns', 'format', 'hour']], 'what a form fills; a box is the collection’s own')
  const lines = /** @type {any[]} */ ([]), now = Date.parse('2026-11-21T12:00:00.000Z')
  const proposal = (/** @type {[string, string][]} */ fields) => ({ form: 'propose', at: '2026-11-21T11:59:00.000Z', fields: fields.map(([label, value]) => ({ label, value })) })
  assert.deepEqual(admitted(port, { ...one, lines }, [proposal([['Name', 'Bob'], [' trade ', 'Potter'], ['Checked', 'yes'], ['Secret', 'x']])], now), [{ set: { name: 'Bob', trade: 'Potter' } }], 'a field no column of the port takes is left out')
  assert.deepEqual(admitted(port, { ...one, lines }, [proposal([['Name', 'Ana'], ['Trade', 'Baker']]), proposal([['Name', 'Cy']]), proposal([['Name', 'Cy']]), proposal([['Checked', 'yes']])], now), [{ set: { name: 'Cy' } }], 'one the collection holds, one twice, one with nothing it takes')
  assert.equal(String(admitted(port, { ...one, lines }, [proposal([['Name', 'x'.repeat(LONGEST + 50)]])], now)[0].set.name).length, LONGEST)
  const recent = Array.from({ length: HOUR - 1 }, (_, i) => ({ row: `01JX00000000000000000009${String(i).padStart(2, '0')}`, set: { name: `n${i}` }, at: '2026-11-21T11:30:00.000Z', by: 'visitor' }))
  assert.equal(admitted(port, { ...one, lines: recent }, [proposal([['Name', 'Dee']]), proposal([['Name', 'Eve']])], now).length, 1, 'the hour’s count, those already in counted')
  assert.equal(admitted(port, { ...one, lines: recent.map((line) => ({ ...line, at: '2026-11-21T10:30:00.000Z' })) }, [proposal([['Name', 'Dee']]), proposal([['Name', 'Eve']])], now).length, 2, 'an hour later, room again')
  // What shows of a proposal is each consumer’s own criteria: a reference keeps the rows its where keeps, as they are.
  const proposed = collection([{ row: '01JX0000000000000000000002', set: { name: 'Bob', checked: true }, at: '2026-11-21T10:00:00.000Z', by: 'visitor' }])
  assert.deepEqual(tableOf(proposed, { fields: 'Name', where: 'Checked is yes' }, how), [['Name'], ['Bob']])
})

test('a site’s form proposes into the collection its data-to names', () => {
  assert.deepEqual([...formsTo(`<form method="post" data-form="propose" data-to="${PLACE}"><input name="n"></form><form data-form="orders" method="post"></form><form data-form="x" data-to="decks/a.deck.html">`)], [['propose', PLACE]])
})
