// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// A tamper-evident audit stream (D675): each span sent carries its place in a chain, a hash of itself and of the one before,
// so that a span changed, removed or put in shows; `jean.audit.dropped` says how many were let go before they got a place. Each
// page load has a chain of its own, started from where the last ended. Every batch but one sent as the page leaves names its
// last hash, signed with a key the browser keeps and can't export. Hashes alone anyone could make again, so what vouches for a
// copy is the signature, and only under a key pinned when first seen: `node ee/verify.js <file> --keys <file>` checks one. The
// newest spans until a batch signs them, and the newest or oldest chains removed whole, can't be told from what was never sent. It proves
// what a device sent and that it hasn't changed since, not that the device told the truth: the gateway's log stays the
// authority. Host-agnostic, synchronous since a page leaving can't wait; tested under node --test.

/** @typedef {import('./otlp.js').Span} Span */

const K = Uint32Array.from(primes(64), (prime) => ((Math.cbrt(prime) % 1) * 2 ** 32) >>> 0)
const INITIAL = Uint32Array.from(primes(8), (prime) => ((Math.sqrt(prime) % 1) * 2 ** 32) >>> 0)

/** @param {number} count */
function primes(count) {
  /** @type {number[]} */
  const found = []
  for (let n = 2; found.length < count; n++) if (found.every((prime) => n % prime)) found.push(n)
  return found
}

/** SHA-256, as hexadecimal: Web Crypto's is asynchronous, and a page leaving can't wait for it. @param {string} text */
export function sha256(text) {
  const bytes = new TextEncoder().encode(text)
  const padded = new Uint8Array(((bytes.length + 9 + 63) & ~63))
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bytes.length / 2 ** 29))
  view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0)
  const hash = Uint32Array.from(INITIAL)
  const w = new Uint32Array(64)
  const rotate = (/** @type {number} */ x, /** @type {number} */ n) => (x >>> n) | (x << (32 - n))
  for (let at = 0; at < padded.length; at += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(at + i * 4)
    for (let i = 16; i < 64; i++) {
      const [a, b] = [w[i - 15], w[i - 2]]
      w[i] = (w[i - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) + w[i - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10))) | 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let i = 0; i < 64; i++) {
      const one = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0
      const two = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
      ;[h, g, f, e, d, c, b, a] = [g, f, e, (d + one) | 0, c, b, a, (one + two) | 0]
    }
    ;[a, b, c, d, e, f, g, h].forEach((value, i) => { hash[i] = (hash[i] + value) | 0 })
  }
  return [...hash].map((word) => (word >>> 0).toString(16).padStart(8, '0')).join('')
}

const HASH = 'jean.audit.hash'
export const FIRST = '0'.repeat(64)

/** An attribute's value as a string, however a collector writes it: a list by its items, which it may leave out when there are none. @param {any} value @returns {string} */
const plain = (value) => (value && typeof value === 'object' ? JSON.stringify((value.values ?? []).map((/** @type {any} */ one) => plain(Object.values(one)[0]))) : String(value))

/** A span as it is hashed: what a collector keeps of it, whatever order it puts its attributes in, without its own hash. @param {Span} span */
export const canonical = (span) => JSON.stringify([span.traceId, span.spanId, span.parentSpanId ?? '', span.name, Number(span.kind), String(span.startTimeUnixNano), String(span.endTimeUnixNano), Number(span.status?.code ?? 0), span.status?.message ?? '',
  span.attributes.filter(({ key }) => key !== HASH).map(({ key, value }) => [key, plain(Object.values(value)[0])]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))])

const random = () => [...crypto.getRandomValues(new Uint8Array(8))].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * A chain: `link` gives a span its place, once, as a copy that nothing changes later; `drop` counts one let go before it had one.
 * @param {{ store?: { getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }, key?: string, id?: string }} [options] where the last hash is kept between page loads
 */
export function chain({ store, key = 'app.audit.tip', id = random() } = {}) {
  let last = store?.getItem(key) ?? FIRST
  let seq = 0
  let dropped = 0
  return {
    id,
    get tip() { return last },
    drop() { dropped++ },
    /** @param {Span} span @returns {Span} */
    link(span) {
      if (span.attributes.some((one) => one.key === HASH)) return span
      const value = (/** @type {string} */ name, /** @type {any} */ given) => ({ key: name, value: Number.isInteger(given) ? { intValue: String(given) } : { stringValue: given } })
      const placed = { ...span, attributes: [...span.attributes, value('jean.audit.chain', id), value('jean.audit.seq', seq), value('jean.audit.prev', last), ...(dropped ? [value('jean.audit.dropped', dropped)] : [])] }
      seq++
      dropped = 0
      last = sha256(`${last}\n${canonical(placed)}`)
      store?.setItem(key, last)
      return { ...placed, attributes: [...placed.attributes, value(HASH, last)] }
    },
  }
}

/** @param {Span} span @param {string} name */
const attribute = (span, name) => Object.values(span.attributes.find(({ key }) => key === name)?.value ?? {})[0]

/**
 * What a collector's spans say of themselves: each chain's spans in order, each hash made again, every place filled.
 * @param {Span[]} spans
 * @returns {{ chains: number, spans: number, unlinked: number, dropped: number, problems: string[] }} problems: where it isn't whole
 */
export function verify(spans) {
  const linked = spans.filter((span) => attribute(span, HASH))
  /** @type {Map<string, Span[]>} */
  const chains = new Map()
  for (const span of linked) chains.set(String(attribute(span, 'jean.audit.chain')), [...chains.get(String(attribute(span, 'jean.audit.chain'))) ?? [], span])
  const problems = []
  let dropped = 0
  for (const [id, chained] of chains) {
    chained.sort((a, b) => Number(attribute(a, 'jean.audit.seq')) - Number(attribute(b, 'jean.audit.seq')))
    /** @type {Span | undefined} */
    let before
    for (const span of chained) {
      const [seq, prev, hash] = [Number(attribute(span, 'jean.audit.seq')), String(attribute(span, 'jean.audit.prev')), String(attribute(span, HASH))]
      // A batch sent again, after an answer lost on the way: the same span, nothing changed.
      if (before && attribute(before, HASH) === hash && sha256(`${prev}\n${canonical(span)}`) === hash) continue
      dropped += Number(attribute(span, 'jean.audit.dropped') ?? 0)
      const expected = before ? Number(attribute(before, 'jean.audit.seq')) + 1 : 0
      if (seq > expected) problems.push(`${id}: ${seq - expected} missing before ${seq}`)
      if (seq < expected) problems.push(`${id}: ${seq} twice`)
      else if (seq === expected && before && prev !== attribute(before, HASH)) problems.push(`${id}: ${seq} doesn't follow ${seq - 1}`)
      if (sha256(`${prev}\n${canonical(span)}`) !== hash) problems.push(`${id}: ${seq} was changed (${span.name})`)
      before = span
    }
  }
  return { chains: chains.size, spans: new Set(linked.map((span) => attribute(span, HASH))).size, unlinked: spans.length - linked.length, dropped, problems }
}

/** The signing key's half to publish, and what signs a chain's end: a P-256 key's, ES256, base64url. @param {CryptoKeyPair} keys */
export async function signer(keys) {
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey)
  const { kty, crv, x, y } = jwk
  return {
    key: JSON.stringify({ kty, crv, x, y }),
    /** @param {string} tip */
    sign: async (tip) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(tip))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  }
}

/** Whether a batch's signature holds: its chain's end, under the key it names. @param {{ tip: string, signature: string, key: string }} proof */
export async function signed({ tip, signature, key }) {
  const publicKey = await crypto.subtle.importKey('jwk', JSON.parse(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  const raw = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, raw, new TextEncoder().encode(tip))
}
