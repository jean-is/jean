// The watermark on a picture made on this device or by a server on this computer (D324), the code of
// practice's second layer beside the marks in its file, which a redrawn or reshared picture loses:
// Adobe's TrustMark (MIT, code and weights), variant Q, which C2PA's list names com.adobe.trustmark.Q.
// Its encoder, run in SD-Turbo's worker, sees the picture squashed to 256 pixels square and 100 bits:
// 61 random ones, TrustMark's BCH_5 error correction over them (5 flips mended), its schema's 4. What
// it changes there, centred, is spread over the picture at its size. The manifest names those bits
// (`c2pa.soft-binding`), so any of TrustMark's decoders finds the picture's credentials again; its
// decoder, in the same worker, reads them back when a picture is checked. Pure, so Node's tests run it.

/** @typedef {[string, string, number]} File path on the weights host, SHA-256, bytes */

/** Where its files are, unchanged from Adobe's, which its own server keeps at no revision. */
const REPOSITORY = 'jean-is/trustmark-onnx/resolve/55ad52ff52f5a535007401a3329465e1e5b974f4/'
/** The encoder, pinned by revision and SHA-256; and the decoder, downloaded only when a picture's watermark is looked for. @type {File[]} */
export const FILES = [[`${REPOSITORY}encoder_Q.onnx`, '19b3d1b25836130ffd78775a8f61539f993375d1823ef0e59ba5b8dffb4f892d', 17312208]]
export const DECODER = /** @type {File} */ ([`${REPOSITORY}decoder_Q.onnx`, 'ee3268f057c9dabef680e169302f5973d0589feea86189ed229a896cc3aa88df', 47401222])
/** The side of the square its encoder sees. */
export const SIDE = 256
/** C2PA's name for it, and TrustMark's for the schema, which a soft binding's value starts with. */
export const ALGORITHM = 'com.adobe.trustmark.Q'
const SCHEMA = 1

// ─── Its 100 bits ────────────────────────────────────────────────────────────

/** GF(2⁷), by x⁷ + x³ + 1: α's powers and their logarithms. */
const [M, N] = [7, 127]
const EXP = /** @type {number[]} */ ([])
for (let i = 0, x = 1; i < N; i++, x = x & 64 ? (x << 1) ^ 137 : x << 1) EXP[i] = x
const LOG = EXP.reduce((all, x, i) => ((all[x] = i), all), /** @type {number[]} */ ([]))
/** BCH's generator for 5 flips: the product of x − αⁱ over the cyclotomic cosets of 1, 3, 5, 7 and 9, a coefficient of xⁱ each. */
const GENERATOR = (() => {
  const roots = new Set()
  for (let i = 0; i < 5; i++) for (let j = 0, r = 2 * i + 1; j < M; j++, r = (2 * r) % N) roots.add(r)
  let g = [1]
  for (const root of roots) g = [...g, 0].map((c, i) => (i ? g[i - 1] : 0) ^ (c ? EXP[(LOG[c] + root) % N] : 0))
  return g
})()

/** TrustMark's 100 bits for 61: them, BCH_5's 35 over them padded to 64, and the schema's 4. @param {number[]} data */
export function payloadOf(data) {
  const degree = GENERATOR.length - 1
  const ecc = new Array(degree).fill(0)
  for (const bit of [...data, 0, 0, 0]) {
    const feedback = bit ^ /** @type {number} */ (ecc.shift())
    ecc.push(0)
    if (feedback) for (let i = 0; i < degree; i++) ecc[i] ^= GENERATOR[degree - 1 - i]
  }
  return [...data, ...ecc, ...SCHEMA.toString(2).padStart(4, '0').split('').map(Number)]
}

/** @param {number} a @param {number} b */
const mul = (a, b) => (a && b ? EXP[(LOG[a] + LOG[b]) % N] : 0)

/**
 * The 61 bits a decoder's 100 carry, as text, once BCH_5 mends up to 5 flips; null when it can't, or when
 * its schema's bits aren't BCH_5's, which leaves 1 random word in about 10,000 read as one. Its syndromes,
 * then Berlekamp–Massey's error locator, whose roots, found by trying each place, are the flips. The 99
 * places of the code: the data, the 3 bits that pad it (never flipped), the correction. @param {number[]} bits
 */
export function dataOf(bits) {
  if (bits.slice(96).join('') !== SCHEMA.toString(2).padStart(4, '0')) return null
  const word = [...bits.slice(0, 61), 0, 0, 0, ...bits.slice(61, 96)]
  const degree = (/** @type {number} */ place) => 98 - place
  const syndromes = Array.from({ length: 10 }, (_, k) => word.reduce((sum, bit, place) => (bit ? sum ^ EXP[((k + 1) * degree(place)) % N] : sum), 0))
  let [locator, previous, length, shift, last] = [[1], [1], 0, 1, 1]
  for (let n = 0; n < 10; n++) {
    const discrepancy = locator.reduce((sum, c, i) => (i ? sum ^ mul(c, syndromes[n - i] ?? 0) : sum), syndromes[n])
    if (!discrepancy) { shift++; continue }
    const factor = mul(discrepancy, EXP[(N - LOG[last]) % N])
    const next = [...locator]
    previous.forEach((c, i) => { next[i + shift] = (next[i + shift] ?? 0) ^ mul(factor, c) })
    if (2 * length <= n) [previous, length, last, shift] = [locator, n + 1 - length, discrepancy, 1]
    else shift++
    locator = next
  }
  const flips = word.map((_, place) => place).filter((place) => !locator.reduce((sum, c, i) => sum ^ mul(c, EXP[(N * 6 - i * degree(place)) % N]), 0))
  if (length > 5 || flips.length !== length || flips.some((place) => place > 60 && place < 64)) return null
  for (const place of flips) word[place] ^= 1
  const data = word.slice(0, 61)
  return payloadOf(data).slice(61, 96).join('') === word.slice(64).join('') ? data.join('') : null
}

/** 61 random bits, and what a C2PA soft binding says of them. */
export function randomData() {
  const data = Array.from(crypto.getRandomValues(new Uint8Array(61)), (byte) => byte & 1)
  return { data, softBinding: { alg: ALGORITHM, blocks: [{ scope: {}, value: `${SCHEMA}*${data.join('')}` }] } }
}

// ─── The picture ─────────────────────────────────────────────────────────────

/** RGBA pixels as the encoder takes them: a plane per colour, −1…1. @param {ArrayLike<number>} rgba */
export function planes(rgba) {
  const plane = rgba.length / 4
  const values = new Float32Array(plane * 3)
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) values[c * plane + i] = (rgba[i * 4 + c] / 255) * 2 - 1
  return values
}

/**
 * The picture's RGBA with the encoder's change spread over it: what it changed in the square, each
 * colour's mean taken away and held within ±0.2, stretched bilinearly to the picture's size and added.
 * @param {Uint8ClampedArray} rgba @param {number} width @param {number} height @param {ArrayLike<number>} encoded @param {ArrayLike<number>} cover
 */
export function watermarked(rgba, width, height, encoded, cover) {
  const plane = SIDE * SIDE
  const change = Float32Array.from(cover, (value, i) => Math.max(-0.2, Math.min(0.2, encoded[i] - value)))
  for (let c = 0; c < 3; c++) {
    const part = change.subarray(c * plane, (c + 1) * plane)
    const mean = part.reduce((sum, value) => sum + value, 0) / plane
    part.forEach((value, i) => { part[i] = value - mean })
  }
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, Math.min(SIDE - 1, ((y + 0.5) * SIDE) / height - 0.5))
    const [y0, wy] = [Math.floor(fy), fy - Math.floor(fy)]
    const y1 = Math.min(SIDE - 1, y0 + 1)
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, Math.min(SIDE - 1, ((x + 0.5) * SIDE) / width - 0.5))
      const [x0, wx] = [Math.floor(fx), fx - Math.floor(fx)]
      const x1 = Math.min(SIDE - 1, x0 + 1)
      for (let c = 0; c < 3; c++) {
        const at = (/** @type {number} */ row, /** @type {number} */ column) => change[c * plane + row * SIDE + column]
        const value = (at(y0, x0) * (1 - wx) + at(y0, x1) * wx) * (1 - wy) + (at(y1, x0) * (1 - wx) + at(y1, x1) * wx) * wy
        rgba[(y * width + x) * 4 + c] += value * 127.5
      }
    }
  }
  return rgba
}
