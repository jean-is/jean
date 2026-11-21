// SPDX-License-Identifier: MIT
// What is coming up in a collection (caps/soon/due.js): the rows due within two weeks and those late, where a status says what is done, and which a notice is owed for.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayOf, datesOf, coming, keyOf, owed } from '../app/caps/soon/due.js'
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
