// A timestamp authority and a public log for the tests (D276), built as real ones answer: an RFC 3161
// authority that dates what it is asked to, with a key and a certificate of its own, and a log that
// takes a hashedrekord and promises it, as Sigstore's Rekor v1 does.
import { tlv, seq, int, oid, octets, read, children, raw, selfIssued, derSignature } from '../../app/caps/receipt/der.js'

const SHA256 = '2.16.840.1.101.3.4.2.1'
const TST_INFO = '1.2.840.113549.1.9.16.1.4'
const P256 = { name: 'ECDSA', namedCurve: 'P-256' }
const SIGNING = { name: 'ECDSA', hash: 'SHA-256' }
const encode = (/** @type {string} */ text) => new TextEncoder().encode(text)
const digest = async (/** @type {Uint8Array} */ bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
const set = (/** @type {Uint8Array[]} */ ...parts) => tlv(0x31, ...parts)

const authority = await crypto.subtle.generateKey(P256, false, ['sign', 'verify'])
/** The authority's certificate, which its tokens carry. */
export const authorityCertificate = await selfIssued(authority, 'Test TSA', new Date('2026-01-01T00:00:00Z'))

/** The answer to an RFC 3161 request: granted, a token on its imprint and nonce, at a time. @param {Uint8Array} request @param {Date} [now] */
export async function reply(request, now = new Date()) {
  const [, imprint, nonce] = children(read(request))
  const time = tlv(0x18, encode(now.toISOString().replace(/[-:T]|\.\d+/g, '')))
  const info = seq(int(Uint8Array.of(1)), oid('1.2.3.4.1'), raw(imprint), int(Uint8Array.of(7)), time, ...(nonce?.tag === 0x02 ? [raw(nonce)] : []))
  const attributes = [seq(oid('1.2.840.113549.1.9.3'), set(oid(TST_INFO))), seq(oid('1.2.840.113549.1.9.4'), set(octets(await digest(info))))]
  const signature = new Uint8Array(await crypto.subtle.sign(SIGNING, authority.privateKey, set(...attributes)))
  const signer = seq(int(Uint8Array.of(1)), seq(seq(), int(Uint8Array.of(1))), seq(oid(SHA256)), tlv(0xa0, ...attributes), seq(oid('1.2.840.10045.4.3.2')), octets(derSignature(signature)))
  const signed = seq(int(Uint8Array.of(3)), set(seq(oid(SHA256))), seq(oid(TST_INFO), tlv(0xa0, octets(info))), tlv(0xa0, authorityCertificate), set(signer))
  return seq(seq(int(Uint8Array.of(0))), seq(oid('1.2.840.113549.1.7.2'), tlv(0xa0, signed)))
}

const log = await crypto.subtle.generateKey(P256, true, ['sign', 'verify'])
/** The log's public key, as Rekor's /api/v1/log/publicKey gives it, and as Web Crypto takes it. */
export const logKey = log.publicKey
export const logPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(await crypto.subtle.exportKey('spki', log.publicKey)).toString('base64')}\n-----END PUBLIC KEY-----\n`
let index = 1000

/** Rekor v1's answer to a hashedrekord: the entry, its place, and the log's promise of it. @param {object} entry */
export async function logged(entry) {
  const body = Buffer.from(JSON.stringify(entry)).toString('base64')
  const logID = Buffer.from(await digest(new Uint8Array(await crypto.subtle.exportKey('spki', log.publicKey)))).toString('hex')
  const promise = { body, integratedTime: Math.floor(Date.now() / 1000), logID, logIndex: index++ }
  const signedEntryTimestamp = Buffer.from(derSignature(new Uint8Array(await crypto.subtle.sign(SIGNING, log.privateKey, encode(JSON.stringify(promise)))))).toString('base64')
  return { [crypto.randomUUID().replace(/-/g, '')]: { ...promise, verification: { inclusionProof: { checkpoint: 'test log - 1\n', hashes: [], logIndex: promise.logIndex, rootHash: '00'.repeat(32), treeSize: promise.logIndex + 1 }, signedEntryTimestamp } } }
}
