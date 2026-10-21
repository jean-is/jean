// The natural voice's text and weights (D455): its numbers in words, pocket-tts's text rules, its Unigram
// tokenizer with byte fallback, its chunks, and 8-bit weights expanded into fp32. Kyutai's own ids for the
// round-trip sentences matched these in all six languages; here a vocabulary small enough to reason about.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expand, tokenizer, prepare, chunks } from '../app/caps/reader/pocket.js'
import { number, spelled } from '../app/caps/reader/words.js'

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

test('numbers are said in each of the voice’s languages', () => {
  const said = (/** @type {string} */ lang) => [21, 71, 80, 91, 100, 101, 181, 1000, 21000, 2500000].map((n) => number(n, lang))
  assert.deepEqual(said('en'), ['twenty-one', 'seventy-one', 'eighty', 'ninety-one', 'one hundred', 'one hundred one', 'one hundred eighty-one', 'one thousand', 'twenty-one thousand', 'two million five hundred thousand'])
  assert.deepEqual(said('fr'), ['vingt et un', 'soixante et onze', 'quatre-vingts', 'quatre-vingt-onze', 'cent', 'cent un', 'cent quatre-vingt-un', 'mille', 'vingt et un mille', 'deux millions cinq cents mille'])
  assert.deepEqual(said('de'), ['einundzwanzig', 'einundsiebzig', 'achtzig', 'einundneunzig', 'hundert', 'hunderteins', 'hunderteinundachtzig', 'tausend', 'einundzwanzigtausend', 'zwei Millionen fünfhunderttausend'])
  assert.deepEqual(said('es'), ['veintiuno', 'setenta y uno', 'ochenta', 'noventa y uno', 'cien', 'ciento uno', 'ciento ochenta y uno', 'mil', 'veintiún mil', 'dos millones quinientos mil'])
  assert.deepEqual(said('it'), ['ventuno', 'settantuno', 'ottanta', 'novantuno', 'cento', 'centouno', 'centottantuno', 'mille', 'ventunomila', 'due milioni cinquecentomila'])
  assert.deepEqual(said('pt'), ['vinte e um', 'setenta e um', 'oitenta', 'noventa e um', 'cem', 'cento e um', 'cento e oitenta e um', 'mil', 'vinte e um mil', 'dois milhões e quinhentos mil'])
})

test('amounts, measures, dates, times, ranges and ordinals are read in words, each line a sentence without its bullet', () => {
  assert.equal(spelled('Voilà votre semaine, à 4, pour un budget de 46,50 € de courses (marge de 13 € sous la limite de 60 €).', 'fr'),
    'Voilà votre semaine, à quatre, pour un budget de quarante-six euros cinquante de courses (marge de treize euros sous la limite de soixante euros).')
  assert.equal(spelled('Lundi\n- Soir : 1,2 kg à 2 000 €\n- Le 21/10/2026 à 14h30, la 1re fois, le 3e jour, le 80e, 10-15 min, -5 °C, 0,05', 'fr'),
    'Lundi.\nSoir : un virgule deux kilogramme à deux mille euros.\nLe vingt et un octobre deux mille vingt-six à quatorze heures trente, la première fois, le troisième jour, le quatre-vingtième, dix à quinze minutes, moins cinq degrés Celsius, zéro virgule zéro cinq')
  assert.equal(spelled('On 10/21/2026 at 9:00, the 21st, in 1905, $5.99, 25%, ≈ 3.14', 'en'),
    'On October twenty-one, two thousand twenty-six at nine, the twenty-first, in nineteen oh five, five US dollars ninety-nine, twenty-five percent, about three point one four')
  assert.equal(spelled('Am 21.10.2026 um 14:30 Uhr, 1963, 1.234,56 €', 'de'), 'Am einundzwanzig Oktober zweitausendsechsundzwanzig um vierzehn Uhr dreißig, neunzehnhundertdreiundsechzig, tausendzweihundertvierunddreißig Euro sechsundfünfzig')
  assert.equal(spelled('2 000 €', 'ja'), '2 000 €')
})
