// Jean's side of the relay (ui/relay.js, D45), against the relay's own handler (relay/relay.js) in this process:
// fetch is a stand-in that hands it each request, from an origin it serves.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { signal } from '@preact/signals-core'
import { relay } from '../relay/relay.js'
import { mailbox, open, send, read, remove, listen, reader } from '../app/ui/relay.js'

const JEAN = 'https://jean.example'
const BASE = 'https://relay.example/'

/** A store in memory, as the relay's own test has. */
function memory() {
  const boxes = new Map()
  const bodies = new Map()
  return {
    boxes, bodies, room: Infinity,
    box: async (/** @type {string} */ id) => structuredClone(boxes.get(id) ?? null),
    save: async (/** @type {string} */ id, /** @type {any} */ box) => { boxes.set(id, structuredClone(box)) },
    add: async (/** @type {string} */ id, /** @type {number} */ seq, /** @type {Uint8Array} */ body) => { bodies.set(`${id}/${seq}`, body) },
    read: async (/** @type {string} */ id, /** @type {number} */ seq) => bodies.get(`${id}/${seq}`) ?? null,
    drop: async (/** @type {string} */ id, /** @type {number[]} */ seqs) => { for (const seq of seqs) bodies.delete(`${id}/${seq}`) },
    remove: async (/** @type {string} */ id) => { boxes.delete(id); for (const key of [...bodies.keys()]) if (key.startsWith(`${id}/`)) bodies.delete(key) },
    record: async () => {},
    async free() { return this.room },
  }
}

/** A relay in this process, which fetch now reaches, and what was asked of it. @param {object} [limits] */
function relayed(limits = {}) {
  const store = memory()
  const handle = relay({ origins: [JEAN], store, limits })
  /** @type {string[]} */
  const asked = []
  globalThis.fetch = (url, init = {}) => new Promise((resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    asked.push(`${init.method ?? 'GET'} ${new URL(String(url)).pathname}`)
    handle(new Request(url, { ...init, headers: { .../** @type {Record<string, string>} */ (init.headers), origin: JEAN } }), { address: '203.0.113.7', port: 51234 }).then(resolve, reject)
  })
  return { store, asked }
}
const bytes = (/** @type {string} */ text) => new TextEncoder().encode(text)
const text = (/** @type {Uint8Array} */ bytes) => new TextDecoder().decode(bytes)
/** What a promise was refused with. @param {Promise<unknown>} promise @returns {Promise<any>} */
const refusal = (promise) => promise.then(() => assert.fail('it was taken'), (error) => error)

test('a mailbox is a fresh token and its id, the start of its SHA-256', async () => {
  const { token, id } = await mailbox()
  assert.match(token, /^[\w-]{43}$/)
  assert.equal(id, createHash('sha256').update(token).digest().subarray(0, 16).toString('base64url'))
  assert.notEqual((await mailbox()).token, token)
})

test('what is sent is read, a small message whole and a large one by its number, and reading past it drops it', async () => {
  const { store, asked } = relayed({ inline: 16 })
  const { token, id } = await mailbox()
  await open(BASE, token)
  const large = crypto.getRandomValues(new Uint8Array(100))
  assert.equal(await send(BASE, id, bytes('hello')), 1)
  assert.equal(await send(BASE, id, large), 2)
  const { messages, now } = await read(BASE, token)
  assert.equal(typeof now, 'number')
  assert.deepEqual(messages.map(({ seq }) => seq), [1, 2])
  assert.equal(text(messages[0].bytes), 'hello')
  assert.deepEqual(messages[1].bytes, large)
  assert.equal(typeof messages[1].at, 'number')
  assert.ok(asked.includes(`GET /v1/m/${id}/2`))
  assert.ok(!asked.includes(`GET /v1/m/${id}/1`))
  assert.deepEqual((await read(BASE, token, { after: 1 })).messages.map(({ seq }) => seq), [2])
  assert.ok(!store.bodies.has(`${id}/1`))
  assert.deepEqual((await read(BASE, token, { after: 2 })).messages, [])
})

test('a mailbox opened once takes one message, then refuses with 409', async () => {
  relayed()
  const { token, id } = await mailbox()
  await open(BASE, token, { once: true })
  await send(BASE, id, bytes('hello'))
  assert.equal((await refusal(send(BASE, id, bytes('again')))).status, 409)
  assert.equal((await read(BASE, token)).messages.length, 1)
})

test('a removed mailbox is gone: reading it and sending to it get 404', async () => {
  const { store } = relayed()
  const { token, id } = await mailbox()
  await open(BASE, token)
  await send(BASE, id, bytes('hello'))
  await remove(BASE, token)
  assert.equal(store.boxes.size, 0)
  assert.equal((await refusal(read(BASE, token))).status, 404)
  assert.equal((await refusal(send(BASE, id, bytes('hello')))).status, 404)
})

test('each refusal carries its status, and a network failure stays a TypeError', async () => {
  const { token, id } = await mailbox()
  relayed({ message: 10 })
  await open(BASE, token)
  const large = await refusal(send(BASE, id, bytes('more than ten bytes')))
  assert.ok(large instanceof Error)
  assert.equal(large.status, 413)
  relayed({ writes: 1 })
  await open(BASE, token)
  await send(BASE, id, bytes('one'))
  assert.equal((await refusal(send(BASE, id, bytes('two')))).status, 429)
  relayed({ messages: 1 })
  await open(BASE, token)
  await send(BASE, id, bytes('one'))
  assert.equal((await refusal(send(BASE, id, bytes('two')))).status, 507)
  const { store } = relayed()
  store.room = 0
  await open(BASE, token)
  assert.equal((await refusal(send(BASE, id, bytes('one')))).status, 507)
  globalThis.fetch = async () => { throw new TypeError('fetch failed') }
  const offline = await refusal(read(BASE, token))
  assert.ok(offline instanceof TypeError)
  assert.equal(offline.status, undefined)
})

test('listen hands each batch in order, reads past it, and reads no more once stopped', async () => {
  const { store } = relayed()
  const { token, id } = await mailbox()
  await open(BASE, token)
  await send(BASE, id, bytes('one'))
  /** @type {string[][]} */
  const batches = []
  await new Promise((resolve) => {
    const stop = listen({ base: BASE, token, lock: 'relay-test', onMessages: async (messages) => {
      batches.push(messages.map((message) => text(message.bytes)))
      if (batches.length === 1) await send(BASE, id, bytes('two'))
      else resolve(stop())
    } })
  })
  assert.deepEqual(batches, [['one'], ['two']])
  // The first batch was read past, so the relay let it go; the last, not yet.
  assert.deepEqual(store.boxes.get(id).messages.map((/** @type {any} */ entry) => entry.seq), [2])
  await send(BASE, id, bytes('three'))
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(batches.length, 2)
  await remove(BASE, token)
})

test('a tab that takes the lock takes the reading from the one that held it', async () => {
  relayed()
  const { token, id } = await mailbox()
  await open(BASE, token)
  /** @type {string[]} */
  const first = []
  const stopFirst = listen({ base: BASE, token, lock: 'relay-steal', onMessages: (messages) => { first.push(...messages.map((message) => text(message.bytes))) } })
  await new Promise((resolve) => setTimeout(resolve, 20))
  const second = await new Promise((resolve) => {
    const stop = listen({ base: BASE, token, lock: 'relay-steal', onMessages: (messages) => { stop(); resolve(messages.map((message) => text(message.bytes))) } })
    setTimeout(() => send(BASE, id, bytes('one')), 20)
  })
  assert.deepEqual(second, ['one'])
  assert.deepEqual(first, [])
  stopFirst()
  await remove(BASE, token)
})

test('a pairing’s reader hands out one message at a time, and only what it handed out goes from the relay', async () => {
  relayed()
  const { token, id } = await mailbox()
  await open(BASE, token)
  for (const one of ['kept', 'a list after it']) await send(BASE, id, bytes(one))
  const clock = /** @type {number[]} */ ([])
  const next = reader(BASE, token, new AbortController().signal, (now) => clock.push(now))
  assert.equal(text(await next()), 'kept')
  await next.done()
  assert.deepEqual((await read(BASE, token)).messages.map((one) => text(one.bytes)), ['a list after it'], 'what came in the same read stays for the listening after')
  assert.equal(clock.length, 1)
})

test('listening hears the relay’s clock at each read, opens its mailbox again when the relay lost it, and reads it from the start', { timeout: 10_000 }, async () => {
  const { store } = relayed()
  const { token, id } = await mailbox()
  await open(BASE, token)
  await send(BASE, id, bytes('one'))
  const clock = /** @type {number[]} */ ([])
  /** @type {string[]} */
  const heard = []
  await new Promise((resolve) => {
    const stop = listen({ base: BASE, token, lock: 'relay-lost', clock: (now) => clock.push(now), onMessages: async (messages) => {
      heard.push(...messages.map((message) => text(message.bytes)))
      // The relay loses its store: the mailbox is gone, then opened again by the listening, and what comes next is heard.
      if (heard.length === 1) { store.boxes.clear(); setTimeout(() => send(BASE, id, bytes('two')).catch(() => {}), 1500) }
      else resolve(stop())
    } })
  })
  assert.deepEqual(heard, ['one', 'two'])
  assert.ok(clock.length > 0 && clock.every((now) => typeof now === 'number'))
  await remove(BASE, token)
})

test('listening reads its mailbox from the start once the relay’s next number is at or below what it read, as after a rollback', { timeout: 10_000 }, async () => {
  const { store } = relayed()
  const { token, id } = await mailbox()
  await open(BASE, token)
  for (const one of ['one', 'two']) await send(BASE, id, bytes(one))
  // Rolled back to before both, the relay answers the next read at once; three messages come in right after it, before the read after.
  const relayed1 = globalThis.fetch
  let phase = 0
  globalThis.fetch = async (url, init) => {
    const reading = phase > 0 && new URL(String(url)).search !== ''
    const answer = await relayed1(reading ? String(url).replace(/wait=\d+/, 'wait=0') : url, init)
    if (reading && phase === 1) { phase = 2; for (const one of ['three', 'four', 'five']) await send(BASE, id, bytes(one)) }
    return answer
  }
  /** @type {string[]} */
  const heard = []
  await new Promise((resolve) => {
    const stop = listen({ base: BASE, token, lock: 'relay-rollback', onMessages: (messages) => {
      heard.push(...messages.map((message) => text(message.bytes)))
      if (heard.length === 2) { store.boxes.set(id, { ...store.boxes.get(id), next: 1, messages: [] }); phase = 1 }
      if (heard.includes('five')) resolve(stop())
    } })
  })
  assert.deepEqual(heard, ['one', 'two', 'three', 'four', 'five'])
  await remove(BASE, token)
})

test('listening asks `lost` what to do with a mailbox the relay lost, and opens nothing it refuses', { timeout: 10_000 }, async () => {
  const { store } = relayed()
  const { token, id } = await mailbox()
  await open(BASE, token)
  const lost = /** @type {string[]} */ ([])
  await new Promise((resolve) => {
    store.boxes.clear()
    const stop = listen({ base: BASE, token, lock: 'relay-gone', onMessages: () => {}, lost: async (_, gone) => { lost.push(gone); resolve(stop()) } })
  })
  assert.deepEqual([lost, store.boxes.has(id)], [[token], false])
})

test('listening pauses a second after an empty answer that came long before its wait, never reading in a spin', { timeout: 10_000 }, async () => {
  relayed()
  const { token } = await mailbox()
  await open(BASE, token)
  // A relay that answers at once whatever the wait.
  const relayed1 = globalThis.fetch
  let reads = 0
  globalThis.fetch = async (url, init) => {
    if (new URL(String(url)).search) reads++
    return relayed1(new URL(String(url)).search ? String(url).replace(/wait=\d+/, 'wait=0') : url, init)
  }
  const stop = listen({ base: BASE, token, lock: 'relay-spin', onMessages: () => {} })
  await new Promise((resolve) => setTimeout(resolve, 1500))
  stop()
  assert.ok(reads <= 3, `${reads} reads in 1.5 s`)
})

test('listening holds back while `quiet` is true: nothing read, a wait under way ended as it turns true, and what came read once it is false', { timeout: 10_000 }, async () => {
  const { asked } = relayed()
  const { token, id } = await mailbox()
  await open(BASE, token)
  const quiet = signal(true)
  /** @type {string[]} */
  const heard = []
  const reads = () => asked.filter((one) => one.startsWith('GET ')).length
  const until = async (/** @type {() => boolean} */ done) => { while (!done()) await new Promise((resolve) => setTimeout(resolve, 10)) }
  const stop = listen({ base: BASE, token, lock: 'relay-quiet', quiet, onMessages: (messages) => { heard.push(...messages.map((message) => text(message.bytes))) } })
  await send(BASE, id, bytes('one'))
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(reads(), 0)
  quiet.value = false
  await until(() => heard.length === 1)
  // Read past 'one', it now waits on the relay; turning quiet ends that wait, and reads nothing more.
  await until(() => reads() === 2)
  quiet.value = true
  await send(BASE, id, bytes('two'))
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.deepEqual([heard, reads()], [['one'], 2])
  quiet.value = false
  await until(() => heard.length === 2)
  stop()
  assert.deepEqual(heard, ['one', 'two'])
})

test('a large message gone as it is fetched is passed over, never failing what came with it', async () => {
  const { store } = relayed({ inline: 4 })
  const { token, id } = await mailbox()
  await open(BASE, token)
  await send(BASE, id, bytes('large enough'))
  await send(BASE, id, bytes('hi'))
  store.bodies.delete(`${id}/1`)
  assert.deepEqual((await read(BASE, token)).messages.map((one) => text(one.bytes)), ['hi'])
})

test('a window whose reading another took reads again as soon as that one is hidden, while it is still in sight', { timeout: 10_000 }, async () => {
  relayed()
  const { token, id } = await mailbox()
  await open(BASE, token)
  /** A page of its own, in sight until hidden. */
  const page = () => { const seen = /** @type {(() => void)[]} */ ([]); return { visibilityState: 'visible', addEventListener: (/** @type {string} */ _, /** @type {() => void} */ fn) => seen.push(fn), removeEventListener: () => {}, hide() { this.visibilityState = 'hidden'; for (const fn of seen) fn() } } }
  const [one, two] = [page(), page()]
  const g = /** @type {any} */ (globalThis)
  const [was, heard] = [g.document, /** @type {string[]} */ ([])]
  g.document = one
  const stopOne = listen({ base: BASE, token, lock: 'relay-two-windows', onMessages: (messages) => { heard.push(...messages.map((message) => text(message.bytes))) } })
  await new Promise((resolve) => setTimeout(resolve, 50))
  g.document = two
  const stopTwo = listen({ base: BASE, token, lock: 'relay-two-windows', onMessages: () => {} })
  g.document = was
  await new Promise((resolve) => setTimeout(resolve, 50))
  two.hide()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await send(BASE, id, bytes('for whoever reads'))
  for (let i = 0; i < 100 && !heard.length; i++) await new Promise((resolve) => setTimeout(resolve, 50))
  stopOne()
  stopTwo()
  assert.deepEqual(heard, ['for whoever reads'])
})
