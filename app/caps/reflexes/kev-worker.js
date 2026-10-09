// Kev-0.6B through Transformers.js: every reflex question about one state in a single
// forward pass (D41). Kev scores options instead of writing text, so its graph loads through
// the base PreTrainedModel class, as its model card says, on WebGPU or WebAssembly.
// { type: 'load', host, model, device, dtype }  → progress…, { type: 'ready' }
// { type: 'decide', state, questions }         → { type: 'answers', answers }
import { AutoTokenizer, PreTrainedModel, Tensor } from '../../vendor/transformers/transformers.web.min.js'
import { weightsFrom } from '../../ui/model-worker.js'
import { pack, answers } from '../../core/decide.js'

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
  const progress_callback = weightsFrom(host, id)
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
