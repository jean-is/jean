// Pictures on this device (D251): SD-Turbo in one step, as in ONNX Runtime's own example: noise at
// the largest sigma, one pass of the UNet guided by the description's CLIP encoding, then the VAE's
// decoder. Through ONNX Runtime from Jean's own copy (D52), on WebNN where the browser offers it,
// else WebGPU; its files from the host the page passes (D53), one after another, so only one is
// held while it is read. Every picture made on this device, or by a server on this computer, is
// checked here before it shows (D275, D280), and watermarked here once it passes (D324).
//
// { type: 'load', host, files }   → progress…, { type: 'ready' }
// { type: 'paint', prompt }       → { type: 'done', bytes }, a PNG
// { type: 'unload' }              → { type: 'done' }, its sessions let go, as its files are removed (D263)
// { type: 'check', host, bytes }  → { type: 'done', logits, areas }, its four levels of nudity, and the other areas it shows
// { type: 'watermark', host, bytes, bits } → { type: 'done', bytes }, the PNG with TrustMark's watermark of those 100 bits
// { type: 'detect', host, bytes }  → progress…, { type: 'done', bits }, the 100 TrustMark's decoder reads in a picture
import { InferenceSession, Tensor } from '../../vendor/transformers/ort.webgpu.bundle.min.mjs'
import { AutoTokenizer } from '../../vendor/transformers/transformers.web.min.js'
import { weightsFrom } from '../../ui/model-worker.js'
import { download } from '../../ui/weights.js'
import * as check from './check.js'
import * as watermark from './watermark.js'

const SIGMA = 14.6146 // the scheduler's largest, at timestep 999
const SCALE = 0.18215 // the VAE's latent scaling
const SIDE = 512
// Each file's free dimensions, fixed: one picture, 64 × 64 latents, CLIP's 77 tokens.
const DIMENSIONS = [{ batch_size: 1 }, { batch_size: 1, num_channels: 4, height: 64, width: 64, sequence_length: 77 },
  { batch_size: 1, num_channels_latent: 4, height_latent: 64, width_latent: 64 }]

/** @type {Promise<{ tokenizer: any, sessions: any[] }> | null} */
let loading = null
/** @type {Promise<any[]> | null} the check's sessions, then the areas' words, kept for the next picture */
let checker = null
/** @type {Promise<any> | null} TrustMark's encoder, kept for the next picture */
let marker = null
/** @type {Promise<any> | null} its decoder, kept for the next */
let reader = null
let busy = Promise.resolve()

self.onmessage = ({ data }) => {
  // One at a time: they share the device's memory.
  busy = busy.then(() => handle(data)).catch(() => {})
}

/** @param {any} data */
async function handle({ id, type, ...data }) {
  try {
    if (type === 'load') {
      await load(data, id)
      self.postMessage({ id, type: 'ready' })
    } else if (type === 'paint') {
      const bytes = await paint(data.prompt)
      self.postMessage({ id, type: 'done', bytes }, { transfer: [bytes] })
    } else if (type === 'unload' && loading) {
      const { sessions } = await loading
      loading = null
      await Promise.all(sessions.map((session) => session.release()))
      self.postMessage({ id, type: 'done' })
    } else if (type === 'check') {
      self.postMessage({ id, type: 'done', ...await checked(data) })
    } else if (type === 'watermark') {
      const bytes = await watermarked(data)
      self.postMessage({ id, type: 'done', bytes }, { transfer: [bytes] })
    } else if (type === 'detect') {
      self.postMessage({ id, type: 'done', bits: await detected(data, id) })
    }
  } catch (error) {
    if (type === 'load') loading = null
    self.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}

/** @param {{ host: string, files: Array<[string, string, number]> }} data @param {number} id */
function load({ host, files }, id) {
  return (loading ??= (async () => {
    weightsFrom(host, id)
    const tokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch16')
    tokenizer.pad_token_id = 0
    const got = files.map(() => 0)
    const total = files.reduce((sum, [, , bytes]) => sum + bytes, 0)
    const providers = 'ml' in navigator ? [{ name: 'webnn', deviceType: 'gpu' }, 'webgpu'] : ['webgpu']
    const sessions = []
    for (const [i, [path, hash]] of files.entries()) {
      const bytes = await download(new URL(path, host).href, hash, (loaded) => self.postMessage({ id, type: 'progress', loaded: (got[i] = loaded, got.reduce((a, b) => a + b)), total }))
      sessions.push(await InferenceSession.create(new Uint8Array(bytes), { executionProviders: providers, freeDimensionOverrides: DIMENSIONS[i], enableMemPattern: false, enableCpuMemArena: false,
        extra: { session: { disable_prepacking: '1', use_device_allocator_for_initializers: '1', use_ort_model_bytes_directly: '1', use_ort_model_bytes_for_initializers: '1' } } }))
    }
    return { tokenizer, sessions }
  })())
}

/** A picture of the prompt, as PNG. @param {string} prompt */
async function paint(prompt) {
  if (!loading) throw new Error('Pictures on this device are not loaded')
  const { tokenizer, sessions: [encoder, unet, decoder] } = await loading
  // Always CLIP's 77 tokens, the description's then padding, as the UNet takes them.
  const { input_ids } = await tokenizer(prompt, { padding: 'max_length', max_length: 77, truncation: true, return_tensor: false })
  const { last_hidden_state } = await encoder.run({ input_ids: new Tensor('int32', Int32Array.from(input_ids), [1, input_ids.length]) })
  const shape = [1, 4, 64, 64]
  const noise = Float32Array.from({ length: 4 * 64 * 64 }, () => SIGMA * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()))
  const { out_sample } = await unet.run({ sample: new Tensor('float32', noise.map((x) => x / Math.hypot(SIGMA, 1)), shape),
    timestep: new Tensor('int64', BigInt64Array.of(999n), [1]), encoder_hidden_states: last_hidden_state })
  // One Euler step from the largest sigma to none lands on what the UNet saw behind the noise.
  const latents = noise.map((x, i) => (x - SIGMA * out_sample.data[i]) / SCALE)
  const { sample } = await decoder.run({ latent_sample: new Tensor('float32', latents, shape) })
  // From the decoder's −1…1 channels, one plane each, to pixels.
  const plane = SIDE * SIDE
  const rgba = new Uint8ClampedArray(plane * 4).fill(255)
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) rgba[i * 4 + c] = (sample.data[c * plane + i] / 2 + 0.5) * 255
  const canvas = new OffscreenCanvas(SIDE, SIDE)
  canvas.getContext('2d')?.putImageData(new ImageData(rgba, SIDE, SIDE), 0, 0)
  return (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()
}

/**
 * What the check sees in a picture (D275, D280), squashed whole into the squares its two encoders see:
 * Freepik's four levels of nudity, and the areas SigLIP's view of it is close to. On WebGPU where there
 * is one, else WebAssembly, their files downloaded first if they aren't here. @param {{ host: string, bytes: Uint8Array }} data
 */
async function checked({ host, bytes }) {
  const loaded = (checker ??= (async () => {
    const models = await Promise.all(check.FILES.map(([path, hash]) => download(new URL(path, host).href, hash, () => {})))
    // One after the other: ONNX Runtime makes one session on WebGPU at a time, and refuses a second meanwhile.
    const sessions = []
    for (const model of models) sessions.push(await InferenceSession.create(new Uint8Array(model), { executionProviders: ['webgpu', 'wasm'] }))
    return [...sessions, await (await fetch(new URL('./concepts.json', import.meta.url))).json()]
  })().catch((error) => { checker = null; throw error }))
  const picture = await createImageBitmap(new Blob([bytes]))
  const seen = (/** @type {number} */ side, /** @type {number[][]} */ normalization) => {
    const context = /** @type {OffscreenCanvasRenderingContext2D} */ (new OffscreenCanvas(side, side).getContext('2d'))
    context.imageSmoothingQuality = 'high'
    context.drawImage(picture, 0, 0, side, side)
    return new Tensor('float32', check.planes(context.getImageData(0, 0, side, side).data, normalization), [1, 3, side, side])
  }
  const [nudity, siglip, concepts] = await loaded
  const { logits } = await nudity.run({ pixel_values: seen(check.SIDE, check.CLIP) })
  const { pooler_output } = await siglip.run({ pixel_values: seen(check.SIGLIP_SIDE, check.SIGLIP) })
  return { logits: Array.from(/** @type {Float32Array} */ (logits.data)), areas: check.shown(pooler_output.data, concepts) }
}

/**
 * One of TrustMark's sessions (D324), its file downloaded first if it isn't here: on WebGPU with its tensors
 * laid out channels first, where ONNX Runtime's convolution reads the encoder's 6 input channels right (laid
 * out channels last, it misreads any count that is a multiple of 3 but not of 4, in every browser), else
 * WebAssembly; how far its download has come told to the request whose id is given. @param {string} host @param {[string, string, number]} file @param {number} [id]
 */
const sessionOf = (host, [path, hash, total], id) => download(new URL(path, host).href, hash, (loaded) => id && self.postMessage({ id, type: 'progress', loaded, total }))
  .then((model) => InferenceSession.create(new Uint8Array(model), { executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }, 'wasm'] }))
/**
 * A picture squashed to TrustMark's square, −1…1; to be read, its centre's square when one side is more than
 * twice the other, as TrustMark watermarks those (none Jean makes is). @param {ImageBitmap} picture @param {boolean} [reading]
 */
function squared(picture, reading = false) {
  const [width, height, side] = [picture.width, picture.height, watermark.SIDE]
  const square = /** @type {OffscreenCanvasRenderingContext2D} */ (new OffscreenCanvas(side, side).getContext('2d'))
  const crop = reading && Math.max(width, height) > 2 * Math.min(width, height) ? Math.min(width, height) : 0
  square.drawImage(picture, crop ? (width - crop) / 2 : 0, crop ? (height - crop) / 2 : 0, crop || width, crop || height, 0, 0, side, side)
  return watermark.planes(square.getImageData(0, 0, side, side).data)
}

/** A picture with TrustMark's watermark of 100 bits (D324): what the encoder changes in its square is spread over the picture at its size. @param {{ host: string, bytes: Uint8Array, bits: number[] }} data */
async function watermarked({ host, bytes, bits }) {
  const encoder = await (marker ??= sessionOf(host, watermark.FILES[0]).catch((error) => { marker = null; throw error }))
  const picture = await createImageBitmap(new Blob([bytes]))
  const [width, height, side] = [picture.width, picture.height, watermark.SIDE]
  const cover = squared(picture)
  const { image } = await encoder.run({ 'onnx::Concat_0': new Tensor('float32', cover, [1, 3, side, side]), 'onnx::Gemm_1': new Tensor('float32', Float32Array.from(bits), [1, 100]) })
  const whole = /** @type {OffscreenCanvasRenderingContext2D} */ (new OffscreenCanvas(width, height).getContext('2d'))
  whole.drawImage(picture, 0, 0)
  const pixels = whole.getImageData(0, 0, width, height)
  whole.putImageData(new ImageData(watermark.watermarked(pixels.data, width, height, image.data, cover), width, height), 0, 0)
  return (await whole.canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()
}

/** The 100 bits TrustMark's decoder reads in a picture (D324), each set where its output is above 0. @param {{ host: string, bytes: Uint8Array }} data @param {number} id */
async function detected({ host, bytes }, id) {
  const decoder = await (reader ??= sessionOf(host, watermark.DECODER, id).catch((error) => { reader = null; throw error }))
  const { output } = await decoder.run({ image: new Tensor('float32', squared(await createImageBitmap(new Blob([bytes])), true), [1, 3, watermark.SIDE, watermark.SIDE]) })
  return Array.from(/** @type {Float32Array} */ (output.data), (value) => (value > 0 ? 1 : 0))
}
