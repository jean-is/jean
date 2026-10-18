import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fire, removal } from '../app/core/hooks.js'
import { guardHooks } from '../app/core/rules.js'

/** Jean's own behaviour in these tests: it says what it was given, and counts its runs. */
function jean() {
  const runs = /** @type {any[]} */ ([])
  return { runs, behaviour: (/** @type {any} */ e) => (runs.push(e), { did: e.text }) }
}

test('hooks: with none, Jean does what it does with what it was given', async () => {
  const { runs, behaviour } = jean()
  assert.deepEqual(await fire([], 'message.send', { text: 'hi' }, behaviour), { did: 'hi' })
  assert.deepEqual(runs, [{ text: 'hi' }])
})

test('hooks: a hook watches, changes or answers', async () => {
  const seen = /** @type {any[]} */ ([])
  const watch = { on: 'message.send', run: async (/** @type {any} */ e, /** @type {any} */ next) => { const result = await next(); seen.push([e.text, result.did]); return result } }
  let { runs, behaviour } = jean()
  assert.deepEqual(await fire([watch], 'message.send', { text: 'hi' }, behaviour), { did: 'hi' })
  assert.deepEqual(seen, [['hi', 'hi']])
  assert.equal(runs.length, 1)

  const change = { on: 'message.send', run: (/** @type {any} */ e, /** @type {any} */ next) => next({ ...e, text: e.text.trim() }) }
  ;({ runs, behaviour } = jean())
  assert.deepEqual(await fire([change], 'message.send', { text: '  hi ' }, behaviour), { did: 'hi' })

  const answer = { on: 'message.send', run: () => ({ refuse: 'Not now.' }) }
  ;({ runs, behaviour } = jean())
  assert.deepEqual(await fire([answer, change], 'message.send', { text: 'hi' }, behaviour), { refuse: 'Not now.' })
  assert.equal(runs.length, 0, "an answer is Jean's place taken: nothing after it runs")
})

test('hooks: an answer of its own, not the one the chain gave it, says whose it is (D299)', async () => {
  const strict = { on: 'tool.check', by: 'strict', tier: /** @type {const} */ ('user'), run: () => ({ decision: 'never', reason: 'Not here.' }) }
  const passes = { on: 'tool.check', by: 'passes', tier: /** @type {const} */ ('policy'), run: (/** @type {any} */ e, /** @type {any} */ next) => next(e) }
  assert.deepEqual(await fire([passes, strict], 'tool.check', {}, () => ({ decision: 'allow' })), { decision: 'never', reason: 'Not here.', by: 'strict' })
  assert.deepEqual(await fire([passes], 'tool.check', {}, () => ({ decision: 'allow' })), { decision: 'allow' }, "Jean's own is no hook's")
  const changes = { ...passes, by: 'changes', run: async (/** @type {any} */ e, /** @type {any} */ next) => ({ ...(await next(e)), decision: 'ask' }) }
  assert.deepEqual(await fire([changes, strict], 'tool.check', {}, () => ({ decision: 'allow' })), { decision: 'ask', reason: 'Not here.', by: 'changes' })
  const rescues = { ...passes, by: 'rescues', run: (/** @type {any} */ e, /** @type {any} */ next) => next(e).catch(() => ({ decision: 'ask' })) }
  assert.deepEqual(await fire([rescues], 'tool.check', {}, () => { throw new Error('offline') }), { decision: 'ask', by: 'rescues' })
})

test('hooks: only those on the event whose match it has, outermost tier first, then in the order given', async () => {
  const order = /** @type {string[]} */ ([])
  /** @param {string} name @param {any} [more] */
  const hook = (name, more = {}) => ({ on: 'tool.check', by: name, ...more, run: (/** @type {any} */ e, /** @type {any} */ next) => (order.push(name), next(e)) })
  const hooks = [
    hook('jean'), hook('user one', { tier: 'user' }), hook('policy', { tier: 'policy' }), hook('user two', { tier: 'user' }),
    hook('other event', { on: 'turn.end' }),
    hook('fetch only', { match: { kind: 'fetch' } }),
    hook('one of', { match: { kind: ['read', 'edit'] } }),
    hook('pattern', { match: { name: /^mail_/ } }),
    hook('both', { match: { kind: 'read', name: 'open' } }),
  ]
  await fire(hooks, 'tool.check', { kind: 'read', name: 'mail_search' }, () => 'done')
  assert.deepEqual(order, ['policy', 'user one', 'user two', 'jean', 'one of', 'pattern'])
})

test('hooks: one that fails before going on is passed over, or refuses when it is a guard; after, what came back stands', async () => {
  const warn = console.warn
  const warned = /** @type {any[]} */ ([])
  console.warn = (...args) => warned.push(args)
  try {
    const broken = { on: 'tool.check', by: 'broken', run: () => { throw new Error('boom') } }
    let { runs, behaviour } = jean()
    assert.deepEqual(await fire([broken], 'tool.check', { text: 'a' }, behaviour), { did: 'a' })
    assert.equal(warned.length, 1)

    const guard = { ...broken, refuse: 'It could not be checked.' }
    ;({ runs, behaviour } = jean())
    assert.deepEqual(await fire([guard], 'tool.check', { text: 'a' }, behaviour), { refuse: 'It could not be checked.' })
    assert.equal(runs.length, 0)

    const late = { on: 'tool.check', run: async (/** @type {any} */ e, /** @type {any} */ next) => { await next(e); throw new Error('late') } }
    ;({ runs, behaviour } = jean())
    assert.deepEqual(await fire([late], 'tool.check', { text: 'a' }, behaviour), { did: 'a' })
    assert.equal(runs.length, 1, 'Jean did it once')

    // What Jean's own behaviour throws goes through a hook as it is, and isn't the hook's failure.
    warned.length = 0
    const through = { on: 'turn.step', run: (/** @type {any} */ e, /** @type {any} */ next) => next(e) }
    await assert.rejects(fire([through], 'turn.step', {}, () => { throw new Error('offline') }), /offline/)
    assert.equal(warned.length, 0)
  } finally {
    console.warn = warn
  }
})

test('removals: each asked in turn, the first refusal keeps them all; once none refused, done, then told; nothing read with no one listening (D412)', async () => {
  const log = /** @type {string[]} */ ([])
  const read = async (/** @type {string} */ task) => (log.push(`read ${task}`), [{ at: '2026-10-18T10:00:00Z', by: 'user', update: /** @type {any} */ ({}) }])
  const act = async () => { log.push('done') }
  const keeps = { on: 'remove', run: (/** @type {any} */ e, /** @type {any} */ next) => (log.push(`asked ${e.task ?? e.profile}`), e.task === 'b' ? { refuse: 'No copy.' } : next(e)) }
  const watches = { on: 'record', run: (/** @type {any} */ e, /** @type {any} */ next) => (log.push(`told ${e.task ?? e.profile} ${e.type} ${e.records.length}${e.all ? ' all' : ''}`), next(e)) }
  assert.equal(await removal([keeps, watches], [{ task: 'a', all: true }, { task: 'b', all: true }, { task: 'c', all: true }], act, read), 'No copy.')
  assert.deepEqual(log.splice(0), ['read a', 'asked a', 'read b', 'asked b'])
  assert.equal(await removal([keeps, watches], [{ task: 'a', all: true }, { task: 'c', records: [] }, { profile: 'p' }], act, read), undefined)
  assert.deepEqual(log.splice(0), ['read a', 'asked a', 'asked c', 'asked p', 'done', 'told a removed 1 all', 'told c removed 0', 'told p removed 0'])
  // What failed to go is told to no one.
  await assert.rejects(removal([watches], [{ task: 'a', all: true }], async () => { throw new Error('locked') }, read), /locked/)
  assert.deepEqual(log.splice(0), ['read a'])
  assert.equal(await removal([], [{ task: 'a', all: true }], act, read), undefined)
  assert.deepEqual(log.splice(0), ['done'])
})

test('guards: a rule for one kind of action or one service only makes Jean more careful, and with a question, only when its answer is yes (D295)', async () => {
  const asked = /** @type {string[]} */ ([])
  const yes = async (/** @type {string} */ question, /** @type {string} */ text) => (asked.push(`${question} | ${text.split('\n')[0]}`), /client/.test(text))
  const guards = [
    { id: 'g1', service: 'mail', if: 'Is it to a client?', then: /** @type {const} */ ('ask') },
    { id: 'g2', kind: 'delete', then: /** @type {const} */ ('never'), reason: 'Nothing is deleted here.' },
    { id: 'g3', then: /** @type {const} */ ('never') },
    { id: 'g4', kind: 'edit', then: /** @type {any} */ ('allow') },
  ]
  const hooks = guardHooks(guards, 'user', yes)
  assert.equal(hooks.length, 2, 'a guard for nothing in particular, or one that would allow more, is no guard')
  const check = (/** @type {any} */ e, /** @type {string} */ ruled) => fire(hooks, 'tool.check', e, () => ({ decision: ruled }))
  assert.deepEqual(await check({ name: 'mail_send', service: 'mail', kind: 'other', title: 'Mail: send to a client', args: {} }, 'allow'), { decision: 'ask', meta: { guard: 'g1' }, by: 'g1' })
  assert.deepEqual(await check({ name: 'mail_send', service: 'mail', kind: 'other', title: 'Mail: send to a friend', args: {} }, 'allow'), { decision: 'allow' })
  assert.deepEqual(await check({ name: 'mail_send', service: 'mail', kind: 'other', title: 'Mail: send to a client', args: {} }, 'never'), { decision: 'never' })
  assert.equal(asked.length, 2, 'already as careful: no question asked')
  assert.deepEqual(await check({ name: 'rm', kind: 'delete', title: 'Delete a.txt', args: {} }, 'allow'), { decision: 'never', reason: 'Nothing is deleted here.', by: 'g2' })
  assert.deepEqual(await check({ name: 'read', kind: 'read', title: 'Read a.txt', args: {} }, 'allow'), { decision: 'allow' })
  // A question that can't be answered counts as yes; the organisation's say so as theirs.
  const unsure = guardHooks([{ id: 'p1', kind: 'fetch', if: 'Is it outside the company?', then: 'never' }], 'policy', async () => { throw new Error('offline') })
  assert.deepEqual(await fire(unsure, 'tool.check', { kind: 'fetch', title: 'Open a page', args: {} }, () => ({ decision: 'allow' })), { decision: 'never', reason: "The organisation's rules refuse this action.", by: 'p1' })
})
