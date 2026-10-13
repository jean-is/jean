// The on-device brain: Gemma 4 E2B through Transformers.js and WebGPU, in a worker so
// the page stays responsive. Keeps one KV cache: when the next prompt continues the
// previous one (the frozen prefix of D46 makes that the normal case), only the new
// tokens are read, so a second question about the same document starts at once.
//
// { type: 'load', host, model, dtype }                → progress…, { type: 'ready' }
// { type: 'generate', messages, tools, maxTokens }    → { type: 'chunk', text }…, { type: 'done', usage }
// { type: 'abort', id }                                stops that generation, or drops it while it waits its turn
import { AutoTokenizer, Gemma4ForCausalLM, TextStreamer, InterruptableStoppingCriteria, Tensor } from '../../vendor/transformers/transformers.web.min.js'
import { InferenceSession } from '../../vendor/transformers/ort.webgpu.bundle.min.mjs'
import { weightsFrom } from '../../ui/model-worker.js'

// Transformers.js gives each session the same options, the weights as their addresses in its cache:
// each session reads only the file its graph names, as ONNX Runtime makes it, from a Blob, whose
// size is known, rather than a Response, read in pieces then joined, twice its size for a while.
const create = InferenceSession.create
InferenceSession.create = async function (graph, options = {}) {
  const names = graph instanceof Uint8Array ? new TextDecoder('latin1').decode(graph) : ''
  const externalData = await Promise.all((options.externalData ?? []).filter(({ path }) => names.includes(path)).map(async ({ path, data }) =>
    ({ path, data: data instanceof URL ? await (await caches.match(data.href)).blob() : data })))
  return create.call(this, graph, { ...options, externalData })
}

/** @type {Promise<{ tokenizer: any, model: any }> | null} */
let loading = null
/** What the cache holds: the exact text and tokens read so far. */
let cached = /** @type {{ text: string, ids: number[], cache: any } | null} */ (null)
/** @type {any} */
let stopping = null
let busy = Promise.resolve()
/** The generation under way, and those stopped before their turn: two conversations can be answered at once (D147). */
let current = 0
const dropped = new Set()

self.onmessage = ({ data }) => {
  if (data.type === 'abort') return data.id === current ? stopping?.interrupt() : dropped.add(data.id)
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
      if (dropped.delete(id)) throw Object.assign(new Error('Request aborted'), { code: 'aborted' })
      current = id
      const usage = await generate(data, id).finally(() => { current = 0 })
      self.postMessage({ id, type: 'done', usage })
    }
  } catch (error) {
    if (type === 'load') loading = null
    self.postMessage({ id, type: 'error', message: error?.message ?? String(error), code: error?.code })
  }
}

// Transformers.js would read both weights files whole, then hold them until both sessions are made:
// on a 32 GB Mac the load took 11 GB at its peak, which ends the tab on a phone. Here they go to its
// cache as they come, and each session reads its own from there only while ONNX Runtime makes it,
// which Transformers.js does one at a time: 9 GB at the peak, 7 once loaded (D319).
function load({ host, model, dtype }, id) {
  const progress_callback = weightsFrom(host, id)
  // The weights' two files: the embeddings (1.6 GB in q4f16) and the decoder (1.5 GB).
  loading ??= Promise.all(['embed_tokens', 'decoder_model_merged'].map((part) => weights(`${host.replace(/\/$/, '')}/${model}/resolve/main/onnx/${part}_${dtype}.onnx_data`, progress_callback)))
    .then((externalData) => Promise.all([
      AutoTokenizer.from_pretrained(model, { progress_callback }),
      // The causal-LM class loads the text sessions only; image and audio come later (D42).
      Gemma4ForCausalLM.from_pretrained(model, { dtype, device: 'webgpu', progress_callback, use_external_data_format: false, session_options: { externalData } }),
    ]))
    .then(([tokenizer, model]) => ({ tokenizer, model }))
  return loading
}

/**
 * A weights file in Transformers.js's cache, under the address it gives it, written there as it comes
 * the first time. @param {string} url @param {(event: any) => void} progress
 * @returns {Promise<{ path: string, data: URL }>}
 */
async function weights(url, progress) {
  const cache = await caches.open('transformers-cache')
  const file = url.slice(url.lastIndexOf('/') + 1)
  // A file is kept only once all of it has come.
  const kept = await cache.match(url)
  let total = Number(kept?.headers.get('content-length')) || 0
  if (!kept) {
    const response = await fetch(url)
    if (!response.ok || !response.body) throw new Error(`The weights could not be downloaded (${response.status})`)
    total = Number(response.headers.get('content-length')) || 0
    let loaded = 0
    const counted = response.body.pipeThrough(new TransformStream({ transform: (chunk, out) => {
      progress({ status: 'progress', file, loaded: (loaded += chunk.byteLength), total })
      out.enqueue(chunk)
    } }))
    // As Transformers.js does: a cache may drop the length, which the progress reads.
    const headers = new Headers(response.headers)
    if (total) headers.set('content-length', String(total))
    await cache.put(url, new Response(counted, { headers }))
  }
  progress({ status: 'progress', file, loaded: total, total })
  return { path: file, data: new URL(url) }
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
