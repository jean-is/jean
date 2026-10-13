// The example plugins (examples/plugins/, D296): each one's plugin.json reads as Jean reads it, its module
// registers only events and slots a plugin may use, within the rights it asks for, and it does what its
// card says, run here as plugin-worker.js runs it, with a stand-in for Jean.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { readManifest, EVENTS, SLOTS } from '../app/caps/plugins/manifest.js'

const ROOT = new URL('../examples/plugins/', import.meta.url)

/** A plugin registered as the worker registers it, with what it hooks, draws and keeps. @param {string} name @param {Record<string, any>} [stored] */
async function load(name, stored = {}) {
  /** @type {{ on: string, match?: Record<string, unknown>, run: Function }[]} */
  const hooks = []
  /** @type {Record<string, Function>} */
  const slots = {}
  /** @type {string[]} */
  const notes = []
  let pressed = (/** @type {string} */ _action) => {}
  const $ = {
    slot: (/** @type {string} */ slot, /** @type {Function} */ draw) => { slots[slot] = draw },
    press: (/** @type {any} */ handler) => { pressed = handler },
    redraw: () => {},
    notify: (/** @type {string} */ text) => notes.push(text),
    store: { get: async (/** @type {string} */ key) => stored[key] ?? null, set: async (/** @type {string} */ key, /** @type {any} */ value) => { stored[key] = value } },
  }
  const { register } = await import(new URL(`${name}/main.js`, ROOT).href)
  // A clock a plugin starts as it registers (Quiet hours follows the time) would keep the tests running.
  const interval = globalThis.setInterval
  globalThis.setInterval = /** @type {any} */ (() => 0)
  try {
    await register((/** @type {string} */ on, /** @type {any} */ match, /** @type {any} */ run) => { hooks.push(typeof match === 'function' ? { on, run: match } : { on, match, run }) }, $)
  } finally {
    globalThis.setInterval = interval
  }
  /** Fires an event through its hooks, Jean's behaviour answering last. @param {string} event @param {any} e @param {any} [behaviour] */
  const fire = async (event, e, behaviour) => {
    const chain = hooks.filter((hook) => hook.on === event && Object.entries(hook.match ?? {}).every(([key, want]) => e[key] === want))
    const step = async (/** @type {number} */ i, /** @type {any} */ given) => (chain[i] ? chain[i].run(given, (/** @type {any} */ next = given) => step(i + 1, next)) : behaviour)
    return step(0, e)
  }
  return { hooks, slots, notes, stored, fire, press: (/** @type {string} */ action) => pressed(action) }
}

test('examples: each plugin.json reads as Jean reads it, and each module hooks and draws only where plugins may, within its rights', async () => {
  const names = (await readdir(ROOT, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  assert.deepEqual(names.sort(), ['activity-log', 'quiet-hours', 'trusted-sites'])
  for (const name of names) {
    const manifest = readManifest(await readFile(new URL(`${name}/plugin.json`, ROOT), 'utf8'))
    assert.equal(manifest.name, name)
    const { hooks, slots } = await load(name)
    assert.ok(hooks.every((hook) => EVENTS.includes(hook.on)), name)
    assert.ok(Object.keys(slots).every((slot) => SLOTS.includes(slot)), name)
    if (hooks.length) assert.ok(manifest.rights.includes('watch'), `${name} hooks events without watch`)
    if (Object.keys(slots).length) assert.ok(manifest.rights.includes('draw'), `${name} draws without draw`)
  }
})

test('examples: Activity log follows the records, what going back removes, and a rule that refused, and says under an answer what was done for it', async () => {
  const plugin = await load('activity-log')
  const call = { sessionUpdate: 'tool_call', toolCallId: 'a', name: 'write', title: 'Write Bakery.html', kind: 'edit', status: 'failed', _meta: { declined: true, by: 'word-count', decision: 'never' } }
  await plugin.fire('record', { task: 't', type: 'user_message_chunk', record: { update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Make me a page' } } } })
  await plugin.fire('record', { task: 't', type: 'tool_call', record: { update: call } })
  await plugin.fire('record', { task: 't', type: 'removed', records: [{}, {}, {}] })
  assert.deepEqual(plugin.notes, ['Write Bakery.html: refused by word-count.'])
  const rows = JSON.stringify(plugin.slots.settings())
  assert.match(rows, /You asked: “Make me a page”/)
  assert.match(rows, /Write Bakery.html: not done, refused by word-count/)
  assert.match(rows, /You went back to a request: 3 records removed/)
  await plugin.fire('turn.end', { answer: 'I could not make it.', records: [{ update: { sessionUpdate: 'user_message_chunk' } }, { update: { sessionUpdate: 'tool_call', toolCallId: 'brain-0', title: 'Asked a brain', status: 'completed' } }, { update: call }] })
  assert.deepEqual(plugin.slots.answer({ text: 'I could not make it.' }), { text: '1 action · 1 not done · decided by word-count', muted: true })
  assert.equal(plugin.slots.answer({ text: 'Another answer' }), null)
})

test('examples: Quiet hours makes Jean more careful while quiet, never less, and lets reading through', async () => {
  const plugin = await load('quiet-hours', { hours: 'always' })
  assert.deepEqual(await plugin.fire('tool.check', { kind: 'edit' }, { decision: 'allow' }), { decision: 'ask' })
  assert.equal((await plugin.fire('tool.check', { kind: 'delete' }, { decision: 'ask' })).decision, 'never')
  assert.deepEqual(await plugin.fire('tool.check', { kind: 'read' }, { decision: 'allow' }), { decision: 'allow' })
  assert.deepEqual(await plugin.fire('tool.check', { kind: 'fetch' }, { decision: 'never' }), { decision: 'never' })
  assert.match(JSON.stringify(plugin.slots.above()), /Quiet hours: I'll ask you first/)
  await plugin.press('hours:off')
  assert.deepEqual(await plugin.fire('tool.check', { kind: 'edit' }, { decision: 'allow' }), { decision: 'allow' })
  assert.equal(plugin.slots.above(), null)
})

test('examples: Trusted sites offers to trust a site Jean asks about, then lets only its pages go ahead without asking', async () => {
  const plugin = await load('trusted-sites')
  const browse = { kind: 'fetch', args: { url: 'https://en.wikipedia.org/wiki/Bread' } }
  assert.deepEqual(await plugin.fire('tool.check', browse, { decision: 'ask' }), { decision: 'ask' })
  assert.match(JSON.stringify(plugin.slots.above()), /Open pages from en.wikipedia.org without asking/)
  await plugin.press('trust')
  assert.deepEqual(plugin.stored.trusted, ['en.wikipedia.org'])
  assert.equal(plugin.slots.above(), null)
  assert.deepEqual(await plugin.fire('tool.check', browse, { decision: 'ask' }), { decision: 'allow' })
  assert.deepEqual(await plugin.fire('tool.check', { kind: 'fetch', args: { url: 'https://example.com/' } }, { decision: 'ask' }), { decision: 'ask' })
  // What the rules refuse stays refused.
  assert.deepEqual(await plugin.fire('tool.check', browse, { decision: 'never' }), { decision: 'never' })
  await plugin.press('forget:en.wikipedia.org')
  assert.deepEqual(await plugin.fire('tool.check', browse, { decision: 'ask' }), { decision: 'ask' })
})
