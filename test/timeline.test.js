// SPDX-License-Identifier: MIT
// A collection's timeline (caps/timeline/span.js): the whole months it runs over, where each row lies among them, how wide a day is at
// least, and the day a point along it is on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spanOf, dayAt } from '../app/caps/timeline/span.js'

/** A row with a day, an end and a name. @param {string} id @param {unknown} [on] @param {unknown} [to] */
const row = (id, on, to) => ({ id, cells: { name: id, ...(on !== undefined && { on }), ...(to !== undefined && { to }) } })

test('spanOf: whole months from the first row\'s to the one after the last row\'s, each row from its day to the one it lasts until, those with no day apart, and today\'s day', () => {
  const rows = [row('notice', '2026-10-26', '2026-10-30'), row('flat', '2026-11-02', '2026-11-27'), row('lease', '2026-12-01'), row('day', '2026-12-19T08:00'), row('ends first', '2026-11-10', '2026-11-08'), row('none'), row('wrong', 'soon')]
  const span = spanOf(rows, 'on', 'to', '2026-11-18')
  // October to January: the month after the last row's is where the last bars' names read.
  assert.deepEqual([span.from, span.days], ['2026-10-01', 31 + 30 + 31 + 31])
  assert.deepEqual(span.months, [{ month: '2026-10', at: 0, days: 31 }, { month: '2026-11', at: 31, days: 30 }, { month: '2026-12', at: 61, days: 31 }, { month: '2027-01', at: 92, days: 31 }])
  assert.deepEqual(span.places.get('notice'), { at: 25, days: 5, start: '2026-10-26', end: '2026-10-30' })
  assert.deepEqual(span.places.get('flat'), { at: 32, days: 26, start: '2026-11-02', end: '2026-11-27' })
  // One with no end, or a time, lasts its day; an end before its start is none.
  assert.deepEqual([span.places.get('lease'), span.places.get('day'), span.places.get('ends first')].map((place) => [place?.at, place?.days]), [[61, 1], [79, 1], [40, 1]])
  assert.deepEqual([span.none.map(({ id }) => id), [...span.places.keys()]], [['none', 'wrong'], ['notice', 'flat', 'lease', 'day', 'ends first']])
  assert.equal(span.now, 48)
  // With no column to last until, each row is on its day alone.
  assert.deepEqual([...spanOf(rows, 'on', undefined, '2026-11-18').places.values()].map(({ days }) => days), [1, 1, 1, 1, 1])
})

test('spanOf: today is in it only where its months are; with no row on a day, this month and the next; a year\'s end and a leap year', () => {
  assert.equal(spanOf([row('a', '2026-03-10')], 'on', 'to', '2026-11-18').now, -1)
  assert.equal(spanOf([row('a', '2027-03-10')], 'on', 'to', '2026-11-18').now, -1)
  const empty = spanOf([row('none')], 'on', 'to', '2026-11-18')
  assert.deepEqual([empty.from, empty.months.map(({ month }) => month), empty.now, empty.places.size, empty.none.length], ['2026-11-01', ['2026-11', '2026-12'], 17, 0, 1])
  assert.deepEqual(spanOf([row('a', '2027-12-20', '2028-02-10')], 'on', 'to', '2026-11-18').months.map(({ month, days }) => [month, days]), [['2027-12', 31], ['2028-01', 31], ['2028-02', 29], ['2028-03', 31]])
})

test('spanOf: a day is narrower as the months are more', () => {
  const wide = (/** @type {string} */ to) => spanOf([row('a', '2026-01-05', to)], 'on', 'to', '2026-11-18').wide
  assert.deepEqual([wide('2026-02-20'), wide('2026-06-20'), wide('2027-06-20')], [0.6, 0.3, 0.15])
})

test('dayAt: the day a point along it is on, a share of its width from its start, less the days a bar was held from its own, never outside its months', () => {
  assert.deepEqual([dayAt('2026-10-01', 123, 0), dayAt('2026-10-01', 123, 0.5), dayAt('2026-10-01', 123, 0.999)], ['2026-10-01', '2026-12-01', '2027-01-31'])
  assert.deepEqual([dayAt('2026-10-01', 123, -0.2), dayAt('2026-10-01', 123, 1.4)], ['2026-10-01', '2027-01-31'])
  // Held three days from its start, a bar starts three days before the day it is let go on, in the month before its first if need be.
  assert.deepEqual([dayAt('2026-10-01', 123, 0.5, 3), dayAt('2026-10-01', 123, 0, 3)], ['2026-11-28', '2026-09-28'])
})
