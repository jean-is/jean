// Flows (D218): the engine that runs a flow's steps, and a conversation drawn as one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { order, fill, fillArgs, askOf, items, runFlow, result, layout, fromSteps, kindOf, COLUMN, LINE, MAX_ITEMS } from '../caps/flows/run.js'
import { graphOf, stateOf, lastRun } from '../caps/flows/graph.js'

/** @param {string} id @param {Partial<import('../caps/flows/run.js').Step>} [more] */
const step = (id, more = {}) => ({ id, name: id.toUpperCase(), x: 0, y: 0, text: id, ...more })

test('steps run after those they take from; a loop or a wire to nowhere is refused', () => {
  const flow = { steps: [step('c'), step('a'), step('b')], wires: /** @type {[string, string][]} */ ([['a', 'b'], ['b', 'c']]) }
  assert.deepEqual(order(flow).map((one) => one.id), ['a', 'b', 'c'])
  assert.throws(() => order({ ...flow, wires: [['a', 'b'], ['b', 'a']] }), /circle/)
  assert.throws(() => order({ ...flow, wires: [['a', 'z']] }), /isn’t in the flow/)
  assert.equal(kindOf({ tool: 'write' }), 'tool')
  assert.equal(kindOf({ ask: '' }), 'ask')
  assert.equal(kindOf({ file: 'a.csv' }), 'file')
  assert.equal(kindOf({}), 'text')
})

test('a result goes where its step is named, as a string literal in code; an Ask gets the others after its instructions', () => {
  const inputs = [{ name: 'Invoices', value: 'a,1\nb,"2"' }, { name: 'Rates', value: '5%' }]
  assert.equal(fill('Total {{ invoices }} at {{Rates}}, not {{Other}}', inputs), 'Total a,1\nb,"2" at 5%, not {{Other}}')
  assert.deepEqual(fillArgs({ name: 'T.md', content: '{{Invoices}}', code: 'const rows = csv({{Invoices}})', list: ['{{Rates}}'], n: 2 }, inputs), {
    name: 'T.md', content: 'a,1\nb,"2"', code: 'const rows = csv("a,1\\nb,\\"2\\"")', list: ['5%'], n: 2,
  })
  assert.equal(askOf('Total per client: {{Invoices}}', inputs), 'Total per client: a,1\nb,"2"\n\nRates:\n5%')
})

test('a list is a JSON array’s items, or the lines that hold something', () => {
  assert.deepEqual(items('["a", {"b": 1}, 3]'), ['a', '{"b":1}', '3'])
  assert.deepEqual(items('one\n\n  two  \n'), ['one', 'two'])
  assert.deepEqual(items('[not json'), ['[not json'])
})

test('independent steps run three at a time; each takes its inputs; the last ones give the result', async () => {
  const flow = { steps: [step('a'), step('b'), step('c'), step('d'), step('e')], wires: /** @type {[string, string][]} */ ([['a', 'e'], ['b', 'e'], ['c', 'e'], ['d', 'e']]) }
  let now = 0
  let most = 0
  /** @type {Record<string, any>} */
  const given = {}
  const { result: out, states } = await runFlow(flow, {
    run: async (one, inputs) => {
      most = Math.max(most, ++now)
      await new Promise((resolve) => setTimeout(resolve, 5))
      now--
      given[one.id] = inputs.map((input) => `${input.name}=${input.value}`)
      return `${one.id}!`
    },
  })
  assert.equal(most, 3)
  assert.deepEqual(given.e, ['A=a!', 'B=b!', 'C=c!', 'D=d!'])
  assert.equal(out, 'e!')
  assert.ok([...states.values()].every((state) => state === 'done'))
})

test('a step that gives nothing stops what follows it; a failure skips its own, the others go on, then the run says which failed', async () => {
  const wires = /** @type {[string, string][]} */ ([['a', 'b'], ['b', 'c'], ['x', 'y']])
  const flow = { steps: [step('a'), step('b'), step('c'), step('x'), step('y')], wires }
  /** @type {string[]} */
  const seen = []
  const { result: out, states } = await runFlow(flow, { run: async (one) => (one.id === 'b' ? '  ' : `${one.id}!`), onState: (id, state) => seen.push(`${id}:${state}`) })
  assert.equal(states.get('b'), 'empty')
  assert.equal(states.get('c'), 'skipped')
  assert.equal(out, 'y!')
  assert.ok(seen.indexOf('a:running') < seen.indexOf('a:done'))
  /** @type {Map<string, string>} */
  const after = new Map()
  await assert.rejects(runFlow(flow, { run: async (one) => { if (one.id === 'a') throw new Error('no file'); return `${one.id}!` }, onState: (id, state) => after.set(id, state) }), /The step "A" failed: no file/)
  assert.deepEqual(Object.fromEntries(after), { a: 'failed', b: 'skipped', c: 'skipped', x: 'done', y: 'done' })
})

test('once per item, a step runs for each item of its first input and gives the results as a JSON array', async () => {
  const flow = { steps: [step('list'), step('rate'), step('each', { each: true })], wires: /** @type {[string, string][]} */ ([['list', 'each'], ['rate', 'each']]) }
  const { results } = await runFlow(flow, {
    run: async (one, inputs, item) => (one.id === 'list' ? '["x", "y", "skip"]' : one.id === 'rate' ? '2' : inputs[0].value === 'skip' ? '' : `${item}:${inputs[0].value}*${inputs[1].value}`),
  })
  assert.deepEqual(JSON.parse(results.get('each') ?? ''), ['0:x*2', '1:y*2'])
  const long = { steps: [step('list'), step('each', { each: true })], wires: /** @type {[string, string][]} */ ([['list', 'each']]) }
  await assert.rejects(runFlow(long, { run: async (one) => (one.id === 'list' ? Array.from({ length: MAX_ITEMS + 1 }, (_, i) => i).join('\n') : 'ok') }), /51 items/)
})

test('a stopped run starts nothing more', async () => {
  const controller = new AbortController()
  const flow = { steps: [step('a'), step('b')], wires: /** @type {[string, string][]} */ ([['a', 'b']]) }
  const { states } = await runFlow(flow, { signal: controller.signal, run: async () => { controller.abort(); return 'ok' } })
  assert.equal(states.get('b'), 'skipped')
  assert.equal(result(flow, new Map([['b', 'x']]), new Map([['b', 'done']])), 'x')
  assert.equal(result(flow, new Map([['b', 'x']]), new Map([['b', 'done']]), (one) => one.id !== 'b'), '')
})

test('steps are laid out by depth, a column each, a line each within it', () => {
  const placed = layout([step('a'), step('b'), step('c'), step('d')], [['a', 'c'], ['b', 'c'], ['c', 'd']])
  assert.deepEqual(placed.map(({ id, x, y }) => [id, x, y]), [['a', 0, 0], ['b', 0, LINE], ['c', COLUMN, 0], ['d', 2 * COLUMN, 0]])
})

test('steps written by name: each takes the one before unless after says, and what its {{Name}}s name; mistakes are told', () => {
  const made = fromSteps([
    { name: 'Invoices', file: 'Invoices.xlsx' },
    { name: 'Rates', text: '5%', after: [] },
    { name: 'Totals', ask: 'Total per client at {{Rates}}' },
    { name: 'Save', tool: 'write', args: { name: 'Totals.md', content: '{{Totals}}' } },
  ])
  assert.deepEqual(made.steps.map((one) => [one.id, one.name]), [['s1', 'Invoices'], ['s2', 'Rates'], ['s3', 'Totals'], ['s4', 'Save']])
  assert.deepEqual(made.wires, [['s2', 's3'], ['s3', 's4']])
  assert.throws(() => fromSteps([{ name: 'A', text: 'x' }, { name: 'a', text: 'y' }]), /Two steps are called "a"/)
  assert.throws(() => fromSteps([{ name: 'A' }]), /one of text, file, ask or tool/)
  assert.throws(() => fromSteps([{ name: 'A', text: 'x', after: ['B'] }]), /isn't a step/)
  assert.throws(() => fromSteps([{ name: 'A', text: '{{B}}', after: [] }, { name: 'B', text: '{{A}}', after: [] }]), /circle/)
})

test('a flow written again keeps its steps’ ids, and their places while the same steps come back', () => {
  const first = fromSteps([{ name: 'One', text: 'a' }, { name: 'Two', ask: 'b' }])
  const moved = { ...first, steps: first.steps.map((one) => ({ ...one, x: one.x + 400 })) }
  const again = fromSteps([{ name: 'One', text: 'changed' }, { name: 'two', ask: 'b' }], moved)
  assert.deepEqual(again.steps.map(({ id, x }) => [id, x]), [['s1', 400], ['s2', COLUMN + 400]])
  const grown = fromSteps([{ name: 'One', text: 'a' }, { name: 'Two', ask: 'b' }, { name: 'Three', ask: 'c' }], moved)
  assert.deepEqual(grown.steps.map(({ id, x }) => [id, x]), [['s1', 0], ['s2', COLUMN], ['s3', 2 * COLUMN]])
})

// ─── A task as a flow ────────────────────────────────────────────────────────

/** @param {string} id @param {Record<string, any>} [more] @returns {any} */
const call = (id, more = {}) => ({ toolCallId: id, name: 'read', title: `Read ${id}`, kind: 'read', status: 'completed', rawOutput: 'ok', ...more })
/** @param {string} id @param {Record<string, any>} [more] @returns {any} */
const brainOf = (id, more = {}) => ({ toolCallId: id, title: 'Claude', kind: 'think', status: 'completed', ...more })
/** @param {string} text @param {any[][]} steps @returns {any} */
const turnOf = (text, steps) => ({ user: { text, files: [], at: '', upTo: 0 }, notes: [], at: '', steps: steps.map((tools, index) => ({ index, text: '', thought: '', tools })) })

test('what became of a call: done, failed or declined, running or cut short, asking or queued', () => {
  const live = new Set(['r', 'q'])
  assert.equal(stateOf(call('a')), 'done')
  assert.equal(stateOf(call('a', { status: 'failed' })), 'failed')
  assert.equal(stateOf(call('a', { status: 'failed', _meta: { declined: true } })), 'declined')
  assert.equal(stateOf(call('r', { status: 'in_progress' }), { live }), 'running')
  assert.equal(stateOf(call('c', { status: 'in_progress' }), { live }), 'cut')
  assert.equal(stateOf(call('w', { status: 'pending', _meta: { waiting: true } })), 'asking')
  assert.equal(stateOf(call('q', { status: 'pending' }), { live, asking: new Set(['q']) }), 'asking')
  assert.equal(stateOf(call('q', { status: 'pending' }), { live }), 'queued')
})

test('a task drawn as a flow: each request on its line, the brain’s steps along it, a step’s calls one under another, then the answer', () => {
  const first = turnOf('Total the invoices\nplease', [[brainOf('b0'), call('c1'), call('c2', { status: 'failed', _meta: { declined: true } })], [brainOf('b1')]])
  first.steps[1].text = 'Done: 120.\n<suggestions>'
  const second = turnOf('And mail it', [[brainOf('b2'), call('m1', { name: 'mail_send', status: 'in_progress' })]])
  const { steps, wires, states } = graphOf([first, second])
  assert.deepEqual(steps.map(({ id, kind, x, y }) => [id, kind, x, y]), [
    ['request-0', 'request', 0, 0], ['b0', 'brain', COLUMN, 0], ['c1', 'call', 2 * COLUMN, 0], ['c2', 'call', 2 * COLUMN, LINE], ['b1', 'answer', 3 * COLUMN, 0],
    ['request-1', 'request', 0, 2 * LINE], ['b2', 'brain', COLUMN, 2 * LINE], ['m1', 'call', 2 * COLUMN, 2 * LINE],
  ])
  assert.equal(steps[0].name, 'Total the invoices')
  assert.equal(steps[4].detail, 'Done: 120.')
  assert.deepEqual(wires, [['request-0', 'b0'], ['b0', 'c1'], ['b0', 'c2'], ['c1', 'b1'], ['c2', 'b1'], ['b1', 'request-1'], ['request-1', 'b2'], ['b2', 'm1']])
  assert.equal(states.get('c2'), 'declined')
  assert.equal(states.get('m1'), 'cut', 'running when the page closed')
  // While the answer is written, the same call runs.
  const live = graphOf([turnOf('And mail it', [])], { steps: [{ index: 0, text: '', thought: '', tools: [brainOf('b2', { status: 'in_progress' }), call('m1', { status: 'in_progress' })] }] })
  assert.deepEqual([...live.states], [['request-0', 'done'], ['b2', 'running'], ['m1', 'running']])
})

test('what ran inside a call comes after it; a run of a saved flow is laid out as the flow is, with what became of each step', () => {
  const script = turnOf('Work it out', [[brainOf('b0'), call('j', { name: 'javascript' }), call('j.1', { _meta: { parent: 'j' } }), call('j.2', { _meta: { parent: 'j' } })]])
  const drawn = graphOf([script])
  assert.deepEqual(drawn.steps.filter((one) => one.id.startsWith('j')).map(({ id, x, y }) => [id, x, y]), [['j', 2 * COLUMN, 0], ['j.1', 3 * COLUMN, 0], ['j.2', 3 * COLUMN, LINE]])
  assert.deepEqual(drawn.wires.filter(([from]) => from === 'j'), [['j', 'j.1'], ['j', 'j.2']])

  const flow = /** @type {any} */ ({ id: 'F1', name: 'Weekly invoices', steps: [step('a', { x: 100, y: 50 }), step('b', { ask: 'Sum', x: 340, y: 50 }), step('c', { tool: 'write', x: 580, y: 50 })], wires: [['a', 'b'], ['b', 'c']] })
  const ran = turnOf('Weekly invoices', [[
    call('r', { name: 'run_flow', rawInput: { flow: 'F1' }, status: 'failed' }),
    call('r.1', { name: 'flow_step', rawInput: { step: 'a' }, rawOutput: 'rows', _meta: { parent: 'r' } }),
    call('r.2', { name: 'flow_step', rawInput: { step: 'b' }, rawOutput: ' ', _meta: { parent: 'r' } }),
  ]])
  const run = graphOf([ran], null, { flows: [flow] })
  assert.deepEqual(run.steps.map(({ id, kind, x, y }) => [id, kind, x, y]), [
    ['request-0', 'request', 0, 0], ['r', 'call', COLUMN, 0], ['r:a', 'text', 2 * COLUMN, 0], ['r:b', 'ask', 2 * COLUMN + 240, 0], ['r:c', 'tool', 2 * COLUMN + 480, 0],
  ])
  assert.deepEqual(run.wires.slice(1), [['r', 'r:a'], ['r:a', 'r:b'], ['r:b', 'r:c']])
  assert.deepEqual([...run.states].slice(2), [['r:a', 'done'], ['r:b', 'empty'], ['r:c', 'skipped']])
  // The flow's own canvas shows its last run the same way.
  assert.deepEqual([...(lastRun(flow, [ran])?.states ?? [])], [['a', 'done'], ['b', 'empty'], ['c', 'skipped']])
  assert.equal(lastRun({ ...flow, id: 'F2', name: 'Other' }, [ran]), null)
})
