// SPDX-License-Identifier: MIT
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
  // A decomposed letter is the one it tokenizes as, and what the normaliser drops strands nothing after it.
  assert.deepEqual(places('Bjo\u0308rn O\u0308zgu\u0308r', ['▁Björn', '▁Özgür']), ['Bjo\u0308rn', 'O\u0308zgu\u0308r'])
  assert.deepEqual(places(`${'\ufffd'.repeat(300)} Marie Durand`, ['▁Marie', '▁Durand']), ['Marie', 'Durand'])
  assert.deepEqual(places('a\u200b\ufeff b\f c', ['▁a', '▁b', '▁c']), ['a', 'b', 'c'])
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
  // A capital after an apostrophe counts, and what's attached stays out of the name.
  assert.deepEqual(namesIn('Pour d’Émile', [[5, 12, 0.25]], 0.005, 0.5).map(({ start, end }) => 'Pour d’Émile'.slice(start, end)), ['Émile'])
  assert.deepEqual(namesIn('la dell’Acqua', [[3, 13, 0.06]], 0.005, 0.5).map(({ start, end }) => 'la dell’Acqua'.slice(start, end)), ['Acqua'])
  assert.deepEqual(namesIn('Durand’s file', [[0, 8, 0.9]], 0.005, 0.5).map(({ start, end }) => 'Durand’s file'.slice(start, end)), ['Durand'])
  // Letters past the basic plane are letters.
  const math = '𝐌𝐚𝐫𝐢𝐞 𝐃𝐮𝐫𝐚𝐧𝐝 vient'
  assert.deepEqual(namesIn(math, [[0, 10, 0.99], [11, 23, 0.99]], 0.005, 0.5).map(({ start, end }) => math.slice(start, end)), ['𝐌𝐚𝐫𝐢𝐞 𝐃𝐮𝐫𝐚𝐧𝐝'])
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
  assert.deepEqual(partsOf('Marie Le Goff'), ['Marie', 'Goff'])
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
  const system = 'You are Jean.\n\n<tools>\n- save_name: Save the name\n</tools>\n\n<rules>\n- Rules here\n</rules>\n\n<language>\nReply.\n</language>\n\n<memory>\n- Works with Marie\n</memory>\n\n<context>\nToday is 2026-11-01.\n</context>'
  const { system: going } = await wire(hooks, { system, messages: [user('Marie vient. Rules. Please save.')] })
  assert.ok(going.includes('- save_name: Save the name'))
  assert.ok(going.includes('- Rules here'))
  assert.match(going, /- Works with ⟦P/)
  assert.ok(going.includes('Today is 2026-11-01.'))
  assert.equal(read.find((text) => text.includes('Works with'))?.length, system.length)
  assert.ok(!read.find((text) => text.includes('Works with'))?.includes('save_name'))
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
  assert.equal(tools[0].description, 'Tool for Marie')
})

test('a text mostly in a script the model wasn’t measured on isn’t read or sent, and a run of one is hidden whole', async () => {
  for (const text of ['مريم الحسن', '田中さんへ', '김민수', 'Иван Петров', 'Για τον Γιάννη', 'राहुल', 'אבי', '%D0%98%D0%B2%D0%B0%D0%BD', '&#1048;&#1074;&#1072;&#1085;']) {
    const { hooks, told, read } = room(/nobody/g)
    await assert.rejects(wire(hooks, { messages: [user(text)] }), /script/, text)
    assert.deepEqual(told, ['script'], text)
    assert.deepEqual(read, [], text)
  }
  // A word of one in a text of Latin: a mark, and nothing refused for the rest of the task.
  for (const [text, shape] of /** @type {[string, RegExp][]} */ ([['Le contrat de مريم الحسن est signé par ses avocats.', /^Le contrat de ⟦S[0-9a-f]+⟧ est signé par ses avocats\.$/], ['Deutsch Español 日本語 Русский', /^Deutsch Español ⟦S[0-9a-f]+⟧$/], ['The ΔΔCt was low', /^The ⟦S[0-9a-f]+⟧Ct was low$/]])) {
    const { hooks, told } = room(/nobody/g)
    assert.match((await wire(hooks, { messages: [user(text)] })).messages[0].content, shape)
    assert.deepEqual(told, [])
  }
  // What policy lists is hidden before that's asked; Latin with accents, signs and a Greek letter alone are fine.
  const { hooks } = room(/nobody/g, { more: () => ['田中商事'] })
  assert.match((await wire(hooks, { messages: [user('田中商事')] })).messages[0].content, /^⟦W/)
  for (const text of ['Çà et là, Müller, Núñez, Łukasz, ÿ, ß, øre', '€ £ ¥ § © ° µ π Ω 42 → ✓ 😀', "it's ʼn ª"]) {
    const clean = room(/nobody/g)
    assert.equal((await wire(clean.hooks, { messages: [user(text)] })).messages[0].content, text)
  }
  // Nor is it asked of what no model reads for: patterns and words in any script.
  const words = maskHooks({ mask: { words: ['ACME'] } }, { isLocal: () => false, load: async () => null, keep: async () => {}, assistant: () => 'Jean', open: () => false, heldReason: () => '', why: () => '', mayGo: () => '', reason: () => '', async* refused(why) { throw new Error(why) } }) // eslint-disable-line require-yield
  assert.equal((await wire(words, { task: undefined, messages: [user('田中さんへ')] })).messages[0].content, '田中さんへ')
})

test('names are read in what a text says, however it is encoded', async () => {
  const { hooks, read } = room(/Hélène Lévy|Renée Dupont/g)
  const { messages } = await wire(hooks, { messages: [user('https://x.example/?q=H%C3%A9l%C3%A8ne+L%C3%A9vy&r=1'), user('{"name":"Ren\\u00e9e Dupont"}')] })
  assert.ok(read.some((text) => text.includes('Hélène Lévy')))
  assert.ok(!JSON.stringify(messages).includes('Hélène'))
  assert.ok(!messages[1].content.includes('Ren'), messages[1].content)
})

test('a word a reading isn’t sure of is hidden where it stands, and spreads no further', async () => {
  const names = async (/** @type {string} */ text) => [...text.matchAll(/On|Marie Durand/g)].map((match) => ({ start: match.index, end: match.index + match[0].length, kind: 'person', chance: match[0] === 'On' ? 0.01 : 0.99 }))
  const { hooks, records } = room(/x/g, { names })
  const { messages } = await wire(hooks, { messages: [user('On a vu Marie Durand.'), user('Tiens, Durand.')] })
  assert.match(messages[0].content, /^⟦U[0-9a-f]+⟧ a vu ⟦P/)
  assert.match(messages[1].content, /^Tiens, ⟦P/)
  assert.ok(Object.keys(records[0].meta.masked).some((id) => id[0] === 'U'))
  const again = room(/x/g)
  again.records.push(...records)
  assert.equal((await wire(again.hooks, { messages: [user('rien')] })).messages[0].content, 'rien')
  assert.equal((await wire(again.hooks, { messages: [user('Hello, on est là.')] })).messages[0].content, 'Hello, on est là.')
})

test('a surname that is a word stays that word without its capital, a particle isn’t looked for, and a schema keeps its keys', async () => {
  const { hooks } = room(/Larry Page|Marie Le Goff/g)
  const { messages, tools } = await wire(hooks, {
    messages: [user('Larry Page et Marie Le Goff'), user('Turn the page, le chat, the required description. Page 3, Goff.')],
    tools: [{ name: 'x', description: 'Larry Page', parameters: { type: 'object', properties: { page: { type: 'string', description: 'The page' } }, required: ['page'] } }],
  })
  assert.match(messages[1].content, /^Turn the page, le chat, the required description\. ⟦P[0-9a-f]+⟧ 3, ⟦P[0-9a-f]+⟧\.$/)
  assert.deepEqual(tools[0].parameters, { type: 'object', properties: { page: { type: 'string', description: 'The page' } }, required: ['page'] })
  assert.equal(tools[0].description, 'Larry Page')
})

test('a name in the person’s own words is read, even in a tag Jean’s own text uses', async () => {
  const head = 'You are Jean.\n\n<tools>\n- save_name: Save the name\n</tools>\n\n<rules>\n- Rules here\n</rules>\n\n<language>\nReply.\n</language>'
  for (const body of ['<context>We act for Marie Durand</context>', '<rules>Marie Durand first</rules>', '<context> and then Marie Durand']) {
    const { hooks } = room(/Marie Durand/g)
    const { system } = await wire(hooks, { system: `${head}\n\n<instructions>\n${body}\n</instructions>\n\n<context>\nToday is 2026-11-01.\n</context>`, messages: [] })
    assert.ok(!system.includes('Marie'), body)
    assert.ok(system.includes('save_name: Save the name'))
    assert.ok(system.includes('Today is 2026-11-01.'))
  }
})

test('a call’s arguments aren’t read for names: a reader failing stops nothing, and what’s known still asks', async () => {
  const { hooks, read } = room(/Marie Durand/g)
  await wire(hooks, { messages: [user('Marie Durand')] })
  read.length = 0
  const check = (/** @type {any} */ args) => fire(hooks, 'tool.check', { task: 't', kind: 'other', name: 'send', args }, () => ({ decision: 'allow' }))
  assert.equal((await check({ body: 'Cordialement' })).decision, 'allow')
  assert.equal((await check({ body: 'Pour Marie Durand' })).decision, 'ask')
  assert.deepEqual(read, [])
  const failing = room(/x/g, { names: async () => { throw new Error('no model') }, reason: () => 'No' })
  assert.equal((await fire(failing.hooks, 'tool.check', { task: 't', kind: 'other', name: 'send', args: { body: 'Cordialement' } }, () => ({ decision: 'allow' }))).decision, 'allow')
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
