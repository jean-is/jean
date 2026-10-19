// An organisation's authority for the tests (D434), built as real ones answer: a root and an intermediate that
// certify keys, an EST service's certs-only answers (RFC 7030), OCSP answers (RFC 6960), signed by the issuer or a
// responder it certified for that, and CRLs (RFC 5280); and a qualified provider's CSC API (v2), which holds its key
// and signs the SHA-256 it is given (D436). Web Crypto, der.js and Node's Buffer, so the unit tests and the browser
// tests' routes share it.
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

/** The QCStatements (ETSI EN 319 412-5) of an EU qualified certificate for seals whose key a qualified device keeps (D437): QcCompliance, QcSSCD, QcType eseal. */
export const QUALIFIED = /** @type {[string, string[]?][]} */ ([['0.4.0.1862.1.1'], ['0.4.0.1862.1.4'], ['0.4.0.1862.1.6', ['0.4.0.1862.1.6.2']]])

/**
 * A certificate for a key, issued by an authority or by itself: an authority's, a responder's or a seal's, saying
 * where to ask whether it was revoked, where its issuer's certificate is (`caIssuers`), and with `statements` what
 * it says it is (QCStatements: each one's OID, and the OIDs it lists). @param {{ spki: Uint8Array, subject: string,
 * issuer?: Authority, key?: CryptoKey, ca?: boolean, ocsp?: string, caIssuers?: string, crl?: string, usages?: string[],
 * statements?: [string, string[]?][], from?: Date, until?: Date, serial?: number }} given
 */
export async function issue({ spki, subject, issuer, key, ca = false, ocsp, caIssuers, crl, usages = [], statements = [], from = new Date('2026-01-01T00:00:00Z'), until = new Date('2030-01-01T00:00:00Z'), serial = serials++ }) {
  // Authority Information Access: its OCSP responder, and its CA Issuers address.
  const access = [...(ocsp ? [seq(oid('1.3.6.1.5.5.7.48.1'), uri(ocsp))] : []), ...(caIssuers ? [seq(oid('1.3.6.1.5.5.7.48.2'), uri(caIssuers))] : [])]
  const extensions = [
    extension('2.5.29.19', ca ? seq(Uint8Array.of(1, 1, 255)) : seq(), true),
    extension('2.5.29.15', ca ? bits(Uint8Array.of(0x06), 1) : bits(Uint8Array.of(0xc0), 6), true),
    ...(usages.length ? [extension('2.5.29.37', seq(...usages.map(oid)))] : []),
    ...(access.length ? [extension('1.3.6.1.5.5.7.1.1', seq(...access))] : []),
    ...(crl ? [extension('2.5.29.31', seq(seq(tlv(0xa0, tlv(0xa0, uri(crl))))))] : []),
    ...(statements.length ? [extension('1.3.6.1.5.5.7.1.3', seq(...statements.map(([id, listed]) => seq(oid(id), ...(listed ? [seq(...listed.map(oid))] : [])))))] : []),
  ]
  const tbs = seq(tlv(0xa0, int(Uint8Array.of(2))), int(Uint8Array.of(serial >> 8, serial & 255)), ECDSA_SHA256, issuer?.name ?? named(subject),
    seq(utc(from), utc(until)), named(subject), spki, tlv(0xa3, seq(...extensions)))
  return signed(/** @type {CryptoKey} */ (issuer?.keys.privateKey ?? key), tbs)
}

/** An authority: its own keys and certificate, issued by another or by itself. @param {string} common @param {{ issuer?: Authority, ocsp?: string, caIssuers?: string, crl?: string, from?: Date, until?: Date }} [given] @returns {Promise<Authority>} */
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

// ─── A qualified provider's CSC API (D436) ───────────────────────────────────

// P-256 (FIPS 186-4 D.1.2.3), for a provider that signs the SHA-256 it is given, which Web Crypto can't: it hashes first.
const P = 2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n
const G = /** @type {[bigint, bigint]} */ ([0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n])
const mod = (/** @type {bigint} */ a, /** @type {bigint} */ m) => ((a % m) + m) % m
/** @param {bigint} a @param {bigint} m */
const inverse = (a, m) => {
  let [r0, r1, s0, s1] = [mod(a, m), m, 1n, 0n]
  while (r1) [r0, r1, s0, s1] = [r1, r0 - (r0 / r1) * r1, s1, s0 - (r0 / r1) * s1]
  return mod(s0, m)
}
/** @param {[bigint, bigint] | null} p @param {[bigint, bigint] | null} q @returns {[bigint, bigint] | null} */
const add = (p, q) => {
  if (!p || !q) return p ?? q
  if (p[0] === q[0] && mod(p[1] + q[1], P) === 0n) return null
  const slope = p[0] === q[0] ? mod(3n * p[0] * p[0] - 3n, P) * inverse(2n * p[1], P) : mod(q[1] - p[1], P) * inverse(q[0] - p[0], P)
  const x = mod(slope * slope - p[0] - q[0], P)
  return [x, mod(slope * (p[0] - x) - p[1], P)]
}
/** @param {bigint} k @param {[bigint, bigint]} point */
const times = (k, point) => {
  let [result, bit] = [/** @type {[bigint, bigint] | null} */ (null), /** @type {[bigint, bigint] | null} */ (point)]
  for (; k > 0n; k >>= 1n, bit = add(bit, bit)) if (k & 1n) result = add(result, bit)
  return /** @type {[bigint, bigint]} */ (result)
}
const big = (/** @type {Uint8Array} */ bytes) => BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`)
const bytes32 = (/** @type {bigint} */ n) => Uint8Array.from(Buffer.from(n.toString(16).padStart(64, '0'), 'hex'))

/** ECDSA P-256 on a SHA-256 given, by a JWK's private scalar: r‖s. @param {string} d @param {Uint8Array} digest */
export function signDigest(d, digest) {
  const secret = big(Buffer.from(d, 'base64url'))
  for (;;) {
    const k = mod(big(crypto.getRandomValues(new Uint8Array(40))), N - 1n) + 1n
    const r = mod(times(k, G)[0], N)
    const s = mod(inverse(k, N) * (big(digest) + r * secret), N)
    if (r && s) return Uint8Array.from([...bytes32(r), ...bytes32(s)])
  }
}

/**
 * A qualified provider's CSC API (v2) as `send` reaches it, holding one credential: its key, which never leaves it, and
 * its chain, leaf first. `credentials/info` gives the chain, with what `info` changes; `credentials/authorize` a SAD for
 * the hashes it is asked; `signatures/signHash` signs those hashes, once, as DER (r‖s when `raw`). What each was asked.
 * @param {{ base: string, credential: string, keys: CryptoKeyPair, chain: Uint8Array[], raw?: boolean, info?: Record<string, any> }} given
 */
export function provider({ base, credential, keys, chain, raw = false, info = {} }) {
  const asked = /** @type {{ address: string, body: any, headers: Headers }[]} */ ([])
  const granted = new Map()
  /** @param {string} address @param {RequestInit} init */
  const send = async (address, init) => {
    const body = JSON.parse(String(init.body))
    asked.push({ address, body, headers: new Headers(init.headers) })
    const refuse = (/** @type {string} */ error) => Response.json({ error: 'invalid_request', error_description: error }, { status: 400 })
    if (body.credentialID !== credential) return refuse('Invalid parameter credentialID')
    if (address === `${base}/credentials/info`) {
      const certificates = (body.certificates === 'chain' ? chain : chain.slice(0, 1)).map((der) => Buffer.from(der).toString('base64'))
      return Response.json({ key: { status: 'enabled', algo: ['1.2.840.10045.4.3.2'], len: 256 }, cert: { status: 'valid', certificates }, ...(body.authInfo && { auth: { mode: 'implicit' } }), SCAL: '1', multisign: 1, ...info })
    }
    if (address === `${base}/credentials/authorize`) {
      const SAD = crypto.randomUUID()
      granted.set(SAD, body.hashes.join())
      return Response.json({ SAD, expiresIn: 300 })
    }
    if (address === `${base}/signatures/signHash`) {
      if (granted.get(body.SAD) !== body.hashes.join() || body.hashAlgorithmOID !== '2.16.840.1.101.3.4.2.1') return refuse('Invalid SAD')
      granted.delete(body.SAD)
      const { d = '' } = await crypto.subtle.exportKey('jwk', keys.privateKey)
      const signatures = body.hashes.map((/** @type {string} */ hash) => signDigest(d, Buffer.from(hash, 'base64'))).map((/** @type {Uint8Array} */ rs) => Buffer.from(raw ? rs : derSignature(rs)).toString('base64'))
      return Response.json({ signatures })
    }
    return new Response('', { status: 404 })
  }
  return { asked, send }
}

/** A key a provider holds: extractable, since the fake signs digests by its scalar. @param {string} [curve] */
export const providerKeys = (curve = 'P-256') => /** @type {Promise<CryptoKeyPair>} */ (crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: curve }, true, ['sign', 'verify']))
