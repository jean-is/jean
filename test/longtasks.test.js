// What npm run longtasks counts (test/longtasks/score.js): pass^k, partial credit, two-order verdicts, languages,
// numbers in any locale, and what records say of plans, summaries and work done again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bothOrders, brainSteps, choose, gives, jsonIn, languageOf, names, numbersIn, partial, passHat, planOf, redone, summariesOf, verdictOf, winRate } from './longtasks/score.js'

test('pass^k is the chance that k runs all succeed, unbiased from n runs', () => {
  assert.equal(choose(5, 2), 10)
  assert.equal(choose(2, 3), 0)
  assert.equal(passHat([{ n: 4, c: 4 }], 3), 1)
  assert.equal(passHat([{ n: 4, c: 2 }], 1), 0.5)
  // Two of four: C(2,2)/C(4,2) = 1/6.
  assert.equal(passHat([{ n: 4, c: 2 }], 2), 1 / 6)
  assert.equal(passHat([{ n: 3, c: 3 }, { n: 3, c: 0 }], 3), 0.5)
  assert.ok(Number.isNaN(passHat([{ n: 2, c: 2 }], 3)))
})

test("TheAgentCompany's partial credit: half for the share passed, half more for all", () => {
  assert.equal(partial([true, true, true, true]), 1)
  assert.equal(partial([true, false, false, false]), 0.125)
  assert.equal(partial([false, false]), 0)
  assert.equal(partial([]), 0)
})

test('a verdict counts only when it survives the swap', () => {
  assert.deepEqual(bothOrders('A', 'B'), { verdict: 'A', consistent: true })
  assert.deepEqual(bothOrders('A', 'A'), { verdict: 'tie', consistent: false })
  assert.deepEqual(bothOrders('tie', 'tie'), { verdict: 'tie', consistent: true })
  assert.deepEqual(bothOrders(null, 'B'), { verdict: 'tie', consistent: false })
  assert.equal(verdictOf('Here: {"better": "B", "why": "…"}'), 'B')
  assert.equal(verdictOf('{"better":"tie"}'), 'tie')
  assert.equal(verdictOf('no idea'), null)
  assert.deepEqual(jsonIn('```json\n{"a": [1, 2], "better": "A"}\n```'), { a: [1, 2], better: 'A' })
  assert.equal(jsonIn('nothing'), null)
  assert.equal(winRate(['A', 'tie', 'B', 'A'], 'A'), 0.625)
})

test('languages by their letters and commonest words', () => {
  assert.equal(languageOf('The team spent most of the budget on travel, and this is the summary.'), 'en')
  assert.equal(languageOf("L'équipe a dépensé la plus grande partie du budget pour les déplacements et la formation."), 'fr')
  assert.equal(languageOf('أنفق الفريق معظم الميزانية على السفر.'), 'ar')
  assert.equal(languageOf('チームは予算の大部分を出張に使いました。'), 'ja')
  assert.equal(languageOf('42'), '?')
})

test('numbers in any locale, and names case and accents aside', () => {
  assert.deepEqual(numbersIn('1 234,50 € and 1,234.50 and 1234.5 or 7'), [1234.5, 1234.5, 1234.5, 7])
  assert.deepEqual(numbersIn('12,345 people'), [12345])
  assert.deepEqual(numbersIn('Amira\t1697.52\t870.9\t4930.73'), [1697.52, 870.9, 4930.73])
  assert.deepEqual(numbersIn('Jan 5 1200, then 2 100'), [5, 1200, 2100])
  assert.ok(gives('Total : 3 210,40 €', 3210.4))
  assert.ok(!gives('Total: 3,000', 3210.4))
  assert.ok(names('Chloé spent the most', 'chloe'))
})

/** @param {string} sessionUpdate @param {Record<string, any>} rest @param {number} [step] */
const record = (sessionUpdate, rest, step = 0) => /** @type {any} */ ({ at: '', by: 'jean', step, update: { sessionUpdate, ...rest } })
const brain = (/** @type {number} */ step) => record('tool_call', { toolCallId: `b${step}`, kind: 'think', status: 'completed' }, step)

test("a run's plan: where it came, and whether every step was settled", () => {
  const records = [brain(0), brain(1), brain(2), record('plan', { entries: [{ content: 'a', status: 'in_progress' }, { content: 'b', status: 'pending' }] }, 2),
    brain(3), record('plan', { entries: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'completed' }] }, 3),
    record('tool_call', { toolCallId: 's', kind: 'think', status: 'completed', _meta: { compact: true } }, 4)]
  assert.equal(brainSteps(records), 4)
  assert.deepEqual(planOf(records), { first: 2, plans: 2, entries: 2, settled: true, steps: 4 })
  assert.deepEqual(planOf([brain(0)]), { first: null, plans: 0, entries: 0, settled: false, steps: 1 })
})

test("a summary's language, the sources it gives again, and what Jean adds", () => {
  const records = [record('agent_message_chunk', { content: { type: 'text', text: 'As the file says [1], and the other [2].' } }),
    record('compaction_update', { status: 'completed', summary: [{ type: 'text', text: "L'utilisateur veut un tableau des dépenses [1] pour le semestre et une note." }],
      _meta: { reason: 'window', text: '<summary>…</summary>\n\nNotes in force:\n- Today is 2026-10-16.\n\nThe request being worked on, word for word:\n<request>\nFais le tableau\n</request>' } })]
  assert.deepEqual(summariesOf(records, 'fr'), [{ reason: 'window', language: 'fr', inLanguage: true, cited: 2, kept: 1, request: true, notes: true, chars: 76 }])
})

test('work done again after a stop: the same call with the same arguments', () => {
  const call = (/** @type {string} */ name, /** @type {any} */ args, /** @type {number} */ step) => record('tool_call', { toolCallId: `${name}${step}`, name, kind: 'read', status: 'completed', rawInput: args }, step)
  const records = [call('open', { path: 'a.csv' }, 0), call('open', { path: 'b.csv' }, 1), call('open', { path: 'a.csv' }, 3), call('write', { name: 'x' }, 4)]
  assert.deepEqual(redone(records, 1), { after: 2, again: 1 })
})

/** A brain of the test's own: each request answers the next calls given, or ends. @param {any[]} script */
function scripted(script) {
  let i = 0
  return async function* () {
    const next = script[Math.min(i++, script.length - 1)]
    if (next === 'end') {
      yield { type: 'text', delta: 'Done.' }
      yield { type: 'done', stopReason: 'end', usage: { inputTokens: 900, outputTokens: 5 }, message: { role: 'assistant', content: 'Done.' } }
      return
    }
    const toolCalls = next.map((/** @type {[string, any]} */ [name, args], /** @type {number} */ j) => ({ id: `c${i}-${j}`, name, args }))
    for (const call of toolCalls) yield { type: 'tool_call', call }
    yield { type: 'done', stopReason: 'tool_use', usage: { inputTokens: 900, outputTokens: 5 }, message: { role: 'assistant', content: '', toolCalls } }
  }
}

test("a task runs through Jean's own loop and capabilities in Node, the room standing in", async () => {
  const { mkdtemp } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { runTask, willing, textOf } = await import('./longtasks/jean.js')
  const dir = await mkdtemp(join(tmpdir(), 'longtasks-'))
  const brain = { brain: /** @type {any} */ ({ id: 'scripted', provider: 'custom', api: 'openai', baseURL: 'http://127.0.0.1:9/v1', model: 'scripted' }) }
  const files = [{ name: 'sales.csv', bytes: new TextEncoder().encode('region,sales\nNorth,1200\nSouth,950\n') }]
  const plan = (/** @type {string[]} */ status) => ['plan', { entries: [{ content: 'Read', status: status[0] }, { content: 'Write', status: status[1] }] }]
  // Shared files: a plan the person confirms, a file read and one made, every step settled.
  const shared = await runTask({ ...brain, stream: /** @type {any} */ (scripted([[plan(['in_progress', 'pending'])], [['read', { file: 'sales.csv' }]],
    [['write', { name: 'Report.docx', content: '# Sales\n\nNorth sold 1200.' }]], [plan(['completed', 'completed'])], 'end'])) },
  { lang: 'en', request: 'Write a report of these sales.', files, where: 'files', features: { plan: true, compact: true, keep: 0 }, window: 32000, user: willing }, join(dir, 'a'))
  assert.equal(shared.error, undefined)
  assert.deepEqual(shared.made.map((file) => file.name), ['Report.docx'])
  assert.match(await textOf(shared.made[0]), /North sold 1200/)
  assert.deepEqual(planOf(shared.records), { first: 0, plans: 2, entries: 2, settled: true, steps: 5 })
  assert.ok(shared.records.some(({ update }) => update?.sessionUpdate === 'plan' && update._meta?.confirmed))
  // A folder: stopped after two steps, Keep going pressed, a change asked first and allowed, a steer read between steps.
  const steer = { ...willing, steer: { after: 1, text: 'Add the South too.' } }
  const folder = await runTask({ ...brain, stream: /** @type {any} */ (scripted([[['open', { path: 'sales.csv' }]], [['change', { path: 'Summary.md', old: '', new: '# Summary\nNorth 1200' }]],
    [['open', { path: 'Summary.md' }]], 'end'])) },
  { lang: 'fr', request: 'Résume ce fichier.', files, where: 'folder', steps: 2, features: { plan: false, compact: false, keep: 1 }, window: 0, user: steer }, join(dir, 'b'))
  assert.deepEqual(folder.blocks.map(({ after, stopped }) => ({ after, stopped })), [{ after: -1, stopped: true }, { after: 1, stopped: false }])
  assert.deepEqual(folder.made.map((file) => file.name), ['Summary.md'])
  assert.ok(folder.records.some(({ update }) => update?.sessionUpdate === 'user_message_chunk' && update._meta?.steer))
  assert.deepEqual(redone(folder.records, 1), { after: 1, again: 0 })
})
