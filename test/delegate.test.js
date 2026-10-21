// 0.6, "Delegate": what Double-check reads from an answer and its sources, and how a helper's
// declarations stay its own. Helpers' turns themselves are in loop.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claimsIn, passage, sourceIn, request, verdicts } from '../app/caps/check/claims.js'
import { frozenPrompt, promptRecord, promptState } from '../app/core/prompt.js'
import { envelope } from '../app/core/events.js'

test('claims: the sentences that cite a known source, as plain text, with their numbers', () => {
  const answer = [
    'Your briefing:',
    '',
    '- **Croissants for Saturday**, from Margot [1]',
    '- Invoice 2041 is due Friday [2, 3]. The bakery is closed on Monday [1].',
    '- A number nobody gave [9].',
    '',
    '| Region | Sales |',
    '|---|---:|',
    '| North | 2540 [4] |',
    '',
    'No source here.',
  ].join('\n')
  assert.deepEqual(claimsIn(answer, (n) => n <= 4, 'en'), [
    { text: 'Croissants for Saturday, from Margot', sources: [1] },
    { text: 'Invoice 2041 is due Friday.', sources: [2, 3] },
    { text: 'The bakery is closed on Monday.', sources: [1] },
    { text: 'North 2540', sources: [4] },
  ])
  // Sentences end the same way in every script.
  assert.deepEqual(claimsIn('東京は日本の首都です[1]。人口が多い[2]。出典なし。', (n) => n === 1, 'ja'), [{ text: '東京は日本の首都です。', sources: [1] }])
  // A mark that says where, in its source (D481).
  assert.deepEqual(claimsIn('Rent is due on the 5th [1: "payable on the 5th. Late fees apply"]. The deposit is €800 [2, p. 3].', (n) => n < 3, 'en'), [
    { text: 'Rent is due on the 5th.', sources: [1], at: { 1: ': "payable on the 5th. Late fees apply"' } },
    { text: 'The deposit is €800.', sources: [2], at: { 2: ', p. 3' } },
  ])
})

test('passages: for a mark that quotes its source, the page around the words, or null when they aren’t in it (D481)', () => {
  const text = `[[page 1]]\n${'Boilerplate. '.repeat(200)}\n\n[[page 2]]\nThe rent is payable on the 5th of each month.\n\nOther terms.`
  assert.equal(passage(text, 'Rent is due on the 5th.', 1500, ': "payable on the 5th"'), 'The rent is payable on the 5th of each month.\n\nOther terms.')
  assert.equal(passage(text, 'Rent is due on the 6th.', 1500, ': "payable on the 6th"'), null)
  assert.equal(passage(text, 'Boilerplate', 1500, ', p. 2'), passage(text, 'Boilerplate'), 'a page alone: as without')
})

test('passages: a short source whole, a long one by the paragraphs that match the claim', () => {
  assert.equal(passage('  Invoice 2041 is due Friday.  ', 'invoice'), 'Invoice 2041 is due Friday.')
  const long = Array.from({ length: 20 }, (_, i) => (i === 13 ? 'The invoice for 38 bags of flour is due on Friday 4 October.' : `Paragraph ${i} about the weather and nothing else at all. `.repeat(8))).join('\n\n')
  const found = passage(long, 'When is the flour invoice due?', 600)
  assert.match(found, /38 bags of flour/)
  assert.ok(found.length <= 600)
})

test('a tool result’s numbered sources, each from its line to the next', () => {
  const output = '2 emails, newest first.\n\nSource [4]: Croissants (mail://inbox/3)\nFrom Margot: 120 croissants.\n\nSource [5]: Invoice (mail://inbox/2)\nDue Friday.'
  assert.equal(sourceIn(output, 4), 'Croissants (mail://inbox/3)\nFrom Margot: 120 croissants.')
  assert.equal(sourceIn(output, 5), 'Invoice (mail://inbox/2)\nDue Friday.')
  assert.equal(sourceIn(output, 6), '')
})

test('the request names each claim and its sources; verdicts come back by number', () => {
  assert.equal(request([{ text: 'Due Friday.', passages: [{ n: 2, text: 'Invoice due Friday' }] }, { text: 'Closed Monday.', passages: [{ n: 1, text: 'Croissants' }, { n: 3, text: 'Hours' }] }]),
    'Claim 1: Due Friday.\nSource [2]: Invoice due Friday\n\nClaim 2: Closed Monday.\nSource [1]: Croissants\nSource [3]: Hours')
  assert.deepEqual(verdicts('1: supported\nClaim 2 — Missing.\n3. contradicted\n7: supported\nanything else', 4), ['supported', 'missing', 'contradicted', 'unknown'])
})

test('a helper’s find_tools declares its tools for itself, not for the conversation', () => {
  const state = promptState({ language: 'English', tools: ['find_tools'] })
  const records = [
    promptRecord('dev', 'sys', state),
    envelope('jean', { sessionUpdate: 'tool_call', toolCallId: 'p1.1/f1', title: '', name: 'find_tools', status: 'completed', _meta: { parent: 'p1.1', declare: ['mail_search_emails'] } }, 0),
    envelope('jean', { sessionUpdate: 'tool_call', toolCallId: 'f2', title: '', name: 'find_tools', status: 'completed', _meta: { declare: ['mail_read_email'] } }, 1),
  ]
  assert.deepEqual(frozenPrompt(records)?.state.tools, ['find_tools', 'mail_read_email'])
})
