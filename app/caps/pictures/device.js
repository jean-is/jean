// Pictures made on this device (D251, D263), by the one of three the user chose: SD-Turbo, by
// Stability AI, quick, in one step, in a worker (device-worker.js), through ONNX Runtime on WebNN
// where the browser offers it, else WebGPU; FLUX.2 [klein] 4B, by Black Forest Labs, finer, in four;
// or Z-Image-Turbo, by Alibaba's Tongyi Lab, the finest, words in pictures too, in nine. These two
// run their three stages each in a worker of its own (stage-worker.js) on WebGPU. Their files come
// once, with the user's consent, from the weights host at a pinned revision, checked against their
// SHA-256 as Whistle's are; then private, free and offline. FLUX and Z-Image show the picture as it
// forms, glimpsed after each step (D265). With each comes the check every picture made here goes
// through before it shows (D275), which runs in SD-Turbo's worker.
import { signal } from '@preact/signals-core'
import { app, weightsHost, updateSettings } from '../../ui/state.js'
import { modelWorker, downloading } from '../../ui/model.js'
import { scriptURL } from '../../ui/trusted.js'
import { SIZES } from './flux.js'
import * as check from './check.js'

/** @typedef {[string, string, number]} File path on the weights host, SHA-256, bytes */
/** @typedef {'sd-turbo' | 'flux2-klein' | 'z-image-turbo'} Maker */

const SD = 'schmuell/sd-turbo-ort-web/resolve/ace89b7d2cd849f9a73914cdbb8a3ea60c853dd1/'
const FLUX = 'cgb/flux2-klein-4b-onnx-webgpu/resolve/3bffc0efef1d9f84727036cdbc44df3b6ab51131/'
const Z = 'webnn/Z-Image-Turbo/resolve/02e1d8cc5d10d9ff6c7ed1f54b173bd981381bc2/'
/** SD-Turbo's: the text encoder, the UNet, the VAE's decoder. @type {File[]} */
const TURBO = [
  [`${SD}text_encoder/model.onnx`, '5d1f5bd3286abf26313a9e87db6fd32e47d8b1b2a84ffdf470884c3fe89497c4', 681393168],
  [`${SD}unet/model.onnx`, '7468133d9f7babec9cf6636e160188fe25aad206792c0abdaa722edc676963c4', 1733430199],
  [`${SD}vae_decoder/model.onnx`, 'b37a85f91a982811957abd6cfb617499742309f7b8e253240da3132e533a7605', 99094314],
]
/** FLUX.2 [klein]'s, then Z-Image-Turbo's, by stage: Qwen3's tokenizer, then each graph and its weights in shards a browser can hold. */
const STAGES = {
  'flux2-klein': {
    tokenizer: /** @type {File[]} */ ([
      [`${FLUX}tokenizer/tokenizer.json`, 'aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4', 11422654],
      [`${FLUX}tokenizer/tokenizer_config.json`, '443bfa629eb16387a12edbf92a76f6a6f10b2af3b53d87ba1550adfcf45f7fa0', 5404],
    ]),
    encode: /** @type {File[]} */ ([
      [`${FLUX}text_encoder_q4.onnx`, 'e1670f1d203cf2e5cadecce4b2c13d436eefa228a66b7bc6bc629074e9dc0a1b', 5341471],
      [`${FLUX}text_encoder_q4-00000.data`, 'ed37b81331f4eda3bc150448f2d360b4e42951c57dcb9874ec8d0c7c78fa6f6d', 1599733760],
      [`${FLUX}text_encoder_q4-00001.data`, '89040c34be052e09698afad17bfea3e1158306369612ae347655dfbd4cfa0f3f', 594170880],
    ]),
    denoise: /** @type {File[]} */ ([
      [`${FLUX}transformer_q8.onnx`, '1c56c0b6ce5ce474a5ae5cc126ec3201516540e7f743de308dc07c9e72fb6102', 4991601],
      [`${FLUX}transformer_q8-00000.data`, '80aa4b75cdab0395f4374c51eecb59e005a6f81b3e573dddd9826a865bcd11be', 1585446912],
      [`${FLUX}transformer_q8-00001.data`, '32576185e1f0ab3937141b0c57acad1f37f298c5e7951b3367096c129e5eca28', 1566572544],
      [`${FLUX}transformer_q8-00002.data`, '5062b615c62206a2dad22ce01fec6f674b0421336179cadec93fec77d1b2b455', 981258240],
    ]),
    decode: /** @type {File[]} */ ([
      [`${FLUX}vae_decoder.onnx`, '05f3f6de75b760d5f3b6cbd6efa40ddc8bb7bc4dad58c1dabc85e96383871a7d', 760826],
      [`${FLUX}vae_decoder.onnx.data`, '357f7da253bfb9e3d5762a4f64fd126eae53b8b79466b7da2da2784d5fce89ae', 198508544],
    ]),
  },
  'z-image-turbo': {
    tokenizer: /** @type {File[]} */ ([
      [`${Z}tokenizer/tokenizer.json`, 'aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4', 11422654],
      [`${Z}tokenizer/tokenizer_config.json`, 'd5d09f07b48c3086c508b30d1c9114bd1189145b74e982a265350c923acd8101', 9732],
    ]),
    encode: /** @type {File[]} */ ([
      [`${Z}onnx/text_encoder_model_q4f16.onnx`, '97cb87b20147da5ba44c3666ec17b7d9a1c90cabbaee71649bcb1a374371fb66', 57983622],
      [`${Z}onnx/text_encoder_model_q4f16.onnx_data`, '5a23fd9188f4ac8eb5e0ae3cb9eae970005f869eac499c7048d951db30a04617', 2036236288],
      [`${Z}onnx/text_encoder_model_q4f16.onnx_data_1`, '5c10bbb8670f2605f3bbc11fd302b15c4fdf264a2ac132d4ebec17717196cf6e', 124387328],
    ]),
    denoise: /** @type {File[]} */ ([
      [`${Z}onnx/transformer_model_q4f16.onnx`, 'a19a13c20e040041dd5298bc57e24158fd4bae6ef1127beb26947c23b42ec7ff', 129947430],
      [`${Z}onnx/transformer_model_q4f16.onnx_data`, '19889aa5bce49b5b79b6c736d276797a6e826a7f3cb51f3e71b2d416cbbdebc7', 2032271360],
      [`${Z}onnx/transformer_model_q4f16.onnx_data_1`, '562bfd080c3ebbb5aaf176e47b24a71003403a4e0f9c5344ac85f8e687da1e47', 1507590144],
    ]),
    decode: /** @type {File[]} */ ([
      [`${Z}onnx/vae_decoder_model_f16.onnx`, '7b194f594d893ebcdd9afc6cf06944105fc58493870eb810ee7d4d5c333d8544', 99209498],
    ]),
  },
}
/** The three, the quickest first, the finest last; and their names, as an answer's certificate gives them (D252). */
export const MAKERS = /** @type {Maker[]} */ (['sd-turbo', 'flux2-klein', 'z-image-turbo'])
export const NAMES = { 'sd-turbo': 'SD-Turbo', 'flux2-klein': 'FLUX.2 [klein] 4B', 'z-image-turbo': 'Z-Image-Turbo' }
/** Each one's files, the check's last, which they share. */
const FILES = { 'sd-turbo': [...TURBO, check.FILE], 'flux2-klein': [...Object.values(STAGES['flux2-klein']).flat(), check.FILE], 'z-image-turbo': [...Object.values(STAGES['z-image-turbo']).flat(), check.FILE] }
/** What each weighs. */
export const BYTES = { 'sd-turbo': total(FILES['sd-turbo']), 'flux2-klein': total(FILES['flux2-klein']), 'z-image-turbo': total(FILES['z-image-turbo']) }
function total(/** @type {File[]} */ files) { return files.reduce((sum, [, , bytes]) => sum + bytes, 0) }

/**
 * @typedef {{ state: 'idle' } | { state: 'downloading', loaded: number, total: number }
 *   | { state: 'loading' } | { state: 'ready' } | { state: 'failed', message: string }} Download
 */
/** Each one's download, as it goes. */
export const downloads = /** @type {Record<Maker, import('@preact/signals-core').Signal<Download>>} */ (Object.fromEntries(MAKERS.map((maker) => [maker, signal({ state: 'idle' })])))
/** Those whose files are here, once looked for. */
export const kept = signal(/** @type {Set<Maker>} */ (new Set()))
const turbo = modelWorker(new URL('./device-worker.js', import.meta.url), 'Pictures on this device stopped')
/** SD-Turbo's sessions, loaded once in its worker, its files downloaded first if they aren't here. */
const load = () => turbo.call({ type: 'load', host: weightsHost(), files: TURBO })

/** Those this device can run: WebGPU with 16-bit numbers (or WebNN, for SD-Turbo), and 8 GB of memory, all the browser tells. @returns {Promise<Maker[]>} */
export async function fitting() {
  const nav = /** @type {any} */ (navigator)
  const adapter = await nav.gpu?.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null)
  const f16 = Boolean(adapter?.features.has('shader-f16'))
  return nav.deviceMemory < 8 ? [] : MAKERS.filter((maker) => f16 || (maker === 'sd-turbo' && 'ml' in nav))
}

/** Looks for whose files are here, so making a picture downloads nothing. */
export async function look() {
  const cache = await caches.open('transformers-cache').catch(() => null)
  const here = await Promise.all(MAKERS.map(async (maker) => (await Promise.all(FILES[maker].map(([path]) => cache?.match(new URL(path, weightsHost()).href)))).every(Boolean)))
  kept.value = new Set(MAKERS.filter((_, i) => here[i]))
  return kept.value
}

/** The one that makes pictures: the one chosen if its files are here, else the finest one here. @returns {Maker | undefined} */
export function used() {
  const chosen = /** @type {Maker | undefined} */ (app.settings.value.pictures)
  return chosen && kept.value.has(chosen) ? chosen : MAKERS.findLast((maker) => kept.value.has(maker))
}

/** Makes this one the one that makes pictures. @param {Maker} maker */
export const use = (maker) => updateSettings({ pictures: maker })

/** Downloads one's files (the first time), then makes it the one used. @param {Maker} maker */
export async function prepare(maker) {
  const download = downloads[maker]
  if (download.value.state === 'downloading' || download.value.state === 'loading') return
  download.value = { state: 'downloading', loaded: 0, total: BYTES[maker] }
  navigator.storage?.persist?.().catch(() => {})
  const onMessage = (/** @type {any} */ message) => { download.value = downloading(message, BYTES[maker]) }
  try {
    await stage({ type: 'fetch', files: FILES[maker] }, [], onMessage)
    if (maker === 'sd-turbo') await load()
    download.value = { state: 'ready' }
    kept.value = new Set([...kept.value, maker])
    await use(maker)
  } catch (error) {
    download.value = { state: 'failed', message: error instanceof Error ? error.message : String(error) }
    throw error
  }
}

/** Removes one's files from this device, but for those another one here shares (the check's). @param {Maker} maker */
export async function remove(maker) {
  if (maker === 'sd-turbo') turbo.post({ type: 'unload', id: turbo.id() })
  const cache = await caches.open('transformers-cache')
  const shared = MAKERS.filter((other) => other !== maker && kept.value.has(other)).flatMap((other) => FILES[other])
  await Promise.all(FILES[maker].filter((file) => !shared.includes(file)).map(([path]) => cache.delete(new URL(path, weightsHost()).href)))
  kept.value = new Set([...kept.value].filter((one) => one !== maker))
  downloads[maker].value = { state: 'idle' }
}

/**
 * One of FLUX's or Z-Image's stages, in a worker of its own, ended once it answers: only then does
 * the device get the memory its graph took back. @param {Record<string, unknown>} message @param {Transferable[]} [transfer]
 * @param {(message: any) => void} [onMessage] @returns {Promise<any>}
 */
async function stage(message, transfer = [], onMessage = () => {}) {
  const worker = new Worker(scriptURL(new URL('./stage-worker.js', import.meta.url)), { type: 'module' })
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => (data.type === 'done' ? resolve(data) : data.type === 'error' ? reject(new Error(data.message)) : onMessage(data))
      worker.onerror = (event) => reject(new Error(event.message || 'Pictures on this device stopped'))
      worker.postMessage({ host: weightsHost(), ...message }, transfer)
    })
  } finally {
    worker.terminate()
  }
}

let busy = Promise.resolve()

/**
 * Whether a picture may show (D275): the check, on this device, finds no nudity or sex in it. Its file
 * comes first if it isn't here, as for a picture from a server on this computer. @param {Uint8Array} bytes
 */
export const passes = async (bytes) => (await turbo.call({ type: 'check', host: weightsHost(), bytes })).explicit < check.LIMIT

/** Its size in pixels: SD-Turbo's 512 square, the others' in the shape asked. @param {keyof typeof SIZES} shape */
export const size = (shape) => (used() === 'sd-turbo' ? [512, 512] : SIZES[shape])

/**
 * A picture of a description by the one used, once its files are here, one at a time, as they
 * share the device's memory, in its size; with the name of the one that made it, and glimpses of it
 * as it forms, with how far along it is. @param {string} description @param {keyof typeof SIZES} shape
 * @param {(glimpse: { done: number, bytes: Uint8Array }) => void} [show]
 */
export function paint(description, shape, show = () => {}) {
  const maker = used()
  const made = busy.then(async () => {
    if (maker === 'sd-turbo') {
      await load()
      return /** @type {ArrayBuffer} */ ((await turbo.call({ type: 'paint', prompt: description })).bytes)
    }
    const [width, height] = SIZES[shape]
    const files = STAGES[/** @type {Exclude<Maker, 'sd-turbo'>} */ (maker)]
    const { embeds } = await stage({ maker, type: 'encode', files: files.encode, tokenizer: files.tokenizer, prompt: description })
    const { latent } = await stage({ maker, type: 'denoise', files: files.denoise, embeds, width, height }, [embeds.buffer], show)
    return /** @type {Uint8Array} */ ((await stage({ maker, type: 'decode', files: files.decode, latent, width, height }, [latent.buffer])).bytes)
  })
  busy = made.then(() => {}, () => {})
  return made.then((bytes) => ({ bytes: new Uint8Array(bytes), mimeType: 'image/png', model: NAMES[/** @type {Maker} */ (maker)] }))
}
