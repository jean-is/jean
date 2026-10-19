// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Whether an authority the organisation trusts vouches for a sealed certificate (D434). Policy's `trust` names its
// anchors (PEM, or base64 DER), or the EU's trusted lists, whose qualified authorities count while their member
// state's list granted them (D439, lists.js): the key in the certificate's x5c, with the certificates its xVals carry, must lead
// issuer by issuer, each an authority, each valid when it was sealed, to one of them. Then what its rVals keep
// (JAdES B-LT): an OCSP answer, signed by the issuer or a responder it certified for that, or a CRL the issuer
// signed, says whether each was revoked by then. And, once they vouch for it, whether its certificate says it is an
// EU qualified seal (ETSI EN 319 412-5's QCStatements, D437), which a list that names what its authority certifies
// for must say includes seals. Pure, so it is tested under node --test.
import { read, children, raw, valueOf, dateOf, dottedOf } from '../caps/receipt/der.js'
import { parts, chainOf, certificatesIn, holds, issuedBy, usages, same, base64, unbase64, nameOf } from './pkix.js'

/** @typedef {import('./pkix.js').Parts} Parts */
/** @typedef {import('../caps/receipt/der.js').Node} Node */
/** @typedef {{ status: 'trusted' | 'unchecked' | 'untrusted' | 'revoked', name: string, qualified?: true }} Verdict */
/** @typedef {{ protected: string, header?: { etsiU?: any[] } }} Sealed */
/** @typedef {Parts & { seals?: boolean }} Anchor an anchor, and whether its trusted list says it certifies seals */

const HASHES = /** @type {Record<string, string>} */ ({ '1.3.14.3.2.26': 'SHA-1', '2.16.840.1.101.3.4.2.1': 'SHA-256' })

/** Policy's anchors, read, its trusted lists too; throws, saying which one isn't a certificate, or a list. @param {unknown} trust @returns {Parts[]} */
export function anchorsOf(trust) {
  if (!Array.isArray(trust) || !trust.length) throw new Error('policy.json’s trust is a list of the certificates of authorities the organisation trusts, in PEM or base64')
  listsOf(trust)
  return trust.flatMap((one, i) => {
    if (one && typeof one === 'object') return []
    try {
      return certificatesIn(String(one)).map(parts)
    } catch {
      throw new Error(`policy.json’s trust[${i}] isn’t a certificate`)
    }
  })
}

/**
 * The EU's trusted lists policy's `trust` names (D439): the List of Trusted Lists' address, and the certificates the
 * Official Journal publishes for it, in PEM or base64; throws, saying which isn't. @param {unknown[]} trust
 * @returns {{ lotl: string, signers: string[] }[]} the signers in base64
 */
export const listsOf = (trust) => trust.flatMap((one, i) => {
  if (!one || typeof one !== 'object') return []
  const { lotl, signers } = /** @type {Record<string, unknown>} */ (one)
  try {
    if (typeof lotl !== 'string' || !/^https:\/\//.test(lotl) || !Array.isArray(signers) || !signers.length) throw new Error()
    return [{ lotl, signers: signers.flatMap((pem) => certificatesIn(String(pem)).map(base64)) }]
  } catch {
    throw new Error(`policy.json’s trust[${i}] names the EU’s List of Trusted Lists: its HTTPS address in lotl, and in signers the certificates the Official Journal publishes for it`)
  }
})

/** What a sealed certificate carries: its unsigned values by name, and its certificates, x5c's then those its xVals keep. @param {Sealed} sealed */
function carried(sealed) {
  const header = JSON.parse(new TextDecoder().decode(unbase64(sealed.protected.replace(/-/g, '+').replace(/_/g, '/'))))
  const unsigned = sealed.header?.etsiU ?? []
  const values = (/** @type {string} */ name) => unsigned.flatMap((one) => (one[name] ? [one[name]] : []))
  return { values, certificates: [...[header.x5c ?? []].flat(), ...values('xVals').flat().map((one) => one.x509Cert?.val)].filter(Boolean).map((text) => parts(unbase64(String(text)))) }
}

/** The territories whose trusted lists may hold a sealed certificate's authority: the countries its certificates' names give (Greece's list is EL's). @param {Sealed} sealed */
export const territoriesOf = (sealed) => [...new Set(carried(sealed).certificates.flatMap((one) => [one.issuer, one.subject]).flatMap((name) => name['2.5.4.6'] ?? []).map((code) => (code === 'GR' ? 'EL' : code)))]

/**
 * What an OCSP answer says of a certificate, once it is the issuer's or a responder's it certified for that:
 * when it was revoked, or null when it wasn't; undefined when it says nothing of it.
 * @param {Uint8Array} der @param {Parts} cert @param {Parts} issuer @returns {Promise<Date | null | undefined>}
 */
async function ocspSays(der, cert, issuer) {
  const [, bytes] = children(read(der))
  const basic = read(valueOf(children(children(bytes)[0])[1]))
  const [data, algorithm, signature, carried] = children(basic)
  const responders = carried ? children(children(carried)[0]).map((node) => parts(raw(node).slice())) : []
  const signers = [issuer, ...await filter(responders, async (one) => usages(one).includes('1.3.6.1.5.5.7.3.9') && await issuedBy(one, issuer))]
  const algorithmOf = dottedOf(children(algorithm)[0])
  let signed = false
  for (const signer of signers) if ((signed = await holds(raw(data), algorithmOf, valueOf(signature).subarray(1), signer.spki))) break
  if (!signed) return undefined
  const fields = children(data)
  const responses = fields.find((node, i) => i > 0 && node.tag === 0x30 && fields[i - 1].tag === 0x18)
  for (const single of responses ? children(responses) : []) {
    const [id, status] = children(single)
    const [hashing, nameHash, keyHash, serial] = children(id)
    const hash = HASHES[dottedOf(children(hashing)[0])]
    if (!hash || !same(raw(serial), cert.serial)) continue
    const digest = async (/** @type {Uint8Array} */ bytes) => new Uint8Array(await crypto.subtle.digest(hash, /** @type {BufferSource} */ (bytes)))
    if (!same(valueOf(nameHash), await digest(cert.issuerName)) || !same(valueOf(keyHash), await digest(issuer.keyBits))) continue
    if (status.tag === 0x80) return null
    if (status.tag === 0xa1) return dateOf(children(status)[0])
  }
  return undefined
}

/** What a CRL the issuer signed says of a certificate: when it was revoked, null if it wasn't. @param {Uint8Array} der @param {Parts} cert @param {Parts} issuer @returns {Promise<Date | null | undefined>} */
async function crlSays(der, cert, issuer) {
  const [list, algorithm, signature] = children(read(der))
  const fields = children(list)
  const [, name] = fields.slice(fields[0].tag === 0x02 ? 1 : 0)
  if (!same(raw(name), cert.issuerName) || !await holds(raw(list), dottedOf(children(algorithm)[0]), valueOf(signature).subarray(1), issuer.spki)) return undefined
  const revoked = fields.find((node, i) => node.tag === 0x30 && i > 2 && [0x17, 0x18].includes(fields[i - 1].tag))
  for (const entry of revoked ? children(revoked) : []) {
    const [serial, when] = children(entry)
    if (same(raw(serial), cert.serial)) return dateOf(when)
  }
  return null
}

/**
 * Whether a certificate says it is an EU qualified certificate (QcCompliance, under no other legislation), for seals
 * (QcType eseal), whose key a qualified device keeps (QcSSCD). @param {Parts} cert
 */
function qualified(cert) {
  const statements = cert.extensions.get('1.3.6.1.5.5.7.1.3')
  const said = new Map((statements ? children(statements) : []).map((one) => [dottedOf(children(one)[0]), children(one)[1]]))
  const types = said.get('0.4.0.1862.1.6')
  return said.has('0.4.0.1862.1.1') && said.has('0.4.0.1862.1.4') && !said.has('0.4.0.1862.1.7') && !!types && children(types).map(dottedOf).includes('0.4.0.1862.1.6.2')
}

/** @template T @param {T[]} all @param {(one: T) => Promise<boolean>} keep */
const filter = async (all, keep) => (await Promise.all(all.map(async (one) => ((await keep(one)) ? [one] : [])))).flat()

/**
 * Whether the organisation's anchors vouch for a sealed certificate's key at the time it says it was sealed, and
 * whether what it keeps shows each certificate on the way unrevoked then: `trusted`, `unchecked` (it doesn't show
 * that), `revoked`, or `untrusted`, with the anchor's name, or the certificate's issuer's; `qualified` when trusted,
 * its certificate says it is an EU qualified seal, and the anchor's list doesn't say its authority certifies no seals.
 * @param {Sealed} sealed @param {Anchor[]} anchors @param {Date} at @returns {Promise<Verdict>}
 */
export async function verdict(sealed, anchors, at) {
  const { values, certificates: [leaf, ...given] } = carried(sealed)
  if (!leaf) return { status: 'untrusted', name: '' }
  // The chain as far as it goes, up to the first that is an anchor, or that an anchor issued.
  const chain = await chainOf(leaf, given)
  /** @type {Anchor | undefined} */
  let anchor
  let vouched = chain
  for (const [i, one] of chain.entries()) {
    anchor = anchors.find((other) => same(other.der, one.der))
    if (anchor) vouched = chain.slice(0, i)
    else for (const other of anchors) if (await issuedBy(one, other)) { [anchor, vouched] = [other, chain.slice(0, i + 1)]; break }
    if (anchor) break
  }
  const valid = (/** @type {Parts} */ one) => one.from <= at && at <= one.until
  if (!anchor || ![...vouched, anchor].every(valid)) return { status: 'untrusted', name: nameOf(leaf.issuer) }
  const name = nameOf(anchor.subject)
  // Each up to the anchor, by its issuer: the next, or the anchor.
  const revocations = values('rVals')
  const ocsp = revocations.flatMap((one) => one.ocspVals ?? []).map((one) => unbase64(one.val))
  const crl = revocations.flatMap((one) => one.crlVals ?? []).map((one) => unbase64(one.val))
  let shown = true
  for (const [i, cert] of vouched.entries()) {
    const issuer = vouched[i + 1] ?? anchor
    let said
    for (const der of ocsp) if ((said = await ocspSays(der, cert, issuer).catch(() => undefined)) !== undefined) break
    if (said === undefined) for (const der of crl) if ((said = await crlSays(der, cert, issuer).catch(() => undefined)) !== undefined) break
    if (said && said <= at) return { status: 'revoked', name }
    if (said === undefined) shown = false
  }
  return { status: shown ? 'trusted' : 'unchecked', name, ...(shown && qualified(leaf) && anchor.seals !== false && { qualified: true }) }
}
