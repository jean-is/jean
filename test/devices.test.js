// SPDX-License-Identifier: MIT
// Pairing a person's devices (caps/devices/pair.js, D45, D700), end to end through Jean's side of the relay
// (ui/relay.js) against the relay's own handler (relay/relay.js) in this process, as test/relay-client.test.js runs it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, hkdfSync } from 'node:crypto'
import { relay } from '../relay/relay.js'
import { mailbox, open, send, read } from '../app/ui/relay.js'
import { boxPair, fingerprintOf } from '../app/ui/seal.js'
import { base64url, idOf, random } from '../app/caps/share/seal.js'
import { linkOf, parseLink, pairingBox, sealHello, openHello, sealNonce, openNonce, sealReveal, openReveal, codeOf, sameCode, envelope, openEnvelope } from '../app/caps/devices/pair.js'

const JEAN = 'https://jean.example'
const BASE = 'https://relay.example/'

/** A store in memory, as the relay's own test has. */
function memory() {
  const boxes = new Map()
  const bodies = new Map()
  return {
    box: async (/** @type {string} */ id) => structuredClone(boxes.get(id) ?? null),
    save: async (/** @type {string} */ id, /** @type {any} */ box) => { boxes.set(id, structuredClone(box)) },
    add: async (/** @type {string} */ id, /** @type {number} */ seq, /** @type {Uint8Array} */ body) => { bodies.set(`${id}/${seq}`, body) },
    read: async (/** @type {string} */ id, /** @type {number} */ seq) => bodies.get(`${id}/${seq}`) ?? null,
    drop: async (/** @type {string} */ id, /** @type {number[]} */ seqs) => { for (const seq of seqs) bodies.delete(`${id}/${seq}`) },
    remove: async (/** @type {string} */ id) => { boxes.delete(id); for (const key of [...bodies.keys()]) if (key.startsWith(`${id}/`)) bodies.delete(key) },
    record: async () => {},
    free: async () => Infinity,
  }
}

/** A relay in this process, which fetch now reaches. */
function relayed() {
  const handle = relay({ origins: [JEAN], store: memory(), limits: {} })
  globalThis.fetch = (url, init = {}) => handle(new Request(url, { ...init, headers: { .../** @type {Record<string, string>} */ (init.headers), origin: JEAN } }), { address: '203.0.113.7', port: 51234 })
}
/** What a promise was refused with. @param {Promise<unknown>} promise @returns {Promise<any>} */
const refusal = (promise) => promise.then(() => assert.fail('it was taken'), (error) => error)
/** The one message waiting in a mailbox. @param {string} token */
const only = async (token) => {
  const { messages } = await read(BASE, token)
  assert.equal(messages.length, 1)
  return messages[0].bytes
}

/** A device: its keys, its fingerprint, and its mailbox, open on the relay. */
async function device() {
  const keys = await boxPair()
  const box = await mailbox()
  await open(BASE, box.token)
  return { keys, fp: await fingerprintOf(keys.public), box }
}

/** A, with a link out and its pairing mailbox open once; B, holding the link and its own mailbox. */
async function start() {
  relayed()
  const [a, b] = [await device(), await device()]
  const s = random(32)
  const pairing = await pairingBox(s)
  await open(BASE, pairing.token, { once: true })
  return { a, b, s, pairing, link: linkOf('https://jean.example/', s, a.fp) }
}

test('A and B pair through the relay: hello, nonce, reveal, and both draw the same six digits', async () => {
  const { a, b, s, pairing, link } = await start()
  // B opens the link and says hello in the pairing mailbox.
  const got = parseLink(new URL(link).hash)
  assert.ok(got)
  assert.deepEqual(got.s, s)
  assert.equal(got.fpA, a.fp)
  assert.equal((await pairingBox(got.s)).id, pairing.id)
  const hello = await sealHello(got.s, { key: b.keys.public, mailbox: b.box.id, name: 'iPhone · Safari' })
  await send(BASE, pairing.id, hello.bytes)
  // A reads it and answers with its nonce in B's mailbox.
  const heard = await openHello(s, await only(pairing.token))
  assert.deepEqual(heard.key, { kty: 'EC', crv: 'P-256', x: b.keys.public.x, y: b.keys.public.y })
  assert.equal(heard.mailbox, b.box.id)
  assert.equal(heard.name, 'iPhone · Safari')
  const nonce = await sealNonce(s, { key: a.keys.public, mailbox: a.box.id })
  await send(BASE, heard.mailbox, nonce.bytes)
  // B checks the nonce comes from the link's key, then reveals its own in A's mailbox.
  const answered = await openNonce(got.s, got.fpA, await only(b.box.token))
  assert.equal(answered.mailbox, a.box.id)
  assert.equal(answered.nA, nonce.nA)
  await send(BASE, answered.mailbox, await sealReveal(got.s, hello.nB))
  const nB = await openReveal(s, heard.commit, await only(a.box.token))
  assert.equal(nB, hello.nB)
  // Both draw the code.
  const onB = await codeOf({ s: got.s, fpA: got.fpA, keyB: b.keys.public, mailboxB: b.box.id, nA: answered.nA, nB: hello.nB })
  const onA = await codeOf({ s, fpA: a.fp, keyB: heard.key, mailboxB: heard.mailbox, nA: nonce.nA, nB })
  assert.match(onB, /^\d{6}$/)
  assert.equal(onA, onB)
  assert.ok(sameCode(onB, onA))
  // A second hello, from another device or whoever photographed the code, gets 409.
  const other = await device()
  const again = await sealHello(s, { key: other.keys.public, mailbox: other.box.id, name: 'Elsewhere' })
  assert.equal((await refusal(send(BASE, pairing.id, again.bytes))).status, 409)
})

test('the pairing mailbox is drawn from s alone, as the relay wants its tokens', async () => {
  const s = random(32)
  const { token, id } = await pairingBox(s)
  assert.match(token, /^[\w-]{43}$/)
  assert.equal(token, Buffer.from(hkdfSync('sha256', s, new Uint8Array(), 'pair', 32)).toString('base64url'))
  assert.equal(id, await idOf(token))
  assert.equal(id, createHash('sha256').update(token).digest().subarray(0, 16).toString('base64url'))
  assert.notEqual((await pairingBox(random(32))).token, token)
})

test('B refuses a nonce from another key than its link names', async () => {
  const { a, b, s, pairing } = await start()
  const hello = await sealHello(s, { key: b.keys.public, mailbox: b.box.id, name: 'Phone' })
  await send(BASE, pairing.id, hello.bytes)
  const heard = await openHello(s, await only(pairing.token))
  await send(BASE, heard.mailbox, (await sealNonce(s, { key: a.keys.public, mailbox: a.box.id })).bytes)
  const wrong = await fingerprintOf((await boxPair()).public)
  assert.match((await refusal(openNonce(s, wrong, await only(b.box.token)))).message, /another key/)
})

test('A refuses a reveal that isn’t the nonce committed to, and every message of the wrong kind or secret', async () => {
  const { a, b, s, pairing } = await start()
  const hello = await sealHello(s, { key: b.keys.public, mailbox: b.box.id, name: 'Phone' })
  await send(BASE, pairing.id, hello.bytes)
  const heard = await openHello(s, await only(pairing.token))
  await send(BASE, a.box.id, await sealReveal(s, base64url(random(32))))
  assert.match((await refusal(openReveal(s, heard.commit, await only(a.box.token)))).message, /committed/)
  const nonce = await sealNonce(s, { key: a.keys.public, mailbox: a.box.id })
  // Each asked in turn: made all at once, a refusal not yet awaited counts as unhandled.
  for (const refused of [() => openHello(s, nonce.bytes), () => openNonce(s, a.fp, hello.bytes), () => openReveal(s, heard.commit, nonce.bytes)]) assert.match((await refusal(refused())).message, /isn’t a pairing/)
  for (const bytes of [hello.bytes, new TextEncoder().encode('{"pair":"!"}'), new TextEncoder().encode('not json'), new Uint8Array()]) {
    const refused = await refusal(openHello(random(32), bytes))
    assert.ok(refused instanceof Error)
    assert.match(refused.message, /doesn’t open/)
  }
})

test('a hello or a nonce of the wrong shape is refused, a private key with it', async () => {
  const s = random(32)
  const { key, public: pub } = await boxPair()
  const mailboxId = (await mailbox()).id
  for (const hello of [
    { key, mailbox: mailboxId, name: 'Phone' },
    { key: { ...pub, crv: 'P-384' }, mailbox: mailboxId, name: 'Phone' },
    { key: { ...pub, x: base64url(new Uint8Array(32)) }, mailbox: mailboxId, name: 'Phone' },
    { key: pub, mailbox: 'short', name: 'Phone' },
    { key: pub, mailbox: mailboxId, name: 'P'.repeat(101) },
    { key: pub, mailbox: mailboxId, name: 7 },
  ]) await assert.rejects(openHello(s, (await sealHello(s, /** @type {any} */ (hello))).bytes), Error)
  const fp = await fingerprintOf(pub)
  await assert.rejects(openNonce(s, fp, (await sealNonce(s, { key, mailbox: mailboxId })).bytes), /public key/)
  await assert.rejects(openNonce(s, fp, (await sealNonce(s, { key: pub, mailbox: 'short' })).bytes), /whole/)
})

test('the code is the first 32 bits of SHA-256 over what crossed, mod a million, zero-padded', async () => {
  const s = random(32)
  const keyB = (await boxPair()).public
  const [fpA, mailboxB, nA, nB] = [base64url(random(16)), base64url(random(16)), base64url(random(32)), base64url(random(32))]
  const digest = createHash('sha256').update(['pair', base64url(s), fpA, await fingerprintOf(keyB), mailboxB, nA, nB].join('|')).digest()
  assert.equal(await codeOf({ s, fpA, keyB, mailboxB, nA, nB }), String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0'))
  assert.notEqual(await codeOf({ s, fpA, keyB, mailboxB, nA, nB: nA }), await codeOf({ s, fpA, keyB, mailboxB, nA, nB }))
})

test('the code typed is taken in any script’s digits, spaces and dashes aside, and nothing else', () => {
  for (const typed of ['042917', ' 042 917 ', '042-917', '٠٤٢٩١٧', '۰۴۲۹۱۷', '０４２９１７', '०४२९१७']) assert.ok(sameCode(typed, '042917'), typed)
  for (const typed of ['042918', '42917', '0429170', '04291a', '', '042 91.7']) assert.ok(!sameCode(typed, '042917'), typed)
})

test('an envelope opens only from a device this one knows, and only for the device it was sealed for', async () => {
  const [a, b, c, stranger] = await Promise.all([boxPair(), boxPair(), boxPair(), boxPair()])
  const value = { settings: { language: 'ja' }, at: 1 }
  const toB = await envelope(a, b.public, value)
  assert.equal(JSON.parse(new TextDecoder().decode(toB)).from, await fingerprintOf(a.public))
  const opened = await openEnvelope(b, [c.public, a.public], toB)
  assert.deepEqual(opened, { from: a.public, value })
  // From a key B doesn't know.
  assert.match((await refusal(openEnvelope(b, [c.public], toB))).message, /knows/)
  assert.match((await refusal(openEnvelope(b, [a.public, c.public], await envelope(stranger, b.public, value)))).message, /knows/)
  // One A sealed for C, sent on to B, or claiming to come from C.
  assert.match((await refusal(openEnvelope(b, [a.public, c.public], await envelope(a, c.public, value)))).message, /doesn’t open/)
  const claimed = JSON.parse(new TextDecoder().decode(toB))
  claimed.from = await fingerprintOf(c.public)
  assert.match((await refusal(openEnvelope(b, [a.public, c.public], new TextEncoder().encode(JSON.stringify(claimed))))).message, /doesn’t open/)
  for (const bytes of [new Uint8Array(), new TextEncoder().encode('null'), new TextEncoder().encode(JSON.stringify({ from: claimed.from, box: '!' }))]) await assert.rejects(openEnvelope(b, [a.public, c.public], bytes), Error)
})

test('parseLink takes a link’s hash or a whole link, and refuses anything malformed', () => {
  const s = random(32)
  const fp = base64url(random(16))
  const link = linkOf('https://jean.example/', s, fp)
  assert.equal(link, `https://jean.example/#/pair/${base64url(s)}.${fp}`)
  assert.deepEqual(parseLink(new URL(link).hash), { s, fpA: fp })
  assert.deepEqual(parseLink(` ${link}\n`), { s, fpA: fp })
  const secret = base64url(s)
  for (const hash of ['', '#', '#/pair/', `#/pair/${secret}`, `#/pair/${secret}.`, `#/pair/${secret.slice(1)}.${fp}`, `#/pair/${secret}A.${fp}`,
    `#/pair/${secret}.${fp}A`, `#/pair/${secret}.${fp.slice(1)}`, `#/pair/${secret}/${fp}`, `#/pair/${secret}.${fp}/`, `#/pair/${secret.replace(/^./, '+')}.${fp}`,
    `#/pairs/${secret}.${fp}`, `#/shared/${secret}.${fp}`, `#pair/${secret}.${fp}`, `https://jean.example/#/pair/${secret}.${fp}#x`,
    // The last character of a 32-byte or a 16-byte base64url has spare bits, which are zero in the one way to write it.
    `#/pair/${secret.slice(0, -1)}_.${fp}`, `#/pair/${secret}.${fp.slice(0, -1)}_`]) assert.equal(parseLink(hash), null, hash)
})
