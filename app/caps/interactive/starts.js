// SPDX-License-Identifier: MIT
// What visual answers draw (D291, D631), each as a start drawn at once that a document's "/" offers (D485): a page, the charts a page
// draws, diagrams, a map, a timeline and key figures. Each has its name's key among a document's strings, a glyph, a few English words
// to find it by as well as its name, and its Markdown, as an answer writes it. Pure, so a document reads it without the rest of this capability.

/** @type {{ key: string, glyph: string, words: string, markdown: string }[]} */
export const STARTS = [
  { key: 'page', glyph: '</>', words: 'page html app web interactive', markdown: '```html\n```' },
  ...Object.entries({ bar: ['▃▇', 'column histogram'], line: ['∿', 'trend curve'], area: ['◢', 'filled'], pie: ['◔', 'donut doughnut share'], hbar: ['☰', 'horizontal across ranking'] }).map(([kind, [glyph, more]]) => ({ key: `${kind}Chart`, glyph, words: `chart graph plot ${kind} ${more}`, markdown: `\`\`\`html\n<app-chart kind="${kind}">\nA | B | C | D\n1: 3, 5, 2, 6\n</app-chart>\n\`\`\`` })),
  { key: 'flowchart', glyph: '◇', words: 'diagram flowchart graph process decision mermaid', markdown: '```mermaid\nflowchart LR\n  A --> B\n```' },
  { key: 'mindMap', glyph: '⊛', words: 'diagram mind map ideas brainstorm mermaid', markdown: '```mermaid\nmindmap\n  root((A))\n    B\n    C\n    D\n```' },
  { key: 'sequence', glyph: '⇄', words: 'diagram sequence messages exchange mermaid', markdown: '```mermaid\nsequenceDiagram\n  A->>B: 1\n  B-->>A: 2\n```' },
  { key: 'map', glyph: '⌖', words: 'map places geojson', markdown: '```geojson\n{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[2.35,48.86]},"properties":{}}]}\n```' },
  { key: 'timeline', glyph: '◷', words: 'timeline schedule agenda dates history', markdown: '- **09:00** A\n- **10:30** B\n- **12:00** C' },
  { key: 'figures', glyph: '#', words: 'key figures numbers metrics stats kpi', markdown: '- **3** A\n- **85%** B\n- **12** C' },
]
