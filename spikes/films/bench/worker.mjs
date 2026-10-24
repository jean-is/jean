// Times one graph on WebGPU, its inputs random halves of the shapes it declares, as Jean's stage worker runs one.
// { graph: 'name.onnx', shards: ['name.onnx.data', …], runs } → { load, times, outputs } or { error }
import * as ort from '/ort/ort.webgpu.bundle.min.mjs'

ort.env.wasm.wasmPaths = { wasm: '/ort/ort-wasm-simd-threaded.asyncify.wasm', mjs: '/ort/ort-wasm-simd-threaded.asyncify.mjs' }

const bytes = async (path) => new Uint8Array(await (await fetch(`/graphs/${path}`)).arrayBuffer())

self.onmessage = async ({ data: { graph, shards, runs = 3, inputs } }) => {
  try {
    let t = performance.now()
    const model = await bytes(graph)
    const weights = []
    for (const shard of shards ?? []) weights.push(await bytes(shard))
    const fetched = performance.now() - t
    t = performance.now()
    const session = await ort.InferenceSession.create(model, {
      executionProviders: ['webgpu'],
      externalData: weights.map((data, i) => ({ path: shards[i], data })),
    })
    weights.forEach((w) => w.buffer.transfer?.(0))
    const load = performance.now() - t
    const feeds = {}
    for (const [name, { type, dims }] of Object.entries(inputs)) {
      const count = dims.reduce((a, b) => a * b, 1)
      feeds[name] = type === 'int64'
        ? new ort.Tensor('int64', BigInt64Array.from({ length: count }, () => 999n), dims)
        : new ort.Tensor('float16', new Uint16Array(new Float16Array(Float32Array.from({ length: count }, () => Math.random() * 2 - 1)).buffer), dims)
    }
    const times = []
    let outputs
    for (let i = 0; i < runs; i++) {
      t = performance.now()
      const result = await session.run(feeds)
      times.push(performance.now() - t)
      const [out] = Object.values(result)
      const values = out.type === 'float16' ? new Float16Array(out.data.buffer, out.data.byteOffset, out.data.length) : out.data
      let nan = 0
      for (const v of values) if (!Number.isFinite(v)) nan++
      outputs = { dims: out.dims, nonFinite: nan, first: Array.from(values.slice(0, 4)) }
    }
    await session.release()
    self.postMessage({ fetched, load, times, outputs })
  } catch (error) {
    self.postMessage({ error: String(error?.message ?? error) })
  }
}
