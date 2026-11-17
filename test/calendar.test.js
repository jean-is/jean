// SPDX-License-Identifier: MIT
// A collection's calendar (caps/calendar/month.js): a month's weeks from the language's first day, where each row lies, a row
// that lasts on each of its days, the month it opens on, and a row moved to another day with its time.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weeksOf, placed, monthOf, monthAfter, moved, addDays, daysBetween, dayOf } from '../app/caps/calendar/month.js'

/** A row with a day, an end and a name. @param {string} id @param {unknown} [on] @param {unknown} [to] */
const row = (id, on, to) => ({ id, cells: { name: id, ...(on !== undefined && { on }), ...(to !== undefined && { to }) } })

test('weeksOf: a month as weeks from the language\'s first day, the days of its neighbours left out', () => {
  // November 2026 starts on a Sunday.
  const monday = weeksOf('2026-11', 1)
  assert.equal(monday.length, 6)
  assert.deepEqual(monday[0], [null, null, null, null, null, null, '2026-11-01'])
  assert.deepEqual(monday[1], ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
  assert.deepEqual(monday[5], ['2026-11-30', null, null, null, null, null, null])
  const sunday = weeksOf('2026-11', 7)
  assert.equal(sunday.length, 5)
  assert.deepEqual(sunday[0], ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'])
  // Saturday first, as in much of the Arab world; a February of four whole weeks; a leap year's 29 days.
  assert.deepEqual(weeksOf('2026-11', 6)[0], [null, '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'])
  assert.deepEqual(weeksOf('2027-02', 1).map((week) => week.filter(Boolean).length), [7, 7, 7, 7])
  assert.equal(weeksOf('2028-02', 1).flat().filter(Boolean).length, 29)
  for (const week of weeksOf('2026-12', 3)) assert.equal(week.length, 7)
})

test('placed: each row on its day, by its time then as it came; one that lasts, on each of its days in the month; one with no day, apart', () => {
  const rows = [row('late', '2026-11-20T16:00'), row('early', '2026-11-20T09:30'), row('all day', '2026-11-20'), row('trip', '2026-11-29', '2026-12-02'), row('began before', '2026-10-30', '2026-11-02'),
    row('ends first', '2026-11-10', '2026-11-08'), row('none'), row('wrong', 'soon'), row('zoned', '2026-11-05T23:30:00Z')]
  const { days, none } = placed(rows, 'on', 'to', '2026-11')
  assert.deepEqual(days.get('2026-11-20')?.map(({ row, time }) => [row.id, time]), [['all day', ''], ['early', '09:30'], ['late', '16:00']])
  // A row that lasts is on each of its days, its time on the first alone; only this month's days.
  assert.deepEqual(['2026-11-28', '2026-11-29', '2026-11-30'].map((day) => days.get(day)?.map(({ row, on }) => [row.id, on])), [undefined, [['trip', false]], [['trip', true]]])
  assert.deepEqual(['2026-11-01', '2026-11-02', '2026-11-03'].map((day) => days.get(day)?.map(({ row, on }) => [row.id, on])), [[['began before', true]], [['began before', true]], undefined])
  // An end before its start is none: the row is on its day alone.
  assert.deepEqual([days.get('2026-11-08'), days.get('2026-11-10')?.map(({ row }) => row.id)], [undefined, ['ends first']])
  assert.deepEqual(none.map(({ id }) => id), ['none', 'wrong'])
  assert.equal(days.get('2026-11-05')?.[0].time, '23:30')
  // With no column to last until, each row is on its day alone.
  assert.deepEqual(placed(rows, 'on', undefined, '2026-11').days.get('2026-11-30'), undefined)
  assert.equal(placed(rows, 'on', undefined, '2026-12').days.size, 0)
})

test('monthOf: this month while a row is in it or none has a day; else the month of the next row to come, else of the last one gone', () => {
  assert.equal(monthOf([], '2026-11-17'), '2026-11')
  assert.equal(monthOf(['2026-11-30', '2027-03-01'], '2026-11-17'), '2026-11')
  assert.equal(monthOf(['2026-09-12', '2027-03-01', '2027-01-09'], '2026-11-17'), '2027-01')
  assert.equal(monthOf(['2026-09-12', '2025-01-01'], '2026-11-17'), '2026-09')
})

test('a month before or after, a day some days later, the days between two, a value\'s day, and a row moved to another day with its time', () => {
  assert.deepEqual([monthAfter('2026-12', 1), monthAfter('2026-01', -1), monthAfter('2026-11', 14)], ['2027-01', '2025-12', '2028-01'])
  assert.deepEqual([addDays('2026-12-31', 1), addDays('2028-02-28', 1), addDays('2026-03-01', -1)], ['2027-01-01', '2028-02-29', '2026-02-28'])
  assert.deepEqual([daysBetween('2026-11-20', '2026-11-23'), daysBetween('2026-11-20', '2026-11-18'), daysBetween('2026-10-25', '2026-10-26')], [3, -2, 1])
  assert.deepEqual(['2026-11-20', '2026-11-20T14:30', '2026-13-01', 'soon', null, 3].map(dayOf), ['2026-11-20', '2026-11-20', '', '', '', ''])
  assert.deepEqual([moved('2026-11-20', '2026-11-25'), moved('2026-11-20T14:30', '2026-11-25'), moved('2026-11-20T14:30:00Z', '2026-12-01'), moved(null, '2026-11-25')], ['2026-11-25', '2026-11-25T14:30', '2026-12-01T14:30:00Z', '2026-11-25'])
})
