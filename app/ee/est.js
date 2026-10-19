// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// The organisation's authority certifies the key this device seals with (D434), through its EST service (RFC 7030,
// as RFC 8951 clarifies it): a PKCS#10 request (RFC 2986) for that key, signed by it, which never leaves the device,
// sent to `simpleenroll`, and the certificate the authority answers with, its chain from the answer or from
// `cacerts`. Pure, given how to send, so it is tested under node --test.
import { tlv, seq, int, oid, bits, octets, derSignature } from '../caps/receipt/der.js'
import { parts, certificatesIn, chainOf, base64, same } from './pkix.js'

const encoder = new TextEncoder()
/** @param {string} id @param {Uint8Array} value @param {boolean} [critical] */
const extension = (id, value, critical = false) => seq(oid(id), ...(critical ? [Uint8Array.of(1, 1, 255)] : []), octets(value))

/**
 * A PKCS#10 request for the seal's key, named by its thumbprint, as its own certificate is, and asking for what that
 * certificate says: signatures that commit to what they sign, on documents (RFC 9336). The authority's profile
 * decides what it grants, its subject first. @param {CryptoKeyPair} keys @param {string} thumbprint
 */
export async function request(keys, thumbprint) {
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey))
  const asked = seq(extension('2.5.29.15', bits(Uint8Array.of(0xc0), 6), true), extension('2.5.29.37', seq(oid('1.3.6.1.5.5.7.3.36'))))
  const subject = seq(tlv(0x31, seq(oid('2.5.4.3'), tlv(0x0c, encoder.encode(thumbprint)))))
  const info = seq(int(Uint8Array.of(0)), subject, spki, tlv(0xa0, seq(oid('1.2.840.113549.1.9.14'), tlv(0x31, asked))))
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, /** @type {BufferSource} */ (info)))
  return seq(info, seq(oid('1.2.840.10045.4.3.2')), bits(derSignature(signature)))
}

/**
 * Has an EST service certify the seal's key: its certificate, then its chain as far as the answer, or else the
 * service's CA certificates, give it, leaf first. Throws, saying why, when the service refuses, or certifies
 * another key. @param {{ est: string, keys: CryptoKeyPair, thumbprint: string, headers?: Record<string, string>,
 * send: (address: string, init: RequestInit) => Promise<Response> }} at @returns {Promise<Uint8Array[]>}
 */
export async function enroll({ est, keys, thumbprint, headers = {}, send }) {
  const base = est.replace(/\/+$/, '')
  // In lines of 64, as MIME's base64 is: libest, Cisco's reference service, refuses one line with no break at its end.
  const answer = await send(`${base}/simpleenroll`, { method: 'POST', headers: { ...headers, 'content-type': 'application/pkcs10' }, body: base64(await request(keys, thumbprint)).replace(/.{1,64}/g, '$&\n') })
  if (!answer.ok) throw new Error(`${base}/simpleenroll: HTTP ${answer.status}`)
  const given = certificatesIn(new Uint8Array(await answer.arrayBuffer())).map(parts)
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey))
  const leaf = given.find((one) => same(one.spki, spki))
  if (!leaf) throw new Error(`${base}/simpleenroll certified another key`)
  let others = given.filter((one) => one !== leaf)
  if (!others.length) {
    const authorities = await send(`${base}/cacerts`, { method: 'GET', headers })
    if (authorities.ok) others = certificatesIn(new Uint8Array(await authorities.arrayBuffer())).map(parts)
  }
  return (await chainOf(leaf, others)).map((one) => one.der)
}

/**
 * Policy's `seal`, read; throws, saying why: `est`, the EST service's address over HTTPS (HTTP on this computer), or
 * `csc`, the base address of a qualified provider's CSC API (v2), or of the organisation's proxy to it, with
 * `credential`, the credentialID of the organisation's seal there (D436); and `auth`, how either knows who asks:
 * `oidc`, the organisation's sign-in, which policy then names, or `tls`, what the browser holds for it, a client
 * certificate. @param {Record<string, any>} policy @returns {{ est?: string, csc?: string, credential?: string, auth?: 'oidc' | 'tls' }}
 */
export function checked({ seal, signIn }) {
  const given = seal?.csc ?? seal?.est
  const address = URL.canParse(given) ? new URL(given) : null
  if (!address || !(address.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(address.hostname))) throw new Error(seal?.csc === undefined ? 'policy.json’s seal.est is the address of the organisation’s EST service, over HTTPS, such as https://ca.corp.example/.well-known/est' : 'policy.json’s seal.csc is the base address of a qualified provider’s CSC API, or of the organisation’s proxy to it, over HTTPS, such as https://qtsp.example/csc/v2')
  if (seal.csc !== undefined && (seal.est !== undefined || typeof seal.credential !== 'string' || !seal.credential)) throw new Error('policy.json’s seal.csc goes with seal.credential, the credentialID of the organisation’s seal there, and without seal.est')
  if (seal.auth !== undefined && !['oidc', 'tls'].includes(seal.auth)) throw new Error('policy.json’s seal.auth is "oidc", the organisation’s sign-in, "tls", a client certificate the browser holds, or left out')
  if (seal.auth === 'oidc' && !signIn) throw new Error('policy.json’s seal.auth "oidc" needs signIn, the organisation’s sign-in')
  return seal
}
