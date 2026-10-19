// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// What an organisation's authority gives (D434), read as RFC 5280 has it: a certificate's serial, names, key and
// time, and the extensions that say whether it may certify others, where to ask whether it was revoked (OCSP,
// CRLs) and where its issuer's certificate is (CA Issuers); whether a signature holds by a key; a chain, issuer by issuer; and certificates from PEM, base64 or a
// PKCS#7 bundle (RFC 5652's SignedData with no signer, as RFC 7030's certs-only answers). Web Crypto and der.js
// only, so it is tested under node --test.
import { read, children, raw, readCertificate, keyOf, p1363, dottedOf, valueOf } from '../caps/receipt/der.js'

/** @typedef {ReturnType<typeof parts>} Parts */
/** @typedef {import('../caps/receipt/der.js').Node} Node */

/** Web Crypto's names for a signature's algorithm and its hash, by OID: ECDSA, and RSA's PKCS #1 v1.5. */
export const ALGORITHMS = /** @type {Record<string, [string, string]>} */ ({
  '1.2.840.10045.4.3.2': ['ECDSA', 'SHA-256'], '1.2.840.10045.4.3.3': ['ECDSA', 'SHA-384'], '1.2.840.10045.4.3.4': ['ECDSA', 'SHA-512'],
  '1.2.840.113549.1.1.11': ['RSASSA-PKCS1-v1_5', 'SHA-256'], '1.2.840.113549.1.1.12': ['RSASSA-PKCS1-v1_5', 'SHA-384'], '1.2.840.113549.1.1.13': ['RSASSA-PKCS1-v1_5', 'SHA-512'],
})

/** @param {Uint8Array} bytes */
export const base64 = (bytes) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
/** Base64, padded or not, or PEM's body, as bytes. @param {string} text */
export const unbase64 = (text) => Uint8Array.from(atob(text.replace(/-----[^-]+-----|\s/g, '')), (char) => char.charCodeAt(0))
/** @param {Uint8Array} a @param {Uint8Array} b */
export const same = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i])

/**
 * Each certificate given: DER, a PKCS#7 bundle in DER or base64, PEM blocks, or one certificate in base64.
 * @param {Uint8Array | string} given @returns {Uint8Array[]}
 */
export function certificatesIn(given) {
  const text = typeof given === 'string' ? given : given[0] === 0x30 ? '' : new TextDecoder().decode(given)
  if (text.includes('-----BEGIN CERTIFICATE-----')) return (text.match(/-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----/g) ?? []).map(unbase64)
  const der = text ? unbase64(text) : /** @type {Uint8Array} */ (given)
  const [first] = children(read(der))
  // A ContentInfo starts with its type; a certificate with what it signs.
  return first.tag === 0x06 ? bundled(der) : [der]
}

/** The certificates of a PKCS#7 bundle. @param {Uint8Array} der */
function bundled(der) {
  const [type, content] = children(read(der))
  if (dottedOf(type) !== '1.2.840.113549.1.7.2' || !content) throw new Error('format')
  const certificates = children(children(content)[0]).find((node) => node.tag === 0xa0)
  return certificates ? children(certificates).map((node) => raw(node).slice()) : []
}

/**
 * A certificate as the checks need it: readCertificate's reading, then its parts as DER (what is signed, how and
 * the signature, its serial as an INTEGER, its issuer's name and its own, its key's bits) and its extensions'
 * values by OID. @param {Uint8Array} der
 */
export function parts(der) {
  const [tbs, algorithm, signature] = children(read(der))
  const fields = children(tbs)
  const [serial, , issuer, , subject, spki] = fields.slice(fields[0].tag === 0xa0 ? 1 : 0)
  /** @type {Map<string, Node>} */
  const extensions = new Map()
  const wrapped = fields.find((node) => node.tag === 0xa3)
  for (const extension of wrapped ? children(children(wrapped)[0]) : []) {
    const [id, ...rest] = children(extension)
    extensions.set(dottedOf(id), read(valueOf(/** @type {Node} */ (rest.at(-1)))))
  }
  return {
    ...readCertificate(der), der, tbs: raw(tbs), algorithm: dottedOf(children(algorithm)[0]), signature: valueOf(signature).subarray(1),
    serial: raw(serial), issuerName: raw(issuer), subjectName: raw(subject), keyBits: valueOf(children(spki)[1]).subarray(1), extensions,
  }
}

/** A GeneralName's URI (RFC 5280 4.2.1.6). @param {Node} node */
const uri = (node) => (node.tag === 0x86 ? [new TextDecoder().decode(valueOf(node))] : [])

/** Where its Authority Information Access says to go for a method, by OID. @param {Parts} cert @param {string} method @returns {string[]} */
function accessed(cert, method) {
  const access = cert.extensions.get('1.3.6.1.5.5.7.1.1')
  return access ? children(access).flatMap((description) => {
    const [kind, location] = children(description)
    return dottedOf(kind) === method ? uri(location) : []
  }) : []
}

/** Where its OCSP responders answer. @param {Parts} cert */
export const responders = (cert) => accessed(cert, '1.3.6.1.5.5.7.48.1')
/** Where its issuer's certificate is (CA Issuers, RFC 5280 4.2.2.1): one in DER, or a PKCS#7 bundle. @param {Parts} cert */
export const issuers = (cert) => accessed(cert, '1.3.6.1.5.5.7.48.2')

/** Where its CRLs are (CRL Distribution Points' full names). @param {Parts} cert @returns {string[]} */
export function lists(cert) {
  const points = cert.extensions.get('2.5.29.31')
  return points ? children(points).flatMap((point) => {
    const name = children(point).find((node) => node.tag === 0xa0)
    const full = name && children(name).find((node) => node.tag === 0xa0)
    return full ? children(full).flatMap(uri) : []
  }) : []
}

/** Whether it may certify others (basicConstraints' cA). @param {Parts} cert */
export function certifies(cert) {
  const constraints = cert.extensions.get('2.5.29.19')
  const [ca] = constraints ? children(constraints) : []
  return ca?.tag === 0x01 && valueOf(ca)[0] !== 0
}

/** What it may be used for (extended key usages, by OID). @param {Parts} cert @returns {string[]} */
export function usages(cert) {
  const usage = cert.extensions.get('2.5.29.37')
  return usage ? children(usage).map(dottedOf) : []
}

/** Whether a signature over `signed` holds by a key (its SPKI), for the algorithm its OID names. @param {Uint8Array} signed @param {string} algorithm @param {Uint8Array} signature @param {Uint8Array} spki */
export async function holds(signed, algorithm, signature, spki) {
  const [name, hash] = ALGORITHMS[algorithm] ?? []
  const key = name && await keyOf(spki, hash).catch(() => null)
  if (!key || (key.algorithm.name === 'ECDSA') !== (name === 'ECDSA')) return false
  const curve = /** @type {EcKeyAlgorithm} */ (key.algorithm).namedCurve
  const bytes = curve ? p1363(signature, Math.ceil(Number(curve.slice(2)) / 8)) : signature
  return crypto.subtle.verify(curve ? { name, hash } : name, key, /** @type {BufferSource} */ (bytes), /** @type {BufferSource} */ (signed)).catch(() => false)
}

/** Whether a certificate was issued by another: named by it, and signed by its key. @param {Parts} cert @param {Parts} issuer */
export const issuedBy = async (cert, issuer) => same(cert.issuerName, issuer.subjectName) && holds(cert.tbs, cert.algorithm, cert.signature, issuer.spki)

/**
 * A certificate's chain from those given, issuer by issuer: each one an authority that issued the one before, up
 * to one that issued itself, or none given did. Leaf first. @param {Parts} leaf @param {Parts[]} given
 */
export async function chainOf(leaf, given) {
  const chain = [leaf]
  for (let last = leaf; !last.selfIssued && chain.length < 10;) {
    let next
    for (const one of given) if (!chain.includes(one) && certifies(one) && await issuedBy(last, one)) { next = one; break }
    if (!next) break
    chain.push((last = next))
  }
  return chain
}

/** A name's common name, else its organisation, as cards show who it is. @param {Record<string, string>} name */
export const nameOf = (name) => name['2.5.4.3'] ?? name['2.5.4.10'] ?? ''
