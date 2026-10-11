// FLUX.2 [klein] 4B and Z-Image-Turbo on this device (D263), a stage in each worker: the page starts
// one per stage and ends it once it has answered, since ONNX Runtime on WebGPU keeps a session's
// memory until its worker ends, and a maker's graphs don't fit at once on most devices. Through ONNX
// Runtime from Jean's own copy (D52); their files from the host the page passes (D53), checked as
// Whistle's are.
//
// { type: 'fetch', host, files }                                        → progress…, { type: 'done' }
// { maker, type: 'encode', host, files, tokenizer, prompt }             → { type: 'done', embeds }, Qwen3's, in halves
// { maker, type: 'denoise', host, files, embeds, width, height }        → { type: 'glimpse', done, bytes }… a PNG after each step (D265), { type: 'done', latent }
// { maker, type: 'decode', host, files, latent, width, height }         → { type: 'done', bytes }, a PNG
import '../../ui/model-worker.js'
import { InferenceSession, Tensor } from '../../vendor/transformers/ort.webgpu.bundle.min.mjs'
import { Qwen2Tokenizer } from '../../vendor/transformers/transformers.web.min.js'
import { download } from '../../ui/weights.js'
import * as flux from './flux.js'
import * as zimage from './zimage.js'

/** @typedef {[string, string, number]} File path on the weights host, SHA-256, bytes */

/** Halves, as the graphs take and give them. */
const Half = /** @type {any} */ (globalThis).Float16Array
const halves = (/** @type {ArrayLike<number>} */ values) => new Uint16Array(new Half(values).buffer)
const numbers = (/** @type {any} */ data) => Float32Array.from(data instanceof Uint16Array ? new Half(data.buffer, data.byteOffset, data.length) : data)

self.onmessage = async ({ data: { maker, type, ...data } }) => {
  try {
    const done = await (type === 'fetch' ? fetchAll(data) : STAGES[/** @type {keyof typeof STAGES} */ (maker)][/** @type {'encode'} */ (type)](data))
    self.postMessage({ type: 'done', ...done }, { transfer: Object.values(done).map((value) => value.buffer) })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}

/** Its files' bytes, from the cache or the host, one after another. @param {string} host @param {File[]} files */
async function read(host, files) {
  /** @type {Uint8Array[]} */
  const read = []
  for (const [path, hash] of files) read.push(new Uint8Array(await download(new URL(path, host).href, hash, () => {})))
  return read
}

/** A graph's session, its weights beside it in the files named as its graph names them. @param {string} host @param {File[]} files the graph, then its weights */
async function session(host, files) {
  const [graph, ...weights] = await read(host, files)
  return InferenceSession.create(graph, { executionProviders: ['webgpu'],
    externalData: weights.map((data, i) => ({ path: /** @type {string} */ (files[i + 1][0].split('/').pop()), data })) })
}

/**
 * A maker's files, downloaded and kept, one at a time, nothing run, those here already left unread:
 * what of them has come, as it comes. @param {{ host: string, files: File[] }} data
 */
async function fetchAll({ host, files }) {
  const cache = await caches.open('transformers-cache')
  const total = files.reduce((sum, [, , bytes]) => sum + bytes, 0)
  let before = 0
  for (const [path, hash, bytes] of files) {
    const url = new URL(path, host).href
    if (!(await cache.match(url))) await download(url, hash, (loaded) => self.postMessage({ type: 'progress', loaded: before + loaded, total }))
    before += bytes
  }
  return {}
}

/**
 * The description's tokens, in its chat template, padded to a length or not. @param {string} host @param {File[]} tokenizer
 * @param {string} text @param {{ padding: 'max_length' | false, max_length: number }} options
 */
async function tokens(host, tokenizer, text, options) {
  const [json, config] = (await read(host, tokenizer)).map((bytes) => JSON.parse(new TextDecoder().decode(bytes)))
  const { input_ids, attention_mask } = new Qwen2Tokenizer(json, config)(text, { ...options, truncation: true, return_tensor: false })
  const tensor = (/** @type {number[]} */ ids) => new Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length])
  return { input_ids: tensor(input_ids), attention_mask: tensor(attention_mask) }
}

/** Decoded pixels, −1…1 channels a plane each, as PNG. @param {ArrayLike<number>} sample @param {number} width @param {number} height */
async function png(sample, width, height) {
  const plane = width * height
  const rgba = new Uint8ClampedArray(plane * 4).fill(255)
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) rgba[i * 4 + c] = (sample[c * plane + i] / 2 + 0.5) * 255
  const canvas = new OffscreenCanvas(width, height)
  canvas.getContext('2d')?.putImageData(new ImageData(rgba, width, height), 0, 0)
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
}

/**
 * What it would be with no noise left, glimpsed after a step, as PNG (D265): how far along it is, its decoder still to come.
 * @param {Float32Array} sample from a maker's glimpse @param {number} width @param {number} height @param {number} step @param {number} steps
 */
async function glance(sample, width, height, step, steps) {
  const bytes = await png(sample, width, height)
  self.postMessage({ type: 'glimpse', done: (step + 1) / (steps + 1), bytes }, { transfer: [bytes.buffer] })
}

/** @typedef {{ host: string, files: File[], tokenizer: File[], prompt: string }} Encode */
/** @typedef {{ host: string, files: File[], embeds: Uint16Array, width: number, height: number }} Denoise */
/** @typedef {{ host: string, files: File[], latent: Float32Array, width: number, height: number }} Decode */

const STAGES = {
  'flux2-klein': {
    /** The description, read: Qwen3's hidden states, three of its layers side by side, 512 tokens padded. @param {Encode} data */
    async encode({ host, files, tokenizer, prompt }) {
      const inputs = await tokens(host, tokenizer, flux.chat(prompt), { padding: 'max_length', max_length: flux.WORDS })
      const { prompt_embeds } = await (await session(host, files)).run(inputs)
      return { embeds: /** @type {Uint16Array} */ (prompt_embeds.data) }
    },

    /** The picture's tokens, from noise, a step at a time. @param {Denoise} data */
    async denoise({ host, files, embeds, width, height }) {
      const transformer = await session(host, files)
      const [rows, columns] = [height / 16, width / 16]
      const ids = flux.positions(rows, columns)
      const sigmas = flux.sigmas(flux.STEPS, rows * columns)
      const latent = flux.noise(rows * columns * 128)
      for (let step = 0; step < flux.STEPS; step++) {
        const { noise_pred } = await transformer.run({
          hidden_states: new Tensor('float16', halves(latent), [1, rows * columns, 128]),
          encoder_hidden_states: new Tensor('float16', embeds, [1, flux.WORDS, 7680]),
          timestep: new Tensor('float16', halves([sigmas[step]]), [1]),
          img_ids: new Tensor('int64', ids.image, [1, rows * columns, 4]),
          txt_ids: new Tensor('int64', ids.text, [1, flux.WORDS, 4]),
        })
        const velocity = numbers(noise_pred.data)
        await glance(flux.glimpse(latent.map((value, i) => value - sigmas[step] * velocity[i]), rows, columns), columns * 2, rows * 2, step, flux.STEPS)
        for (let i = 0; i < latent.length; i++) latent[i] += (sigmas[step + 1] - sigmas[step]) * velocity[i]
      }
      return { latent }
    },

    /** The picture, decoded from its tokens, laid out a channel at a time. @param {Decode} data */
    async decode({ host, files, latent, width, height }) {
      const { sample } = await (await session(host, files)).run({ packed_latent: new Tensor('float32', flux.unpack(latent), [1, 128, height / 16, width / 16]) })
      return { bytes: await png(/** @type {Float32Array} */ (sample.data), width, height) }
    },
  },

  'z-image-turbo': {
    /** The description, read: Qwen3's next to last hidden states, for its own tokens only. @param {Encode} data */
    async encode({ host, files, tokenizer, prompt }) {
      const inputs = await tokens(host, tokenizer, zimage.chat(prompt), { padding: false, max_length: zimage.WORDS })
      const { encoder_hidden_states } = await (await session(host, files)).run(inputs)
      return { embeds: /** @type {Uint16Array} */ (encoder_hidden_states.data) }
    },

    /** The picture's latent, from noise, a step at a time, as its pipeline's flow-matching steps. @param {Denoise} data */
    async denoise({ host, files, embeds, width, height }) {
      const transformer = await session(host, files)
      const shape = [1, 16, height / 8, width / 8]
      const { sigmas, timesteps } = zimage.schedule(zimage.STEPS)
      const latent = flux.noise(16 * (height / 8) * (width / 8))
      for (let step = 0; step < zimage.STEPS; step++) {
        const { sample } = await transformer.run({
          hidden_states: new Tensor('float16', halves(latent), shape),
          encoder_hidden_states: new Tensor('float16', embeds, [1, embeds.length / 2560, 2560]),
          timestep: new Tensor('float16', halves([timesteps[step]]), [1]),
        })
        // Its transformer gives the velocity's opposite.
        const velocity = numbers(sample.data)
        await glance(zimage.glimpse(latent.map((value, i) => value + sigmas[step] * velocity[i]), height / 8, width / 8), width / 8, height / 8, step, zimage.STEPS)
        for (let i = 0; i < latent.length; i++) latent[i] -= (sigmas[step + 1] - sigmas[step]) * velocity[i]
      }
      return { latent }
    },

    /** The picture, decoded from its latent, unscaled first. @param {Decode} data */
    async decode({ host, files, latent, width, height }) {
      const scaled = halves(latent.map((value) => value / zimage.SCALE + zimage.OFFSET))
      const { sample } = await (await session(host, files)).run({ latent_sample: new Tensor('float16', scaled, [1, 16, height / 8, width / 8]) })
      return { bytes: await png(numbers(sample.data), width, height) }
    },
  },
}
