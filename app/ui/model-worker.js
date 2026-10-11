// A model's worker's side (the device's brain, Intuition, dictation): Transformers.js from Jean's
// own copy, never a CDN (D52), and the weights from the host the page passes (D53).
import { env } from '../vendor/transformers/transformers.web.min.js'

const RUNTIME = new URL('../vendor/transformers/', import.meta.url)
env.allowLocalModels = false
// ONNX Runtime streams its WebAssembly from the file, which Chrome keeps compiled once it has run
// (D287), rather than from bytes Transformers.js would read itself, which it compiles every time.
env.useWasmCache = false
env.backends.onnx.wasm.wasmPaths = {
  wasm: new URL('ort-wasm-simd-threaded.asyncify.wasm', RUNTIME).href,
  mjs: new URL('ort-wasm-simd-threaded.asyncify.mjs', RUNTIME).href,
}

/**
 * Weights from this host, and the callback that reports to the page what of all their files has
 * come: `{ id, type: 'progress', loaded, total }`. @param {string} host @param {number} id
 */
export function weightsFrom(host, id) {
  env.remoteHost = host
  const files = new Map()
  return (event) => {
    if (event.status !== 'progress' || !event.total) return
    files.set(event.file, { loaded: event.loaded, total: event.total })
    let loaded = 0
    let total = 0
    for (const file of files.values()) {
      loaded += file.loaded
      total += file.total
    }
    self.postMessage({ id, type: 'progress', loaded, total })
  }
}
