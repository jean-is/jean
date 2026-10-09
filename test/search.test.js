// Searching as people type (D133): case and accents aside, part of a word is enough, in any
// script, and what is found is marked where it stands in the text.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fold, terms, ranges, passage } from '../app/core/search.js'

test('fold: lower case without accents, as long as the text', () => {
  assert.equal(fold('Résumé CAFÉ Ñandú'), 'resume cafe nandu')
  assert.equal(fold('Việt Nam'), 'viet nam')
  assert.equal(fold('Ёлка Йошкар'), 'елка иошкар')
  // Arabic's hamza forms read as their letter, as Arabic search usually does.
  assert.equal(fold('أحمد'), 'احمد')
  // Marks that make another letter stay: kana's voicing, Devanagari's vowels, Hangul.
  for (const text of ['がっこう', 'हिंदी', '한국어', 'ภาษาไทย']) assert.equal(fold(text), text)
  // Every place in the folded text is the same place in the text.
  for (const text of ['İstanbul', 'ẞtraße', 'Ωmega 👋🏽 Zoë', 'ﬁle']) assert.equal(fold(text).length, text.length, text)
})

test('terms: the words typed, folded, once each, in any script', () => {
  assert.deepEqual(terms('Invoice  invoice MARCH, résumé'), ['invoice', 'march', 'resume'])
  assert.ok(terms('会議の議事録', 'ja').length > 1, 'Japanese splits without spaces')
  assert.deepEqual(terms('  ?! '), [])
})

test('ranges: every place a term is, in order, joined where they touch', () => {
  const text = fold('Invoices for March: the march of invoices')
  assert.deepEqual(ranges(text, ['invo', 'march']), [[0, 4], [13, 18], [24, 29], [33, 37]])
  assert.deepEqual(ranges('abcdef', ['bcd', 'cde', 'f']), [[1, 6]])
  assert.deepEqual(ranges('abc', ['', 'x']), [])
})

test('passage: around a place, from the start of a word where there are spaces', () => {
  const text = `${'word '.repeat(30)}needle ${'more '.repeat(60)}`
  const at = text.indexOf('needle')
  const [start, end] = passage(text, at)
  assert.ok(start < at && at - start <= 40, 'a little before it')
  assert.equal(text[start - 1], ' ', 'from a word’s start')
  assert.ok(end > at && end <= text.length)
  assert.deepEqual(passage('short text', 6), [0, 10])
  // Without spaces it starts where it must, never in the middle of a character.
  const emoji = `${'😀'.repeat(40)}x会議`
  const [from] = passage(emoji, emoji.indexOf('会'))
  assert.equal(emoji.codePointAt(from), 0x1f600)
})
