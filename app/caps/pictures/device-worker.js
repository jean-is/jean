// Pictures on this device (D251): SD-Turbo in one step, as in ONNX Runtime's own example: noise at
// the largest sigma, one pass of the UNet guided by the description's CLIP encoding, then the VAE's
// decoder. Through ONNX Runtime from Jean's own copy (D52), on WebNN where the browser offers it,
// else WebGPU; its files from the host the page passes (D53), one after another, so only one is
// held while it is read. Every picture made on this device, or by a server on this computer, is
// checked here before it shows (D275).
//
// { type: 'load', host, files }   → progress…, { type: 'ready' }
// { type: 'paint', prompt }       → { type: 'done', bytes }, a PNG
// { type: 'unload' }              → { type: 'done' }, its sessions let go, as its files are removed (D263)
// { type: 'check', host, bytes }  → { type: 'done', logits }, the check's four levels for the picture
import { InferenceSession, Tensor } from '../../vendor/transformers/ort.webgpu.bundle.min.mjs'
import { AutoTokenizer } from '../../vendor/transformers/transformers.web.min.js'
import { weightsFrom } from '../../ui/model-worker.js'
import { download } from '../../ui/weights.js'
import * as check from './check.js'

const SIGMA = 14.6146 // the scheduler's largest, at timestep 999
const SCALE = 0.18215 // the VAE's latent scaling
const SIDE = 512
// Each file's free dimensions, fixed: one picture, 64 × 64 latents, CLIP's 77 tokens.
const DIMENSIONS = [{ batch_size: 1 }, { batch_size: 1, num_channels: 4, height: 64, width: 64, sequence_length: 77 },
  { batch_size: 1, num_channels_latent: 4, height_latent: 64, width_latent: 64 }]

/** @type {Promise<{ tokenizer: any, sessions: any[] }> | null} */
let loading = null
/** @type {Promise<any> | null} the check's session, kept for the next picture */
let checker = null
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
      self.postMessage({ id, type: 'done', logits: await levels(data) })
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
 * The check's levels for a picture (D275), squashed whole into the square the check sees: on
 * WebGPU where there is one, else WebAssembly, its file downloaded first if it isn't here.
 * @param {{ host: string, bytes: Uint8Array }} data
 */
async function levels({ host, bytes }) {
  const session = (checker ??= download(new URL(check.FILE[0], host).href, check.FILE[1], () => {})
    .then((model) => InferenceSession.create(new Uint8Array(model), { executionProviders: ['webgpu', 'wasm'] }))
    .catch((error) => { checker = null; throw error }))
  const context = /** @type {OffscreenCanvasRenderingContext2D} */ (new OffscreenCanvas(check.SIDE, check.SIDE).getContext('2d'))
  context.imageSmoothingQuality = 'high'
  context.drawImage(await createImageBitmap(new Blob([bytes])), 0, 0, check.SIDE, check.SIDE)
  const pixels = check.planes(context.getImageData(0, 0, check.SIDE, check.SIDE).data)
  const { logits } = await (await session).run({ pixel_values: new Tensor('float32', pixels, [1, 3, check.SIDE, check.SIDE]) })
  return Array.from(/** @type {Float32Array} */ (logits.data))
}
