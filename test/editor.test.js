// Documents' editor (D485), under node --test: a document's Markdown read and written back byte for byte,
// Jean's changes found where they are, and blocks moved, a list's items among them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { EditorState, TextSelection } from 'prosemirror-state'
import { Marked } from 'marked'
import { parse, parseDoc, serialize, same, schema, blockMarkdown, sliceMarkdown } from '../app/caps/documents/markdown.js'
import { diff } from '../app/caps/documents/suggest.js'
import { BlockSelection, blockRange, moveBlocks, units } from '../app/caps/documents/blocks.js'

const ROOT = new URL('../', import.meta.url)
const SAMPLE = new URL('fixtures/editor/jean-answer.md', import.meta.url)
const corpus = async () => {
  const own = await Promise.all(['jean-answer.md', 'llm-styles.md'].map(async (name) => [name, await readFile(new URL(`fixtures/editor/${name}`, import.meta.url), 'utf8')]))
  // Jean's own docs: long, varied, full of tables, code and HTML; a stress test more than a sample.
  const docs = await Promise.all(['README.md', 'AGENTS.md', 'MANIFESTO.md', ...(await readdir(new URL('docs/', ROOT))).filter((n) => n.endsWith('.md')).map((n) => `docs/${n}`)]
    .map(async (name) => [name, await readFile(new URL(name, ROOT), 'utf8')]))
  return /** @type {Array<[string, string]>} */ ([...own, ...docs])
}

test('a file nobody changed is written back byte for byte', async () => {
  for (const [name, text] of await corpus()) {
    const { doc, sources } = parse(text)
    assert.equal(serialize(doc, sources), text, name)
  }
})

test('every block written again reads back as the same block, and writing it again changes nothing', async () => {
  for (const [name, text] of await corpus()) {
    parse(text).doc.forEach((node) => {
      const written = blockMarkdown(node)
      const back = parseDoc(written)
      assert.equal(back.childCount, 1, `${name}: ${written}`)
      assert.ok(same(back.firstChild, node), `${name}: ${written}`)
      assert.equal(blockMarkdown(/** @type {any} */ (back.firstChild)), written, `${name}: idempotent`)
    })
  }
})

// marked's own HTML, which doesn't go through the editor's reading: what the file says, whichever way it's written.
const html = (/** @type {string} */ text) => /** @type {string} */ (new Marked().parse(text)).replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()

test('the whole file written again says what it said, as marked draws it', async () => {
  for (const [name, text] of await corpus()) assert.equal(html(serialize(parseDoc(text))), html(text), name)
})

test('the markers a file was written with are kept when a block is written again', () => {
  const cases = ['* one\n* two', '+ one\n+ two', '1) one\n2) two', '7. seven\n8. eight', '_em_ and __strong__ and ~~del~~', '~~~js\nx\n~~~', '- [x] done\n- [ ] to do',
    '| a | b |\n|:--|--:|\n| 1 | 2 |', 'As said [1], snake_case_name, $5 and $10, AT&T.', 'A star \\* kept text, and <b>html</b>.', 'Formula $x^2$ inline.']
  for (const source of cases) assert.equal(blockMarkdown(/** @type {any} */ (parseDoc(source).firstChild)), source)
})

test('text that would read as markup is escaped, and only that', () => {
  const p = (/** @type {string} */ text) => schema.node('paragraph', null, [schema.text(text)])
  const cases = [['2 * 3 * 4', '2 \\* 3 \\* 4'], ['[a](b) typed as text', '[a\\](b) typed as text'], ['# not a heading', '\\# not a heading'], ['1. not a list', '1\\. not a list'],
    ['$x$ is not a formula here', '\\$x\\$ is not a formula here'], ['&amp; typed', '&amp;amp; typed'], ['<b> typed', '&lt;b> typed']]
  for (const [text, expected] of cases) {
    const written = blockMarkdown(p(text))
    assert.equal(written, expected)
    assert.equal(parseDoc(written).firstChild?.textContent, text)
  }
})

test('one changed paragraph changes only its own lines', async () => {
  const text = await readFile(SAMPLE, 'utf8')
  const { doc, sources } = parse(text)
  let at = -1
  doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text?.includes('Keep receipts')) at = pos; return at < 0 })
  const after = serialize(EditorState.create({ doc }).tr.insertText('Please k', at, at + 1).doc, sources).split('\n')
  const before = text.split('\n')
  assert.equal(after.length, before.length)
  assert.deepEqual(after.flatMap((line, i) => (line === before[i] ? [] : [i])), [before.findIndex((line) => line.includes('Keep receipts'))])
})

test('a selection is given as Markdown', () => {
  assert.equal(sliceMarkdown(parseDoc('Some **bold** text and a [link](https://e.x).'), 6, 15), '**bold** text')
})

/** Applies every change, as Keep all does. @param {import('prosemirror-model').Node} doc @param {import('prosemirror-model').Node} proposed */
function keepAll(doc, proposed) {
  const hunks = diff(doc, proposed).sort((a, b) => b.from - a.from)
  const tr = EditorState.create({ doc }).tr
  for (const hunk of hunks) tr.replaceWith(hunk.from, hunk.to, hunk.content)
  return { hunks, doc: tr.doc }
}

test('Jean\'s changes are found where they are, and keeping all of them gives Jean\'s version', async () => {
  const text = await readFile(SAMPLE, 'utf8')
  const doc = parseDoc(text)
  /** @type {Array<[(s: string) => string, number, boolean | null]>} */
  const edits = [
    [(s) => s.replace('plan for the week', 'plan for the fortnight'), 1, true],
    [(s) => s.replace('## Schedule\n', '## Schedule\n\nA line Jean adds.\n'), 1, false],
    [(s) => s.replace('- Share this page with the team\n', '- Share this page with the team\n- Print the tickets\n'), 1, false],
    [(s) => s.replace('| Tuesday | 860 € | Malik |', '| Tuesday | 900 € | Malik |'), 1, true],
    [(s) => s.replace('**three files**', '*three files*'), 1, true],
    [(s) => s.replace('火曜日の**ワークショップ**は10時に始まります。', '火曜日の**ワークショップ**は11時に始まります。'), 1, true],
    [(s) => s.replace(/> Keep receipts[^\n]*\n\n/, ''), 1, false],
    [(s) => s.replace('plan for the week', 'plan for next week').replace('dinner at 19:30', 'dinner at 20:00').replace('- [ ] Train tickets', '- [x] Train tickets'), 3, null],
  ]
  for (const [edit, count, inline] of edits) {
    const proposed = parseDoc(edit(text))
    const { hunks, doc: kept } = keepAll(doc, proposed)
    assert.equal(hunks.length, count, String(edit))
    if (inline !== null) assert.equal(hunks[0].inline, inline)
    assert.ok(kept.eq(proposed), String(edit))
  }
})

test('a word changed among many is one small change, in English and in Japanese', () => {
  const [en] = diff(parseDoc('The quick brown fox jumps over the lazy dog.'), parseDoc('The quick red fox jumps over the lazy dog.'))
  assert.equal(en.content.textBetween(0, en.content.size), 'red')
  const [ja] = diff(parseDoc('東京で会議を開きます。'), parseDoc('大阪で会議を開きます。'))
  assert.equal(ja.content.textBetween(0, ja.content.size), '大阪')
})

test('blocks moved next to each other keep a blank line between them, and read back as they were', () => {
  const { doc, sources } = parse('First.\n\nSecond.\n\nThird.\n')
  const two = doc.child(0).nodeSize + doc.child(1).nodeSize
  const text = serialize(doc.copy(doc.content.cut(two).append(doc.content.cut(0, two))), sources)
  assert.equal(text, 'Third.\n\nFirst.\n\nSecond.\n')
  assert.equal(parseDoc(text).childCount, 3)
})

test('two lists of a kind next to each other stay two: the second takes the other marker', () => {
  for (const [source, expected] of [['- a\n\nMid.\n\n- b\n', '- a\n\n* b\n'], ['1. a\n\nMid.\n\n1. b\n', '1. a\n\n1) b\n'], ['* a\n\nMid.\n\n* b\n', '* a\n\n- b\n']]) {
    const { doc, sources } = parse(source)
    const text = serialize(doc.copy(doc.content.cut(0, doc.child(0).nodeSize).append(doc.content.cut(doc.child(0).nodeSize + doc.child(1).nodeSize))), sources)
    assert.equal(text, expected)
    assert.equal(parseDoc(text).childCount, 2, text)
  }
})

test('columns side by side are Pandoc\'s fenced divs: read with any blocks in each, written back as they were, or again when changed (D501)', () => {
  const source = 'Before.\n\n:::: columns\n::: column\n## Left\n\n- one\n- two\n:::\n\n::: column\nRight, **bold**.\n:::\n::::\n\nAfter.\n'
  const { doc, sources } = parse(source)
  assert.deepEqual([...Array(doc.childCount).keys()].map((i) => doc.child(i).type.name), ['paragraph', 'columns', 'paragraph'])
  const [left, right] = [doc.child(1).child(0), doc.child(1).child(1)]
  assert.deepEqual([left.child(0).type.name, left.child(1).type.name, right.textContent], ['heading', 'bullet_list', 'Right, bold.'])
  assert.equal(serialize(doc, sources), source)
  // Changed, they are written again as Pandoc writes them, and read back as the same block; an empty column stays one.
  const empty = schema.nodes.columns.create(null, [left, right, schema.nodes.column.create(null, schema.nodes.paragraph.create())])
  const text = blockMarkdown(empty)
  assert.equal(text, ':::: columns\n::: column\n## Left\n\n- one\n- two\n:::\n\n::: column\nRight, **bold**.\n:::\n\n::: column\n:::\n::::')
  assert.ok(same(parseDoc(text).firstChild, empty))
  // Without their closing fence, or inside a quote, they are what they were written as; Pandoc's {.columns} opens them too.
  assert.equal(parseDoc(':::: columns\n::: column\nOpen.\n').child(0).type.name, 'paragraph')
  assert.equal(parseDoc('> ::: columns\n> ::: column\n> In.\n> :::\n> :::\n').firstChild?.firstChild?.type.name, 'raw_block')
  assert.equal(parseDoc('::: {.columns}\n::: {.column width="40%"}\nA\n:::\n:::\n').firstChild?.childCount, 1)
})

/**
 * Moves the blocks from the ith to the jth, or the caret's, up or down, and gives the Markdown and what is selected after.
 * @param {string} source @param {number | null} i @param {number} j @param {-1 | 1} dir @param {number} [caret]
 */
function move(source, i, j, dir, caret = 0) {
  const { doc, sources } = parse(source)
  const all = units(doc)
  let state = EditorState.create({ doc, selection: i === null ? TextSelection.create(doc, caret) : BlockSelection.create(doc, all[i].from, all[j].to) })
  const moved = moveBlocks(dir)(state, (tr) => { state = state.apply(tr) })
  return { moved, text: serialize(state.doc, sources), chosen: blockRange(state).chosen.map((unit) => unit.node.textContent), type: state.selection.toJSON().type }
}

test('a list\'s items are blocks of their own: among their list, out of it as a list of their own, into the list beside them', () => {
  const doc = 'Para.\n\n- one\n- two\n- three\n\nLast.\n'
  assert.deepEqual(units(parseDoc(doc)).map((unit) => unit.node.textContent), ['Para.', 'one', 'two', 'three', 'Last.'])
  assert.deepEqual(move(doc, 2, 2, -1), { moved: true, text: 'Para.\n\n- two\n- one\n- three\n\nLast.\n', chosen: ['two'], type: 'block' })
  assert.equal(move(doc, 1, 1, -1).text, '- one\n\nPara.\n\n- two\n- three\n\nLast.\n')
  assert.equal(move(doc, 3, 3, 1).text, 'Para.\n\n- one\n- two\n\nLast.\n\n- three\n')
  assert.deepEqual(move(doc, 1, 3, 1).chosen, ['one', 'two', 'three'])
  assert.equal(move(doc, 1, 3, 1).text, 'Para.\n\nLast.\n\n- one\n- two\n- three\n')
  // A paragraph moves past a whole list, and a block at the top moves no higher.
  assert.equal(move(doc, 0, 0, 1).text, '- one\n- two\n- three\n\nPara.\n\nLast.\n')
  assert.equal(move(doc, 0, 0, -1).moved, false)
  // An item next to a list of its kind joins it, at its end from below and at its start from above.
  assert.equal(move('- a\n- b\n\n* c\n\nMid.\n', 2, 2, -1).text, '- a\n- b\n- c\n\nMid.\n')
  assert.equal(move('- a\n- b\n\n* c\n\nMid.\n', 1, 1, 1).text, '- a\n\n* b\n* c\n\nMid.\n')
  // An item moves with what is nested in it, and the caret's own block moves, the caret with it.
  assert.equal(move('Para.\n\n- one\n  - nested\n- two\n', 1, 1, 1).text, 'Para.\n\n- two\n- one\n  - nested\n')
  const caret = move(doc, null, 0, 1, units(parseDoc(doc))[2].at + 2)
  assert.deepEqual([caret.text, caret.type, caret.chosen], ['Para.\n\n- one\n- three\n- two\n\nLast.\n', 'text', ['two']])
})
