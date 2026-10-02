// Frozen prompts, system notes, shared files in messages, and replayed thinking (D46, D49).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foldTurns, linkedFiles, noteRecord, toChatMessages, userRecords } from '../core/events.js'
import { buildSystemPrompt, changeNotes, frozenPrompt, promptRecord, promptState } from '../core/prompt.js'
import { runTurn } from '../core/loop.js'
import { documentPart, joinPages } from '../core/files.js'

/** @type {import('../core/types.js').ResourceLink} */
const link = { type: 'resource_link', uri: 'files/sha256-ab.pdf', name: 'report.pdf', mimeType: 'application/pdf', size: 10, _meta: { pages: [1, 1], of: 2 } }

test('a user message with files folds into one turn, and notes attach to the next turn', () => {
  const records = [
    ...userRecords('What does it say?', [link], 'dev'),
    { at: 't', by: 'jean', step: 0, update: { sessionUpdate: /** @type {const} */ ('agent_message_chunk'), content: { type: /** @type {const} */ ('text'), text: 'It says hi.' } } },
    noteRecord('The interface language is now French.', { kind: 'language', language: 'French' }),
    ...userRecords('Et ensuite ?', [], 'dev'),
  ]
  const turns = foldTurns(records)
  assert.equal(turns.length, 2)
  assert.deepEqual(turns[0].user?.files, [link])
  assert.equal(turns[0].user?.text, 'What does it say?')
  assert.deepEqual(turns[0].notes, [])
  assert.deepEqual(turns[1].notes, [{ text: 'The interface language is now French.', data: { kind: 'language', language: 'French' } }])
  assert.deepEqual(linkedFiles(records), [link])
  assert.deepEqual(userRecords('', [link], 'dev').length, 1, 'a file alone needs no empty text chunk')
})

test('toChatMessages: notes where they fall, documents with their recorded pages', () => {
  const records = [...userRecords('Summarise', [link], 'dev'), noteRecord('Today is 2026-10-03.', { kind: 'date', date: '2026-10-03' }), ...userRecords('More', [], 'dev')]
  const text = joinPages(['Page one.', 'Page two.'])
  const messages = toChatMessages(records, (l) => documentPart(l, text))
  assert.deepEqual(messages, [
    { role: 'user', content: 'Summarise', documents: [{ name: 'report.pdf', text: '[[page 1]]\nPage one.\n\n(Pages 1–1 of 2. Use read for the others.)' }] },
    { role: 'system', content: 'Today is 2026-10-03.' },
    { role: 'user', content: 'More' },
  ])
})

test('the prompt is frozen at the start; notes carry every later change', () => {
  const start = promptState({ language: 'English', tools: [], now: new Date(2026, 9, 2, 12) })
  assert.deepEqual(start, { language: 'English', date: '2026-10-02', tools: [] })
  const system = buildSystemPrompt({ assistantName: 'Jean', uiLanguage: 'English' })
  const records = [promptRecord('dev', system, start)]
  assert.deepEqual(frozenPrompt(records), { system, state: start })
  assert.equal(frozenPrompt([]), null)

  const later = promptState({ language: 'French', tools: ['read'], now: new Date(2026, 9, 3, 9) })
  const notes = changeNotes(start, later)
  assert.deepEqual(notes.map((n) => n.update), [
    { sessionUpdate: '_system_note', text: 'The interface language is now French.', data: { kind: 'language', language: 'French' } },
    { sessionUpdate: '_system_note', text: 'Today is 2026-10-03.', data: { kind: 'date', date: '2026-10-03' } },
    { sessionUpdate: '_system_note', text: 'New tools are available: read.', data: { kind: 'tools', added: ['read'] } },
  ])
  const known = frozenPrompt([...records, ...notes])
  assert.equal(known?.system, system, 'the system prompt itself never changes')
  assert.deepEqual(known?.state, later)
  assert.deepEqual(changeNotes(later, later), [])
  assert.deepEqual(changeNotes(later, { ...later, tools: [] }), [], 'tools are never taken back')
})

test('thinking blocks from the loop are replayed in the next turn, tagged with their model', async () => {
  const brain = { id: 'b', provider: /** @type {const} */ ('anthropic'), api: /** @type {const} */ ('anthropic'), baseURL: 'x', model: 'claude-opus-5-5' }
  const raw = [{ type: 'thinking', thinking: 'Plan.', signature: 's' }, { type: 'text', text: 'Answer.' }]
  async function* stream() {
    yield { type: 'text', delta: 'Answer.' }
    yield { type: 'done', stopReason: 'end', usage: { inputTokens: 100, outputTokens: 5, cacheReadTokens: 90 }, message: { role: 'assistant', content: 'Answer.', raw } }
  }
  /** @type {any[]} */
  const persisted = [...userRecords('Q', [], 'dev')]
  const result = await runTurn({
    brain, system: 's', history: [{ role: 'user', content: 'Q' }], stream: /** @type {any} */ (stream),
    persist: async (records) => { persisted.push(...records) },
  })
  assert.equal(result.usage.cacheReadTokens, 90)
  const messages = toChatMessages(persisted)
  assert.deepEqual(messages[1], { role: 'assistant', content: 'Answer.', raw, rawModel: 'claude-opus-5-5' })
})

test('blocks without thinking are not kept', async () => {
  const brain = { id: 'b', provider: /** @type {const} */ ('anthropic'), api: /** @type {const} */ ('anthropic'), baseURL: 'x', model: 'claude-opus-5-5' }
  async function* stream() {
    yield { type: 'done', stopReason: 'end', message: { role: 'assistant', content: 'Hi', raw: [{ type: 'text', text: 'Hi' }] } }
  }
  /** @type {any[]} */
  const persisted = []
  await runTurn({ brain, system: 's', history: [], stream: /** @type {any} */ (stream), persist: async (r) => { persisted.push(...r) } })
  assert.equal(persisted[0].update._meta.raw, undefined)
})
