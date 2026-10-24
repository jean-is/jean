// FastWan 2.2 TI2V-5B in Jean's runtime, a stage in each worker, as Jean's picture makers run (stage-worker.js):
// ONNX Runtime from Jean's own copy, on WebGPU, the page ending the worker once it answers.
// { type: 'encode', prompt, layers: [graph, shards][] }        → { ids, embeds (Float32 [512 × 4096]), ms }
// { type: 'denoise', embeds, noises, steps, sigmas, shape, dit } → { x0s (Float32 each step), ms }
// { type: 'decode', latent, shape, tae }                         → { frames (Uint8 RGB [T, H, W, 3]), ms }
import * as ort from '/vendor/transformers/ort.webgpu.bundle.min.mjs'
import { T5Tokenizer } from '/vendor/transformers/transformers.web.min.js'

ort.env.wasm.wasmPaths = { wasm: '/vendor/transformers/ort-wasm-simd-threaded.asyncify.wasm', mjs: '/vendor/transformers/ort-wasm-simd-threaded.asyncify.mjs' }
const Half = globalThis.Float16Array
const bytes = async (url, range) => new Uint8Array(await (await fetch(url, range && { headers: { Range: `bytes=${range[0]}-${range[1] - 1}` } })).arrayBuffer())
const halves = (values) => new Uint16Array(new Half(values).buffer)
const numbers = (data) => Float32Array.from(data instanceof Uint16Array ? new Half(data.buffer, data.byteOffset, data.length) : data)

/** A session from a graph and its shards, timed: what fetching and creating took. */
async function session([graph, shards = []], ms, label) {
  let t = performance.now()
  const model = await bytes(graph)
  const weights = []
  for (const shard of shards) weights.push(await bytes(shard))
  ms[`${label}.fetch`] = (ms[`${label}.fetch`] ?? 0) + performance.now() - t
  t = performance.now()
  const created = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'], externalData: weights.map((data, i) => ({ path: shards[i].split('/').pop(), data })) })
  weights.forEach((w) => w.buffer.transfer?.(0))
  ms[`${label}.create`] = (ms[`${label}.create`] ?? 0) + performance.now() - t
  return created
}

/** Latents [1, C, T, H, W] as tokens (t, h/2, w/2), each its C × 2 × 2 values in the Conv3d's order (c, ph, pw). */
function patchify(x, [, c, t, h, w]) {
  const out = new Float32Array(x.length)
  let o = 0
  for (let ti = 0; ti < t; ti++) for (let hi = 0; hi < h; hi += 2) for (let wi = 0; wi < w; wi += 2)
    for (let ci = 0; ci < c; ci++) for (let ph = 0; ph < 2; ph++) for (let pw = 0; pw < 2; pw++) out[o++] = x[((ci * t + ti) * h + hi + ph) * w + wi + pw]
  return out
}

/** The graph's tokens back to latents [1, C, T, H, W], each token's 192 values in the order (ph, pw, c). */
function unpatchify(tokens, [, c, t, h, w]) {
  const out = new Float32Array(tokens.length)
  let o = 0
  for (let ti = 0; ti < t; ti++) for (let hi = 0; hi < h; hi += 2) for (let wi = 0; wi < w; wi += 2)
    for (let ph = 0; ph < 2; ph++) for (let pw = 0; pw < 2; pw++) for (let ci = 0; ci < c; ci++) out[((ci * t + ti) * h + hi + ph) * w + wi + pw] = tokens[o++]
  return out
}

const STAGES = {
  /** The prompt's tokens, their int8 rows looked up, then umT5's layers graph after graph; padded with zeros to 512. */
  async encode({ prompt, layers }) {
    const ms = {}
    let t = performance.now()
    const [json, config] = await Promise.all(['/tokenizer/tokenizer.json', '/tokenizer/tokenizer_config.json'].map((u) => fetch(u).then((r) => r.json())))
    const ids = new T5Tokenizer(json, config)(prompt, { add_special_tokens: true, truncation: true, max_length: 512, return_tensor: false }).input_ids
    ms.tokenize = performance.now() - t
    t = performance.now()
    const n = ids.length
    const hidden = new Float32Array(n * 4096)
    for (const [i, id] of ids.entries()) {
      const [row, scale] = await Promise.all([bytes('/real/umt5/embedding.i8', [id * 4096, id * 4096 + 4096]), bytes('/real/umt5/embedding.scale.f16', [id * 2, id * 2 + 2])])
      const s = new Half(scale.buffer)[0]
      const signed = new Int8Array(row.buffer)
      for (let j = 0; j < 4096; j++) hidden[i * 4096 + j] = signed[j] * s
    }
    ms.embed = performance.now() - t
    let x = new ort.Tensor('float16', halves(hidden), [1, n, 4096])
    for (const [k, part] of layers.entries()) {
      const s = await session(part, ms, 'layers')
      t = performance.now()
      x = (await s.run({ hidden: x })).out
      // a piece ends on the fp32 residual stream (transformers keeps `wo` in fp32); the next takes halves
      if (x.type === 'float32' && k + 1 < layers.length) x = new ort.Tensor('float16', halves(x.data), x.dims)
      ms[`layers.run${k}`] = performance.now() - t
      await s.release()
    }
    const embeds = new Float32Array(512 * 4096)
    embeds.set(numbers(x.data))
    return { ids, embeds, ms }
  },

  /**
   * FastVideo's DMD sampler: each step's clean video x0 = x − σv, then noised again to the next step. With
   * `tokens`, the graph takes and gives patches [1, N, 192], its four-dimensional form for WebKit (export_tokens.py).
   */
  async denoise({ embeds, noises, steps, sigmas, shape, dit, tokens }) {
    const ms = {}
    const s = await session(dit, ms, 'dit')
    const text = new ort.Tensor('float16', halves(embeds), [1, 512, 4096])
    let x = noises[0]
    const x0s = []
    for (const [i, t] of steps.entries()) {
      const begun = performance.now()
      const input = tokens ? { patches: new ort.Tensor('float16', halves(patchify(x, shape)), [1, x.length / 192, 192]) } : { latents: new ort.Tensor('float16', halves(x), shape) }
      const { [s.outputNames[0]]: out } = await s.run({ ...input, timestep: new ort.Tensor('int64', BigInt64Array.of(BigInt(t)), [1]), text })
      const v = tokens ? unpatchify(numbers(out.data), shape) : numbers(out.data)
      const x0 = new Float32Array(x.length)
      for (let j = 0; j < x.length; j++) x0[j] = x[j] - sigmas[i] * v[j]
      x0s.push(x0)
      if (i + 1 < steps.length) {
        const next = new Float32Array(x.length)
        for (let j = 0; j < x.length; j++) next[j] = sigmas[i + 1] * noises[i + 1][j] + (1 - sigmas[i + 1]) * x0[j]
        x = next
      }
      ms[`dit.step${i}`] = performance.now() - begun
    }
    await s.release()
    return { x0s, ms }
  },

  /** TAEHV: latents [1, 48, T, H, W] turned to [1, T, 48, H, W] (or [T, 48, H, W] with `tokens`), then frames in 0…1 as RGB bytes. */
  async decode({ latent, shape, tae, tokens }) {
    const ms = {}
    const [, c, t, h, w] = shape
    const turned = new Float32Array(latent.length)
    for (let ci = 0; ci < c; ci++) for (let ti = 0; ti < t; ti++) turned.set(latent.subarray((ci * t + ti) * h * w, (ci * t + ti + 1) * h * w), (ti * c + ci) * h * w)
    const s = await session(tae, ms, 'tae')
    let begun = performance.now()
    const { [s.outputNames[0]]: out } = await s.run({ latents: new ort.Tensor('float16', halves(turned), tokens ? [t, c, h, w] : [1, t, c, h, w]) })
    ms['tae.run'] = performance.now() - begun
    begun = performance.now()
    const [frames, , height, width] = out.dims.slice(-4)
    const values = new Half(out.data.buffer, out.data.byteOffset, out.data.length)
    const rgb = new Uint8Array(frames * height * width * 3)
    const plane = height * width
    for (let f = 0; f < frames; f++) for (let ch = 0; ch < 3; ch++) {
      const from = (f * 3 + ch) * plane
      for (let p = 0; p < plane; p++) rgb[(f * plane + p) * 3 + ch] = Math.round(Math.min(1, Math.max(0, values[from + p])) * 255)
    }
    ms['tae.toBytes'] = performance.now() - begun
    await s.release()
    return { frames: rgb, dims: [frames, height, width], ms }
  },
}

self.onmessage = async ({ data: { type, ...data } }) => {
  try {
    const done = await STAGES[type](data)
    self.postMessage({ type: 'done', ...done })
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error?.message ?? error) })
  }
}
