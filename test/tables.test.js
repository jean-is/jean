// Tables' engine (D474, D491): a table's collection.json, its changes.jsonl merged cell by cell, queries,
// undo and export; then the multilingual test set scripts/tables.js measures brains on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { readZip } from '../app/core/zip.js'
import { createTable, readTable, tableProblems, checkCell, grown, mergeTables, propertyOf, folderOf, reshape } from '../app/caps/tables/table.js'
import { parseChanges, stringifyChanges, nextAt, stamp, fold, merge, undo } from '../app/caps/tables/changes.js'
import { query, valueOf } from '../app/caps/tables/query.js'
import { toCSV, exportTable } from '../app/caps/tables/export.js'
import { TABLE_CREATE, LINE, EXAMPLES, tableCreate } from '../app/caps/tables/tool.js'
import { score, matchNames, STRICT } from '../scripts/tables.js'
import Ajv from 'ajv'

/** @import { Line } from '../app/caps/tables/changes.js' */

const dec = new TextDecoder()
/** A row's ULID, by number. @param {number} n */
const R = (n) => `01K8${String(n).padStart(22, '0')}`
/** 21 October 2026, 09:00 UTC, plus some minutes. @param {number} minutes */
const T = (minutes) => new Date(Date.UTC(2026, 9, 21, 9, minutes)).toISOString()
const TABLE_ID = '01K85Z1T' + 'A'.padStart(18, '0')

const JOBS = {
  name: 'Job applications',
  columns: [
    { name: 'Company', type: 'text' },
    { name: 'Role', type: 'text' },
    { name: 'Status', type: 'status', options: ['Applied', 'Interview', 'Offer', 'Rejected'] },
    { name: 'Applied on', type: 'date' },
    { name: 'Salary', type: 'number' },
    { name: 'Tags', type: 'multi-select', options: ['Remote', 'Paris', 'Startup'] },
    { name: 'Referral', type: 'checkbox' },
  ],
}
const jobs = () => createTable(JOBS, { id: TABLE_ID, author: 'jean', at: T(0) })

/** One line of changes.jsonl. @param {string} row @param {Record<string, unknown>} set @param {string} at @param {string} [by] @returns {Line} */
const line = (row, set, at, by = 'user') => ({ row, set, at, by })

/** Three applications, as Jean made them. */
const BASE = [
  line(R(1), { company: 'Acme', role: 'Designer', status: 'Applied', 'applied-on': '2026-10-01', salary: 52000, tags: ['Remote'] }, T(1), 'jean'),
  line(R(2), { company: 'Globex', role: 'Writer', status: 'Interview', 'applied-on': '2026-09-20', tags: ['Paris', 'Startup'], referral: true }, T(1), 'jean'),
  line(R(3), { company: 'Initech', role: 'Analyst', status: 'Rejected', 'applied-on': '2026-09-02', salary: 48000 }, T(1), 'jean'),
]

/** The rows' cells, by row. @param {Line[]} lines */
const cells = (lines) => Object.fromEntries(fold(lines).map((row) => [row.id, row.cells]))

// ─── collection.json ──────────────────────────────────────────────────────────────

test('createTable: ids from the first names, status steps in groups, a board for the status, and it reads back', () => {
  const table = jobs()
  assert.equal(table.format, 1)
  assert.equal(table.author, 'jean')
  assert.deepEqual(table.properties.map((p) => p.id), ['company', 'role', 'status', 'applied-on', 'salary', 'tags', 'referral'])
  assert.deepEqual(propertyOf(table, 'status')?.options, [{ name: 'Applied', group: 'todo' }, { name: 'Interview', group: 'doing' }, { name: 'Offer', group: 'doing' }, { name: 'Rejected', group: 'done' }])
  assert.deepEqual(table.views, [{ id: 'table', type: 'table' }, { id: 'board', type: 'board', group: 'status' }])
  assert.deepEqual(readTable(JSON.stringify(table)), table)
  assert.equal(folderOf(table), `collections/${TABLE_ID}-job-applications`)
  assert.deepEqual(tableProblems(table), [])
})

test('createTable: names in any script make ids, the same name twice is refused, and brains’ usual words for types are taken', () => {
  const ja = createTable({ name: '応募管理', columns: [{ name: '会社名', type: 'text' }, { name: '応募日', type: 'date' }, { name: '状況', type: 'status', options: ['応募済み', '面接', '内定', '不採用'] }] }, { id: TABLE_ID, author: 'jean', at: T(0) })
  assert.deepEqual(ja.properties.map((p) => p.id), ['会社名', '応募日', '状況'])
  assert.equal(folderOf(ja), `collections/${TABLE_ID}-collection`)
  const ar = createTable({ name: 'طلبات العمل', columns: [{ name: 'اسم الشركة', type: 'string' }, { name: 'الرابط', type: 'url' }, { name: 'مُحال', type: 'boolean' }, { name: 'الوسوم', type: 'multi_select', options: ['عن بعد'] }] }, { id: TABLE_ID, author: 'jean', at: T(0) })
  assert.deepEqual(ar.properties.map((p) => [p.id, p.type]), [['اسم-الشركة', 'text'], ['الرابط', 'link'], ['مُحال', 'checkbox'], ['الوسوم', 'multi-select']])
  assert.throws(() => createTable({ name: 'x', columns: [{ name: 'Date', type: 'date' }, { name: 'date', type: 'text' }] }, { id: TABLE_ID, author: 'jean', at: T(0) }), /two columns are named "date"/i)
  assert.throws(() => createTable({ name: 'x', columns: [{ name: 'When', type: 'calendar' }] }, { id: TABLE_ID, author: 'jean', at: T(0) }), /When.*calendar.*text, number/)
  assert.throws(() => createTable({ name: '', columns: [] }, { id: TABLE_ID, author: 'jean', at: T(0) }), /name/)
})

test('readTable: says what is wrong with a collection.json, and refuses one a newer Jean made', () => {
  const table = jobs()
  const broken = { ...table, properties: [...table.properties, { id: 'company', name: 'Pay', type: 'money' }, { id: 'stage', name: 'Stage', type: 'status', options: [{ name: 'New', group: 'later' }] }], views: [{ id: 'board', type: 'board', group: 'company' }] }
  const problems = tableProblems(/** @type {any} */ (broken))
  assert.ok(problems.some((p) => /Two columns have the id "company"/.test(p)), problems.join('\n'))
  assert.ok(problems.some((p) => /Pay.*money/.test(p)), problems.join('\n'))
  assert.ok(problems.some((p) => /Stage.*New.*todo, doing or done/.test(p)), problems.join('\n'))
  assert.ok(problems.some((p) => /board.*select or status/.test(p)), problems.join('\n'))
  assert.throws(() => readTable(JSON.stringify(broken)), /money/)
  assert.throws(() => readTable(JSON.stringify({ ...table, format: 2 })), /newer/)
  assert.throws(() => readTable('{'), /JSON/)
})

test('checkCell: each type takes its own values, and nothing can be set in a column Jean works out', () => {
  const table = createTable({ name: 'All', columns: [
    { name: 'Name', type: 'text' }, { name: 'Count', type: 'number' }, { name: 'Kind', type: 'select', options: ['A', 'B'] },
    { name: 'Labels', type: 'multi-select', options: ['x', 'y'] }, { name: 'Step', type: 'status', options: ['To do', 'Done'] },
    { name: 'Due', type: 'date' }, { name: 'Done', type: 'checkbox' }, { name: 'Site', type: 'link' }, { name: 'Mail', type: 'email' },
    { name: 'Phone', type: 'phone' }, { name: 'Who', type: 'person' }, { name: 'Where', type: 'place' }, { name: 'Papers', type: 'files' },
    { name: 'Added', type: 'created-at' },
  ] }, { id: TABLE_ID, author: 'jean', at: T(0) })
  const ok = /** @type {[string, unknown][]} */ ([['name', 'Hi'], ['count', -2.5], ['kind', 'B'], ['labels', ['x', 'y']], ['step', 'Done'], ['due', '2026-10-21'], ['due', '2026-10-21T14:30'],
    ['done', false], ['site', 'https://jean.is/'], ['mail', 'ana@example.org'], ['phone', '+33 6 12 34 56 78'], ['who', 'Ana'], ['where', 'Lyon'],
    ['where', { name: 'Gare de Lyon', lat: 48.84, lon: 2.37 }], ['papers', [{ name: 'CV.pdf', file: 'attachments/ab12.pdf' }]], ['count', null],
    ['kind', 'C'], ['labels', ['z']]])
  for (const [id, value] of ok) assert.equal(checkCell(/** @type {any} */ (propertyOf(table, id)), value), null, `${id} takes ${JSON.stringify(value)}`)
  const wrong = /** @type {[string, unknown][]} */ ([['name', 3], ['count', '3'], ['count', Infinity], ['kind', ' '], ['labels', 'x'], ['labels', [3]], ['step', 'Doing'],
    ['due', '21/10/2026'], ['due', '2026-02-30'], ['done', 'yes'], ['site', 'javascript:alert(1)'], ['mail', 'ana'], ['phone', 'call me'], ['papers', ['CV.pdf']], ['added', T(0)]])
  for (const [id, value] of wrong) assert.notEqual(checkCell(/** @type {any} */ (propertyOf(table, id)), value), null, `${id} refuses ${JSON.stringify(value)}`)
  assert.match(String(checkCell(/** @type {any} */ (propertyOf(table, 'step')), 'Doing')), /To do, Done/)
})

test('a status a brain gives fewer than two steps is a select, a board groups by it, and a select’s choices grow as values come (D491)', () => {
  const table = createTable({ name: 'Reading', columns: [{ name: 'Book', type: 'text' }, { name: 'Status', type: 'status' }, { name: 'Shelf', type: 'select', options: ['Home'] }] }, { id: TABLE_ID, author: 'jean', at: T(0) })
  assert.deepEqual(propertyOf(table, 'status'), { id: 'status', name: 'Status', type: 'select', options: [] })
  assert.deepEqual(table.views.at(-1), { id: 'board', type: 'board', group: 'status' })
  assert.equal(checkCell(/** @type {any} */ (propertyOf(table, 'status')), 'Reading'), null)
  const more = grown(table, [{ book: 'Dune', status: 'Reading', shelf: 'Home' }, { status: 'Done', shelf: 'Office' }, { status: 'Reading' }], T(5))
  assert.deepEqual(more?.properties.map((property) => property.options?.map((option) => option.name)), [undefined, ['Reading', 'Done'], ['Home', 'Office']])
  assert.equal(more?.changed, T(5))
  assert.equal(grown(/** @type {any} */ (more), [{ status: 'Done', shelf: 'Home' }], T(6)), null)
  assert.equal(createTable({ name: 'One', columns: [{ name: 'Step', type: 'status', options: ['Only'] }] }, { id: TABLE_ID, author: 'jean', at: T(0) }).properties[0].type, 'select')
})

test('reshape: the user renames a table, adds a column of a kind, renames one and takes one away, a name another has numbered, the last column kept (D494)', () => {
  const table = createTable({ name: 'Nouveau tableau', columns: [{ name: 'Nom', type: 'text' }] }, { id: TABLE_ID, author: 'user', at: T(0) })
  let next = reshape(table, { name: '  Voyages ', add: { name: 'Date', type: 'date' } }, T(1))
  assert.equal(next.name, 'Voyages')
  assert.deepEqual(next.properties.map((p) => [p.id, p.name, p.type]), [['nom', 'Nom', 'text'], ['date', 'Date', 'date']])
  assert.equal(next.changed, T(1))
  assert.deepEqual(tableProblems(next), [])
  // A second column of a kind takes a number; a choice added groups a board, which a second doesn't change.
  next = reshape(reshape(next, { add: { name: 'Date', type: 'date' } }, T(2)), { add: { name: 'Choix', type: 'select' } }, T(3))
  assert.deepEqual(next.properties.map((p) => p.name), ['Nom', 'Date', 'Date 2', 'Choix'])
  assert.deepEqual(next.views.at(-1), { id: 'board', type: 'board', group: 'choix' })
  assert.equal(reshape(next, { add: { name: 'Choix', type: 'select' } }, T(4)).views.length, 2)
  // Renamed to another's name, numbered; to nothing, unchanged; its id never changes.
  next = reshape(reshape(next, { rename: { id: 'date-2', name: 'Retour' } }, T(5)), { rename: { id: 'nom', name: 'Date' } }, T(6))
  assert.deepEqual(next.properties.map((p) => [p.id, p.name]), [['nom', 'Date 2'], ['date', 'Date'], ['date-2', 'Retour'], ['choix', 'Choix']])
  assert.equal(reshape(next, { rename: { id: 'nom', name: '  ' }, name: '' }, T(7)).properties[0].name, 'Date 2')
  // Taken away, it stays in collection.json as removed, its id never given again; the last one stays.
  next = reshape(reshape(next, { remove: 'date' }, T(8)), { add: { name: 'Date', type: 'date' } }, T(9))
  assert.equal(propertyOf(next, 'date')?.deleted, T(8))
  assert.deepEqual(next.properties.filter((p) => !p.deleted).map((p) => [p.id, p.name]), [['nom', 'Date 2'], ['date-2', 'Retour'], ['choix', 'Choix'], ['date-3', 'Date']])
  assert.deepEqual(tableProblems(next), [])
  const one = reshape(table, { remove: 'nom' }, T(10))
  assert.equal(one.properties[0].deleted, undefined)
  assert.throws(() => reshape(table, { add: { name: 'X', type: 'colour' } }, T(11)), /isn't a kind of column/)
})

test('mergeTables: two copies that each added a column keep both; the same column changed on both, the newer copy’s wins; a removed column stays removed', () => {
  const base = jobs()
  const a = { ...base, changed: T(10), properties: [...base.properties, { id: 'recruiter', name: 'Recruiter', type: /** @type {const} */ ('person') }] }
  const b = { ...base, changed: T(11), properties: [...base.properties.map((p) => (p.id === 'role' ? { ...p, name: 'Position' } : p.id === 'salary' ? { ...p, deleted: T(11) } : p)), { id: 'link', name: 'Link', type: /** @type {const} */ ('link') }] }
  const merged = mergeTables(a, b)
  assert.deepEqual(merged, mergeTables(b, a))
  assert.deepEqual(merged.properties.map((p) => p.id), ['company', 'role', 'status', 'applied-on', 'salary', 'tags', 'referral', 'link', 'recruiter'])
  assert.equal(propertyOf(merged, 'role')?.name, 'Position')
  assert.equal(propertyOf(merged, 'salary')?.deleted, T(11))
  assert.equal(merged.changed, T(11))
  // An option added on each copy: both stay, so no cell's value loses its option.
  const c = { ...base, changed: T(12), properties: base.properties.map((p) => (p.id === 'tags' ? { ...p, options: [...(p.options ?? []), { name: 'Lyon' }] } : p)) }
  const d = { ...base, changed: T(13), properties: base.properties.map((p) => (p.id === 'tags' ? { ...p, options: [...(p.options ?? []), { name: 'Berlin' }] } : p)) }
  assert.deepEqual(propertyOf(mergeTables(c, d), 'tags')?.options?.map((o) => o.name), ['Remote', 'Paris', 'Startup', 'Berlin', 'Lyon'])
})

// ─── changes.jsonl ───────────────────────────────────────────────────────────

test('parseChanges: a line per change, a half-written last line and lines that aren’t changes are left out', () => {
  const text = `${stringifyChanges(BASE)}{"row":"${R(4)}","set":{"company":"Hoo`
  assert.deepEqual(parseChanges(text), BASE)
  assert.deepEqual(parseChanges(`${JSON.stringify(BASE[0])}\nnot json\n{"row":"${R(5)}","at":"yesterday","by":"user","set":{}}\n{"at":"${T(2)}","by":"user","set":{}}\n`), [BASE[0]])
  assert.equal(stringifyChanges([]), '')
})

test('fold: each cell is its latest change, rows come in the order they were made, each with who made and changed it when', () => {
  const lines = [...BASE, line(R(1), { status: 'Interview' }, T(3)), line(R(1), { status: 'Offer', salary: 55000 }, T(5), 'jean'), line(R(1), { status: 'Rejected' }, T(4))]
  const rows = fold(lines)
  assert.deepEqual(rows.map((row) => row.id), [R(1), R(2), R(3)])
  assert.equal(rows[0].cells.status, 'Offer')
  assert.equal(rows[0].cells.salary, 55000)
  assert.deepEqual(rows[0].created, { at: T(1), by: 'jean' })
  assert.deepEqual(rows[0].changed, { at: T(5), by: 'jean' })
  assert.deepEqual(rows[0].stamps.role, { at: T(1), by: 'jean' })
  // In any order, the same rows.
  assert.deepEqual(fold([...lines].reverse()), rows)
  // null clears a cell.
  assert.equal('salary' in cells([...lines, line(R(1), { salary: null }, T(6))])[R(1)], false)
})

test('nextAt and stamp: a change is stamped after every change the copy has seen, even when its clock is behind, and a change’s lines share their stamp', () => {
  assert.equal(nextAt([], Date.parse(T(7))), T(7))
  assert.equal(nextAt(BASE, Date.parse(T(0))), new Date(Date.parse(T(1)) + 1).toISOString())
  const lines = stamp(BASE, [{ row: R(1), set: { status: 'Interview' } }, { row: R(2), delete: true }], { by: 'jean', now: Date.parse(T(2)), why: 'The user said Acme called back and Globex is closed.' })
  assert.deepEqual(lines, [
    { row: R(1), set: { status: 'Interview' }, at: T(2), by: 'jean', why: 'The user said Acme called back and Globex is closed.' },
    { row: R(2), delete: true, at: T(2), by: 'jean', why: 'The user said Acme called back and Globex is closed.' },
  ])
})

test('merge: two copies edited offline at the same time keep every change, whichever merges into which, and merging again changes nothing', () => {
  // Synced, then each copy goes on alone.
  const a = [...BASE, ...stamp(BASE, [{ row: R(1), set: { role: 'Lead designer' } }, { row: R(4), set: { company: 'Umbrella', status: 'Applied' } }], { by: 'user', now: Date.parse(T(10)) })]
  const b = [...BASE, ...stamp(BASE, [{ row: R(1), set: { salary: 60000 } }, { row: R(5), set: { company: 'Hooli', status: 'Applied' } }], { by: 'jean', now: Date.parse(T(10)) })]
  const merged = merge(a, b)
  assert.deepEqual(merged, merge(b, a))
  assert.deepEqual(merge(merged, a), merged)
  assert.deepEqual(merge(a, a), merge(a, []))
  assert.equal(merged.length, BASE.length + 4)
  const rows = cells(merged)
  // Made at the same moment, the rows come in their authors' order.
  assert.deepEqual(Object.keys(rows), [R(1), R(2), R(3), R(5), R(4)])
  assert.equal(rows[R(1)].role, 'Lead designer')
  assert.equal(rows[R(1)].salary, 60000)
  // A line written by hand, its keys in another order, is the same line.
  assert.equal(merge(merged, [JSON.parse(JSON.stringify({ by: 'jean', at: T(1), set: BASE[0].set, row: R(1) }))]).length, merged.length)
})

test('merge: the same cell edited on both copies, the later change wins; at the same moment, the author, then the value, settle it the same way everywhere', () => {
  const a = [...BASE, line(R(1), { status: 'Interview' }, T(10))]
  const b = [...BASE, line(R(1), { status: 'Rejected' }, T(11))]
  assert.equal(cells(merge(a, b))[R(1)].status, 'Rejected')
  assert.equal(cells(merge(b, a))[R(1)].status, 'Rejected')
  // At the same millisecond: 'user' comes after 'jean'.
  const c = [...BASE, line(R(1), { status: 'Offer' }, T(12), 'user')]
  const d = [...BASE, line(R(1), { status: 'Interview' }, T(12), 'jean')]
  assert.equal(cells(merge(c, d))[R(1)].status, 'Offer')
  assert.equal(cells(merge(d, c))[R(1)].status, 'Offer')
  // The same author on two devices at the same millisecond: the greater value, as JSON.
  const e = [...BASE, line(R(1), { status: 'Interview' }, T(12))]
  const f = [...BASE, line(R(1), { status: 'Applied' }, T(12))]
  assert.equal(cells(merge(e, f))[R(1)].status, 'Interview')
  assert.equal(cells(merge(f, e))[R(1)].status, 'Interview')
})

test('merge: a row deleted on one copy and edited on the other stays deleted if the edit came first, and comes back whole if it came after', () => {
  const deleted = [...BASE, { row: R(1), delete: true, at: T(20), by: 'user' }]
  const before = [...BASE, line(R(1), { status: 'Interview' }, T(15), 'jean')]
  const merged = merge(deleted, before)
  assert.deepEqual(fold(merged).map((row) => row.id), [R(2), R(3)])
  // The edit is kept: undoing the deletion brings the row back with it.
  const back = merge(merged, /** @type {NonNullable<ReturnType<typeof undo>>} */ (undo(merged, { author: 'user', by: 'user', now: Date.parse(T(21)) })).lines)
  assert.equal(cells(back)[R(1)].status, 'Interview')
  assert.equal(cells(back)[R(1)].company, 'Acme')
  const after = [...BASE, line(R(1), { status: 'Offer' }, T(25), 'jean')]
  const again = cells(merge(deleted, after))
  assert.deepEqual(Object.keys(again), [R(1), R(2), R(3)])
  assert.deepEqual(again[R(1)], { ...BASE[0].set, status: 'Offer' })
  assert.deepEqual(fold(merged, { deleted: true }).find((row) => row.id === R(1))?.deleted, { at: T(20), by: 'user' })
  assert.equal(fold(merge(deleted, after), { deleted: true }).find((row) => row.id === R(1))?.deleted, undefined)
})

test('merge: with a clock behind, a copy’s change after it saw another’s still wins; with a clock a year ahead, its change wins only until the others have seen it', () => {
  const synced = [...BASE, line(R(1), { status: 'Interview' }, T(60))]
  // Two hours behind, ten minutes after it got the change above.
  const behind = stamp(synced, [{ row: R(1), set: { status: 'Offer' } }], { by: 'user', now: Date.parse(T(60)) - 2 * 3600e3 + 600e3 })
  assert.equal(cells([...synced, ...behind])[R(1)].status, 'Offer')
  assert.ok(behind[0].at > T(60))
  // A year ahead: it wins over what was done meanwhile elsewhere…
  const ahead = stamp(BASE, [{ row: R(1), set: { status: 'Rejected' } }], { by: 'jean', now: Date.parse('2027-10-21T09:00:00.000Z') })
  const meanwhile = [...BASE, line(R(1), { status: 'Offer' }, T(30))]
  const merged = merge([...BASE, ...ahead], meanwhile)
  assert.equal(cells(merged)[R(1)].status, 'Rejected')
  // …and a change made once it is seen wins over it.
  const later = stamp(merged, [{ row: R(1), set: { status: 'Offer' } }], { by: 'user', now: Date.parse(T(40)) })
  assert.equal(cells([...merged, ...later])[R(1)].status, 'Offer')
})

test('undo: an author’s latest change goes back, then the one before; a cell changed since by someone else stays as it is', () => {
  let lines = stamp([], [{ row: R(1), set: { company: 'Acme', status: 'Applied' } }], { by: 'jean', now: Date.parse(T(1)) })
  lines.push(...stamp(lines, [{ row: R(1), set: { role: 'Designer' } }], { by: 'user', now: Date.parse(T(2)) }))
  lines.push(...stamp(lines, [{ row: R(1), set: { status: 'Interview' } }, { row: R(2), set: { company: 'Globex' } }], { by: 'jean', now: Date.parse(T(3)) }))
  const first = undo(lines, { author: 'jean', by: 'user', now: Date.parse(T(4)) })
  assert.ok(first)
  assert.deepEqual(first.skipped, [])
  assert.ok(first.lines.every((l) => l.undoes === T(3) && l.by === 'user'))
  lines = [...lines, ...first.lines]
  assert.deepEqual(cells(lines), { [R(1)]: { company: 'Acme', status: 'Applied', role: 'Designer' } })
  // Then Jean's first change: the row stays, as the user wrote in it since.
  const second = undo(lines, { author: 'jean', by: 'user', now: Date.parse(T(5)) })
  assert.ok(second)
  lines = [...lines, ...second.lines]
  assert.deepEqual(cells(lines), { [R(1)]: { role: 'Designer' } })
  assert.equal(undo(lines, { author: 'jean', by: 'user', now: Date.parse(T(6)) }), null)
  // A change whose cell the user changed since: that cell is left.
  lines.push(...stamp(lines, [{ row: R(1), set: { status: 'Offer', salary: 50000 } }], { by: 'jean', now: Date.parse(T(7)) }))
  lines.push(...stamp(lines, [{ row: R(1), set: { status: 'Rejected' } }], { by: 'user', now: Date.parse(T(8)) }))
  const third = undo(lines, { author: 'jean', by: 'user', now: Date.parse(T(9)) })
  assert.deepEqual(third?.skipped, [{ row: R(1), property: 'status' }])
  assert.deepEqual(cells([...lines, ...(third?.lines ?? [])])[R(1)], { role: 'Designer', status: 'Rejected' })
  // A row Jean made and nobody touched since goes; a deletion undone brings the row back.
  const made = stamp([], [{ row: R(9), set: { company: 'Wayne' } }], { by: 'jean', now: Date.parse(T(1)) })
  assert.deepEqual(fold([...made, ...(undo(made, { author: 'jean', by: 'user', now: Date.parse(T(2)) })?.lines ?? [])]), [])
})

// ─── Queries ─────────────────────────────────────────────────────────────────

test('query: filters by a column’s id or name, any case, with and and or', () => {
  const table = jobs()
  const rows = fold(BASE)
  const ids = (/** @type {any} */ filter) => /** @type {{ rows: { id: string }[] }} */ (query(table, rows, { filter })).rows.map((row) => row.id)
  assert.deepEqual(ids({ property: 'Status', op: 'is', value: 'interview' }), [R(2)])
  assert.deepEqual(ids({ property: 'company', op: 'contains', value: 'AC' }), [R(1)])
  assert.deepEqual(ids({ property: 'company', op: 'does-not-contain', value: 'ac' }), [R(2), R(3)])
  assert.deepEqual(ids({ property: 'tags', op: 'contains', value: 'Startup' }), [R(2)])
  assert.deepEqual(ids({ property: 'salary', op: 'at-least', value: 50000 }), [R(1)])
  assert.deepEqual(ids({ property: 'salary', op: 'is-empty' }), [R(2)])
  assert.deepEqual(ids({ property: 'applied-on', op: 'less-than', value: '2026-09-30' }), [R(2), R(3)])
  assert.deepEqual(ids({ property: 'referral', op: 'is', value: true }), [R(2)])
  assert.deepEqual(ids({ property: 'referral', op: 'is', value: false }), [R(1), R(3)])
  assert.deepEqual(ids({ or: [{ property: 'status', op: 'is', value: 'Rejected' }, { property: 'tags', op: 'contains', value: 'Remote' }] }), [R(1), R(3)])
  assert.deepEqual(ids({ and: [{ property: 'salary', op: 'is-not-empty' }, { property: 'status', op: 'is-not', value: 'Rejected' }] }), [R(1)])
  assert.throws(() => ids({ property: 'Pay', op: 'is', value: 1 }), /no column "Pay".*Company, Role, Status/)
  assert.throws(() => ids({ property: 'salary', op: 'around', value: 1 }), /around/)
})

test('query: sorts by steps in their order, numbers and dates, text as the language sorts it, empty cells last', () => {
  const table = jobs()
  const rows = fold([...BASE, line(R(4), { company: 'Éclair', status: 'Offer' }, T(2)), line(R(5), { company: 'eau' }, T(2)), line(R(6), { company: 'Zèbre 10', status: 'Applied' }, T(2)), line(R(7), { company: 'Zèbre 9', status: 'Applied' }, T(2))])
  const ids = (/** @type {any} */ sort, locale = 'fr') => /** @type {{ rows: { id: string }[] }} */ (query(table, rows, { sort, locale })).rows.map((row) => row.id)
  assert.deepEqual(ids([{ property: 'status' }]), [R(1), R(6), R(7), R(2), R(4), R(3), R(5)])
  assert.deepEqual(ids([{ property: 'salary', direction: 'descending' }]), [R(1), R(3), R(2), R(4), R(5), R(6), R(7)])
  assert.deepEqual(ids([{ property: 'company' }]), [R(1), R(5), R(4), R(2), R(3), R(7), R(6)])
  assert.deepEqual(ids([{ property: 'status' }, { property: 'company', direction: 'descending' }]), [R(6), R(7), R(1), R(2), R(4), R(3), R(5)])
  assert.deepEqual(ids([{ property: 'applied-on' }]), [R(3), R(2), R(1), R(4), R(5), R(6), R(7)])
})

test('query: groups by step with every step there, by the steps’ groups, a row in each of its labels, empty last', () => {
  const table = jobs()
  const rows = fold([...BASE, line(R(4), { company: 'Hooli' }, T(2))])
  /** @param {any} group */
  const groups = (group) => /** @type {{ groups: { value: unknown, rows: { id: string }[] }[] }} */ (query(table, rows, { group })).groups.map((g) => [g.value, g.rows.map((row) => row.id)])
  assert.deepEqual(groups({ property: 'status' }), [['Applied', [R(1)]], ['Interview', [R(2)]], ['Offer', []], ['Rejected', [R(3)]], [null, [R(4)]]])
  assert.deepEqual(groups({ property: 'status', by: 'group' }), [['todo', [R(1)]], ['doing', [R(2)]], ['done', [R(3)]], [null, [R(4)]]])
  assert.deepEqual(groups({ property: 'tags' }), [['Remote', [R(1)]], ['Paris', [R(2)]], ['Startup', [R(2)]], [null, [R(3), R(4)]]])
  assert.deepEqual(groups({ property: 'referral' }), [[false, [R(1), R(3), R(4)]], [true, [R(2)]]])
  assert.deepEqual(groups({ property: 'role' }), [['Analyst', [R(3)]], ['Designer', [R(1)]], ['Writer', [R(2)]], [null, [R(4)]]])
})

test('valueOf: who made a row and changed it, and when, an unticked box false and an empty cell null', () => {
  const companies = createTable({ name: 'Companies', columns: [{ name: 'Name', type: 'text' }, { name: 'Made by', type: 'created-by' }, { name: 'Changed', type: 'changed-at' }, { name: 'Client', type: 'checkbox' }, { name: 'City', type: 'text' }] }, { id: TABLE_ID, author: 'jean', at: T(0) })
  assert.deepEqual(tableProblems(companies), [])
  const [acme] = fold([line(R(1), { name: 'Acme' }, T(1), 'jean'), line(R(1), { name: 'Acme Inc.' }, T(2))])
  const column = (/** @type {string} */ ref) => /** @type {any} */ (propertyOf(companies, ref))
  assert.equal(valueOf(acme, column('made-by')), 'jean')
  assert.equal(valueOf(acme, column('changed')), T(2))
  assert.equal(valueOf(acme, column('client')), false)
  assert.equal(valueOf(acme, column('city')), null)
})

// ─── Export ──────────────────────────────────────────────────────────────────

test('toCSV: the columns’ names, then a row a line, quoted where needed, labels and ticks as words, a formula never', () => {
  const table = jobs()
  const rows = fold([...BASE, line(R(4), { company: '=HYPERLINK("http://x.example")', role: 'Writer, "senior"\nremote', salary: -5 }, T(2))])
  const csv = toCSV(table, rows, { labels: { yes: 'Yes', no: 'No' } })
  assert.equal(csv, [
    'Company,Role,Status,Applied on,Salary,Tags,Referral',
    'Acme,Designer,Applied,2026-10-01,52000,Remote,No',
    'Globex,Writer,Interview,2026-09-20,,"Paris, Startup",Yes',
    'Initech,Analyst,Rejected,2026-09-02,48000,,No',
    '"\'=HYPERLINK(""http://x.example"")","Writer, ""senior""\nremote",,,-5,,No',
    '',
  ].join('\r\n'))
})

test('exportTable: a CSV Excel reads as UTF-8, and a workbook with numbers as numbers, dates as dates, right to left in Arabic', async () => {
  const table = jobs()
  const rows = fold(BASE)
  const csv = await exportTable(table, rows, 'csv')
  assert.equal(csv.name, 'Job applications.csv')
  assert.deepEqual([...csv.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf])
  const book = await exportTable(table, rows, 'xlsx')
  assert.equal(book.name, 'Job applications.xlsx')
  const parts = Object.fromEntries(await Promise.all(readZip(book.bytes).map(async (entry) => [entry.name, dec.decode(await entry.read())])))
  assert.match(parts['xl/workbook.xml'], /<sheet name="Job applications"/)
  const sheet = parts['xl/worksheets/sheet1.xml']
  assert.match(sheet, /<c r="E2"><v>52000<\/v><\/c>/)
  assert.match(sheet, /<c r="D2" s="4"><v>\d+<\/v><\/c>/)
  assert.match(parts['xl/sharedStrings.xml'], /Paris, Startup/)
  const ar = createTable({ name: 'طلبات العمل', columns: [{ name: 'الشركة', type: 'text' }, { name: 'الحالة', type: 'status', options: ['تم التقديم', 'مقابلة'] }] }, { id: TABLE_ID, author: 'jean', at: T(0) })
  const arBook = await exportTable(ar, fold([line(R(1), { 'الشركة': 'أكمي', 'الحالة': 'مقابلة' }, T(1))]), 'xlsx')
  const arSheet = dec.decode(await /** @type {any} */ (readZip(arBook.bytes).find((entry) => entry.name === 'xl/worksheets/sheet1.xml')).read())
  assert.match(arSheet, /rightToLeft="1"/)
})

// ─── The brain's tool ────────────────────────────────────────────────────────

test('table_create: a capability line within 40 tokens, a tool that names every type a brain may make, its example in the user’s language, and what it sends makes a table', () => {
  assert.equal(LINE.name, TABLE_CREATE.name)
  assert.ok(Math.ceil(`- ${LINE.name}: ${LINE.line}`.length / 4) <= 40, LINE.line)
  const types = /** @type {any} */ (TABLE_CREATE.parameters).properties.columns.items.properties.type.enum
  assert.deepEqual(types, ['text', 'number', 'select', 'multi-select', 'status', 'date', 'checkbox', 'link', 'email', 'phone', 'person', 'place', 'files'])
  for (const [lang, example] of Object.entries(EXAMPLES)) {
    assert.ok(tableCreate(lang).description.endsWith(JSON.stringify(example)), lang)
    assert.ok(Math.ceil(JSON.stringify(tableCreate(lang)).length / 4) <= 400, `${lang}: ${JSON.stringify(tableCreate(lang)).length} characters`)
    assert.deepEqual(tableProblems(createTable(example, { id: TABLE_ID, author: 'jean', at: T(0) })), [], lang)
  }
  assert.equal(tableCreate('sw').description, TABLE_CREATE.description)
})

test('STRICT: the schema a brain’s reply is held to takes what Jean takes, refuses what Jean refuses, and asks a select for its choices', () => {
  const valid = new Ajv().compile(STRICT)
  const made = { id: TABLE_ID, author: 'jean', at: T(0) }
  const books = { name: 'Books', columns: [{ name: 'Title', type: 'text' }, { name: 'Read', type: 'status', options: ['To read', 'Read'] }, { name: 'Tags', type: 'multi-select', options: ['Novel'] }] }
  assert.equal(valid(books), true, JSON.stringify(valid.errors))
  assert.ok(createTable(books, made))
  for (const columns of [[], [{ name: 'Seen', type: 'radio' }], [{ name: '', type: 'text' }]]) {
    assert.throws(() => createTable({ ...books, columns }, made))
    assert.equal(valid({ ...books, columns }), false, JSON.stringify(columns))
  }
  assert.equal(valid({ ...books, name: '' }), false)
  // Stricter than Jean: a select without choices yet, a status of one step (Jean's select), choices on a text column, keys Jean leaves aside.
  for (const table of [{ ...books, columns: [{ name: 'Kind', type: 'select' }] }, { ...books, columns: [{ name: 'Read', type: 'status', options: ['Read'] }] },
    { ...books, columns: [{ name: 'Title', type: 'text', options: ['x'] }] }, { ...books, rows: [] }]) {
    assert.ok(createTable(table, made))
    assert.equal(valid(table), false, JSON.stringify(table))
  }
})

// ─── The multilingual test set ───────────────────────────────────────────────

const SET = new URL('./tables/', import.meta.url)
const english = JSON.parse(await readFile(new URL('en.json', SET), 'utf8'))
const langs = (await readdir(SET)).filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5))

test('the test set: at least 12 requests in English, French, Arabic and Japanese, each with the table it should give', () => {
  assert.deepEqual(langs.sort(), ['ar', 'en', 'fr', 'ja'])
  assert.ok(Object.keys(english.requests).length >= 12)
  assert.deepEqual(Object.keys(english.tables).sort(), Object.keys(english.requests).sort())
  const types = new Set(/** @type {any} */ (TABLE_CREATE.parameters).properties.columns.items.properties.type.enum)
  for (const [id, expected] of Object.entries(english.tables)) {
    for (const property of /** @type {any[]} */ (expected)) {
      for (const type of [property.type, ...(property.also ?? [])].flat()) assert.ok(types.has(type), `${id}: ${type}`)
      assert.ok(property.names.length, id)
    }
  }
})

for (const lang of ['fr', 'ar', 'ja']) {
  test(`the test set in ${lang}: every request translated, with the names of its columns and steps`, async () => {
    const set = JSON.parse(await readFile(new URL(`${lang}.json`, SET), 'utf8'))
    assert.deepEqual(Object.keys(set.requests).sort(), Object.keys(english.requests).sort())
    for (const [id, text] of Object.entries(english.requests)) {
      assert.ok(typeof set.requests[id] === 'string' && set.requests[id].trim() && set.requests[id] !== text, `${lang} ${id} is translated`)
      assert.equal(set.tables[id]?.length, english.tables[id].length, `${lang} ${id} names every column`)
      set.tables[id].forEach((/** @type {any} */ property, /** @type {number} */ i) => {
        assert.ok(property.names.length, `${lang} ${id} ${i}`)
        assert.equal(property.options?.length, english.tables[id][i].options?.length, `${lang} ${id} ${i} options`)
      })
    }
  })
}

test('score: names matched across forms and scripts, types and steps checked, extra columns allowed', () => {
  assert.deepEqual(matchNames(['date', 'applied'], ['Company', 'Date applied', 'Role']), 1)
  assert.equal(matchNames(['société', 'entreprise'], ['Entreprise ciblée']), 0)
  assert.equal(matchNames(['الشركة'], ['اسم الشركة']), 0)
  assert.equal(matchNames(['会社'], ['会社名']), 0)
  assert.equal(matchNames(['رفض', 'مرفوض'], ['مَرفوض']), 0)
  const expected = [
    { names: ['company', 'employer'], type: 'text' },
    { names: ['status', 'stage'], type: 'status', also: ['select'], options: [{ names: ['applied'] }, { names: ['interview'] }, { names: ['offer'] }, { names: ['rejected', 'declined'] }] },
    { names: ['date', 'applied'], type: 'date' },
  ]
  const good = score(expected, { name: 'Jobs', columns: [{ name: 'Employer', type: 'text' }, { name: 'Stage', type: 'select', options: ['Applied', 'Interviewing', 'Offer received', 'Declined', 'Ghosted'] }, { name: 'Applied', type: 'date' }, { name: 'Notes', type: 'text' }] })
  assert.equal(good.correct, true, JSON.stringify(good))
  const wrongType = score(expected, { name: 'Jobs', columns: [{ name: 'Company', type: 'text' }, { name: 'Status', type: 'text' }, { name: 'Date', type: 'date' }] })
  assert.equal(wrongType.correct, false)
  assert.deepEqual(wrongType.misses, ['Status: text'])
  const missing = score(expected, { name: 'Jobs', columns: [{ name: 'Company', type: 'text' }, { name: 'Status', type: 'status', options: ['Applied', 'Done'] }] })
  assert.equal(missing.correct, false)
  assert.deepEqual(missing.misses, ['Status: steps interview, offer, rejected', 'no date'])
  // Two columns the names fit: the one whose steps are those wanted, before the one named first.
  const cycle = [{ names: ['頻度', 'サイクル'], type: 'select', options: [{ names: ['月'] }, { names: ['年'] }] }]
  assert.equal(score(cycle, { name: 'サブスク', columns: [{ name: '利用頻度', type: 'select', options: ['毎日', '週に数回'] }, { name: '支払いサイクル', type: 'select', options: ['毎月', '毎年'] }] }).correct, true)
  // A select whose steps are those wanted, before a status whose steps aren't.
  const reply = [{ names: ['返事', '出欠', '状況'], type: 'status', also: ['select'], options: [{ names: ['未定', '未回答'] }, { names: ['出席'] }, { names: ['欠席'] }] }]
  assert.equal(score(reply, { name: 'ゲスト', columns: [{ name: 'ゲスト名', type: 'text' }, { name: '招待状の状況', type: 'status', options: ['未送付', '送付済み', '返信あり'] }, { name: '出欠', type: 'select', options: ['出席', '欠席', '未定'] }] }).correct, true)
  assert.equal(score(expected, null).correct, false)
  assert.match(String(score(expected, { name: '', columns: [] }).misses[0]), /name/)
})
