// Pictures made on this device (D251, D263), by the one of three the user chose: SD-Turbo, by
// Stability AI, quick, in one step, in a worker (device-worker.js), through ONNX Runtime on WebNN
// where the browser offers it, else WebGPU; FLUX.2 [klein] 4B, by Black Forest Labs, finer, in four;
// or Z-Image-Turbo, by Alibaba's Tongyi Lab, the finest, words in pictures too, in nine. These two
// run their three stages each in a worker of its own (stage-worker.js) on WebGPU. Their files come
// once, with the user's consent, from the weights host at a pinned revision, checked against their
// SHA-256 as Whistle's are; then private, free and offline. FLUX and Z-Image show the picture as it
// forms, glimpsed after each step (D265). FLUX alone also changes pictures, whichever is chosen, reading
// them with its VAE's encoder (D545). With each comes the check every picture made here goes
// through before it shows (D275, D280), and the watermark it gets once it passes (D324), both run in
// SD-Turbo's worker. Films too, by FastVideo's FastWan 2.2 TI2V-5B (D585), its stages each in a
// worker as theirs, umT5's three graphs a worker each, the film's frames checked as pictures are.
import { signal } from '@preact/signals-core'
import { app, weightsHost, updateSettings } from '../../ui/state.js'
import { modelWorker, downloading, holdStill } from '../../ui/model.js'
import { scriptURL } from '../../ui/trusted.js'
import { SIZES } from './flux.js'
import * as fastwan from './fastwan.js'
import * as check from './check.js'
import * as watermark from './watermark.js'

/** @typedef {[string, string, number]} File path on the weights host, SHA-256, bytes */
/** @typedef {'sd-turbo' | 'flux2-klein' | 'z-image-turbo'} Painter */
/** @typedef {Painter | 'fastwan'} Maker */

const SD = 'schmuell/sd-turbo-ort-web/resolve/ace89b7d2cd849f9a73914cdbb8a3ea60c853dd1/'
const FLUX = 'cgb/flux2-klein-4b-onnx-webgpu/resolve/3bffc0efef1d9f84727036cdbc44df3b6ab51131/'
const Z = 'webnn/Z-Image-Turbo/resolve/02e1d8cc5d10d9ff6c7ed1f54b173bd981381bc2/'
const WAN = 'jean-is/FastWan2.2-TI2V-5B-ONNX/resolve/be5c3e118918b31a600c2e055f33050f904689b1/'
/** One of umT5's three graphs and its weights. @param {string} part @param {string} graph @param {number} size @param {string} data @param {number} bytes @returns {File[]} */
const umt5 = (part, graph, size, data, bytes) => [[`${WAN}text_encoder/layers_${part}.onnx`, graph, size], [`${WAN}text_encoder/layers_${part}.onnx.data0`, data, bytes]]
/** FastWan's (D585): umT5's tokenizer and int8 rows, its three graphs of eight layers, the transformer, TAEHV's decoder. */
const FILM = {
  tokenizer: /** @type {File[]} */ ([
    [`${WAN}tokenizer/tokenizer.json`, '20a46ac256746594ed7e1e3ef733b83fbc5a6f0922aa7480eda961743de080ef', 16837459],
    [`${WAN}tokenizer/tokenizer_config.json`, '1d8d2a216bf8e70ac15b7ddcea566c4dd0433c024b39a58ca5e4c66bd78defbd', 61758],
  ]),
  words: /** @type {File[]} */ ([
    [`${WAN}text_encoder/embedding.i8`, 'c16bb5cb6ceee8c2c98d6c97a62df07b118a147e1bab1490569940beee03b1a1', 1050148864],
    [`${WAN}text_encoder/embedding.scale.f16`, 'd1123e1a4068d463fc50caa7a7ec019130b1aebec0615f0adf30ac2d7caf374c', 512768],
  ]),
  read: [
    umt5('00_08', 'fd1e9d7c4bda31ed74d88983c08b8282cf15fab1dd00ad58d119b743d9ba4746', 719849, '449f8705226ed4a4b5892579df7a29b094ca4d35db6bf2acecdcdc0e5d9d7f99', 1661108224),
    umt5('08_16', '3405cd8d100611be16bf7421ff8dc87f79d14d2aaa493fb483776296df580221', 719849, '0eb2eb013cd2fccdb4169e3ac6d39a27b477fd412d7fd559650c7dd1ed615c3f', 1661108224),
    umt5('16_24', 'a53297f0b15d18a27e305f8ce226e9109f30ae5e4b2a5eae181ce33675f80374', 727980, '991fef11ba13f48548a3b6f9c8346f83a367fdefcb5a9d303bf6e1a7c2461abf', 1661116416),
  ],
  denoise: /** @type {File[]} */ ([
    [`${WAN}transformer/transformer.onnx`, '5df39c609eea2d58491823dbf40d8c46a7dc656f15b1e33f0fb8a9306d354dfd', 4825354],
    [`${WAN}transformer/transformer.onnx.data0`, '20b8dce565b154345f298185d6b435ce9e2896d1d5da6507c8b1d85ac7d895d8', 1899927552],
    [`${WAN}transformer/transformer.onnx.data1`, '6c57e5f05631d4aa3c0c0aa3ea5196e37c9d7dfef9fdd8bc2f338dec3c741e48', 1865023488],
    [`${WAN}transformer/transformer.onnx.data2`, '5fd43b464a08ef32de3af8e982115d5d47dd5ea7006b5e160cb4836c01e6a36a', 1657816064],
  ]),
  decode: /** @type {File[]} */ ([[`${WAN}decoder/taehv.onnx`, 'c5e8c14db186fa72013fb231e3d0315498d119a9a161618f538460ef213e20c0', 20037678]]),
}
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
    see: /** @type {File[]} */ ([
      [`${FLUX}vae_encoder.onnx`, 'f7cc93e70cc3a9555cb7bf1b02d2eaab83d706cf0a4ddf6da86dffb56daf05f9', 596081],
      [`${FLUX}vae_encoder.onnx.data`, '9ac7e0847f5b1a6a077ad38688042a53bc004e986d15dc8c0e37a962aad68671', 137756672],
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
/** The three that make pictures, the quickest first, the finest last, then the one that makes films (D585); and their names, as an answer's certificate gives them (D252). */
export const MAKERS = /** @type {Painter[]} */ (['sd-turbo', 'flux2-klein', 'z-image-turbo'])
export const ALL = /** @type {Maker[]} */ ([...MAKERS, 'fastwan'])
export const NAMES = { 'sd-turbo': 'SD-Turbo', 'flux2-klein': 'FLUX.2 [klein] 4B', 'z-image-turbo': 'Z-Image-Turbo', fastwan: 'FastWan2.2-TI2V-5B' }
/** Each one's files, then the check's and the watermark's (D324), which they share. */
const SHARED = [...check.FILES, ...watermark.FILES]
const FILES = { 'sd-turbo': [...TURBO, ...SHARED], 'flux2-klein': [...Object.values(STAGES['flux2-klein']).flat(), ...SHARED], 'z-image-turbo': [...Object.values(STAGES['z-image-turbo']).flat(), ...SHARED],
  fastwan: [...FILM.tokenizer, ...FILM.words, ...FILM.read.flat(), ...FILM.denoise, ...FILM.decode, ...SHARED] }
/** What each weighs. */
export const BYTES = /** @type {Record<Maker, number>} */ (Object.fromEntries(ALL.map((maker) => [maker, FILES[maker].reduce((sum, [, , bytes]) => sum + bytes, 0)])))

/**
 * @typedef {{ state: 'idle' } | { state: 'downloading', loaded: number, total: number }
 *   | { state: 'loading' } | { state: 'ready' } | { state: 'failed', message: string }} Download
 */
/** Each one's download, as it goes. */
export const downloads = /** @type {Record<Maker, import('@preact/signals-core').Signal<Download>>} */ (Object.fromEntries(ALL.map((maker) => [maker, signal({ state: 'idle' })])))
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
  return nav.deviceMemory < 8 ? [] : ALL.filter((maker) => f16 || (maker === 'sd-turbo' && 'ml' in nav))
}

/** Looks for whose files are here, so making a picture downloads nothing. */
export async function look() {
  const cache = await caches.open('transformers-cache').catch(() => null)
  const here = await Promise.all(ALL.map(async (maker) => (await Promise.all(FILES[maker].map(([path]) => cache?.match(new URL(path, weightsHost()).href)))).every(Boolean)))
  kept.value = new Set(ALL.filter((_, i) => here[i]))
  return kept.value
}

/** The one that makes pictures: the one chosen if its files are here, else the finest one here. @returns {Painter | undefined} */
export function used() {
  const chosen = /** @type {Painter | undefined} */ (app.settings.value.pictures)
  return chosen && kept.value.has(chosen) ? chosen : MAKERS.findLast((maker) => kept.value.has(maker))
}

/** Makes this one the one that makes pictures. @param {Painter} maker */
export const use = (maker) => updateSettings({ pictures: maker })

/** Downloads one's files (the first time), then makes it the one used for pictures, if it makes them. @param {Maker} maker */
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
    if (maker !== 'fastwan') await use(maker)
  } catch (error) {
    download.value = { state: 'failed', message: error instanceof Error ? error.message : String(error) }
    throw error
  }
}

/** Removes one's files from this device, but for those another one here shares (the check's). @param {Maker} maker */
export async function remove(maker) {
  if (maker === 'sd-turbo') turbo.post({ type: 'unload', id: turbo.id() })
  const cache = await caches.open('transformers-cache')
  const shared = ALL.filter((other) => other !== maker && kept.value.has(other)).flatMap((other) => FILES[other])
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

/** What the check refuses besides nudity and sex, unless set otherwise (D275, D280): suggestive pictures not, the rest yes. */
export const REFUSED = { suggestive: false, hate: true, violence: true, selfHarm: true }
/** @typedef {keyof typeof REFUSED} Area */

/**
 * Whether the check refuses an area: as the organisation set it in policy (`pictureCheck`), which locks it, else
 * as the user did, but for self-harm, which only an organisation allows, else as by default. @param {Area} area
 */
export const refuses = (area) => app.policy.pictureCheck?.[area] ?? (area === 'selfHarm' ? undefined : /** @type {any} */ (app.settings.value).pictureCheck?.[area]) ?? REFUSED[area]

/**
 * What a picture shows that the check refuses (D275, D280), on this device: nudity, else an area it refuses, else
 * nothing. Its files come first if they aren't here, as for a picture from a server on this computer.
 * @param {Uint8Array} bytes @returns {Promise<'nudity' | Area | undefined>}
 */
export async function refused(bytes) {
  const { logits, areas } = await holdStill(turbo.call({ type: 'check', host: weightsHost(), bytes }))
  if (check.explicit(logits) >= check.LIMIT) return 'nudity'
  return refuses('suggestive') && check.explicit(logits, true) >= check.LIMIT ? 'suggestive' : /** @type {Area[]} */ (areas).find(refuses)
}

/**
 * A picture with TrustMark's watermark of 100 bits (D324), in SD-Turbo's worker, which the check runs in
 * too, its file downloaded first if it isn't here. @param {Uint8Array} bytes @param {number[]} bits @returns {Promise<Uint8Array>}
 */
export const watermarked = async (bytes, bits) => new Uint8Array((await holdStill(turbo.call({ type: 'watermark', host: weightsHost(), bytes, bits }))).bytes)
/** The 100 bits TrustMark's decoder reads in a picture (D324), its file downloaded the first time. @param {Uint8Array} bytes @returns {Promise<number[]>} */
export const watermarkOf = async (bytes) => (await holdStill(turbo.call({ type: 'detect', host: weightsHost(), bytes }))).bits

/** Its size in pixels: SD-Turbo's 512 square, the others' in the shape asked, a film's FastWan's. @param {keyof typeof SIZES} shape @param {'picture' | 'film'} [kind] */
export const size = (shape, kind) => (kind === 'film' ? fastwan.SIZES[shape] : used() === 'sd-turbo' ? [512, 512] : SIZES[shape])

/**
 * A picture of a description by the one used, or pictures changed by FLUX.2 [klein] (D545), once its files
 * are here, one at a time, as they share the device's memory, in its size; with the name of the one that
 * made it, and glimpses of it as it forms, with how far along it is. @param {string} description @param {keyof typeof SIZES} shape
 * @param {(glimpse: { done: number, bytes: Uint8Array }) => void} [show] @param {Uint8Array[]} [from] the pictures a change starts from
 */
export function paint(description, shape, show = () => {}, from = []) {
  const maker = from.length ? 'flux2-klein' : used()
  const made = holdStill(busy.then(async () => {
    if (maker === 'sd-turbo') {
      await load()
      return /** @type {ArrayBuffer} */ ((await turbo.call({ type: 'paint', prompt: description })).bytes)
    }
    const files = STAGES[/** @type {Exclude<Painter, 'sd-turbo'>} */ (maker)]
    const { embeds } = await stage({ maker, type: 'encode', files: files.encode, tokenizer: files.tokenizer, prompt: description })
    // A change is in the proportions of the first picture it starts from (D545).
    const { seen, sizes, size } = from.length ? await stage({ maker, type: 'see', files: STAGES['flux2-klein'].see, pictures: from }) : {}
    const [width, height] = size ?? SIZES[shape]
    const { latent } = await stage({ maker, type: 'denoise', files: files.denoise, embeds, seen, sizes, width, height }, [embeds.buffer, ...(seen ? [seen.buffer] : [])], show)
    return /** @type {Uint8Array} */ ((await stage({ maker, type: 'decode', files: files.decode, latent, width, height }, [latent.buffer])).bytes)
  }))
  busy = made.then(() => {}, () => {})
  // Its weights' repository and pinned commit, as the answer's certificate names them (D274).
  const revision = { 'sd-turbo': SD, 'flux2-klein': FLUX, 'z-image-turbo': Z }[/** @type {Painter} */ (maker)].replace('/resolve/', '@').slice(0, -1)
  return made.then((bytes) => ({ bytes: new Uint8Array(bytes), mimeType: 'image/png', model: NAMES[/** @type {Painter} */ (maker)], revision }))
}

/**
 * A film of a description by FastWan (D585), once its files are here, one thing at a time as pictures are: 5 seconds in the
 * shape asked, glimpsed after each step; with a frame every half second as PNGs, which the check reads (D275).
 * @param {string} description @param {keyof typeof SIZES} shape @param {(glimpse: { done: number, bytes: Uint8Array }) => void} [show]
 */
export function film(description, shape, show = () => {}) {
  const [width, height] = fastwan.SIZES[shape]
  const made = holdStill(busy.then(async () => {
    let { hidden } = await stage({ maker: 'fastwan', type: 'words', files: FILM.words, tokenizer: FILM.tokenizer, prompt: description })
    for (const files of FILM.read) ({ hidden } = await stage({ maker: 'fastwan', type: 'read', files, hidden }, [hidden.buffer]))
    // The description's own tokens, then none to 512, as Wan's pipelines give them.
    const embeds = new Uint16Array(fastwan.WORDS * 4096)
    embeds.set(hidden)
    const { latent } = await stage({ maker: 'fastwan', type: 'denoise', files: FILM.denoise, decoder: FILM.decode, embeds, width, height }, [embeds.buffer], show)
    return stage({ maker: 'fastwan', type: 'decode', files: FILM.decode, latent, width, height }, [latent.buffer])
  }))
  busy = made.then(() => {}, () => {})
  return made.then(({ bytes, checks }) => ({ bytes: new Uint8Array(bytes), mimeType: 'video/mp4', model: NAMES.fastwan, revision: WAN.replace('/resolve/', '@').slice(0, -1), checks: /** @type {Uint8Array[]} */ (checks) }))
}
