// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// The organisation's qualified seal (D436), created remotely by a qualified trust service provider through the Cloud
// Signature Consortium's API (v2), its key in the provider's certified device, which a browser's isn't:
// `credentials/info` gives the credential's certificate and its chain, and each seal is the SHA-256 Jean computes of
// what it signs, granted by `credentials/authorize` (its SAD) and signed by `signatures/signHash`. Only an ECDSA P-256
// key (ES256), which certificates are checked by. Pure, given how to send, so it is tested under node --test.
import { p1363 } from '../caps/receipt/der.js'
import { parts, chainOf, base64, unbase64 } from './pkix.js'

const SHA256 = '2.16.840.1.101.3.4.2.1'
const ECDSA_SHA256 = '1.2.840.10045.4.3.2'
const EC_KEY = '1.2.840.10045.2.1'

/** A credential: its certificate and chain, leaf first, its public key, and what signs with it (ES256, P1363). @typedef {{ chain: Uint8Array[], key: CryptoKey, sign: (data: Uint8Array) => Promise<Uint8Array> }} Credential */

/**
 * A credential at a provider's CSC API, read: throws, saying why for IT, where the provider refuses, the key is
 * disabled or its certificate not valid now, the key isn't P-256, or each signature needs what a person gives (a PIN,
 * an OTP, a sign-in at the provider), which a seal made unattended can't. Each signature is checked by the key before
 * it is given. @param {{ csc: string, credential: string, send: (address: string, init: RequestInit) => Promise<Response> }} at
 * @returns {Promise<Credential>}
 */
export async function credentialAt({ csc, credential, send }) {
  const base = csc.replace(/\/+$/, '')
  /** @param {string} method @param {object} body @returns {Promise<any>} */
  const call = async (method, body) => {
    const answer = await send(`${base}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credentialID: credential, ...body }) })
    if (!answer.ok) throw new Error(`${base}/${method}: HTTP ${answer.status} ${(await answer.json().catch(() => ({}))).error_description ?? ''}`.trim())
    return answer.json()
  }
  const info = await call('credentials/info', { certificates: 'chain', authInfo: true })
  const [leaf, ...given] = (info.cert?.certificates ?? []).map((/** @type {string} */ one) => parts(unbase64(one)))
  const said = `${base}’s credential ${credential}`
  if (!leaf || info.key?.status === 'disabled') throw new Error(`${said} is ${leaf ? 'disabled' : 'given without its certificate'}`)
  if ((info.cert.status ?? 'valid') !== 'valid' || leaf.until.getTime() < Date.now()) throw new Error(`${said}’s certificate is ${info.cert.status ?? 'expired'}`)
  if ((info.auth?.mode ?? 'implicit') !== 'implicit') throw new Error(`${said} asks for authorization “${info.auth.mode}”, which a person gives at each signature: a seal’s is given by the provider (implicit)`)
  const key = await crypto.subtle.importKey('spki', /** @type {BufferSource} */ (leaf.spki), { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']).catch(() => null)
  if (!key) throw new Error(`${said} isn’t an ECDSA P-256 key, which Jean seals certificates with (ES256): ask the provider for one`)
  // ECDSA with SHA-256, or the key's own algorithm where the provider names only that.
  const algorithms = info.key?.algo ?? []
  const signAlgo = algorithms.includes(EC_KEY) && !algorithms.includes(ECDSA_SHA256) ? EC_KEY : ECDSA_SHA256
  return {
    chain: (await chainOf(leaf, given)).map((one) => one.der),
    key,
    async sign(data) {
      const hashes = [base64(new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (data))))]
      const { SAD } = await call('credentials/authorize', { numSignatures: 1, hashes, hashAlgorithmOID: SHA256 })
      const { signatures: [signed = ''] = [] } = await call('signatures/signHash', { SAD, hashes, hashAlgorithmOID: SHA256, signAlgo })
      // r‖s as some providers give it, else the DER of X.509's ECDSA-Sig-Value.
      const bytes = unbase64(signed)
      const signature = bytes.length === 64 ? bytes : p1363(bytes, 32)
      if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, /** @type {BufferSource} */ (signature), /** @type {BufferSource} */ (data))) throw new Error(`${base}/signatures/signHash: the signature doesn’t hold by ${credential}’s key`)
      return signature
    },
  }
}
