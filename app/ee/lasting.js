// SPDX-FileCopyrightText: 2026 WAREHOUSE SAS
// SPDX-License-Identifier: Elastic-2.0

// What keeps a certificate checkable once its authority's answers are gone (D434): JAdES B-LT's validation data
// (ETSI TS 119 182-1), after the witnesses' dates, in the unsigned header's etsiU: the chain's certificates in
// `xVals`, and whether each was revoked, asked of its authority as the certificate is sealed, in `rVals`: an OCSP
// answer (RFC 6960) from the responder its certificate names, else its CRL (RFC 5280). Pure, given how to send,
// so it is tested under node --test.
import { tlv, seq, oid, octets, read, children, valueOf } from '../caps/receipt/der.js'
import { parts, responders, lists, base64 } from './pkix.js'

/** @typedef {import('./pkix.js').Parts} Parts */
/** @typedef {{ ocsp: Uint8Array[], crl: Uint8Array[] }} Revocation */

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
 * Asks whether each certificate of a chain but its root was revoked: its OCSP responders first, then its CRLs.
 * One none answers is left out, and the checks then say it wasn't shown unrevoked.
 * @param {Uint8Array[]} chain leaf first @param {(address: string, init: RequestInit) => Promise<Response>} send @returns {Promise<Revocation>}
 */
export async function revocation(chain, send) {
  /** @type {Revocation} */
  const found = { ocsp: [], crl: [] }
  const all = chain.map(parts)
  for (const [i, cert] of all.entries()) {
    const issuer = all[i + 1]
    if (cert.selfIssued || !issuer) continue
    const asked = async (/** @type {string} */ address, /** @type {RequestInit} */ init) => {
      const answer = await send(address, init).catch(() => null)
      return answer?.ok ? new Uint8Array(await answer.arrayBuffer()) : null
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
  return found
}

/**
 * A sealed certificate with its validation data after what it holds: the chain's certificates past its own, and
 * what its authorities said, where they said anything. @template {{ header?: { etsiU: object[] } }} T @param {T} sealed
 * @param {Uint8Array[]} chain leaf first @param {Revocation} found @returns {T}
 */
export function lasting(sealed, chain, { ocsp, crl }) {
  const values = (/** @type {Uint8Array[]} */ all) => all.map((der) => ({ val: base64(der) }))
  const rVals = { ...(ocsp.length && { ocspVals: values(ocsp) }), ...(crl.length && { crlVals: values(crl) }) }
  const added = [...(chain.length > 1 ? [{ xVals: chain.slice(1).map((der) => ({ x509Cert: { val: base64(der) } })) }] : []), ...(ocsp.length || crl.length ? [{ rVals }] : [])]
  return added.length ? { ...sealed, header: { ...sealed.header, etsiU: [...(sealed.header?.etsiU ?? []), ...added] } } : sealed
}
