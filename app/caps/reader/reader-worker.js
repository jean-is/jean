// The natural voice's worker (D455): Kyutai's Pocket TTS through ONNX Runtime on WebAssembly, from Jean's
// own copy (D52), one language loaded at a time. Its files come from the weights host the page passes
// (D53): a manifest pinned by SHA-256, which pins the rest, a binary for the decoder all languages share and
// one per language (its graphs, their weights as 8-bit numbers expanded here to fp32, its voice, its
// tokenizer). It generates as pocket-tts 4.0.0 does, a latent frame at a time from the voice's state, and
// posts the audio as it is decoded: the first after two frames, then every four, then every twelve.
//
// { type: 'load', host, manifest, lang } → progress…, { type: 'ready' }
// { type: 'speak', host, manifest, text, lang } → chunk…, { type: 'done' }; { type: 'abort', of } ends one early
import { InferenceSession, Tensor, env } from '../../vendor/transformers/ort.webgpu.bundle.min.mjs'
import { download } from '../../ui/weights.js'
import { expand, tokenizer, chunks } from './pocket.js'

const RUNTIME = new URL('../../vendor/transformers/', import.meta.url)
env.wasm.wasmPaths = { wasm: new URL('ort-wasm-simd-threaded.asyncify.wasm', RUNTIME).href, mjs: new URL('ort-wasm-simd-threaded.asyncify.mjs', RUNTIME).href }
const ARRAYS = { float32: Float32Array, int64: BigInt64Array, bool: Uint8Array }

/** @type {{ host: string, manifest: any, decoder: any } | null} */
let shared = null
/** @type {Promise<any> | null} the language loaded: its sessions, voice, tokenizer and rules */
let current = null
const aborted = new Set()
/** The request under way: one at a time, as a session runs one at a time, so a reading waits for the one it stopped. */
let busy = Promise.resolve()

self.onmessage = ({ data: { id, type, ...data } }) => {
  if (type === 'abort') return void aborted.add(data.of)
  busy = busy.then(() => (type === 'load' ? language(data, id) : speak(data, id)))
    .then(() => self.postMessage({ id, type: type === 'load' ? 'ready' : 'done' }), (error) => self.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : String(error) }))
    .then(() => void aborted.delete(id))
}

/** A graph's session, its weights expanded first. @param {ArrayBuffer} bin @param {any} graph @param {string} name */
const session = (bin, graph, name) => InferenceSession.create(new Uint8Array(bin, graph.graph[0], graph.graph[1]), { executionProviders: ['wasm'], externalData: [{ path: `${name}.f32`, data: expand(bin, graph) }] })

/**
 * The language's sessions, voice, tokenizer and rules, downloaded the first time (with the manifest and
 * the decoder), the language loaded before let go. @param {{ host: string, manifest: [string, string, number], lang: string }} data @param {number} id
 */
async function language({ host, manifest: pinned, lang }, id) {
  const loaded = await current?.catch(() => null)
  if (loaded?.lang === lang) return loaded
  await Promise.all(Object.values(loaded?.sessions ?? {}).map((s) => /** @type {any} */ (s).release()))
  current = (async () => {
    const base = new URL(pinned[0], host)
    if (!shared || shared.host !== host) shared = { host, manifest: JSON.parse(new TextDecoder().decode(await download(base.href, pinned[1], () => {}))), decoder: null }
    const { manifest } = shared
    const entry = manifest.languages[lang]
    const total = manifest.files[entry.file][1] + (shared.decoder ? 0 : manifest.files['decoder.bin'][1])
    const got = [0, 0]
    const file = (/** @type {string} */ name, /** @type {number} */ i) => download(new URL(name, base).href, manifest.files[name][0], (bytes) => self.postMessage({ id, type: 'progress', loaded: (got[i] = bytes, got[0] + got[1]), total }))
    const [decoder, bin] = await Promise.all([shared.decoder ? null : file('decoder.bin', 0), file(entry.file, 1)])
    shared.decoder ??= await session(/** @type {ArrayBuffer} */ (decoder), manifest.decoder, 'mimi_decoder')
    /** @type {Record<string, any>} */
    const sessions = {}
    for (const name of ['text_conditioner', 'flow_lm_main', 'flow_lm_flow']) sessions[name] = await session(bin, entry.graphs[name], name)
    const tokens = tokenizer(JSON.parse(new TextDecoder().decode(new Uint8Array(bin, entry.tokenizer[0], entry.tokenizer[1]))))
    const [at, length] = entry.voice
    /** @type {Record<string, Float32Array | BigInt64Array>} the voice's state: each layer's keys and values for its prompt, NaN after */
    const voice = {}
    for (const e of manifest.flow) {
      const layer = Number(/layers\.(\d+)\./.exec(e.module)?.[1])
      if (e.key === 'step') voice[e.input_name] = BigInt64Array.of(BigInt(length))
      if (e.key !== 'cache') continue
      const cache = new Float32Array(e.shape.reduce((/** @type {number} */ a, /** @type {number} */ b) => a * b)).fill(NaN)
      const each = length * 16 * 64
      for (let kv = 0; kv < 2; kv++) cache.set(new Float32Array(bin, at + (layer * 2 + kv) * each * 4, each), kv * e.shape[2] * 16 * 64)
      voice[e.input_name] = cache
    }
    return { lang, sessions, tokens, voice, rules: entry.rules }
  })()
  current.catch(() => { current = null })
  return current
}

/** Fresh tensors for a manifest's state, from these arrays where given. @param {any[]} manifest @param {Record<string, any>} [from] */
const state = (manifest, from = {}) => Object.fromEntries(manifest.map((e) => {
  const size = e.shape.reduce((/** @type {number} */ a, /** @type {number} */ b) => a * b, 1)
  const T = ARRAYS[/** @type {keyof typeof ARRAYS} */ (e.dtype)]
  const data = from[e.input_name] ?? (e.dtype === 'int64' ? new BigInt64Array(size) : new T(size).fill(e.fill === 'nan' ? NaN : e.fill === 'ones' ? 1 : 0))
  return [e.input_name, new Tensor(e.dtype, data, e.shape)]
}))

/** @param {{ host: string, manifest: [string, string, number], text: string, lang: string }} data @param {number} id */
async function speak(data, id) {
  const voice = await language(data, id)
  for (const { ids, after } of chunks(data.text, voice.tokens, voice.rules)) {
    if (aborted.has(id)) return
    await say(voice, ids, after, id)
  }
}

/**
 * One chunk, from the voice's state: frames until a little after the model says it is done, decoded as they come.
 * @param {any} voice @param {number[]} ids @param {number} after frames to go on once it says it is done @param {number} id
 */
async function say({ sessions, voice, rules }, ids, after, id) {
  const { manifest, decoder } = /** @type {NonNullable<typeof shared>} */ (shared)
  let flow = state(manifest.flow, voice)
  const step = async (/** @type {Float32Array} */ sequence, /** @type {any} */ text) => {
    const out = await sessions.flow_lm_main.run({ sequence: new Tensor('float32', sequence, [1, sequence.length / 32, 32]), text_embeddings: text, ...flow })
    flow = Object.fromEntries(manifest.flow.map((/** @type {any} */ e) => [e.input_name, out[e.output_name]]))
    return out
  }
  const { embeddings } = await sessions.text_conditioner.run({ token_ids: new Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]) })
  await step(new Float32Array(0), embeddings)
  const none = new Tensor('float32', new Float32Array(0), [1, 0, 1024])
  let mimi = state(manifest.mimi)
  /** @type {Float32Array[]} */
  const pending = []
  let [decoded, end, previous] = [0, -1, new Float32Array(32).fill(NaN)]
  const decode = async () => {
    const latent = new Float32Array(pending.length * 32)
    pending.forEach((x, i) => latent.set(x, i * 32))
    const out = await decoder.run({ latent: new Tensor('float32', latent, [1, pending.length, 32]), ...mimi })
    mimi = Object.fromEntries(manifest.mimi.map((/** @type {any} */ e) => [e.input_name, out[e.output_name]]))
    const audio = /** @type {Float32Array} */ (out.audio_frame.data).slice()
    // A fresh decoder starts with a small step: faded in over 5 ms, as Kyutai's own does.
    if (!decoded) for (let i = 0; i < Math.min(120, audio.length); i++) audio[i] *= i / 120
    decoded += pending.length
    pending.length = 0
    self.postMessage({ id, type: 'chunk', audio, rate: manifest.rate }, { transfer: [audio.buffer] })
  }
  const limit = Math.ceil((ids.length / 3 + 2) * 12.5)
  for (let frame = 0; frame < limit && !aborted.has(id); frame++) {
    const out = await step(previous, none)
    if (out.eos_logit.data[0] > -4 && end < 0 && frame >= 6) end = frame
    if (end >= 0 && frame >= end + after) break
    const x = Float32Array.from({ length: 32 }, () => normal() * Math.sqrt(rules.temperature))
    const { flow_dir } = await sessions.flow_lm_flow.run({ c: out.conditioning, s: new Tensor('float32', [0], [1, 1]), t: new Tensor('float32', [1], [1, 1]), x: new Tensor('float32', x, [1, 32]) })
    for (let i = 0; i < 32; i++) x[i] += flow_dir.data[i]
    pending.push((previous = x))
    if (pending.length >= (decoded === 0 ? 2 : decoded < 24 ? 4 : 12)) await decode()
    await breathe()
  }
  if (pending.length) await decode()
}

/**
 * A turn of the worker's event loop, so that an abort posted meanwhile is read: ONNX Runtime's runs settle
 * without one, and a reading stopped would otherwise go on to its end before the next could start.
 */
const breathe = () => new Promise((resolve) => { const channel = new MessageChannel(); channel.port1.onmessage = resolve; channel.port2.postMessage(null) })

/** Standard normal noise (Box–Muller). */
const normal = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
