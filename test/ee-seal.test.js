// The organisation's authority (D434, ee/): its EST service certifies the key the device seals with, which never
// leaves it; each certificate then carries the chain in x5c and, once sealed, what keeps it checkable (JAdES B-LT):
// the chain in xVals and what the authority said of each certificate's revocation in rVals. An organisation's
// anchors then say whether one of its authorities vouches for the seal, and whether it was revoked by then.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { X509Certificate } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { makeSeal, seal, thumbprint, check, witness, ISSUER } from '../app/caps/receipt/certificate.js'
import { parts, certificatesIn, chainOf, responders, lists, certifies, base64 } from '../app/ee/pkix.js'
import { request, enroll } from '../app/ee/est.js'
import { revocation, lasting, ocspRequest, answered, witnessesOf } from '../app/ee/lasting.js'
import { verdict, anchorsOf } from '../app/ee/trust.js'
import { authority, issue, responder, requested, certsOnly, ocspAnswer, crlOf, serialOf } from './fixtures/ca.js'
import { reply } from './fixtures/tsa.js'

const EST = 'https://ca.acme.example/.well-known/est'
const OCSP = 'http://ocsp.acme.example'
const CRL = 'http://crl.acme.example/issuing.crl'
// Where a witness's authorities publish their certificates (CA Issuers).
const CERTS = 'http://certs.time.example'
const SEALED_AT = new Date('2026-10-19T10:00:00Z')

const root = await authority('Acme Root CA')
const issuing = await authority('Acme Issuing CA', { issuer: root, ocsp: `${OCSP}/root` })
const other = await authority('Another Root CA')
// A witness's authorities: a root, and the authority that certifies the key its time-stamps are signed with.
const timeRoot = await authority('Time Root CA')
const timeCA = await authority('Time CA', { issuer: timeRoot, ocsp: `${OCSP}/time-root`, caIssuers: `${CERTS}/root.p7c` })
/** Each responder's signer, by the path the certificates name. @type {Record<string, import('./fixtures/ca.js').Authority>} */
const SIGNERS = { root, issuing, time: timeCA, 'time-root': timeRoot }

/** @param {Uint8Array} der */
const pem = (der) => `-----BEGIN CERTIFICATE-----\n${base64(der).match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----\n`

/**
 * An EST service and the authority's responders, as `send` reaches them: what each was asked, and how they answer.
 * @param {{ revoked?: Map<string, Date>, bundle?: boolean, ocsp?: boolean, refuse?: boolean }} [given]
 */
function service({ revoked = new Map(), bundle = false, ocsp = true, refuse = false } = {}) {
  const asked = /** @type {{ address: string, init: RequestInit }[]} */ ([])
  /** @param {string} address @param {RequestInit} init */
  const send = async (address, init) => {
    asked.push({ address, init })
    if (address === `${EST}/simpleenroll`) {
      if (refuse) return new Response('', { status: 401 })
      const { spki, signed } = await requested(Uint8Array.from(Buffer.from(String(init.body), 'base64')))
      assert.equal(signed, true, 'the request is signed by the key it asks to certify')
      const leaf = await issue({ spki, subject: 'Seal', issuer: issuing, ocsp: `${OCSP}/issuing`, crl: CRL, usages: ['1.3.6.1.5.5.7.3.36'] })
      // RFC 8951: base64, with line breaks.
      return new Response(base64(certsOnly(bundle ? [leaf, issuing.certificate] : [leaf])).replace(/.{1,76}/g, '$&\r\n'), { headers: { 'content-type': 'application/pkcs7-mime; smime-type=certs-only' } })
    }
    if (address === `${EST}/cacerts`) return new Response(base64(certsOnly([issuing.certificate, root.certificate])))
    if (address.startsWith(OCSP) && ocsp) {
      const signer = SIGNERS[address.slice(OCSP.length + 1)]
      return new Response(await ocspAnswer(new Uint8Array(/** @type {ArrayBuffer} */ (await new Response(init.body).arrayBuffer())), { signer, revoked }), { headers: { 'content-type': 'application/ocsp-response' } })
    }
    if (address === CRL) return new Response(await crlOf(issuing, revoked))
    // RFC 5280 4.2.2.1: one certificate in DER, or a certs-only bundle.
    if (address === `${CERTS}/time-ca.cer`) return new Response(timeCA.certificate, { headers: { 'content-type': 'application/pkix-cert' } })
    if (address === `${CERTS}/root.p7c`) return new Response(certsOnly([timeRoot.certificate]), { headers: { 'content-type': 'application/pkcs7-mime' } })
    if (address === `${CERTS}/other.cer`) return new Response(other.certificate)
    return new Response('', { status: 404 })
  }
  return { asked, send }
}

/** The device's seal, certified by the organisation's EST service. @param {ReturnType<typeof service>} [at] */
async function certified(at = service()) {
  const own = await makeSeal(new Date('2026-01-01T00:00:00Z'))
  const chain = await enroll({ est: `${EST}/`, keys: own.keys, thumbprint: await thumbprint(own.keys.publicKey), headers: { authorization: 'Bearer token' }, send: at.send })
  return { own, chain, at }
}

/** What a certificate says, its issuer the seal's key. @param {CryptoKeyPair} keys */
const said = async (keys) => ({ type: ['VerifiableCredential'], issuer: ISSUER + await thumbprint(keys.publicKey) })

/** A time-stamping authority's certificate (RFC 3161 2.3), certified by the time CA, naming where that one's is. @param {CryptoKeyPair} keys @param {string} [caIssuers] */
const stampingWith = async (keys, caIssuers = `${CERTS}/time-ca.cer`) => issue({ spki: new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey)), subject: 'Time Stamping', issuer: timeCA, ocsp: `${OCSP}/time`, caIssuers, usages: ['1.3.6.1.5.5.7.3.8'] })

/** A certificate sealed with the authority's certificate and its chain, but its root, then made lasting. @param {Awaited<ReturnType<typeof certified>>} given */
async function sealedWith({ own, chain, at }) {
  const sealed = await seal(await said(own.keys), { ...own, certificate: chain[0], chain: chain.slice(1, -1) }, SEALED_AT)
  return lasting(sealed, chain, await revocation([chain], at.send))
}

test('a request for the seal’s key is a PKCS#10 that OpenSSL checks, signed by that key, asking for document signing', async () => {
  const own = await makeSeal()
  const der = await request(own.keys, await thumbprint(own.keys.publicKey))
  const { spki, signed } = await requested(der)
  assert.equal(signed, true)
  assert.deepEqual(spki, new Uint8Array(await crypto.subtle.exportKey('spki', own.keys.publicKey)))
  const folder = mkdtempSync(join(tmpdir(), 'jean-csr-'))
  writeFileSync(join(folder, 'seal.csr'), der)
  let text
  try {
    text = execFileSync('openssl', ['req', '-inform', 'DER', '-in', join(folder, 'seal.csr'), '-verify', '-noout', '-text'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    if (/** @type {any} */ (error).code === 'ENOENT') return
    throw error
  }
  assert.match(text, new RegExp(`CN *= *${await thumbprint(own.keys.publicKey)}`))
  assert.match(text, /Digital Signature, Non Repudiation/)
  assert.match(text, /1\.3\.6\.1\.5\.5\.7\.3\.36|Document Signing/)
})

test('the EST service certifies the key: its certificate, then the chain from its CA certificates, which Node’s own X.509 checks', async () => {
  const { own, chain, at } = await certified()
  assert.deepEqual(at.asked.map(({ address, init }) => [address, init.method]), [[`${EST}/simpleenroll`, 'POST'], [`${EST}/cacerts`, 'GET']])
  assert.equal(new Headers(at.asked[0].init.headers).get('authorization'), 'Bearer token')
  assert.equal(new Headers(at.asked[0].init.headers).get('content-type'), 'application/pkcs10')
  // In lines of 64, each ending, as libest decodes it.
  assert.match(String(at.asked[0].init.body), /^([A-Za-z0-9+/]{64}\n)+[A-Za-z0-9+/=]{1,64}\n$/)
  assert.equal(chain.length, 3)
  const [leaf, middle, top] = chain.map((der) => new X509Certificate(der))
  assert.equal(leaf.verify(middle.publicKey), true)
  assert.equal(middle.verify(top.publicKey), true)
  assert.equal(top.verify(top.publicKey), true)
  assert.deepEqual(new Uint8Array(leaf.publicKey.export({ format: 'der', type: 'spki' })), new Uint8Array(await crypto.subtle.exportKey('spki', own.keys.publicKey)))
  const read = parts(chain[0])
  assert.deepEqual([responders(read), lists(read), certifies(read), certifies(parts(chain[1]))], [[`${OCSP}/issuing`], [CRL], false, true])
})

test('a chain the answer carries is used as it comes, and an answer in PEM reads as a bundle does', async () => {
  const at = service({ bundle: true })
  const { chain } = await certified(at)
  assert.equal(at.asked.length, 1)
  assert.equal(chain.length, 2)
  assert.deepEqual(certificatesIn(pem(issuing.certificate) + pem(root.certificate)), [issuing.certificate, root.certificate])
  assert.deepEqual(certificatesIn(base64(root.certificate)), [root.certificate])
  const ordered = await chainOf(parts(issuing.certificate), [root.certificate, other.certificate].map(parts))
  assert.deepEqual(ordered.map((one) => one.der), [issuing.certificate, root.certificate])
})

test('a refusal, or a certificate for another key, is said', async () => {
  await assert.rejects(certified(service({ refuse: true })), /simpleenroll: HTTP 401/)
  const own = await makeSeal()
  const stranger = await makeSeal()
  const send = async () => new Response(base64(certsOnly([await issue({ spki: new Uint8Array(await crypto.subtle.exportKey('spki', stranger.keys.publicKey)), subject: 'Other', issuer: issuing })])))
  await assert.rejects(enroll({ est: EST, keys: own.keys, thumbprint: 'x', send }), /certified another key/)
})

test('once sealed, the chain goes in xVals and each authority’s OCSP answer in rVals, after the witnesses’ dates, as the schema says', async () => {
  const given = await certified()
  const witnessed = { ...await seal(await said(given.own.keys), { ...given.own, certificate: given.chain[0], chain: given.chain.slice(1, -1) }, SEALED_AT), header: { etsiU: [{ sigTst: { tstTokens: [{ val: 'MA==' }] } }] } }
  const found = await revocation([given.chain], given.at.send)
  assert.equal(found.ocsp.length, 2)
  assert.equal(found.ocsp.every(answered), true)
  const made = lasting(witnessed, given.chain, found)
  assert.deepEqual(made.header.etsiU.map((one) => Object.keys(one)[0]), ['sigTst', 'xVals', 'rVals'])
  assert.deepEqual(made.header.etsiU[1], { xVals: given.chain.slice(1).map((der) => ({ x509Cert: { val: base64(der) } })) })
  const schema = JSON.parse(readFileSync(new URL('../app/caps/receipt/certificate.schema.json', import.meta.url), 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strictTypes: false })
  ajv.addSchema(schema)
  assert.equal(ajv.validate(`${schema.$id}#/$defs/certificateFile`, JSON.parse(JSON.stringify(made))) || ajv.errorsText(), true)
  // The x5c carries the chain but its root, and the seal's own checks still hold.
  const reading = await check({ certificate: made })
  assert.equal(reading.intact, true)
  assert.equal(reading.selfIssued, false)
  assert.equal(reading.issuer['2.5.4.3'], 'Acme Issuing CA')
  assert.equal(reading.timestamps.length, 1, 'only the witnesses’ entries are read as dates')
})

test('a responder that doesn’t answer leaves the CRL, and none at all leaves rVals out', async () => {
  const at = service({ ocsp: false })
  const given = await certified(at)
  const found = await revocation([given.chain], at.send)
  assert.deepEqual([found.ocsp.length, found.crl.length], [0, 1])
  const nothing = await revocation([given.chain], async () => new Response('', { status: 503 }))
  const made = lasting(await seal({}, given.own, SEALED_AT), given.chain, nothing)
  assert.deepEqual(made.header?.etsiU.map((one) => Object.keys(one)[0]), ['xVals'])
  // The request names the certificate by its issuer's hashes and serial, with a nonce.
  const asked = await ocspRequest(parts(given.chain[0]), parts(given.chain[1]), new Uint8Array(16).fill(7))
  assert.match(Buffer.from(asked).toString('hex'), new RegExp(`${serialOf(given.chain[0])}.*04120410${'07'.repeat(16)}$`))
})

test('the witnesses’ own certificates are asked about too, once each, so that their dates stay checkable: what EU DSS needs to read B-LT', async () => {
  const at = service()
  const given = await certified(at)
  // A time-stamping authority (RFC 3161 2.3) certified by its own, its tokens carrying their chain.
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
  const stamping = await stampingWith(keys)
  const dated = (/** @type {Uint8Array} */ asked) => reply(asked, SEALED_AT, { keys, certificates: [timeRoot.certificate, stamping, timeCA.certificate] })
  // Two witnesses, the same authority, and one whose token carries no time-stamping certificate (its own, self-issued).
  const sealed = await witness(await witness(await witness(await seal(await said(given.own.keys), { ...given.own, certificate: given.chain[0], chain: given.chain.slice(1, -1) }, SEALED_AT), dated), dated), reply)
  const chains = await witnessesOf(sealed)
  assert.deepEqual(chains, [[stamping, timeCA.certificate, timeRoot.certificate], [stamping, timeCA.certificate, timeRoot.certificate]])
  const found = await revocation([given.chain, ...chains], at.send)
  assert.deepEqual(at.asked.slice(2).map(({ address }) => address), [`${OCSP}/issuing`, `${OCSP}/root`, `${OCSP}/time`, `${OCSP}/time-root`])
  assert.equal(found.ocsp.length, 4)
  const made = lasting(sealed, given.chain, found)
  assert.deepEqual(made.header.etsiU.map((one) => Object.keys(one)[0]), ['sigTst', 'sigTst', 'sigTst', 'xVals', 'rVals'])
  // The witnesses' certificates are in their tokens already: xVals keeps the seal's chain.
  assert.equal(made.header.etsiU[3].xVals.length, 2)
  const schema = JSON.parse(readFileSync(new URL('../app/caps/receipt/certificate.schema.json', import.meta.url), 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strictTypes: false })
  ajv.addSchema(schema)
  assert.equal(ajv.validate(`${schema.$id}#/$defs/certificateFile`, JSON.parse(JSON.stringify(made))) || ajv.errorsText(), true)
  // The witnesses' answers change nothing of what the organisation's anchors say, and the dates still read.
  assert.deepEqual(await verdict(made, anchorsOf([pem(root.certificate)]), SEALED_AT), { status: 'trusted', name: 'Acme Root CA' })
  const reading = await check({ certificate: made })
  assert.deepEqual(reading.timestamps.map((one) => one.intact), [true, true, true])
})

test('a witness whose token carries only its signer: each authority above comes from the CA Issuers address the one below names, checked it issued it, into xVals, and their answers into rVals', async () => {
  const at = service()
  const given = await certified(at)
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
  const stamping = await stampingWith(keys)
  const alone = (/** @type {Uint8Array} */ asked) => reply(asked, SEALED_AT, { keys, certificates: [stamping] })
  const sealed = await witness(await witness(await seal(await said(given.own.keys), { ...given.own, certificate: given.chain[0], chain: given.chain.slice(1, -1) }, SEALED_AT), alone), alone)
  const chains = await witnessesOf(sealed)
  assert.deepEqual(chains, [[stamping], [stamping]])
  const found = await revocation([given.chain, ...chains], at.send)
  // Each fetched once, the time CA's certificate as DER and its root's as a bundle, then asked about.
  assert.deepEqual(at.asked.slice(2).map(({ address }) => address), [`${OCSP}/issuing`, `${OCSP}/root`, `${CERTS}/time-ca.cer`, `${OCSP}/time`, `${CERTS}/root.p7c`, `${OCSP}/time-root`])
  assert.deepEqual([found.certificates, found.ocsp.length], [[timeCA.certificate, timeRoot.certificate], 4])
  const made = lasting(sealed, given.chain, found)
  assert.deepEqual(made.header.etsiU.map((one) => Object.keys(one)[0]), ['sigTst', 'sigTst', 'xVals', 'rVals'])
  assert.deepEqual(made.header.etsiU[2].xVals, [...given.chain.slice(1), timeCA.certificate, timeRoot.certificate].map((der) => ({ x509Cert: { val: base64(der) } })))
  const schema = JSON.parse(readFileSync(new URL('../app/caps/receipt/certificate.schema.json', import.meta.url), 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strictTypes: false })
  ajv.addSchema(schema)
  assert.equal(ajv.validate(`${schema.$id}#/$defs/certificateFile`, JSON.parse(JSON.stringify(made))) || ajv.errorsText(), true)
  // The witnesses' authorities in xVals change nothing of what the organisation's anchors say.
  assert.deepEqual(await verdict(made, anchorsOf([pem(root.certificate)]), SEALED_AT), { status: 'trusted', name: 'Acme Root CA' })
  // An address that gives a certificate that didn't issue it, or nothing, leaves its revocation out, as before.
  assert.deepEqual(await revocation([[await stampingWith(keys, `${CERTS}/other.cer`)], [await stampingWith(keys, `${CERTS}/gone.cer`)]], at.send), { ocsp: [], crl: [], certificates: [] })
})

test('an authority the organisation trusts vouches for the seal, shown unrevoked when it sealed', async () => {
  const sealed = await sealedWith(await certified())
  const anchors = anchorsOf([pem(root.certificate)])
  assert.deepEqual(await verdict(sealed, anchors, SEALED_AT), { status: 'trusted', name: 'Acme Root CA' })
  // An intermediate trusted alone vouches as well, and needs no word on itself.
  assert.deepEqual(await verdict(sealed, anchorsOf([base64(issuing.certificate)]), SEALED_AT), { status: 'trusted', name: 'Acme Issuing CA' })
  assert.deepEqual(await verdict(sealed, anchorsOf([pem(other.certificate)]), SEALED_AT), { status: 'untrusted', name: 'Acme Issuing CA' })
  // Out of its certificate's time, it is not.
  assert.equal((await verdict(sealed, anchors, new Date('2031-01-01T00:00:00Z'))).status, 'untrusted')
  // As check() gives it, beside the seal's own checks.
  const reading = await check({ certificate: sealed }, { trust: (one, at) => verdict(one, anchors, at) })
  assert.deepEqual([reading.intact, reading.trust], [true, { status: 'trusted', name: 'Acme Root CA' }])
})

test('a certificate revoked before it sealed is said, one revoked after isn’t, and without an authority’s word it is unchecked', async () => {
  const anchors = anchorsOf([pem(root.certificate)])
  const revokedAt = new Map()
  const at = service({ revoked: revokedAt })
  const given = await certified(at)
  revokedAt.set(serialOf(given.chain[0]), new Date('2026-10-01T00:00:00Z'))
  assert.deepEqual(await verdict(await sealedWith(given), anchors, SEALED_AT), { status: 'revoked', name: 'Acme Root CA' })
  revokedAt.set(serialOf(given.chain[0]), new Date('2026-11-01T00:00:00Z'))
  assert.equal((await verdict(await sealedWith(given), anchors, SEALED_AT)).status, 'trusted')
  // The CRL says so too.
  const listed = service({ revoked: new Map([[serialOf(given.chain[0]), new Date('2026-10-01T00:00:00Z')]]), ocsp: false })
  assert.equal((await verdict(await sealedWith({ ...given, at: listed }), anchors, SEALED_AT)).status, 'revoked')
  // Nothing kept, or an answer signed by someone the issuer didn't certify to answer: not shown either way.
  const bare = await seal({}, { ...given.own, certificate: given.chain[0], chain: given.chain.slice(1, -1) }, SEALED_AT)
  assert.equal((await verdict(bare, anchors, SEALED_AT)).status, 'unchecked')
  const stranger = await authority('Not a responder', { issuer: issuing })
  const forged = { ...bare, header: { etsiU: [{ rVals: { ocspVals: [{ val: base64(await ocspAnswer(await ocspRequest(parts(given.chain[0]), parts(given.chain[1])), { signer: stranger, carried: [stranger.certificate], revoked: new Map([[serialOf(given.chain[0]), new Date('2026-10-01T00:00:00Z')]]) })) }] } }] } }
  assert.equal((await verdict(forged, anchors, SEALED_AT)).status, 'unchecked')
})

test('a responder the issuer certified for OCSP answers for it', async () => {
  const given = await certified()
  const delegated = await responder(issuing)
  const [leaf, middle] = given.chain.map(parts)
  const answer = await ocspAnswer(await ocspRequest(leaf, middle), { signer: delegated, carried: [delegated.certificate] })
  const root2 = await ocspAnswer(await ocspRequest(middle, parts(root.certificate)), { signer: root })
  const sealed = lasting(await seal({}, { ...given.own, certificate: given.chain[0], chain: given.chain.slice(1, -1) }, SEALED_AT), given.chain, { ocsp: [answer, root2], crl: [] })
  assert.equal((await verdict(sealed, anchorsOf([pem(root.certificate)]), SEALED_AT)).status, 'trusted')
})

test('policy’s anchors are certificates, in PEM or base64; anything else is said', () => {
  assert.equal(anchorsOf([pem(root.certificate) + pem(other.certificate)]).length, 2)
  assert.throws(() => anchorsOf([]), /a list of the certificates/)
  assert.throws(() => anchorsOf(['not a certificate']), /trust\[0\] isn’t a certificate/)
})

test('policy’s seal names an EST service over HTTPS, and how it knows who asks; anything else is said', async () => {
  const { checked } = await import('../app/ee/est.js')
  assert.deepEqual(checked({ seal: { est: EST } }), { est: EST })
  assert.deepEqual(checked({ seal: { est: 'http://localhost:8443/.well-known/est', auth: 'tls' } }), { est: 'http://localhost:8443/.well-known/est', auth: 'tls' })
  assert.throws(() => checked({ seal: { est: 'http://ca.acme.example/.well-known/est' } }), /over HTTPS/)
  assert.throws(() => checked({ seal: {} }), /seal\.est/)
  assert.throws(() => checked({ seal: { est: EST, auth: 'basic' } }), /seal\.auth is "oidc"/)
  assert.throws(() => checked({ seal: { est: EST, auth: 'oidc' } }), /needs signIn/)
})
