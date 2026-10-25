// Diagrams (D291, D592): a flowchart Pele refuses as brains write it, mended so that it reads as Mermaid reads it; the words a
// drawing shows, for those who can't see it; and its colours as Pele's own properties.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mended, wordsOf, coloured } from '../app/caps/interactive/diagram.js'

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
