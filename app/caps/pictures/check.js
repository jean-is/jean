// The check a picture made on this device or by a server on this computer goes through before it
// shows (D275), as nothing else filters what these make: Freepik's NSFW classifier (MIT), an EVA-02
// base that sees 448 pixels square, as onnx-community's converter exports it at 4 bits, which runs on
// WebGPU and WebAssembly alike. It says how likely a picture is neutral, low, medium or high; medium
// and high together, at half or more, show nudity or sex, as Freepik's own threshold has it, and low
// on, suggestive pictures too, which a strict check refuses. Nothing looser: high alone let bare
// breasts through (Manet's Olympia, 0.46), and a bikini and a bare breast share medium.

/** @typedef {[string, string, number]} File path on the weights host, SHA-256, bytes */

/** Its file, pinned by revision and SHA-256. @type {File} */
export const FILE = ['sitatech/freepik_nsfw_detector_onnx/resolve/250a86051c7302bc6943ea35b9d778765ca13452/onnx/model_q4.onnx', '19bf728cd00ba1b0dbf386300449e20c2c05647c0ac648b736744b6acd6e9bc3', 59512872]
/** The side of the square it sees, a picture squashed into it whole. */
export const SIDE = 448
/** How likely nudity or sex is, at most, in a picture that shows. */
export const LIMIT = 0.5
// CLIP's, as EVA-02 was trained with.
const MEAN = [0.48145466, 0.4578275, 0.40821073]
const DEVIATION = [0.26862954, 0.26130258, 0.27577711]

/** RGBA pixels as it takes them: a plane per colour, normalized as CLIP's. @param {ArrayLike<number>} rgba */
export function planes(rgba) {
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
