// SPDX-License-Identifier: MIT
// Cells copied from a spreadsheet, as a collection takes them (caps/paste/block.js, D759): the block read from the clipboard's text, each value as
// its column's kind writes it, in the person's language, and what the block changes from the cell it is pasted on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cellsOf, numberOf, dateOf, valueFor, planned } from '../app/caps/paste/block.js'

/** @import { Property } from '../app/caps/tables/table.js' */

const now = new Date('2026-11-19T10:00:00')
/** A column of a kind. @param {string} id @param {Property['type']} type @param {Partial<Property>} [more] @returns {Property} */
const column = (id, type, more = {}) => ({ id, name: id, type, ...more })

test('cellsOf: a line a row, a tab a cell, Windows\' line ends too; a quoted cell holds tabs, line breaks and doubled quotes; a quote that closes nothing is a letter', () => {
  assert.deepEqual(cellsOf('Home\tRent\r\nVilla\t1450\r\n'), [['Home', 'Rent'], ['Villa', '1450']])
  assert.deepEqual(cellsOf('a\tb\n"two\nlines"\t"say ""hi"""\n"Hello" he said\t"a\tb"'), [['a', 'b'], ['two\nlines', 'say "hi"'], ['"Hello" he said', 'a\tb']])
  // Empty cells keep their place; a line of them is a row; the last line break ends the block, and nothing is no block.
  assert.deepEqual(cellsOf('a\t\tb\n\t\t\nc'), [['a', '', 'b'], ['', '', ''], ['c']])
  assert.deepEqual([cellsOf('one\n'), cellsOf('one'), cellsOf('\n'), cellsOf(''), cellsOf(' \t \n')], [[['one']], [['one']], [], [], []])
  assert.deepEqual(cellsOf('""\tx\n'), [['', 'x']])
})

test('numberOf: as each language writes one, its currency and its percent sign aside, in any script\'s digits', () => {
  const read = (/** @type {string} */ text, /** @type {string} */ language) => numberOf(text, [language])
  // A point and a comma: the last is the decimals'.
  assert.deepEqual([read('1,234.50', 'en'), read('1.234,5', 'de'), read('1 234,50 €', 'fr'), read('$1,234,567', 'en'), read('3 456 789', 'fr')], [1234.5, 1234.5, 1234.5, 1234567, 3456789])
  // One alone groups thousands only where it is the language's mark for them, before three digits.
  assert.deepEqual([read('1,234', 'en'), read('1,234', 'fr'), read('1.234', 'de'), read('1.234', 'en'), read('1,5', 'en'), read('12.', 'en'), read('.5', 'en')], [1234, 1.234, 1234, 1.234, 1.5, 12, 0.5])
  assert.deepEqual([read('(12)', 'en'), read('-12', 'en'), read('−3,5', 'fr'), read('12-', 'en'), read('25%', 'en'), read('R$ 12,50', 'pt'), read('12 kg', 'en'), read('1e3', 'en')], [-12, -12, -3.5, -12, 25, 12.5, 12, 1000])
  assert.deepEqual([read('١٢٣٫٥', 'ar'), read('१२', 'hi'), read('１２３', 'ja')], [123.5, 12, 123])
  // Words, a day and an hour are no number.
  assert.deepEqual([read('abc', 'en'), read('twelve apples', 'en'), read('2026-11-20', 'en'), read('12/11/2026', 'fr'), read('12:30', 'en'), read('', 'en')], Array(6).fill(undefined))
})

test('dateOf: a day as ISO 8601 has it, from numbers in the language\'s order, a month by its name, in any script\'s digits', () => {
  const read = (/** @type {string} */ text, /** @type {string} */ language, timed = false) => dateOf(text, { locales: [language], now, timed })
  assert.deepEqual([read('2026-11-20', 'en'), read('2026/11/20', 'ja'), read('2026年11月20日', 'ja'), read('2026. 11. 20.', 'ko'), read('20.11.2026', 'de'), read('20/11/2026', 'fr'), read('11/20/2026', 'en')], Array(7).fill('2026-11-20'))
  // Day before month as the language has them; a number over twelve is a day's wherever it is.
  assert.deepEqual([read('3/4/2026', 'en'), read('3/4/2026', 'fr'), read('20/11/2026', 'en'), read('11/20/2026', 'fr'), read('3/4/26', 'fr'), read('3/4/85', 'fr')], ['2026-03-04', '2026-04-03', '2026-11-20', '2026-11-20', '2026-04-03', '1985-04-03'])
  // A month by its name, the language's or English's, long or short, among other words; with no year, this year's.
  assert.deepEqual([read('20 nov. 2026', 'fr'), read('Nov 20, 2026', 'en'), read('20-Nov-26', 'fr'), read('20 de nov. de 2026', 'pt'), read('Friday, 20th November 2026', 'en'), read('20 novembre', 'fr'), read('2026 Nov 20', 'en')], Array(7).fill('2026-11-20'))
  assert.deepEqual([read('٢٠/١١/٢٠٢٦', 'ar'), read('20/11/2569', 'th')], ['2026-11-20', '2026-11-20'])
  // Its time, kept where it is not midnight or the column has times.
  assert.deepEqual([read('2026/11/20 14:30', 'ja'), read('20/11/2026 2:30 PM', 'en-GB'), read('20/11/2026 12:15 am', 'en-GB'), read('2026-11-20T14:30:00.000Z', 'en'), read('20/11/2026 00:00', 'fr'), read('20/11/2026 00:00', 'fr', true), read('20/11/2026', 'fr', true)],
    ['2026-11-20T14:30', '2026-11-20T14:30', '2026-11-20T00:15', '2026-11-20T14:30', '2026-11-20', '2026-11-20T00:00', '2026-11-20'])
  // No day: words, a month alone, a day no calendar has, an hour no clock has.
  assert.deepEqual([read('hello', 'en'), read('Nov 2026', 'en'), read('31/02/2026', 'fr'), read('20/11/2026 24:00', 'fr'), read('12', 'en'), read('1450', 'en'), read('', 'en')], Array(7).fill(undefined))
})

test('valueFor: a cell\'s text as its column\'s kind writes it; empty empties the cell; what a column can\'t take leaves it', () => {
  const how = { locales: ['fr'], yes: 'Oui', no: 'Non', now }
  const read = (/** @type {Property} */ property, /** @type {string} */ text) => valueFor(property, text, how)
  assert.deepEqual([read(column('a', 'text'), '  Villa Aurore '), read(column('a', 'person'), 'Léa'), read(column('a', 'number'), '1 450,50 €'), read(column('a', 'date'), '20/11/2026')], ['Villa Aurore', 'Léa', 1450.5, '2026-11-20'])
  // A box: the person's own words, a spreadsheet's, a mark.
  const box = column('a', 'checkbox')
  assert.deepEqual(['oui', 'Non', 'TRUE', 'false', 'VRAI', 'x', '0', '✓', 'maybe'].map((text) => read(box, text)), [true, false, true, false, true, true, false, true, undefined])
  // A step by its name in any case, another left; a choice as it is written, an existing one as it is named; several between commas.
  const step = column('a', 'status', { options: [{ name: 'To visit', group: 'todo' }, { name: 'Visited', group: 'done' }] }), choice = column('a', 'select', { options: [{ name: 'Canal' }] })
  assert.deepEqual([read(step, 'visited'), read(step, 'Sold'), read(choice, 'canal'), read(choice, 'Hillside'), read(column('a', 'multi-select', { options: [{ name: 'Garden' }] }), 'garden, Lift; ')], ['Visited', undefined, 'Canal', 'Hillside', ['Garden', 'Lift']])
  // An address with no https:// is given one; an email and a phone as their columns take them.
  assert.deepEqual([read(column('a', 'link'), 'homes.example/12'), read(column('a', 'link'), 'https://homes.example'), read(column('a', 'link'), 'not an address'), read(column('a', 'email'), 'lea@example.com'), read(column('a', 'email'), 'lea'), read(column('a', 'phone'), '06 39 98 00 12')],
    ['https://homes.example/12', 'https://homes.example', undefined, 'lea@example.com', undefined, '06 39 98 00 12'])
  // Empty empties; what Jean works out, a picture and files are never pasted.
  assert.deepEqual([read(column('a', 'number'), ' '), read(box, ''), read(column('a', 'number'), 'soon'), read(column('a', 'date'), 'soon')], [null, null, undefined, undefined])
  assert.deepEqual(['picture', 'files', 'formula', 'created-at', 'changed-by', 'relation'].map((type) => read(column('a', /** @type {Property['type']} */ (type)), 'x')), Array(6).fill(undefined))
})

test('planned: a block\'s lines over the rows shown from the cell\'s, new rows past the last; its cells over the columns from the cell\'s, those past the last left', () => {
  const columns = [column('home', 'text'), column('rent', 'number'), column('seen', 'checkbox')], read = (/** @type {Property} */ property, /** @type {string} */ text) => valueFor(property, text, { locales: ['en'] })
  // From the second row of three: two rows changed, two made.
  assert.deepEqual(planned([['Quai 12', '980', 'yes', 'left'], ['Gare 27', '890'], ['Écluse 5', '', 'no'], ['Lilas 8']], columns, ['r1', 'r2', 'r3'], 'r2', read), [
    { row: 'r2', set: { home: 'Quai 12', rent: 980, seen: true } }, { row: 'r3', set: { home: 'Gare 27', rent: 890 } }, { set: { home: 'Écluse 5', rent: null, seen: false } }, { set: { home: 'Lilas 8' } }])
  // A value its column can't take leaves its cell; a line that changes nothing is left, as is a new row of nothing; an empty cell empties a row's.
  assert.deepEqual(planned([['', 'soon'], ['A', 'soon'], ['', ''], ['', '']], columns.slice(0, 2), ['r1', 'r2', 'r3'], 'r1', read), [{ row: 'r1', set: { home: null } }, { row: 'r2', set: { home: 'A' } }, { row: 'r3', set: { home: null, rent: null } }])
  // From a column on: the columns before it stay.
  assert.deepEqual(planned([['12', 'x']], columns.slice(1), ['r1'], 'r1', read), [{ row: 'r1', set: { rent: 12, seen: true } }])
  // A row the view no longer shows: every line is a new row.
  assert.deepEqual(planned([['A'], ['B']], columns, ['r1'], 'gone', read), [{ set: { home: 'A' } }, { set: { home: 'B' } }])
})
