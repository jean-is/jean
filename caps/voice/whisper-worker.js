// Speech to text with Whisper through Transformers.js, on WebAssembly. Weights come from
// the host the page passes (settings or policy), and are cached by Transformers.js.
// { type: 'load', host, model, dtype } → { type: 'ready' } (with progress messages)
// { type: 'transcribe', audio, language } → { type: 'result', text }
import { env, pipeline } from '../../vendor/transformers/transformers.web.min.js'

const RUNTIME = new URL('../../vendor/transformers/', import.meta.url)
env.allowLocalModels = false
env.backends.onnx.wasm.wasmPaths = {
  wasm: new URL('ort-wasm-simd-threaded.asyncify.wasm', RUNTIME).href,
  mjs: new URL('ort-wasm-simd-threaded.asyncify.mjs', RUNTIME).href,
}

/** @type {Promise<any> | null} */
let transcriber = null

self.onmessage = async ({ data }) => {
  const { id, type } = data
  try {
    if (type === 'load') {
      transcriber ??= load(data, id)
      await transcriber
      self.postMessage({ id, type: 'ready' })
    } else if (type === 'transcribe') {
      if (!transcriber) throw new Error('Not loaded')
      const run = await transcriber
      const output = await run(data.audio, { language: data.language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 })
      self.postMessage({ id, type: 'result', text: output.text })
    }
  } catch (error) {
    if (type === 'load') transcriber = null
    self.postMessage({ id, type: 'error', message: error?.message ?? String(error) })
  }
}

function load({ host, model, dtype }, id) {
  env.remoteHost = host
  /** @type {Map<string, { loaded: number, total: number }>} */
  const files = new Map()
  return pipeline('automatic-speech-recognition', model, {
    dtype,
    device: 'wasm',
    progress_callback: (event) => {
      if (event.status !== 'progress' || !event.total) return
      files.set(event.file, { loaded: event.loaded, total: event.total })
      let loaded = 0
      let total = 0
      for (const file of files.values()) {
        loaded += file.loaded
        total += file.total
      }
      self.postMessage({ id, type: 'progress', progress: Math.min(loaded / total, 1) })
    },
  })
}
