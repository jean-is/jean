// Diagrams (D291): a Mermaid block's flowchart or mind map, read and laid out by Jean, as brains write
// them; anything else, or a block not whole yet, read as nothing, so that it stays code.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, flowLayout, mindLayout } from '../app/caps/interactive/diagram.js'

/** Each character the same width, as no canvas measures here. @param {string} text */
const measure = (text) => text.length * 7.5

test('a flowchart: its boxes, their shapes and words, its arrows and theirs', () => {
  const chart = /** @type {import('../app/caps/interactive/diagram.js').Flowchart} */ (parse('flowchart TD\n  A([Leaving home]) --> B{Is it raining?}\n  B -->|Yes| C[Take an umbrella]\n  B -- No --> D["Wear **sunglasses**"]\n  C & D --> E((Out))\n  E -.-> A\n  classDef big font-size:20px\n  %% a comment'))
  assert.equal(chart.kind, 'flowchart')
  assert.equal(chart.across, false)
  assert.deepEqual([...chart.boxes.values()].map((box) => [box.id, box.shape, box.label]),
    [['A', 'pill', 'Leaving home'], ['B', 'diamond', 'Is it raining?'], ['C', 'box', 'Take an umbrella'], ['D', 'box', 'Wear sunglasses'], ['E', 'circle', 'Out']])
  assert.deepEqual(chart.links.map((link) => [link.from, link.to, link.label, link.dashed, link.arrow]),
    [['A', 'B', '', false, true], ['B', 'C', 'Yes', false, true], ['B', 'D', 'No', false, true], ['C', 'E', '', false, true], ['D', 'E', '', false, true], ['E', 'A', '', true, true]])
  // On one line, across, with lines between boxes and no arrow.
  const across = /** @type {any} */ (parse('graph LR; A --- B; B ==> C[Done]'))
  assert.equal(across.across, true)
  assert.deepEqual(across.links.map((/** @type {any} */ link) => link.arrow), [false, true])
})

test('a mind map: its branches by their indent, shapes or plain words', () => {
  const map = /** @type {any} */ (parse('mindmap\n  root((Coffee))\n    Origins\n      Ethiopia\n      Yemen\n    [Brewing]\n      Espresso\n    Health of drinkers\n      ::icon(fa fa-heart)'))
  assert.deepEqual(JSON.parse(JSON.stringify(map.root, (key, value) => (key === 'shape' ? undefined : value))), { label: 'Coffee', children: [
    { label: 'Origins', children: [{ label: 'Ethiopia', children: [] }, { label: 'Yemen', children: [] }] },
    { label: 'Brewing', children: [{ label: 'Espresso', children: [] }] },
    { label: 'Health of drinkers', children: [] },
  ] })
})

test('a box whose closing brackets are swapped, as brains sometimes write them, keeps its shape and words; one closed as Mermaid closes it reads as before', () => {
  const chart = /** @type {import('../app/caps/interactive/diagram.js').Flowchart} */ (parse('flowchart TD\n  A([Flèches)] --> B[← → déplacer]\n  C[(Stock]) --> D([Call f(x)])'))
  assert.deepEqual([...chart.boxes.values()].map((box) => [box.id, box.shape, box.label]),
    [['A', 'pill', 'Flèches'], ['B', 'box', '← → déplacer'], ['C', 'pill', 'Stock'], ['D', 'pill', 'Call f(x)']])
  assert.deepEqual(chart.links.map((link) => [link.from, link.to]), [['A', 'B'], ['C', 'D']])
  assert.equal(parse('flowchart TD\n  A([Flèches)'), null)
})

test('another kind of diagram, a box not closed yet, or an arrow to nowhere is read as nothing', () => {
  assert.equal(parse('sequenceDiagram\n  A->>B: Hello'), null)
  assert.equal(parse('flowchart TD\n  A --> B[Hel'), null)
  assert.equal(parse('flowchart TD\n  A -->'), null)
  assert.equal(parse('flowchart TD'), null)
  assert.equal(parse(''), null)
})

test('a flowchart is laid out in ranks along its flow, a loop going back, its boxes apart', () => {
  const chart = /** @type {any} */ (parse('flowchart TD\n  A --> B\n  B --> C\n  B --> D\n  C --> E\n  D --> E\n  E --> A'))
  const { where, back, width, height } = flowLayout(chart, measure)
  const y = (/** @type {string} */ id) => where.get(id)?.y ?? NaN
  assert.ok(y('A') < y('B') && y('B') < y('C') && y('C') < y('E'))
  assert.equal(y('C'), y('D'))
  assert.equal(back.size, 1)
  const [c, d] = [where.get('C'), where.get('D')]
  assert.ok(c && d && Math.abs(c.x - d.x) >= (c.width + d.width) / 2)
  assert.ok(width > 0 && height > 0)
  // Across: ranks from left to right.
  const across = flowLayout(/** @type {any} */ (parse('flowchart LR\n  A --> B --> C')), measure)
  assert.ok(/** @type {any} */ (across.where.get('A')).x < /** @type {any} */ (across.where.get('C')).x)
})

test('a mind map is laid out either side of its root, by how much each branch holds', () => {
  const map = /** @type {any} */ (parse('mindmap\n  root((Topic))\n    A\n      A1\n      A2\n    B\n      B1\n    C'))
  const { placed } = mindLayout(map, measure)
  const root = placed[0]
  const x = (/** @type {string} */ label) => placed.find((each) => each.branch.label === label)?.x ?? NaN
  assert.ok(x('A') > root.x && x('B') < root.x, 'the first two branches, on either side')
  assert.ok(x('A1') > x('A') && x('B1') < x('B'), 'each further out than its parent')
  assert.equal(placed.length, 7)
})
