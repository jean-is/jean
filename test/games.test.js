// Games (D648): a game's file, its changes by exact passages, the loop guard, the play-test's report, and what the brain is given.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileOf, gameOf, actionsOf, replaceOnce, PLACE } from '../app/caps/games/file.js'
import { guard } from '../app/caps/games/guard.js'
import { say, apart, FRAMES } from '../app/caps/games/report.js'
import { LINES, GAME, CHANGE } from '../app/caps/games/tool.js'

const one = { name: 'Lantern & "Leap"', card: 'You are a lantern <and> you must leap.', code: "const end = '</script>'\nhost.state('play')", meta: { engine: 'phaser', actions: 'left right a', author: 'jean', created: 'T0', changed: 'T1', pinned: '', source: 'conversations/x.jsonl' } }

test("a game's file: a page that holds it whole, its code inert, its facts in its head, read back as it was", () => {
  const page = fileOf(one, 'fr')
  assert.match(page, /^<!doctype html>\n<html lang="fr">/)
  assert.match(page, /<meta name="format" content="1">/)
  assert.match(page, /<script type="text\/x-game" id="game">/)
  assert.doesNotMatch(page, /'<\/script>'/, 'the code never closes its script')
  assert.doesNotMatch(page, /name="pinned"/, 'an empty fact is left out')
  assert.deepEqual(gameOf(page), { ...one, meta: { format: '1', engine: 'phaser', actions: 'left right a', author: 'jean', created: 'T0', changed: 'T1', source: 'conversations/x.jsonl' } })
  assert.equal(gameOf('<!doctype html><title>Not a game</title>'), null)
  assert.equal(gameOf(fileOf({ ...one, meta: { ...one.meta, engine: 'unity' } }, 'en'))?.meta.engine, 'none', 'an engine Jean doesn’t lend is none')
  assert.ok(PLACE.test('games/01JABC-lantern.game.html'))
  assert.ok(!PLACE.test('games/.saves/01JABC.json'))
})

test('the actions a game uses: those Jean knows, each once, all six when it names none', () => {
  assert.deepEqual(actionsOf(['left', 'jump', 'left', 'a']), ['left', 'a'])
  assert.deepEqual(actionsOf('up down'), ['up', 'down'])
  assert.deepEqual(actionsOf(undefined), ['left', 'right', 'up', 'down', 'a', 'b'])
})

test('a change by exact passages: each found once, in order, or why not', () => {
  assert.deepEqual(replaceOnce('a b c', [{ old: 'b', new: 'B' }, { old: 'B c', new: 'D' }]), { code: 'a D' })
  assert.match(/** @type {any} */ (replaceOnce('a b', [{ old: 'x', new: 'y' }])).error, /Change 1: its old passage isn't in the game/)
  assert.match(/** @type {any} */ (replaceOnce('a a', [{ old: 'a', new: 'b' }])).error, /more than once/)
  assert.match(/** @type {any} */ (replaceOnce('a', [{ old: '', new: 'b' }])).error, /isn't in the game/)
})

test('the loop guard: in every while and classic for, never in strings, templates, comments, regular expressions or properties, lines kept', () => {
  const g = (/** @type {string} */ code) => guard(code, 'C()')
  assert.equal(g('while (x < 3) x++'), 'while (C() && (x < 3)) x++')
  assert.equal(g('do { x++ } while (x)'), 'do { x++ } while (C() && (x))')
  assert.equal(g('for (;;) {}'), 'for (; C();) {}')
  assert.equal(g('for (let i = 0, j = f(a, b); i < (n); i++) {}'), 'for (let i = 0, j = f(a, b); C() && ( i < (n)); i++) {}')
  for (const code of ['for (const a of list) {}', 'for (const k in o) {}', 'for await (const x of it) {}', 'const s = "while (x) {}"', "const s = 'for (;;)'", 'const t = `while (${a}) {}`',
    '// while (x) {}', '/* for (;;) */', 'const r = /while (x)/g', 'obj.while(x)', 'a?.for(1)', 'const o = { while: 1, for: 2 }']) assert.equal(g(code), code)
  assert.equal(g('const t = `${(() => { while (a) b() })()}`'), 'const t = `${(() => { while (C() && (a)) b() })()}`')
  assert.equal(g('if (/[/]/.test(s)) while (x) y()'), 'if (/[/]/.test(s)) while (C() && (x)) y()')
  assert.equal(g('const q = a / b; while (q) f()'), 'const q = a / b; while (C() && (q)) f()')
  const lines = 'let i = 0\nwhile (\n  i < 3\n) {\n  i++\n}\nfor (let j = 0;\n j < 2;\n j++) {}\n'
  assert.equal(g(lines).split('\n').length, lines.split('\n').length)
})

/** A run as the shell reports it. @param {Partial<import('../app/caps/games/report.js').Run>} [run] */
const run = (run = {}) => ({ errors: [], states: [[0, 'title'], [350, 'play']], scores: [], violations: [], alerts: [], words: ['Lantern Leap', 'Score 3'], text: '', prints: Array.from({ length: FRAMES / 10 }, (_, k) => [k]), work: { mean: 0.8, worst: 12 }, frames: FRAMES, ...run })
const english = () => 'en'

test('the report: what each control changed beyond what two baselines differ by, the moments, the words, the work, then nothing to fix', () => {
  const base = run(), moved = run({ prints: base.prints.map((print, k) => (k > 25 ? [k + 1] : print)) })
  const { clean, text } = say({ base, again: run(), runs: { left: moved, b: run() }, lang: 'en', langOf: english, seconds: 20 })
  assert.ok(clean, text)
  assert.match(text, /^Moments: title → play\.$/m)
  assert.match(text, /^left changed the picture; b changed nothing\.$/m)
  assert.match(text, /^Words seen: Lantern Leap · Score 3\.$/m)
  assert.match(text, /^Work per frame: 0\.8 ms on average, 12 ms at worst; a frame is 16\.7 ms\.$/m)
  assert.match(text, /Nothing to fix\.$/)
  // A change no bigger than two baselines differ by is noise.
  const noisy = run({ prints: base.prints.map((print, k) => (k > 25 ? [k + 1] : print)) })
  assert.match(say({ base, again: noisy, runs: { left: moved }, lang: 'en', langOf: english, seconds: 20 }).text, /No control changed the picture \(left\)/)
  assert.equal(apart([1, 2, 3, 4], [1, 2, 3, 6]), 0.5)
  assert.equal(apart([1, 7], [1, 8]), 1)
})

test('the report: an error at its line with what it often means, what was blocked, alert(), no play, words in another language', () => {
  const base = run({ errors: [{ message: 'Unexpected reserved word', name: 'SyntaxError' }, { message: 'Unexpected reserved word', name: 'SyntaxError', line: 22, frame: 1 }],
    violations: ['style-src-elem https://fonts.googleapis.com/css2', 'style-src-elem https://fonts.googleapis.com/css2'], alerts: ['hi'], states: [] })
  const { clean, text } = say({ base, again: base, runs: {}, lang: 'fr', langOf: english, seconds: 20 })
  assert.ok(!clean)
  assert.match(text, /^Error at line 22 \(frame 1\): SyntaxError: Unexpected reserved word \(often `await` outside an `async` function; `host\.load\(\)` needs no `await`\)\.$/m)
  assert.equal(text.match(/Unexpected reserved word/g)?.length, 1, 'once, at its line')
  assert.match(text, /^Blocked: style-src-elem https:\/\/fonts\.googleapis\.com\/css2\. Nothing loads/m)
  assert.match(text, /^alert\(\), confirm\(\) and prompt\(\) show nothing here/m)
  assert.match(text, /^It never called host\.state\('play'\) after a was pressed\.$/m)
  assert.match(text, /^The words the player sees aren't in French, the user's language\.$/m)
  assert.match(text, /To fix: 6\.$/)
})

test('the report: too slow, which got some way, apart from frozen, which got nowhere', () => {
  assert.match(say({ base: run({ timeout: true, frames: 100 }), again: run(), runs: {}, lang: 'en', langOf: english, seconds: 20 }).text, /^Too slow: 100 frames of 420 in 20 s, about 200 ms a frame against 16\.7\./)
  assert.equal(say({ base: run({ timeout: true, frames: 0 }), again: run(), runs: {}, lang: 'en', langOf: english, seconds: 20 }).text, 'The game froze: no frame came in 20 s.')
})

test('what the brain is given: a line each within 40 tokens, schemas within 400, the actions and engines Jean knows', () => {
  assert.deepEqual(LINES.map((line) => line.name), [GAME.name, CHANGE.name])
  for (const line of LINES) assert.ok(Math.ceil(`- ${line.name}: ${line.line}`.length / 4) <= 40, line.line)
  for (const spec of [GAME, CHANGE]) assert.ok(Math.ceil(JSON.stringify(spec).length / 4) <= 400, `${spec.name}: ${JSON.stringify(spec).length} characters`)
  const { properties } = /** @type {any} */ (GAME.parameters)
  assert.deepEqual(properties.engine.enum, ['phaser', 'none'])
  assert.deepEqual(properties.actions.items.enum, ['left', 'right', 'up', 'down', 'a', 'b'])
})
