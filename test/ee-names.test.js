// People's names in masked requests (D681): reading a classifier's tokens, and what the engine does with what it finds.
// npm run masks measures the real model, on real weights.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fire } from '../app/core/hooks.js'
import { maskHooks } from '../app/ee/mask.js'
import { align, namesIn, OVERLAP, partsOf, windowsOf, WINDOW } from '../app/ee/names.js'
import { coverOf, parse, tally } from './masks/score.js'

test('windows cover every token, overlapping, however many there are', () => {
  assert.deepEqual(windowsOf(10), [[0, 10]])
  assert.deepEqual(windowsOf(WINDOW), [[0, WINDOW]])
  const windows = windowsOf(1000)
  assert.equal(windows[0][0], 0)
  assert.equal(windows.at(-1)?.[1], 1000)
  for (let i = 1; i < windows.length; i++) assert.equal(windows[i][0], windows[i - 1][1] - OVERLAP)
  for (const [start, end] of windows) assert.ok(end - start <= WINDOW)
})

test('tokens find their place in the text, whatever the tokenizer made of it', () => {
  const places = (/** @type {string} */ text, /** @type {string[]} */ tokens) => align(text, tokens).map(([start, end]) => text.slice(start, end))
  assert.deepEqual(places('Marie  Durand vient', ['▁Marie', '▁Dur', 'and', '▁vient']), ['Marie', 'Dur', 'and', 'vient'])
  // A form the tokenizer normalises keeps its own place.
  assert.deepEqual(places('ﬁn Marie', ['▁fin', '▁Marie']), ['ﬁn', 'Marie'])
  assert.deepEqual(places('４２ Marie', ['▁42', '▁Marie']), ['４２', 'Marie'])
  // A character given as its bytes, and one it doesn't know.
  assert.deepEqual(places('a 😀 Marie', ['▁a', '▁', '<0xF0>', '<0x9F>', '<0x98>', '<0x80>', '▁Marie']).at(-1), 'Marie')
  assert.deepEqual(places('a § Marie', ['▁a', '<unk>', '▁Marie']), ['a', '§ ', 'Marie'])
  // A dash a normaliser changed: what follows still lands right.
  assert.deepEqual(places('a — Marie', ['▁a', '▁-', '▁Marie']).at(-1), 'Marie')
})

test('what is flagged hides its whole word, words next to each other are one name, and a stray mark is no part of it', () => {
  const found = (/** @type {string} */ text, /** @type {[number, number, number][]} */ flagged, /** @type {number} */ threshold) => namesIn(text, flagged, threshold).map(({ start, end }) => text.slice(start, end))
  const text = 'Pour Marie-Claire Durand, et Paul.'
  assert.deepEqual(found(text, [[5, 10, 0.9], [18, 21, 0.9]], 0.5), ['Marie-Claire Durand'])
  assert.deepEqual(found(text, [[29, 33, 0.9]], 0.5), ['Paul'])
  assert.deepEqual(found(text, [[29, 33, 0.3]], 0.5), [])
  assert.deepEqual(found(text, [[29, 34, 0.9]], 0.5), ['Paul'])
  assert.deepEqual(found('', [], 0.5), [])
  assert.deepEqual(found("J'ai vu O'Brien hier", [[8, 9, 0.9]], 0.5), ["O'Brien"])
})

test('a word with no capital is a name only where the model is sure', () => {
  const text = 'a file you can save for marie'
  const save = text.indexOf('save')
  const marie = text.indexOf('marie')
  const found = (/** @type {[number, number, number][]} */ flagged) => namesIn(text, flagged, 0.005, 0.5).map(({ start, end }) => text.slice(start, end))
  assert.deepEqual(found([[save, save + 4, 0.01]]), [])
  assert.deepEqual(found([[marie, marie + 5, 0.9]]), ['marie'])
  assert.deepEqual(namesIn('Pour Marie', [[5, 10, 0.01]], 0.005, 0.5).length, 1)
})

test('the words of a name are looked for on their own, never a title or a particle', () => {
  assert.deepEqual(partsOf('Marie Durand'), ['Marie', 'Durand'])
  assert.deepEqual(partsOf('Mme Marie de Fontenay'), ['Marie', 'Fontenay'])
  assert.deepEqual(partsOf('Frau Dr. Keller'), ['Keller'])
  assert.deepEqual(partsOf('Durand'), [])
  assert.deepEqual(partsOf('J. Durand'), ['Durand'])
  assert.deepEqual(partsOf('van der Berg'), ['Berg'])
})

/** The engine, with names found by a pattern, as a reading would be. @param {RegExp} shape @param {any} [more] */
function room(shape, more = {}) {
  const told = /** @type {string[]} */ ([])
  const read = /** @type {string[]} */ ([])
  const records = /** @type {any[]} */ ([])
  const hooks = maskHooks({ mask: { hide: ['person'] } }, {
    isLocal: () => false,
    load: async () => ({ id: '01JTASK', records }),
    keep: async (_, meta) => { records.push({ meta }) },
    assistant: () => 'Jean',
    open: () => false,
    heldReason: () => '',
    why: (values) => values.join(),
    mayGo: () => '',
    reason: () => '',
    names: async (text) => {
      read.push(text)
      return [...text.matchAll(shape)].map((match) => ({ start: match.index, end: match.index + match[0].length, kind: 'person' }))
    },
    // eslint-disable-next-line require-yield
    async* refused(why, _, script) { told.push(script ? 'script' : why); throw new Error(why) },
    ...more,
  })
  return { hooks, told, read, records }
}
/** @param {any} hooks @param {any} e */
async function wire(hooks, e) {
  let going
  for await (const _ of await fire(hooks, 'turn.step', { task: 't', brain: { id: 'b', model: 'm' }, system: '', messages: [], ...e }, async function* (/** @type {any} */ wired) { going = wired })); // eslint-disable-line no-unused-vars
  return /** @type {any} */ (going)
}
const user = (/** @type {string} */ content) => ({ role: 'user', content })
const MARK = /⟦P[0-9a-f]{6,}⟧/

test('a name found once is hidden wherever it stands, and each word of it, as P', async () => {
  const { hooks } = room(/Marie Durand/g)
  const { messages } = await wire(hooks, { messages: [user('Marie Durand signe.'), user('Madame Durand et Marie viennent.'), user('Le durand de MARIE')] })
  assert.match(messages[0].content, /^⟦P[0-9a-f]+⟧ signe\.$/)
  assert.match(messages[1].content, /^Madame ⟦P[0-9a-f]+⟧ et ⟦P[0-9a-f]+⟧ viennent\.$/)
  assert.ok(!JSON.stringify(messages).includes('Durand'))
  // A word that isn't a name's whole form doesn't drag ordinary words with it.
  const { hooks: titled } = room(/Mme Marie de Fontenay/g)
  const { messages: other } = await wire(titled, { messages: [user('Mme Marie de Fontenay'), user('Mme la directrice de Paris')] })
  assert.equal(other[1].content, 'Mme la directrice de Paris')
})

test('short forms come back after a reload, from the note alone', async () => {
  const { hooks, records } = room(/Marie Durand/g)
  await wire(hooks, { messages: [user('Marie Durand')] })
  const again = room(/nobody/g)
  again.records.push(...records)
  const { messages } = await wire(again.hooks, { messages: [user('Madame Durand')] })
  assert.match(messages[0].content, /^Madame ⟦P/)
})

test('of a system prompt, only what is the person’s is read: never Jean’s tools, rules or date', async () => {
  const { hooks, read } = room(/save|Marie|Rules/g)
  const system = 'You are Jean.\n\n<tools>\n- save_name: Save the name\n</tools>\n\n<rules>\n- Rules here\n</rules>\n\n<memory>\n- Works with Marie\n</memory>\n\n<context>\nToday is Marie.\n</context>'
  const { system: going } = await wire(hooks, { system, messages: [] })
  assert.ok(going.includes('- save_name: Save the name'))
  assert.ok(going.includes('- Rules here'))
  assert.match(going, /- Works with ⟦P/)
  // Where a place holds what was found elsewhere, it is hidden all the same.
  assert.ok(!going.includes('Marie'))
  assert.equal(read[0].length, system.length)
  assert.ok(!read[0].includes('save_name'))
})

test('what a reading took for a name doesn’t stop a tool called the same', async () => {
  const { hooks, told } = room(/save/g)
  const { messages } = await wire(hooks, { messages: [user('Please save this')], tools: [{ name: 'save_workspace', description: 'Saves', parameters: {} }] })
  assert.match(messages[0].content, /^Please ⟦P/)
  assert.deepEqual(told, [])
})

test('a tool’s schema isn’t read for names, and the assistant’s name stays, its possessive too', async () => {
  const { hooks, read } = room(/Jean|Marie/g)
  const { system, tools } = await wire(hooks, { system: 'You are Jean. Jean\'s rules.', messages: [user('Marie')], tools: [{ name: 'a', description: 'Tool for Marie', parameters: {} }] })
  assert.ok(system.startsWith("You are Jean. Jean's rules."))
  assert.ok(read.includes('Marie'))
  assert.ok(!read.includes('Tool for Marie'))
  assert.ok(tools[0].description.includes('⟦P'))
})

test('text in a script the model wasn’t measured on is refused, one letter of it is enough', async () => {
  for (const text of ['Contrat de مريم الحسن', '田中さんへ', '김민수', 'Иван Петров', 'Για τον Γιάννη', 'राहुल', 'אבי']) {
    const { hooks, told, read } = room(/nobody/g)
    await assert.rejects(wire(hooks, { messages: [user(text)] }), /script/)
    assert.deepEqual(told, ['script'], text)
    assert.deepEqual(read, [], text)
  }
  // What policy lists is hidden before that's asked; Latin with accents, signs and a Greek letter alone are fine.
  const { hooks } = room(/nobody/g, { more: () => ['田中商事'] })
  assert.match((await wire(hooks, { messages: [user('Pour 田中商事')] })).messages[0].content, /^Pour ⟦W/)
  for (const text of ['Çà et là, Müller, Núñez, Łukasz, ÿ, ß, øre', '€ £ ¥ § © ° µ π Ω 42 → ✓ 😀', "it's ʼn ª"]) {
    const clean = room(/nobody/g)
    assert.equal((await wire(clean.hooks, { messages: [user(text)] })).messages[0].content, text)
  }
  // Nor is it asked of what no model reads for: patterns and words in any script.
  const words = maskHooks({ mask: { words: ['ACME'] } }, { isLocal: () => false, load: async () => null, keep: async () => {}, assistant: () => 'Jean', open: () => false, heldReason: () => '', why: () => '', mayGo: () => '', reason: () => '', async* refused(why) { throw new Error(why) } }) // eslint-disable-line require-yield
  assert.equal((await wire(words, { task: undefined, messages: [user('田中さんへ')] })).messages[0].content, '田中さんへ')
})

test('a reading that fails sends nothing, and stopping doesn’t wait for it', async () => {
  const { hooks, told } = room(/x/g, { names: async () => { throw new Error('out of memory') } })
  await assert.rejects(wire(hooks, { messages: [user('Marie')] }), /out of memory/)
  assert.deepEqual(told, ['out of memory'])
  const controller = new AbortController()
  const slow = room(/x/g, { names: () => new Promise(() => {}) })
  const going = wire(slow.hooks, { signal: controller.signal, messages: [user('Marie')] })
  setTimeout(() => controller.abort(), 10)
  await assert.rejects(going, /aborted/)
  assert.deepEqual(slow.told, ['aborted'])
})

test('what the measure marks: a name only if all of it is hidden, and ordinary words hidden', () => {
  const [doc] = parse('=== id=x type=email\nPour [[PF:S. Durand]] et [[PS:Paul]], dit [[O:ACME]].\n', 'fr')
  assert.equal(doc.text, 'Pour S. Durand et Paul, dit ACME.')
  assert.deepEqual(doc.spans.map((span) => span.value), ['S. Durand', 'Paul', 'ACME'])
  assert.deepEqual(tally(doc, coverOf(doc.text, 'Pour S. ⟦Pabcdef⟧ et ⟦Pabcdef⟧, dit ACME.')), { names: 2, whole: 1, part: 2, words: 3, over: 0, misses: ['S. Durand'], overs: [] })
  const hidden = tally(doc, coverOf(doc.text, '⟦Pabcdef⟧ ⟦Pabcdef⟧ et ⟦Pabcdef⟧, dit ACME.'))
  assert.equal(hidden.whole, 2)
  assert.deepEqual(hidden.overs, ['Pour'])
  assert.ok(MARK.test('⟦Pabcdef⟧'))
})
