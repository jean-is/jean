// What the audit's trustee does with any JOSE tool (D427): open a compact JWE, ECDH-ES and A256GCM, with their
// private key. Written here with node:crypto, apart from Jean's Web Crypto, and checked against RFC 7518's example.
import assert from 'node:assert/strict'
import { createPrivateKey, createPublicKey, createDecipheriv, createHash, diffieHellman, generateKeyPairSync } from 'node:crypto'

/** @param {string} text */
const b64u = (text) => Buffer.from(text, 'base64url')
/** @param {Buffer} bytes its length on 32 bits, then itself */
const counted = (bytes) => Buffer.concat([Buffer.from([0, 0, 0, bytes.length]), bytes])

/** The Concat KDF's one round (RFC 7518, 4.6.2). @param {Buffer} z @param {string} enc @param {number} bits */
export const kdf = (z, enc, bits, apu = Buffer.alloc(0), apv = Buffer.alloc(0)) => {
  const supp = Buffer.alloc(4)
  supp.writeUInt32BE(bits)
  return createHash('sha256').update(Buffer.concat([Buffer.from([0, 0, 0, 1]), z, counted(Buffer.from(enc)), counted(apu), counted(apv), supp])).digest().subarray(0, bits / 8)
}

/** @param {import('node:crypto').JsonWebKey} privateJwk @param {import('node:crypto').JsonWebKey} publicJwk */
export const agree = (privateJwk, publicJwk) => diffieHellman({ privateKey: createPrivateKey({ key: privateJwk, format: 'jwk' }), publicKey: createPublicKey({ key: publicJwk, format: 'jwk' }) })

/** @param {string} jwe @param {import('node:crypto').JsonWebKey} privateJwk @returns {{ header: any, text: string }} */
export function open(jwe, privateJwk) {
  const [protectedHeader, key, iv, text, tag] = jwe.split('.')
  const header = JSON.parse(b64u(protectedHeader).toString())
  assert.deepEqual([header.alg, header.enc, key], ['ECDH-ES', 'A256GCM', ''])
  const decipher = createDecipheriv('aes-256-gcm', kdf(agree(privateJwk, header.epk), header.enc, 256), b64u(iv))
  decipher.setAAD(Buffer.from(protectedHeader))
  decipher.setAuthTag(b64u(tag))
  return { header, text: Buffer.concat([decipher.update(b64u(text)), decipher.final()]).toString() }
}

/** A trustee's key pair: the public half for policy, the private one theirs. */
export function trusteePair() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return { private: privateKey.export({ format: 'jwk' }), public: { ...publicKey.export({ format: 'jwk' }), kid: 'betriebsrat-2026' } }
}
