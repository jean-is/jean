// An organisation's authority for the tests (D434), built as real ones answer: a root and an intermediate that
// certify keys, an EST service's certs-only answers (RFC 7030), OCSP answers (RFC 6960), signed by the issuer or a
// responder it certified for that, and CRLs (RFC 5280). Web Crypto and der.js only, so Node and the browser tests
// share it.
import { tlv, seq, int, oid, bits, octets, derSignature, read, children, raw, valueOf } from '../../app/caps/receipt/der.js'

const P256 = { name: 'ECDSA', namedCurve: 'P-256' }
const SIGNING = { name: 'ECDSA', hash: 'SHA-256' }
const ECDSA_SHA256 = seq(oid('1.2.840.10045.4.3.2'))
const encode = (/** @type {string} */ text) => new TextEncoder().encode(text)
const set = (/** @type {Uint8Array[]} */ ...parts) => tlv(0x31, ...parts)
/** @param {Date} date */
const generalized = (date) => tlv(0x18, encode(date.toISOString().replace(/[-:T]|\.\d+/g, '')))
/** @param {Date} date */
const utc = (date) => tlv(0x17, encode(date.toISOString().replace(/[-:T]|\.\d+/g, '').slice(2)))
/** A name of an organisation and a common name. @param {string} common */
export const named = (common) => seq(...[['2.5.4.10', 'Acme SA'], ['2.5.4.3', common]].map(([type, value]) => set(seq(oid(type), tlv(0x0c, encode(value))))))
/** @param {string} id @param {Uint8Array} value @param {boolean} [critical] */
const extension = (id, value, critical = false) => seq(oid(id), ...(critical ? [Uint8Array.of(1, 1, 255)] : []), octets(value))
/** @param {string} address */
const uri = (address) => tlv(0x86, encode(address))
let serials = 4096

/** @typedef {{ keys: CryptoKeyPair, certificate: Uint8Array, name: Uint8Array, spki: Uint8Array }} Authority */

/** @param {CryptoKey} key @param {Uint8Array} tbs */
const signed = async (key, tbs) => seq(tbs, ECDSA_SHA256, bits(derSignature(new Uint8Array(await crypto.subtle.sign(SIGNING, key, tbs)))))

/**
 * A certificate for a key, issued by an authority or by itself: an authority's, a responder's or a seal's, saying
 * where to ask whether it was revoked. @param {{ spki: Uint8Array, subject: string, issuer?: Authority, key?: CryptoKey, ca?: boolean,
 * ocsp?: string, crl?: string, usages?: string[], from?: Date, until?: Date, serial?: number }} given
 */
export async function issue({ spki, subject, issuer, key, ca = false, ocsp, crl, usages = [], from = new Date('2026-01-01T00:00:00Z'), until = new Date('2030-01-01T00:00:00Z'), serial = serials++ }) {
  const extensions = [
    extension('2.5.29.19', ca ? seq(Uint8Array.of(1, 1, 255)) : seq(), true),
    extension('2.5.29.15', ca ? bits(Uint8Array.of(0x06), 1) : bits(Uint8Array.of(0xc0), 6), true),
    ...(usages.length ? [extension('2.5.29.37', seq(...usages.map(oid)))] : []),
    ...(ocsp ? [extension('1.3.6.1.5.5.7.1.1', seq(seq(oid('1.3.6.1.5.5.7.48.1'), uri(ocsp))))] : []),
    ...(crl ? [extension('2.5.29.31', seq(seq(tlv(0xa0, tlv(0xa0, uri(crl))))))] : []),
  ]
  const tbs = seq(tlv(0xa0, int(Uint8Array.of(2))), int(Uint8Array.of(serial >> 8, serial & 255)), ECDSA_SHA256, issuer?.name ?? named(subject),
    seq(utc(from), utc(until)), named(subject), spki, tlv(0xa3, seq(...extensions)))
  return signed(/** @type {CryptoKey} */ (issuer?.keys.privateKey ?? key), tbs)
}

/** An authority: its own keys and certificate, issued by another or by itself. @param {string} common @param {{ issuer?: Authority, ocsp?: string, crl?: string, from?: Date, until?: Date }} [given] @returns {Promise<Authority>} */
export async function authority(common, given = {}) {
  const keys = await crypto.subtle.generateKey(P256, false, ['sign', 'verify'])
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey))
  return { keys, spki, name: named(common), certificate: await issue({ ...given, spki, subject: common, key: keys.privateKey, ca: true }) }
}

/** A responder its issuer certified to sign OCSP answers for it. @param {Authority} issuer @returns {Promise<Authority>} */
export async function responder(issuer) {
  const keys = await crypto.subtle.generateKey(P256, false, ['sign', 'verify'])
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey))
  return { keys, spki, name: named('Acme OCSP'), certificate: await issue({ spki, subject: 'Acme OCSP', issuer, usages: ['1.3.6.1.5.5.7.3.9'] }) }
}

/** The key a PKCS#10 request asks to certify, and whether it signed the request. @param {Uint8Array} der */
export async function requested(der) {
  const [info, , signature] = children(read(der))
  const [, , spki] = children(info)
  const key = await crypto.subtle.importKey('spki', raw(spki), P256, true, ['verify'])
  const [r, s] = children(read(valueOf(signature).subarray(1))).map((part) => valueOf(part).slice(-32))
  const pad = (/** @type {Uint8Array} */ half) => Uint8Array.from([...new Uint8Array(32 - half.length), ...half])
  return { spki: raw(spki).slice(), signed: await crypto.subtle.verify(SIGNING, key, Uint8Array.from([...pad(r), ...pad(s)]), raw(info)) }
}

/** An EST certs-only answer: a PKCS#7 SignedData with no signer. @param {Uint8Array[]} certificates */
export const certsOnly = (certificates) => seq(oid('1.2.840.113549.1.7.2'), tlv(0xa0, seq(int(Uint8Array.of(1)), set(), seq(oid('1.2.840.113549.1.7.1')), tlv(0xa0, ...certificates), set())))

/**
 * An OCSP answer to a request: each certificate it asks about good, or revoked when `revoked` says so, by its
 * serial (an INTEGER's hex), signed by the issuer or a responder. @param {Uint8Array} request
 * @param {{ signer: Authority, revoked?: Map<string, Date>, now?: Date, carried?: Uint8Array[] }} given
 */
export async function ocspAnswer(request, { signer, revoked = new Map(), now = new Date(), carried = [] }) {
  const [tbsRequest] = children(read(request))
  const [list] = children(tbsRequest)
  const responses = children(list).map((one) => {
    const [id] = children(one)
    const serial = Buffer.from(raw(children(id)[3])).toString('hex')
    const when = revoked.get(serial)
    return seq(raw(id), when ? tlv(0xa1, generalized(when)) : tlv(0x80), generalized(now))
  })
  const data = seq(tlv(0xa1, signer.name), generalized(now), seq(...responses))
  const basic = await signed(signer.keys.privateKey, data)
  const withCerts = carried.length ? seq(...children(read(basic)).map(raw), tlv(0xa0, seq(...carried))) : basic
  return seq(tlv(0x0a, Uint8Array.of(0)), tlv(0xa0, seq(oid('1.3.6.1.5.5.7.48.1.1'), octets(withCerts))))
}

/** A CRL an authority signs, listing the serials (INTEGERs' hex) revoked and when. @param {Authority} issuer @param {Map<string, Date>} [revoked] @param {Date} [now] */
export async function crlOf(issuer, revoked = new Map(), now = new Date()) {
  const entries = [...revoked].map(([serial, at]) => seq(Uint8Array.from(Buffer.from(serial, 'hex')), utc(at)))
  return signed(issuer.keys.privateKey, seq(int(Uint8Array.of(1)), ECDSA_SHA256, issuer.name, utc(now), ...(entries.length ? [seq(...entries)] : [])))
}

/** A certificate's serial, as ocspAnswer and crlOf name it. @param {Uint8Array} certificate */
export const serialOf = (certificate) => Buffer.from(raw(children(children(read(certificate))[0])[1])).toString('hex')
