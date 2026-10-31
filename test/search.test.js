// Searching as people type: case and accents aside, part of a word is enough, in any
// script, and what is found is marked where it stands in the text.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fold, terms, ranges, passage, keys, lexicon, lookup, byName } from '../app/core/search.js'

test('fold: lower case without accents, as long as the text', () => {
  assert.equal(fold('Résumé CAFÉ Ñandú'), 'resume cafe nandu')
  assert.equal(fold('Việt Nam'), 'viet nam')
  assert.equal(fold('Ёлка Йошкар'), 'елка иошкар')
  // Arabic's hamza forms read as their letter, as Arabic search usually does.
  assert.equal(fold('أحمد'), 'احمد')
  // Persian and Arabic shapes of one letter are one: as people type them, and as PDFs give them back.
  assert.equal(fold('سببھ رصیف کتاب على'), fold('سببه رصيف كتاب علي'))
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

test('keys: folded words, and a code like C-4471 whole as well as in its parts', () => {
  assert.deepEqual(keys('Contract C-4471, préavis'), ['contract', 'c', '4471', 'preavis', 'c-4471'])
  assert.ok(keys('解約予告期間').length > 1, 'Japanese splits without spaces')
})

test('lexicon and lookup: BM25 over several documents at once, rare words weighing most, accents and case aside', () => {
  const a = lexicon(['Contract C-4471: a notice period of sixty days.', 'Invoices are due within thirty days of issue.', 'Contract C-4417: a notice period of ninety days.'])
  const b = lexicon(['Préavis de résiliation : quatre-vingt-dix jours.', 'Amendment 2 to contract C-4471: the notice period is changed to 90 days.'])
  const hits = lookup([a, b], 'notice period of contract C-4471')
  assert.deepEqual(new Set(hits.slice(0, 2).map((hit) => `${hit.doc}:${hit.passage}`)), new Set(['0:0', '1:1']), 'the code decides, not the words every contract has')
  assert.ok(hits.findIndex((hit) => hit.doc === 0 && hit.passage === 2) > 1, 'its look-alike comes after')
  assert.deepEqual(lookup([b], 'PREAVIS resiliation').map((hit) => hit.passage), [0])
  assert.deepEqual(lookup([a, b], 'zebra'), [])
  assert.ok(hits.every((hit, i) => !i || hit.score <= hits[i - 1].score), 'best first')
})

test('byName: a list in the order a language sorts the names it shows, numbers in them as numbers', () => {
  assert.deepEqual(byName(['Notion 10', 'zoom', 'Écrire', 'Notion 2', 'Box'], (name) => name, 'en'), ['Box', 'Écrire', 'Notion 2', 'Notion 10', 'zoom'])
  const skills = [{ title: 'Lettre' }, { title: 'Budget' }]
  assert.deepEqual(byName(skills, (skill) => skill.title, 'fr').map((skill) => skill.title), ['Budget', 'Lettre'])
  assert.deepEqual(skills.map((skill) => skill.title), ['Lettre', 'Budget'])
  assert.deepEqual(byName(['かんたん', 'ワード', 'アンケート'], (name) => name, 'ja'), ['アンケート', 'かんたん', 'ワード'])
})
