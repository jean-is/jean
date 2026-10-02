// Intuition: reflexes on this device (D16, D41). Kev-0.6B answers typed questions in one
// pass, in any language: which capability would help, how demanding a request is, whether
// it shares something personal, whether the last answer missed, which follow-ups fit.
// About 340 MB, downloaded once with consent; then free, private and quick.
import { signal } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { weightsHost } from '../../ui/state.js'
import { scriptURL } from '../../ui/trusted.js'

/** @typedef {import('../../core/decide.js').Question} Question */
/** @typedef {import('../brain-local/brain-local.js').Download} Download */

export const KEV = Object.freeze({ model: 'onnx-community/kev-0.6b-ONNX', bytes: 3.45e8 })

export const download = signal(/** @type {Download} */ ({ state: 'idle' }))

/** WebGPU with fp16 shaders runs the q4f16 graph; everything else the q4 one on WebAssembly. */
async function backend() {
  const gpu = /** @type {any} */ (navigator).gpu
  const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null
  return adapter?.features.has('shader-f16') ? { device: 'webgpu', dtype: 'q4f16' } : { device: 'wasm', dtype: 'q4' }
}

export async function isDownloaded() {
  try {
    const { dtype } = await backend()
    if (!(await caches.has('transformers-cache'))) return false
    const keys = await (await caches.open('transformers-cache')).keys()
    return keys.some((request) => request.url.includes(KEV.model) && request.url.endsWith(`model_${dtype}.onnx_data`))
  } catch {
    return false
  }
}

/**
 * Asks Kev; answers in the Decisions API shape.
 * @param {unknown} state @param {Record<string, Question>} questions
 * @returns {Promise<Record<string, import('../../core/decide.js').Answer>>}
 */
async function decide(state, questions) {
  const { answers } = await call({ type: 'decide', state, questions })
  return answers
}

/** Downloads (first time) and loads Kev; reflexes are on once this resolves. */
export async function prepare() {
  if (download.value.state === 'ready') return
  download.value = { state: 'downloading', loaded: 0, total: KEV.bytes }
  navigator.storage?.persist?.().catch(() => {})
  try {
    await call({ type: 'load', host: weightsHost(), model: KEV.model, ...await backend() }, (message) => {
      if (message.type !== 'progress') return
      download.value = message.loaded >= message.total * 0.999 ? { state: 'loading' } : { state: 'downloading', loaded: message.loaded, total: Math.max(message.total, KEV.bytes) }
    })
    download.value = { state: 'ready' }
    register({ ...capability, decide })
  } catch (error) {
    download.value = { state: 'failed', message: error instanceof Error ? error.message : String(error) }
    throw error
  }
}

/** For scripts (codemode, D48): `models.decide(state, questions)`. @type {import('../../core/loop.js').Tool} */
const decideTool = {
  spec: {
    name: 'decide',
    description: 'Ask the decision helper typed questions (noul, choice, score) about a state.',
    parameters: { type: 'object', properties: { state: {}, questions: { type: 'object' } }, required: ['state', 'questions'] },
  },
  kind: 'think',
  hidden: true,
  title: () => 'Decide',
  run: async (args) => {
    if (download.value.state !== 'ready') throw new Error('The decision helper is not on. Offer "reflexes" to the user.')
    return JSON.stringify(await decide(args?.state ?? '', args?.questions ?? {}))
  },
}

const capability = { id: 'reflexes', tools: [decideTool] }
register(capability)
// Downloaded on an earlier visit: load it in the background.
isDownloaded().then((yes) => (yes ? prepare() : undefined)).catch((error) => console.warn('Reflexes', error))

// ─── Worker ──────────────────────────────────────────────────────────────────

/** @type {Worker | null} */
let worker = null
let nextId = 0
/** @type {Map<number, { resolve: (value: any) => void, reject: (error: any) => void, onMessage: (message: any) => void }>} */
const pending = new Map()

/** @param {Record<string, any>} message @param {(message: any) => void} [onMessage] @returns {Promise<any>} */
function call(message, onMessage = () => {}) {
  const target = (worker ??= start())
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onMessage })
    target.postMessage({ ...message, id })
  })
}

function start() {
  const started = new Worker(scriptURL(new URL('./kev-worker.js', import.meta.url)), { type: 'module' })
  started.onmessage = ({ data }) => {
    const request = pending.get(data.id)
    if (!request) return
    if (data.type === 'error') {
      pending.delete(data.id)
      request.reject(new Error(data.message))
    } else if (data.type === 'ready' || data.type === 'answers') {
      pending.delete(data.id)
      request.resolve(data)
    } else request.onMessage(data)
  }
  started.onerror = (event) => {
    for (const request of pending.values()) request.reject(new Error(event.message || 'Reflexes stopped'))
    pending.clear()
    worker = null
  }
  return started
}
