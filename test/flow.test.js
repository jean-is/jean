// SPDX-License-Identifier: MIT
// An answer as it happened (app/core/events.js's flow()): stretches of work between what the brain said, how long each
// took, and what kinds of work it did (app/ui/kinds.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flow } from '../app/core/events.js'
import { counts } from '../app/ui/kinds.js'

/** @param {string} id @param {Record<string, any>} [more] */
const brain = (id, more = {}) => ({ toolCallId: id, title: 'Brain', kind: 'think', status: 'completed', ...more })
/** @param {string} id @param {string} kind @param {Record<string, any>} [more] */
const call = (id, kind, more = {}) => ({ toolCallId: id, title: id, name: 'tool', kind, status: 'completed', ...more })
/** @param {number} index @param {any[]} tools @param {string} [text] @param {string} [thought] */
const step = (index, tools, text = '', thought = '') => ({ index, text, thought, tools })
const same = (/** @type {string} */ text) => text
const ids = (/** @type {any[]} */ segments) => segments.map((segment) => ('work' in segment ? segment.work.map((/** @type {any} */ entry) => entry.toolCallId) : segment.text))

test('an answer with no words between its calls is one stretch, then the answer', () => {
  const steps = [step(0, [brain('b0'), call('c1', 'read'), call('c2', 'read')]), step(1, [brain('b1')], 'Done.')]
  assert.deepEqual(ids(flow(steps, same)), [['b0', 'c1', 'c2', 'b1'], 'Done.'])
})

test('words said before calls split the work where they were said', () => {
  const steps = [
    step(0, [brain('b0'), call('c1', 'read')], 'Let me look at the sheet.', 'They want a summary.'),
    step(1, [brain('b1'), call('c2', 'execute'), call('c3', 'search')], 'Sales are up.'),
    step(2, [brain('b2')], 'Here is your summary.'),
  ]
  assert.deepEqual(ids(flow(steps, same)), [['b0'], 'Let me look at the sheet.', ['c1', 'b1'], 'Sales are up.', ['c2', 'c3', 'b2'], 'Here is your summary.'])
})

test('a summary asked for before the brain, and what helpers and scripts did, stay with their stretch', () => {
  const steps = [step(0, [brain('b0-own', { _meta: { compact: true } }), brain('b0'), call('c1', 'other'), call('c1/x', 'read', { _meta: { parent: 'c1' } })], 'Hello.')]
  assert.deepEqual(ids(flow(steps, same)), [['b0-own', 'b0'], 'Hello.', ['c1']])
})

test('words a step hides, its follow-ups, end no stretch', () => {
  const steps = [step(0, [brain('b0'), call('c1', 'read')], '<suggestions>Next?</suggestions>'), step(1, [brain('b1')], 'Done.')]
  assert.deepEqual(ids(flow(steps, (text) => text.replace(/<suggestions>.*<\/suggestions>/, ''))), [['b0', 'c1', 'b1'], 'Done.'])
})

test('a stretch took its rounds’ thinking, up to their words, and its calls', () => {
  const steps = [
    step(0, [brain('b0', { _meta: { ms: 3000, spoke: 1200 } }), call('c1', 'read', { _meta: { ms: 400 } })], 'Let me look.'),
    step(1, [brain('b1', { _meta: { ms: 2000 } }), call('c2', 'execute', { _meta: { ms: 1800 } })]),
    step(2, [brain('b2', { _meta: { ms: 9000, spoke: 700 } })], 'Here it is.'),
  ]
  const [first, , second] = /** @type {any[]} */ (flow(steps, same))
  assert.equal(first.ms, 1200)
  assert.equal(second.ms, 400 + 2000 + 1800 + 700)
})

test('a round still thinking, or with no time yet, counts for nothing yet', () => {
  const [only] = /** @type {any[]} */ (flow([step(0, [brain('b0', { status: 'in_progress' })])], same))
  assert.equal(only.ms, 0)
})

test('counts by kind: a move or a deletion is a change, the brain’s own searches count, a failure is marked', () => {
  const work = [
    brain('b0', { _meta: { raw: [{ type: 'server_tool_use', name: 'web_search' }, { type: 'web_search_tool_result' }, { type: 'server_tool_use', name: 'web_search' }] } }),
    call('c1', 'read'), call('c2', 'read'), call('c3', 'move'), call('c4', 'delete'), call('c5', 'fetch', { status: 'failed' }), call('c6', 'other'), call('c7', 'think'),
  ]
  assert.deepEqual(counts(work), [
    { kind: 'read', count: 2, failed: false },
    { kind: 'edit', count: 2, failed: false },
    { kind: 'search', count: 2, failed: false },
    { kind: 'fetch', count: 1, failed: true },
  ])
})
