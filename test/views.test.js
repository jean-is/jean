// SPDX-License-Identifier: MIT
// A view a brain proposes (D755): what Jean makes of what table_view sends, and refuses in words a brain reads; then the multilingual
// set scripts/views.js measures brains on, and how it scores a view by what it shows.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { viewFrom } from '../app/caps/views/views.js'
import { tableView } from '../app/caps/tables/tool.js'
import { reshape, keptViews, tableProblems } from '../app/caps/tables/table.js'
import { fixture, score } from '../scripts/views.js'

const read = async (/** @type {string} */ name) => JSON.parse(await readFile(new URL(`views/${name}.json`, import.meta.url), 'utf8'))
const LANGS = ['en', 'fr', 'ar', 'ja']

test('viewFrom: a view from what a brain sends, its columns by name in any case or by id, its values as their kinds take them', async () => {
  const set = await read('en'), { table } = fixture(set.tables.visits, 1), books = fixture(set.tables.books, 3).table
  assert.deepEqual(viewFrom(table, { table: 'x', name: ' Still to visit ', filter: [{ property: 'stage', op: 'is', value: 'to visit' }] }),
    { name: 'Still to visit', type: 'table', filter: { and: [{ property: 'stage', op: 'is', value: 'To visit' }] } })
  assert.deepEqual(viewFrom(table, { name: 'Cheap', filter: [{ property: 'PRICE', op: 'less than', value: '300000' }], sort: { property: 'Price', direction: 'ascending' } }),
    { name: 'Cheap', type: 'table', filter: { and: [{ property: 'price', op: 'less-than', value: 300000 }] }, sort: [{ property: 'price', direction: 'ascending' }] })
  // A rule alone, other words for a way to compare, a sort the other way, a group and columns hidden.
  assert.deepEqual(viewFrom(table, { name: 'Late', filter: { property: 'Day', op: 'after', value: '2026-11-15' }, sort: [{ property: 'Day', direction: 'desc' }], group: 'Who', hide: ['Photo', 'price'] }),
    { name: 'Late', type: 'table', filter: { and: [{ property: 'day', op: 'greater-than', value: '2026-11-15' }] }, sort: [{ property: 'day', direction: 'descending' }], group: 'who', hidden: ['photo', 'price'] })
  // Whoever looks, a cell empty, a box, a choice among several.
  assert.deepEqual(viewFrom(table, { name: 'Mine', filter: [{ property: 'Who', op: 'is', value: '@Me' }, { property: 'Day', op: 'is-not-empty' }] }).filter,
    { and: [{ property: 'who', op: 'is', value: { me: true } }, { property: 'day', op: 'is-not-empty' }] })
  assert.deepEqual(viewFrom(books, { name: 'Classics', filter: [{ property: 'Genre', op: 'contains', value: 'classic' }] }).filter, { and: [{ property: 'genre', op: 'contains', value: 'Classic' }] })
  assert.deepEqual(viewFrom(fixture(set.tables.expenses, 2).table, { name: 'Unpaid', filter: [{ property: 'Paid', op: 'is', value: 'no' }] }).filter, { and: [{ property: 'paid', op: 'is', value: false }] })
  // Shown as a board, by the group asked for, else by the board's own; as a gallery, a calendar and a timeline where a column makes one.
  assert.deepEqual(viewFrom(table, { name: 'Board', show: 'board' }), { name: 'Board', type: 'board', group: 'stage' })
  assert.deepEqual(viewFrom(table, { name: 'By person', show: 'Board', group: 'Who' }), { name: 'By person', type: 'board', group: 'who' })
  assert.equal(viewFrom(table, { name: 'Photos', show: 'gallery' }).type, 'gallery')
  assert.equal(viewFrom(table, { name: 'Lines', show: 'List' }).type, 'list')
  assert.equal(viewFrom(table, { name: 'Days', show: 'calendar' }).type, 'calendar')
  assert.deepEqual(viewFrom(table, { name: 'Plan', show: 'Timeline', group: 'Who' }), { name: 'Plan', type: 'timeline', group: 'who' })
  // What it makes is a view a collection keeps.
  const kept = reshape(table, { keep: { ...viewFrom(table, { name: 'Cheap', filter: [{ property: 'Price', op: '<', value: 300000 }], show: 'board' }) } }, '2026-11-17T10:00:00.000Z')
  assert.deepEqual([tableProblems(kept), keptViews(kept).map((view) => [view.name, view.type, view.group])], [[], [['Cheap', 'board', 'stage']]])
})

test('viewFrom refuses, in words a brain reads: no name, a column the table hasn\'t, a way to compare or to show that isn\'t one, a value its column doesn\'t take, a layout with nothing to show', async () => {
  const set = await read('en'), { table } = fixture(set.tables.visits, 1), { table: expenses } = fixture(set.tables.expenses, 2)
  const refused = (/** @type {any} */ args, /** @type {RegExp} */ why, one = table) => assert.throws(() => viewFrom(one, args), why)
  refused({}, /Give the view a name/)
  refused({ name: 'A', filter: [{ property: 'Cost', op: 'is', value: 1 }] }, /no column "Cost": its columns are Place, Stage, Price, Who, Day, Photo/)
  refused({ name: 'A', filter: [{ property: 'Price', op: 'near', value: 1 }] }, /"near" isn't a way to compare: use is, is-not/)
  refused({ name: 'A', show: 'chart' }, /"chart" isn't a way to show a table: use table, list, board, gallery, calendar, timeline\./)
  refused({ name: 'A', filter: [{ property: 'Stage', op: 'is', value: 'Sold' }] }, /no choice "Sold": its choices are To visit, Visited, Offer made/)
  refused({ name: 'A', filter: [{ property: 'Price', op: 'is', value: 'cheap' }] }, /holds numbers/)
  refused({ name: 'A', filter: [{ property: 'Day', op: 'before', value: 'December' }] }, /holds dates: compare it with one written as 2026-10-21/)
  refused({ name: 'A', filter: [{ property: 'Price', op: 'is' }] }, /a value to compare with, or use is-empty/)
  refused({ name: 'A', filter: { or: [] } }, /has no "or"/)
  refused({ name: 'A', group: 'Price' }, /grouped by a column of choices, steps, people, boxes or dates: "Price" is number/)
  refused({ name: 'A', show: 'board', group: 'Day' }, /board's lanes/)
  refused({ name: 'A', hide: ['Place'] }, /"Place" names each row/)
  refused({ name: 'A', show: 'gallery' }, /no picture column/, expenses)
  refused({ name: 'A', show: 'calendar' }, /A calendar shows dates: this table has no date column/, reshape(expenses, { remove: 'date' }, '2026-11-17T10:00:00.000Z'))
  refused({ name: 'A', show: 'timeline' }, /A timeline shows dates: this table has no date column/, reshape(expenses, { remove: 'date' }, '2026-11-17T10:00:00.000Z'))
  refused({ name: 'A' }, /whiteboard has no views/, { ...table, kind: 'whiteboard' })
})

test('table_view fits in 400 tokens, and names what Jean takes', () => {
  const spec = tableView()
  assert.ok(Math.ceil(JSON.stringify(spec).length / 4) <= 400, `${JSON.stringify(spec).length} characters`)
  assert.deepEqual(Object.keys(/** @type {any} */ (spec.parameters).properties), ['table', 'name', 'show', 'filter', 'sort', 'group', 'hide'])
})

test('the views set: the same requests in four languages, each with what it should give; a view that shows it scores right, one that doesn\'t says what is off', async () => {
  const expected = await read('expected'), ids = Object.keys(expected)
  assert.equal(ids.filter((id) => !expected[id].none).length, 20)
  assert.equal(ids.filter((id) => expected[id].none).length, 6)
  for (const lang of LANGS) {
    const set = await read(lang), kept = Object.fromEntries(Object.entries(set.tables).map(([key, given], n) => [key, fixture(/** @type {any} */ (given), n + 1)]))
    assert.deepEqual(Object.keys(set.requests), ids, lang)
    assert.deepEqual(Object.keys(set.tables), ['visits', 'expenses', 'books'], lang)
    for (const one of Object.values(kept)) assert.deepEqual([tableProblems(one.table), one.rows.length], [[], 6], lang)
    for (const id of ids) assert.ok(expected[id].none || expected[id].keeps.every((/** @type {number} */ n) => kept[expected[id].table].rows[n - 1]), `${lang} ${id}`)
    // The views a careful brain would send, by the columns' places, score right in every language.
    const { visits, expenses, books } = kept, at = (/** @type {any} */ one, /** @type {number} */ c) => one.table.properties[c].name, choice = (/** @type {any} */ one, /** @type {number} */ c, /** @type {number} */ n) => one.table.properties[c].options[n].name
    const who = { lang, me: set.me }
    const right = /** @type {[string, any, any][]} */ ([
      ['to-visit', visits, { filter: [{ property: at(visits, 1), op: 'is', value: choice(visits, 1, 0) }] }],
      ['cheap', visits, { filter: [{ property: at(visits, 2), op: 'less-than', value: 300000 }], sort: { property: at(visits, 2), direction: 'ascending' } }],
      ['board', visits, { show: 'board', group: at(visits, 1) }],
      ['mine', visits, { filter: [{ property: at(visits, 3), op: 'is', value: '@me' }] }],
      ['calendar', visits, { show: 'calendar' }],
      ['unassigned', visits, { filter: [{ property: at(visits, 3), op: 'is-empty' }] }],
      ['november', visits, { filter: [{ property: at(visits, 4), op: 'at-least', value: '2026-11-01' }, { property: at(visits, 4), op: 'less-than', value: '2026-12-01' }], sort: { property: at(visits, 4) } }],
      ['unpaid', expenses, { filter: [{ property: at(expenses, 3), op: 'is', value: false }], sort: { property: at(expenses, 1), direction: 'descending' } }],
      ['by-category', expenses, { group: at(expenses, 2) }],
      ['not-food', expenses, { filter: [{ property: at(expenses, 2), op: 'is-not', value: choice(expenses, 2, 1) }] }],
      ['unpaid-travel', expenses, { filter: [{ property: at(expenses, 3), op: 'is', value: false }, { property: at(expenses, 2), op: 'is', value: choice(expenses, 2, 0) }] }],
      ['hide-date', expenses, { sort: { property: at(expenses, 0) }, hide: [at(expenses, 4)] }],
      ['read-best', books, { filter: [{ property: at(books, 3), op: 'is', value: choice(books, 3, 2) }], sort: { property: at(books, 4), direction: 'descending' } }],
      ['novels-unread', books, { filter: [{ property: at(books, 2), op: 'contains', value: choice(books, 2, 0) }, { property: at(books, 3), op: 'is-not', value: choice(books, 3, 2) }] }],
      ['unrated', books, { filter: [{ property: at(books, 4), op: 'is-empty' }] }],
      ['classics', books, { filter: [{ property: at(books, 2), op: 'contains', value: choice(books, 2, 3) }] }],
    ])
    for (const [id, one, args] of right) assert.deepEqual(score(one, expected[id], viewFrom(one.table, { name: set.requests[id], ...args }), who), [], `${lang} ${id}`)
    // Another order, other rows, another way to show, no group, a column left shown, a name in another script.
    const off = (/** @type {string} */ id, /** @type {any} */ one, /** @type {any} */ args) => score(one, expected[id], viewFrom(one.table, { name: set.requests[id], ...args }), who)
    assert.match(off('cheap', visits, { filter: [{ property: at(visits, 2), op: 'less-than', value: 300000 }], sort: { property: at(visits, 2), direction: 'descending' } })[0], /^rows 6 5 4 for 4 5 6$/)
    assert.match(off('to-visit', visits, {})[0], /^rows 1 2 3 4 5 6 for 1 3 6$/)
    assert.deepEqual(off('board', visits, { group: at(visits, 1) }), ['shown as a table'])
    assert.deepEqual(off('by-category', expenses, {}), ['grouped by nothing'])
    assert.deepEqual(off('hide-date', expenses, { sort: { property: at(expenses, 0) } }), [`${at(expenses, 4)} not hidden`])
    assert.deepEqual(score(visits, expected.calendar, viewFrom(visits.table, { name: lang === 'ar' || lang === 'ja' ? 'Calendar' : 'カレンダー', show: 'calendar' }), who).length, 1, lang)
  }
})
