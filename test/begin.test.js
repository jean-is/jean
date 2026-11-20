// SPDX-License-Identifier: MIT
// A collection begun with no brain (caps/begin/shape.js): a file's lines read whatever mark parts its cells, each column's kind guessed from all its
// cells so that none is lost, what a kind picked instead would leave empty, and the starting points as tables' specs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linesOf, guess, off, specOf, STARTS, started } from '../app/caps/begin/shape.js'
import { createTable } from '../app/caps/tables/table.js'

const how = { locales: ['fr'], now: new Date('2026-11-20T10:00:00'), currency: 'EUR', column: (/** @type {number} */ n) => `Column ${n}` }
const kinds = (/** @type {string} */ text, more = {}) => guess(linesOf(text), { ...how, ...more }).columns.map(({ type }) => type)

test('linesOf: the mark that parts the first line the most, a comma, a semicolon, a tab or a bar; quoted cells hold it, line breaks and doubled quotes; empty lines are none', () => {
  assert.deepEqual(linesOf('﻿a,b\r\n1,"x, y"\r\n\r\n2,"say ""hi"""\n'), [['a', 'b'], ['1', 'x, y'], ['2', 'say "hi"']])
  assert.deepEqual(linesOf('a;b;c\n1,5;2;"two\nlines"'), [['a', 'b', 'c'], ['1,5', '2', 'two\nlines']])
  assert.deepEqual([linesOf('a\tb\n1\t2'), linesOf('a|b\n1|2'), linesOf('one'), linesOf(''), linesOf(' \n ,\n')], [[['a', 'b'], ['1', '2']], [['a', 'b'], ['1', '2']], [['one']], [], []])
})

test('guess: a kind only where every filled cell is one, so nothing is lost; the first row names the columns', () => {
  const { columns, rows } = guess(linesOf('Invoice;Client;Amount;Due;Paid;Mail;Site;Phone\n2026-029;Nord;1 200,00 €;24/11/2026;oui;a@nord.example;nord.example;06 12 34 56 78\n2026-030;Brune;450 €;02/12/2026;non;b@brune.example;https://brune.example;+33 6 98 76 54 32\n2026-031;Nord;2 650,50 €;15/12/2026;oui;;www.nord.example;\n2026-032;Nord;90 €;;non;;;'), how)
  assert.deepEqual(columns.map(({ name, type }) => [name, type]), [['Invoice', 'text'], ['Client', 'select'], ['Amount', 'number'], ['Due', 'date'], ['Paid', 'checkbox'], ['Mail', 'email'], ['Site', 'link'], ['Phone', 'phone']])
  assert.deepEqual([columns[2].format, columns[2].currency, columns[3].time, rows.length, columns[0].sample], ['money', 'EUR', undefined, 4, ['2026-029', '2026-030', '2026-031']])
  // One cell that isn't its kind keeps the column as words.
  assert.deepEqual(kinds('Name,Amount,Due\nA,12,2026-01-02\nB,n/a,soon\nC,7,2026-01-03'), ['text', 'text', 'text'])
})

test('guess: numbers that would lose a zero stay words or a phone, a year is a number, 0 and 1 are numbers, a time makes a date timed, a sign or a code names the currency', () => {
  assert.deepEqual(kinds('Code,Year,Flag,Share\n00123,2024,1,0.5\n04560,2025,0,0.75'), ['text', 'number', 'number', 'number'])
  assert.deepEqual(kinds('Tel\n0612345678\n06.12.34.56.78'), ['phone'])
  const [when, dollars, pounds, plain] = guess(linesOf('When,A,B,C\n2026-11-20 14:30,$12.50,GBP 3,7\n2026-11-21,$8,GBP 4,8'), { ...how, locales: ['en'] }).columns
  assert.deepEqual([when.type, when.time, dollars.currency, pounds.currency, plain.format], ['date', true, 'USD', 'GBP', undefined])
})

test('guess: a choice has few values that come again, never the first column; columns with no name or the same name get one of their own; short lines are filled', () => {
  assert.deepEqual(kinds('Kind,Kind\na,a\nb,b\na,a\nb,b'), ['text', 'select'])
  assert.deepEqual(kinds('N,Each\n1,a\n2,b\n3,c\n4,d'), ['number', 'text'])
  const { columns, rows } = guess([['Name', '', 'name'], ['a'], ['b', 'x', 'y']], how)
  assert.deepEqual([columns.map(({ name }) => name), rows], [['Name', 'Column 2', 'name 2'], [['a', '', ''], ['b', 'x', 'y']]])
  assert.deepEqual(guess([], how), { columns: [], rows: [] })
})

test('off: how many filled cells a kind picked instead would leave empty', () => {
  const { columns, rows } = guess(linesOf('Name,Paid\nA,oui\nB,non\nC,en partie\nD,'), how)
  assert.deepEqual([columns[1].type, off('checkbox', rows, 1, how), off('number', rows, 1, how), off('text', rows, 1, how), off('select', rows, 1, how)], ['text', 1, 3, 0, 0])
})

test('specOf and the starting points: each makes tables that Tables takes, a status with its three steps, money in the currency given, a relation to the table before', () => {
  const { columns } = guess(linesOf('Name;Amount;When\nA;3 €;2026-01-02 10:00'), how)
  const table = createTable(specOf('Mine', columns.map((column, i) => (i ? column : { ...column, type: 'text' }))), { id: '01JD0000000000000000000000', author: 'user', at: '2026-11-20T10:00:00.000Z' })
  assert.deepEqual(table.properties.map(({ name, type, format, currency, time }) => [name, type, format, currency, time]), [['Name', 'text', undefined, undefined, undefined], ['Amount', 'number', 'money', 'EUR', undefined], ['When', 'date', undefined, undefined, true]])
  assert.deepEqual(STARTS.map(({ id }) => id), ['jobs', 'spending', 'clients', 'todo', 'stock'])
  for (const start of STARTS) {
    const specs = started(start, (key) => key, 'JPY')
    for (const spec of specs) {
      const made = createTable({ ...spec, columns: spec.columns.map((column) => (column.collection === 0 ? { ...column, collection: 'collections/01JD0000000000000000000000-clients' } : column)) }, { id: '01JD0000000000000000000001', author: 'user', at: '2026-11-20T10:00:00.000Z' })
      assert.equal(made.properties[0].type, 'text')
      for (const property of made.properties) {
        if (property.type === 'status') assert.deepEqual(property.options?.map(({ name, group }) => [name, group]), [['step.todo', 'todo'], ['step.doing', 'doing'], ['step.done', 'done']])
        if (property.format) assert.deepEqual([property.format, property.currency], ['money', 'JPY'])
      }
    }
  }
  assert.deepEqual(started(STARTS[2], (key) => key, 'EUR').map(({ name, columns }) => [name, columns.find(({ type }) => type === 'relation')?.collection]), [['clients', undefined], ['invoices', 0]])
})
