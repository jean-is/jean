// The screen's parts (D635): a layout read from the address and written back, a part dropped in another's place or beside it,
// taken away, swapped, and where each one goes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, write, leaves, without, swap, rename, put, zone, places, reshare } from '../app/ui/tree.js'

const TASK = '01JB7ZQ8J3M4N5P6Q7R8S9T0VW'
const DOC = 'documents/01JB7ZQ8J3M4N5P6Q7R8S9T0VX-notes, (draft).md'

test('a layout reads as the address writes it, its shares and a place with commas and brackets too', () => {
  const tree = put(put('here', 'here', TASK, 'end'), TASK, DOC, 'bottom')
  const text = write(reshare(tree, '', 0.4))
  assert.equal(text, `row40(here,col(${TASK},documents/01JB7ZQ8J3M4N5P6Q7R8S9T0VX-notes%2C %28draft%29.md))`)
  assert.deepEqual(parse(text), reshare(tree, '', 0.4))
  assert.deepEqual(leaves(/** @type {any} */ (parse(text))), ['here', TASK, DOC])
})

test('an address that isn\'t a layout is none: no here, a tile twice, too many, or cut off', () => {
  for (const text of ['', 'here', `row(${TASK},${DOC})`, 'row(here,here)', 'row(here', 'row(here,a)b', 'col(here,%E0%A4%A)']) assert.equal(parse(text), text === 'here' ? 'here' : null, text)
  const many = Array.from({ length: 8 }, (_, i) => `t${i}`).reduce((tree, leaf) => `row(${leaf},${tree})`, 'here')
  assert.equal(parse(many), null)
  assert.equal(/** @type {any} */ (parse('row95(here,a)')).share, 0.9)
})

test('a tile dropped in another\'s place takes it, beside it takes the half it was dropped on, and goes from where it was', () => {
  const two = put('here', 'here', TASK, 'start')
  assert.equal(write(two), `row(${TASK},here)`)
  assert.equal(write(put(two, TASK, DOC, 'center')), `row(${write(DOC)},here)`)
  assert.equal(write(put(two, 'here', DOC, 'top')), `row(${TASK},col(${write(DOC)},here))`)
  // Moved: taken from its place first, the split it left closing.
  const moved = put(/** @type {any} */ (without(put(two, 'here', DOC, 'bottom'), TASK)), DOC, TASK, 'end')
  assert.equal(write(moved), `col(here,row(${write(DOC)},${TASK}))`)
  assert.equal(without('here', 'here'), null)
})

test('the task opened from a tile takes the box where it is, the one left takes its place', () => {
  const tree = put(put('here', 'here', TASK, 'end'), TASK, 'B', 'bottom')
  assert.equal(write(rename(swap(tree, 'B', 'here'), 'B', 'A')), `row(A,col(${TASK},here))`)
})

test('a drop a quarter from an edge splits, nearer the middle it takes the place', () => {
  assert.equal(zone(0.1, 0.5), 'start')
  assert.equal(zone(0.9, 0.5), 'end')
  assert.equal(zone(0.5, 0.05), 'top')
  assert.equal(zone(0.4, 0.8), 'bottom')
  assert.equal(zone(0.5, 0.5), 'center')
  assert.equal(zone(0.3, 0.7), 'center')
})

test('each tile has its share of the screen, each split its place and the way to it', () => {
  const tree = reshare(put(put('here', 'here', TASK, 'end'), TASK, DOC, 'bottom'), 'b', 0.25)
  const { tiles, splits } = places(tree)
  assert.deepEqual(tiles, [{ leaf: 'here', x: 0, y: 0, w: 0.5, h: 1 }, { leaf: TASK, x: 0.5, y: 0, w: 0.5, h: 0.25 }, { leaf: DOC, x: 0.5, y: 0.25, w: 0.5, h: 0.75 }])
  assert.deepEqual(splits.map(({ path, split, share, x, w }) => ({ path, split, share, x, w })), [{ path: '', split: 'row', share: 0.5, x: 0, w: 1 }, { path: 'b', split: 'col', share: 0.25, x: 0.5, w: 0.5 }])
})
