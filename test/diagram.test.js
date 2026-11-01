// Diagrams (D291, D592): a flowchart Pele refuses as brains write it, mended so that it reads as Mermaid reads it; the words a
// drawing shows, for those who can't see it; and its colours as Pele's own properties.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mended, wordsOf, coloured, stepsOf } from '../app/caps/interactive/diagram.js'

/** Pele from Jean's own node_modules, which an optional dependency may not hold. */
const pele = await import('pele/lazy').catch(() => null)

test('a box whose closing brackets are swapped, or whose words hold brackets or quotes, is written as Mermaid reads it', () => {
  assert.equal(mended('flowchart TD\n  A([Flèches)] --> B[← → déplacer]\n  C[(Stock]) --> D([Call f(x)])'),
    'flowchart TD\n  A(["Flèches"]) --> B["← → déplacer"]\n  C[("Stock")] --> D(["Call f(x)"])')
  assert.equal(mended('flowchart TD\n  A[Milk & "cream"] --> B{Butter?}\n  B -->|Yes (often)| C([Bread])\n  B -- No --> D["Wear **sunglasses**"]'),
    'flowchart TD\n  A["Milk & #quot;cream#quot;"] --> B{"Butter?"}\n  B -->|"Yes (often)"| C(["Bread"])\n  B -->|"No"| D["Wear sunglasses"]')
  // On its first line too, a word's own brackets kept; classes, comments, styles and a subgraph's title as Mermaid has them.
  assert.equal(mended('graph LR; A --- B(f(x)); B ==> C[Done]'), 'graph LR; A --- B("f(x)"); B ==> C["Done"]')
  assert.equal(mended('flowchart TD\n  %% plan\n  A:::hot & B -. maybe .-> C\n  classDef hot fill:#f00\n  subgraph S [Group (one)]\n  end'),
    'flowchart TD\n  %% plan\n  A:::hot & B -.->|"maybe"| C\n  classDef hot fill:#f00\n  subgraph S ["Group (one)"]\n  end')
})

test('what this can\'t read, and any other kind of diagram, is left as it is', () => {
  for (const source of ['flowchart TD\n  A --> B[Hel', 'flowchart TD\n  A ~~~ B', 'sequenceDiagram\n  A->>B: Hello (again)', 'mindmap\n  root((Coffee))\n    Beans (raw)', '']) {
    assert.equal(mended(source), source)
  }
})

test('a flowchart is told as its boxes, in the order written, each with where it leads and the words on the way', () => {
  assert.deepEqual(stepsOf('flowchart TD\n  A[Leaving home] --> B{Is it raining?}\n  B -->|Yes| C[Take an umbrella]\n  B -- No --> D[Wear sunglasses]\n  C & D --> E([Go out])'), [
    { box: 'Leaving home', next: ['Is it raining?'] },
    { box: 'Is it raining?', next: ['Yes: Take an umbrella', 'No: Wear sunglasses'] },
    { box: 'Take an umbrella', next: ['Go out'] },
    { box: 'Wear sunglasses', next: ['Go out'] },
    { box: 'Go out', next: [] },
  ])
  // A box named after its first arrow, one with no words but its id, a line break, what isn't a statement.
  assert.deepEqual(stepsOf('graph LR; A --> B\n  %% note\n  B[Second<br/>step]\n  classDef x fill:#fff'), [{ box: 'A', next: ['Second step'] }, { box: 'Second step', next: [] }])
})

test('a sequence and a state diagram are told in turn, by the names they give; another kind has no steps', () => {
  assert.deepEqual(stepsOf('sequenceDiagram\n  participant A as Alice\n  A->>Bob: Hello\n  A->>Bob: Are you there?\n  Bob-->>A: Yes\n  Note over A: Glad'), [
    { box: 'Alice', next: ['Hello: Bob', 'Are you there?: Bob'] }, { box: 'Bob', next: ['Yes: Alice'] }, { box: 'Glad', next: [] }])
  assert.deepEqual(stepsOf('stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy: start'), [{ box: 'Idle', next: ['start: Busy'] }])
  for (const source of ['mindmap\n  root((Coffee))\n    Beans', 'pie\n  "A": 1', '']) assert.deepEqual(stepsOf(source), [])
})

test('Pele draws each mended flowchart that it refused as written', { skip: !pele && 'pele is not installed' }, async () => {
  const render = /** @type {any} */ (pele).renderAsync
  for (const source of ['flowchart TD\n  A([Flèches)] --> D([Call f(x)])', 'flowchart TD\n  A[Milk & "cream"] --> B', 'flowchart TD\n  subgraph S [Group (one)]\n  A\n  end']) {
    await assert.rejects(render(source, {}))
    assert.ok(wordsOf((await render(mended(source), {})).svg))
  }
  assert.equal(wordsOf((await render(mended('flowchart LR\n  A[Milk & "cream"] --> B([Call f(x)])'), {})).svg), 'Milk & "cream", Call f(x)')
})

test('a drawing\'s words, its marks read, and its colours given as Pele\'s own properties inside it', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><g><text x="1">Tom &amp; Jerry</text><text><tspan>two</tspan> <tspan>lines</tspan></text><text> </text></g></svg>'
  assert.equal(wordsOf(svg), 'Tom & Jerry, two lines')
  assert.equal(coloured(svg, { fg: '#111', font: 'Inter, "x"<y>' }), svg.replace('<g>', '<style>svg{--pele-fg:#111;--pele-font:Inter, xy}</style><g>'))
})
