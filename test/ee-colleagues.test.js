// SPDX-License-Identifier: MIT
// Colleagues' controls (D732, ee/): policy's `colleagues` read as IT writes it; the organisation's EST service certifies a profile's key
// for its account, which the key's own ECDSA signature asks for; a colleague's device vouched for only while that certificate names their
// account and its key and leads to policy's anchors; groups kept apart, guests kept out, people from the list alone; and the audit
// export naming a colleague as it names the person.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { X509Certificate } from 'node:crypto'
import { enroll } from '../app/ee/est.js'
import { base64 } from '../app/ee/pkix.js'
import { checked, certified, apartFrom, judged } from '../app/ee/vouch.js'
import { anchorsOf } from '../app/ee/trust.js'
import { others } from '../app/ee/person.js'
import { boxPair } from '../app/ui/seal.js'
import { thumbprint } from '../app/caps/receipt/certificate.js'
import { authority, issue, requested, certsOnly } from './fixtures/ca.js'
import { open, trusteePair } from './fixtures/trustee.js'

const EST = 'https://ca.acme.example/.well-known/est'
const AT = new Date('2026-11-09T09:00:00Z')
const root = await authority('Acme Root CA')
const issuing = await authority('Acme Issuing CA', { issuer: root })
const stranger = await authority('Another Root CA')
const anchors = anchorsOf([base64(root.certificate)])
const POLICY = { signIn: { issuer: 'https://login.acme.example/v2.0', clientId: 'jean' }, seal: { est: EST, auth: 'oidc' }, trust: [base64(root.certificate)] }

/** A profile's key as People keeps it, and as it signs (ECDSA, on its curve), as caps/people/colleagues.js makes it. */
async function profileKey() {
  const { key, public: { kty, crv, x, y } } = await boxPair()
  const ecdsa = { name: 'ECDSA', namedCurve: 'P-256' }
  const keys = { privateKey: await crypto.subtle.importKey('jwk', { kty, crv, x, y, d: key.d }, ecdsa, false, ['sign']), publicKey: await crypto.subtle.importKey('jwk', { kty, crv, x, y }, ecdsa, true, ['verify']) }
  return { key: /** @type {JsonWebKey} */ ({ kty, crv, x, y }), keys }
}

/** The EST service, as the organisation's authority answers: the key the request asks for, for the account it names; its chain from cacerts. */
const service = (/** @type {{ until?: Date, by?: typeof issuing }} */ { until, by = issuing } = {}) => async (/** @type {string} */ address, /** @type {RequestInit} */ init) => {
  if (address === `${EST}/cacerts`) return new Response(base64(certsOnly([by.certificate, root.certificate])))
  const { spki, signed, email } = await requested(Uint8Array.from(Buffer.from(String(init.body), 'base64')))
  assert.equal(signed, true, 'the profile key signs its own request')
  return new Response(base64(certsOnly([await issue({ spki, subject: 'Profile', issuer: by, email, until })])))
}
/** A colleague's device, its key certified for `account`. @param {string} account @param {Parameters<typeof service>[0]} [options] */
async function device(account, options) {
  const { key, keys } = await profileKey()
  const chain = (await enroll({ est: EST, keys, thumbprint: await thumbprint(keys.publicKey), email: account, send: service(options) })).map(base64)
  return { key, chain, mailbox: 'AAAAAAAAAAAAAAAAAAAAAA' }
}

test('policy’s colleagues as IT writes it: what each part needs, and what is wrong said', () => {
  assert.deepEqual(checked({ ...POLICY, colleagues: { certify: true, apart: [['g-trading', 'g-research']], guests: 'refuse' } }), { certify: true, apart: [['g-trading', 'g-research']], inside: false, guests: 'refuse' })
  assert.deepEqual(checked({ signIn: POLICY.signIn, colleagues: { inside: true } }), { certify: false, apart: [], inside: true })
  for (const [policy, said] of /** @type {[Record<string, any>, RegExp][]} */ ([
    [{ ...POLICY, colleagues: [] }, /is an object/],
    [{ colleagues: {} }, /needs signIn/],
    [{ ...POLICY, colleagues: { apart: [['alone']] } }, /two groups or more/],
    [{ ...POLICY, colleagues: { apart: ['g-trading', 'g-research'] } }, /two groups or more/],
    [{ ...POLICY, colleagues: { guests: 'label' } }, /"refuse", or left out/],
    [{ ...POLICY, colleagues: { inside: 'yes' } }, /true or false/],
    [{ signIn: POLICY.signIn, trust: POLICY.trust, colleagues: { certify: true } }, /needs seal\.est/],
    [{ ...POLICY, seal: { csc: 'https://qtsp.example/csc/v2', credential: 'c' }, colleagues: { certify: true } }, /needs seal\.est/],
    [{ ...POLICY, seal: { est: EST }, colleagues: { certify: true } }, /needs seal\.auth/],
    [{ ...POLICY, trust: undefined, colleagues: { certify: true } }, /needs trust/],
    [{ ...POLICY, trust: ['not a certificate'], colleagues: { certify: true } }, /trust\[0\] isn’t a certificate/],
  ])) assert.throws(() => checked(policy), said)
})

test('the authority certifies a profile’s key for its account, asking only to agree keys; the certificate, which Node’s X.509 reads, names the account', async () => {
  const { keys } = await profileKey()
  /** @type {string[]} */
  let body = []
  const chain = await enroll({ est: EST, keys, thumbprint: await thumbprint(keys.publicKey), email: 'ana@acme.example', send: async (address, init) => (address.endsWith('/simpleenroll') && (body = [String(init.body)]), service()(address, init)) })
  const leaf = new X509Certificate(chain[0])
  assert.equal(leaf.subjectAltName, 'email:ana@acme.example')
  assert.equal(leaf.verify(new X509Certificate(chain[1]).publicKey), true)
  // What it asked for: an agreeing key (keyAgreement alone), for that account.
  const asked = Buffer.from(body[0], 'base64')
  assert.ok(asked.includes(Buffer.from([0x03, 0x02, 0x03, 0x08])), 'keyUsage: keyAgreement')
  assert.ok(asked.includes(Buffer.from('ana@acme.example')))
})

test('a colleague’s device is vouched for while its certificate names their account and its key, and leads, valid now, to an anchor', async () => {
  const ana = await device('ana@acme.example')
  assert.equal(await certified(ana, 'ana@acme.example', anchors, AT), true)
  assert.equal(await certified(ana, 'ANA@acme.example', anchors, AT), true, 'an account in any case')
  assert.equal(await certified(ana, 'bob@acme.example', anchors, AT), false, 'another account: a colleague’s certified key given for someone else')
  assert.equal(await certified({ ...ana, key: (await profileKey()).key }, 'ana@acme.example', anchors, AT), false, 'another key: the relay can’t swap one in')
  assert.equal(await certified(ana, 'ana@acme.example', anchorsOf([base64(stranger.certificate)]), AT), false, 'no anchor of the organisation’s')
  assert.equal(await certified(ana, 'ana@acme.example', anchors, new Date('2031-01-01T00:00:00Z')), false, 'past its time')
  assert.equal(await certified(await device('ana@acme.example', { until: new Date('2026-06-01T00:00:00Z') }), 'ana@acme.example', anchors, AT), false, 'ended')
  assert.equal(await certified({ ...ana, chain: ana.chain.slice(0, 1) }, 'ana@acme.example', anchors, AT), false, 'without the authority between')
  assert.equal(await certified({ ...ana, chain: undefined }, 'ana@acme.example', anchors, AT), false)
  assert.equal(await certified({ ...ana, chain: ['bm90IGEgY2VydGlmaWNhdGU='] }, 'ana@acme.example', anchors, AT), false)
})

test('groups apart: each in another group of one set; someone whose groups aren’t known, or too many to hold, apart from everyone', () => {
  const apart = [['trading', 'research'], ['red', 'blue', 'green']]
  assert.equal(apartFrom(apart, ['trading'], ['research']), true)
  assert.equal(apartFrom(apart, ['research', 'red'], ['trading']), true)
  assert.equal(apartFrom(apart, ['blue'], ['green', 'sales']), true)
  assert.equal(apartFrom(apart, ['trading'], ['trading']), false, 'in the same group')
  assert.equal(apartFrom(apart, ['trading', 'research'], ['trading']), true, 'in both, apart from either')
  assert.equal(apartFrom(apart, ['sales'], ['research']), false)
  assert.equal(apartFrom(apart, ['sales'], []), false)
  assert.equal(apartFrom(apart, null, ['sales']), true, 'the person’s own groups too many for their token')
  assert.equal(apartFrom(apart, ['sales'], null), true)
  assert.equal(apartFrom([], null, null), false, 'nothing apart')
})

test('what the controls say to People: a meeting where people come from the list alone, guests, groups apart, and the devices the authority certified', async () => {
  const [laptop, phone] = [await device('bob@acme.example'), { ...(await device('bob@acme.example')), chain: undefined }]
  const bob = { name: 'Bob', account: 'bob@acme.example', met: 'organisation', groups: ['research'], devices: [laptop, phone] }
  const controls = { certify: false, apart: [], inside: false, anchors, mine: ['trading'], at: AT }
  assert.deepEqual(await judged(controls, { action: 'meet' }), {}, 'nothing asked: a meeting goes on')
  assert.deepEqual(await judged(controls, { action: 'send', person: { ...bob, met: 'link' } }), { person: { ...bob, met: 'link' } })
  for (const alone of [{ inside: true }, { certify: true }, { apart: [['a', 'b']] }]) {
    assert.ok('refuse' in await judged({ ...controls, ...alone }, { action: 'meet' }))
    assert.ok('refuse' in await judged({ ...controls, ...alone }, { action: 'open', person: { ...bob, met: 'side' } }), 'met by a code: no account, groups or certificate')
  }
  assert.ok('refuse' in await judged({ ...controls, guests: 'refuse' }, { action: 'find', person: { ...bob, guest: true } }))
  assert.deepEqual(await judged({ ...controls, guests: 'refuse' }, { action: 'find', person: bob }), { person: bob })
  assert.ok('refuse' in await judged({ ...controls, apart: [['trading', 'research']] }, { action: 'add', person: bob }))
  assert.ok('refuse' in await judged({ ...controls, apart: [['trading', 'research']] }, { action: 'add', person: { ...bob, groups: null } }), 'his groups too many for his token')
  assert.deepEqual(await judged({ ...controls, apart: [['trading', 'research']] }, { action: 'add', person: { ...bob, groups: undefined } }), { person: { ...bob, groups: undefined } }, 'in none')
  const vouched = await judged({ ...controls, certify: true }, { action: 'add', person: bob })
  assert.deepEqual('person' in vouched && vouched.person?.devices, [laptop], 'his laptop alone, whose key the authority certified')
  assert.ok('refuse' in await judged({ ...controls, certify: true }, { action: 'send', person: { ...bob, devices: [phone] } }))
})

test('the audit export names a colleague a task went to or came from as it names the person: their account, sealed for the trustee, or not at all', async () => {
  const e = { type: 'people.send', task: 't', to: 'bob@acme.example' }
  assert.deepEqual(await others({}, e), e)
  assert.deepEqual(await others({ person: 'email' }, e), e)
  assert.deepEqual(await others({ person: 'pseudonym' }, e), { ...e, to: undefined })
  const trustee = trusteePair()
  const sealed = await others({ person: 'pseudonym', trustee: trustee.public }, { type: 'people.open', task: 't', from: 'carol@acme.example' })
  assert.equal(open(String(sealed.from), trustee.private).text, 'carol@acme.example')
  assert.deepEqual(await others({ person: 'pseudonym' }, { type: 'people.send', task: 't' }), { type: 'people.send', task: 't' }, 'someone met another way: no account')
})
