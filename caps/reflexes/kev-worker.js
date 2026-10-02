// Kev-0.6B through Transformers.js: every reflex question about one state in a single
// forward pass (D41). Kev scores options instead of writing text, so its graph loads through
// the base PreTrainedModel class, as its model card says, on WebGPU or WebAssembly.
// { type: 'load', host, model, device, dtype }  → progress…, { type: 'ready' }
// { type: 'decide', state, questions }         → { type: 'answers', answers }
import { env, AutoTokenizer, PreTrainedModel, Tensor } from '../../vendor/transformers/transformers.web.min.js'
import { pack, answers } from '../../core/decide.js'

const RUNTIME = new URL('../../vendor/transformers/', import.meta.url)
env.allowLocalModels = false
env.backends.onnx.wasm.wasmPaths = {
  wasm: new URL('ort-wasm-simd-threaded.asyncify.wasm', RUNTIME).href,
  mjs: new URL('ort-wasm-simd-threaded.asyncify.mjs', RUNTIME).href,
}

/** @type {Promise<{ tokenizer: any, model: any }> | null} */
let loading = null
let busy = Promise.resolve()

self.onmessage = ({ data }) => {
  // One pass at a time: they share the session.
  busy = busy.then(() => handle(data)).catch(() => {})
}

async function handle(data) {
  const { id, type } = data
  try {
    if (type === 'load') {
      await load(data, id)
      self.postMessage({ id, type: 'ready' })
    } else if (type === 'decide') {
      self.postMessage({ id, type: 'answers', answers: await decide(data) })
    }
  } catch (error) {
    if (type === 'load') loading = null
    self.postMessage({ id, type: 'error', message: error?.message ?? String(error) })
  }
}

function load({ host, model, device, dtype }, id) {
  env.remoteHost = host
  /** @type {Map<string, { loaded: number, total: number }>} */
  const files = new Map()
  const progress_callback = (event) => {
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
  loading ??= Promise.all([
    AutoTokenizer.from_pretrained(model, { progress_callback }),
    PreTrainedModel.from_pretrained(model, { dtype, device, progress_callback }),
  ]).then(([tokenizer, model]) => ({ tokenizer, model }))
  return loading
}

async function decide({ state, questions }) {
  if (!loading) throw new Error('Not loaded')
  const { tokenizer, model } = await loading
  const encode = (text) => Array.from(tokenizer(text, { add_special_tokens: false }).input_ids.data, Number)
  const { ids, ends } = pack(state, questions, encode)
  const { logits } = await model({
    input_ids: new Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    attention_mask: new Tensor('int64', new BigInt64Array(ids.length).fill(1n), [1, ids.length]),
  })
  const scores = logits.type === 'float32' ? logits.data : logits.to('float32').data
  return answers(questions, ends, scores)
}
