// Retention (D412, ee/): what leaves a task is kept first, for the period policy names, from each record's own time,
// in a conversation file of its own under .kept/, which goes once the last of it has been kept that long.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS } from '../app/core/fs.js'
import { loadConversation } from '../app/core/conversations.js'
import { period, until, keep, purge } from '../app/ee/kept.js'

const ID = '01J00000000000000000000002'
const TASK = `projects/01J00000000000000000000001-home/conversations/${ID}.jsonl`
const HEADER = { format: 1, kind: 'conversation', id: ID, createdAt: '2026-01-05T09:00:00.000Z', by: 'device-1' }
const NOW = Date.parse('2026-10-18T12:00:00Z')
const SIX = period('P6M')
/** @param {string} at @param {string} text */
const said = (at, text) => ({ at, by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } } })
const OLD = said('2026-01-05T09:00:00.000Z', 'Sort the applications')
const YOUNG = said('2026-09-30T10:00:00.000Z', 'Rank the shortlist')
const conversation = () => memoryFS({ [TASK]: [HEADER, OLD, YOUNG].map((line) => JSON.stringify(line) + '\n').join('') })
/** @param {import('../app/core/types.js').FS} fs */
const lines = async (fs) => ((await fs.read(`.kept/${ID}.jsonl`)) ?? '').trim().split('\n').map((line) => JSON.parse(line))

test('a period is an ISO 8601 duration in years, months, weeks and days', () => {
  assert.deepEqual(SIX, { years: 0, months: 6, weeks: 0, days: 0 })
  assert.deepEqual(period('P1Y2M3W4D'), { years: 1, months: 2, weeks: 3, days: 4 })
  for (const wrong of ['P', '6 months', 'P6m', 'PT5H', 184, undefined]) assert.throws(() => period(wrong), /retention/, String(wrong))
})

test('something is kept its period from its own time, never less', () => {
  assert.equal(until('2026-04-18T12:00:00Z', SIX), NOW)
  // A month from the 31st of January ends in March, not on a 28th: more than a month, not less.
  assert.equal(until('2026-01-31T00:00:00Z', period('P1M')), Date.parse('2026-03-03T00:00:00Z'))
  assert.equal(until('2026-10-18T12:00:00Z', period('P1W2D')), Date.parse('2026-10-27T12:00:00Z'))
})

test('a task deleted keeps those of its records not yet kept their period, after its header and a note of the removal', async () => {
  const fs = conversation()
  assert.equal(await keep(fs, { task: TASK, records: [OLD, YOUNG], all: true }, { keep: SIX, by: 'device-1', now: NOW }), 1)
  assert.deepEqual(await lines(fs), [HEADER, { at: new Date(NOW).toISOString(), by: 'device-1', meta: { removed: { from: TASK, count: 1, all: true } } }, YOUNG])
  // A conversation file Jean reads as any other.
  const kept = await loadConversation(fs, `.kept/${ID}.jsonl`)
  assert.deepEqual(kept?.records.at(-1), YOUNG)
})

test('each removal from the same task adds to its copy, which is never rewritten', async () => {
  const fs = conversation()
  const answer = { at: '2026-09-30T10:00:05.000Z', by: 'jean', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Ana, then Ben.' } } }
  const certificate = { at: '2026-09-30T10:00:06.000Z', by: 'user', meta: { certificate: { id: 'urn:uuid:1', jws: 'a.b.c', salts: {}, places: [] } } }
  await keep(fs, { task: TASK, records: [answer, certificate] }, { keep: SIX, by: 'device-1', now: NOW })
  await keep(fs, { task: TASK, records: [OLD, YOUNG], all: true }, { keep: SIX, by: 'device-1', now: NOW + 1000 })
  const [header, first, ...rest] = await lines(fs)
  assert.deepEqual(header, HEADER)
  assert.deepEqual(first.meta, { removed: { from: TASK, count: 2, all: false } })
  assert.deepEqual(rest, [answer, certificate, { at: new Date(NOW + 1000).toISOString(), by: 'device-1', meta: { removed: { from: TASK, count: 1, all: true } } }, YOUNG])
})

test('what has been kept its period already is let go, and a task whose file is gone still gets a header', async () => {
  const fs = memoryFS()
  assert.equal(await keep(fs, { task: TASK, records: [OLD], all: true }, { keep: SIX, by: 'device-1', now: NOW }), 0)
  assert.equal(await fs.exists('.kept'), false)
  await keep(fs, { task: TASK, records: [YOUNG], all: true }, { keep: SIX, by: 'device-1', now: NOW })
  assert.deepEqual((await lines(fs))[0], { format: 1, kind: 'conversation', id: ID, createdAt: YOUNG.at, by: 'device-1' })
})

test('a copy goes once the last thing added to it has been kept its period', async () => {
  const fs = conversation()
  await keep(fs, { task: TASK, records: [YOUNG], all: true }, { keep: SIX, by: 'device-1', now: NOW })
  await fs.write('.kept/notes/stray.txt', 'not a copy')
  const added = (await fs.stat(`.kept/${ID}.jsonl`))?.lastModified ?? 0
  assert.deepEqual(await purge(fs, { keep: SIX, now: until(added, SIX) - 1 }), [])
  assert.deepEqual(await purge(fs, { keep: SIX, now: until(added, SIX) }), [`.kept/${ID}.jsonl`])
  assert.equal(await fs.exists(`.kept/${ID}.jsonl`), false)
  assert.equal(await fs.exists('.kept/notes/stray.txt'), true)
  assert.deepEqual(await purge(memoryFS(), { keep: SIX }), [])
})
