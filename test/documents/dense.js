// Dense retrieval for the evals: passages and questions embedded by an open model through
// Transformers.js (on this computer's CPU, as npm run reflexes runs Kev), kept as flat Int8 vectors.
// Eval code only: it moves into the app if the answer eval says it earns its place (H4).

/** The embedders compared, with how each wants its texts and its vectors pooled. */
export const MODELS = {
  e5: { id: 'Xenova/multilingual-e5-small', dtype: 'q8', pooling: 'mean', query: (/** @type {string} */ t) => `query: ${t}`, passage: (/** @type {string} */ t) => `passage: ${t}` },
  qwen3: { id: 'onnx-community/Qwen3-Embedding-0.6B-ONNX', dtype: 'q8', pooling: 'last_token', query: (/** @type {string} */ t) => `Instruct: Given a question, retrieve the passages of a company's documents that answer it\nQuery: ${t}`, passage: (/** @type {string} */ t) => t },
}

/** @type {Map<string, Promise<any>>} */
const pipelines = new Map()

/**
 * Normalised embeddings of texts, as one Float32Array per text.
 * @param {keyof typeof MODELS} name @param {string[]} texts @param {'query' | 'passage'} kind
 * @param {(done: number) => void} [progress]
 */
export async function embed(name, texts, kind, progress = () => {}, batch = 16) {
  const model = MODELS[name]
  if (!pipelines.has(name)) {
    pipelines.set(name, import('@huggingface/transformers').then(({ pipeline }) => pipeline('feature-extraction', model.id, { dtype: /** @type {any} */ (model.dtype), device: 'cpu' })))
  }
  const extractor = await pipelines.get(name)
  /** @type {Float32Array[]} */
  const out = []
  for (let i = 0; i < texts.length; i += batch) {
    const tensor = await extractor(texts.slice(i, i + batch).map(model[kind]), { pooling: model.pooling, normalize: true })
    const dims = tensor.dims[tensor.dims.length - 1]
    for (let j = 0; j < tensor.dims[0]; j++) out.push(new Float32Array(tensor.data.subarray(j * dims, (j + 1) * dims)))
    progress(out.length)
  }
  return out
}

/** Normalised vectors as one flat Int8 matrix: each value times 127. @param {Float32Array[]} vectors */
export function int8(vectors) {
  const dims = vectors[0]?.length ?? 0
  const matrix = new Int8Array(vectors.length * dims)
  vectors.forEach((v, r) => v.forEach((x, i) => { matrix[r * dims + i] = Math.max(-127, Math.min(127, Math.round(x * 127))) }))
  return { matrix, dims }
}
