import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fire } from '../app/core/hooks.js'

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
