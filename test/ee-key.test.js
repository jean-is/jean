// The key that unlocks ee/ (D139, D386): checked offline, for this origin, against this version's release.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkKey, KEYS, RELEASED } from '../app/ee/key.js'

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', pair.publicKey)
const keys = { test: { kty, crv, x, y } }
const ORIGIN = 'https://jean.acme.example'
const day = 86_400_000

const part = (/** @type {unknown} */ value) => Buffer.from(JSON.stringify(value)).toString('base64url')
/** @param {Record<string, unknown>} claims @param {{ kid?: string, alg?: string, key?: CryptoKey }} [options] */
async function sign(claims, { kid = 'test', alg = 'ES256', key = pair.privateKey } = {}) {
  const input = `${part({ alg, typ: 'JWT', kid })}.${part({ iss: 'WAREHOUSE SAS', sub: 'Acme SA', aud: [ORIGIN], ...claims })}`
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input))
  return `${input}.${Buffer.from(signature).toString('base64url')}`
}
const released = '2026-10-17'
const at = { origin: ORIGIN, keys, released, now: Date.parse('2026-11-01') }

test('a subscription unlocks every version released before it ends, even once it has ended', async () => {
  const key = await sign({ exp: Date.parse('2026-12-31') / 1000 })
  assert.deepEqual(await checkKey(key, at), { organisation: 'Acme SA', until: Date.parse('2026-12-31'), trial: false })
  assert.equal((await checkKey(key, { ...at, now: Date.parse('2030-01-01') })).organisation, 'Acme SA')
  await assert.rejects(checkKey(key, { ...at, released: '2027-01-15' }), /ended before this version/)
})

test('a trial stops on its date', async () => {
  const key = await sign({ exp: Date.parse('2026-11-15') / 1000, trial: true })
  assert.equal((await checkKey(key, at)).trial, true)
  await assert.rejects(checkKey(key, { ...at, now: Date.parse('2026-11-16') }), /trial key has ended/)
})

test('a key is for the origins it names, signed by a key Jean knows', async () => {
  const exp = Date.parse('2026-12-31') / 1000
  await assert.rejects(checkKey(await sign({ exp }), { ...at, origin: 'https://jean.other.example' }), /not https:\/\/jean.other.example/)
  await assert.rejects(checkKey(await sign({ exp }, { key: other.privateKey }), at), /not signed/)
  await assert.rejects(checkKey(await sign({ exp }, { kid: 'unknown' }), at), /not signed/)
  await assert.rejects(checkKey(await sign({ exp }, { alg: 'HS256' }), at), /not signed/)
  // One origin given as a string, as RFC 7519 allows.
  assert.equal((await checkKey(await sign({ exp, aud: ORIGIN }), at)).organisation, 'Acme SA')
  // Changing what it says breaks its signature.
  const [header, , signature] = (await sign({ exp })).split('.')
  await assert.rejects(checkKey(`${header}.${part({ sub: 'Acme SA', aud: [ORIGIN], exp: exp * 2 })}.${signature}`, at), /not signed/)
})

test('without a key, only localhost', async () => {
  await assert.rejects(checkKey(undefined, at), /no key/)
  await assert.rejects(checkKey('not a key', at), /no key/)
  for (const origin of ['http://localhost:4180', 'http://127.0.0.1:8080', 'http://[::1]:3000']) assert.equal((await checkKey(undefined, { ...at, origin })).until, Infinity)
})

test('the shipped key is a P-256 public key, and the release a date', async () => {
  for (const jwk of Object.values(KEYS)) {
    assert.deepEqual(Object.keys(jwk).sort(), ['crv', 'kty', 'x', 'y'])
    await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  }
  assert.match(RELEASED, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(Date.parse(RELEASED) > Date.parse('2026-10-01') && Date.parse(RELEASED) < Date.now() + day)
})
