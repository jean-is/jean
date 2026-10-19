// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// The key that unlocks ee/ (D139, D386): a JWS in compact form, ES256, that Warehouse SAS signs and
// policy holds as `key`, checked offline with Web Crypto, never by calling home. It names the
// origins Jean may be served from. A subscription's key unlocks every version of ee/ released
// before it ends, forever; a trial's stops on its date. On localhost no key is needed.

/** Warehouse SAS's public keys, by `kid`: a new one is added beside the old, so keys issued keep working. */
export const KEYS = /** @type {Record<string, JsonWebKey>} */ ({
  'warehouse-2026-10': { kty: 'EC', crv: 'P-256', x: 't5-U6Lrx1Qlw8dJVFZXch0Sm_8mHcE7RFr0P5nSiAFU', y: 'Qp85RopuChiuvjVHNQzJtDdkQBPUfu3-HMhiZw8n51A' },
})
/** When this version of ee/ was released: a subscription that ended before it doesn't unlock it. */
export const RELEASED = '2026-10-17'

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/

/** @param {string} part base64url @returns {Uint8Array<ArrayBuffer>} */
const bytes = (part) => Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))
/** @param {string} part @returns {any} */
const json = (part) => JSON.parse(new TextDecoder().decode(bytes(part)))

/**
 * Whom the key is for and until when; throws, saying why, when it doesn't unlock this version here.
 * @param {unknown} key policy's @param {{ origin: string, now?: number, keys?: Record<string, JsonWebKey>, released?: string }} at
 * @returns {Promise<{ organisation: string, until: number, trial: boolean }>} until: in milliseconds
 */
export async function checkKey(key, { origin, now = Date.now(), keys = KEYS, released = RELEASED }) {
  if (LOCAL.test(new URL(origin).hostname)) return { organisation: '', until: Infinity, trial: false }
  const parts = typeof key === 'string' ? key.split('.') : []
  if (parts.length !== 3) throw new Error('policy.json holds no key, or one that is not a key')
  const [header, claims] = parts.slice(0, 2).map(json)
  const jwk = header?.alg === 'ES256' && Object.hasOwn(keys, header.kid) ? keys[header.kid] : null
  if (!jwk) throw new Error('The key was not signed by Warehouse SAS')
  const verifier = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifier, bytes(parts[2]), signed))) throw new Error('The key was not signed by Warehouse SAS')
  if (![claims.aud].flat().includes(origin)) throw new Error(`The key is for ${[claims.aud].flat().join(', ')}, not ${origin}`)
  const until = Number(claims.exp) * 1000
  const trial = claims.trial === true
  if (!(until > (trial ? now : Date.parse(released)))) throw new Error(trial ? 'The trial key has ended' : `The subscription ended before this version, released on ${released}`)
  return { organisation: String(claims.sub ?? ''), until, trial }
}
