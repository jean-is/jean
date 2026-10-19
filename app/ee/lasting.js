// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// What keeps a certificate checkable once its authority's answers are gone (D434): JAdES B-LT's validation data
// (ETSI TS 119 182-1), after the witnesses' dates, in the unsigned header's etsiU: the chain's certificates in
// `xVals`, and whether each was revoked, asked of its authority as the certificate is sealed, in `rVals`: an OCSP
// answer (RFC 6960) from the responder its certificate names, else its CRL (RFC 5280). The witnesses' own
// certificates are asked about too, since B-LT keeps what checks the time-stamps as well: without it, EU DSS reads
// the certificate as B-T. An issuer a chain stops short of, as a token may carry its signer alone, comes from the
// CA Issuers address its certificate names, and goes in `xVals` too. Pure, given how to send, so it is tested
// under node --test.
import { tlv, seq, oid, octets, read, children, valueOf } from '../caps/receipt/der.js'
import { parts, responders, issuers, lists, base64, unbase64, certificatesIn, chainOf, usages, certifies, issuedBy } from './pkix.js'

/** @typedef {import('./pkix.js').Parts} Parts */
/** What the authorities said, and the issuers fetched to ask them. @typedef {{ ocsp: Uint8Array[], crl: Uint8Array[], certificates?: Uint8Array[] }} Revocation */
/** @typedef {(address: string, init: RequestInit) => Promise<Uint8Array | null>} Asked */

/** @param {Uint8Array} bytes */
const sha1 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-1', /** @type {BufferSource} */ (bytes)))

/**
 * An OCSP request for a certificate, which names it by its issuer's name and key hashed with SHA-1, as every
 * responder reads, and its serial, with a nonce (RFC 8954) so that the answer is made now. @param {Parts} cert
 * @param {Parts} issuer @param {Uint8Array} [nonce]
 */
export async function ocspRequest(cert, issuer, nonce = crypto.getRandomValues(new Uint8Array(16))) {
  const id = seq(seq(oid('1.3.14.3.2.26'), tlv(0x05)), octets(await sha1(cert.issuerName)), octets(await sha1(issuer.keyBits)), cert.serial)
  return seq(seq(seq(seq(id)), tlv(0xa2, seq(seq(oid('1.3.6.1.5.5.7.48.1.2'), octets(octets(nonce)))))))
}

/** Whether an OCSP answer is one a responder made: successful, with a basic response. @param {Uint8Array} der */
export function answered(der) {
  try {
    const [status, bytes] = children(read(der))
    return valueOf(status)[0] === 0 && bytes?.tag === 0xa0
  } catch {
    return false
  }
}

/**
 * The chains of the witnesses that dated a sealed certificate: each token's signer, the certificate its authority
 * reserves for time-stamping (RFC 3161 2.3), then the others the token carries, issuer by issuer.
 * @param {{ header?: { etsiU?: any[] } }} sealed @returns {Promise<Uint8Array[][]>}
 */
export async function witnessesOf(sealed) {
  const chains = []
  for (const one of sealed.header?.etsiU ?? []) {
    const token = one.sigTst?.tstTokens?.[0]?.val
    const given = token ? certificatesIn(unbase64(String(token))).map(parts) : []
    const signer = given.find((cert) => usages(cert).includes('1.3.6.1.5.5.7.3.8'))
    if (signer) chains.push((await chainOf(signer, given)).map((cert) => cert.der))
  }
  return chains
}

/**
 * A certificate's issuer from its CA Issuers addresses: the first certificate there that certifies others and
 * issued it. @param {Parts} cert @param {Asked} asked @returns {Promise<Parts | undefined>}
 */
async function issuerOf(cert, asked) {
  for (const address of issuers(cert).filter((one) => /^https?:/.test(one))) {
    const bytes = await asked(address, { method: 'GET' })
    for (const one of bytes ? readable(bytes) : []) if (certifies(one) && await issuedBy(cert, one)) return one
  }
}

/** The certificates some bytes hold, none when they aren't any. @param {Uint8Array} bytes @returns {Parts[]} */
function readable(bytes) {
  try {
    return certificatesIn(bytes).map(parts)
  } catch {
    return []
  }
}

/**
 * Asks whether each certificate of some chains but their roots was revoked: its OCSP responders first, then its
 * CRLs, once for a certificate two chains share. One none answers is left out, and the checks then say it wasn't
 * shown unrevoked. A request names the issuer's key, so where a chain stops short of a root, its issuer is
 * fetched (kept in `certificates`, for xVals) and asked about in turn; one that can't be is left out too.
 * @param {Uint8Array[][]} chains each leaf first @param {(address: string, init: RequestInit) => Promise<Response>} send @returns {Promise<Revocation>}
 */
export async function revocation(chains, send) {
  /** @type {Required<Revocation>} */
  const found = { ocsp: [], crl: [], certificates: [] }
  const done = new Set()
  // What the chains carry, or was fetched already.
  const known = new Set(chains.flat().map(base64))
  /** @type {Asked} */
  const asked = async (address, init) => {
    const answer = await send(address, init).catch(() => null)
    return answer?.ok ? new Uint8Array(await answer.arrayBuffer()) : null
  }
  for (const chain of chains.map((one) => one.map(parts))) {
    // Each certificate with its issuer, the next in its chain, else fetched and added to it, ten at most.
    for (let i = 0; i < chain.length && i < 10; i++) {
      const cert = chain[i]
      if (cert.selfIssued || done.has(base64(cert.der))) continue
      const issuer = chain[i + 1] ?? await issuerOf(cert, asked)
      if (!issuer) continue
      done.add(base64(cert.der))
      if (!chain[i + 1]) chain.push(issuer)
      if (!known.has(base64(issuer.der))) {
        known.add(base64(issuer.der))
        found.certificates.push(issuer.der)
      }
      let ocsp = null
      for (const address of responders(cert)) {
        const body = await ocspRequest(cert, issuer)
        if ((ocsp = await asked(address, { method: 'POST', headers: { 'content-type': 'application/ocsp-request' }, body: /** @type {BodyInit} */ (body) })) && answered(ocsp)) break
        ocsp = null
      }
      if (ocsp) found.ocsp.push(ocsp)
      else {
        for (const address of lists(cert).filter((one) => /^https?:/.test(one))) {
          const list = await asked(address, { method: 'GET' })
          if (list) {
            found.crl.push(list)
            break
          }
        }
      }
    }
  }
  return found
}

/**
 * A sealed certificate with its validation data after what it holds: the chain's certificates past its own and the
 * issuers fetched, and what its authorities said, where they said anything. @template {{ header?: { etsiU: object[] } }} T
 * @param {T} sealed @param {Uint8Array[]} chain leaf first @param {Revocation} found @returns {T}
 */
export function lasting(sealed, chain, { ocsp, crl, certificates = [] }) {
  const values = (/** @type {Uint8Array[]} */ all) => all.map((der) => ({ val: base64(der) }))
  const rVals = { ...(ocsp.length && { ocspVals: values(ocsp) }), ...(crl.length && { crlVals: values(crl) }) }
  const xVals = [...chain.slice(1), ...certificates].map((der) => ({ x509Cert: { val: base64(der) } }))
  const added = [...(xVals.length ? [{ xVals }] : []), ...(ocsp.length || crl.length ? [{ rVals }] : [])]
  return added.length ? { ...sealed, header: { ...sealed.header, etsiU: [...(sealed.header?.etsiU ?? []), ...added] } } : sealed
}
