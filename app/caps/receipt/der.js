// DER (X.690) as certificates need it: the seal's own X.509 certificate, made once for its key and
// carried in each certificate's x5c (D274), read back by check(). Web Crypto only, so it runs where
// the core does and is tested with node --test.
import { BRAND } from '../../brand.js'

const encoder = new TextEncoder()

/** @param {...Uint8Array} parts */
export const concat = (...parts) => {
  const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  parts.reduce((at, part) => (all.set(part, at), at + part.length), 0)
  return all
}

/** A tag, its length and what it holds. @param {number} tag @param {...Uint8Array} parts */
export const tlv = (tag, ...parts) => {
  const body = concat(...parts)
  const length = body.length < 128 ? [body.length] : [...(body.length < 256 ? [0x81] : [0x82, body.length >> 8]), body.length & 255]
  return concat(Uint8Array.of(tag, ...length), body)
}
/** @param {...Uint8Array} parts */
export const seq = (...parts) => tlv(0x30, ...parts)
/** An unsigned integer from its big-endian bytes, as short as it can be and never negative. @param {Uint8Array} bytes */
export const int = (bytes) => {
  let start = 0
  while (start < bytes.length - 1 && bytes[start] === 0) start++
  const rest = bytes.subarray(start)
  return tlv(0x02, ...(rest[0] & 0x80 ? [Uint8Array.of(0)] : []), rest)
}
/** @param {string} dotted */
export const oid = (dotted) => {
  const [first, second, ...arcs] = dotted.split('.').map(Number)
  return tlv(0x06, Uint8Array.from([40 * first + second, ...arcs].flatMap((arc) => {
    const bytes = [arc & 127]
    while ((arc = Math.floor(arc / 128))) bytes.unshift((arc & 127) | 128)
    return bytes
  })))
}
/** @param {Uint8Array} bytes */
export const bits = (bytes, unused = 0) => tlv(0x03, Uint8Array.of(unused), bytes)
/** @param {Uint8Array} bytes */
export const octets = (bytes) => tlv(0x04, bytes)
/** UTCTime until 2049, GeneralizedTime from 2050 (RFC 5280 4.1.2.5). @param {Date} date */
const time = (date) => {
  const text = date.toISOString().replace(/[-:T]|\.\d+/g, '')
  return date.getUTCFullYear() < 2050 ? tlv(0x17, encoder.encode(text.slice(2))) : tlv(0x18, encoder.encode(text))
}
/** A name: the software that made the certificate, as C2PA's validators ask of a signer's organisation, then its common name. @param {string} common */
const name = (common) => seq(...[['2.5.4.10', BRAND.name], ['2.5.4.3', common]].map(([type, value]) => tlv(0x31, seq(oid(type), tlv(0x0c, encoder.encode(value))))))
const ECDSA_SHA256 = seq(oid('1.2.840.10045.4.3.2'))

/** ECDSA's signature as Web Crypto gives it (r‖s, 64 bytes), as DER's Ecdsa-Sig-Value. @param {Uint8Array} signature */
export const derSignature = (signature) => seq(int(signature.subarray(0, 32)), int(signature.subarray(32)))

/**
 * The seal's certificate (X.509 v3), issued by its own key: named by the key's thumbprint and
 * nothing of the person's, valid ten years from now, for signatures that commit to what they sign,
 * on documents (RFC 9336), with the key identifiers C2PA's validators ask of a signer's (D324).
 * @param {CryptoKeyPair} keys @param {string} thumbprint @param {Date} [now]
 */
export async function selfIssued(keys, thumbprint, now = new Date()) {
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey))
  const serial = crypto.getRandomValues(new Uint8Array(16))
  serial[0] &= 0x7f
  const until = new Date(now)
  until.setUTCFullYear(now.getUTCFullYear() + 10)
  const id = new Uint8Array(await crypto.subtle.digest('SHA-256', spki)).subarray(0, 20)
  const extension = (/** @type {string} */ ext, /** @type {Uint8Array} */ value, critical = false) => seq(oid(ext), ...(critical ? [Uint8Array.of(1, 1, 255)] : []), octets(value))
  const tbs = seq(tlv(0xa0, int(Uint8Array.of(2))), int(serial), ECDSA_SHA256, name(thumbprint), seq(time(now), time(until)), name(thumbprint), spki,
    tlv(0xa3, seq(extension('2.5.29.19', seq(), true), extension('2.5.29.15', bits(Uint8Array.of(0xc0), 6), true), extension('2.5.29.37', seq(oid('1.3.6.1.5.5.7.3.36'))),
      extension('2.5.29.14', octets(id)), extension('2.5.29.35', seq(tlv(0x80, id))))))
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, tbs))
  return seq(tbs, ECDSA_SHA256, bits(derSignature(signature)))
}

/** @typedef {{ tag: number, at: number, start: number, end: number, bytes: Uint8Array }} Node its tag at bytes[at], what it holds bytes[start, end) */

/** The TLV at an offset. @param {Uint8Array} bytes @param {number} [at] @returns {Node} */
export function read(bytes, at = 0) {
  if (at + 2 > bytes.length) throw new Error('format')
  const tag = bytes[at]
  let length = bytes[at + 1]
  let start = at + 2
  if (length & 0x80) {
    const count = length & 0x7f
    if (!count || count > 4) throw new Error('format')
    length = 0
    for (let i = 0; i < count; i++) length = length * 256 + bytes[start + i]
    start += count
  }
  if (start + length > bytes.length) throw new Error('format')
  return { tag, at, start, end: start + length, bytes }
}
/** The TLVs a constructed one holds. @param {Node} node @returns {Node[]} */
export function children({ start, end, bytes }) {
  const all = []
  for (let at = start; at < end; at = all[all.length - 1].end) all.push(read(bytes, at))
  return all
}
/** A TLV whole, its tag and length included. @param {Node} node */
export const raw = (node) => node.bytes.subarray(node.at, node.end)
/** @param {Node} node */
const text = (node) => new TextDecoder().decode(node.bytes.subarray(node.start, node.end))
/** @param {Node} node */
const dottedOf = (node) => {
  const bytes = node.bytes.subarray(node.start, node.end)
  const arcs = [Math.floor(bytes[0] / 40), bytes[0] % 40]
  for (let i = 1, arc = 0; i < bytes.length; i++) {
    arc = arc * 128 + (bytes[i] & 127)
    if (!(bytes[i] & 128)) arcs.push(arc), (arc = 0)
  }
  return arcs.join('.')
}
/** A name's attributes, by OID (2.5.4.3 its common name, 2.5.4.6 its country). @param {Node} node @returns {Record<string, string>} */
export const names = (node) => Object.fromEntries(children(node).flatMap(children).map((pair) => {
  const [type, value] = children(pair)
  return [dottedOf(type), text(value)]
}))
/** @param {Node} node */
const dateOf = (node) => {
  const digits = text(node)
  const full = node.tag === 0x17 ? `${Number(digits.slice(0, 2)) < 50 ? '20' : '19'}${digits}` : digits
  return new Date(`${full.slice(0, 4)}-${full.slice(4, 6)}-${full.slice(6, 8)}T${full.slice(8, 10)}:${full.slice(10, 12)}:${full.slice(12, 14)}Z`)
}

/**
 * What check() needs of a certificate: its key, when it may be used, who it names and who issued it.
 * @param {Uint8Array} der
 */
export function readCertificate(der) {
  const [tbs] = children(read(der))
  const fields = children(tbs)
  const [issuer, validity, subject, spki] = fields.slice(fields[0].tag === 0xa0 ? 3 : 2)
  const [from, until] = children(validity)
  return { spki: raw(spki), from: dateOf(from), until: dateOf(until), subject: names(subject), issuer: names(issuer), selfIssued: raw(issuer).join() === raw(subject).join() }
}

// ─── Timestamps (RFC 3161, D274) ─────────────────────────────────────────────

const HASHES = /** @type {Record<string, string>} */ ({ '2.16.840.1.101.3.4.2.1': 'SHA-256', '2.16.840.1.101.3.4.2.2': 'SHA-384', '2.16.840.1.101.3.4.2.3': 'SHA-512' })
const CURVES = /** @type {Record<string, string>} */ ({ '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521' })
/** @param {Node} node */
const valueOf = (node) => node.bytes.subarray(node.start, node.end)

/** An RFC 3161 request for a time on a SHA-256, with a nonce, asking for the authority's certificate. @param {Uint8Array} imprint @param {Uint8Array} nonce */
export const timestampRequest = (imprint, nonce) => seq(int(Uint8Array.of(1)), seq(seq(oid('2.16.840.1.101.3.4.2.1'), tlv(0x05)), octets(imprint)), int(nonce), Uint8Array.of(1, 1, 255))

/** The token of an RFC 3161 answer, once granted. @param {Uint8Array} der */
export function tokenOf(der) {
  const [status, token] = children(read(der))
  if (valueOf(children(status)[0])[0] > 1 || !token) throw new Error('refused')
  return raw(token)
}

/** A key from its SPKI, for ECDSA or RSA signatures with a hash. @param {Uint8Array} spki @param {string} hash @param {string} [rsa] */
export async function keyOf(spki, hash, rsa = 'RSASSA-PKCS1-v1_5') {
  const [algorithm] = children(read(spki))
  const [kind, curve] = children(algorithm)
  const ec = dottedOf(kind) === '1.2.840.10045.2.1'
  return crypto.subtle.importKey('spki', /** @type {BufferSource} */ (spki), ec ? { name: 'ECDSA', namedCurve: CURVES[dottedOf(curve)] } : { name: rsa, hash }, false, ['verify'])
}

/** ECDSA's Ecdsa-Sig-Value as Web Crypto takes it, r‖s, each the curve's size. @param {Uint8Array} der @param {number} size */
export const p1363 = (der, size) => concat(...children(read(der)).map((part) => {
  const bytes = valueOf(part).subarray(Math.max(0, part.end - part.start - size))
  return concat(new Uint8Array(size - bytes.length), bytes)
}))

/**
 * What an RFC 3161 token says, and whether its signer's signature holds by a certificate it carries
 * over attributes whose digest is its TSTInfo's: when, on what imprint, with which nonce, and who.
 * @param {Uint8Array} token
 */
export async function readToken(token) {
  const signed = children(children(children(read(token))[1])[0])
  const tst = valueOf(children(children(signed[2])[1])[0])
  const info = children(read(tst))
  const signer = children(children(signed.at(-1) ?? signed[0])[0])
  const hash = HASHES[dottedOf(children(signer[2])[0])]
  const attributes = signer.find((node) => node.tag === 0xa0)
  const signature = signer.findLast((node) => node.tag === 0x04)
  if (!hash || !attributes || !signature) throw new Error('format')
  const digest = children(attributes).map(children).find(([type]) => dottedOf(type) === '1.2.840.113549.1.9.4')?.[1]
  const kept = digest ? valueOf(children(digest)[0]).join() : ''
  const covered = kept === new Uint8Array(await crypto.subtle.digest(hash, /** @type {BufferSource} */ (tst))).join()
  // The signed attributes are signed as a SET, where the token keeps them as [0].
  const message = concat(Uint8Array.of(0x31), raw(attributes).subarray(1))
  let authority = null
  for (const certificate of children(signed.find((node) => node.tag === 0xa0) ?? read(Uint8Array.of(0x30, 0)))) {
    const { spki, subject } = readCertificate(raw(certificate))
    const key = await keyOf(spki, hash).catch(() => null)
    const curve = /** @type {any} */ (key?.algorithm)?.namedCurve
    const bytes = curve ? p1363(valueOf(signature), Math.ceil(Number(curve.slice(2)) / 8)) : valueOf(signature)
    if (key && await crypto.subtle.verify(curve ? { name: 'ECDSA', hash } : 'RSASSA-PKCS1-v1_5', key, /** @type {BufferSource} */ (bytes), /** @type {BufferSource} */ (message))) authority = subject
  }
  const nonce = info.find((node, i) => i > 4 && node.tag === 0x02)
  return { at: dateOf(info[4]), imprint: valueOf(children(info[2])[1]), nonce: nonce ? valueOf(nonce) : null, authority, intact: covered && authority !== null }
}
