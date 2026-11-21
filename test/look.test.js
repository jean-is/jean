// SPDX-License-Identifier: MIT
// What a collection's own check finds (caps/checks/checks.js): the same row twice, a choice written two ways, a number some rows lack, rows that end before they start.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findings } from '../app/caps/checks/checks.js'
import { createTable } from '../app/caps/tables/table.js'

const made = { id: '01JD0000000000000000000000', author: 'user', at: '2026-11-20T10:00:00.000Z' }
const table = createTable({ name: 'Invoices', columns: [{ name: 'Invoice', type: 'text' }, { name: 'Client', type: 'select' }, { name: 'Amount', type: 'number' }, { name: 'Sent', type: 'date' }, { name: 'Due', type: 'date' }] }, made)
const [name, client, amount, sent, due] = table.properties.map(({ id }) => id)
const row = (/** @type {string} */ id, /** @type {string} */ invoice, /** @type {string} */ who, /** @type {number | null} */ sum, more = {}) => ({ id, cells: { [name]: invoice, [client]: who, [amount]: sum }, ...more })
const rows = [row('a', '027', 'Nord', 1200), row('b', '027', 'Nord', 1200), row('c', '028', 'maison  brune', 450), row('d', '029', 'Maison Brune', null), row('e', '030', 'Maison Brune', 90), row('f', '031', 'Carré', 5), row('g', '027', 'Nord', 1200, { deleted: true }), row('h', '', '', 7), row('i', '', '', 7)]

test('findings: the same row twice, by its name and every cell; a choice written two ways, the fewer going to the most; a number few rows lack', () => {
  assert.deepEqual(findings(table, rows), [{ key: 'same a b', kind: 'same', rows: ['a', 'b'], name: '027' },
    { key: `ways ${client} maison brune`, kind: 'ways', column: client, a: 'maison  brune', b: 'Maison Brune', rows: ['c'] }, { key: `empty ${amount}`, kind: 'empty', column: amount, rows: ['d'] }])
  // Too few rows, or too many lacking it, and a number says nothing; mended, nothing is found.
  assert.deepEqual(findings(table, rows.slice(2, 5)).map(({ kind }) => kind), ['ways'])
  assert.deepEqual(findings(table, [row('a', '1', 'x', null), row('b', '2', 'y', null), row('c', '3', 'z', 1), row('d', '4', 'w', 2), row('e', '5', 'v', 3)]), [])
  assert.deepEqual(findings(table, []), [])
})

test('findings: rows that end before they start, once the calendar goes by two dates', () => {
  const those = [{ id: 'a', cells: { [name]: 'A', [sent]: '2026-03-12', [due]: '2026-03-03' } }, { id: 'b', cells: { [name]: 'B', [sent]: '2026-03-12T10:00', [due]: '2026-03-12' } }, { id: 'c', cells: { [name]: 'C', [sent]: '2026-03-12' } }]
  assert.deepEqual(findings(table, those), [])
  assert.deepEqual(findings({ ...table, views: [...table.views, { id: 'calendar', type: 'calendar', date: sent, until: due }] }, those), [{ key: 'ends', kind: 'ends', rows: ['a'] }])
})
