// DER as the seal's certificate needs it (D274): what it writes, Node's own X.509 reads, and what it
// reads of a certificate is what Node finds in it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { X509Certificate } from 'node:crypto'
import { int, oid, read, children, selfIssued, readCertificate, derSignature } from '../app/caps/receipt/der.js'
import { BRAND } from '../app/brand.js'

const hex = (/** @type {Uint8Array} */ bytes) => Buffer.from(bytes).toString('hex')

test('integers are as short as they can be and never negative; object identifiers in base 128', () => {
  assert.equal(hex(int(Uint8Array.of(0, 0, 5))), '020105')
  assert.equal(hex(int(Uint8Array.of(0x80))), '02020080')
  assert.equal(hex(int(Uint8Array.of(0))), '020100')
  assert.equal(hex(oid('1.2.840.10045.4.3.2')), '06082a8648ce3d040302')
  // r‖s as Ecdsa-Sig-Value: two integers.
  const signature = derSignature(Uint8Array.from({ length: 64 }, (_, i) => (i === 0 ? 0x80 : i === 32 ? 0 : 1)))
  assert.deepEqual(children(read(signature)).map(({ start, end }) => end - start), [33, 31])
})

test('the seal’s certificate is one Node reads, issued by its own key for ten years, for documents, never an authority', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
  const now = new Date('2026-10-11T08:00:00Z')
  const der = await selfIssued(keys, 'thumbprint', now)
  const x509 = new X509Certificate(Buffer.from(der))
  // The software as its organisation, which C2PA's validators ask of a signer's (D324).
  assert.equal(x509.subject, `O=${BRAND.name}\nCN=thumbprint`)
  assert.equal(x509.issuer, `O=${BRAND.name}\nCN=thumbprint`)
  assert.equal(x509.verify(x509.publicKey), true)
  assert.equal(x509.ca, false)
  assert.deepEqual(x509.keyUsage, ['1.3.6.1.5.5.7.3.36'])
  assert.equal(new Date(x509.validTo).toISOString(), '2036-10-11T08:00:00.000Z')
  const { spki, from, until, subject, selfIssued: own } = readCertificate(der)
  assert.deepEqual(Buffer.from(spki), x509.publicKey.export({ format: 'der', type: 'spki' }))
  assert.deepEqual([from.toISOString(), until.toISOString(), subject['2.5.4.3'], own], [now.toISOString(), '2036-10-11T08:00:00.000Z', 'thumbprint', true])
  // From 2050, a GeneralizedTime (RFC 5280).
  const late = readCertificate(await selfIssued(keys, 'late', new Date('2045-01-02T03:04:05Z')))
  assert.equal(late.until.toISOString(), '2055-01-02T03:04:05.000Z')
  assert.throws(() => readCertificate(Uint8Array.of(0x30, 0x05, 0x02)), /format/)
})
