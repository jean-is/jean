// EmbeddingGemma 2's text model through Transformers.js: texts in, their meaning out as vectors of
// 768 numbers, each kept in a byte (D302). Its vision and audio encoders aren't loaded.
// { type: 'load', host, model, device, dtype }  → progress…, { type: 'ready' }
// { type: 'embed', texts }                       → { type: 'vectors', vectors: Int8Array, dims }
import { AutoConfig, AutoModel, AutoTokenizer } from '../../vendor/transformers/transformers.web.min.js'
import { weightsFrom } from '../../ui/model-worker.js'

/** @type {Promise<{ tokenizer: any, model: any }> | null} */
let loading = null
let busy = Promise.resolve()

self.onmessage = ({ data }) => {
  // One batch at a time: they share the session.
  busy = busy.then(() => handle(data)).catch(() => {})
}

async function handle(data) {
  const { id, type } = data
  try {
    if (type === 'load') {
      await load(data, id)
      self.postMessage({ id, type: 'ready' })
    } else if (type === 'embed') {
      const { vectors, dims } = await embed(data.texts)
      self.postMessage({ id, type: 'vectors', vectors, dims }, [vectors.buffer])
    }
  } catch (error) {
    if (type === 'load') loading = null
    self.postMessage({ id, type: 'error', message: error?.message ?? String(error) })
  }
}

function load({ host, model, device, dtype }, id) {
  const progress_callback = weightsFrom(host, id)
  loading ??= AutoConfig.from_pretrained(model, { progress_callback }).then((config) => Promise.all([
    AutoTokenizer.from_pretrained(model, { progress_callback }),
    AutoModel.from_pretrained(model, { config: Object.assign(config, { vision_config: null, audio_config: null }), dtype, device, progress_callback }),
  ])).then(([tokenizer, model]) => ({ tokenizer, model }))
  return loading
}

/** @param {string[]} texts */
async function embed(texts) {
  if (!loading) throw new Error('Not loaded')
  const { tokenizer, model } = await loading
  const { sentence_embedding } = await model(tokenizer(texts, { padding: true, truncation: true }))
  const floats = sentence_embedding.normalize(2, -1).to('float32').data
  const dims = sentence_embedding.dims[sentence_embedding.dims.length - 1]
  return { vectors: Int8Array.from(floats, (x) => Math.max(-127, Math.min(127, Math.round(x * 127)))), dims }
}
