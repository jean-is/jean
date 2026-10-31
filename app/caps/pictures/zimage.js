// Z-Image-Turbo on this device (D263): what its graphs are given, worked out here so the stage
// worker only runs them, as the WebNN team's export and its demo drive them. The description is read
// by Qwen3 in its chat template, its own tokens only; the picture is a 16-channel latent, an eighth of
// its size, made from noise in 9 steps along a schedule shifted by 3, then scaled for the decoder.
import { mix } from './flux.js'

export const STEPS = 9
/** The description's tokens at most. */
export const WORDS = 512
const SHIFT = 3
/** The VAE's latent scale and shift, undone before it decodes. */
export const SCALE = 0.3611
export const OFFSET = 0.1159

/** The description as Qwen3 is asked, in its chat template, as Z-Image's pipeline asks it. @param {string} description */
export const chat = (description) => `<|im_start|>user\n${description}<|im_end|>\n<|im_start|>assistant\n`

const shifted = (/** @type {number} */ s) => (SHIFT * s) / (1 + (SHIFT - 1) * s)

/**
 * Its schedule, as diffusers' flow-matching scheduler makes it with a shift of 3: from the largest
 * sigma to the smallest of its 1000, evenly, shifted again, then none. With each step's timestep, as
 * the transformer takes it: 1 less its sigma, the last one 1. @param {number} steps
 */
export function schedule(steps) {
  const [from, to] = [shifted(1), shifted(1 / 1000)]
  const sigmas = Array.from({ length: steps }, (_, i) => shifted(from + ((to - from) * i) / (steps - 1)))
  return { sigmas: [...sigmas, 0], timesteps: sigmas.map((sigma, i) => (i === steps - 1 ? 1 : 1 - sigma)) }
}

/** How FLUX.1's VAE, which Z-Image's is, colours its latent's 16 channels, roughly, as ComfyUI's previews mix them (its `Flux` latent format). */
const COLOURS = [[-0.0346, 0.0244, 0.0681], [0.0034, 0.021, 0.0687], [0.0275, -0.0668, -0.0433], [-0.0174, 0.016, 0.0617], [0.0859, 0.0721, 0.0329], [0.0004, 0.0383, 0.0115],
  [0.0405, 0.0861, 0.0915], [-0.0236, -0.0185, -0.0259], [-0.0245, 0.025, 0.118], [0.1008, 0.0755, -0.0421], [-0.0515, 0.0201, 0.0011], [0.0428, -0.0012, -0.0036],
  [0.0817, 0.0765, 0.0749], [-0.1264, -0.0522, -0.1103], [-0.028, -0.0881, -0.0499], [-0.1262, -0.0982, -0.0778]]

/**
 * A glimpse of the picture as it forms: the colours its latent would decode to, roughly, a pixel
 * for each of its points, an eighth of its size; −1…1 channels a plane each. @param {Float32Array} latent @param {number} height @param {number} width
 */
export const glimpse = (latent, height, width) => mix(COLOURS, height * width, (channel, pixel) => latent[channel * height * width + pixel])
