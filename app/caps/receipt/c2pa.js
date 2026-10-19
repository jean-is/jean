// Content Credentials (C2PA 2.2, D324): the signed metadata the AI Act asks of what Jean makes
// (Art. 50(2)), beside the XMP of D279. A picture made on this device or by a server on this computer
// carries a manifest that says a trained model made it, which one at which revision, and the hash
// of every byte around it, signed by the device's seal (D274) and dated by the witness the user chose
// (D276). Any picture or film's manifest is read back and checked, a provider's too, and where a file
// has none, what it says of itself, as the files Jean makes do (D410). CBOR (RFC 8949),
// JUMBF (ISO 19566-5) and COSE (RFC 9052) as C2PA needs them, with Web Crypto: no DOM, so it is
// tested with node --test.
import { crc32, readZip } from '../../core/zip.js'
import { concat, readCertificate, keyOf, readToken } from './der.js'

/** @import { Seal } from './certificate.js' */

const encoder = new TextEncoder()
/** IPTC's Digital Source Type for what a trained model made, as C2PA's actions name it. */
const GENERATED = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'
const HASHES = /** @type {Record<string, string>} */ ({ sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' })
/** COSE's algorithms (RFC 9053): the hash, and for RSA-PSS its salt's length. */
const ALGORITHMS = /** @type {Record<string, [string, number?]>} */ ({ '-7': ['SHA-256'], '-35': ['SHA-384'], '-36': ['SHA-512'], '-37': ['SHA-256', 32], '-38': ['SHA-384', 48], '-39': ['SHA-512', 64] })
/** @param {Uint8Array} bytes */
const digest = async (bytes, hash = 'SHA-256') => new Uint8Array(await crypto.subtle.digest(hash, /** @type {BufferSource} */ (bytes)))
/** @param {Uint8Array} a @param {Uint8Array} b */
const same = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i])
/** @param {Uint8Array} bytes */
const ascii = (bytes) => String.fromCharCode(...bytes)

// ─── CBOR ────────────────────────────────────────────────────────────────────

/** A CBOR tag on a value: COSE_Sign1's 18. */
export class Tagged {
  /** @param {number} tag @param {unknown} value */
  constructor(tag, value) { this.tag = tag; this.value = value }
}
/** A head: its major type and its length or value, in as few bytes as it fits. @param {number} major @param {number} n */
const head = (major, n) => {
  const type = major << 5
  if (n < 24) return Uint8Array.of(type | n)
  if (n < 256) return Uint8Array.of(type | 24, n)
  if (n < 65536) return Uint8Array.of(type | 25, n >> 8, n & 255)
  return Uint8Array.of(type | 26, n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255)
}
/** A value as CBOR: integers, text, bytes, arrays, maps (a Map for numbered keys), null, booleans and tags. @param {unknown} value @returns {Uint8Array} */
export function cbor(value) {
  if (value == null) return Uint8Array.of(0xf6)
  if (typeof value === 'boolean') return Uint8Array.of(value ? 0xf5 : 0xf4)
  if (typeof value === 'number') return value < 0 ? head(1, -1 - value) : head(0, value)
  if (typeof value === 'string') return concat(head(3, encoder.encode(value).length), encoder.encode(value))
  if (value instanceof Uint8Array) return concat(head(2, value.length), value)
  if (Array.isArray(value)) return concat(head(4, value.length), ...value.map(cbor))
  if (value instanceof Tagged) return concat(head(6, value.tag), cbor(value.value))
  const entries = value instanceof Map ? [...value] : Object.entries(/** @type {object} */ (value))
  return concat(head(5, entries.length), ...entries.flatMap(([key, one]) => [cbor(key), cbor(one)]))
}
/** IEEE 754's half precision. @param {number} h */
const half = (h) => (h >> 15 ? -1 : 1) * (((h >> 10) & 31) === 31 ? (h & 1023 ? NaN : Infinity) : ((h >> 10) & 31) ? 2 ** (((h >> 10) & 31) - 15) * (1 + (h & 1023) / 1024) : 2 ** -14 * ((h & 1023) / 1024))
/** The item at an offset and where it ends; maps as objects (numbered keys as text), tags dropped. @param {Uint8Array} bytes @param {number} at @returns {[any, number]} */
function item(bytes, at) {
  const major = bytes[at] >> 5
  const minor = bytes[at] & 31
  let next = at + 1
  let n = minor
  if (minor > 27 || at >= bytes.length) throw new Error('format')
  if (minor >= 24) {
    const size = 1 << (minor - 24)
    const view = new DataView(bytes.buffer, bytes.byteOffset + next, size)
    next += size
    if (major === 7 && size > 1) return [size === 2 ? half(view.getUint16(0)) : size === 4 ? view.getFloat32(0) : view.getFloat64(0), next]
    n = size === 8 ? Number(view.getBigUint64(0)) : size === 4 ? view.getUint32(0) : size === 2 ? view.getUint16(0) : view.getUint8(0)
  }
  if (major === 0) return [n, next]
  if (major === 1) return [-1 - n, next]
  if (major === 2 || major === 3) {
    if (next + n > bytes.length) throw new Error('format')
    const data = bytes.subarray(next, next + n)
    return [major === 2 ? data : new TextDecoder().decode(data), next + n]
  }
  if (major === 6) return item(bytes, next)
  if (major === 7) return [[false, true, null, undefined][n - 20], next]
  const all = /** @type {any} */ (major === 4 ? [] : {})
  for (let i = 0; i < n; i++) {
    const [key, end] = item(bytes, next)
    if (Array.isArray(all)) all.push(key), (next = end)
    else [all[key], next] = item(bytes, end)
  }
  return [all, next]
}
/** A CBOR item. @param {Uint8Array} bytes */
export const uncbor = (bytes) => item(bytes, 0)[0]

// ─── JUMBF ───────────────────────────────────────────────────────────────────

/** @param {number} n */
const u32 = (n) => Uint8Array.of(n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255)
/** A box: its length, its type and what it holds. @param {string} type @param {...Uint8Array} parts */
const box = (type, ...parts) => concat(u32(8 + parts.reduce((sum, part) => sum + part.length, 0)), encoder.encode(type), ...parts)
/** C2PA's box types are UUIDs: four letters, then ISO's fixed tail. */
const TAIL = Uint8Array.of(0x00, 0x11, 0x00, 0x10, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71)
/** A superbox of a type, requestable by its label. @param {string} type @param {string} label @param {...Uint8Array} content */
const superbox = (type, label, ...content) => box('jumb', box('jumd', encoder.encode(type), TAIL, Uint8Array.of(3), encoder.encode(`${label}\0`)), ...content)

/** The boxes between two offsets. @param {Uint8Array} bytes @returns {{ type: string, start: number, end: number }[]} */
function boxesIn(bytes, start = 0, end = bytes.length) {
  const all = []
  for (let at = start; at + 8 <= end;) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + at)
    let [length, body] = [view.getUint32(0), at + 8]
    if (length === 1) [length, body] = [Number(view.getBigUint64(8)), at + 16]
    else if (length === 0) length = end - at
    if (length < body - at || at + length > end) throw new Error('format')
    all.push({ type: ascii(bytes.subarray(at + 4, at + 8)), start: body, end: at + length })
    at += length
  }
  return all
}
/**
 * A superbox: its type, its label, the superboxes it holds, its CBOR, and the bytes a hashed URI covers.
 * @typedef {{ type: string, label: string, boxes: Superbox[], cbor?: Uint8Array, raw: Uint8Array }} Superbox
 * @param {Uint8Array} bytes @param {{ start: number, end: number }} at @returns {Superbox}
 */
function superboxOf(bytes, { start, end }) {
  const [description, ...content] = boxesIn(bytes, start, end)
  if (description?.type !== 'jumd') throw new Error('format')
  const label = bytes[description.start + 16] & 2 ? new TextDecoder().decode(bytes.subarray(description.start + 17, bytes.indexOf(0, description.start + 17))) : ''
  const data = content.find(({ type }) => type === 'cbor')
  return { type: ascii(bytes.subarray(description.start, description.start + 4)), label, boxes: content.filter(({ type }) => type === 'jumb').map((one) => superboxOf(bytes, one)),
    cbor: data && bytes.subarray(data.start, data.end), raw: bytes.subarray(start, end) }
}

// ─── Signing ─────────────────────────────────────────────────────────────────

/** What COSE signs, its payload detached: the claim. @param {Uint8Array} header @param {Uint8Array} payload */
const toBeSigned = (header, payload) => cbor(['Signature1', header, new Uint8Array(), payload])
/** What a witness dates in C2PA's v2 timestamps: the countersignature structure over the signature. @param {Uint8Array} header @param {Uint8Array} signature */
const toBeDated = (header, signature) => cbor(['CounterSignature', header, new Uint8Array(), cbor(signature)])
/** Room kept for a witness's token in the signature's unprotected header, which the signature doesn't cover. */
const ROOM = 8192

/**
 * A PNG with Content Credentials in a caBX chunk after its header: a manifest whose assertions say a
 * trained model made it (`c2pa.created`), and the SHA-256 of its bytes but that chunk's (`c2pa.hash.data`),
 * with any others given (a watermark's soft binding); its claim signed by the seal (ES256, its certificate in
 * x5chain); dated, when `date` is given, by the token it gets for the signature (sigTst2), else left undated.
 * Anything not a PNG as it is.
 * @param {Uint8Array} png @param {{ maker: string, revision?: string, generator: { name: string, version?: string }, seal: Seal, assertions?: [string, object][], date?: (imprint: Uint8Array) => Promise<Uint8Array> }} made
 */
export async function credentialed(png, { maker, revision, generator, seal, assertions: more = [], date }) {
  if (ascii(png.subarray(1, 4)) !== 'PNG' || ascii(png.subarray(12, 16)) !== 'IHDR') return png
  const [at, label, instance, hash] = [33, `urn:c2pa:${crypto.randomUUID()}`, `xmp:iid:${crypto.randomUUID()}`, await digest(png)]
  const header = cbor(new Map(/** @type {[number, unknown][]} */ ([[1, -7], [33, [seal.certificate, ...seal.chain ?? []]]])))
  const actions = { actions: [{ action: 'c2pa.created', digitalSourceType: GENERATED, softwareAgent: { name: maker, ...(revision && { version: revision }) } }] }
  /** @type {Record<string, unknown>} */
  let unprotected = date ? { pad: new Uint8Array(ROOM) } : {}
  let [length, store, signature, claim] = /** @type {[number, Uint8Array, Uint8Array, Uint8Array]} */ ([0, new Uint8Array(), new Uint8Array(), new Uint8Array()])
  /** @type {Uint8Array[]} */
  let boxes = []
  const sealed = () => superbox('c2pa', 'c2pa', superbox('c2ma', label, superbox('c2as', 'c2pa.assertions', ...boxes), superbox('c2cl', 'c2pa.claim.v2', box('cbor', claim)),
    superbox('c2cs', 'c2pa.signature', box('cbor', cbor(new Tagged(18, [header, unprotected, null, signature]))))))
  // The chunk's length is in the hash's assertion, so it is made again until that length is its own.
  while (store.length + 12 !== length) {
    length = store.length + 12
    const all = /** @type {[string, object][]} */ ([['c2pa.actions.v2', actions], ...more, ['c2pa.hash.data', { exclusions: [{ start: at, length }], name: 'jumbf manifest', alg: 'sha256', hash, pad: new Uint8Array() }]])
    boxes = all.map(([name, value]) => superbox('cbor', name, box('cbor', cbor(value))))
    const created = await Promise.all(all.map(async ([name], i) => ({ url: `self#jumbf=c2pa.assertions/${name}`, hash: await digest(boxes[i].subarray(8)) })))
    claim = cbor({ instanceID: instance, claim_generator_info: generator, signature: `self#jumbf=/c2pa/${label}/c2pa.signature`, created_assertions: created, alg: 'sha256' })
    signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, seal.keys.privateKey, /** @type {BufferSource} */ (toBeSigned(header, claim))))
    store = sealed()
  }
  const token = date && await date(await digest(toBeDated(header, signature))).catch(() => null)
  if (token && token.length < ROOM - 1024) {
    // The token takes the room the padding kept, so nothing the hash covers moves.
    const size = cbor(unprotected).length
    let pad = ROOM - token.length - 64
    while (cbor({ sigTst2: { tstTokens: [{ val: token }] }, pad: new Uint8Array(pad) }).length < size) pad++
    unprotected = { sigTst2: { tstTokens: [{ val: token }] }, pad: new Uint8Array(pad) }
    store = sealed()
  }
  const type = encoder.encode('caBX')
  return concat(png.subarray(0, at), u32(store.length), type, store, u32(crc32(concat(type, store))), png.subarray(at))
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/**
 * Where a file keeps its manifest store: a PNG's caBX chunk, a JPEG's APP11 segments, a WebP's C2PA
 * chunk, or an MP4 or MOV's C2PA box; null when it has none. @param {Uint8Array} bytes
 */
export function storeIn(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const at = (/** @type {number} */ start, length = 4) => ascii(bytes.subarray(start, start + length))
  if (at(1, 3) === 'PNG') {
    for (let i = 8; i + 12 <= bytes.length; i += 12 + view.getUint32(i)) if (at(i + 4) === 'caBX') return bytes.subarray(i + 8, i + 8 + view.getUint32(i))
  } else if (view.getUint16(0) === 0xffd8) {
    // Each segment repeats the box's length and type, which the first one keeps.
    const parts = []
    for (let i = 2; i + 4 <= bytes.length && bytes[i] === 0xff && bytes[i + 1] !== 0xda; i += 2 + view.getUint16(i + 2)) {
      if (bytes[i + 1] === 0xeb && at(i + 4, 2) === 'JP') parts.push(bytes.subarray(i + 12 + (parts.length ? 8 : 0), i + 2 + view.getUint16(i + 2)))
    }
    if (parts.length) return concat(...parts)
  } else if (at(0) === 'RIFF' && at(8) === 'WEBP') {
    for (let i = 12; i + 8 <= bytes.length; i += 8 + ((view.getUint32(i + 4, true) + 1) & ~1)) if (at(i) === 'C2PA') return bytes.subarray(i + 8, i + 8 + view.getUint32(i + 4, true))
  } else if (at(4) === 'ftyp') {
    const C2PA = 'd8fec3d61b0e483c92975828877ec481'
    const found = boxesIn(bytes).find(({ type, start }) => type === 'uuid' && Array.from(bytes.subarray(start, start + 16), (byte) => byte.toString(16).padStart(2, '0')).join('') === C2PA)
    // After the UUID: its version and flags, its purpose, the offset of its Merkle data, then the store.
    if (found) return bytes.subarray(bytes.indexOf(0, found.start + 20) + 9, found.end)
  }
  return null
}

/**
 * A file's Content Credentials, checked: null when it has none. Intact when the active manifest's
 * signature holds by the certificate it carries, its assertions are the ones its claim names, and,
 * where it binds them with a data hash, the file is the one it signed (`bound`; undefined for a film's
 * box hashes, which this doesn't check). With who signed it and who certified them, when a witness
 * dated the signature, and what it says made the file: a trained model, and which.
 * @param {Uint8Array} bytes
 */
export async function credentialsOf(bytes) {
  const found = storeIn(bytes)
  if (!found) return null
  try {
    const active = superboxOf(found, boxesIn(found)[0]).boxes.at(-1)
    const part = (/** @type {string} */ type) => active?.boxes.find((one) => one.type === type)
    const assertions = part('c2as')?.boxes ?? []
    const claimed = part('c2cl')?.cbor ?? new Uint8Array()
    const claim = uncbor(claimed)
    const [header, unprotected = {}, , signature] = uncbor(part('c2cs')?.cbor ?? new Uint8Array())
    const named = uncbor(header)
    const chain = named[33] ?? unprotected[33]
    const certificate = Array.isArray(chain) ? chain[0] : chain
    const { spki, subject, issuer, selfIssued, from, until } = readCertificate(certificate)
    const [hash, salt] = ALGORITHMS[named[1]] ?? []
    const key = hash && await keyOf(spki, hash, 'RSA-PSS')
    const signed = Boolean(key) && await crypto.subtle.verify(salt ? { name: 'RSA-PSS', saltLength: salt } : { name: 'ECDSA', hash }, /** @type {CryptoKey} */ (key), signature, /** @type {BufferSource} */ (toBeSigned(header, claimed)))
    const algorithm = HASHES[claim.alg ?? 'sha256']
    const listed = await Promise.all((claim.created_assertions ?? claim.assertions ?? []).map(async (/** @type {{ url: string, hash: Uint8Array }} */ { url, hash }) => {
      const one = assertions.find(({ label }) => label === url.split('/').at(-1))
      return Boolean(one && same(await digest(one.raw, algorithm), hash))
    }))
    /** @param {string} name */
    const value = (name) => { const one = assertions.find(({ label }) => label.replace(/__\d+$/, '') === name); return one?.cbor && uncbor(one.cbor) }
    const data = value('c2pa.hash.data')
    let bound
    if (data) {
      const kept = [...(data.exclusions ?? [])].sort((a, b) => a.start - b.start).reduce((/** @type {{ at: number, parts: Uint8Array[] }} */ { at, parts }, { start, length }) => ({ at: start + length, parts: [...parts, bytes.subarray(at, start)] }), { at: 0, parts: [] })
      bound = same(await digest(concat(...kept.parts, bytes.subarray(kept.at)), HASHES[data.alg ?? claim.alg ?? 'sha256']), data.hash)
    }
    const token = unprotected.sigTst2?.tstTokens?.[0]?.val
    const dated = token && await readToken(token).catch(() => null)
    const datedOn = dated?.intact && same(dated.imprint, await digest(toBeDated(header, signature))) ? dated : null
    const at = datedOn?.at ?? null
    const made = (value('c2pa.actions.v2') ?? value('c2pa.actions'))?.actions?.find((/** @type {any} */ one) => one.action === 'c2pa.created')
    const generator = [claim.claim_generator_info].flat()[0]?.name ?? claim.claim_generator ?? ''
    // The watermark it names, TrustMark's: the bits after its schema's number, as TrustMark's example writes them.
    const soft = value('c2pa.soft-binding')
    return { intact: signed && listed.every(Boolean) && bound !== false && (!at || (from <= at && at <= until)), bound, subject, issuer, selfIssued, spki, at, witness: datedOn?.authority ?? null,
      generated: /trainedAlgorithmicMedia$/.test(made?.digitalSourceType ?? ''), maker: String(made?.softwareAgent?.name ?? made?.softwareAgent ?? ''), generator: String(generator),
      watermark: soft?.alg === 'com.adobe.trustmark.Q' ? String(soft.blocks?.[0]?.value ?? '').split('*')[1] ?? null : null }
  } catch {
    return { ...NONE, bound: false }
  }
}

/** What a file without Content Credentials, or with ones that can't be read, shows. */
export const NONE = { intact: false, bound: /** @type {boolean | undefined} */ (undefined), subject: /** @type {Record<string, string>} */ ({}), issuer: /** @type {Record<string, string>} */ ({}),
  selfIssued: false, spki: new Uint8Array(), at: /** @type {Date | null} */ (null), witness: /** @type {Record<string, string> | null} */ (null), generated: false, maker: '', generator: '', watermark: /** @type {string | null} */ (null) }

/**
 * What a file says of itself of how it was made, unsigned, as those Jean makes say it (D324, D410): IPTC's Digital
 * Source Type and the system, in a Word document's or a workbook's custom properties, in XMP (a drawing's metadata,
 * a PNG's iTXt, a JPEG's packet), or in a web page's JSON-LD, in schema.org's terms. @param {string} name @param {Uint8Array} bytes
 */
export async function marksOf(name, bytes) {
  if (!/\.(docx|xlsx|pptx|svg|html?|png|jpe?g|webp)$/i.test(name)) return null
  const office = /x$/i.test(name) ? await readZip(bytes).find((entry) => entry.name === 'docProps/custom.xml')?.read() : bytes
  const text = new TextDecoder().decode(office)
  const source = /DigitalSourceType(?:"><vt:lpwstr>|=["']|>|"\s*:\s*")([^"'<]+)/i.exec(text)?.[1]
  const maker = /(?:AISystemUsed(?:"><vt:lpwstr>|=["']|>)|"creator"\s*:\s*\{[^}]*?"name"\s*:\s*")([^"'<]+)/.exec(text)?.[1] ?? ''
  return source ? { ...NONE, name, at: null, unsigned: true, generated: /trainedAlgorithmicMedia/i.test(source), maker } : null
}
