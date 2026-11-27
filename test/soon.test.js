// SPDX-License-Identifier: MIT
// What is coming up in a collection (caps/soon/due.js): the rows due within two weeks and those late, where a status says what is done, and which a notice is owed for;
// and a document's open tasks with a day, for the person or for no one (D774).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayOf, datesOf, coming, keyOf, owed, todos } from '../app/caps/soon/due.js'
import { createTable } from '../app/caps/tables/table.js'

const made = { id: '01JD0000000000000000000000', author: 'user', at: '2026-11-20T10:00:00.000Z' }, today = '2026-11-20'
const invoices = createTable({ name: 'Invoices', columns: [{ name: 'Invoice', type: 'text' }, { name: 'Status', type: 'status', options: ['To send', 'Sent', 'Paid'] }, { name: 'Due', type: 'date' }, { name: 'Sent on', type: 'date' }] }, made)
const [name, status, due, sent] = invoices.properties.map(({ id }) => id)
const row = (/** @type {string} */ id, /** @type {string} */ step, /** @type {unknown} */ day, more = {}) => ({ id, cells: { [name]: id, [status]: step, [due]: day }, ...more })
const rows = [row('late', 'Sent', '2026-11-12'), row('paid-late', 'Paid', '2026-11-01'), row('soon', 'Sent', '2026-11-24T14:30'), row('today', 'To send', '2026-11-20'), row('far', 'Sent', '2026-12-05'),
  row('edge', 'Sent', '2026-12-04'), row('paid-soon', 'Paid', '2026-11-22'), row('none', 'Sent', null), row('words', 'Sent', 'soon'), row('gone', 'Sent', '2026-11-21', { deleted: true })]

test('dayOf: the person\'s own day', () => {
  assert.equal(dayOf(new Date(2026, 10, 5, 23, 59)), '2026-11-05')
})

test('coming: late rows first, then those due within two weeks, the earliest first; none done, deleted, with no day or too far', () => {
  assert.deepEqual(coming(invoices, rows, { today }).map(({ id, day, away }) => [id, day, away]), [['late', '2026-11-12', -8], ['today', '2026-11-20', 0], ['soon', '2026-11-24', 4], ['edge', '2026-12-04', 14]])
  assert.deepEqual(coming(invoices, rows, { today, within: 3 }).map(({ id }) => id), ['late', 'today'])
  assert.equal(coming(invoices, rows, { today })[0].name, 'late')
})

test('coming: by the column named, else the first date; with no status, nothing is late; with no date, nothing comes', () => {
  assert.deepEqual(datesOf(invoices).map(({ name }) => name), ['Due', 'Sent on'])
  assert.deepEqual(coming(invoices, [{ id: 'a', cells: { [name]: 'A', [status]: 'Sent', [due]: '2027-01-01', [sent]: '2026-11-21' } }], { today, column: sent }).map(({ id, away }) => [id, away]), [['a', 1]])
  assert.deepEqual(coming(invoices, [{ id: 'a', cells: { [name]: 'A', [due]: '2026-11-21' } }], { today, column: 'nothing' }).length, 1)
  const trips = createTable({ name: 'Trips', columns: [{ name: 'Trip', type: 'text' }, { name: 'Leaves', type: 'date' }] }, made), [trip, leaves] = trips.properties.map(({ id }) => id)
  assert.deepEqual(coming(trips, [{ id: 'past', cells: { [trip]: 'Past', [leaves]: '2026-11-01' } }, { id: 'next', cells: { [trip]: 'Next', [leaves]: '2026-11-25' } }], { today }).map(({ id }) => id), ['next'])
  assert.deepEqual(coming(createTable({ name: 'Books', columns: [{ name: 'Book', type: 'text' }] }, made), [{ id: 'a', cells: {} }], { today }), [])
})

test('owed: a notice for what is due within the days asked, never what went by, once for each day', () => {
  const dues = coming(invoices, rows, { today })
  assert.deepEqual(owed(dues, 1, new Set()).map(({ id }) => id), ['today'])
  assert.deepEqual(owed(dues, 7, new Set()).map(({ id }) => id), ['today', 'soon'])
  assert.deepEqual(owed(dues, 7, new Set(['today 2026-11-20'])).map(({ id }) => id), ['soon'])
  // A day changed is told again.
  assert.deepEqual(owed(dues, 7, new Set(['soon 2026-11-23'])).map(keyOf), ['today 2026-11-20', 'soon 2026-11-24'])
  assert.deepEqual(owed(dues, 0, new Set()).map(({ id }) => id), ['today'])
})

test('todos: a document\'s open tasks with a day, those naming the person or no one, by their words without their name or day', () => {
  const doc = ['# Week', '- [ ] Call the bank @[Léa] 2026-12-04', '- [ ] Book the room @[Marc] 2026-12-04', '- [x] Pay rent @[Léa] 2026-12-04', '* [ ] Water the plants 2026-12-04',
    '  1. [ ] Ask @[Marc] and @[léa ] about **the trip** 2026-12-06', '> - [ ] Read [the brief](https://example.com/2026-12-01) 2026-12-05', 'Not a task @[Léa] 2026-12-04'].join('\n')
  const at = (/** @type {string} */ today, /** @type {string} */ me) => todos(doc, { today, me }).map(({ name, day, away, nth }) => [name, day, away, nth])
  assert.deepEqual(at('2026-12-04', 'Léa'), [['Call the bank', '2026-12-04', 0, 0], ['Water the plants', '2026-12-04', 0, 2], ['Ask @Marc and about the trip', '2026-12-06', 2, 0], ['Read the brief', '2026-12-05', 1, 0]])
  // Someone else's copy: what names Marc and what names no one; with no name, only what names no one.
  assert.deepEqual(at('2026-12-04', 'Marc').map(([name]) => name), ['Book the room', 'Water the plants', 'Ask and @léa about the trip', 'Read the brief'])
  assert.deepEqual(at('2026-12-04', '').map(([name]) => name), ['Water the plants', 'Read the brief'])
  // Gone by, or past two weeks: neither.
  assert.deepEqual(at('2026-12-05', 'Léa').map(([name]) => name), ['Ask @Marc and about the trip', 'Read the brief'])
  assert.deepEqual(at('2026-11-19', 'Léa'), [])
})

test('todos: never a day in code, a link, a time, a longer number or one that isn\'t, and a fence ends only with its own mark', () => {
  const doc = ['```', '- [ ] In a fence 2026-12-04', '~~~', '- [ ] Still in it 2026-12-04', '```', '- [ ] `2026-12-04` in code', '- [ ] At 2026-12-04T10:00', '- [ ] Ref 12026-12-04',
    '- [ ] Not a day 2026-02-30', '- [ ] Named @[2026-12-04] only', '- [ ] Out of it 2026-12-04'].join('\n')
  assert.deepEqual(todos(doc, { today: '2026-12-04', me: 'Léa' }).map(({ name, nth }) => [name, nth]), [['Out of it', 0]])
})

test('todos: told once on its day, and again for a day changed', () => {
  const told = new Set(), line = (/** @type {string} */ day) => todos(`- [ ] Call the bank @[Léa] ${day}\n`, { today: '2026-12-04', me: 'Léa' })
  assert.deepEqual(owed(todos('- [ ] Call the bank @[Léa] 2026-12-05\n', { today: '2026-12-04', me: 'Léa' }), 0, told), [])
  const due = owed(line('2026-12-04'), 0, told)
  assert.deepEqual(due.map(keyOf), ['Call the bank 2026-12-04'])
  told.add(keyOf(due[0]))
  assert.deepEqual(owed(line('2026-12-04'), 0, told), [])
  assert.deepEqual(owed(todos('- [ ] Call the bank @[Léa] 2026-12-04\n', { today: '2026-12-04', me: 'Ana' }), 0, new Set()), [])
})
