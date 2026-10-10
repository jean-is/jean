// About this answer (D252): what its certificate says from the conversation's records, what the
// answer cost, and its seal, which anyone can check and which no change survives.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { foldTurns, envelope, userRecord, metaRecord } from '../app/core/events.js'
import { brainsOf, factsOf, costOf, certificate, seal, verify } from '../app/caps/receipt/certificate.js'

const T0 = Date.parse('2026-10-10T09:00:00.000Z')
const at = (/** @type {number} */ ms) => new Date(T0 + ms).toISOString()

/**
 * A request at T0, then a brain asked at each given time (ms), as the loop records it, a helper's
 * under its call; the answer ends at 5 s. @param {{ local: boolean, at: number, provider?: string, parent?: string }[]} brains
 */
function turnWith(brains) {
  const records = [{ ...userRecord('What is on my calendar?', 'device'), at: at(0) }]
  for (const [step, brain] of brains.entries()) {
    const id = `brain-${step}-${(T0 + brain.at).toString(36)}`
    records.push({ ...envelope('jean', { sessionUpdate: 'tool_call', toolCallId: brain.parent ? `${brain.parent}/${id}` : id, title: '', kind: 'think', status: 'completed',
      rawInput: { provider: brain.provider ?? (brain.local ? 'ollama' : 'anthropic'), model: 'm', local: brain.local },
      rawOutput: { stopReason: 'end', usage: { inputTokens: 1000, outputTokens: 200 } }, ...(brain.parent && { _meta: { parent: brain.parent } }) }, step), at: at(brain.at + 100) })
  }
  records.push({ ...envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Two meetings.' } }, 0), at: at(5000) })
  return { turn: foldTurns(records)[0], records }
}

/** What the page reached while answering, kept as the receipt keeps it. @param {number} from @param {number} to @param {Record<string, number>} hosts */
const reached = (from, to, hosts) => metaRecord('device', { reached: { from: at(from), to: at(to), hosts } }).meta.reached

test('each brain asked, its helpers’ too, with when it was asked and whether it ran here', () => {
  const { turn } = turnWith([{ local: true, at: 1000 }, { local: false, at: 2000, parent: 'call-1' }])
  assert.deepEqual(brainsOf(turn).map(({ provider, local, started, input }) => ({ provider, local, started, input })), [
    { provider: 'ollama', local: true, started: T0 + 1000, input: 1000 },
    { provider: 'anthropic', local: false, started: T0 + 2000, input: 1000 },
  ])
})

test('done on this device only when its brains ran here and the browser recorded nothing sent elsewhere', () => {
  const { turn } = turnWith([{ local: true, at: 1000 }])
  const facts = factsOf(turn, [reached(500, 5500, { 'localhost:11434': 2 })])
  assert.equal(facts.verdict, 'local')
  // From the first request to a brain to the answer's end.
  assert.equal(facts.ms, 4000)
  assert.deepEqual(facts.outside, [])
  // Another conversation's record, from before this request, isn't this answer's.
  assert.equal(factsOf(turn, [reached(-9000, -8000, {})]).verdict, 'unknown')
})

test('sent outside by a brain in the cloud, or by any address outside this device', () => {
  assert.equal(factsOf(turnWith([{ local: false, at: 1000 }]).turn, [reached(500, 5500, {})]).verdict, 'out')
  const facts = factsOf(turnWith([{ local: true, at: 1000 }]).turn, [reached(500, 5500, { 'en.wikipedia.org': 1, '127.0.0.1:1234': 1 })])
  assert.equal(facts.verdict, 'out')
  assert.deepEqual(facts.outside, ['en.wikipedia.org'])
  // Without the browser's record, a brain in the cloud is enough to know.
  assert.equal(factsOf(turnWith([{ local: false, at: 1000 }]).turn, []).verdict, 'out')
  // A site the browser beside the conversation was asked to show, which its frame loads out of the page's record; one on this computer stays here.
  for (const [url, outside] of [['https://news.example.com/today', ['news.example.com']], ['http://localhost:5173/', []]]) {
    const { records } = turnWith([{ local: true, at: 1000 }])
    records.splice(2, 0, { ...envelope('jean', { sessionUpdate: 'tool_call', toolCallId: 'c1', title: url, name: 'browse', kind: 'fetch', status: 'completed', rawInput: { url } }, 1), at: at(1500) })
    assert.deepEqual(factsOf(foldTurns(records)[0], [reached(500, 5500, {})]).outside, outside)
  }
})

test('not certified when the browser’s record misses a request to a brain', () => {
  const { turn } = turnWith([{ local: true, at: 1000 }, { local: true, at: 3000 }])
  assert.equal(factsOf(turn, []).verdict, 'unknown')
  // The page closed during the answer, which went on later (D212): only the second part was recorded.
  assert.equal(factsOf(turn, [reached(2500, 5500, {})]).verdict, 'unknown')
  // Two runs of one answer, each recorded.
  assert.equal(factsOf(turn, [reached(500, 2000, {}), reached(2500, 5500, {})]).verdict, 'local')
})

test('the time is the answer’s, from when it was last asked for, a helper’s first step not counting', () => {
  // Try again a minute after the request, kept with its first time (D188): the answer is written in 2 s.
  const { records } = turnWith([{ local: true, at: 60_000 }, { local: true, at: 61_000, parent: 'call-1' }])
  records.push({ ...envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '.' } }, 0), at: at(62_000) })
  assert.equal(factsOf(foldTurns(records)[0], []).ms, 2000)
  // A run that asked no brain (a flow's one call, D218): from the request.
  assert.equal(factsOf(foldTurns(turnWith([]).records)[0], []).ms, 5000)
})

test('free on this device, priced in the cloud, not known without a price', () => {
  const brains = brainsOf(turnWith([{ local: true, at: 1000 }, { local: false, at: 2000 }]).turn)
  assert.equal(costOf(brains.slice(0, 1), () => undefined), 0)
  assert.equal(costOf(brains, () => ({ prompt: 3e-6, completion: 15e-6 })), 1000 * 3e-6 + 200 * 15e-6)
  assert.equal(costOf(brains, () => undefined), null)
  assert.equal(costOf(brains, () => ({ prompt: NaN, completion: NaN })), null)
  // What is read again from the cache, at its own price when there is one (D255).
  const cached = brains.map((brain) => ({ ...brain, cached: 800 }))
  assert.equal(costOf(cached.slice(1), () => ({ prompt: 3e-6, completion: 15e-6, cacheRead: 0.3e-6 })), 200 * 3e-6 + 800 * 0.3e-6 + 200 * 15e-6)
  assert.equal(costOf(cached.slice(1), () => ({ prompt: 3e-6, completion: 15e-6 })), 1000 * 3e-6 + 200 * 15e-6)
})

test('a sealed certificate holds the request’s and the answer’s fingerprints, not their words, and no change survives its seal', async () => {
  const { turn } = turnWith([{ local: true, at: 1000 }])
  const facts = factsOf(turn, [reached(500, 5500, {})])
  const document = await certificate({ facts, turn, text: 'Two meetings.', conversation: 'c1', by: 'device', origin: 'https://jean.is', now: new Date(T0 + 6000) })
  assert.equal(document.local, true)
  assert.equal(document.answer.sha256, createHash('sha256').update('Two meetings.').digest('hex'))
  assert.equal(document.request.sha256, createHash('sha256').update('What is on my calendar?').digest('hex'))
  assert.doesNotMatch(JSON.stringify(document), /calendar|meetings/)
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
  const saved = JSON.parse(JSON.stringify(await seal(document, keys), null, 2))
  assert.equal(await verify(saved), true)
  assert.equal(await verify({ ...saved, local: false }), false)
  assert.equal(await verify({ ...saved, reached: [{ ...saved.reached[0], hosts: { 'api.example.com': 1 } }] }), false)
  assert.equal(await verify(document), false)
})
