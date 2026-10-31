// A demo (D457): a task's records played again as they came (app/ui/replay.js), and demo.html, which
// runs only its import map, by its hash, and Jean's own modules, with ui/state.js's stand-in in its place.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { PACE, exchanges, requestOf, words, beats } from '../app/ui/replay.js'
import { applyUpdate } from '../app/core/events.js'

const lines = (await readFile(new URL('./fixtures/demo.jsonl', import.meta.url), 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
const records = lines.slice(1)

test('a task is cut where the user speaks: what was said, a title and a shared file with it, then the answer', () => {
  const cut = exchanges(records)
  assert.equal(cut.length, 2)
  assert.deepEqual(cut.map(({ said, answer }) => [said.length, answer.length]), [[3, 5], [1, 2]])
  assert.equal(requestOf(cut[0].said), 'Make a chart of the sales by region, month by month')
  assert.equal(requestOf(cut[1].said), 'Which region should we look at first?')
  // An answer with no request before it (a flow run) is one exchange too.
  assert.deepEqual(exchanges(records.slice(4, 6)).map(({ said, answer }) => [said.length, answer.length]), [[0, 2]])
})

test('text is cut after each word, in its language, and the pieces make it whole again', () => {
  // Japanese has no spaces: its words are the dictionary's, which differ a little between versions of ICU.
  for (const [lang, text] of [['en', 'North sells the most, and **East** grew.'], ['ja', '北が一番売れています。'], ['ar', 'الشمال يبيع أكثر.']]) {
    const pieces = words(lang)(text)
    assert.equal(pieces.join(''), text, lang)
    assert.ok(pieces.length >= 3, `${lang}: ${JSON.stringify(pieces)}`)
  }
  assert.deepEqual(words('en')('Hello, world'), ['Hello, ', 'world'])
})

test('an answer plays as it came: the brain asked, its words, then done; a call under way, then done', () => {
  const played = [...beats(exchanges(records)[0].answer, words('en'))]
  const calls = played.filter(({ update }) => update.sessionUpdate === 'tool_call').map(({ update, hold }) => update.sessionUpdate === 'tool_call' && [update.toolCallId, update.status, hold])
  assert.deepEqual(calls, [
    ['brain-0', 'in_progress', PACE.think], ['brain-0', 'completed', PACE.done],
    ['call-1', 'in_progress', PACE.call], ['call-1', 'completed', PACE.done],
    ['brain-1', 'in_progress', PACE.think], ['brain-1', 'completed', 0],
  ])
  // The brain's own entry is done once its words are out, and what it found comes only then.
  const first = played.findIndex(({ update }) => update.sessionUpdate === 'agent_thought_chunk')
  assert.ok(first > 0 && played.slice(first).findIndex(({ update }) => update.sessionUpdate === 'tool_call' && update.status === 'completed') > 1)
  assert.equal(played.filter(({ update }) => update.sessionUpdate === 'tool_call' && update.status === 'in_progress').every(({ update }) => update.sessionUpdate === 'tool_call' && update.rawOutput === undefined), true)
  // Folded as the room folds a brain's stream, it is the answer the file keeps.
  const turn = { user: null, notes: [], steps: [], at: '' }
  for (const { update, step } of played) applyUpdate(turn, update, step)
  const kept = { user: null, notes: [], steps: [], at: '' }
  for (const { update, step } of exchanges(records)[0].answer) if (update) applyUpdate(kept, update, step)
  assert.deepEqual(turn, kept)
  // Each beat says the record it comes from, which a tour's stops name by its line.
  assert.deepEqual([...new Set(played.map(({ record }) => records.indexOf(record)))], [3, 4, 5, 6, 7])
})

test('demo.html runs only its import map, by its hash, and Jean’s own modules, with the copy’s state in ui/state.js’s place', async () => {
  const page = await readFile(new URL('../app/demo.html', import.meta.url), 'utf8')
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(page)?.[1] ?? ''
  const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(page)?.[1] ?? ''
  const first = /<script>([\s\S]*?)<\/script>/.exec(page)?.[1] ?? ''
  const hash = (/** @type {string} */ script) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`
  assert.ok(csp.includes(`script-src 'self' 'wasm-unsafe-eval' ${hash(map)} ${hash(first)};`), 'update the script-src hashes of its import map and its first line')
  // Its first line reads the look and light or dark as index.html's does, before anything is drawn.
  assert.ok(first.includes("localStorage.getItem(`${key}:${sessionStorage.getItem('app.profile') ?? localStorage.getItem('app.profile') ?? ''}`)") && page.indexOf(first) < page.indexOf('<link rel="stylesheet"'))
  assert.equal(JSON.parse(map).imports['./ui/state.js'], './ui/reader-state.js')
  assert.match(csp, /connect-src 'self';/)
  assert.match(csp, /require-trusted-types-for 'script'; trusted-types lit-html app-urls$/)
})
