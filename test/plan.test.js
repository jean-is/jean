// Plans (D364): the steps the brain gives, and what the request's records say of its plan. The plan in the room is in
// plan.spec.js, beside this.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entriesOf, done, confirmed, routine, moved, MOST } from '../app/caps/plan/entries.js'
import { envelope, userRecord, noteRecord } from '../app/core/events.js'

test('plan: steps read the way brains write them, as ACP’s entries', () => {
  assert.deepEqual(entriesOf({ entries: [
    { content: ' Read the invoices ', status: 'completed', priority: 'high' },
    { content: 'Total per client', status: 'doing' },
    'Write the summary',
    { content: ' ' },
  ] }), [
    { content: 'Read the invoices', status: 'completed', priority: 'high' },
    { content: 'Total per client', status: 'pending', priority: 'medium' },
    { content: 'Write the summary', status: 'pending', priority: 'medium' },
  ])
  // Sent as JSON text, or wrapped twice; nothing that isn't a list.
  assert.deepEqual(entriesOf({ entries: '[{"content":"One","status":"in_progress"}]' }), [{ content: 'One', status: 'in_progress', priority: 'medium' }])
  assert.deepEqual(entriesOf({ entries: { entries: ['One'] } }).length, 1)
  assert.deepEqual(entriesOf({ entries: 'not a list' }), [])
  assert.deepEqual(entriesOf(null), [])
  // No more than the plan holds, each step a line.
  const many = entriesOf({ entries: Array.from({ length: 20 }, (_, i) => `${'x'.repeat(150)} ${i}`) })
  assert.equal(many.length, MOST)
  assert.equal(many[0].content.length, 100)
  assert.ok(many[0].content.endsWith('…'))
  assert.equal(done(many), 0)
})

test('plan: confirmed, moved and a routine’s, from the request at work’s records only', () => {
  const entries = (/** @type {number} */ completed) => ['Read', 'Total', 'Write'].map((content, i) => ({ content, priority: 'medium', status: i < completed ? 'completed' : 'pending' }))
  const plan = (/** @type {number} */ completed, /** @type {number} */ step, ok = true) => envelope('jean', /** @type {any} */ ({ sessionUpdate: 'plan', entries: entries(completed), ...(ok && { _meta: { confirmed: true } }) }), step)
  const earlier = [userRecord('An earlier task', 'dev'), plan(3, 1)]
  const records = [...earlier, userRecord('Total the invoices', 'dev'), plan(0, 0, false)]
  assert.equal(confirmed(earlier), true)
  assert.equal(confirmed(records), false, 'an earlier request’s plan isn’t this one’s')
  assert.equal(moved(records, 0), false, 'a plan nobody confirmed never carries the task on')
  const going = [...records, plan(0, 1), plan(1, 5), plan(1, 13)]
  assert.equal(confirmed(going), true)
  assert.equal(moved(going, 0), true, 'a step got done in the block of steps 0 to 11')
  assert.equal(moved(going, 12), false, 'nothing more in the block from 12')
  assert.equal(moved([...going, plan(2, 20)], 12), true)
  assert.equal(routine(records), false)
  assert.equal(routine([noteRecord('Routine: Weekly sales', { kind: 'routine', routine: 'r.md', title: 'Weekly sales', due: '2026-10-16T09:00:00Z' }), userRecord('Sum the sales', 'jean')]), true)
})
