// The organisation's qualified seal (D436, ee/): a qualified provider holds the key, in its certified device, and
// seals through the Cloud Signature Consortium's API (v2). `credentials/info` gives the credential's chain; each seal
// is a SHA-256 Jean computes, authorized, then signed by `signatures/signHash`. A certificate then carries the
// qualified chain in x5c, names the provider's key as its issuer, keeps what checks it later (JAdES B-LT), and an
// organisation's anchors judge it as any other seal; a picture's Content Credentials are signed the same way, once.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { X509Certificate } from 'node:crypto'
import { seal, thumbprint, check, ISSUER } from '../app/caps/receipt/certificate.js'
import { credentialed, credentialsOf } from '../app/caps/receipt/c2pa.js'
import { credentialAt } from '../app/ee/csc.js'
import { checked } from '../app/ee/est.js'
import { revocation, lasting } from '../app/ee/lasting.js'
import { verdict, anchorsOf } from '../app/ee/trust.js'
import { base64 } from '../app/ee/pkix.js'
import { authority, issue, provider, providerKeys, ocspAnswer } from './fixtures/ca.js'

const CSC = 'https://qtsp.acme.example/csc/v2'
const OCSP = 'http://ocsp.qtsp.acme.example'
const CREDENTIAL = 'acme-seal'
const SEALED_AT = new Date('2026-10-19T10:00:00Z')

const root = await authority('Qualified Root CA')
const issuing = await authority('Qualified Seal CA', { issuer: root, ocsp: `${OCSP}/root` })

/** @param {Uint8Array} der */
const pem = (der) => `-----BEGIN CERTIFICATE-----\n${base64(der).match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----\n`

/**
 * The provider's credential: a key it holds, certified by its seal CA, and its service, whose responders answer too.
 * @param {{ curve?: string, raw?: boolean, info?: Record<string, any> }} [given]
 */
async function qualified({ curve = 'P-256', raw = false, info = {} } = {}) {
  const keys = await providerKeys(curve)
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey))
  const leaf = await issue({ spki, subject: 'Acme SA', issuer: issuing, ocsp: `${OCSP}/seal`, usages: ['1.3.6.1.5.5.7.3.36'] })
  const service = provider({ base: CSC, credential: CREDENTIAL, keys, chain: [leaf, issuing.certificate, root.certificate], raw, info })
  /** @param {string} address @param {RequestInit} init */
  const send = async (address, init) => {
    if (!address.startsWith(OCSP)) return service.send(address, init)
    const signer = address.endsWith('/root') ? root : issuing
    return new Response(await ocspAnswer(new Uint8Array(/** @type {ArrayBuffer} */ (await new Response(init.body).arrayBuffer())), { signer }))
  }
  return { keys, leaf, asked: service.asked, send }
}

/** The seal a hook gives: the provider's key, its certificate and chain but its root, and its signer. @param {import('../app/ee/csc.js').Credential} credential */
const remote = ({ chain, key, sign }) => ({ keys: /** @type {CryptoKeyPair} */ ({ publicKey: key }), certificate: chain[0], chain: chain.slice(1, -1), sign })

test('the credential’s chain comes from credentials/info, leaf first, and each seal is a SHA-256 the provider authorizes, then signs', async () => {
  const at = await qualified()
  const credential = await credentialAt({ csc: `${CSC}/`, credential: CREDENTIAL, send: at.send })
  assert.deepEqual(at.asked.map(({ address, body }) => [address, body.certificates, body.authInfo]), [[`${CSC}/credentials/info`, 'chain', true]])
  assert.deepEqual(credential.chain, [at.leaf, issuing.certificate, root.certificate])
  assert.deepEqual(new Uint8Array(await crypto.subtle.exportKey('spki', credential.key)), new Uint8Array(await crypto.subtle.exportKey('spki', at.keys.publicKey)))
  const data = new TextEncoder().encode('header.payload')
  const signature = await credential.sign(data)
  assert.equal(signature.length, 64)
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, at.keys.publicKey, signature, data), true)
  const [, authorize, signHash] = at.asked
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', data)).toString('base64')
  assert.deepEqual([authorize.address, authorize.body], [`${CSC}/credentials/authorize`, { credentialID: CREDENTIAL, numSignatures: 1, hashes: [hash], hashAlgorithmOID: '2.16.840.1.101.3.4.2.1' }])
  assert.deepEqual([signHash.address, signHash.body.hashes, signHash.body.signAlgo, signHash.body.hashAlgorithmOID], [`${CSC}/signatures/signHash`, [hash], '1.2.840.10045.4.3.2', '2.16.840.1.101.3.4.2.1'])
  assert.equal(signHash.headers.get('content-type'), 'application/json')
  // A provider that gives r‖s, and one that names only the key's algorithm, sign as well.
  const raw = await qualified({ raw: true, info: { key: { status: 'enabled', algo: ['1.2.840.10045.2.1'] } } })
  const plain = await credentialAt({ csc: CSC, credential: CREDENTIAL, send: raw.send })
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, raw.keys.publicKey, await plain.sign(data), data), true)
  assert.equal(raw.asked.at(-1)?.body.signAlgo, '1.2.840.10045.2.1')
})

test('a certificate sealed by the provider names its key, carries the qualified chain, keeps what checks it later, and the organisation’s anchors vouch for it', async () => {
  const at = await qualified()
  const credential = await credentialAt({ csc: CSC, credential: CREDENTIAL, send: at.send })
  const sealed = await seal({ type: ['VerifiableCredential'] }, remote(credential), SEALED_AT)
  const made = lasting(sealed, credential.chain, await revocation(credential.chain, at.send))
  const header = JSON.parse(Buffer.from(made.protected, 'base64url').toString())
  // The provider's certificate, then its CA, but the root; Node's own X.509 and ECDSA check them.
  assert.deepEqual(header.x5c, [at.leaf, issuing.certificate].map(base64))
  const [leaf, above] = header.x5c.map((/** @type {string} */ der) => new X509Certificate(Buffer.from(der, 'base64')))
  assert.equal(leaf.verify(above.publicKey), true)
  const reading = await check({ certificate: made }, { trust: (one, when) => verdict(one, anchorsOf([pem(root.certificate)]), when) })
  assert.deepEqual([reading.intact, reading.selfIssued, reading.issuer['2.5.4.3'], reading.subject['2.5.4.3']], [true, false, 'Qualified Seal CA', 'Acme SA'])
  assert.equal(reading.says.issuer, ISSUER + await thumbprint(at.keys.publicKey))
  assert.equal(reading.fingerprint, await thumbprint(at.keys.publicKey))
  assert.deepEqual(reading.trust, { status: 'trusted', name: 'Qualified Root CA' })
  // B-LT on the qualified chain: the chain past its own in xVals, both responders' answers in rVals.
  assert.deepEqual(made.header?.etsiU.map((one) => Object.keys(one)[0]), ['xVals', 'rVals'])
  assert.equal(/** @type {any} */ (made.header?.etsiU[1]).rVals.ocspVals.length, 2)
  assert.equal((await verdict(made, anchorsOf([pem((await authority('Another Root CA')).certificate)]), SEALED_AT)).status, 'untrusted')
})

test('a picture’s Content Credentials are signed by the provider once, its chain in x5chain', async () => {
  const at = await qualified()
  const credential = await credentialAt({ csc: CSC, credential: CREDENTIAL, send: at.send })
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'))
  const out = await credentialed(png, { maker: 'Z-Image-Turbo', generator: { name: 'Jean' }, seal: remote(credential) })
  const read = await credentialsOf(out)
  assert.deepEqual([read?.intact, read?.bound, read?.selfIssued, read?.issuer['2.5.4.3']], [true, true, false, 'Qualified Seal CA'])
  assert.equal(at.asked.filter(({ address }) => address.endsWith('/signHash')).length, 1)
})

test('a key that isn’t P-256, a credential a person must authorize, disabled or revoked, a refusal, or a signature by another key, is said for IT', async () => {
  const refused = async (/** @type {Parameters<typeof qualified>[0]} */ given, /** @type {RegExp} */ said) => {
    const at = await qualified(given)
    await assert.rejects(credentialAt({ csc: CSC, credential: CREDENTIAL, send: at.send }), said)
  }
  await refused({ curve: 'P-384' }, /isn’t an ECDSA P-256 key, which Jean seals certificates with \(ES256\)/)
  await refused({ info: { auth: { mode: 'explicit', expression: 'PIN' } } }, /asks for authorization “explicit”, which a person gives/)
  await refused({ info: { auth: { mode: 'oauth2code' } } }, /authorization “oauth2code”/)
  await refused({ info: { key: { status: 'disabled' } } }, /acme-seal is disabled/)
  await refused({ info: { cert: { status: 'revoked', certificates: [] } } }, /given without its certificate/)
  const revoked = await qualified()
  const send = async (/** @type {string} */ address, /** @type {RequestInit} */ init) => {
    const answer = await revoked.send(address, init)
    const body = await answer.json()
    return Response.json({ ...body, cert: { ...body.cert, status: 'revoked' } })
  }
  await assert.rejects(credentialAt({ csc: CSC, credential: CREDENTIAL, send }), /certificate is revoked/)
  await assert.rejects(credentialAt({ csc: CSC, credential: 'another', send: revoked.send }), /credentials\/info: HTTP 400 Invalid parameter credentialID/)
  // A provider signing with a key that isn't the credential's: the signature is checked before it is given.
  const wrong = provider({ base: CSC, credential: CREDENTIAL, keys: await providerKeys(), chain: [revoked.leaf, issuing.certificate] })
  const credential = await credentialAt({ csc: CSC, credential: CREDENTIAL, send: wrong.send })
  await assert.rejects(credential.sign(new Uint8Array(8)), /signHash: the signature doesn’t hold by acme-seal’s key/)
})

test('policy’s seal names a provider’s CSC API over HTTPS and the credential, and not an EST service beside it', () => {
  assert.deepEqual(checked({ seal: { csc: CSC, credential: CREDENTIAL, auth: 'oidc' }, signIn: {} }), { csc: CSC, credential: CREDENTIAL, auth: 'oidc' })
  assert.throws(() => checked({ seal: { csc: 'http://qtsp.acme.example/csc/v2', credential: CREDENTIAL } }), /seal\.csc is the base address of a qualified provider’s CSC API/)
  assert.throws(() => checked({ seal: { csc: CSC } }), /goes with seal\.credential/)
  assert.throws(() => checked({ seal: { csc: CSC, credential: CREDENTIAL, est: 'https://ca.acme.example/.well-known/est' } }), /without seal\.est/)
  assert.throws(() => checked({ seal: { csc: CSC, credential: CREDENTIAL, auth: 'oidc' } }), /needs signIn/)
})
