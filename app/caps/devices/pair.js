// Pairing a person's devices (D45, D700), A the one that has the Jean, B the new one. A's link carries a secret `s` and
// A's fingerprint; a mailbox drawn from `s`, opened once, takes B's hello; A answers with a nonce, B reveals the nonce it
// had committed to, all three sealed under `s`; then both sides draw six digits from everything that crossed, which the
// person types on A. The commitment stops someone holding the link and the relay from trying keys until a code matches.
// After that, every message between the two travels in an envelope from one device's key to the other's. Pure, no DOM
// and no app state, so node --test covers it.
import { base64url, bytesOf, idOf, openValue, pack, random, sealValue, unpack } from '../share/seal.js'
import { fingerprintOf, openBox, sealBox } from '../../ui/seal.js'

/** A device's keys, as boxPair() gives them: the private half and the public one, both JWK. @typedef {{ key: JsonWebKey, public: JsonWebKey }} Pair */

const encoder = new TextEncoder()
const decoder = new TextDecoder()
/** @type {(message: string) => never} */
const refuse = (message) => { throw new Error(message) }
/** Whether a text is base64url this long, written the one way its bytes are. @param {unknown} text @param {number} length */
const exact = (text, length) => typeof text === 'string' && text.length === length && /^[\w-]+$/.test(text) && base64url(bytesOf(text)) === text
/** @param {Uint8Array} bytes */
const digestOf = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes)))
/** A nonce's commitment: its SHA-256, base64url. @param {string} nonce */
const commitOf = async (nonce) => base64url(await digestOf(bytesOf(nonce)))
/** A public P-256 key and nothing more of it, or a refusal: a private half is never taken. @param {any} key @returns {Promise<JsonWebKey>} */
async function publicOf(key) {
  if (key?.kty !== 'EC' || key.crv !== 'P-256' || !exact(key.x, 43) || !exact(key.y, 43) || 'd' in key) refuse('This isn’t a device’s public key.')
  const only = { kty: 'EC', crv: 'P-256', x: key.x, y: key.y }
  await fingerprintOf(only).catch(() => refuse('This isn’t a device’s public key.'))
  return only
}

// ─── The link and the pairing mailbox ────────────────────────────────────────

/** The link B opens: Jean's web address, then `s` and A's fingerprint after `#`, which browsers never send. @param {string} address @param {Uint8Array} s @param {string} fpA */
export const linkOf = (address, s, fpA) => `${address}#/pair/${base64url(s)}.${fpA}`

/** The secret and A's fingerprint from a link's hash, or a whole link as pasted; null for anything else. @param {string} hash @returns {{ s: Uint8Array, fpA: string } | null} */
export function parseLink(hash) {
  const [, s, fpA] = /^[^#\s]*#\/pair\/([\w-]{43})\.([\w-]{22})$/.exec(hash.trim()) ?? []
  return exact(s, 43) && exact(fpA, 22) ? { s: bytesOf(s), fpA } : null
}

/** The one-time mailbox B says hello in, drawn from `s` alone: its token, HKDF-SHA-256(s, "pair"), and the relay's id for it. @param {Uint8Array} s */
export async function pairingBox(s) {
  const base = await crypto.subtle.importKey('raw', /** @type {BufferSource} */ (s), 'HKDF', false, ['deriveBits'])
  const token = base64url(new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: encoder.encode('pair') }, base, 256)))
  return { token, id: await idOf(token) }
}

// ─── The three messages, sealed under s ──────────────────────────────────────

/** A value sealed under `s`, with a fresh salt, as the relay carries it. @param {Uint8Array} s @param {object} value */
const sealed = async (s, value) => encoder.encode(JSON.stringify({ pair: base64url((await sealValue(value, { salt: random(16), secret: s })).sealed) }))

/** What a message sealed under `s` holds, when it is of this kind; refused otherwise. @param {Uint8Array} s @param {Uint8Array} bytes @param {string} kind @returns {Promise<any>} */
async function opened(s, bytes, kind) {
  let value
  try { value = await openValue(bytesOf(JSON.parse(decoder.decode(bytes)).pair), s) } catch { refuse('This pairing message doesn’t open.') }
  return value?.kind === kind ? value : refuse(`This isn’t a pairing ${kind}.`)
}

/**
 * B's hello, for the pairing mailbox: its public key, its mailbox's id, its name, and the commitment to a nonce it keeps.
 * @param {Uint8Array} s @param {{ key: JsonWebKey, mailbox: string, name: string }} hello
 */
export async function sealHello(s, { key, mailbox, name }) {
  const nB = base64url(random(32))
  return { bytes: await sealed(s, { kind: 'hello', key, mailbox, name, commit: await commitOf(nB) }), nB }
}

/** A hello as A reads it. @param {Uint8Array} s @param {Uint8Array} bytes @returns {Promise<{ key: JsonWebKey, mailbox: string, name: string, commit: string }>} */
export async function openHello(s, bytes) {
  const { key, mailbox, name, commit } = await opened(s, bytes, 'hello')
  if (!exact(mailbox, 22) || typeof name !== 'string' || name.length > 100 || !exact(commit, 43)) refuse('This hello isn’t whole.')
  return { key: await publicOf(key), mailbox, name, commit }
}

/** A's nonce, for B's mailbox, with A's public key and its mailbox's id. @param {Uint8Array} s @param {{ key: JsonWebKey, mailbox: string }} nonce */
export async function sealNonce(s, { key, mailbox }) {
  const nA = base64url(random(32))
  return { bytes: await sealed(s, { kind: 'nonce', key, mailbox, nA }), nA }
}

/** A's nonce as B reads it, refused unless its key is the one the link named. @param {Uint8Array} s @param {string} fpA @param {Uint8Array} bytes @returns {Promise<{ key: JsonWebKey, mailbox: string, nA: string }>} */
export async function openNonce(s, fpA, bytes) {
  const { key, mailbox, nA } = await opened(s, bytes, 'nonce')
  if (!exact(mailbox, 22) || !exact(nA, 43)) refuse('This nonce isn’t whole.')
  const only = await publicOf(key)
  if (await fingerprintOf(only) !== fpA) refuse('This nonce comes from another key than the link’s.')
  return { key: only, mailbox, nA }
}

/** B's nonce revealed, for A's mailbox. @param {Uint8Array} s @param {string} nB */
export const sealReveal = (s, nB) => sealed(s, { kind: 'reveal', nB })

/** B's nonce as A reads it, refused unless it is the one B's hello committed to. @param {Uint8Array} s @param {string} commit @param {Uint8Array} bytes */
export async function openReveal(s, commit, bytes) {
  const { nB } = await opened(s, bytes, 'reveal')
  return exact(nB, 43) && await commitOf(nB) === commit ? /** @type {string} */ (nB) : refuse('This nonce isn’t the one committed to.')
}

// ─── The code ────────────────────────────────────────────────────────────────

/**
 * The six digits both sides draw from what crossed: the first 32 bits of SHA-256 over it, mod a million, in Latin digits.
 * @param {{ s: Uint8Array, fpA: string, keyB: JsonWebKey, mailboxB: string, nA: string, nB: string }} pairing
 */
export async function codeOf({ s, fpA, keyB, mailboxB, nA, nB }) {
  const digest = await digestOf(encoder.encode(['pair', base64url(s), fpA, await fingerprintOf(keyB), mailboxB, nA, nB].join('|')))
  return String(new DataView(digest.buffer).getUint32(0) % 1_000_000).padStart(6, '0')
}

/** A digit's value in whichever script it is written: Unicode's decimal digits come in runs from 0 to 9. @param {string} char */
function digitOf(char) {
  const at = char.codePointAt(0) ?? 0
  let start = at
  while (start > 0 && /\p{Nd}/u.test(String.fromCodePoint(start - 1))) start--
  return (at - start) % 10
}

/** Whether what the person typed is the code, in any script's digits, spaces and dashes aside, compared without stopping early. @param {string} typed @param {string} code */
export function sameCode(typed, code) {
  const digits = [...typed.replace(/[\s-]/g, '')]
  if (digits.length !== code.length || !digits.every((char) => /\p{Nd}/u.test(char))) return false
  return digits.reduce((differ, char, i) => differ | (digitOf(char) ^ (code.charCodeAt(i) - 48)), 0) === 0
}

// ─── Envelopes, once paired ──────────────────────────────────────────────────

/** A value from this device to another it knows, as the relay carries it: who sends, then the box. @param {Pair} mine @param {JsonWebKey} theirs @param {unknown} value */
export async function envelope(mine, theirs, value) {
  return encoder.encode(JSON.stringify({ from: await fingerprintOf(mine.public), box: base64url(await sealBox(mine.key, theirs, await pack(value))) }))
}

/**
 * What another device sent this one, and its key; refused when the sender isn't among the keys this device knows, or the
 * box doesn't open for this device from that key. @param {Pair} mine @param {JsonWebKey[]} known @param {Uint8Array} bytes
 * @returns {Promise<{ from: JsonWebKey, value: any }>}
 */
export async function openEnvelope(mine, known, bytes) {
  /** @type {{ from?: unknown, box?: unknown }} */
  let sent = {}
  try { sent = JSON.parse(decoder.decode(bytes)) } catch {}
  const fingerprints = await Promise.all(known.map(fingerprintOf))
  const from = typeof sent?.from === 'string' ? known[fingerprints.indexOf(sent.from)] : undefined
  if (!from || typeof sent.box !== 'string') refuse('This message isn’t from a device this one knows.')
  try { return { from, value: await unpack(await openBox(mine.key, from, bytesOf(sent.box))) } } catch { refuse('This message doesn’t open.') }
}
