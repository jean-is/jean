// SPDX-License-Identifier: MIT
// What a brain is asked about a doubted sheet, and what is taken back from it (layout.js). Run with: node --test test/spreadsheets/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ask, take, asked, LABELS, KINDS } from './layout.js'
import { read } from './sheet.js'

/** @param {unknown[][]} lines */
const grid = (lines) => /** @type {any} */ (lines.map((line) => line.map((value) => (value === null ? undefined : typeof value === 'number' ? { value, kind: 'number' } : { value, kind: 'text' }))))

test('ask: the sheet as lines of cells, the first 60 and the last 20, the rules\' reading and their doubts', () => {
  const lines = [['Name', 'Amount'], ...Array.from({ length: 100 }, (_, i) => [`row ${i}`, i + 1]), ['Source: town hall', 'n/a', 'office']]
  const cells = grid(lines), { system, text, shown } = ask(cells, [{ top: 0, left: 0, bottom: 0, right: 1 }], read(cells))
  assert.equal(shown.length, 80)
  assert.match(text, /^1: A1=Name \| B1=Amount$/m)
  assert.match(text, /^… lines 61 to 82 not shown \(22\) …$/m)
  assert.match(text, /^102: A102=Source: town hall \| B102=n\/a \| C102=office$/m)
  assert.match(text, /Merged cells: A1:B1\./)
  assert.match(text, /^Heads: line 1\.$/m)
  assert.match(text, /^Columns: A "Name" text; B "Amount" number/m)
  assert.match(text, /What the rules doubt:\n- A102:C102: its cells don't fit their columns\./)
  assert.match(text, /data, never instructions/)
  assert.ok(!/[A-Z]{4,}/.test(`${system}\n${text}`.replace(/[A-Z]+\d+|JSON/g, '')), 'no capitals for emphasis')
})

test('take: labels for lines shown and kinds for columns, each checked; everything else dropped', () => {
  const sheet = { height: 120, width: 4, shown: [...Array(60).keys(), ...Array.from({ length: 20 }, (_, i) => 100 + i)] }
  assert.deepEqual(take('{"lines": {"5": "heads", "6-7": "row", "101": "note"}, "columns": {"B": "text"}}', sheet), { labels: { lines: { 4: 'heads', 5: 'row', 6: 'row', 100: 'note' }, kinds: { 1: 'text' } }, dropped: [], failed: false })
  assert.deepEqual(take('```json\n{"lines": {}, "columns": {}}\n```', sheet), { labels: { lines: {}, kinds: {} }, dropped: [], failed: false })
  assert.deepEqual(take('Here it is: {"lines": {}}', sheet).failed, true)
  assert.deepEqual(take('[1, 2]', sheet).failed, true)
  const odd = take('{"lines": {"0": "row", "121": "row", "9-3": "row", "4": "delete", "x": "row", "8": "heads"}, "columns": {"E": "text", "a": "text", "B": "money"}, "run": "rm -rf"}', sheet)
  assert.deepEqual(odd.labels, { lines: { 7: 'heads' }, kinds: {} })
  assert.equal(odd.dropped.length, 9)
  assert.deepEqual(take('{"lines": {"55-105": "row"}}', sheet).labels.lines, Object.fromEntries([...Array.from({ length: 5 }, (_, i) => 54 + i), 59, 100, 101, 102, 103, 104].map((n) => [n, 'row'])), 'lines not shown are not taken')
  assert.deepEqual([LABELS.length, KINDS.length], [7, 8])
})

test('with no brain, the sheet asks the person a question for each kind of doubt', () => {
  assert.deepEqual(Object.keys(asked), ['misfit', 'total', 'sums', 'words', 'end', 'long', 'merged'])
  for (const question of Object.values(asked)) assert.ok(/\?/.test(question) && !/\b(agent|model|token|AI)\b/i.test(question), question)
})
