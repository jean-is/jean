// What a child's profile tells its parent's (D228): that a concern came up, its kind and when, and the
// time it spends, sealed for the parent's profile alone, in family/<its ULID>/, outside every profile,
// since neither holds the other's vault key: ECDH P-256 with a key the child's makes for each, then
// AES-256-GCM. The parent's keeps the private half in its secrets, each child's the public in its vault.json.
import { encode, decode } from '../../ui/seal.js'

const EC = { name: 'ECDH', namedCurve: 'P-256' }
const AES = { name: 'AES-GCM', length: 256 }
const subtle = crypto.subtle

/** Where a parent's profile hears from its children's. @param {string} profile its folder */
export const inbox = (profile) => `family/${profile.slice(9, 35)}`

/** A parent's profile's pair: what it opens with, and what its children's seal for it with. */
export async function pair() {
  const made = await subtle.generateKey(EC, true, ['deriveKey'])
  return { key: await subtle.exportKey('jwk', made.privateKey), public: await subtle.exportKey('jwk', made.publicKey) }
}

/** A value only the parent's profile opens. @param {JsonWebKey} to its public key @param {unknown} value */
export async function sealFor(to, value) {
  const own = await subtle.generateKey(EC, true, ['deriveKey'])
  const key = await subtle.deriveKey({ name: 'ECDH', public: await subtle.importKey('jwk', to, EC, false, []) }, own.privateKey, AES, false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value))))
  return JSON.stringify({ format: 1, from: await subtle.exportKey('jwk', own.publicKey), iv: encode(iv), data: encode(data) })
}

/** What a child's profile sealed for this one; throws for any other. @param {JsonWebKey} mine its private key @param {string} text */
export async function openFrom(mine, text) {
  const { from, iv, data } = JSON.parse(text)
  const key = await subtle.deriveKey({ name: 'ECDH', public: await subtle.importKey('jwk', from, EC, false, []) }, await subtle.importKey('jwk', mine, EC, false, ['deriveKey']), AES, false, ['decrypt'])
  return JSON.parse(new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) }, key, decode(data))))
}
