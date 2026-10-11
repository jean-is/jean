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

/** The picture's tokens, 128 numbers each, laid out a channel at a time for the decoder. @param {Float32Array} latent */
export function unpack(latent) {
  const tokens = latent.length / 128
  const out = new Float32Array(latent.length)
  for (let i = 0; i < tokens; i++) for (let c = 0; c < 128; c++) out[c * tokens + i] = latent[i * 128 + c]
  return out
}
