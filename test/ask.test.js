// Questions for the user (D146): what the brain asks, how each question starts on its card, and
// the answers it gets back. The card itself is in e2e/ask.spec.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { questionsOf, start, answered, reply, MAX_QUESTIONS, MAX_OPTIONS } from '../caps/ask/answers.js'

test('questions: read the way brains write them, without what can’t be shown', () => {
  assert.deepEqual(questionsOf({ questions: [
    { question: ' Which tone? ', options: [{ label: 'Formal', description: 'For a bank', recommended: true }, { label: 'Friendly', recommended: true }, { label: ' ' }] },
    { question: 'Which parts?', options: ['Summary', { label: 'Budget', recommended: true }, { label: 'Timeline', recommended: true }], multiple: true },
    { question: '' },
    'When is it due?',
  ] }), [
    // A single choice recommends one answer at most; several can be recommended when several can be chosen.
    { question: 'Which tone?', options: [{ label: 'Formal', description: 'For a bank', recommended: true }, { label: 'Friendly', description: '', recommended: false }], multiple: false },
    { question: 'Which parts?', options: [{ label: 'Summary', description: '', recommended: false }, { label: 'Budget', description: '', recommended: true }, { label: 'Timeline', description: '', recommended: true }], multiple: true },
    { question: 'When is it due?', options: [], multiple: false },
  ])
  // Questions sent as JSON text.
  assert.deepEqual(questionsOf({ questions: '[{"question":"Which day?","options":["Monday"]}]' }), [{ question: 'Which day?', options: [{ label: 'Monday', description: '', recommended: false }], multiple: false }])
  assert.deepEqual(questionsOf({ questions: 'not a list' }), [])
  assert.deepEqual(questionsOf(null), [])
  // No more than the card holds.
  const many = Array.from({ length: 9 }, (_, i) => ({ question: `Q${i}`, options: Array.from({ length: 9 }, (_, j) => `A${j}`) }))
  const kept = questionsOf({ questions: many })
  assert.equal(kept.length, MAX_QUESTIONS)
  assert.equal(kept[0].options.length, MAX_OPTIONS)
})

test('a question starts on what the brain recommends, or on the user’s own words when there is nothing to pick', () => {
  const [tone, parts, due] = questionsOf({ questions: [
    { question: 'Which tone?', options: [{ label: 'Formal' }, { label: 'Friendly', recommended: true }] },
    { question: 'Which parts?', options: ['Summary', 'Budget'], multiple: true },
    { question: 'When is it due?' },
  ] })
  assert.deepEqual(start(tone), { chosen: [1], own: '', writing: false, skipped: false })
  assert.equal(answered(start(tone)), true)
  // Nothing picked yet: nothing to send until the user picks or writes.
  assert.equal(answered(start(parts)), false)
  assert.deepEqual(start(due), { chosen: [], own: '', writing: true, skipped: false })
  assert.equal(answered(start(due)), false)
  assert.equal(answered({ ...start(due), own: '  ' }), false)
  assert.equal(answered({ ...start(due), own: 'Friday' }), true)
  // Words typed but not chosen don't count.
  assert.equal(answered({ ...start(parts), own: 'A timeline', writing: false }), false)
})

test('answers: what was chosen, written or skipped, for each question, as JSON', () => {
  const questions = questionsOf({ questions: [
    { question: 'Which tone?', options: [{ label: 'Formal', recommended: true }, { label: 'Friendly' }] },
    { question: 'Which parts?', options: ['Summary', 'Budget', 'Timeline'], multiple: true },
    { question: 'When is it due?' },
    { question: 'Who signs it?', options: ['Me', 'My manager'] },
    { question: 'Anything else?', options: ['No'] },
  ] })
  const answers = [
    start(questions[0]),
    { chosen: [2, 1], own: ' and the risks ', writing: true, skipped: false },
    { chosen: [], own: 'Friday noon', writing: true, skipped: false },
    // Skipped: what was picked before stays out.
    { chosen: [0], own: '', writing: false, skipped: true },
    // Words left behind once an answer was picked instead.
    { chosen: [0], own: 'Maybe', writing: false, skipped: false },
  ]
  assert.deepEqual(JSON.parse(reply(questions, answers)), { answers: [
    { question: 'Which tone?', chose: 'Formal' },
    { question: 'Which parts?', chose: ['Budget', 'Timeline'], wrote: 'and the risks' },
    { question: 'When is it due?', wrote: 'Friday noon' },
    { question: 'Who signs it?', skipped: true },
    { question: 'Anything else?', chose: 'No' },
  ] })
  // Nothing picked and nothing written is skipped too.
  assert.deepEqual(JSON.parse(reply(questions.slice(1, 2), [start(questions[1])])), { answers: [{ question: 'Which parts?', skipped: true }] })
})
