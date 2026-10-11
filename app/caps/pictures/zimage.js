// Z-Image-Turbo on this device (D263): what its graphs are given, worked out here so the stage
// worker only runs them, as the WebNN team's export and its demo drive them. The description is read
// by Qwen3 in its chat template, its own tokens only; the picture is a 16-channel latent, an eighth of
// its size, made from noise in 9 steps along a schedule shifted by 3, then scaled for the decoder.

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
