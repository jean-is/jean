// The check a picture made on this device or by a server on this computer goes through before it
// shows (D275, D280), as nothing else filters what these make. For nudity and sex, Freepik's NSFW
// classifier (MIT), an EVA-02 base that sees 448 pixels square, as onnx-community's converter exports
// it at 4 bits, which runs on WebGPU and WebAssembly alike. It says how likely a picture is neutral,
// low, medium or high; medium and high together, at half or more, show nudity or sex, as Freepik's
// own threshold has it, and low on, suggestive pictures too, which a strict check refuses. Nothing
// looser: high alone let bare breasts through (Manet's Olympia, 0.46), and a bikini and a bare breast
// share medium. For symbols of hate, graphic violence and self-harm, SigLIP's image encoder (Apache
// 2.0, 224 pixels square, 4 bits) and the vectors of a few words for each, in concepts.json, which
// scripts/concepts.js writes.

/** @typedef {[string, string, number]} File path on the weights host, SHA-256, bytes */

/** Its files, pinned by revision and SHA-256: Freepik's classifier, then SigLIP's image encoder. @type {File[]} */
export const FILES = [
  ['sitatech/freepik_nsfw_detector_onnx/resolve/250a86051c7302bc6943ea35b9d778765ca13452/onnx/model_q4.onnx', '19bf728cd00ba1b0dbf386300449e20c2c05647c0ac648b736744b6acd6e9bc3', 59512872],
  ['Xenova/siglip-base-patch16-224/resolve/4649052661e53c7000355844105f8a1792088239/onnx/vision_model_q4.onnx', 'ffb4672d02e3e5995f1cb3bf7308c459017014b11a4b129b2762c6872ffb2524', 63262114],
]
/** The sides of the squares each sees, a picture squashed into them whole. */
export const SIDE = 448
export const SIGLIP_SIDE = 224
/** How likely nudity or sex is, at most, in a picture that shows. */
export const LIMIT = 0.5
/** Their normalizations, mean and deviation: CLIP's, as EVA-02 was trained with, and SigLIP's. */
export const CLIP = [[0.48145466, 0.4578275, 0.40821073], [0.26862954, 0.26130258, 0.27577711]]
export const SIGLIP = [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5]]

/** RGBA pixels as one takes them: a plane per colour, normalized. @param {ArrayLike<number>} rgba @param {number[][]} [normalization] */
export function planes(rgba, [MEAN, DEVIATION] = CLIP) {
  const plane = rgba.length / 4
  const values = new Float32Array(plane * 3)
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) values[c * plane + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / DEVIATION[c]
  return values
}

/**
 * How likely its four levels' logits say a picture is past what the check lets show: from medium on
 * (nudity or sex), or from low on when it is strict (suggestive too). @param {ArrayLike<number>} logits @param {boolean} [strict]
 */
export function explicit(logits, strict = false) {
  const top = Math.max(...Array.from(logits))
  const odds = Array.from(logits, (logit) => Math.exp(logit - top))
  const sum = (/** @type {number[]} */ some) => some.reduce((total, odd) => total + odd)
  return sum(odds.slice(strict ? 1 : 2)) / sum(odds)
}

/** A vector concepts.json holds, at unit length: the scale of a step, then a signed byte a value. @param {string} base64 */
export function unpacked(base64) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  const step = new DataView(bytes.buffer).getFloat32(0, true)
  return Float32Array.from(new Int8Array(bytes.buffer, 4), (value) => value * step)
}

/**
 * The areas a picture shows, from SigLIP's view of it (D280): those with a word as close to it as their limit.
 * @param {ArrayLike<number>} view @param {{ areas: Record<string, { limit: number, vectors: string[] }> }} concepts
 */
export function shown(view, { areas }) {
  const length = Math.hypot(...Array.from(view))
  const close = (/** @type {string} */ vector) => unpacked(vector).reduce((sum, value, i) => sum + value * view[i], 0) / length
  return Object.keys(areas).filter((area) => areas[area].vectors.some((vector) => close(vector) >= areas[area].limit))
}
