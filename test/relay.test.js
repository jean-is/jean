// The relay (relay/, D45 · D226): mailboxes for messages sealed between people's devices, each named
// by the hash of the token that opens it, as the share host names shares (D361).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { relay, LIMITS } from '../relay/relay.js'
import { folder } from '../relay/serve.js'

/** @param {Uint8Array} bytes */
const base64url = (bytes) => Buffer.from(bytes).toString('base64url')
/** A mailbox's token, and the id it opens: its SHA-256's first 16 bytes. */
async function mailbox() {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const id = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).slice(0, 16))
  return { token, id }
}

/** A store in memory, its records kept to look at. @returns {import('../relay/relay.js').Store & { records: any[], bodies: Map<string, Uint8Array>, boxes: Map<string, any>, room: number }} */
function memory() {
  const boxes = new Map()
  const bodies = new Map()
  /** @type {any[]} */
  const records = []
  return {
    boxes, bodies, records, room: Infinity,
    box: async (id) => structuredClone(boxes.get(id) ?? null),
    save: async (id, box) => { boxes.set(id, structuredClone(box)) },
    add: async (id, seq, body) => { bodies.set(`${id}/${seq}`, body) },
    read: async (id, seq) => bodies.get(`${id}/${seq}`) ?? null,
    drop: async (id, seqs) => { for (const seq of seqs) bodies.delete(`${id}/${seq}`) },
    remove: async (id) => { boxes.delete(id); for (const key of [...bodies.keys()]) if (key.startsWith(`${id}/`)) bodies.delete(key) },
    record: async (text) => { records.push(JSON.parse(text)) },
    async free() { return this.room },
  }
}

const JEAN = 'https://jean.example'
const CLIENT = { address: '203.0.113.7', port: 51234, protocol: 'HTTP/1.1' }

/** A relay on a store in memory, and a way to ask it. @param {Partial<import('../relay/relay.js').Config>} [config] */
function relayOn(config = {}) {
  const store = memory()
  const handle = relay({ origins: [JEAN], store, ...config })
  /** @param {string} path @param {RequestInit & { origin?: string | null, token?: string, client?: typeof CLIENT }} [init] */
  const ask = (path, { origin = JEAN, token, client = CLIENT, ...init } = {}) => handle(new Request(`https://relay.example${path}`,
    { ...init, headers: { ...(origin && { origin }), ...(token && { authorization: `Bearer ${token}` }), ...init.headers } }), client)
  /** @param {string} id @param {string} token @param {object} [what] */
  const open = (id, token, what) => ask(`/v1/m/${id}`, { method: 'PUT', token, ...(what && { body: JSON.stringify(what) }) })
  /** @param {string} id @param {string | Uint8Array} body @param {RequestInit & { client?: typeof CLIENT }} [init] */
  const send = (id, body, init = {}) => ask(`/v1/m/${id}`, { method: 'POST', body: /** @type {BodyInit} */ (body), ...init })
  /** @param {string} id @param {string} token @param {string} [query] */
  const read = async (id, token, query = '') => {
    const response = await ask(`/v1/m/${id}${query}`, { token })
    return { status: response.status, body: await response.json() }
  }
  return { store, ask, open, send, read }
}

test('a mailbox opens with its token, the one whose hash names it, and anyone may leave a message in it', async () => {
  const { store, ask, open, send } = relayOn()
  const box = await mailbox()
  const other = await mailbox()
  assert.equal((await send(box.id, 'sealed')).status, 404, 'nobody opened it yet')
  assert.equal((await ask(`/v1/m/${box.id}`, { method: 'PUT' })).status, 401)
  assert.equal((await open(box.id, other.token)).status, 403, 'another token never opens it')
  assert.equal((await open(box.id, box.token)).status, 201)
  assert.equal((await open(box.id, box.token)).status, 200, 'opening it again changes nothing')
  const sent = await send(box.id, 'sealed')
  assert.equal(sent.status, 201)
  assert.deepEqual(await sent.json(), { seq: 1 })
  assert.equal((await send(box.id, 'sealed again')).status, 201)
  // The store keeps the token's hash only, never the token.
  assert.ok(!JSON.stringify([...store.boxes.values()]).includes(box.token))
  // Each change is recorded with where it came from; a read never is.
  assert.deepEqual(store.records.map((record) => [record.operation, record.id, record.address, record.port]),
    [['open', box.id, CLIENT.address, CLIENT.port], ['message', box.id, CLIENT.address, CLIENT.port], ['message', box.id, CLIENT.address, CLIENT.port]])
})

test('reading takes the token, gives what came after a point, and takes as read what came before', async () => {
  const { store, ask, open, send, read } = relayOn()
  const box = await mailbox()
  await open(box.id, box.token)
  await send(box.id, 'one')
  await send(box.id, 'two')
  assert.equal((await ask(`/v1/m/${box.id}`)).status, 401)
  assert.equal((await read(box.id, (await mailbox()).token)).status, 403)
  const first = await read(box.id, box.token)
  assert.equal(first.status, 200)
  assert.deepEqual(first.body.messages.map((/** @type {any} */ message) => [message.seq, message.size, Buffer.from(message.body, 'base64url').toString()]), [[1, 3, 'one'], [2, 3, 'two']])
  assert.equal(typeof first.body.now, 'number', 'the relay says its time, for clocks that are off')
  // Reading after 1 takes 1 as read: it goes.
  const after = await read(box.id, box.token, '?after=1')
  assert.deepEqual(after.body.messages.map((/** @type {any} */ message) => message.seq), [2])
  assert.equal(store.bodies.has(`${box.id}/1`), false)
  assert.equal((await store.box(box.id))?.messages.length, 1)
  assert.equal(store.records.filter((record) => record.operation === 'read').length, 0)
})

test('a message too large to come whole is read on its own', async () => {
  const { ask, open, send, read } = relayOn()
  const box = await mailbox()
  await open(box.id, box.token)
  const big = Uint8Array.from({ length: LIMITS.inline + 1 }, (_, i) => i % 251)
  await send(box.id, big)
  const { body } = await read(box.id, box.token)
  assert.equal(body.messages[0].body, undefined)
  assert.equal(body.messages[0].size, big.length)
  assert.equal((await ask(`/v1/m/${box.id}/1`)).status, 401)
  const whole = await ask(`/v1/m/${box.id}/1`, { token: box.token })
  assert.equal(whole.headers.get('content-type'), 'application/octet-stream')
  assert.deepEqual(new Uint8Array(await whole.arrayBuffer()), big)
  assert.equal((await ask(`/v1/m/${box.id}/9`, { token: box.token })).status, 404)
})

test('a read waits for a message, and several devices may wait on one mailbox', async () => {
  const { open, send, read } = relayOn()
  const box = await mailbox()
  await open(box.id, box.token)
  const waiting = [read(box.id, box.token, '?wait=25'), read(box.id, box.token, '?wait=25')]
  await new Promise((resolve) => setTimeout(resolve, 20))
  await send(box.id, 'here')
  for (const { body } of await Promise.all(waiting)) assert.deepEqual(body.messages.map((/** @type {any} */ message) => message.seq), [1])
  // With nothing to come, a short wait ends empty.
  const started = Date.now()
  const empty = await read(box.id, box.token, '?after=1&wait=0.05')
  assert.deepEqual(empty.body.messages, [])
  assert.ok(Date.now() - started >= 40)
})

test('a mailbox opened once takes one message, then refuses', async () => {
  const { open, send } = relayOn()
  const box = await mailbox()
  await open(box.id, box.token, { once: true })
  assert.equal((await send(box.id, 'hello')).status, 201)
  assert.equal((await send(box.id, 'hello, me too')).status, 409)
})

test('deleting a mailbox takes all it holds, and only its token may', async () => {
  const { store, ask, open, send } = relayOn()
  const box = await mailbox()
  await open(box.id, box.token)
  await send(box.id, 'one')
  assert.equal((await ask(`/v1/m/${box.id}`, { method: 'DELETE' })).status, 401)
  assert.equal((await ask(`/v1/m/${box.id}`, { method: 'DELETE', token: box.token })).status, 200)
  assert.equal(store.boxes.has(box.id), false)
  assert.equal(store.bodies.size, 0)
  assert.equal((await send(box.id, 'two')).status, 404)
  assert.deepEqual(store.records.at(-1)?.operation, 'delete')
})

test('a message lasts its days, and goes once past them', async () => {
  let now = Date.parse('2026-11-07T10:00:00Z')
  const { store, open, send, read } = relayOn({ now: () => now })
  const box = await mailbox()
  await open(box.id, box.token)
  await send(box.id, 'old')
  now += (LIMITS.days * 86_400_000) + 1
  await send(box.id, 'new')
  const { body } = await read(box.id, box.token)
  assert.deepEqual(body.messages.map((/** @type {any} */ message) => message.seq), [2])
  assert.equal(store.bodies.has(`${box.id}/1`), false)
})

test('the limits: a message’s size, a mailbox’s count, bytes and changes, a network’s bytes a day, the disk’s floor', async () => {
  const small = { message: 100, messages: 2, bytes: 150, writes: 4, sent: 1_000, free: 1_000 }
  {
    const { open, send } = relayOn({ limits: small })
    const box = await mailbox()
    await open(box.id, box.token)
    assert.equal((await send(box.id, 'x'.repeat(101))).status, 413)
    assert.equal((await send(box.id, 'x'.repeat(100))).status, 201)
    assert.equal((await send(box.id, 'x'.repeat(60))).status, 507, 'past the bytes a mailbox holds')
    assert.equal((await send(box.id, 'x'.repeat(10))).status, 201)
    assert.equal((await send(box.id, 'x')).status, 507, 'past the messages a mailbox holds')
  }
  {
    const { open, send, read } = relayOn({ limits: small })
    const box = await mailbox()
    await open(box.id, box.token)
    for (const n of [1, 2, 3, 4]) {
      assert.equal((await send(box.id, 'x')).status, 201)
      await read(box.id, box.token, `?after=${n}`)
    }
    assert.equal((await send(box.id, 'x')).status, 429, 'past the changes a mailbox takes in an hour')
  }
  {
    const { open, send } = relayOn({ limits: { ...small, sent: 150, writes: 100, messages: 100, bytes: 10_000 } })
    const [one, two] = [await mailbox(), await mailbox()]
    await open(one.id, one.token)
    await open(two.id, two.token)
    assert.equal((await send(one.id, 'x'.repeat(100))).status, 201)
    assert.equal((await send(two.id, 'x'.repeat(60))).status, 429, 'past what one network sends in a day')
    // Another network isn't held back; an IPv6 network counts as one, whatever its last half.
    assert.equal((await send(two.id, 'x'.repeat(60), { client: { ...CLIENT, address: '2001:db8:1:2::7' } })).status, 201)
    assert.equal((await send(two.id, 'x'.repeat(100), { client: { ...CLIENT, address: '2001:db8:1:2:aaaa::9' } })).status, 429)
  }
  {
    const { store, open, send } = relayOn({ limits: small })
    const box = await mailbox()
    await open(box.id, box.token)
    store.room = 999
    assert.equal((await send(box.id, 'x')).status, 507, 'under the disk’s floor')
  }
})

test('only the Jeans it serves reach it, and a poll costs no second preflight', async () => {
  const { ask, open } = relayOn()
  const box = await mailbox()
  assert.equal((await ask(`/v1/m/${box.id}`, { method: 'PUT', token: box.token, origin: 'https://evil.example' })).status, 403)
  assert.equal((await ask(`/v1/m/${box.id}`, { method: 'PUT', token: box.token, origin: null })).status, 403)
  const preflight = await ask(`/v1/m/${box.id}`, { method: 'OPTIONS' })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-max-age'), '7200')
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /authorization/)
  const opened = await open(box.id, box.token)
  assert.equal(opened.headers.get('access-control-allow-origin'), JEAN)
  assert.equal(opened.headers.get('cache-control'), 'no-store')
  const about = await ask('/', { origin: null })
  assert.equal(about.status, 200)
  assert.equal((await about.json()).format, 1)
  assert.equal((await ask('/v1/m/nope', { token: box.token })).status, 404)
})

test('the folder keeps mailboxes and their messages, seals its records, and sweeps what is past its time', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jean-relay-'))
  try {
    const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
    const store = folder(dir, keys.publicKey)
    let now = Date.parse('2026-11-07T10:00:00Z')
    const handle = relay({ origins: [JEAN], store, now: () => now })
    const box = await mailbox()
    const ask = (/** @type {string} */ path, /** @type {RequestInit} */ init = {}) => handle(new Request(`https://relay.example${path}`, { ...init, headers: { origin: JEAN, authorization: `Bearer ${box.token}`, ...init.headers } }), CLIENT)
    await ask(`/v1/m/${box.id}`, { method: 'PUT' })
    await ask(`/v1/m/${box.id}`, { method: 'POST', body: 'sealed' })
    const { messages } = await (await ask(`/v1/m/${box.id}`)).json()
    assert.equal(Buffer.from(messages[0].body, 'base64url').toString(), 'sealed')
    const [day] = await readdir(join(dir, 'records'))
    const { readFile } = await import('node:fs/promises')
    const line = (await readFile(join(dir, 'records', day), 'utf8')).split('\n')[0]
    assert.doesNotMatch(line, /203\.0\.113\.7/, 'records are sealed to the key')
    assert.ok(await store.free() > 0)
    // A mailbox nobody opened or read for its idle days goes, with what it held.
    now += 91 * 86_400_000
    await store.sweep(now)
    assert.equal(await store.box(box.id), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
