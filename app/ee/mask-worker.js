// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// People's names on this device (D681, names.js): a token classifier through Transformers.js, one thread of WebAssembly,
// reading logits rather than its pipeline, whose shape changes between versions and which can't say where a token is.
// { type: 'load', host, model, revision } → progress…, { type: 'ready' }
// { type: 'read', text }                 → { type: 'read', flagged: [start, end, chance][] }
import { AutoTokenizer, AutoModelForTokenClassification, Tensor } from '../vendor/transformers/transformers.web.min.js'
import { weightsFrom } from '../ui/model-worker.js'
import { align, FLOOR, windowsOf } from './names.js'

/** @type {Promise<{ tokenizer: any, model: any, person: boolean[] }> | null} */
let loading = null
let busy = Promise.resolve()

self.onmessage = ({ data }) => {
  // One pass at a time: they share the session.
  busy = busy.then(() => handle(data)).catch(() => {})
}

/** @param {any} data */
async function handle(data) {
  const { id, type } = data
  try {
    if (type === 'load') {
      await load(data, id)
      self.postMessage({ id, type: 'ready' })
    } else if (type === 'read') {
      self.postMessage({ id, type: 'read', flagged: await read(data.text) })
    }
  } catch (error) {
    if (type === 'load') loading = null
    self.postMessage({ id, type: 'error', message: /** @type {Error} */ (error)?.message ?? String(error) })
  }
}

/** @param {{ host: string, model: string, revision: string }} data @param {number} id */
function load({ host, model, revision }, id) {
  const progress_callback = weightsFrom(host, id)
  loading ??= Promise.all([
    AutoTokenizer.from_pretrained(model, { revision, progress_callback }),
    AutoModelForTokenClassification.from_pretrained(model, { revision, dtype: 'q4', device: 'wasm', progress_callback }),
  ]).then(([tokenizer, loaded]) => {
    const labels = /** @type {Record<string, string>} */ (loaded.config.id2label)
    const person = Object.keys(labels).sort((a, b) => Number(a) - Number(b)).map((i) => /^[BI]-(?:GIVEN_NAME|SURNAME)$/.test(labels[i]))
    return { tokenizer, model: loaded, person }
  })
  return loading
}

/** Each token that may be part of a name, with its chance. @param {string} text @returns {Promise<[number, number, number][]>} */
async function read(text) {
  if (!loading) throw new Error('Not loaded')
  if (!text.trim()) return []
  const { tokenizer, model, person } = await loading
  // As it was trained: a hyphen reads as a space, one for one, so places don't move.
  const input = text.replaceAll('-', ' ')
  const ids = Array.from(tokenizer(input, { add_special_tokens: false }).input_ids.data, Number)
  if (!ids.length) return []
  const tokens = tokenizer.tokenize(input)
  if (tokens.length !== ids.length) throw new Error(`The tokenizer gave ${tokens.length} tokens and ${ids.length} ids`)
  const offsets = align(input, tokens)
  // What it puts around a text: its config names no special tokens.
  const framed = Array.from(tokenizer('a', { add_special_tokens: true }).input_ids.data, Number)
  const [first, last] = [framed[0], framed[framed.length - 1]]
  const chances = new Float32Array(ids.length)
  const depths = new Int32Array(ids.length).fill(-1)
  for (const [start, end] of windowsOf(ids.length)) {
    const slice = [first, ...ids.slice(start, end), last]
    const { logits } = await model({
      input_ids: new Tensor('int64', BigInt64Array.from(slice, BigInt), [1, slice.length]),
      attention_mask: new Tensor('int64', new BigInt64Array(slice.length).fill(1n), [1, slice.length]),
    })
    const scores = logits.type === 'float32' ? logits.data : logits.to('float32').data
    const labels = logits.dims[2]
    for (let i = start; i < end; i++) {
      // Each token keeps its reading from the window where it sits furthest from an edge.
      const depth = Math.min(i - start, end - 1 - i)
      if (depth <= depths[i]) continue
      depths[i] = depth
      const at = (i - start + 1) * labels
      let top = -Infinity
      for (let label = 0; label < labels; label++) top = Math.max(top, scores[at + label])
      let [sum, chance] = [0, 0]
      for (let label = 0; label < labels; label++) {
        const score = Math.exp(scores[at + label] - top)
        sum += score
        if (person[label]) chance += score
      }
      chances[i] = chance / sum
    }
  }
  /** @type {[number, number, number][]} */
  const flagged = []
  for (let i = 0; i < ids.length; i++) if (chances[i] >= FLOOR && offsets[i][1] > offsets[i][0]) flagged.push([offsets[i][0], offsets[i][1], Math.round(chances[i] * 1e5) / 1e5])
  return flagged
}
