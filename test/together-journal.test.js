// The relay's journals from Jean's side (caps/together/journal.js, D733), against relay/journal.js served on a real port.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { relay } from '../relay/relay.js'
import { listener } from '../host/serve.js'
import { create, post, putPart, getPart, say, end, follow, journalOf } from '../app/caps/together/journal.js'

const JEAN = 'https://jean.example'
const token = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
const sha = async (/** @type {string} */ text) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('base64url')
// A browser names its origin; Node's fetch doesn't, so the relay is told here as Jean's page would tell it.
const real = globalThis.fetch
globalThis.fetch = (url, init = {}) => real(url, { ...init, headers: { origin: JEAN, ...init.headers } })

/** A relay with journals on a port, in memory, and a journal's place on it. */
async function served() {
  const store = new Map()
  const backend = {
    record: async () => {}, journal: async (/** @type {string} */ id) => structuredClone(store.get(`j ${id}`) ?? null), saveJournal: async (/** @type {string} */ id, /** @type {any} */ meta) => { store.set(`j ${id}`, structuredClone(meta)) },
    removeJournal: async (/** @type {string} */ id) => { store.delete(`j ${id}`) }, journalIds: async () => [],
    addChange: async (/** @type {string} */ id, /** @type {number} */ seq, /** @type {Uint8Array} */ bytes) => { store.set(`c ${id} ${seq}`, bytes) }, change: async (/** @type {string} */ id, /** @type {number} */ seq) => store.get(`c ${id} ${seq}`) ?? null,
    dropChange: async (/** @type {string} */ id, /** @type {number} */ seq) => { store.delete(`c ${id} ${seq}`) },
    addJournalPart: async (/** @type {string} */ id, /** @type {string} */ hash, /** @type {Uint8Array} */ bytes) => { store.set(`p ${id} ${hash}`, bytes) }, journalPart: async (/** @type {string} */ id, /** @type {string} */ hash) => store.get(`p ${id} ${hash}`) ?? null,
    dropJournalPart: async (/** @type {string} */ id, /** @type {string} */ hash) => { store.delete(`p ${id} ${hash}`) },
  }
  const server = createServer(listener(relay({ origins: [JEAN], store: /** @type {any} */ (backend), journals: { stream: 2, beat: 1 } }), false))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const base = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}/`
  const [read, write, owner] = [token(), token(), token()]
  return { server, base, owner, where: { base, id: await journalOf(read), read, write } }
}

test('a journal made, followed as a stream: each change in order, fleeting messages, and its end when deleted', async () => {
  const { server, where, owner } = await served()
  try {
    assert.equal(await create(where, await sha(owner)), 'made')
    assert.equal(await create(where, await sha(owner)), 'open')
    await post(where, new TextEncoder().encode('one'), { seed: true })
    const name = await putPart(where, new TextEncoder().encode('a part'))
    assert.equal(new TextDecoder().decode(await getPart(where, name)), 'a part')
    /** @type {string[]} */
    const seen = []
    const ended = new Promise((resolve) => {
      follow({ ...where, after: 0, signal: new AbortController().signal, onChange: async (line, bytes) => { seen.push(`${line.seq} ${new TextDecoder().decode(bytes)}`) },
        onFleeting: (bytes) => seen.push(`~ ${new TextDecoder().decode(bytes)}`), onEnd: resolve })
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    await post(where, new TextEncoder().encode('two'), { parts: [name] })
    await say(where, new TextEncoder().encode('here'))
    await new Promise((resolve) => setTimeout(resolve, 100))
    await end(where, owner, 'delete')
    assert.deepEqual(await ended, { deleted: true })
    assert.deepEqual(seen, ['1 one', '2 two', '~ here'])
    await assert.rejects(post(where, new TextEncoder().encode('three')), (/** @type {any} */ error) => error.status === 410)
  } finally {
    server.closeAllConnections()
    server.close()
  }
})

test('a follower picks up after the stream ends, from the last change it saw, and is told when the journal moved', async () => {
  const { server, where, owner } = await served()
  try {
    await create(where, await sha(owner))
    /** @type {number[]} */
    const seqs = []
    const ended = new Promise((resolve) => {
      follow({ ...where, after: 0, signal: new AbortController().signal, onChange: async (line) => { seqs.push(line.seq) }, onFleeting: () => {}, onEnd: resolve })
    })
    await post(where, new TextEncoder().encode('one'))
    // The relay ends a stream after its seconds (2 here); the follower reads again from 1.
    await new Promise((resolve) => setTimeout(resolve, 2_300))
    await post(where, new TextEncoder().encode('moved'))
    await new Promise((resolve) => setTimeout(resolve, 100))
    await end(where, owner, 'moved')
    assert.deepEqual(await ended, { moved: true })
    assert.deepEqual(seqs, [1, 2])
  } finally {
    server.closeAllConnections()
    server.close()
  }
})
