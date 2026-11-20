// SPDX-License-Identifier: MIT
// The keeper (D762): a company's server takes the changes its owner's key signs, in order, once, and nothing else.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fingerprint, isKey, keeper } from '../keeper/keeper.js'
import { files } from '../keeper/serve.js'

const JEAN = 'https://jean.acme.example'
const AT = 'https://jean.acme.example/keeper'

/** @param {Uint8Array} bytes */
const encode = (bytes) => Buffer.from(bytes).toString('base64url')

/** A key pair as the owner's Jean makes one, its public half as the keeper pins it. */
async function owner() {
  const pair = /** @type {CryptoKeyPair} */ (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']))
  return { pair, key: encode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))) }
}

/** A change signed with ES256, as a JWS compact serialisation. @param {CryptoKeyPair} pair @param {object} change */
async function sign(pair, change) {
  const head = encode(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', typ: 'JWT' })))
  const body = encode(new TextEncoder().encode(JSON.stringify(change)))
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(`${head}.${body}`)))
  return `${head}.${body}.${encode(signature)}`
}

/** Files kept in memory, with what was written to each. */
function memory() {
  /** @type {{ state: import('../keeper/keeper.js').State | null, policy?: object, gateway?: object }} */
  const kept = { state: null }
  /** @type {import('../keeper/keeper.js').Files} */
  const files = {
    read: async () => kept.state,
    write: async (state) => { kept.state = state },
    policy: async (policy) => { kept.policy = policy },
    gateway: async (config) => { kept.gateway = config },
  }
  return { kept, files }
}

const post = (/** @type {string} */ body) => new Request(AT, { method: 'POST', body })
const GOOGLE = { issuer: 'https://accounts.google.com', tokenEndpoint: 'https://oauth2.googleapis.com/token', clientId: 'id', clientSecret: 'secret' }

test('it says whose key it obeys and the last change it applied', async () => {
  const { key } = await owner()
  const handle = keeper({ owner: key, origins: [JEAN] }, memory().files)
  assert.deepEqual(await (await handle(new Request(AT))).json(), { format: 1, owner: await fingerprint(key), seq: 0 })
})

test('a change the owner signs replaces the policy and the gateway’s apps, the gateway kept to the company’s address', async () => {
  const { pair, key } = await owner()
  const { kept, files } = memory()
  const handle = keeper({ owner: key, origins: [JEAN] }, files)
  const policy = { name: 'Acme', urls: { gateway: 'https://gateway.jean.acme.example' } }
  const answer = await handle(post(await sign(pair, { format: 1, seq: 1, policy, gateway: { clients: [GOOGLE], origins: ['https://elsewhere.example'] } })))
  assert.equal(answer.status, 400, 'a change can’t name the gateway’s origins')
  assert.equal(kept.state, null)
  const applied = await handle(post(await sign(pair, { format: 1, seq: 1, policy, gateway: { clients: [GOOGLE] } })))
  assert.deepEqual(await applied.json(), { format: 1, seq: 1 })
  assert.deepEqual(kept.policy, policy)
  assert.deepEqual(kept.gateway, { clients: [GOOGLE], origins: [JEAN] })
  assert.deepEqual(kept.state, { seq: 1, owner: key })
})

test('it refuses a change another key signed, one sent again, and what isn’t a signed change', async () => {
  const { pair, key } = await owner()
  const stranger = await owner()
  const { kept, files } = memory()
  const handle = keeper({ owner: key, origins: [JEAN] }, files)
  assert.equal((await handle(post(await sign(stranger.pair, { format: 1, seq: 1, policy: {} })))).status, 401)
  assert.equal(kept.state, null)
  const change = await sign(pair, { format: 1, seq: 1, policy: { name: 'Acme' } })
  assert.equal((await handle(post(change))).status, 200)
  assert.equal((await handle(post(change))).status, 409, 'the same change, sent again')
  assert.equal((await handle(post(await sign(pair, { format: 1, seq: 1, policy: { name: 'Other' } })))).status, 409)
  assert.deepEqual(kept.policy, { name: 'Acme' })
  for (const body of ['', 'not.a.jws', `${change}.more`]) assert.equal((await handle(post(body))).status, 400)
  const unsigned = `${change.split('.').slice(0, 2).join('.')}.${encode(new Uint8Array(64))}`
  assert.equal((await handle(post(unsigned))).status, 401)
  assert.equal((await handle(post(await sign(pair, { format: 1, seq: 2 })))).status, 400, 'a change that changes nothing')
  assert.equal((await handle(post(await sign(pair, { format: 1, seq: 2, gateway: { clients: [{ ...GOOGLE, tokenEndpoint: 'http://token.example' }] } })))).status, 400)
  assert.equal((await handle(new Request(AT, { method: 'PUT', body: change }))).status, 405)
  assert.equal((await handle(post('x'.repeat(600_000)))).status, 413)
})

test('the owner can hand the server to another key, which alone signs from then on', async () => {
  const first = await owner()
  const next = await owner()
  const { kept, files } = memory()
  const handle = keeper({ owner: first.key, origins: [JEAN] }, files)
  assert.equal((await handle(post(await sign(first.pair, { format: 1, seq: 1, owner: 'not a key' })))).status, 400)
  assert.equal((await handle(post(await sign(first.pair, { format: 1, seq: 1, owner: next.key })))).status, 200)
  assert.deepEqual(await (await handle(new Request(AT))).json(), { format: 1, owner: await fingerprint(next.key), seq: 1 })
  assert.equal((await handle(post(await sign(first.pair, { format: 1, seq: 2, policy: {} })))).status, 401)
  assert.equal((await handle(post(await sign(next.pair, { format: 1, seq: 2, policy: { name: 'Acme' } })))).status, 200)
  assert.deepEqual(kept.policy, { name: 'Acme' })
})

test('the owner’s Jean may send a change from any address, the signature being the proof', async () => {
  const { pair, key } = await owner()
  const { kept, files } = memory()
  const handle = keeper({ owner: key, origins: [JEAN] }, files)
  const asked = await handle(new Request(AT, { method: 'OPTIONS', headers: { origin: 'https://jean.is', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } }))
  assert.equal(asked.status, 204)
  assert.equal(asked.headers.get('access-control-allow-origin'), '*')
  assert.match(String(asked.headers.get('access-control-allow-methods')), /POST/)
  const sent = await handle(new Request(AT, { method: 'POST', headers: { origin: 'https://jean.is' }, body: await sign(pair, { format: 1, seq: 1, policy: { name: 'Acme' } }) }))
  assert.equal(sent.status, 200)
  assert.equal(sent.headers.get('access-control-allow-origin'), '*')
  assert.deepEqual(kept.policy, { name: 'Acme' })
  const refused = await handle(new Request(AT, { method: 'POST', headers: { origin: 'https://elsewhere.example' }, body: await sign((await owner()).pair, { format: 1, seq: 2, policy: {} }) }))
  assert.equal(refused.status, 401, 'from anywhere, only the owner’s key')
})

test('changes arriving together are applied one at a time, in order', async () => {
  const { pair, key } = await owner()
  const { kept, files } = memory()
  const handle = keeper({ owner: key, origins: [JEAN] }, files)
  const changes = await Promise.all([1, 2, 3].map((seq) => sign(pair, { format: 1, seq, policy: { seq } })))
  const answers = await Promise.all(changes.map((change) => handle(post(change))))
  assert.deepEqual(answers.map((answer) => answer.status), [200, 200, 200])
  assert.deepEqual(kept.state, { seq: 3, owner: key })
})

test('it needs the owner’s key to start, and knows one when it sees it', async () => {
  const { key } = await owner()
  assert.equal(isKey(key), true)
  for (const wrong of [undefined, '', 'x'.repeat(87), key.slice(1)]) assert.equal(isKey(wrong), false)
  assert.throws(() => keeper({ owner: 'nobody', origins: [JEAN] }, memory().files))
})

test('on disk, the policy is anyone’s to read and the gateway’s secrets only the keeper’s and the gateway’s user', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keeper-'))
  try {
    const { pair, key } = await owner()
    const handle = keeper({ owner: key, origins: [JEAN] }, files(dir))
    assert.equal((await handle(post(await sign(pair, { format: 1, seq: 1, policy: { name: 'Acme' }, gateway: { clients: [GOOGLE] } })))).status, 200)
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'public', 'policy.json'), 'utf8')), { name: 'Acme' })
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'secret', 'gateway.json'), 'utf8')), { clients: [GOOGLE], origins: [JEAN] })
    assert.equal((await stat(join(dir, 'public', 'policy.json'))).mode & 0o777, 0o644)
    assert.equal((await stat(join(dir, 'secret', 'gateway.json'))).mode & 0o777, 0o600)
    assert.equal((await stat(join(dir, 'state.json'))).mode & 0o777, 0o600)
    // Started again, it remembers where it was.
    const again = keeper({ owner: key, origins: [JEAN] }, files(dir))
    assert.equal((await again(post(await sign(pair, { format: 1, seq: 1, policy: {} })))).status, 409)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
