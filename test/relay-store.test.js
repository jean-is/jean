// SPDX-License-Identifier: MIT
// The relay's store (relay/store.js, D721): a person's files sealed on their devices, kept for those devices alone, against the
// relay's own handler in this process, with a backend in memory, then its folder on disk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { relay } from '../relay/relay.js'
import { folder } from '../relay/serve.js'
import { hashOf } from '../host/host.js'
import { memory } from './fixtures/relay-memory.js'

const JEAN = 'https://jean.example'
const BASE = 'https://relay.example'
const DAY = 86_400_000
/** @param {Uint8Array} bytes */
const base64url = (bytes) => Buffer.from(bytes).toString('base64url')
const random = (/** @type {number} */ size) => base64url(crypto.getRandomValues(new Uint8Array(size)))
/** A device of a store: its id, its token, and its token's hash. */
const device = async () => { const token = random(32); return { id: random(16), token, hash: await hashOf(token) } }
/** A part, sealed elsewhere: its bytes and its name. @param {string} text */
const partOf = async (text) => { const bytes = new TextEncoder().encode(text); return { bytes, name: base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))) } }

/** A relay keeping stores, its clock set by the test. @param {{ stores?: object | false, backend?: ReturnType<typeof memory>['backend'] }} [options] */
function relayed({ stores = {}, backend = memory().backend } = {}) {
  const clock = { now: Date.parse('2026-11-08T10:00:00Z') }
  backend.at = clock.now
  const handle = relay({ origins: [JEAN], store: backend, ...(stores && { stores }), now: () => clock.now })
  /**
   * A request as Jean's page makes one. @param {string} method @param {string} path
   * @param {{ token?: string, body?: BodyInit, json?: object, headers?: Record<string, string>, address?: string }} [options]
   */
  const call = async (method, path, { token, body, json, headers = {}, address = '203.0.113.7' } = {}) => {
    const response = await handle(new Request(`${BASE}${path}`, { method, headers: { origin: JEAN, ...(token && { authorization: `Bearer ${token}` }), ...headers },
      body: json ? JSON.stringify(json) : body }), { address, port: 51234 })
    const type = response.headers.get('content-type') ?? ''
    return { status: response.status, headers: response.headers, body: type.includes('json') ? await response.json() : new Uint8Array(await response.arrayBuffer()) }
  }
  return { handle, call, clock, backend }
}

/** A store made by its first device, with its proof. @param {ReturnType<typeof relayed>} relay */
async function made({ call }) {
  const [sid, first, proof] = [random(16), await device(), random(32)]
  const { status } = await call('PUT', `/v1/s/${sid}`, { token: first.token, json: { id: first.id, proof: await hashOf(proof) } })
  assert.equal(status, 201)
  return { sid, first, proof }
}

/** A version of an object, its parts put first. @param {ReturnType<typeof relayed>['call']} call @param {string} sid @param {string} token */
const putter = (call, sid, token) => async (/** @type {string} */ oid, /** @type {string} */ text, /** @type {Record<string, string>} */ condition, epoch = 0) => {
  const part = await partOf(text)
  await call('PUT', `/v1/s/${sid}/b`, { token, body: /** @type {BodyInit} */ (part.bytes), headers: { 'store-part': part.name } })
  return call('PUT', `/v1/s/${sid}/o`, { token, json: { meta: `sealed meta of ${text}`, parts: [part.name], epoch }, headers: { 'store-object': oid, ...condition } })
}

test('a relay keeps stores only where its configuration asks, and says so at its root', async () => {
  const off = relayed({ stores: false })
  assert.equal((await off.call('GET', '/')).body.store, undefined)
  assert.equal((await off.call('PUT', `/v1/s/${random(16)}`, { token: random(32), json: { id: random(16), proof: random(32) } })).status, 404)
  const on = relayed({ stores: { quota: 5_000_000 } })
  assert.deepEqual((await on.call('GET', '/')).body, { format: 1, message: 25_000_000, days: 7, store: { quota: 5_000_000, part: 4_194_304, devices: 16 } })
  // Its requests carry conditions, a proof and names in headers, which a page's preflight allows, cached as a mailbox's is.
  const preflight = await on.handle(new Request(`${BASE}/v1/s/${random(16)}/o`, { method: 'OPTIONS', headers: { origin: JEAN } }))
  assert.match(String(preflight.headers.get('access-control-allow-headers')), /if-match, if-none-match, store-proof, store-part, store-object/)
  assert.equal(preflight.headers.get('access-control-max-age'), '7200')
  // Another origin is refused.
  const other = await on.handle(new Request(`${BASE}/v1/s/${random(16)}`, { headers: { origin: 'https://elsewhere.example', authorization: `Bearer ${random(32)}` } }))
  assert.equal(other.status, 403)
})

test('a store is made once, by a device with its token and its proof’s hash, and opens only to its devices', async () => {
  const relay = relayed()
  const { sid, first } = await made(relay)
  assert.equal((await relay.call('PUT', `/v1/s/${sid}`, { token: first.token, json: { id: first.id, proof: random(32) } })).status, 409)
  assert.equal((await relay.call('PUT', `/v1/s/${random(16)}`, { token: first.token, json: { id: 'short' } })).status, 400)
  assert.equal((await relay.call('GET', `/v1/s/${sid}`)).status, 401)
  assert.equal((await relay.call('GET', `/v1/s/${sid}`, { token: random(32) })).status, 403)
  assert.equal((await relay.call('GET', `/v1/s/${random(16)}`, { token: first.token })).status, 404)
  const { body } = await relay.call('GET', `/v1/s/${sid}`, { token: first.token })
  assert.deepEqual(body, { epoch: 0, since: 0, last: 0, devices: [{ id: first.id, added: relay.clock.now }], envelope: null, use: 0, quota: 1_000_000_000 })
  // The relay keeps the token's hash, never the token.
  assert.ok(!JSON.stringify(await relay.backend.store(sid)).includes(first.token))
})

test('a part is taken only under the SHA-256 of its bytes, once, counted against the store, and read with a token', async () => {
  const relay = relayed({ stores: { quota: 100, part: 60 } })
  const { sid, first } = await made(relay)
  const part = await partOf('sealed bytes')
  const put = (/** @type {Uint8Array} */ bytes, name = part.name) => relay.call('PUT', `/v1/s/${sid}/b`, { token: first.token, body: /** @type {BodyInit} */ (bytes), headers: { 'store-part': name } })
  assert.equal((await put(part.bytes, (await partOf('other')).name)).status, 400)
  assert.equal((await put(part.bytes)).status, 201)
  assert.equal((await put(part.bytes)).status, 200)
  assert.equal((await relay.call('GET', `/v1/s/${sid}`, { token: first.token })).body.use, part.bytes.length)
  const read = await relay.call('GET', `/v1/s/${sid}/b`, { token: first.token, headers: { 'store-part': part.name } })
  assert.deepEqual([read.status, new TextDecoder().decode(read.body)], [200, 'sealed bytes'])
  assert.equal((await relay.call('GET', `/v1/s/${sid}/b`, { headers: { 'store-part': part.name } })).status, 401)
  assert.equal((await relay.call('GET', `/v1/s/${sid}/b`, { token: random(32), headers: { 'store-part': part.name } })).status, 403)
  // Too large for a part, then too much for the store.
  const large = await partOf('x'.repeat(61))
  assert.equal((await put(large.bytes, large.name)).status, 413)
  const more = await partOf('y'.repeat(60))
  assert.equal((await put(more.bytes, more.name)).status, 201)
  const last = await partOf('z'.repeat(30))
  assert.equal((await put(last.bytes, last.name)).status, 507)
  // The relay short of room takes no part at all, and makes no store.
  relay.backend.room = 1_000
  const one = await partOf('one more')
  assert.equal((await put(one.bytes, one.name)).status, 503)
  assert.equal((await relay.call('PUT', `/v1/s/${random(16)}`, { token: random(32), json: { id: random(16), proof: random(32) } })).status, 503)
})

test('a version replaces the one it names, and only that one: the one that won comes back with a 412', async () => {
  const relay = relayed()
  const { sid, first } = await made(relay)
  const put = putter(relay.call, sid, first.token)
  const oid = random(16)
  const one = await put(oid, 'one', { 'if-none-match': '*' })
  assert.equal(one.status, 200)
  assert.equal(one.body.rev, relay.clock.now)
  const again = await put(oid, 'again', { 'if-none-match': '*' })
  assert.equal(again.status, 412)
  assert.deepEqual(again.body, { oid, rev: one.body.rev, epoch: 0, meta: 'sealed meta of one', parts: [(await partOf('one')).name] })
  // The clock stepping back, the next rev still comes after.
  relay.clock.now -= 60_000
  const two = await put(oid, 'two', { 'if-match': String(one.body.rev) })
  assert.deepEqual([two.status, two.body.rev], [200, one.body.rev + 1])
  assert.equal((await put(oid, 'stale', { 'if-match': String(one.body.rev) })).body.meta, 'sealed meta of two')
  assert.equal((await put(oid, 'unsaid', {})).status, 428)
  assert.equal((await relay.call('PUT', `/v1/s/${sid}/o`, { token: first.token, json: { meta: 'm', parts: [random(32)], epoch: 0 }, headers: { 'store-object': random(16), 'if-none-match': '*' } })).status, 400)
  const older = await put(random(16), 'old epoch', { 'if-none-match': '*' }, -1)
  assert.deepEqual([older.status, older.body.epoch], [409, 0])
  // A meta too long for one.
  assert.equal((await relay.call('PUT', `/v1/s/${sid}/o`, { token: first.token, json: { meta: 'm'.repeat(5_000), parts: [], epoch: 0 }, headers: { 'store-object': random(16), 'if-none-match': '*' } })).status, 400)
})

test('the feed gives what changed after a rev, in its order, a page at a time, deletions sealed as versions are', async () => {
  const relay = relayed({ stores: { page: 2 } })
  const { sid, first } = await made(relay)
  const put = putter(relay.call, sid, first.token)
  const oids = [random(16), random(16), random(16)]
  const revs = []
  for (const oid of oids) { relay.clock.now += 1_000; revs.push((await put(oid, oid, { 'if-none-match': '*' })).body.rev) }
  const feed = (/** @type {number} */ after) => relay.call('GET', `/v1/s/${sid}/changes?after=${after}`, { token: first.token })
  const page = await feed(0)
  assert.deepEqual([page.body.changes.map((/** @type {any} */ one) => one.oid), page.body.last, page.body.more], [oids.slice(0, 2), revs[1], true])
  const rest = await feed(page.body.last)
  assert.deepEqual([rest.body.changes.map((/** @type {any} */ one) => one.oid), rest.body.last, rest.body.more], [[oids[2]], revs[2], false])
  assert.deepEqual((await feed(revs[2])).body, { changes: [], last: revs[2], more: false })
  // A deletion carries its own sealed meta, and names the version it ends.
  relay.clock.now += 1_000
  const gone = await relay.call('DELETE', `/v1/s/${sid}/o`, { token: first.token, json: { meta: 'sealed deletion', epoch: 0 }, headers: { 'store-object': oids[0], 'if-match': String(revs[0]) } })
  assert.equal(gone.status, 200)
  assert.deepEqual((await feed(revs[2])).body.changes, [{ oid: oids[0], rev: gone.body.rev, epoch: 0, meta: 'sealed deletion', parts: [], gone: true }])
  assert.equal((await relay.call('DELETE', `/v1/s/${sid}/o`, { token: first.token, json: { meta: 'again', epoch: 0 }, headers: { 'store-object': oids[0], 'if-match': String(gone.body.rev) } })).status, 412)
  // Made again over its deletion, as a new file at the same path.
  assert.equal((await put(oids[0], 'back', { 'if-none-match': '*' })).status, 200)
})

test('the daily sweep drops deletions past their days, which sends an older cursor back to the start, and parts no version names, a day on', async () => {
  const relay = relayed()
  const { sid, first } = await made(relay)
  const put = putter(relay.call, sid, first.token)
  const [a, b] = [random(16), random(16)]
  const ra = (await put(a, 'a', { 'if-none-match': '*' })).body.rev
  relay.clock.now += 1_000
  const rb = (await put(b, 'b', { 'if-none-match': '*' })).body.rev
  relay.clock.now += 1_000
  await relay.call('DELETE', `/v1/s/${sid}/o`, { token: first.token, json: { meta: 'gone', epoch: 0 }, headers: { 'store-object': a, 'if-match': String(ra) } })
  // b's next version names another part: its first stays a day, for a reader still fetching it.
  relay.clock.now += 1_000
  await put(b, 'b two', { 'if-match': String(rb) })
  const parts = async () => (await relay.backend.parts(sid)).map((one) => one.hash).sort()
  const [pa, pb, pb2] = await Promise.all(['a', 'b', 'b two'].map(async (text) => (await partOf(text)).name))
  await relay.handle.tidyStore?.(sid, relay.clock.now)
  assert.deepEqual(await parts(), [pa, pb, pb2].sort())
  await relay.handle.tidyStore?.(sid, relay.clock.now + 2 * DAY)
  assert.deepEqual(await parts(), [pb2])
  const used = (await relay.call('GET', `/v1/s/${sid}`, { token: first.token })).body.use
  // Ninety days on, the deletion goes, and a cursor from before it reads again from 0.
  relay.clock.now += 91 * DAY
  await relay.handle.tidyStore?.(sid, relay.clock.now)
  const feed = await relay.call('GET', `/v1/s/${sid}/changes?after=${ra}`, { token: first.token })
  assert.equal(feed.body.reset, true)
  assert.deepEqual((await relay.call('GET', `/v1/s/${sid}/changes?after=0`, { token: first.token })).body.changes.map((/** @type {any} */ one) => one.oid), [b])
  assert.equal((await relay.call('GET', `/v1/s/${sid}`, { token: first.token })).body.use, used - 'gone'.length - 1_024)
  // Nobody using it for half a year, it goes.
  await relay.handle.tidyStore?.(sid, relay.clock.now + 184 * DAY)
  assert.equal(await relay.backend.store(sid), null)
})

test('a device joins with the proof; an epoch removes devices, never to come back, and takes a new proof and envelopes in one write', async () => {
  const relay = relayed({ stores: { devices: 3 } })
  const { sid, first, proof } = await made(relay)
  const [second, third, fourth] = [await device(), await device(), await device()]
  const join = (/** @type {Awaited<ReturnType<typeof device>>} */ one, with_ = proof, epoch = 0) => relay.call('POST', `/v1/s/${sid}/devices`, { token: first.token, json: { id: one.id, token: one.hash, epoch }, headers: { 'store-proof': with_ } })
  assert.equal((await join(second, random(32))).status, 403)
  assert.equal((await join(second)).status, 200)
  assert.equal((await relay.call('GET', `/v1/s/${sid}`, { token: second.token })).status, 200)
  assert.equal((await join(third)).status, 200)
  assert.equal((await join(fourth)).status, 409)
  // An envelope for a device already in.
  await relay.call('POST', `/v1/s/${sid}/devices`, { token: first.token, json: { id: second.id, envelope: 'sealed for second', epoch: 0 }, headers: { 'store-proof': proof } })
  assert.equal((await relay.call('GET', `/v1/s/${sid}`, { token: second.token })).body.envelope, 'sealed for second')

  const next = random(32)
  // An epoch without its next proof is refused.
  assert.equal((await relay.call('POST', `/v1/s/${sid}/epoch`, { token: first.token, json: { epoch: 1, remove: [third.id], envelopes: {} }, headers: { 'store-proof': proof } })).status, 400)
  const removal = await relay.call('POST', `/v1/s/${sid}/epoch`, { token: first.token,
    json: { epoch: 1, remove: [third.id], proof: await hashOf(next), envelopes: { [first.id]: 'e1 for first', [second.id]: 'e1 for second', [third.id]: 'never' } }, headers: { 'store-proof': proof } })
  assert.deepEqual([removal.status, removal.body.epoch], [200, 1])
  assert.equal((await relay.call('GET', `/v1/s/${sid}`, { token: third.token })).status, 403)
  const seen = (await relay.call('GET', `/v1/s/${sid}`, { token: second.token })).body
  assert.deepEqual([seen.epoch, seen.envelope, seen.devices.map((/** @type {any} */ one) => one.id)], [1, 'e1 for second', [first.id, second.id]])
  // Another remover that went from epoch 0 is told which came first; the old proof changes nothing now; the removed device stays out.
  const late = await relay.call('POST', `/v1/s/${sid}/epoch`, { token: second.token, json: { epoch: 1, remove: [], proof: await hashOf(random(32)), envelopes: {} }, headers: { 'store-proof': proof } })
  assert.equal(late.status, 403)
  const behind = await relay.call('POST', `/v1/s/${sid}/epoch`, { token: second.token, json: { epoch: 1, remove: [], proof: await hashOf(random(32)), envelopes: {} }, headers: { 'store-proof': next } })
  assert.deepEqual([behind.status, behind.body.epoch], [409, 1])
  assert.equal((await join(third, next, 1)).status, 403)
  // A device the store's keys were sent to comes in by itself, with its own token and the proof; never without the proof, under
  // another token than its own, or as a device removed.
  const itself = (/** @type {Awaited<ReturnType<typeof device>>} */ one, with_ = next, hash = one.hash) => relay.call('POST', `/v1/s/${sid}/devices`, { token: one.token, json: { id: one.id, token: hash, epoch: 1 }, headers: { 'store-proof': with_ } })
  const fifth = await device()
  assert.equal((await itself(fifth, proof)).status, 403)
  assert.equal((await itself(fifth, next, second.hash)).status, 403)
  assert.equal((await itself({ ...third, token: fifth.token, hash: fifth.hash })).status, 403)
  assert.equal((await itself(fifth)).status, 200)
  assert.equal((await relay.call('GET', `/v1/s/${sid}`, { token: fifth.token })).status, 200)
  // A version sealed under the old epoch is refused.
  assert.equal((await putter(relay.call, sid, second.token)(random(16), 'old', { 'if-none-match': '*' }, 0)).status, 409)
  assert.equal((await putter(relay.call, sid, second.token)(random(16), 'new', { 'if-none-match': '*' }, 1)).status, 200)
})

test('a store is deleted whole with its proof, as the last other device leaves, and then opens to nobody', async () => {
  const relay = relayed()
  const { sid, first, proof } = await made(relay)
  await putter(relay.call, sid, first.token)(random(16), 'kept', { 'if-none-match': '*' })
  assert.equal((await relay.call('DELETE', `/v1/s/${sid}`, { token: first.token, headers: { 'store-proof': random(32) } })).status, 403)
  assert.equal((await relay.call('DELETE', `/v1/s/${sid}`, { token: first.token, headers: { 'store-proof': proof } })).status, 200)
  assert.equal((await relay.call('GET', `/v1/s/${sid}`, { token: first.token })).status, 404)
  assert.deepEqual([await relay.backend.store(sid), (await relay.backend.parts(sid)).length], [null, 0])
})

test('each change is recorded once an hour for each store, address and kind, sealed by the backend; reads never are', async () => {
  const memo = memory()
  const relay = relayed({ backend: memo.backend })
  const { sid, first } = await made(relay)
  const put = putter(relay.call, sid, first.token)
  const oid = random(16)
  const { rev } = (await put(oid, 'one', { 'if-none-match': '*' })).body
  await put(oid, 'two', { 'if-match': String(rev) })
  await relay.call('GET', `/v1/s/${sid}/changes?after=0`, { token: first.token })
  await relay.call('GET', `/v1/s/${sid}`, { token: first.token })
  assert.deepEqual(memo.records.map((text) => JSON.parse(text).operation), ['store', 'object'])
  relay.clock.now += 3_600_001
  await put(oid, 'three', { 'if-match': String((await relay.call('GET', `/v1/s/${sid}`, { token: first.token })).body.last) })
  assert.deepEqual(memo.records.map((text) => JSON.parse(text).operation), ['store', 'object', 'object'])
  assert.deepEqual(Object.keys(JSON.parse(memo.records[0])).sort(), ['address', 'at', 'operation', 'port', 'protocol', 'store'])
})

test('a network makes a few stores a day, counted across a restart', async () => {
  const memo = memory()
  const first = relayed({ stores: { made: 2 }, backend: memo.backend })
  const make = (/** @type {ReturnType<typeof relayed>} */ relay) => relay.call('PUT', `/v1/s/${random(16)}`, { token: random(32), json: { id: random(16), proof: random(32) } })
  assert.deepEqual([(await make(first)).status, (await make(first)).status, (await make(first)).status], [201, 201, 429])
  const again = relayed({ stores: { made: 2 }, backend: memo.backend })
  assert.equal((await make(again)).status, 429)
  assert.equal((await again.call('PUT', `/v1/s/${random(16)}`, { token: random(32), json: { id: random(16), proof: random(32) }, address: '198.51.100.9' })).status, 201)
})

test('the folder keeps a store as the memory does: its file, its versions, its parts, swept', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jean-stores-'))
  try {
    const store = folder(dir, null)
    // Limits that fit any disk the tests run on.
    const small = { free: 1_000, quota: 1_000_000 }
    const relay = relayed({ stores: small, backend: /** @type {any} */ (store) })
    const { sid, first } = await made(relay)
    const oid = random(16)
    const one = await putter(relay.call, sid, first.token)(oid, 'on disk', { 'if-none-match': '*' })
    assert.equal(one.status, 200)
    assert.deepEqual((await readdir(join(dir, 'stores', sid))).sort(), ['b', 'o', 'store.json'])
    // Read again from disk by a relay that never saw it.
    const fresh = relayed({ stores: small, backend: /** @type {any} */ (folder(dir, null)) })
    const feed = await fresh.call('GET', `/v1/s/${sid}/changes?after=0`, { token: first.token })
    assert.deepEqual(feed.body.changes.map((/** @type {any} */ change) => [change.oid, change.meta]), [[oid, 'sealed meta of on disk']])
    const part = await fresh.call('GET', `/v1/s/${sid}/b`, { token: first.token, headers: { 'store-part': feed.body.changes[0].parts[0] } })
    assert.equal(new TextDecoder().decode(part.body), 'on disk')
    await store.sweep(relay.handle, relay.clock.now + 184 * DAY)
    assert.deepEqual(await readdir(join(dir, 'stores')), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
