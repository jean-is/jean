// Meaning: search_files finds passages by what they mean as well as by their words (D302), with
// EmbeddingGemma 2's text model on this device, about 175 MB downloaded once with consent. Each file
// of the project is read once, in the background, into a vector for each of its passages (search's
// own), a byte for each of 768 numbers, kept in .cache/ by the file's content; a question's vector is
// compared with every passage's, with no index and no database (D24).
import { signal, effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, weightsHost } from '../../ui/state.js'
import { modelWorker, downloading } from '../../ui/model.js'
import { library } from '../../ui/complete.js'
import { fileText, splitPages, indexOf } from '../../core/files.js'
import { isPicture } from '../../core/events.js'

/** @import { Download } from '../brain-local/brain-local.js' */
/** @import { ResourceLink } from '../../core/types.js' */
/** @typedef {{ matrix: Int8Array, dims: number }} Vectors */

export const EMBEDDER = Object.freeze({ model: 'onnx-community/embeddinggemma-2-ONNX', bytes: 1.75e8 })
const QUERY = (/** @type {string} */ text) => `task: search result | query: ${text}`
const PASSAGE = (/** @type {string} */ text) => `title: none | text: ${text}`
// Passages a request: enough to keep a GPU busy, few enough to leave the page responsive.
const BATCH = 16

export const download = signal(/** @type {Download} */ ({ state: 'idle' }))
const worker = modelWorker(new URL('./embed-worker.js', import.meta.url), 'Meaning search stopped')

/** WebGPU with fp16 shaders runs the q4f16 graph; everything else the q4 one on WebAssembly (as Kev). */
async function backend() {
  const gpu = /** @type {any} */ (navigator).gpu
  const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null
  return adapter?.features.has('shader-f16') ? { device: 'webgpu', dtype: 'q4f16' } : { device: 'wasm', dtype: 'q4' }
}
const where = backend()

export async function isDownloaded() {
  try {
    const { dtype } = await where
    const keys = (await caches.has('transformers-cache')) ? await (await caches.open('transformers-cache')).keys() : []
    return keys.some((request) => request.url.includes(EMBEDDER.model) && request.url.endsWith(`model_${dtype}.onnx_data`))
  } catch {
    return false
  }
}

/** Downloads (the first time) and loads the embedder; search_files uses it once this resolves. */
export async function prepare() {
  if (download.value.state === 'ready') return
  download.value = { state: 'downloading', loaded: 0, total: EMBEDDER.bytes }
  navigator.storage?.persist?.().catch(() => {})
  try {
    const { device, dtype } = await where
    await worker.call({ type: 'load', host: weightsHost(), model: EMBEDDER.model, device, dtype }, { onMessage: (message) => { download.value = downloading(message, EMBEDDER.bytes) } })
    download.value = { state: 'ready' }
    register({ id: 'meaning', ready: true })
  } catch (error) {
    download.value = { state: 'failed', message: error instanceof Error ? error.message : String(error) }
    throw error
  }
}

/** Texts' vectors, a batch at a time. @param {string[]} texts @returns {Promise<Vectors>} */
async function embed(texts) {
  /** @type {Int8Array[]} */
  const parts = []
  let dims = 0
  for (let i = 0; i < texts.length; i += BATCH) {
    const answer = await worker.call({ type: 'embed', texts: texts.slice(i, i + BATCH) })
    parts.push(answer.vectors)
    dims = answer.dims
  }
  const matrix = new Int8Array(parts.reduce((n, part) => n + part.length, 0))
  parts.reduce((at, part) => (matrix.set(part, at), at + part.length), 0)
  return { matrix, dims }
}

/** Vectors made or read so far, by the file's content. @type {Map<string, Promise<Vectors | null>>} */
const kept = new Map()
const keyOf = (/** @type {ResourceLink} */ link) => String(link.uri.split('/').pop()).replace(/\.[^.]*$/, '')

/**
 * A file's passages' vectors: from .cache/, or made from its text and kept there. Null for a picture
 * or a file no longer there. @param {ResourceLink} link @returns {Promise<Vectors | null>}
 */
function vectorsOf(link) {
  const key = keyOf(link)
  if (!kept.has(key)) kept.set(key, (async () => {
    if (isPicture(link)) return null
    const { dtype } = await where
    const path = `.cache/meaning/${dtype}/${key}.i8`
    const bytes = await app.fs.readBytes(path)
    if (bytes && bytes.length > 4) return { dims: new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true), matrix: new Int8Array(bytes.buffer, bytes.byteOffset + 4, bytes.length - 4) }
    const text = await fileText(app.fs, app.projectDir, link.uri)
    if (text === null) return null
    const pages = splitPages(text)
    const made = await embed(indexOf(pages).passages.map((p) => PASSAGE(`${p.head}\n${pages[p.page - 1].slice(p.start, p.end)}`)))
    const out = new Uint8Array(4 + made.matrix.length)
    new DataView(out.buffer).setUint32(0, made.dims, true)
    out.set(new Uint8Array(made.matrix.buffer, made.matrix.byteOffset, made.matrix.length), 4)
    await app.fs.writeBytes(path, out)
    return made
  })().catch((error) => { kept.delete(key); console.warn('Meaning', link.name, error); return null }))
  return /** @type {Promise<Vectors | null>} */ (kept.get(key))
}

// How long a search waits for files being read into vectors: a few pages are read by then, a long file isn't.
const PATIENCE = 3000

/**
 * The passages nearest a question by meaning, best first, across the files given: those read into
 * vectors, or read within PATIENCE; the others go on being read, for the next search. Null until the
 * embedder is ready. @param {string} query @param {ResourceLink[]} links
 * @returns {Promise<{ doc: number, passage: number }[] | null>}
 */
export async function rank(query, links, limit = 200) {
  if (download.value.state !== 'ready') return null
  const late = new Promise((resolve) => setTimeout(() => resolve(null), PATIENCE))
  const ready = await Promise.all(links.map((link) => Promise.race([vectorsOf(link), late])))
  const { matrix: q, dims } = await embed([QUERY(query)])
  /** @type {{ doc: number, passage: number, score: number }[]} */
  const found = []
  ready.forEach((vectors, doc) => {
    if (!vectors || vectors.dims !== dims) return
    for (let row = 0; row * dims < vectors.matrix.length; row++) {
      let score = 0
      for (let i = 0, at = row * dims; i < dims; i++) score += q[i] * vectors.matrix[at + i]
      found.push({ doc, passage: row, score })
    }
  })
  return found.sort((a, b) => b.score - a.score).slice(0, limit).map(({ doc, passage }) => ({ doc, passage }))
}

/** Every file of the project read into vectors, one after another, once the embedder is ready. */
async function readAll() {
  for (const { link } of await library(app.projectDir)) await vectorsOf(link)
}

register({ id: 'meaning' })
effect(() => { if (download.value.state === 'ready' && app.project.value.dir) readAll().catch(() => {}) })
// Downloaded on an earlier visit: load it in the background. A failure is kept in download.
isDownloaded().then((yes) => (yes ? prepare() : undefined)).catch(() => {})
