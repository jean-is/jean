// A person's store as an FS (app/caps/devices/store-fs.js, D721), which Sync's round runs against: two devices in memory and the
// relay's own handler in this process, its backend in memory too, so that what the relay holds can be read whole.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relay } from '../relay/relay.js'
import { hashOf } from '../host/host.js'
import { memoryFS, walk } from '../app/core/fs.js'
import { syncRound, carried } from '../app/caps/sync/mirror.js'
import { openStore, MANIFEST } from '../app/caps/devices/store-fs.js'
import { memory } from './fixtures/relay-memory.js'

/** @typedef {import('../app/core/types.js').FS} FS */
const JEAN = 'https://jean.example'
const BASE = 'https://relay.example/'
const HOME = 'projects/01J00000000000000000000000-home'
const CHAT = `${HOME}/conversations/01J0000000000000000000000A.jsonl`
const random = (/** @type {number} */ size) => Buffer.from(crypto.getRandomValues(new Uint8Array(size))).toString('base64url')
const bytes = (/** @type {number} */ size) => crypto.getRandomValues(new Uint8Array(size))
const line = (/** @type {string} */ text) => JSON.stringify({ at: '2026-11-08T10:00:00.000Z', by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } } }) + '\n'

/**
 * A store made by one device and joined by another, each with its own token, and a way to open it from any device's files.
 * @param {{ stores?: object }} [options]
 */
async function world({ stores = {} } = {}) {
  const memo = memory()
  const handle = relay({ origins: [JEAN], store: memo.backend, stores })
  /** @type {typeof fetch} */
  const fetch = async (url, init = {}) => handle(new Request(url, { ...init, headers: { .../** @type {Record<string, string>} */ (init.headers), origin: JEAN } }), { address: '203.0.113.7', port: 51234 })
  const [sid, names, proof] = [random(16), bytes(32), random(32)]
  /** @type {Record<string, Uint8Array>} */
  const epochs = { 0: bytes(32) }
  const tokens = [random(32), random(32)]
  const ids = [random(16), random(16)]
  await fetch(`${BASE}v1/s/${sid}`, { method: 'PUT', headers: { authorization: `Bearer ${tokens[0]}` }, body: JSON.stringify({ id: ids[0], proof: await hashOf(proof) }) })
  await fetch(`${BASE}v1/s/${sid}/devices`, { method: 'POST', headers: { authorization: `Bearer ${tokens[0]}`, 'store-proof': proof },
    body: JSON.stringify({ id: ids[1], token: await hashOf(tokens[1]), epoch: 0 }) })
  /** The store as device `i` sees it, from its own files. @param {number} i @param {FS} here @param {Record<string, Uint8Array>} [keys] */
  const open = (i, here, keys = epochs) => openStore({ base: BASE, sid, token: tokens[i], names, epochs: keys, here, fetch })
  return { memo, fetch, sid, proof, epochs, tokens, ids, open }
}

/** A round as the store's own will be: the feed read, then Sync's round with the store's base. @param {FS} here @param {ReturnType<typeof openStore>} store */
const round = async (here, store) => { await store.pull(); return syncRound(here, store.fs, { cache: '.cache/store' }) }

test('the store answers as an FS: files and the folders their paths make, sizes of the words, a rev for a date, and nothing for what isn’t there', async () => {
  const { open } = await world()
  const here = memoryFS()
  const { fs, pull } = open(0, here)
  await pull()
  await fs.write('memory.md', '- likes tea\n')
  await fs.writeBytes(`${HOME}/files/sha256-1.png`, new Uint8Array([1, 2, 3]))
  assert.equal(await fs.read('memory.md'), '- likes tea\n')
  assert.deepEqual(await fs.list(''), [{ name: 'memory.md', kind: 'file' }, { name: 'projects', kind: 'directory' }])
  assert.deepEqual(await fs.list(HOME), [{ name: 'files', kind: 'directory' }])
  assert.deepEqual([await fs.exists('projects'), await fs.exists('memory.md'), await fs.exists('nothing.md')], [true, true, false])
  const stat = await fs.stat?.('memory.md')
  assert.equal(stat?.size, 12)
  assert.ok(Number(stat?.lastModified) > 0)
  assert.deepEqual([await fs.read('nothing.md'), await fs.stat?.('nothing.md'), await fs.list('nowhere')], [null, null, []])
  await fs.append('memory.md', '- and coffee\n')
  assert.equal(await fs.read('memory.md'), '- likes tea\n- and coffee\n')
  await fs.remove('projects')
  assert.deepEqual(await fs.list(''), [{ name: 'memory.md', kind: 'file' }])
  // What it knows is kept on this device, and read again by the next that opens it.
  await pull()
  assert.ok(await here.exists(MANIFEST))
  assert.equal(await open(0, here).fs.read('memory.md'), '- likes tea\n- and coffee\n')
})

test('two devices bring each other their work through the store, both ways, and the relay holds no path, name or word of it', async () => {
  const { open, memo } = await world()
  const [laptop, phone] = [memoryFS({ 'memory.md': '- likes tea\n', [CHAT]: line('Plan the trip') }), memoryFS()]
  const [a, b] = [open(0, laptop), open(1, phone)]
  await round(laptop, a)
  assert.deepEqual((await round(phone, b)).sort(), ['memory.md', CHAT])
  assert.equal(await phone.read(CHAT), line('Plan the trip'))
  await phone.append(CHAT, line('Book the train'))
  await phone.write(`${HOME}/documents/01K90000000000000000000000-trip.md`, '# Trip\n')
  await round(phone, b)
  await round(laptop, a)
  assert.equal(await laptop.read(CHAT), line('Plan the trip') + line('Book the train'))
  assert.equal(await laptop.read(`${HOME}/documents/01K90000000000000000000000-trip.md`), '# Trip\n')
  const held = JSON.stringify([...memo.metas, ...memo.objects].map(([key, value]) => [key, value instanceof Map ? [...value] : value]))
    + [...memo.parts.values()].flatMap((parts) => [...parts.values()].map((part) => Buffer.from(part.bytes).toString('latin1'))).join('')
  for (const word of ['memory.md', 'tea', 'trip', 'Trip', 'conversations', 'projects', 'Book the train']) assert.ok(!held.includes(word), word)
})

test('one path is one object, so two devices that each made memory.md meet on it; a write the other got in first is merged at the next round', async () => {
  const { open, memo, sid } = await world()
  const [laptop, phone] = [memoryFS({ 'memory.md': 'A\n\nB\n\nC\n' }), memoryFS()]
  const [a, b] = [open(0, laptop), open(1, phone)]
  await round(laptop, a)
  await round(phone, b)
  assert.equal(memo.objects.get(sid)?.size, 1)
  // Each changes its own paragraph; the laptop's goes first, while the phone has already read the store.
  await laptop.write('memory.md', 'A mine\n\nB\n\nC\n')
  await phone.write('memory.md', 'A\n\nB\n\nC theirs\n')
  await b.pull()
  await round(laptop, a)
  await syncRound(phone, b.fs, { cache: '.cache/store' })
  assert.equal(b.refused(), 1)
  await round(phone, b)
  await round(laptop, a)
  assert.equal(await phone.read('memory.md'), 'A mine\n\nB\n\nC theirs\n')
  assert.equal(await laptop.read('memory.md'), 'A mine\n\nB\n\nC theirs\n')
})

test('a conversation that grows goes up as a part more, up to 32, then whole; a part not what its name says is caught', async () => {
  const { open, memo, sid } = await world()
  const laptop = memoryFS({ [CHAT]: line('one') })
  const a = open(0, laptop)
  await round(laptop, a)
  const parts = () => [...(memo.objects.get(sid)?.values() ?? [])][0].parts.length
  assert.equal(parts(), 1)
  for (let i = 2; i <= 32; i++) { await laptop.append(CHAT, line(String(i))); await round(laptop, a) }
  assert.equal(parts(), 32)
  await laptop.append(CHAT, line('33'))
  await round(laptop, a)
  assert.equal(parts(), 1)
  const phone = memoryFS()
  const b = open(1, phone)
  await round(phone, b)
  assert.equal((await phone.read(CHAT))?.split('\n').length, 34)
  // A part changed on the relay, under its old name.
  const [hash, part] = [...(memo.parts.get(sid) ?? new Map())].find(([name]) => [...(memo.objects.get(sid)?.values() ?? [])][0].parts.includes(name)) ?? []
  if (part) part.bytes = new Uint8Array(part.bytes.length)
  await assert.rejects(b.fs.read(CHAT), (error) => /** @type {any} */ (error).name === 'DataError' && String(hash).length === 43)
})

test('a deletion comes only sealed: a forged one changes nothing, and after a reset the manifest is rebuilt whole before a round reads it', async () => {
  const { open, memo, sid } = await world()
  const laptop = memoryFS({ 'memory.md': '- likes tea\n', 'skills/a/SKILL.md': '---\nname: a\n---\n' })
  const a = open(0, laptop)
  await round(laptop, a)
  const phone = memoryFS()
  const b = open(1, phone)
  await round(phone, b)
  // The relay claims a deletion it can't seal: the phone keeps the file.
  const [oid, version] = [...(memo.objects.get(sid) ?? new Map())][0]
  memo.objects.get(sid)?.set(oid, { ...version, rev: version.rev + 10_000, meta: version.meta.slice(0, -8) + 'AAAAAAAA', parts: [], gone: true })
  await memo.backend.saveStore(sid, { .../** @type {any} */ (await memo.backend.store(sid)), last: version.rev + 10_000 })
  const fresh = open(1, phone)
  await round(phone, fresh)
  assert.equal((await walk(phone)).filter(carried).length, 2)
  // A real deletion from the laptop goes to the phone.
  await laptop.remove('skills/a/SKILL.md')
  await round(laptop, a)
  await round(phone, fresh)
  assert.equal(await phone.exists('skills/a/SKILL.md'), false)
  // A cursor the store swept past starts again from 0, and nothing goes missing meanwhile.
  await memo.backend.saveStore(sid, { .../** @type {any} */ (await memo.backend.store(sid)), floor: Number.MAX_SAFE_INTEGER - 1 })
  const { reset } = await fresh.pull()
  assert.equal(reset, true)
  assert.equal(await fresh.fs.read('memory.md'), '- likes tea\n')
})

test('a change sealed under an epoch whose key this device lacks waits, deleting nothing, and is taken once the key comes', async () => {
  const { open, epochs, fetch, sid, proof, tokens } = await world()
  const laptop = memoryFS({ 'memory.md': '- likes tea\n' })
  const phone = memoryFS()
  await round(laptop, open(0, laptop))
  await round(phone, open(1, phone))
  // The laptop starts epoch 1, its key the phone hasn't got yet, and writes under it.
  const next = random(32)
  await fetch(`${BASE}v1/s/${sid}/epoch`, { method: 'POST', headers: { authorization: `Bearer ${tokens[0]}`, 'store-proof': proof },
    body: JSON.stringify({ epoch: 1, remove: [], proof: await hashOf(next), envelopes: {} }) })
  const later = { ...epochs, 1: bytes(32) }
  await laptop.write('memory.md', '- likes green tea\n')
  await round(laptop, open(0, laptop, later))
  const behind = open(1, phone)
  const { waiting } = await behind.pull()
  assert.equal(waiting, true)
  await syncRound(phone, behind.fs, { cache: '.cache/store' })
  assert.equal(await phone.read('memory.md'), '- likes tea\n')
  const caught = open(1, phone, later)
  assert.equal((await caught.pull()).waiting, false)
  await syncRound(phone, caught.fs, { cache: '.cache/store' })
  assert.equal(await phone.read('memory.md'), '- likes green tea\n')
})
