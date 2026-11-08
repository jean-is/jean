// The relay (relay/, D45 · D226): mailboxes for messages sealed between people's devices, each named
// by the hash of the token that opens it, as the share host names shares (D361).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { relay, LIMITS } from '../relay/relay.js'
import { folder } from '../relay/serve.js'
import { PEOPLE } from '../relay/colleagues.js'

/** @param {Uint8Array} bytes */
const base64url = (bytes) => Buffer.from(bytes).toString('base64url')
/** A mailbox's token, and the id it opens: its SHA-256's first 16 bytes. */
async function mailbox() {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const id = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).slice(0, 16))
  return { token, id }
}

/** A store in memory, its records kept to look at. @returns {import('../relay/relay.js').Store & { records: any[], bodies: Map<string, Uint8Array>, boxes: Map<string, any>, people: Map<string, any>, room: number }} */
function memory() {
  const boxes = new Map()
  const bodies = new Map()
  const people = new Map()
  /** @type {any[]} */
  const records = []
  return {
    boxes, bodies, people, records, room: Infinity,
    entries: async () => structuredClone([...people.values()]),
    saveEntry: async (entry) => { people.set(entry.id, structuredClone(entry)) },
    dropEntry: async (id) => { people.delete(id) },
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
  return { store, handle, ask, open, send, read }
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

test('only a new mailbox counts against what a network opens in an hour: opening one’s own again never does', async () => {
  const { open } = relayOn({ limits: { opens: 2 } })
  const [one, two, three] = [await mailbox(), await mailbox(), await mailbox()]
  assert.equal((await open(one.id, one.token)).status, 201)
  for (let i = 0; i < 5; i++) assert.equal((await open(one.id, one.token)).status, 200)
  assert.equal((await open(two.id, two.token)).status, 201)
  assert.equal((await open(three.id, three.token)).status, 429)
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
    await store.sweep(handle, now)
    assert.equal(await store.box(box.id), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a read says the next message’s number, and one from past it, a reader’s from before a rollback, reads from the start and drops nothing', async () => {
  const { open, send, read } = relayOn()
  const box = await mailbox()
  await open(box.id, box.token)
  await send(box.id, 'one')
  await send(box.id, 'two')
  assert.equal((await read(box.id, box.token)).body.next, 3)
  const stale = await read(box.id, box.token, '?after=40')
  assert.deepEqual([stale.body.messages.map((/** @type {any} */ message) => message.seq), stale.body.next], [[1, 2], 3])
  assert.deepEqual((await read(box.id, box.token)).body.messages.map((/** @type {any} */ message) => message.seq), [1, 2], 'nothing taken as read')
})

test('a mailbox counts what each network sends it: one that fills its share, a stolen device knowing every mailbox, leaves the others theirs', async () => {
  const small = { message: 100, messages: 2, bytes: 1_000, writes: 4, sent: 10_000, free: 1_000, networks: 2 }
  const elsewhere = (/** @type {string} */ address) => ({ client: { ...CLIENT, address } })
  {
    const { open, send } = relayOn({ limits: small })
    const box = await mailbox()
    await open(box.id, box.token)
    for (const n of [1, 2]) assert.equal((await send(box.id, 'x')).status, 201, `message ${n}`)
    assert.equal((await send(box.id, 'x')).status, 507, 'its share of the messages held')
    for (const n of [1, 2]) assert.equal((await send(box.id, 'x', elsewhere('198.51.100.9'))).status, 201, `another network’s ${n}`)
    // The mailbox holds two networks' worth: a third, under its share, takes the room of the oldest of those holding the most; at it, no more.
    assert.equal((await send(box.id, 'x', elsewhere('203.0.113.99'))).status, 201, 'a third network still gets in')
    assert.equal((await send(box.id, 'x', elsewhere('203.0.113.99'))).status, 507, 'the mailbox’s, past its share')
  }
  {
    const { open, send, read } = relayOn({ limits: { ...small, messages: 100 } })
    const box = await mailbox()
    await open(box.id, box.token)
    for (const n of [1, 2, 3, 4]) assert.equal((await send(box.id, 'x')).status, 201, `write ${n}`)
    assert.equal((await send(box.id, 'x')).status, 429, 'its share of an hour’s writes')
    assert.equal((await send(box.id, 'x', elsewhere('198.51.100.9'))).status, 201, 'another network still gets in')
    await read(box.id, box.token, '?after=5')
  }
})

test('the daily sweep tidies each mailbox in its turn: a read and its ack, or a message, meanwhile are never undone', async () => {
  let now = Date.parse('2027-01-04T00:00:00Z')
  const { store, handle, open, send, read } = relayOn({ now: () => now })
  const box = await mailbox()
  await open(box.id, box.token)
  // A device away a week: one message on day 0, two on day 6; on day 7 the sweep drops the first as the device reads and another writes.
  await send(box.id, 'm1')
  now += 6 * 86_400_000
  for (const one of ['m2', 'm3']) await send(box.id, one)
  now += 86_400_000 + 60_000
  const drop = store.drop.bind(store)
  let release = () => {}
  const gate = new Promise((resolve) => { release = () => resolve(undefined) })
  let held = true
  store.drop = async (id, seqs) => { if (held) { held = false; await gate } return drop(id, seqs) }
  const sweeping = handle.tidy(box.id, now)
  await new Promise((resolve) => setTimeout(resolve, 10))
  const reading = (async () => {
    const one = await read(box.id, box.token)
    await read(box.id, box.token, `?after=${one.body.messages.at(-1).seq}`)
    return one
  })()
  const sending = send(box.id, 'm4')
  await new Promise((resolve) => setTimeout(resolve, 10))
  release()
  const [one] = await Promise.all([reading, sweeping, sending])
  const handed = one.body.messages.map((/** @type {any} */ message) => message.seq)
  assert.deepEqual(handed.slice(0, 2), [2, 3], 'the first past its days')
  // Every message read went with its ack; the one that came, if not yet read, stays, its body with it.
  const kept = store.boxes.get(box.id).messages.map((/** @type {any} */ entry) => entry.seq)
  assert.deepEqual(kept, [4].filter((seq) => !handed.includes(seq)))
  for (const seq of kept) assert.ok(store.bodies.has(`${box.id}/${seq}`))
})

test('a read whose messages’ bodies are gone drops them from the mailbox and waits, never answering empty at once', async () => {
  const { store, open, send, read } = relayOn()
  const box = await mailbox()
  await open(box.id, box.token)
  for (const one of ['m1', 'm2']) await send(box.id, one)
  for (const seq of [1, 2]) store.bodies.delete(`${box.id}/${seq}`)
  const asked = Date.now()
  const { body } = await read(box.id, box.token, '?wait=1')
  assert.deepEqual(body.messages, [])
  assert.ok(Date.now() - asked >= 900, 'it waited')
  assert.deepEqual(store.boxes.get(box.id).messages, [])
})

test('a message past its days, asked for by its number, is gone, and the mailbox is left for its own turn to tidy', async () => {
  let now = Date.parse('2027-01-04T00:00:00Z')
  const { store, ask, open, send } = relayOn({ now: () => now })
  const box = await mailbox()
  await open(box.id, box.token)
  await send(box.id, 'old')
  now += 8 * 86_400_000
  assert.equal((await ask(`/v1/m/${box.id}/1`, { token: box.token })).status, 404)
  assert.deepEqual(store.boxes.get(box.id).messages.map((/** @type {any} */ entry) => entry.seq), [1], 'nothing saved outside the turn')
})

test('a message listed whose body is gone answers 404 by its number and leaves the mailbox, so it is never handed out again', async () => {
  const { store, ask, open, send, read } = relayOn({ limits: { inline: 4 } })
  const box = await mailbox()
  await open(box.id, box.token)
  await send(box.id, 'large enough')
  store.bodies.delete(`${box.id}/1`)
  assert.deepEqual((await read(box.id, box.token)).body.messages.map((/** @type {any} */ one) => one.seq), [1], 'listed, too large to come whole')
  assert.equal((await ask(`/v1/m/${box.id}/1`, { token: box.token })).status, 404)
  assert.deepEqual(store.boxes.get(box.id).messages, [])
})

test('one device too many: the oldest wait ends, and the one that took its place is still woken by what comes', async () => {
  const { open, send, read } = relayOn({ limits: { waits: 1 } })
  const box = await mailbox()
  await open(box.id, box.token)
  const first = read(box.id, box.token, '?wait=5')
  await new Promise((resolve) => setTimeout(resolve, 20))
  const asked = Date.now()
  const second = read(box.id, box.token, '?wait=5')
  assert.deepEqual((await first).body.messages, [], 'the oldest wait ends, empty')
  await new Promise((resolve) => setTimeout(resolve, 20))
  await send(box.id, 'hello')
  assert.deepEqual((await second).body.messages.map((/** @type {any} */ one) => one.seq), [1])
  assert.ok(Date.now() - asked < 2_000, 'woken, not left to its wait')
})

test('one network’s counts are changed in place: requests from it at once, a refused read among them, never count over each other', async () => {
  {
    const { open, send } = relayOn({ limits: { sent: 100, writes: 100, messages: 100, bytes: 10_000 } })
    const boxes = [await mailbox(), await mailbox(), await mailbox()]
    for (const box of boxes) await open(box.id, box.token)
    const statuses = (await Promise.all(boxes.map((box) => send(box.id, 'x'.repeat(40))))).map((answer) => answer.status).sort()
    assert.deepEqual(statuses, [201, 201, 429], 'what one network sends in a day, sent at once')
  }
  {
    const { open } = relayOn({ limits: { opens: 2 } })
    const boxes = [await mailbox(), await mailbox(), await mailbox()]
    assert.deepEqual((await Promise.all(boxes.map((box) => open(box.id, box.token)))).map((answer) => answer.status).sort(), [201, 201, 429], 'mailboxes one network opens in an hour')
  }
  {
    const { ask, open, send } = relayOn({ limits: { sent: 100, writes: 100, messages: 100, bytes: 10_000 } })
    const [one, two] = [await mailbox(), await mailbox()]
    for (const box of [one, two]) await open(box.id, box.token)
    // A read without a token, refused, from the same network, as a message is on its way.
    const [sent] = await Promise.all([send(one.id, 'x'.repeat(60)), ask(`/v1/m/${one.id}`), ask(`/v1/m/${two.id}`)])
    assert.equal(sent.status, 201)
    assert.equal((await send(two.id, 'x'.repeat(60))).status, 429, 'the first one counted')
  }
})

test('networks that fill a mailbox’s ceiling never shut out another under its share: an hour’s writes, and the bytes held', async () => {
  const at = (/** @type {number} */ n) => ({ client: { ...CLIENT, address: `198.51.100.${n}` } })
  {
    const { open, send } = relayOn({ limits: { writes: 4, networks: 2, messages: 100, bytes: 100_000 } })
    const box = await mailbox()
    await open(box.id, box.token)
    for (const n of [1, 2]) for (let i = 0; i < 4; i++) assert.equal((await send(box.id, 'x', at(n))).status, 201)
    assert.equal((await send(box.id, 'x', at(3))).status, 201, 'a third network, under its share of the writes')
    assert.equal((await send(box.id, 'x', at(3))).status, 201)
    assert.equal((await send(box.id, 'x', at(3))).status, 429, 'at its share, the mailbox’s ceiling holds')
  }
  {
    const { store, open, send } = relayOn({ limits: { bytes: 100, networks: 2, messages: 100, writes: 100 } })
    const box = await mailbox()
    await open(box.id, box.token)
    for (const n of [1, 2]) assert.equal((await send(box.id, 'x'.repeat(100), at(n))).status, 201)
    assert.equal((await send(box.id, 'y'.repeat(40), at(3))).status, 201, 'a third network, under its share of the bytes')
    const held = store.boxes.get(box.id).messages
    assert.deepEqual([held.length, held.at(-1).size], [2, 40], 'the oldest of those holding the most gave way')
  }
})

test('a message from a network within its share, once taken, is never dropped for another, however small the others’ messages', async () => {
  const at = (/** @type {number} */ n) => ({ client: { ...CLIENT, address: `198.51.100.${n}` } })
  const { store, open, send } = relayOn({ limits: { messages: 8, networks: 4, bytes: 100_000, writes: 100 } })
  const box = await mailbox()
  await open(box.id, box.token)
  // Four networks fill it with one-byte messages; the person's list, one kilobyte, from a fifth, takes room as it is under its share.
  for (const n of [1, 2, 3, 4]) for (let i = 0; i < 8; i++) await send(box.id, 'x', at(n))
  assert.equal((await send(box.id, 'y'.repeat(1_000), at(5))).status, 201)
  // A sixth network: room only from those past their share, never the list.
  await send(box.id, 'z', at(6))
  assert.ok(store.boxes.get(box.id).messages.some((/** @type {any} */ entry) => entry.size === 1_000), 'the list stays')
})

test('a message the store fails to keep gives its bytes back to what its network may send today', async () => {
  const { store, open, send } = relayOn({ limits: { sent: 100, writes: 100, messages: 100, bytes: 10_000 } })
  const box = await mailbox()
  await open(box.id, box.token)
  const add = store.add.bind(store)
  store.add = async () => { throw new Error('disk') }
  await send(box.id, 'x'.repeat(60)).catch(() => {})
  store.add = add
  assert.equal((await send(box.id, 'x'.repeat(60))).status, 201)
})

// ─── Colleagues (D731) ───────────────────────────────────────────────────────

const ISSUER = 'https://login.acme.example/tenant-1/v2.0'
const AUDIENCE = 'jean-at-acme'
const DAY = 86_400_000
/** @param {string | object} value */
const encoded = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

/**
 * An organisation's identity provider on a clock: an ES256 key and an RS256 one, its discovery and keys at their addresses, each fetch
 * counted, and ID tokens it signs, `claims` over Ana's.
 * @param {{ at: number }} clock
 */
async function provider(clock, issuer = ISSUER) {
  const es = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const rs = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const state = {
    keys: [{ ...await crypto.subtle.exportKey('jwk', es.publicKey), kid: 'es-1', use: 'sig' }, { ...await crypto.subtle.exportKey('jwk', rs.publicKey), kid: 'rs-1', alg: 'RS256' }],
    /** @type {string[]} */ fetched: [],
    reachable: true,
  }
  /** @param {RequestInfo | URL} url */
  const fetch = async (url) => {
    state.fetched.push(String(url))
    if (!state.reachable) throw new TypeError('fetch failed')
    if (String(url) === `${issuer}/.well-known/openid-configuration`) return Response.json({ issuer, jwks_uri: `${issuer.replace('/v2.0', '')}/discovery/keys` })
    if (String(url) === `${issuer.replace('/v2.0', '')}/discovery/keys`) return Response.json({ keys: state.keys })
    return new Response('{}', { status: 404 })
  }
  /** @param {Record<string, unknown>} [claims] @param {{ alg?: string, kid?: string, key?: CryptoKey }} [how] */
  const sign = async (claims = {}, { alg = 'ES256', kid = alg === 'RS256' ? 'rs-1' : 'es-1', key } = {}) => {
    const now = Math.floor(clock.at / 1000)
    const data = `${encoded({ alg, kid, typ: 'JWT' })}.${encoded({ iss: issuer, aud: AUDIENCE, sub: 'sub-ana', iat: now, nbf: now, exp: now + 3600, preferred_username: 'ana@acme.example', name: 'Ana Martín', ...claims })}`
    const bytes = new TextEncoder().encode(data)
    const signature = alg === 'none' ? new ArrayBuffer(0)
      : alg === 'HS256' ? await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode('a shared secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), bytes)
        : alg === 'RS256' ? await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key ?? rs.privateKey, bytes) : await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key ?? es.privateKey, bytes)
    return `${data}.${Buffer.from(signature).toString('base64url')}`
  }
  return { state, fetch, sign, es, rs }
}

/** A profile's public key, as People's person keeps it. */
const profileKey = async () => (({ kty, crv, x, y }) => ({ kty, crv, x, y }))(await crypto.subtle.exportKey('jwk', (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])).publicKey))

/** A relay that lists the organisation's people, on a clock, with its provider; and a way to list a mailbox, and to search. @param {Partial<import('../relay/relay.js').Config>} [config] */
async function listingRelay(config = {}) {
  const clock = { at: Date.parse('2026-11-09T10:00:00Z') }
  const idp = await provider(clock)
  const on = relayOn({ issuers: [{ issuer: ISSUER, audience: AUDIENCE }], fetch: idp.fetch, now: () => clock.at, ...config })
  /** A mailbox opened, its token and id. */
  const opened = async () => { const box = await mailbox(); await on.open(box.id, box.token); return box }
  /** @param {{ id: string, token: string }} box @param {string} proof @param {object} [key] @param {object} [more] */
  const list = async (box, proof, key, more = {}) => on.ask(`/v1/people/${box.id}`, { method: 'PUT', token: box.token, body: JSON.stringify({ proof, key: key ?? await profileKey(), ...more }) })
  /** @param {{ token: string }} box @param {string} query */
  const search = async (box, query) => { const response = await on.ask(`/v1/people?${query}`, { token: box.token }); return { status: response.status, people: response.ok ? (await response.json()).people : [] } }
  return { ...on, clock, idp, opened, list, search }
}

test('an organisation’s relay lists whom its sign-in names, the newest key winning, for listed colleagues to find; the proof itself is never kept', async () => {
  const { store, ask, clock, idp, opened, list, search } = await listingRelay()
  assert.deepEqual((await (await ask('/')).json()).issuers, [ISSUER])
  const [ana, bob] = [await opened(), await opened()]
  const anaKey = await profileKey()
  const proof = await idp.sign()
  const listed = await list(ana, proof, anaKey)
  assert.equal(listed.status, 201)
  assert.deepEqual(await listed.json(), { name: 'Ana Martín', account: 'ana@acme.example' })
  assert.equal((await search(bob, 'q=ana')).status, 403, 'only someone listed searches')
  assert.equal((await list(bob, await idp.sign({ sub: 'sub-bob', name: 'Bob Dupont', email: 'bob@acme.example', preferred_username: 'bdupont@acme.example' }, { alg: 'RS256' }))).status, 201, 'RS256 too; the email first')
  const found = await search(bob, 'q=ana')
  assert.equal(found.status, 200)
  assert.deepEqual(found.people, [{ name: 'Ana Martín', account: 'ana@acme.example', mailbox: ana.id, key: anaKey }])
  assert.deepEqual((await search(bob, 'q=martin')).people.map((one) => one.name), ['Ana Martín'], 'accents aside')
  assert.deepEqual((await search(ana, 'q=bob%20dup')).people.map((one) => one.account), ['bob@acme.example'], 'every word')
  assert.deepEqual((await search(bob, 'account=ANA%40acme.example')).people.map((one) => one.mailbox), [ana.id])
  assert.deepEqual((await search(bob, `mailbox=${ana.id}`)).people.map((one) => one.name), ['Ana Martín'])
  assert.deepEqual((await search(bob, 'account=carol%40acme.example')).people, [])
  // Her key turned: the same person, a new key, the entry replaced.
  clock.at += 60_000
  const newer = await profileKey()
  assert.equal((await list(ana, await idp.sign(), newer)).status, 200)
  assert.deepEqual((await search(bob, 'q=ana')).people.map((one) => one.key), [newer])
  // And a new mailbox with it: the old one is off the list and searches no more.
  const moved = await opened()
  assert.equal((await list(moved, await idp.sign(), newer)).status, 200)
  assert.deepEqual((await search(bob, 'q=ana')).people.map((one) => one.mailbox), [moved.id])
  assert.equal((await search(ana, 'q=bob')).status, 403)
  assert.equal(store.people.size, 2)
  const kept = JSON.stringify([...store.people.values()])
  assert.ok(!kept.includes(proof.split('.')[2]) && !kept.includes('"proof"'), 'the proof goes')
  assert.deepEqual(store.records.filter((one) => one.operation === 'list').length, 4)
})

test('a proof is refused unless the organisation signed it, for Jean, now: issuer, audience, its dates, its algorithm and key, an account', async () => {
  const { store, clock, idp, opened, list } = await listingRelay()
  const box = await opened()
  const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
  const now = Math.floor(clock.at / 1000)
  for (const [why, proof] of /** @type {[string, string][]} */ ([
    ['another issuer', await idp.sign({ iss: 'https://login.other.example/v2.0' })],
    ['another audience', await idp.sign({ aud: 'someone-else' })],
    ['two audiences, no azp', await idp.sign({ aud: [AUDIENCE, 'api://gateway'] })],
    ['two audiences, another azp', await idp.sign({ aud: [AUDIENCE, 'api://gateway'], azp: 'api://gateway' })],
    ['another azp', await idp.sign({ azp: 'someone-else' })],
    ['expired past the minute', await idp.sign({ exp: now - 61 })],
    ['no expiry', await idp.sign({ exp: undefined })],
    ['not yet', await idp.sign({ nbf: now + 120 })],
    ['issued ahead', await idp.sign({ iat: now + 120 })],
    ['none', await idp.sign({}, { alg: 'none' })],
    ['HS256', await idp.sign({}, { alg: 'HS256' })],
    ['an unknown kid', await idp.sign({}, { kid: 'es-9' })],
    ['another key under its kid', await idp.sign({}, { key: other.privateKey })],
    ['the ES256 kid for RS256', await idp.sign({}, { alg: 'RS256', kid: 'es-1' })],
    ['no account', await idp.sign({ preferred_username: undefined })],
    ['no subject', await idp.sign({ sub: undefined })],
    ['no token at all', 'not.a.token'],
  ])) assert.equal((await list(box, proof)).status, 403, why)
  assert.equal(store.people.size, 0)
  // Within the minute's leeway, and for two audiences where Jean is the one it was given to.
  assert.equal((await list(box, await idp.sign({ exp: now - 30 }))).status, 201)
  assert.equal((await list(box, await idp.sign({ aud: [AUDIENCE, 'api://gateway'], azp: AUDIENCE }))).status, 200)
})

test('the issuer’s keys are kept a day and fetched again for a kid it doesn’t know at most every five minutes; keys named in the configuration are never fetched', async () => {
  const { clock, idp, opened, list } = await listingRelay()
  const box = await opened()
  assert.equal((await list(box, await idp.sign())).status, 201)
  assert.deepEqual(idp.state.fetched, [`${ISSUER}/.well-known/openid-configuration`, 'https://login.acme.example/tenant-1/discovery/keys'])
  assert.equal((await list(box, await idp.sign({}, { alg: 'RS256' }))).status, 200)
  assert.equal(idp.state.fetched.length, 2, 'kept')
  // The provider rolls its key: a minute after the last fetch, not fetched again; five minutes on, fetched for the kid it lacks.
  const rolled = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  idp.state.keys.push({ ...await crypto.subtle.exportKey('jwk', rolled.publicKey), kid: 'es-2' })
  clock.at += 60_000
  assert.equal((await list(box, await idp.sign({}, { kid: 'es-2', key: rolled.privateKey }))).status, 403)
  assert.equal(idp.state.fetched.length, 2, 'not within five minutes of the last fetch')
  clock.at += 5 * 60_000
  assert.equal((await list(box, await idp.sign({}, { kid: 'es-3', key: rolled.privateKey }))).status, 403)
  assert.equal(idp.state.fetched.length, 4, 'fetched again for a kid it lacked')
  assert.equal((await list(box, await idp.sign({}, { kid: 'es-2', key: rolled.privateKey }))).status, 200, 'the rolled key came with it')
  assert.equal((await list(box, await idp.sign({}, { kid: 'es-3', key: rolled.privateKey }))).status, 403)
  assert.equal(idp.state.fetched.length, 4)
  // A day on, fetched again; out of reach, nothing is listed and the relay says why.
  clock.at += DAY
  idp.state.reachable = false
  const unreachable = await list(box, await idp.sign())
  assert.equal(unreachable.status, 503)
  // Named in the configuration, as a set or at an address of their own (Entra's for an app with claims mapping).
  const set = await listingRelay()
  const inline = await listingRelay({ issuers: [{ issuer: ISSUER, audience: AUDIENCE, jwks: { keys: set.idp.state.keys } }], fetch: set.idp.fetch })
  assert.equal((await inline.list(await inline.opened(), await set.idp.sign())).status, 201)
  assert.deepEqual(set.idp.state.fetched, [])
  const at = await listingRelay({ issuers: [{ issuer: ISSUER, audience: AUDIENCE, jwks: 'https://login.acme.example/tenant-1/discovery/keys?appid=jean-at-acme' }] })
  await at.list(await at.opened(), await at.idp.sign())
  assert.deepEqual(at.idp.state.fetched, ['https://login.acme.example/tenant-1/discovery/keys?appid=jean-at-acme'])
})

test('only a listed mailbox searches the list: three letters at least, ten people at most, sixty searches an hour', async () => {
  const { ask, clock, idp, opened, list, search } = await listingRelay()
  const ana = await opened()
  await list(ana, await idp.sign())
  for (let n = 1; n <= 12; n++) await list(await opened(), await idp.sign({ sub: `sub-${n}`, name: `Colleague ${String(n).padStart(2, '0')}`, preferred_username: `c${n}@acme.example` }))
  const found = await search(ana, 'q=colleague')
  assert.equal(found.people.length, PEOPLE.results)
  assert.deepEqual(found.people.slice(0, 2).map((one) => one.name), ['Colleague 01', 'Colleague 02'], 'by name')
  assert.equal((await search(ana, 'q=co')).status, 400)
  assert.equal((await search(ana, 'q=%20%20c%20o')).status, 400)
  assert.equal((await ask('/v1/people?q=colleague')).status, 401)
  assert.equal((await search(await opened(), 'q=colleague')).status, 403)
  for (let n = 1; n < PEOPLE.searches; n++) await search(ana, 'q=colleague')
  assert.equal((await search(ana, 'q=colleague')).status, 429)
  clock.at += 3_600_000
  // Its own listing lapsing meanwhile is a month away: an hour on, it searches again.
  assert.equal((await search(ana, 'q=colleague')).status, 200)
})

test('a listing lapses a month after its last proof; off the list, by its owner or by forget, nobody finds it', async () => {
  const { store, handle, clock, idp, opened, list, search, ask } = await listingRelay()
  const [ana, bob] = [await opened(), await opened()]
  await list(ana, await idp.sign())
  await list(bob, await idp.sign({ sub: 'sub-bob', name: 'Bob Dupont', preferred_username: 'bob@acme.example' }))
  clock.at += (PEOPLE.lapse + 1) * DAY
  await list(bob, await idp.sign({ sub: 'sub-bob', name: 'Bob Dupont', preferred_username: 'bob@acme.example' }))
  assert.deepEqual((await search(bob, 'q=ana')).people, [], 'lapsed')
  await /** @type {any} */ (handle).tidyPeople(clock.at)
  assert.deepEqual([...store.people.values()].map((one) => one.account), ['bob@acme.example'])
  assert.equal((await ask(`/v1/people/${bob.id}`, { method: 'DELETE', token: ana.token })).status, 403)
  assert.equal((await ask(`/v1/people/${bob.id}`, { method: 'DELETE', token: bob.token })).status, 200)
  assert.equal(store.people.size, 0)
  // The folder keeps one file a person, and forgets a leaver while the relay runs.
  const dir = await mkdtemp(join(tmpdir(), 'jean-relay-'))
  try {
    const kept = folder(dir, null)
    await kept.saveEntry(/** @type {any} */ ({ id: 'a', account: 'Ana@acme.example', proved: 1 }))
    await kept.saveEntry(/** @type {any} */ ({ id: 'b', account: 'bob@acme.example', proved: 1 }))
    assert.equal((await kept.entries()).length, 2)
    assert.equal(await kept.forget('ana@ACME.example'), 1)
    assert.deepEqual((await kept.entries()).map((one) => one.id), ['b'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('listing needs the mailbox open with its token, a P-256 key and a proof of a few kilobytes; a relay that names no issuer lists nobody', async () => {
  const { ask, idp, opened, list } = await listingRelay()
  const box = await mailbox()
  assert.equal((await list(box, await idp.sign())).status, 404, 'not open')
  const open = await opened()
  assert.equal((await list({ id: open.id, token: box.token }, await idp.sign())).status, 403, 'another token')
  assert.equal((await ask(`/v1/people/${open.id}`, { method: 'PUT', body: '{}' })).status, 401)
  assert.equal((await list(open, await idp.sign(), { kty: 'RSA', n: 'x', e: 'AQAB' })).status, 400)
  assert.equal((await list(open, await idp.sign(), { kty: 'EC', crv: 'P-256', x: 'A'.repeat(43), y: 'A'.repeat(43) })).status, 400, 'not on the curve')
  assert.equal((await list(open, await idp.sign(), undefined, { chain: ['x'.repeat(PEOPLE.body)] })).status, 413)
  assert.equal((await ask(`/v1/people/${open.id}`, { method: 'PUT', token: open.token, origin: 'https://elsewhere.example', body: '{}' })).status, 403)
  const none = relayOn()
  assert.equal((await (await none.ask('/')).json()).issuers, undefined)
  assert.equal((await none.ask('/v1/people?q=ana', { token: open.token })).status, 404)
})
