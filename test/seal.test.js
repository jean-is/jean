import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seal, records, open, isSealed, vaultKey, vaultId, slotKey, close, unseal, encode, HEADER, RECORD } from '../app/ui/seal.js'

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
