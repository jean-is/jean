// A person's store as an FS (app/caps/devices/store-fs.js, D721), which Sync's round runs against: two devices in memory and the
// relay's own handler in this process, its backend in memory too, so that what the relay holds can be read whole.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relay } from '../relay/relay.js'
import { hashOf } from '../host/host.js'
import { memoryFS, walk } from '../app/core/fs.js'
import { syncRound, carried } from '../app/caps/sync/mirror.js'
import { openStore, MANIFEST } from '../app/caps/devices/store-fs.js'
import { carrying, recordFor } from '../app/caps/devices/flow.js'
import { listProjects } from '../app/core/settings.js'
import { ulid } from '../app/core/ulid.js'
import { boxPair } from '../app/ui/seal.js'
import { idOf } from '../app/caps/share/seal.js'
import { newest, proofOf, call, enter, merged, owed, opened, next, rotate, behind } from '../app/caps/devices/epochs.js'
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

test('the store takes no keys, caches or projects kept on a device; one switched to it leaves the store and the other devices, and stays on its own', async () => {
  const { open, memo } = await world()
  const WORK = 'projects/01J00000000000000000000001-work'
  const laptop = memoryFS({ '.secrets/keys.json': '{"x":"key of x"}', '.cache/sync.json': '{}', '.devices/follows.json': '{}', 'settings.json': '{}',
    [`${HOME}/project.md`]: '---\ndefault: true\nname: Home\n---\n', [CHAT]: line('Plan the trip'), [`${WORK}/project.md`]: '---\nname: Work\n---\n', [`${WORK}/documents/plan.md`]: '# Plan\n' })
  const phone = memoryFS()
  const [a, b] = [open(0, laptop), open(1, phone)]
  /** A round as store.js has it, carrying what the device's projects say. @param {FS} fs @param {ReturnType<typeof openStore>} store */
  const go = async (fs, store) => { await store.pull(); return syncRound(fs, store.fs, { cache: '.cache/store', carry: carrying(await listProjects(fs)) }) }
  /** A project switched to kept on the laptop leaves the store, as store.js withdraws it. @param {string} dir */
  const withdraw = async (dir) => { const carry = carrying(await listProjects(laptop)); for (const path of await walk(a.fs, dir)) if (!carry(path)) await a.fs.remove(path) }
  await go(laptop, a)
  await go(phone, b)
  assert.deepEqual((await walk(phone)).filter((path) => !path.startsWith('.cache/')).sort(), [`${HOME}/project.md`, CHAT, `${WORK}/documents/plan.md`, `${WORK}/project.md`].sort())
  // Work kept on the laptop: its files leave the store, then the phone, and the laptop keeps them.
  await laptop.write(`${WORK}/project.md`, '---\nname: Work\ncloud: false\n---\n')
  await withdraw(WORK)
  await go(laptop, a)
  await go(phone, b)
  assert.equal(await phone.exists(WORK), false)
  assert.deepEqual([await laptop.read(`${WORK}/documents/plan.md`), await walk(a.fs, WORK)], ['# Plan\n', []])
  // A change on the laptop to a kept project goes nowhere.
  await laptop.write(`${WORK}/documents/plan.md`, '# Plan, kept\n')
  await go(laptop, a)
  assert.deepEqual(await walk(a.fs, WORK), [])
  // Home kept: its tasks leave, its project.md stays, so that the phone keeps one Home.
  await laptop.write(`${HOME}/project.md`, '---\ndefault: true\nname: Home\ncloud: false\n---\n')
  await withdraw(HOME)
  await go(laptop, a)
  await go(phone, b)
  assert.deepEqual([await phone.exists(CHAT), await laptop.exists(CHAT)], [false, true])
  assert.match(String(await phone.read(`${HOME}/project.md`)), /default: true/)
  const held = JSON.stringify([...memo.metas, ...memo.objects].map(([key, value]) => [key, value instanceof Map ? [...value] : value]))
  assert.ok(!held.includes('key of x'))
})

/** A store some of a person's devices are in, as pairing leaves it: each with its identity, its record and its own token. @param {number} count */
async function people(count) {
  const memo = memory()
  const handle = relay({ origins: [JEAN], store: memo.backend, stores: {} })
  /** @type {typeof fetch} */
  const fetch = async (url, init = {}) => handle(new Request(url, { ...init, headers: { .../** @type {Record<string, string>} */ (init.headers), origin: JEAN } }), { address: '203.0.113.7', port: 51234 })
  const T = Date.parse('2026-11-08T10:00:00Z')
  const devices = await Promise.all(Array.from({ length: count }, async (_, i) => ({ id: ulid(T + i), ...await boxPair(), token: random(32), mailbox: random(16) })))
  const list = devices.map((one, i) => recordFor(one, `Device ${i}`, T))
  const keys = { relay: BASE, sid: random(16), N: random(32), epochs: { 0: random(32) } }
  const held = devices.map(() => ({ ...keys, token: random(32) }))
  await fetch(`${BASE}v1/s/${keys.sid}`, { method: 'PUT', headers: { authorization: `Bearer ${held[0].token}` }, body: JSON.stringify({ id: await idOf(devices[0].id), proof: await hashOf(await proofOf(keys.epochs)) }) })
  for (let i = 1; i < count; i++) await enter(held[0], devices[i].id, await hashOf(held[i].token), fetch)
  /** The list as a device has it once it removed these. @param {...number} gone */
  const without = (...gone) => list.map((one, i) => (gone.includes(i) ? { ...one, removedAt: new Date(T).toISOString(), erase: false } : one))
  /** The store as device `i` sees it, from its own files and the keys it holds. @param {number} i @param {FS} here @param {import('../app/caps/devices/epochs.js').Held} [mine] */
  const open = (i, here, mine = held[i]) => openStore({ base: BASE, sid: keys.sid, token: held[i].token, names: Buffer.from(keys.N, 'base64url'), here, fetch, starts: mine.starts,
    epochs: Object.fromEntries(Object.entries(mine.epochs).map(([epoch, raw]) => [epoch, Buffer.from(raw, 'base64url')])) })
  return { memo, fetch, devices, list, held, without, open, sid: keys.sid }
}

test('a device removed is let out of the store by the next epoch, sealed to each device the remover still has, itself too: the removed one gets 403 and opens nothing new', async () => {
  const { fetch, devices: [a, b, c], list, held, without, open } = await people(3)
  const laptop = memoryFS({ 'memory.md': '- likes tea\n' })
  await round(laptop, open(0, laptop))
  const mine = without(2)
  assert.equal(owed(held[0], mine), true)
  const epoch = next(held[0], mine, await call(held[0], '', {}, fetch))
  const after = await rotate(held[0], a, mine, epoch, fetch)
  assert.deepEqual([newest(after.epochs), after.removed, owed(after, mine)], [1, [c.id], false])
  await assert.rejects(call(held[2], '', {}, fetch), (/** @type {any} */ error) => error.status === 403)
  // B opens its envelope from A's key, and takes the removal; C's keys open none of it, and A's own opens for A.
  const seen = await call(held[1], '', {}, fetch)
  const got = await opened(b, list, seen)
  assert.deepEqual([got?.epochs, got?.removed, got?.starts?.[1]], [after.epochs, [c.id], epoch.starts?.[1]])
  assert.equal(await opened(c, list, seen), null)
  assert.equal(await opened(b, list.filter((one) => one.id !== a.id), seen), null, 'never from a key it doesn’t have')
  assert.ok(await opened(a, list, await call(held[0], '', {}, fetch)))
  // What A writes now, B reads with the new key, and only the new key opens.
  await laptop.write('memory.md', '- likes green tea\n')
  await round(laptop, open(0, laptop, after))
  const [phone, old] = [memoryFS(), memoryFS()]
  await round(phone, open(1, phone, merged(held[1], /** @type {any} */ (got))))
  assert.equal(await phone.read('memory.md'), '- likes green tea\n')
  const behindKeys = open(1, old)
  assert.equal((await behindKeys.pull()).waiting, true)
  assert.equal(await behindKeys.fs.read('memory.md'), null)
})

test('two devices removing others at once: the second, refused, takes the first’s epoch and begins the next, and both end with both removals', async () => {
  const { fetch, devices: [a, b], held, without } = await people(4)
  const [ofA, ofB] = [without(2), without(3)]
  const [atA, atB] = [await call(held[0], '', {}, fetch), await call(held[1], '', {}, fetch)]
  let keysA = await rotate(held[0], a, ofA, next(held[0], ofA, atA), fetch)
  await assert.rejects(rotate(held[1], b, ofB, next(held[1], ofB, atB), fetch), (/** @type {any} */ error) => [403, 409].includes(error.status))
  // B reads its envelope again: A's epoch, which names C; D is still owed.
  const seen = await call(held[1], '', {}, fetch)
  let keysB = merged(held[1], /** @type {any} */ (await opened(b, ofB, seen)))
  assert.equal(owed(keysB, ofB), true)
  keysB = await rotate(keysB, b, ofB, next(keysB, ofB, seen), fetch)
  assert.deepEqual([newest(keysB.epochs), keysB.removed?.sort()], [2, [without(2, 3)[2].id, without(2, 3)[3].id].sort()])
  keysA = merged(keysA, /** @type {any} */ (await opened(a, ofA, await call(held[0], '', {}, fetch))))
  assert.deepEqual(keysA.epochs, keysB.epochs)
  for (const i of [2, 3]) await assert.rejects(call(held[i], '', {}, fetch), (/** @type {any} */ error) => error.status === 403)
})

test('the keys go again only to a device behind that no epoch named: never to one removed, even one a list still has', async () => {
  const { fetch, devices: [a, , c], list, held, without, sid } = await people(3)
  const after = await rotate(held[0], a, without(2), next(held[0], without(2), await call(held[0], '', {}, fetch)), fetch)
  assert.equal(behind(after, list[1], { sid, epoch: 0 }), true)
  assert.equal(behind(after, list[1], { sid, epoch: 1 }), false)
  assert.equal(behind(after, list[2], { sid, epoch: 0 }), false, 'C, named by the epoch')
  assert.equal(behind(after, list[1], null), true, 'a device with no store')
  // The next epoch, begun from a list that never heard C was removed, seals nothing to C, whom the last one named.
  /** @type {any[]} */
  const sent = []
  const watch = /** @type {typeof fetch} */ (async (url, init) => { if (String(url).endsWith('/epoch')) sent.push(JSON.parse(String(init?.body))); return fetch(url, init) })
  const gone = without(1)
  await rotate(after, a, gone.map((one) => (one.id === c.id ? list[2] : one)), next(after, gone, await call(after, '', {}, fetch)), watch)
  assert.deepEqual(Object.keys(sent[0].envelopes), [await idOf(a.id)])
})

test('a version sealed under an older epoch after a newer one began is passed over by its readers, whatever the relay says', async () => {
  const { fetch, memo, devices: [a], held, without, open, sid } = await people(3)
  const [laptop, thief] = [memoryFS({ 'notes.md': '# Notes\n' }), memoryFS()]
  await round(laptop, open(0, laptop))
  await round(thief, open(2, thief))
  await thief.write('notes.md', '# Notes\nWritten by the thief\n')
  await round(thief, open(2, thief))
  const [oid, theirs] = [...(memo.objects.get(sid) ?? new Map())][0]
  const after = await rotate(held[0], a, without(2), next(held[0], without(2), await call(held[0], '', {}, fetch)), fetch)
  await laptop.write('notes.md', '# Notes\nWritten on the laptop\n')
  await round(laptop, open(0, laptop, after))
  // A relay working with the thief puts its old version back in the feed, as the newest.
  const colluding = /** @type {typeof fetch} */ (async (url, init) => {
    const response = await fetch(url, init)
    if (!String(url).includes('/changes')) return response
    const page = await response.json()
    const rev = page.last + 10
    return Response.json({ ...page, changes: [...page.changes, { oid, ...theirs, rev }], last: rev })
  })
  /** The phone's store through that relay. @param {FS} here @param {import('../app/caps/devices/epochs.js').Held} keys */
  const through = (here, keys) => openStore({ base: BASE, sid, token: held[1].token, names: Buffer.from(keys.N, 'base64url'), here, fetch: colluding, starts: keys.starts,
    epochs: Object.fromEntries(Object.entries(keys.epochs).map(([epoch, raw]) => [epoch, Buffer.from(raw, 'base64url')])) })
  const [phone, fooled] = [memoryFS(), memoryFS()]
  await round(phone, through(phone, after))
  assert.match(String(await laptop.read('notes.md')), /Written on the laptop/)
  assert.equal(await phone.read('notes.md'), await laptop.read('notes.md'))
  // Without the epoch's start, the thief's old version would win.
  await round(fooled, through(fooled, { ...after, starts: {} }))
  assert.equal(await fooled.read('notes.md'), '# Notes\nWritten by the thief\n')
})

test('a removal the relay didn’t take stays owed, the same key tried again, until it does', async () => {
  const { fetch, devices: [a], held, without } = await people(3)
  const mine = without(2)
  const info = await call(held[0], '', {}, fetch)
  const epoch = next(held[0], mine, info)
  const offline = /** @type {typeof fetch} */ (async () => { throw new TypeError('Failed to fetch') })
  await assert.rejects(rotate(held[0], a, mine, epoch, offline))
  const kept = { ...held[0], pending: epoch }
  assert.equal(owed(kept, mine), true)
  assert.equal(next(kept, mine, info), epoch, 'the pending one, tried again')
  const after = await rotate(kept, a, mine, next(kept, mine, info), fetch)
  assert.deepEqual([owed(after, mine), after.pending, newest(after.epochs)], [false, undefined, 1])
  assert.equal(after.epochs[1], epoch.epochs[1])
})
