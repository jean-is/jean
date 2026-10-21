// The natural voice's text and weights (D455): pocket-tts's text rules, its Unigram tokenizer with byte
// fallback, its chunks, and 8-bit weights expanded into fp32. Kyutai's own ids for the round-trip sentences
// matched these in all six languages; here a vocabulary small enough to reason about.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expand, tokenizer, prepare, chunks } from '../app/caps/reader/pocket.js'

const bytes = Array.from({ length: 256 }, (_, b) => [`<0x${b.toString(16).toUpperCase().padStart(2, '0')}>`, 0])
const pieces = [['▁', -2], ['▁he', -3], ['llo', -3], ['▁hello', -4], ['h', -5], ['e', -5], ['l', -5], ['o', -5], ['▁w', -4], ['orld', -4],
  ['.', -2], ['?', -2], [',', -2], ['▁pi', -3], ['▁is', -3], ['3', -3], ['1', -3], ['4', -3], ['▁yes', -3], ['▁today', -3], ['▁Y', -4], ['es', -4]]
const vocab = /** @type {[string, number][]} */ ([['<unk>', 0], ['<s>', 0], ['</s>', 0], ['<pad>', 0], ...bytes, ...pieces])
const tokens = tokenizer({ model: { vocab, unk_id: 0 } })
const id = (/** @type {string} */ piece) => vocab.findIndex(([p]) => p === piece)
const rules = { replace: { '«': '', '»': '' }, semicolons: true, pad: false, final: true, capitalize: true }

test('words are cut before each space, and each into the pieces that score best', () => {
  assert.deepEqual(tokens.encode('hello world'), [id('▁hello'), id('▁w'), id('orld')])
  assert.equal(tokens.decode(tokens.encode('hello world')), 'hello world')
})

test('a character the vocabulary lacks is read as its UTF-8 bytes, and decoded back', () => {
  const ids = tokens.encode('hé')
  assert.deepEqual(ids, [id('▁'), id('h'), id('<0xC3>'), id('<0xA9>')])
  assert.equal(tokens.decode(ids), 'hé')
})

test('a chunk is prepared as pocket-tts does: characters replaced, semicolons, a capital, a final mark', () => {
  assert.deepEqual(prepare('  « hello » ; world ', rules), { text: 'Hello , world.', after: 5 })
  assert.deepEqual(prepare('one two three four five six,', rules), { text: 'One two three four five six.', after: 3 })
  assert.deepEqual(prepare('He said "yes"', rules), { text: 'He said "yes".', after: 5 })
  assert.deepEqual(prepare('Done?', rules), { text: 'Done?', after: 5 })
})

test('sentences end at the tokenizer’s marks, a decimal point not one, and join up to the token limit', () => {
  const text = 'pi is 3.14 today. yes.'
  assert.deepEqual(chunks(text, tokens, rules).map((c) => tokens.decode(c.ids)), ['Pi is 3.14 today. yes.'])
  assert.deepEqual(chunks(text, tokens, rules, 6).map((c) => tokens.decode(c.ids)), ['Pi is 3.14 today.', 'Yes.'])
})

test('8-bit weights expand per channel into fp32, along the first axis or the last', () => {
  const bin = new ArrayBuffer(64)
  new Int8Array(bin, 0, 6).set([1, 2, 3, -1, -2, -127])
  new Float32Array(bin, 8, 2).set([0.5, 2])
  new Int8Array(bin, 16, 6).set([1, 1, 1, 2, 2, 2])
  new Float32Array(bin, 24, 3).set([1, 0.25, 4])
  const out = new Float32Array(expand(bin, { bytes: 56, tensors: [[0, 6, 3, 2, 0, 8], [32, 6, 1, 3, 16, 24]] }).buffer)
  assert.deepEqual([...out.slice(0, 6)], [0.5, 1, 1.5, -2, -4, -254])
  assert.deepEqual([...out.slice(8, 14)], [1, 0.25, 4, 2, 0.5, 8])
})
