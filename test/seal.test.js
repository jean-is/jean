// SPDX-License-Identifier: MIT
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seal, records, open, isSealed, vaultKey, vaultId, slotKey, close, unseal, encode, decode, deviceKey, boxPair, fingerprintOf, sealBox, openBox, sealFor, openFrom, HEADER, RECORD } from '../app/ui/seal.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const raw = crypto.getRandomValues(new Uint8Array(32))
const vault = await vaultKey(raw)
const id = await vaultId(vault)
const PATH = 'projects/01J-home/conversations/01J.jsonl'

test('a file sealed opens as it was, its content nowhere in the bytes kept', async () => {
  const text = '{"kind":"conversation"}\nA secret line\n'
  const sealed = await seal(vault, id, PATH, encoder.encode(text))
  assert.ok(isSealed(sealed))
  assert.ok(!decoder.decode(sealed).includes('secret'))
  assert.equal(decoder.decode(await open(vault, id, PATH, sealed)), text)
  assert.equal((await open(vault, id, PATH, await seal(vault, id, PATH, new Uint8Array()))).length, 0)
})

test('the vault id is the same for the same key, and differs for another', async () => {
  assert.deepEqual(await vaultId(await vaultKey(raw)), id)
  assert.notDeepEqual(await vaultId(await vaultKey(crypto.getRandomValues(new Uint8Array(32)))), id)
})

test('a whole write takes a new salt each time, and is cut into records at 64 KiB', async () => {
  const bytes = Uint8Array.from({ length: RECORD * 2 + 1 }, (_, i) => i % 251)
  const [a, b] = [await seal(vault, id, PATH, bytes), await seal(vault, id, PATH, bytes)]
  assert.notDeepEqual(a.slice(16, HEADER), b.slice(16, HEADER))
  assert.equal(a.length, HEADER + bytes.length + 3 * 32)
  assert.deepEqual(await open(vault, id, PATH, a), bytes)
})

test('appends are records after the last, and a record cut short or torn at the end is left out', async () => {
  const head = await seal(vault, id, PATH, encoder.encode('one\n'))
  const more = await records(vault, head.subarray(0, HEADER), PATH, encoder.encode('two\n'))
  const grown = new Uint8Array([...head, ...more])
  assert.equal(decoder.decode(await open(vault, id, PATH, grown)), 'one\ntwo\n')
  assert.equal(decoder.decode(await open(vault, id, PATH, grown.subarray(0, grown.length - 5))), 'one\n')
  const torn = grown.slice()
  torn[torn.length - 1] ^= 1
  assert.equal(decoder.decode(await open(vault, id, PATH, torn)), 'one\n')
})

test('a record changed before the last, a file at another path or from another vault, fails', async () => {
  const head = await seal(vault, id, PATH, encoder.encode('one\n'))
  const grown = new Uint8Array([...head, ...await records(vault, head.subarray(0, HEADER), PATH, encoder.encode('two\n'))])
  const changed = grown.slice()
  changed[HEADER + 20] ^= 1
  await assert.rejects(open(vault, id, PATH, changed), { name: 'DataError' })
  await assert.rejects(open(vault, id, 'memory.md', grown), { name: 'DataError' })
  const other = await vaultKey(crypto.getRandomValues(new Uint8Array(32)))
  await assert.rejects(open(other, await vaultId(other), PATH, grown), { name: 'DataError' })
  await assert.rejects(open(vault, id, PATH, encoder.encode('plain text, never sealed, long enough to look')), { name: 'DataError' })
})

test('slots give the vault key back to the password, recovery code or passkey output they were sealed under, and to nothing else', async () => {
  const salt = encode(crypto.getRandomValues(new Uint8Array(16)))
  const password = await close(raw, await slotKey({ kind: 'password', salt, iterations: 1000, iv: '', data: '' }, 'correct horse battery'), { kind: 'password', salt, iterations: 1000 })
  assert.deepEqual(await unseal(password, await slotKey(password, 'correct horse battery')), raw)
  await assert.rejects(unseal(password, await slotKey(password, 'wrong horse battery')))
  const code = crypto.getRandomValues(new Uint8Array(16))
  const recovery = await close(raw, await slotKey({ kind: 'recovery', salt, iv: '', data: '' }, code), { kind: 'recovery', salt })
  assert.deepEqual(await unseal(recovery, await slotKey(recovery, code)), raw)
  await assert.rejects(unseal(recovery, await slotKey(recovery, crypto.getRandomValues(new Uint8Array(16)))))
  const prf = crypto.getRandomValues(new Uint8Array(32))
  const passkey = await close(raw, await slotKey({ kind: 'passkey', salt, iv: '', data: '' }, prf), { kind: 'passkey', salt, credential: 'AQID' })
  assert.deepEqual(await unseal(passkey, await slotKey(passkey, prf)), raw)
  assert.equal(passkey.credential, 'AQID')
})

test('this device’s key that can’t be read is an error, not no key: a profile whose key may be there must never look lost for good', async (t) => {
  Object.assign(globalThis, { indexedDB: { open: () => {
    const request = /** @type {any} */ ({ error: new DOMException('Connection to Indexed Database server lost', 'UnknownError') })
    queueMicrotask(() => request.onerror())
    return request
  } } })
  t.after(() => { delete (/** @type {any} */ (globalThis)).indexedDB })
  await assert.rejects(deviceKey('get', 'profiles/01J-profile'), /server lost/)
  assert.equal(await deviceKey('make', 'profiles/01J-profile'), null)
  assert.equal(await deviceKey('forget', 'profiles/01J-profile'), null)
})

test('a box from one device’s key opens with the other’s, both ways, under a fresh salt and IV each time', async () => {
  const [a, b] = [await boxPair(), await boxPair()]
  const bundle = encoder.encode('{"brains":[]}')
  assert.equal(decoder.decode(await openBox(b.key, a.public, await sealBox(a.key, b.public, bundle))), '{"brains":[]}')
  assert.equal(decoder.decode(await openBox(a.key, b.public, await sealBox(b.key, a.public, bundle))), '{"brains":[]}')
  const [one, two] = [await sealBox(a.key, b.public, bundle), await sealBox(a.key, b.public, bundle)]
  assert.equal(one.length, 16 + 12 + bundle.length + 16)
  assert.notDeepEqual(one.slice(0, 16), two.slice(0, 16))
  assert.notDeepEqual(one.slice(16, 28), two.slice(16, 28))
})

test('a box taken as from another key, opened by a third, sent back to its sender, changed or cut short, is refused', async () => {
  const [a, b, c] = [await boxPair(), await boxPair(), await boxPair()]
  const sealed = await sealBox(a.key, b.public, encoder.encode('the bundle'))
  await assert.rejects(openBox(b.key, c.public, sealed))
  await assert.rejects(openBox(c.key, a.public, sealed))
  // Re-addressed: A and B share the same secret either way, so only the fingerprints it is bound to refuse it.
  await assert.rejects(openBox(a.key, b.public, sealed))
  for (const at of [0, 20, 30, sealed.length - 1]) {
    const changed = sealed.slice()
    changed[at] ^= 1
    await assert.rejects(openBox(b.key, a.public, changed))
  }
  await assert.rejects(openBox(b.key, a.public, sealed.slice(0, 27)))
})

test('a key’s fingerprint is the first 16 bytes of SHA-256 of its raw bytes, the same from either half or a copy', async () => {
  const [a, b] = [await boxPair(), await boxPair()]
  const print = await fingerprintOf(a.public)
  const raw = Buffer.concat([Buffer.of(4), Buffer.from(/** @type {string} */ (a.public.x), 'base64url'), Buffer.from(/** @type {string} */ (a.public.y), 'base64url')])
  assert.equal(print, Buffer.from(await crypto.subtle.digest('SHA-256', raw)).subarray(0, 16).toString('base64url'))
  assert.match(print, /^[\w-]{22}$/)
  assert.equal(await fingerprintOf(a.key), print)
  assert.equal(await fingerprintOf(JSON.parse(JSON.stringify(a.public))), print)
  assert.notEqual(await fingerprintOf(b.public), print)
})

test('sealFor() and openFrom() keep the format a child’s profile has sealed in for its parent’s, from a pair made to derive keys', async () => {
  const [subtle, EC, AES] = [crypto.subtle, { name: 'ECDH', namedCurve: 'P-256' }, { name: 'AES-GCM', length: 256 }]
  const made = await subtle.generateKey(EC, true, ['deriveKey'])
  const parent = { key: await subtle.exportKey('jwk', made.privateKey), public: await subtle.exportKey('jwk', made.publicKey) }
  // As caps/profiles/family.js sealed and opened before: the AES key derived from ECDH at once.
  const own = await subtle.generateKey(EC, true, ['deriveKey'])
  const key = await subtle.deriveKey({ name: 'ECDH', public: await subtle.importKey('jwk', parent.public, EC, false, []) }, own.privateKey, AES, false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify({ kind: 'bullying' }))))
  const old = JSON.stringify({ format: 1, from: await subtle.exportKey('jwk', own.publicKey), iv: encode(iv), data: encode(data) })
  assert.deepEqual(await openFrom(parent.key, old), { kind: 'bullying' })
  await assert.rejects(openFrom((await boxPair()).key, old))
  const sealed = JSON.parse(await sealFor(parent.public, { kind: 'bullying' }))
  assert.deepEqual(Object.keys(sealed), ['format', 'from', 'iv', 'data'])
  const back = await subtle.deriveKey({ name: 'ECDH', public: await subtle.importKey('jwk', sealed.from, EC, false, []) }, await subtle.importKey('jwk', parent.key, EC, false, ['deriveKey']), AES, false, ['decrypt'])
  assert.deepEqual(JSON.parse(decoder.decode(await subtle.decrypt({ name: 'AES-GCM', iv: decode(sealed.iv) }, back, decode(sealed.data)))), { kind: 'bullying' })
})
