// Intuition: reflexes on this device (D16, D41). Kev-0.6B, fine-tuned on Jean's questions in
// 33 languages (D328), answers typed questions in one pass, in any language: which capability would help, how demanding a request is, whether
// it shares something personal, whether the last answer missed, which follow-ups fit.
// About 340 MB, downloaded once with consent; then free, private and quick. Never on a phone or a tablet (D660).
import { signal } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { weightsHost } from '../../ui/state.js'
import { modelWorker, downloading, handheld } from '../../ui/model.js'

/** @import { Question } from '../../core/decide.js' */
/** @import { Download } from '../brain-local/brain-local.js' */

export const KEV = Object.freeze({ model: 'jean-is/kev-0.6b-reflexes-ONNX', bytes: 3.45e8 })

export const download = signal(/** @type {Download} */ ({ state: 'idle' }))
const worker = modelWorker(new URL('./kev-worker.js', import.meta.url), 'Reflexes stopped')

// The reflexes' lines in the browser console start with ◈, a flowchart's decision: → is the
// state and questions going in, ← the answers coming out. 1 is the first decision.
const trace = (/** @type {string} */ label, /** @type {unknown[]} */ ...details) => console.info(`◈ ${label}`, ...details)
const since = (/** @type {number} */ began) => `(${Math.round(performance.now() - began)} ms)`
let decisions = 0

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
  const id = ++decisions
  const began = performance.now()
  trace(`${id} →`, state, questions)
  try {
    const { answers } = await worker.call({ type: 'decide', state, questions })
    trace(`${id} ←`, answers, since(began))
    return answers
  } catch (error) {
    trace(`${id} ←`, error instanceof Error ? error.message : error, since(began))
    throw error
  }
}

/** Downloads (first time) and loads Kev; reflexes are on once this resolves. */
export async function prepare() {
  if (download.value.state === 'ready') return
  download.value = { state: 'downloading', loaded: 0, total: KEV.bytes }
  navigator.storage?.persist?.().catch(() => {})
  const began = performance.now()
  try {
    const { device, dtype } = await backend()
    await worker.call({ type: 'load', host: weightsHost(), model: KEV.model, device, dtype }, { onMessage: (message) => { download.value = downloading(message, KEV.bytes) } })
    trace('ready', device, since(began))
    download.value = { state: 'ready' }
    register({ ...capability, decide, ready: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('◈', message)
    download.value = { state: 'failed', message }
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
// Loaded, Kev holds more than a gigabyte beside the page, and a phone stutters at every scroll and dialog (D660): there,
// where a child's profile still turns it on ahead (D228), it is nothing.
if (!handheld()) {
  register(capability)
  // Downloaded on an earlier visit: load it in the background. A failure is logged in prepare().
  isDownloaded().then((yes) => (yes ? prepare() : undefined)).catch(() => {})
}
