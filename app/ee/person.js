// SPDX-FileCopyrightText: 2026 WAREHOUSE SAS
// SPDX-License-Identifier: Elastic-2.0

// Who the audit export names (D427). By default (`audit.person: "email"`), the account, as OpenTelemetry
// names it, with the device and the profile. As a pseudonym (`"pseudonym"`), the profile's id alone:
// random, made on the device, and in no file that leaves it, where the device's id is every record's
// author, in shares, backups and Sync. With `audit.trustee`, a public key whose private half whoever the
// organisation's agreement names holds, the account comes too, sealed for them as a compact JWE
// (RFC 7516, ECDH-ES and A256GCM, RFC 7518), which any JOSE tool opens and no one else can.
// Host-agnostic: Web Crypto, tested under node --test.

/** @typedef {{ kty: 'EC', crv: 'P-256', x: string, y: string, kid?: string }} Trustee */

/** @param {Uint8Array} bytes */
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** A length on 32 bits, then what it counts. @param {Uint8Array} bytes */
const counted = (bytes) => [0, 0, 0, bytes.length, ...bytes]

/** The trustee's public key, or a message for IT. @param {unknown} jwk @returns {Promise<CryptoKey>} */
async function trusteeKey(jwk) {
  const given = /** @type {Record<string, unknown>} */ (jwk)
  if (given && typeof given === 'object' && 'd' in given) throw new Error('policy.json’s audit.trustee holds its private key (d): give only its public half, and keep the private one where the agreement says')
  const { kty, crv, x, y } = /** @type {JsonWebKey} */ (given ?? {})
  return crypto.subtle.importKey('jwk', { kty, crv, x, y }, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
    .catch(() => { throw new Error(`policy.json’s audit.trustee is not a P-256 public key as a JWK: ${JSON.stringify(jwk)}`) })
}

/** Policy's `audit.person` and `audit.trustee`, as start() reads them; throws, saying why. @param {{ person?: unknown, trustee?: unknown }} audit */
export async function check({ person, trustee }) {
  if (person !== undefined && person !== 'email' && person !== 'pseudonym') throw new Error(`policy.json’s audit.person is "email" or "pseudonym": ${JSON.stringify(person)}`)
  if (trustee === undefined) return
  if (person !== 'pseudonym') throw new Error('policy.json’s audit.trustee goes with "person": "pseudonym"')
  await trusteeKey(trustee)
}

/**
 * `text` sealed for the trustee: a key agreed with an ephemeral one each time, through the Concat KDF
 * (RFC 7518, 4.6.2), encrypts it with AES-GCM, the protected header its additional data.
 * @param {Trustee} trustee @param {string} text @returns {Promise<string>} the compact JWE
 */
export async function seal(trustee, text) {
  const ephemeral = /** @type {CryptoKeyPair} */ (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']))
  const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', ephemeral.publicKey)
  const header = b64u(new TextEncoder().encode(JSON.stringify({ alg: 'ECDH-ES', enc: 'A256GCM', ...(trustee.kid && { kid: trustee.kid }), epk: { kty, crv, x, y } })))
  const z = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await trusteeKey(trustee) }, ephemeral.privateKey, 256))
  // One round: [0, 0, 0, 1], Z, then the algorithm, no parties, and the key's 256 bits.
  const cek = await crypto.subtle.digest('SHA-256', new Uint8Array([0, 0, 0, 1, ...z, ...counted(new TextEncoder().encode('A256GCM')), ...counted(new Uint8Array()), ...counted(new Uint8Array()), 0, 0, 1, 0]))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(header) }, key, new TextEncoder().encode(text)))
  return [header, '', b64u(iv), b64u(sealed.subarray(0, -16)), b64u(sealed.subarray(-16))].join('.')
}

/**
 * The resource's attributes that say who acted, as policy's `audit` asks.
 * @param {{ person?: string, trustee?: Trustee }} audit @param {{ account?: string | null, device: string, profile?: string }} who
 * @returns {Promise<Record<string, string | undefined>>}
 */
export async function person({ person, trustee }, { account, device, profile }) {
  const named = account ? { [account.includes('@') ? 'user.email' : 'user.name']: account } : {}
  if (person !== 'pseudonym') return { 'device.id': device, 'jean.profile.id': profile, ...named }
  return { 'jean.profile.id': profile, ...(trustee && account && { 'jean.user.sealed': await seal(trustee, JSON.stringify(named)) }) }
}
