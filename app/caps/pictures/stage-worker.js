// FLUX.2 [klein] 4B and Z-Image-Turbo on this device (D263), a stage in each worker: the page starts
// one per stage and ends it once it has answered, since ONNX Runtime on WebGPU keeps a session's
// memory until its worker ends, and a maker's graphs don't fit at once on most devices. Through ONNX
// Runtime from Jean's own copy (D52); their files from the host the page passes (D53), checked as
// Whistle's are.
//
// { type: 'fetch', host, files }                                        → progress…, { type: 'done' }
// { maker, type: 'encode', host, files, tokenizer, prompt }             → { type: 'done', embeds }, Qwen3's, in halves
// { maker: 'flux2-klein', type: 'see', host, files, pictures }          → { type: 'done', seen, sizes, size }, their tokens in halves, each one's width and height, the picture's
// { maker, type: 'denoise', host, files, embeds, seen?, sizes?, width, height } → { type: 'glimpse', done, bytes }… a PNG after each step, { type: 'done', latent }
// { maker, type: 'decode', host, files, latent, width, height }         → { type: 'done', bytes }, a PNG
// FastWan's films (D585), each of umT5's three graphs a stage of its own:
// { maker: 'fastwan', type: 'words', host, files, tokenizer, prompt }  → { type: 'done', hidden }, its tokens' rows, in halves
// { maker: 'fastwan', type: 'read', host, files, hidden }              → { type: 'done', hidden }, through eight of umT5's layers
// { maker: 'fastwan', type: 'denoise', host, files, decoder, embeds, width, height } → glimpses, { type: 'done', latent }
// { maker: 'fastwan', type: 'decode', host, files, latent, width, height } → { type: 'done', bytes, checks }, an MP4 and frames as PNGs
import '../../ui/model-worker.js'
import { InferenceSession, Tensor } from '../../vendor/transformers/ort.webgpu.bundle.min.mjs'
import { Qwen2Tokenizer, T5Tokenizer } from '../../vendor/transformers/transformers.web.min.js'
import { download } from '../../ui/weights.js'
import * as flux from './flux.js'
import * as zimage from './zimage.js'
import * as fastwan from './fastwan.js'

/** @typedef {[string, string, number]} File path on the weights host, SHA-256, bytes */

/** Halves, as the graphs take and give them. */
const Half = /** @type {any} */ (globalThis).Float16Array
const halves = (/** @type {ArrayLike<number>} */ values) => new Uint16Array(new Half(values).buffer)
const numbers = (/** @type {any} */ data) => Float32Array.from(data instanceof Uint16Array ? new Half(data.buffer, data.byteOffset, data.length) : data)

self.onmessage = async ({ data: { maker, type, ...data } }) => {
  try {
    const done = await (type === 'fetch' ? fetchAll(data) : STAGES[/** @type {keyof typeof STAGES} */ (maker)][/** @type {'encode'} */ (type)](data))
    self.postMessage({ type: 'done', ...done }, { transfer: Object.values(done).flatMap((value) => value.buffer ?? []) })
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

/**
 * A graph's session, its weights beside it in the files named as its graph names them. Once they are on the
 * device, their copy here goes at once rather than whenever it is collected, which nearly halves what a picture holds (D545).
 * @param {string} host @param {File[]} files the graph, then its weights
 */
async function session(host, files) {
  const [graph, ...weights] = await read(host, files)
  return InferenceSession.create(graph, { executionProviders: ['webgpu'], externalData: weights.map((data, i) => ({ path: /** @type {string} */ (files[i + 1][0].split('/').pop()), data })) })
    .finally(() => weights.forEach((data) => /** @type {any} */ (data.buffer).transfer?.(0)))
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
 * What it would be with no noise left, glimpsed after a step, as PNG: how far along it is, its decoder still to come.
 * @param {Float32Array} sample from a maker's glimpse @param {number} width @param {number} height @param {number} step @param {number} steps
 */
async function glance(sample, width, height, step, steps) {
  const bytes = await png(sample, width, height)
  self.postMessage({ type: 'glimpse', done: (step + 1) / (steps + 1), bytes }, { transfer: [bytes.buffer] })
}

/** A picture's pixels, drawn at a size, as −1…1 channels a plane each. @param {ImageBitmap} bitmap @param {number} width @param {number} height */
function planes(bitmap, width, height) {
  const context = /** @type {OffscreenCanvasRenderingContext2D} */ (new OffscreenCanvas(width, height).getContext('2d'))
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  const { data } = context.getImageData(0, 0, width, height)
  return Float32Array.from({ length: 3 * width * height }, (_, i) => data[(i % (width * height)) * 4 + Math.floor(i / (width * height))] / 127.5 - 1)
}

/** @typedef {{ host: string, files: File[], tokenizer: File[], prompt: string }} Encode */
/** @typedef {{ host: string, files: File[], pictures: Uint8Array[] }} See */
/** @typedef {{ host: string, files: File[], embeds: Uint16Array, seen?: Uint16Array, sizes?: number[], width: number, height: number }} Denoise */
/** @typedef {{ host: string, files: File[], latent: Float32Array, width: number, height: number }} Decode */

const STAGES = {
  'flux2-klein': {
    /** The description, read: Qwen3's hidden states, three of its layers side by side, 512 tokens padded. @param {Encode} data */
    async encode({ host, files, tokenizer, prompt }) {
      const inputs = await tokens(host, tokenizer, flux.chat(prompt), { padding: 'max_length', max_length: flux.WORDS })
      const { prompt_embeds } = await (await session(host, files)).run(inputs)
      return { embeds: /** @type {Uint16Array} */ (prompt_embeds.data) }
    },

    /**
     * The pictures it starts from, read by the VAE's encoder, each in its own proportions, sharing about a
     * thousand tokens (D545), already normalised as the transformer reads them; and the size of the picture
     * it makes, in the first one's proportions. @param {See} data
     */
    async see({ host, files, pictures }) {
      const encoder = await session(host, files)
      const bitmaps = await Promise.all(pictures.map((bytes) => createImageBitmap(new Blob([/** @type {BlobPart} */ (bytes)]))))
      const sizes = bitmaps.flatMap((bitmap) => flux.fit(bitmap.width, bitmap.height, 1024 / bitmaps.length))
      /** @type {number[]} */
      const seen = []
      for (const [i, bitmap] of bitmaps.entries()) {
        const [width, height] = sizes.slice(i * 2)
        const { packed_latent } = await encoder.run({ sample: new Tensor('float32', planes(bitmap, width, height), [1, 3, height, width]) })
        for (const value of flux.turn(/** @type {Float32Array} */ (packed_latent.data), 128)) seen.push(value)
      }
      return { seen: halves(seen), sizes, size: flux.fit(bitmaps[0].width, bitmaps[0].height) }
    },

    /**
     * The picture's tokens, from noise, a step at a time; after them, those of the pictures it starts
     * from, whose part of the prediction is left. @param {Denoise} data
     */
    async denoise({ host, files, embeds, seen = new Uint16Array(), sizes, width, height }) {
      const transformer = await session(host, files)
      const [rows, columns] = [height / 16, width / 16]
      const ids = flux.positions(rows, columns, sizes)
      const sigmas = flux.sigmas(flux.STEPS, rows * columns)
      const latent = flux.noise(rows * columns * 128)
      for (let step = 0; step < flux.STEPS; step++) {
        const tokens = new Uint16Array([...halves(latent), ...seen])
        const { noise_pred } = await transformer.run({
          hidden_states: new Tensor('float16', tokens, [1, tokens.length / 128, 128]),
          encoder_hidden_states: new Tensor('float16', embeds, [1, flux.WORDS, 7680]),
          timestep: new Tensor('float16', halves([sigmas[step]]), [1]),
          img_ids: new Tensor('int64', ids.image, [1, tokens.length / 128, 4]),
          txt_ids: new Tensor('int64', ids.text, [1, flux.WORDS, 4]),
        })
        const velocity = numbers(/** @type {Uint16Array} */ (noise_pred.data).subarray(0, latent.length))
        await glance(flux.glimpse(latent.map((value, i) => value - sigmas[step] * velocity[i]), rows, columns), columns * 2, rows * 2, step, flux.STEPS)
        for (let i = 0; i < latent.length; i++) latent[i] += (sigmas[step + 1] - sigmas[step]) * velocity[i]
      }
      return { latent }
    },

    /** The picture, decoded from its tokens, laid out a channel at a time. @param {Decode} data */
    async decode({ host, files, latent, width, height }) {
      const { sample } = await (await session(host, files)).run({ packed_latent: new Tensor('float32', flux.turn(latent, latent.length / 128), [1, 128, height / 16, width / 16]) })
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

  fastwan: {
    /** The description's tokens (umT5's, its own only), their rows of the embedding, int8 with a scale each. @param {Encode} data */
    async words({ host, files, tokenizer, prompt }) {
      const [json, config] = (await read(host, tokenizer)).map((bytes) => JSON.parse(new TextDecoder().decode(bytes)))
      const ids = new T5Tokenizer(json, config)(prompt, { truncation: true, max_length: fastwan.WORDS, return_tensor: false }).input_ids
      const [rows, scales] = await read(host, files)
      const [signed, scale] = [new Int8Array(rows.buffer), new Half(scales.buffer)]
      return { hidden: halves(ids.flatMap((/** @type {number} */ id) => Array.from(signed.subarray(id * 4096, id * 4096 + 4096), (value) => value * scale[id]))) }
    },

    /**
     * Eight of umT5's layers; their stream comes out in fp32, as `wo` is, and goes on in halves: as their bits, ONNX Runtime
     * giving a Float16Array where the browser has one. @param {{ host: string, files: File[], hidden: Uint16Array }} data
     */
    async read({ host, files, hidden }) {
      const { out } = await (await session(host, files)).run({ hidden: new Tensor('float16', hidden, [1, hidden.length / 4096, 4096]) })
      return { hidden: out.type === 'float16' ? new Uint16Array(out.data.buffer, out.data.byteOffset, out.data.length) : halves(out.data) }
    },

    /**
     * The film's latent, from noise, in FastVideo's three steps: at each the clean film foreseen, glimpsed by TAEHV from
     * its middle frame, then noised again to the next. @param {Denoise & { decoder: File[] }} data
     */
    async denoise({ host, files, decoder, embeds, width, height }) {
      const [transformer, taehv] = [await session(host, files), await session(host, decoder)]
      const shape = fastwan.shape(width, height), [, t, h, w] = shape, tokens = t * (h / 2) * (w / 2)
      const { cos, sin } = fastwan.rope(t, h / 2, w / 2)
      const fixed = { text: new Tensor('float16', embeds, [1, fastwan.WORDS, 4096]), rope_cos: new Tensor('float32', cos, [1, tokens, 1, 128]), rope_sin: new Tensor('float32', sin, [1, tokens, 1, 128]) }
      let [latent, foreseen] = [flux.noise(48 * t * h * w), new Float32Array()]
      for (const [step, timestep] of fastwan.STEPS.entries()) {
        const { out } = await transformer.run({ ...fixed, patches: new Tensor('float16', halves(fastwan.patchify(latent, shape)), [1, tokens, 192]), timestep: new Tensor('int64', BigInt64Array.of(BigInt(timestep)), [1]) })
        const velocity = fastwan.unpatchify(numbers(out.data), shape), [sigma, next] = fastwan.SIGMAS.slice(step)
        foreseen = latent.map((value, i) => value - sigma * velocity[i])
        const { frames } = await taehv.run({ latents: new Tensor('float16', halves(fastwan.frames(foreseen, shape, t >> 1)), [1, 48, h, w]) })
        await glance(numbers(frames.data).map((value) => value * 2 - 1), width, height, step, fastwan.STEPS.length)
        if (next !== undefined) latent = flux.noise(latent.length).map((value, i) => next * value + (1 - next) * foreseen[i])
      }
      return { latent: foreseen }
    },

    /**
     * The film, decoded by TAEHV, as an MP4 the browser's own encoder fills (H.264 Baseline, which Safari finishes), written by
     * Mediabunny; and a frame every half second, and the last, as PNGs for the check (D275). @param {Decode} data
     */
    async decode({ host, files, latent, width, height }) {
      const shape = fastwan.shape(width, height)
      const { frames } = await (await session(host, files)).run({ latents: new Tensor('float16', halves(fastwan.frames(latent, shape)), [shape[1], 48, shape[2], shape[3]]) })
      const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH } = await import(new URL('../../vendor/mediabunny/mediabunny.mjs', import.meta.url).href)
      const canvas = new OffscreenCanvas(width, height), context = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'))
      const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
      const video = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH, fullCodecString: 'avc1.42002a' })
      output.addVideoTrack(video, { frameRate: fastwan.FPS })
      await output.start()
      const [values, plane, count, checks] = [new Half(frames.data.buffer, frames.data.byteOffset, frames.data.length), width * height, frames.dims[0], /** @type {Uint8Array[]} */ ([])]
      const image = new ImageData(width, height)
      for (let frame = 0; frame < count; frame++) {
        for (let i = 0; i < plane; i++) for (let c = 0; c < 4; c++) image.data[i * 4 + c] = c === 3 ? 255 : values[(frame * 3 + c) * plane + i] * 255
        context.putImageData(image, 0, 0)
        await video.add(frame / fastwan.FPS, 1 / fastwan.FPS)
        if (frame % (fastwan.FPS / 2) === 0 || frame === count - 1) checks.push(new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()))
      }
      await output.finalize()
      return { bytes: new Uint8Array(output.target.buffer), checks }
    },
  },
}
