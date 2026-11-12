// SPDX-License-Identifier: MIT
// The relay's journals (relay/journal.js, D733): what people work on together, as an ordered list of changes the relay numbers
// and can't read, kept 7 days after the last. Three tokens: read (the id is its hash), write, owner. A tombstone, 90 days, says
// what became of one that expired, was deleted or moved, so that only its own write token opens it again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { relay } from '../relay/relay.js'
import { JOURNAL } from '../relay/journal.js'
import { folder } from '../relay/serve.js'

const DAY = 86_400_000
const JEAN = 'https://jean.example'
const CLIENT = { address: '203.0.113.7', port: 51234, protocol: 'HTTP/1.1' }
/** @param {Uint8Array} bytes */
const base64url = (bytes) => Buffer.from(bytes).toString('base64url')
const token = () => base64url(crypto.getRandomValues(new Uint8Array(32)))
/** @param {string | Uint8Array} what */
const sha = async (what) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof what === 'string' ? new TextEncoder().encode(what) : what)))
/** A journal's three tokens, and the id the read token names. */
async function tokens() {
  const [read, write, owner] = [token(), token(), token()]
  return { read, write, owner, id: base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(read))).slice(0, 16)) }
}

/** A backend in memory, its records kept to look at. */
function memory() {
  const journals = new Map()
  const changes = new Map()
  const parts = new Map()
  /** @type {any[]} */
  const records = []
  return {
    journals, changes, parts, records, room: Infinity,
    box: async () => null, save: async () => {}, add: async () => {}, read: async () => null, drop: async () => {}, remove: async () => {},
    record: async (/** @type {string} */ text) => { records.push(JSON.parse(text)) },
    async free() { return this.room },
    journal: async (/** @type {string} */ id) => structuredClone(journals.get(id) ?? null),
    saveJournal: async (/** @type {string} */ id, /** @type {any} */ meta) => { journals.set(id, structuredClone(meta)) },
    removeJournal: async (/** @type {string} */ id) => {
      journals.delete(id)
      for (const map of [changes, parts]) for (const key of [...map.keys()]) if (key.startsWith(`${id}/`)) map.delete(key)
    },
    journalIds: async () => [...journals.keys()],
    addChange: async (/** @type {string} */ id, /** @type {number} */ seq, /** @type {Uint8Array} */ bytes) => { changes.set(`${id}/${seq}`, bytes) },
    change: async (/** @type {string} */ id, /** @type {number} */ seq) => changes.get(`${id}/${seq}`) ?? null,
    dropChange: async (/** @type {string} */ id, /** @type {number} */ seq) => { changes.delete(`${id}/${seq}`) },
    addJournalPart: async (/** @type {string} */ id, /** @type {string} */ hash, /** @type {Uint8Array} */ bytes) => { parts.set(`${id}/${hash}`, bytes) },
    journalPart: async (/** @type {string} */ id, /** @type {string} */ hash) => parts.get(`${id}/${hash}`) ?? null,
    dropJournalPart: async (/** @type {string} */ id, /** @type {string} */ hash) => { parts.delete(`${id}/${hash}`) },
  }
}

/** A relay with journals on a backend in memory, its clock moved by hand, and ways to ask it. @param {Partial<typeof JOURNAL>} [journals] */
function relayOn(journals = {}) {
  const store = memory()
  const clock = { at: Date.parse('2026-11-09T12:00:00Z') }
  const handle = relay({ origins: [JEAN], store: /** @type {any} */ (store), journals: { stream: 2, beat: 0.2, ...journals }, now: () => clock.at })
  /** @param {string} path @param {RequestInit & { client?: typeof CLIENT, origin?: string }} [init] */
  const ask = (path, { client = CLIENT, origin = JEAN, ...init } = {}) => handle(new Request(`https://relay.example${path}`, { ...init, headers: { origin, ...init.headers } }), client)
  /** @param {Awaited<ReturnType<typeof tokens>>} t */
  const open = async (t) => ask(`/v1/j/${t.id}`, { method: 'PUT', body: JSON.stringify({ owner: await sha(t.owner) }), headers: { authorization: `Bearer ${t.read}`, 'journal-write': t.write } })
  /** @param {Awaited<ReturnType<typeof tokens>>} t @param {string | Uint8Array} body @param {Record<string, string> & { client?: typeof CLIENT }} [headers] */
  const post = (t, body, { client, ...headers } = {}) => ask(`/v1/j/${t.id}`, { method: 'POST', body: /** @type {BodyInit} */ (body), client, headers: { authorization: `Write ${t.write}`, ...headers } })
  /** Journals read together (D737), each after `after`: a stream, or a long poll with `wait`. @param {Awaited<ReturnType<typeof tokens>>[]} ts @param {{ after?: number, wait?: number, client?: typeof CLIENT, origin?: string }} [options] */
  const read = (ts, { after = 0, wait, ...init } = {}) => ask(`/v1/j${wait === undefined ? '' : `?wait=${wait}`}`, { method: 'POST', body: JSON.stringify(ts.map((t) => ({ read: t.read, after }))), ...init })
  /** One journal read once: its changes after a point, its next number, and how it ended, if it did. @param {Awaited<ReturnType<typeof tokens>>} t @param {number} [after] @param {number} [wait] */
  const poll = async (t, after = 0, wait = 0) => {
    const got = (await lines(await read([t], { after, wait }))).filter((one) => one.id === t.id)
    const { id: _, ...ended } = got.find((one) => one.expired || one.deleted || one.moved || one.gone) ?? {}
    return { changes: got.filter((one) => one.seq), next: got.find((one) => one.next)?.next, ended: _ && ended }
  }
  return { store, clock, handle, ask, open, post, read, poll }
}

/** The lines a stream sends until `until` says enough, or it ends. @param {Response} response @param {(lines: any[]) => boolean} [until] */
async function lines(response, until = () => false) {
  const reader = /** @type {ReadableStream<Uint8Array>} */ (response.body).getReader()
  const decoder = new TextDecoder()
  /** @type {any[]} */
  const out = []
  let rest = ''
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    rest += decoder.decode(part.value, { stream: true })
    const whole = rest.split('\n')
    rest = /** @type {string} */ (whole.pop())
    out.push(...whole.filter(Boolean).map((line) => JSON.parse(line)))
    if (until(out)) { await reader.cancel(); break }
  }
  return out
}
const text = (/** @type {string} */ body) => new TextDecoder().decode(Buffer.from(body, 'base64url'))

test('without `journals` in its configuration the relay keeps none, and says so at its root', async () => {
  const handle = relay({ origins: [JEAN], store: /** @type {any} */ (memory()) })
  const t = await tokens()
  assert.equal((await handle(new Request(`https://relay.example/v1/j/${t.id}`, { method: 'PUT', headers: { origin: JEAN, authorization: `Bearer ${t.read}`, 'journal-write': t.write } }))).status, 404)
  assert.equal((await handle(new Request('https://relay.example/v1/j', { method: 'POST', body: '[]', headers: { origin: JEAN } }))).status, 404)
  assert.equal((await (await handle(new Request('https://relay.example/'))).json()).journals, undefined)
  const { ask } = relayOn()
  assert.deepEqual((await (await ask('/')).json()).journals, { change: JOURNAL.change, part: JOURNAL.part, days: JOURNAL.days })
})

test('three tokens: the read token names it and reads, the write token creates and posts, the owner token deletes; none is kept', async () => {
  const { store, ask, open, post, poll } = relayOn()
  const t = await tokens()
  const other = await tokens()
  assert.equal((await ask(`/v1/j/${t.id}`, { method: 'PUT', body: '{}', headers: { authorization: `Bearer ${t.read}` } })).status, 401, 'a write token creates it')
  assert.equal((await ask(`/v1/j/${t.id}`, { method: 'PUT', body: '{}', headers: { authorization: `Bearer ${other.read}`, 'journal-write': t.write } })).status, 403, 'only the read token whose hash names it')
  assert.equal((await open(t)).status, 201)
  assert.equal((await post(t, 'sealed', { authorization: `Write ${other.write}` })).status, 403, 'another write token posts nothing')
  assert.equal((await post(t, 'sealed', { authorization: `Bearer ${t.read}` })).status, 401, 'a read token posts nothing: a link to view stays one')
  const sent = await post(t, 'sealed')
  assert.equal(sent.status, 201)
  assert.deepEqual(Object.keys(await sent.json()).sort(), ['at', 'seq'])
  assert.deepEqual((await poll(other)).ended, { gone: true }, 'another journal, never made, reads as none')
  assert.deepEqual((await poll(t)).changes.map((/** @type {any} */ one) => [one.seq, text(one.body)]), [[1, 'sealed']])
  assert.equal((await ask(`/v1/j/${t.id}`, { method: 'DELETE', headers: { authorization: `Owner ${t.write}` } })).status, 403, 'the write token deletes nothing')
  const kept = JSON.stringify([...store.journals.values()])
  for (const one of [t.read, t.write, t.owner]) assert.ok(!kept.includes(one), 'tokens are kept as hashes, never as they are')
  assert.equal((await ask(`/v1/j/${t.id}`, { method: 'DELETE', headers: { authorization: `Owner ${t.owner}` } })).status, 200)
})

test('two members creating it at once: one is told it made it, the other that it was already open; under another write token, refused', async () => {
  const { open, ask } = relayOn()
  const t = await tokens()
  const [first, second] = await Promise.all([open(t), open(t)])
  assert.deepEqual([first.status, second.status].sort(), [200, 201])
  assert.equal((await ask(`/v1/j/${t.id}`, { method: 'PUT', body: '{}', headers: { authorization: `Bearer ${t.read}`, 'journal-write': token() } })).status, 403)
})

test('changes are numbered in order; a read gives what came after a point, and one from past the last reads from the start', async () => {
  const { open, post, poll } = relayOn()
  const t = await tokens()
  await open(t)
  for (const word of ['one', 'two', 'three']) assert.equal((await post(t, word)).status, 201)
  assert.deepEqual((await poll(t, 1)).changes.map((/** @type {any} */ one) => text(one.body)), ['two', 'three'])
  const later = await poll(t, 99)
  assert.deepEqual(later.changes.map((/** @type {any} */ one) => one.seq), [1, 2, 3])
  assert.equal(later.next, 4)
  // Unlike a mailbox, reading takes nothing away: every member reads all of it.
  assert.equal((await poll(t)).changes.length, 3)
})

test('one stream reads several journals: what came after each one’s point, then each change and fleeting message as it comes, named by its journal, the clock now and then', async () => {
  const { open, post, ask, read } = relayOn({ stream: 1, beat: 0.2 })
  const [t, u] = [await tokens(), await tokens()]
  await open(t)
  await open(u)
  await post(t, 'before', { 'journal-seed': '1' })
  await post(u, 'u one')
  await post(u, 'u two')
  const response = await read([t, u])
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/x-ndjson')
  const all = lines(response)
  await new Promise((resolve) => setTimeout(resolve, 50))
  await post(t, 'during')
  await post(u, 'u three')
  await ask(`/v1/j/${u.id}/fleeting`, { method: 'POST', body: 'here', headers: { authorization: `Write ${u.write}` } })
  const got = await all
  assert.ok(got[0].now && !got[0].id, 'first, the relay’s clock')
  assert.deepEqual(got.filter((one) => one.next).map((one) => [one.id, one.next]), [[t.id, 2], [u.id, 3]], 'each journal’s next number, before its changes')
  assert.deepEqual(got.filter((one) => one.seq).map((one) => [one.id, one.seq, text(one.body), Boolean(one.seed)]),
    [[t.id, 1, 'before', true], [u.id, 1, 'u one', false], [u.id, 2, 'u two', false], [t.id, 2, 'during', false], [u.id, 3, 'u three', false]])
  assert.deepEqual(got.filter((one) => one.fleeting).map((one) => [one.id, text(one.fleeting)]), [[u.id, 'here']])
  assert.ok(got.filter((one) => one.now && !one.id).length >= 3, 'its clock every beat, so that a proxy holding the stream back is noticed')
  // Each read from its own point: the second journal after its first change.
  const after = await lines(await ask('/v1/j?wait=0', { method: 'POST', body: JSON.stringify([{ read: t.read, after: 2 }, { read: u.read, after: 2 }]) }))
  assert.deepEqual(after.filter((one) => one.seq).map((one) => [one.id, one.seq]), [[u.id, 3]])
})

test('a journal not there, expired or deleted says so at once in the stream, and one that ends leaves the others going', async () => {
  const { open, post, ask, read, handle, clock } = relayOn({ stream: 5 })
  const [kept, missing, expired, deleted, ending] = [await tokens(), await tokens(), await tokens(), await tokens(), await tokens()]
  for (const one of [kept, expired, deleted, ending]) await open(one)
  clock.at += 8 * DAY
  await handle.tidyJournal?.(expired.id, clock.at)
  await post(kept, 'kept open')
  await ask(`/v1/j/${deleted.id}`, { method: 'DELETE', headers: { authorization: `Owner ${deleted.owner}` } })
  await post(ending, 'one')
  const all = lines(await read([kept, missing, expired, deleted, ending]), (got) => got.some((one) => one.seq && one.id === kept.id && text(one.body) === 'after'))
  await new Promise((resolve) => setTimeout(resolve, 50))
  await ask(`/v1/j/${ending.id}`, { method: 'DELETE', headers: { authorization: `Owner ${ending.owner}` } })
  await post(kept, 'after')
  const got = await all
  assert.deepEqual(got.filter((one) => one.gone || one.expired || one.deleted).map((one) => [one.id, Object.keys(one).filter((key) => key !== 'id')[0]]),
    [[missing.id, 'gone'], [expired.id, 'expired'], [deleted.id, 'deleted'], [ending.id, 'deleted']])
  assert.deepEqual(got.filter((one) => one.seq).map((one) => [one.id, text(one.body)]), [[kept.id, 'kept open'], [ending.id, 'one'], [kept.id, 'after']])
})

test('a fleeting message reaches every open stream and is never kept; it takes the write token', async () => {
  const { open, ask, read, poll } = relayOn({ stream: 1 })
  const t = await tokens()
  await open(t)
  const headers = { authorization: `Bearer ${t.read}` }
  const reads = [lines(await read([t]), (got) => got.some((one) => one.fleeting)),
    lines(await read([t], { client: { ...CLIENT, address: '198.51.100.9' } }), (got) => got.some((one) => one.fleeting))]
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal((await ask(`/v1/j/${t.id}/fleeting`, { method: 'POST', body: 'hi', headers })).status, 401, 'a link to view says nothing')
  assert.equal((await ask(`/v1/j/${t.id}/fleeting`, { method: 'POST', body: 'hi', headers: { authorization: `Write ${t.write}` } })).status, 202)
  for (const got of await Promise.all(reads)) assert.deepEqual(got.filter((one) => one.fleeting).map((one) => text(one.fleeting)), ['hi'])
  assert.deepEqual((await poll(t)).changes, [])
})

test('a long poll, for networks whose proxies hold a stream back: what came at once, or the first change to come in any of its journals within its wait', async () => {
  const { open, post, read } = relayOn()
  const [t, u] = [await tokens(), await tokens()]
  await open(t)
  await open(u)
  const started = Date.now()
  const waiting = lines(await read([t, u], { wait: 5 }))
  await new Promise((resolve) => setTimeout(resolve, 50))
  await post(u, 'came')
  const got = await waiting
  assert.ok(Date.now() - started < 1_000, 'answered as the change came')
  assert.deepEqual(got.filter((one) => one.seq).map((one) => [one.id, text(one.body)]), [[u.id, 'came']])
  await post(t, 'waiting already')
  const now = await lines(await read([t, u], { after: 0, wait: 5 }))
  assert.deepEqual(now.filter((one) => one.seq).map((one) => text(one.body)), ['waiting already', 'came'], 'what came after each point, at once')
})

test('a read is a POST of at most 64 read tokens, each journal once; a journal itself is never read with GET', async () => {
  const { open, ask, read } = relayOn()
  const t = await tokens()
  await open(t)
  for (const body of ['', 'not json', '[]', '{}', JSON.stringify([{ read: 'short' }]), JSON.stringify([{ after: 0 }])]) {
    assert.equal((await ask('/v1/j', { method: 'POST', body })).status, 400, body)
  }
  assert.equal((await read(await Promise.all(Array.from({ length: 65 }, tokens)), { wait: 0 })).status, 400, 'past 64')
  assert.equal((await read(await Promise.all(Array.from({ length: 64 }, tokens)), { wait: 0 })).status, 200)
  const twice = await lines(await read([t, t], { wait: 0 }))
  assert.equal(twice.filter((one) => one.next).length, 1, 'a journal named twice is read once')
  assert.equal((await ask(`/v1/j/${t.id}?after=0`, { headers: { authorization: `Bearer ${t.read}` } })).status, 405)
  assert.equal((await ask('/v1/j', { headers: { authorization: `Bearer ${t.read}` } })).status, 405)
})

test('parts: named by the SHA-256 of their sealed bytes, read with the read token; a change names only parts that are there', async () => {
  const { open, post, ask } = relayOn()
  const t = await tokens()
  await open(t)
  const bytes = crypto.getRandomValues(new Uint8Array(1_000))
  const name = await sha(bytes)
  assert.equal((await ask(`/v1/j/${t.id}/p/${await sha('else')}`, { method: 'PUT', body: bytes, headers: { authorization: `Write ${t.write}` } })).status, 400, 'a part is what its name says')
  assert.equal((await post(t, 'names it', { 'journal-parts': name })).status, 400, 'not there yet')
  assert.equal((await ask(`/v1/j/${t.id}/p/${name}`, { method: 'PUT', body: bytes, headers: { authorization: `Bearer ${t.read}` } })).status, 401)
  assert.equal((await ask(`/v1/j/${t.id}/p/${name}`, { method: 'PUT', body: bytes, headers: { authorization: `Write ${t.write}` } })).status, 201)
  assert.equal((await post(t, 'names it', { 'journal-parts': name })).status, 201)
  const got = await ask(`/v1/j/${t.id}/p/${name}`, { headers: { authorization: `Bearer ${t.read}` } })
  assert.deepEqual(new Uint8Array(await got.arrayBuffer()), bytes)
})

test('it expires 7 days after its last change: a tombstone keeps its tokens’ hashes 90 days, and only its own write token opens it again, numbering on', async () => {
  const { open, post, poll, ask, handle, clock, store } = relayOn()
  const t = await tokens()
  await open(t)
  await post(t, 'one')
  await post(t, 'two')
  clock.at += 6 * DAY
  await handle.tidyJournal?.(t.id, clock.at)
  assert.equal((await poll(t)).changes.length, 2, 'within its days, all stays')
  clock.at += 2 * DAY
  await handle.tidyJournal?.(t.id, clock.at)
  assert.deepEqual((await poll(t)).ended, { expired: true }, 'a member knows to start it again, from their copy')
  assert.equal(store.changes.size, 0)
  assert.equal((await post(t, 'late')).status, 404)
  assert.equal((await ask(`/v1/j/${t.id}`, { method: 'PUT', body: '{}', headers: { authorization: `Bearer ${t.read}`, 'journal-write': token() } })).status, 403, 'a removed member’s junk never takes it')
  assert.equal((await open(t)).status, 201)
  assert.deepEqual(await (await post(t, 'again')).json(), { seq: 3, at: clock.at })
  clock.at += 8 * DAY + 91 * DAY
  await handle.tidyJournal?.(t.id, clock.at)
  await handle.tidyJournal?.(t.id, clock.at + 91 * DAY)
  assert.equal(store.journals.size, 0, 'the tombstone goes after its 90 days')
})

test('deleted by its owner: nothing more, its streams told; moved: posts refused, the last change, the owner’s `moved`, readable 90 days', async () => {
  const { open, post, poll, ask, read, handle, clock, store } = relayOn({ stream: 5 })
  const deleted = await tokens()
  await open(deleted)
  await post(deleted, 'one')
  const stream = lines(await read([deleted]), (got) => got.some((one) => one.deleted))
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal((await ask(`/v1/j/${deleted.id}`, { method: 'DELETE', headers: { authorization: `Owner ${deleted.owner}` } })).status, 200)
  assert.ok((await stream).some((one) => one.deleted && one.id === deleted.id), 'an open stream is told')
  assert.deepEqual((await poll(deleted)).ended, { deleted: true })
  assert.equal((await open(deleted)).status, 410, 'stopped: nobody starts it again')
  assert.equal((await post(deleted, 'two')).status, 410)

  const moved = await tokens()
  await open(moved)
  await post(moved, 'one')
  await post(moved, 'moved, sealed to each member left')
  assert.equal((await ask(`/v1/j/${moved.id}/moved`, { method: 'POST', headers: { authorization: `Write ${moved.write}` } })).status, 403, 'the owner alone')
  assert.equal((await ask(`/v1/j/${moved.id}/moved`, { method: 'POST', headers: { authorization: `Owner ${moved.owner}` } })).status, 200)
  assert.equal((await post(moved, 'after')).status, 410)
  const last = await poll(moved)
  assert.deepEqual(last.ended, { moved: true })
  assert.deepEqual(last.changes.map((/** @type {any} */ one) => text(one.body)), ['moved, sealed to each member left'], 'a member back after weeks finds where everyone went')
  assert.equal(store.changes.size, 1)
  clock.at += 91 * DAY
  await handle.tidyJournal?.(moved.id, clock.at)
  assert.deepEqual((await poll(moved)).ended, { gone: true })
})

test('trimming: past its days or its bytes, what came before the newest seed ten minutes old goes, with the parts only those changes named', async () => {
  const { open, post, poll, ask, handle, clock, store } = relayOn({ bytes: 20_000 })
  const t = await tokens()
  await open(t)
  const bytes = crypto.getRandomValues(new Uint8Array(6_000))
  const name = await sha(bytes)
  await ask(`/v1/j/${t.id}/p/${name}`, { method: 'PUT', body: bytes, headers: { authorization: `Write ${t.write}` } })
  await post(t, 'old', { 'journal-parts': name })
  await post(t, 'seed', { 'journal-seed': '1' })
  clock.at += 5 * 60_000
  await post(t, 'after the seed')
  clock.at += 2 * DAY
  await handle.tidyJournal?.(t.id, clock.at)
  assert.equal((await poll(t)).changes.length, 3, 'within 7 days nothing goes: a locked phone catches up from the changes')
  clock.at += 6 * DAY - 60_000
  await post(t, 'keeps it open')
  await handle.tidyJournal?.(t.id, clock.at)
  assert.deepEqual((await poll(t)).changes.map((/** @type {any} */ one) => text(one.body)), ['seed', 'after the seed', 'keeps it open'])
  assert.equal(store.parts.size, 0, 'the part only the trimmed change named goes with it')
  // Past its bytes: before the newest seed ten minutes old, all goes at once; with nothing before one to let go, the journal is full.
  const big = 'x'.repeat(9_000)
  assert.equal((await post(t, big)).status, 201)
  assert.equal((await post(t, big)).status, 201)
  assert.equal((await post(t, big)).status, 507, 'nothing before a seed ten minutes old to let go: full until a newer one comes')
  await post(t, 'seed two', { 'journal-seed': '1' })
  clock.at += 11 * 60_000
  assert.equal((await post(t, big)).status, 201)
  assert.deepEqual((await poll(t)).changes.map((/** @type {any} */ one) => text(one.body).slice(0, 8)), ['seed two', big.slice(0, 8)])
})

test('the limits: a change’s size, changes a minute, fleeting messages a second, streams, journals a network opens, bytes a day, the disk', async () => {
  const { open, post, ask, read, store } = relayOn({ change: 100, perMinute: 3, fleetingPerSecond: 3, fleetingPerNetwork: 2, streams: 2, streamsPerNetwork: 1, opens: 2, sent: 1_000 })
  const t = await tokens()
  await open(t)
  assert.equal((await post(t, 'x'.repeat(101))).status, 413)
  for (let n = 0; n < 3; n++) assert.equal((await post(t, 'x')).status, 201)
  assert.equal((await post(t, 'x')).status, 429, 'changes a minute')
  const fleeting = (/** @type {string} */ address) => ask(`/v1/j/${t.id}/fleeting`, { method: 'POST', body: 'f', client: { ...CLIENT, address }, headers: { authorization: `Write ${t.write}` } })
  assert.deepEqual([(await fleeting('192.0.2.1')).status, (await fleeting('192.0.2.1')).status, (await fleeting('192.0.2.1')).status], [202, 202, 429], 'a network’s share')
  assert.deepEqual([(await fleeting('192.0.2.2')).status, (await fleeting('192.0.2.3')).status], [202, 429], 'the journal’s')
  const first = await read([t])
  const second = await read([t])
  assert.equal(second.status, 200, 'the same network again: its older stream ends, as a reconnect leaves one behind')
  const ended = await lines(first)
  assert.ok(ended.length >= 1)
  const third = await read([t], { client: { ...CLIENT, address: '198.51.100.1' } })
  const fourth = await lines(await read([t], { client: { ...CLIENT, address: '198.51.100.2' } }), (got) => got.some((one) => one.busy))
  assert.deepEqual(fourth.filter((one) => one.id), [{ id: t.id, busy: true }], 'the journal’s streams: left out of this one, read when it is opened again')
  for (const response of [second, third]) await response.body?.cancel()
  assert.equal((await open(await tokens())).status, 201)
  assert.equal((await open(await tokens())).status, 429, 'journals a network opens in an hour')
  const bytes = crypto.getRandomValues(new Uint8Array(900))
  const other = await tokens()
  const { open: open2, ask: ask2 } = relayOn({ sent: 1_000 })
  await open2(other)
  assert.equal((await ask2(`/v1/j/${other.id}/p/${await sha(bytes)}`, { method: 'PUT', body: bytes, headers: { authorization: `Write ${other.write}` } })).status, 201)
  assert.equal((await ask2(`/v1/j/${other.id}/p/${await sha(bytes.slice(1))}`, { method: 'PUT', body: bytes.slice(1), headers: { authorization: `Write ${other.write}` } })).status, 429, 'bytes a network sends in a day')
  store.room = 0
  assert.equal((await post(t, 'y', { client: { ...CLIENT, address: '192.0.2.200' } })).status, 507, 'under the disk’s floor')
})

test('only the Jeans it serves; the preflight allows its headers; each write recorded with its address once an hour, no read ever', async () => {
  const { open, post, poll, ask, store } = relayOn()
  const t = await tokens()
  assert.equal((await ask('/v1/j?wait=0', { method: 'POST', origin: 'https://elsewhere.example', body: JSON.stringify([{ read: t.read, after: 0 }]) })).status, 403)
  const preflight = await ask(`/v1/j/${t.id}`, { method: 'OPTIONS' })
  for (const header of ['journal-write', 'journal-seed', 'journal-parts']) assert.ok(preflight.headers.get('access-control-allow-headers')?.includes(header))
  await open(t)
  await post(t, 'one')
  await post(t, 'two')
  await poll(t)
  assert.deepEqual(store.records.map((one) => [one.journal, one.operation, one.address]), [[t.id, 'open', CLIENT.address], [t.id, 'change', CLIENT.address]])
})

test('the folder keeps journals, their changes and parts, and the daily sweep expires them and drops their tombstones', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jean-journals-'))
  try {
    const store = folder(dir, null)
    const at = Date.parse('2026-11-09T12:00:00Z')
    const clock = { at }
    const handle = relay({ origins: [JEAN], store, journals: {}, now: () => clock.at })
    const t = await tokens()
    const ask = (/** @type {string} */ path, /** @type {RequestInit} */ init = {}) => handle(new Request(`https://relay.example${path}`, { ...init, headers: { origin: JEAN, ...init.headers } }), CLIENT)
    assert.equal((await ask(`/v1/j/${t.id}`, { method: 'PUT', body: JSON.stringify({ owner: await sha(t.owner) }), headers: { authorization: `Bearer ${t.read}`, 'journal-write': t.write } })).status, 201)
    const bytes = new TextEncoder().encode('a part')
    await ask(`/v1/j/${t.id}/p/${await sha(bytes)}`, { method: 'PUT', body: bytes, headers: { authorization: `Write ${t.write}` } })
    assert.equal((await ask(`/v1/j/${t.id}`, { method: 'POST', body: 'kept', headers: { authorization: `Write ${t.write}`, 'journal-parts': await sha(bytes) } })).status, 201)
    const again = relay({ origins: [JEAN], store: folder(dir, null), journals: {}, now: () => clock.at })
    const read = await lines(await again(new Request('https://relay.example/v1/j?wait=0', { method: 'POST', body: JSON.stringify([{ read: t.read, after: 0 }]), headers: { origin: JEAN } }), CLIENT))
    assert.deepEqual(read.filter((one) => one.seq).map((one) => text(one.body)), ['kept'], 'what it kept outlives the process')
    await store.sweep(handle, at + 8 * DAY)
    assert.equal((await store.journal(t.id))?.state, 'expired')
    assert.equal(await store.change(t.id, 1), null)
    await store.sweep(handle, at + 99 * DAY)
    assert.equal(await store.journal(t.id), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
