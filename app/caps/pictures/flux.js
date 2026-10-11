// FLUX.2 [klein] 4B on this device (D263): what its three graphs are given, worked out here so its
// worker (flux-worker.js) only runs them, as its ONNX export's notes and Black Forest Labs' own
// sampler say. The description is read by Qwen3 in its chat template, thinking off, 512 tokens
// padded; the picture is a token for each 16 pixels square, 128 numbers each, made from noise in
// 4 steps along their shifted schedule; the decoder takes those tokens channel by channel.

/** The description's tokens, padded; the steps from noise. */
export const WORDS = 512
export const STEPS = 4

/** Each shape's size in pixels, in sixteens, about a thousand of the picture's tokens each. */
export const SIZES = { square: [512, 512], wide: [672, 384], tall: [384, 672] }

/** The description as Qwen3 is asked, in its chat template, without thinking. @param {string} description */
export const chat = (description) => `<|im_start|>user\n${description}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`

/**
 * Its schedule, from all noise to none: evenly spaced, then shifted as Black Forest Labs' own sampler
 * shifts it (`compute_empirical_mu`), by how many tokens the picture has and how many steps it takes.
 * @param {number} steps @param {number} tokens
 */
export function sigmas(steps, tokens) {
  const many = 0.00016927 * tokens + 0.45666666
  const mu = tokens > 4300 ? many : many + ((many - (8.73809524e-5 * tokens + 1.89833333)) / 190) * (steps - 200)
  const shift = Math.exp(mu)
  return Array.from({ length: steps + 1 }, (_, i) => (i === steps ? 0 : shift / (shift + steps / (steps - i) - 1)))
}

/**
 * Where each token sits, as [t, h, w, l]: the picture's by row and column, the description's
 * one after another. @param {number} rows @param {number} columns
 */
export function positions(rows, columns) {
  const image = new BigInt64Array(rows * columns * 4)
  for (let i = 0; i < rows * columns; i++) [image[i * 4 + 1], image[i * 4 + 2]] = [BigInt(Math.floor(i / columns)), BigInt(i % columns)]
  const text = new BigInt64Array(WORDS * 4)
  for (let i = 0; i < WORDS; i++) text[i * 4 + 3] = BigInt(i)
  return { image, text }
}

/** Gaussian noise, the picture's tokens' first numbers. @param {number} length */
export const noise = (length) => Float32Array.from({ length }, () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()))

/**
 * How the decoder colours its latent's 32 channels, roughly: red, green and blue for each, and their bias,
 * as ComfyUI's previews mix them (its `Flux2` latent format, whose bias is FLUX.1's).
 */
const COLOURS = [[0.0058, 0.0113, 0.0073], [0.0495, 0.0443, 0.0836], [-0.0099, 0.0096, 0.0644], [0.2144, 0.3009, 0.3652], [0.0166, -0.0039, -0.0054],
  [0.0157, 0.0103, -0.016], [-0.0398, 0.0902, -0.0235], [-0.0052, 0.0095, 0.0109], [-0.3527, -0.2712, -0.1666], [-0.0301, -0.0356, -0.018], [-0.0107, 0.0078, 0.0013],
  [0.0746, 0.009, -0.0941], [0.0156, 0.0169, 0.007], [-0.0034, -0.004, -0.0114], [0.0032, 0.0181, 0.008], [-0.0939, -0.0008, 0.0186], [0.0018, 0.0043, 0.0104],
  [0.0284, 0.0056, -0.0127], [-0.0024, -0.0022, -0.003], [0.1207, -0.0026, 0.0065], [0.0128, 0.0101, 0.0142], [0.0137, -0.0072, -0.0007], [0.0095, 0.0092, -0.0059],
  [0, -0.0077, -0.0049], [-0.0465, -0.0204, -0.0312], [0.0095, 0.0012, -0.0066], [0.029, -0.0034, 0.0025], [0.022, 0.0169, -0.0048], [-0.0332, -0.0457, -0.0468],
  [-0.0085, 0.0389, 0.0609], [-0.0076, 0.0003, -0.0043], [-0.0111, -0.046, -0.0614]]
const BIAS = [-0.0329, -0.0718, -0.0851]

/**
 * A glimpse of the picture as it forms (D265): the colours its tokens would decode to, roughly, each
 * token's 2×2 patch of its 32 channels two pixels square, an eighth of the picture's size; −1…1
 * channels a plane each, as the decoder gives them. @param {Float32Array} latent @param {number} rows @param {number} columns
 */
export function glimpse(latent, rows, columns) {
  const width = columns * 2
  return mix(COLOURS, rows * 2 * width, (channel, pixel) => {
    const [y, x] = [Math.floor(pixel / width), pixel % width]
    return latent[((y >> 1) * columns + (x >> 1)) * 128 + channel * 4 + (y & 1) * 2 + (x & 1)]
  })
}

/**
 * A latent's channels at each pixel mixed into colours, as previews do without the decoder.
 * @param {number[][]} colours each channel's red, green and blue @param {number} pixels @param {(channel: number, pixel: number) => number} at
 */
export function mix(colours, pixels, at) {
  const out = new Float32Array(3 * pixels)
  for (let pixel = 0; pixel < pixels; pixel++) {
    for (let c = 0; c < 3; c++) out[c * pixels + pixel] = BIAS[c]
    for (let channel = 0; channel < colours.length; channel++) {
      const value = at(channel, pixel)
      for (let c = 0; c < 3; c++) out[c * pixels + pixel] += value * colours[channel][c]
    }
  }
  return out
}

/** The picture's tokens, 128 numbers each, laid out a channel at a time for the decoder. @param {Float32Array} latent */
export function unpack(latent) {
  const tokens = latent.length / 128
  const out = new Float32Array(latent.length)
  for (let i = 0; i < tokens; i++) for (let c = 0; c < 128; c++) out[c * tokens + i] = latent[i * 128 + c]
  return out
}
