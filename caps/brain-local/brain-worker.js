// The on-device brain: Gemma 4 E2B through Transformers.js and WebGPU, in a worker so
// the page stays responsive. Keeps one KV cache: when the next prompt continues the
// previous one (the frozen prefix of D46 makes that the normal case), only the new
// tokens are read, so a second question about the same document starts at once.
//
// { type: 'load', host, model, dtype }                → progress…, { type: 'ready' }
// { type: 'generate', messages, tools, maxTokens }    → { type: 'chunk', text }…, { type: 'done', usage }
// { type: 'abort' }                                    stops the current generation
import { env, AutoTokenizer, Gemma4ForCausalLM, TextStreamer, InterruptableStoppingCriteria, Tensor } from '../../vendor/transformers/transformers.web.min.js'

const RUNTIME = new URL('../../vendor/transformers/', import.meta.url)
env.allowLocalModels = false
env.backends.onnx.wasm.wasmPaths = {
  wasm: new URL('ort-wasm-simd-threaded.asyncify.wasm', RUNTIME).href,
  mjs: new URL('ort-wasm-simd-threaded.asyncify.mjs', RUNTIME).href,
}

/** @type {Promise<{ tokenizer: any, model: any }> | null} */
let loading = null
/** What the cache holds: the exact text and tokens read so far. */
let cached = /** @type {{ text: string, ids: number[], cache: any } | null} */ (null)
/** @type {any} */
let stopping = null
let busy = Promise.resolve()

self.onmessage = ({ data }) => {
  if (data.type === 'abort') return stopping?.interrupt()
  // One generation at a time: they share the cache.
  busy = busy.then(() => handle(data)).catch(() => {})
}

async function handle(data) {
  const { id, type } = data
  try {
    if (type === 'load') {
      await load(data, id)
      self.postMessage({ id, type: 'ready' })
    } else if (type === 'generate') {
      const usage = await generate(data, id)
      self.postMessage({ id, type: 'done', usage })
    }
  } catch (error) {
    if (type === 'load') loading = null
    self.postMessage({ id, type: 'error', message: error?.message ?? String(error), code: error?.code })
  }
}

function load({ host, model, dtype }, id) {
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
    // The causal-LM class loads the text sessions only; image and audio come later (D42).
    Gemma4ForCausalLM.from_pretrained(model, { dtype, device: 'webgpu', progress_callback }),
  ]).then(([tokenizer, model]) => ({ tokenizer, model }))
  return loading
}

async function generate({ messages, tools, maxTokens = 4096, contextTokens = 32768 }, id) {
  if (!loading) throw new Error('The brain is not loaded')
  const { tokenizer, model } = await loading
  const text = tokenizer.apply_chat_template(messages, {
    ...(tools?.length && { tools }),
    add_generation_prompt: true,
    tokenize: false,
  })
  let ids
  let reused = 0
  if (cached && text.startsWith(cached.text)) {
    ids = [...cached.ids, ...tokenizer.encode(text.slice(cached.text.length), { add_special_tokens: false })]
    reused = cached.cache.get_seq_length()
  } else {
    await forget()
    ids = tokenizer.encode(text, { add_special_tokens: false }) // the template writes <bos>
  }
  if (ids.length + Math.min(maxTokens, 1024) > contextTokens) {
    throw Object.assign(new Error('This conversation is too long for the on-device brain'), { code: 'too_long' })
  }
  stopping = new InterruptableStoppingCriteria()
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: false,
    callback_function: (chunk) => self.postMessage({ id, type: 'chunk', text: chunk }),
  })
  let result
  try {
    result = await model.generate({
      input_ids: toTensor(ids),
      attention_mask: toTensor(ids.map(() => 1)),
      ...(cached && { past_key_values: cached.cache }),
      max_new_tokens: Math.min(maxTokens, contextTokens - ids.length),
      do_sample: false,
      streamer,
      stopping_criteria: [stopping],
      return_dict_in_generate: true,
    })
  } catch (error) {
    await forget() // the cache may be half updated
    throw error
  } finally {
    stopping = null
  }
  const all = Array.from(result.sequences.data, Number)
  const generated = all.slice(ids.length)
  cached = { text: text + tokenizer.decode(generated, { skip_special_tokens: false }), ids: all, cache: result.past_key_values }
  return { inputTokens: ids.length, outputTokens: generated.length, ...(reused && { cacheReadTokens: reused }) }
}

async function forget() {
  const old = cached
  cached = null
  await old?.cache?.dispose?.()
}

/** @param {number[]} values */
const toTensor = (values) => new Tensor('int64', BigInt64Array.from(values, BigInt), [1, values.length])
