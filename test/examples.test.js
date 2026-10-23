// The example extensions (examples/extensions/, D296): each one's extension.json reads as Jean reads it, its module
// registers only events and slots an extension may use, within the rights it asks for, and it does what its
// card says, run here as extension-worker.js runs it, with a stand-in for Jean.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { readManifest, EVENTS, SLOTS } from '../app/caps/extensions/manifest.js'

const ROOT = new URL('../examples/extensions/', import.meta.url)

/** An extension registered as the worker registers it, with what it hooks, draws and keeps. @param {string} name @param {Record<string, any>} [stored] */
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
  // A clock an extension starts as it registers (Quiet hours follows the time) would keep the tests running.
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

test('examples: each extension.json reads as Jean reads it, and each module hooks and draws only where extensions may, within its rights', async () => {
  const names = (await readdir(ROOT, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  assert.deepEqual(names.sort(), ['activity-log', 'glance', 'quiet-hours', 'trusted-sites'])
  for (const name of names) {
    const manifest = readManifest(await readFile(new URL(`${name}/extension.json`, ROOT), 'utf8'))
    assert.equal(manifest.name, name)
    const { hooks, slots } = await load(name)
    assert.ok(hooks.every((hook) => EVENTS.includes(hook.on)), name)
    assert.ok(Object.keys(slots).every((slot) => SLOTS.includes(slot)), name)
    if (hooks.length) assert.ok(manifest.rights.includes('watch'), `${name} hooks events without watch`)
    if (Object.keys(slots).length) assert.ok(manifest.rights.includes('draw'), `${name} draws without draw`)
  }
})

test('examples: Activity log follows the records, what went for good, and a rule that refused, and says under an answer what was done for it', async () => {
  const extension = await load('activity-log')
  const call = { sessionUpdate: 'tool_call', toolCallId: 'a', name: 'write', title: 'Write Bakery.html', kind: 'edit', status: 'failed', _meta: { declined: true, by: 'word-count', decision: 'never' } }
  await extension.fire('record', { task: 't', type: 'user_message_chunk', record: { update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Make me a page' } } } })
  await extension.fire('record', { task: 't', type: 'tool_call', record: { update: call } })
  await extension.fire('record', { task: 't', type: 'removed', records: [{}, {}, {}] })
  await extension.fire('record', { task: 'u', type: 'removed', records: [{}, {}], all: true })
  assert.deepEqual(extension.notes, ['Write Bakery.html: refused by word-count.'])
  const rows = JSON.stringify(extension.slots.settings())
  assert.match(rows, /You asked: “Make me a page”/)
  assert.match(rows, /Write Bakery.html: not done, refused by word-count/)
  assert.match(rows, /You went back to a request: 3 records removed/)
  assert.match(rows, /You deleted a task: 2 records removed/)
  await extension.fire('turn.end', { answer: 'I could not make it.', records: [{ update: { sessionUpdate: 'user_message_chunk' } }, { update: { sessionUpdate: 'tool_call', toolCallId: 'brain-0', title: 'Asked a brain', status: 'completed' } }, { update: call }] })
  assert.deepEqual(extension.slots.answer({ text: 'I could not make it.' }), { text: '1 action · 1 not done · decided by word-count', muted: true })
  assert.equal(extension.slots.answer({ text: 'Another answer' }), null)
})

test('examples: Quiet hours makes Jean more careful while quiet, never less, and lets reading through', async () => {
  const extension = await load('quiet-hours', { hours: 'always' })
  assert.deepEqual(await extension.fire('tool.check', { kind: 'edit' }, { decision: 'allow' }), { decision: 'ask' })
  assert.equal((await extension.fire('tool.check', { kind: 'delete' }, { decision: 'ask' })).decision, 'never')
  assert.deepEqual(await extension.fire('tool.check', { kind: 'read' }, { decision: 'allow' }), { decision: 'allow' })
  assert.deepEqual(await extension.fire('tool.check', { kind: 'fetch' }, { decision: 'never' }), { decision: 'never' })
  assert.match(JSON.stringify(extension.slots.above()), /Quiet hours: I'll ask you first/)
  await extension.press('hours:off')
  assert.deepEqual(await extension.fire('tool.check', { kind: 'edit' }, { decision: 'allow' }), { decision: 'allow' })
  assert.equal(extension.slots.above(), null)
})

test('examples: Trusted sites offers to trust a site Jean asks about, then lets only its pages go ahead without asking', async () => {
  const extension = await load('trusted-sites')
  const browse = { kind: 'fetch', args: { url: 'https://en.wikipedia.org/wiki/Bread' } }
  assert.deepEqual(await extension.fire('tool.check', browse, { decision: 'ask' }), { decision: 'ask' })
  assert.match(JSON.stringify(extension.slots.above()), /Open pages from en.wikipedia.org without asking/)
  await extension.press('trust')
  assert.deepEqual(extension.stored.trusted, ['en.wikipedia.org'])
  assert.equal(extension.slots.above(), null)
  assert.deepEqual(await extension.fire('tool.check', browse, { decision: 'ask' }), { decision: 'allow' })
  assert.deepEqual(await extension.fire('tool.check', { kind: 'fetch', args: { url: 'https://example.com/' } }, { decision: 'ask' }), { decision: 'ask' })
  // What the rules refuse stays refused.
  assert.deepEqual(await extension.fire('tool.check', browse, { decision: 'never' }), { decision: 'never' })
  await extension.press('forget:en.wikipedia.org')
  assert.deepEqual(await extension.fire('tool.check', browse, { decision: 'ask' }), { decision: 'ask' })
})

test('examples: At a glance draws under a long answer how long it takes to read, a map of its parts and its links, each said in words too', async () => {
  const extension = await load('glance')
  // Minutes in the language the extension runs in, the browser's.
  const minute = `◷ ${new Intl.NumberFormat(undefined, { style: 'unit', unit: 'minute', unitDisplay: 'short' }).format(1)}`
  const answer = [
    'Here are the two plans side by side, over the next two years, with what each one costs you in all.',
    '',
    '| Plan | Total |',
    '|---|---|',
    '| Orange | €360 |',
    '| SFR | €600 |',
    '',
    '## What to do',
    '',
    'Orange fits you best: it is the cheapest over two years, it has enough data for what you do each month, and you can leave it when you like.',
    '',
    '1. Get your number’s code.',
    '2. Order the SIM.',
    '',
    '```js',
    'const total = 15 * 24',
    '',
    'console.log(total)',
    '```',
    '',
    'Both are explained at https://example.com/orange and https://example.com/sfr, and again at https://example.com/orange.',
  ].join('\n')
  assert.deepEqual(extension.slots.answer({ text: answer }), { row: [
    { text: minute, label: '1 minute to read' },
    // Each paragraph a bar as tall as it is long beside the longest, the heading a space, the code one part, blank line and all;
    // first, the answer's direction, which the signs don't have.
    { text: '\u200E▆▦ █☰⌗▇', label: 'Its parts, under 1 heading: 3 paragraphs, 1 table, 1 list, and 1 piece of code' },
    { text: '↗ 2', label: '2 links' },
  ] })
  // A short answer is taken in at a glance already, unless asked for under every one.
  assert.equal(extension.slots.answer({ text: 'Yes, Orange.' }), null)
  assert.match(JSON.stringify(extension.slots.settings()), /answers of 80 words or more/)
  await extension.press('every')
  assert.equal(extension.stored.every, true)
  assert.deepEqual(extension.slots.answer({ text: 'Yes, Orange.' }), { row: [{ text: minute, label: '1 minute to read' }, { text: '\u200E█', label: 'Its parts: 1 paragraph' }] })
  // An answer read from the right has its map read from the right too.
  assert.equal(extension.slots.answer({ text: '**أورنج** هي الأنسب لك.' }).row[1].text, '\u200F█')
  assert.equal(extension.slots.answer({ text: '' }), null)
})
