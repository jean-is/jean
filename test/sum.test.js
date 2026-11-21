// SPDX-License-Identifier: MIT
// A collection summed up (caps/sum/calc.js): its rows counted, its first number's total, shared by its status or first choice and by month.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summary } from '../app/caps/sum/calc.js'
import { createTable } from '../app/caps/tables/table.js'

const made = { id: '01JD0000000000000000000000', author: 'user', at: '2026-11-20T10:00:00.000Z' }

test('summary: the total of the first number, by the status in its steps\' order, then by month, the last six with rows; deleted rows left out', () => {
  const table = createTable({ name: 'Invoices', columns: [{ name: 'Invoice', type: 'text' }, { name: 'Client', type: 'select' }, { name: 'Amount', type: 'number', format: 'money', currency: 'EUR' }, { name: 'Status', type: 'status', options: ['To send', 'Sent', 'Paid'] }, { name: 'Due', type: 'date' }] }, made)
  const [, , amount, status, due] = table.properties.map(({ id }) => id), row = (/** @type {unknown} */ sum, /** @type {string} */ step, /** @type {unknown} */ day, more = {}) => ({ cells: { [amount]: sum, [status]: step, [due]: day }, ...more })
  const all = [row(100, 'Paid', '2026-01-10'), row(50, 'Sent', '2026-01-20T09:00'), row(25, 'Paid', '2026-03-02'), row(null, 'To send', '2026-04-01'), row(7, '', null), row(999, 'Paid', '2026-05-05', { deleted: true }),
    ...['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'].map((day) => row(1, 'Paid', day))]
  const said = summary(table, all)
  assert.deepEqual([said.count, said.number?.name, said.total, said.by?.name, said.date?.name], [9, 'Amount', 186, 'Status', 'Due'])
  assert.deepEqual(said.groups, [['To send', 0], ['Sent', 50], ['Paid', 129], ['', 7]])
  assert.deepEqual(said.months, [['2026-03', 25], ['2026-04', 0], ['2026-05', 1], ['2026-06', 1], ['2026-07', 1], ['2026-08', 1]])
})

test('summary: with no number, rows are counted, by the first choice; with neither a status nor a choice, nothing is shared', () => {
  const books = createTable({ name: 'Books', columns: [{ name: 'Book', type: 'text' }, { name: 'Shelf', type: 'select' }] }, made), shelf = books.properties[1].id
  assert.deepEqual(((said) => [said.count, said.total, said.groups, said.months])(summary(books, [{ cells: { [shelf]: 'Read' } }, { cells: { [shelf]: 'Read' } }, { cells: {} }])), [3, 0, [['Read', 2], ['', 1]], []])
  assert.deepEqual(summary(createTable({ name: 'Notes', columns: [{ name: 'Note', type: 'text' }] }, made), [{ cells: {} }]).groups, [])
})
