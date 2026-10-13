// Dense retrieval for the evals: passages and questions embedded by an open model through
// Transformers.js (on this computer's CPU, as npm run reflexes runs Kev), kept as flat Int8 vectors.
// Eval code only: it moves into the app if the answer eval says it earns its place (H4).

const INSTRUCT = (/** @type {string} */ t) => `Instruct: Given a question, retrieve the passages of a company's documents that answer it\nQuery: ${t}`
const AS_IS = (/** @type {string} */ t) => t

/**
 * The embedders compared, with how each wants its texts and its vectors pooled; those whose model pools itself
 * give `sentence_embedding` (pooling: 'model').
 * @type {Record<string, { id: string, dtype: string, pooling: 'mean' | 'cls' | 'last_token' | 'model', textOnly?: boolean, query: (t: string) => string, passage: (t: string) => string }>}
 */
export const MODELS = {
  e5: { id: 'Xenova/multilingual-e5-small', dtype: 'q8', pooling: 'mean', query: (t) => `query: ${t}`, passage: (t) => `passage: ${t}` },
  qwen3: { id: 'onnx-community/Qwen3-Embedding-0.6B-ONNX', dtype: 'q8', pooling: 'last_token', query: INSTRUCT, passage: AS_IS },
  granite: { id: 'onnx-community/granite-embedding-97m-multilingual-r2-ONNX', dtype: 'q8', pooling: 'cls', query: AS_IS, passage: AS_IS },
  // At full precision, to tell what 8 bits cost it.
  granite32: { id: 'onnx-community/granite-embedding-97m-multilingual-r2-ONNX', dtype: 'fp32', pooling: 'cls', query: AS_IS, passage: AS_IS },
  harrier: { id: 'onnx-community/harrier-oss-v1-270m-ONNX', dtype: 'q8', pooling: 'model', query: INSTRUCT, passage: AS_IS },
  gemma: { id: 'onnx-community/embeddinggemma-300m-ONNX', dtype: 'q8', pooling: 'model', query: (t) => `task: search result | query: ${t}`, passage: (t) => `title: none | text: ${t}` },
  // Its text model alone: the vision and audio encoders aren't loaded (Transformers.js 4.3.1 or later).
  gemma2: { id: 'onnx-community/embeddinggemma-2-ONNX', dtype: 'q8', pooling: 'model', textOnly: true, query: (t) => `task: search result | query: ${t}`, passage: (t) => `title: none | text: ${t}` },
  // In 4 bits, the weights a browser downloads (175 MB rather than 314).
  gemma2q4: { id: 'onnx-community/embeddinggemma-2-ONNX', dtype: 'q4', pooling: 'model', textOnly: true, query: (t) => `task: search result | query: ${t}`, passage: (t) => `title: none | text: ${t}` },
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
    const options = { dtype: /** @type {any} */ (model.dtype), device: /** @type {'cpu'} */ ('cpu') }
    pipelines.set(name, import('@huggingface/transformers').then(async ({ pipeline, AutoConfig, AutoModel, AutoTokenizer }) => {
      if (model.pooling !== 'model') {
        const extractor = await pipeline('feature-extraction', model.id, options)
        return (/** @type {string[]} */ batch) => extractor(batch, { pooling: /** @type {any} */ (model.pooling), normalize: true })
      }
      const config = model.textOnly ? Object.assign(await AutoConfig.from_pretrained(model.id), { vision_config: null, audio_config: null }) : undefined
      const [tokenizer, net] = await Promise.all([AutoTokenizer.from_pretrained(model.id), AutoModel.from_pretrained(model.id, { ...options, ...(config && { config }) })])
      return async (/** @type {string[]} */ batch) => (await net(tokenizer(batch, { padding: true, truncation: true }))).sentence_embedding.normalize(2, -1)
    }))
  }
  const run = await pipelines.get(name)
  /** @type {Float32Array[]} */
  const out = []
  for (let i = 0; i < texts.length; i += batch) {
    const tensor = await run(texts.slice(i, i + batch).map(model[kind]))
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
