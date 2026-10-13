// The first rung of the brain ladder (D42): Gemma 4 E2B on this device. Offered only
// where it can run (WebGPU with shader-f16, enough memory and free space, a computer),
// downloaded once with consent, then private, free and offline.
import { signal } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { weightsHost, effective } from '../../ui/state.js'
import { memoryTotal } from '../../ui/host.js'
import { modelWorker, downloading, holdStill } from '../../ui/model.js'
import { openaiMessages, LLMError } from '../../core/llm.js'
import { t, formatBytes } from '../../core/i18n.js'
import { gemmaParser } from './gemma.js'
import './private.js'

export { reveal, onDevice } from './private.js'

/** @import { StreamEvent, ToolCall } from '../../core/types.js' */

export const GEMMA = Object.freeze({
  model: 'onnx-community/gemma-4-E2B-it-ONNX',
  dtype: 'q4f16',
  bytes: 3.11e9, // decoder and embeddings; the image and audio encoders come later, when needed
  file: 'decoder_model_merged_q4f16.onnx_data',
})
const CONTEXT = 32768
// Loaded, it holds about 7 GB, and 9 while it loads (D319): a computer of 12 GB. A browser says a power
// of two, the nearest, ties down, so 12 GB says 8, as 8 GB does: 8 there, 12 where the desktop app knows.
// Chrome on Android says 8 at most, and Safari nothing: a phone or a tablet is never offered it.
const MEMORY_GB = 12
/** Kept in this browser while the brain loads: still there at the next start, the load ended the tab (D319). */
const LOADING = 'app.device-brain'

/**
 * @typedef {{ state: 'idle' } | { state: 'downloading', loaded: number, total: number }
 *   | { state: 'loading' } | { state: 'ready' } | { state: 'failed', message: string }} Download
 */
export const download = signal(/** @type {Download} */ ({ state: 'idle' }))
const worker = modelWorker(new URL('./brain-worker.js', import.meta.url), 'The on-device brain stopped')

/**
 * Whether this device can run the brain, and if not, why: short of memory, what was downloaded for it
 * is deleted, and `freed` says how much.
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'webgpu' | 'f16' | 'storage' } | { ok: false, reason: 'memory', freed: number }>}
 */
export async function checkDevice() {
  const nav = /** @type {any} */ (navigator)
  const adapter = nav.gpu ? await nav.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null) : null
  if (!adapter) return { ok: false, reason: 'webgpu' }
  if (!adapter.features.has('shader-f16')) return { ok: false, reason: 'f16' }
  const handheld = nav.userAgentData?.mobile || /Android|iPhone|iPad|Mobile/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1)
  const exact = await memoryTotal().catch(() => 0)
  if ((await crashed()) || handheld || (exact ? exact < MEMORY_GB * 1e9 : nav.deviceMemory < 8)) return { ok: false, reason: 'memory', freed: await forget() }
  if (!(await isDownloaded())) {
    const { quota = Infinity, usage = 0 } = (await navigator.storage?.estimate?.()) ?? {}
    if (quota - usage < GEMMA.bytes * 1.15) return { ok: false, reason: 'storage' }
  }
  return { ok: true }
}

/** Transformers.js keeps downloaded weights in its own cache, apart from app versions. */
export async function isDownloaded() {
  try {
    if (!(await caches.has('transformers-cache'))) return false
    const cache = await caches.open('transformers-cache')
    return (await cache.keys()).some((request) => request.url.includes(GEMMA.model) && request.url.endsWith(GEMMA.file))
  } catch {
    return false
  }
}

/** Marks a load under way, or one that ended the tab, or removes the mark. @param {'loading' | 'unfit' | null} value */
const mark = (value) => (value ? localStorage.setItem(LOADING, value) : localStorage.removeItem(LOADING))

/** Whether loading the brain ended this tab before: its mark is still there and no tab holds its lock. */
async function crashed() {
  if (localStorage.getItem(LOADING) === 'loading' && !(await navigator.locks.query()).held?.some((lock) => lock.name === LOADING)) mark('unfit')
  return localStorage.getItem(LOADING) === 'unfit'
}

/** Deletes what was downloaded for the brain, unless it is one of the user's. @returns {Promise<number>} the bytes freed */
async function forget() {
  if (effective.peek().settings.brains.some((brain) => brain.api === 'device') || !(await caches.has('transformers-cache'))) return 0
  const cache = await caches.open('transformers-cache')
  const kept = (await cache.keys()).filter((request) => request.url.includes(GEMMA.model))
  const sizes = await Promise.all(kept.map(async (request) => Number((await cache.match(request))?.headers.get('content-length')) || 0))
  await Promise.all(kept.map((request) => cache.delete(request)))
  return sizes.reduce((sum, size) => sum + size, 0)
}

/** What Settings › Brains says once it has deleted that download (D319). @param {number} freed */
export const unfit = (freed) => t('device.unfit', { size: formatBytes(freed) })

/** Downloads (first time) and loads the brain. Resolves when it can answer. */
export async function prepare() {
  if (download.value.state === 'ready') return
  download.value = { state: 'downloading', loaded: 0, total: GEMMA.bytes }
  navigator.storage?.persist?.().catch(() => {})
  try {
    // One tab loads it at a time, and marks it while it does (D319).
    await navigator.locks.request(LOADING, () => worker.call({ type: 'load', host: weightsHost(), model: GEMMA.model, dtype: GEMMA.dtype }, { onMessage: (message) => {
      download.value = downloading(message, GEMMA.bytes)
      if (download.value.state === 'loading') mark('loading')
    } }))
    mark(null)
    download.value = { state: 'ready' }
  } catch (error) {
    mark(null)
    download.value = { state: 'failed', message: error instanceof Error ? error.message : String(error) }
    throw error
  }
}

/**
 * Same events as core/llm.js streamChat, from the worker.
 * @param {import('../../core/types.js').Connection & import('../../core/types.js').Prompt} options
 * @returns {AsyncGenerator<StreamEvent, void, undefined>}
 */
export async function* stream({ system, messages, tools = [], maxTokens, signal }) {
  if (signal?.aborted) throw new LLMError('Request aborted', { code: 'aborted' })
  await holdStill(prepare())
  const parser = gemmaParser()
  /** @type {StreamEvent[]} */
  const queue = []
  /** @type {(() => void) | null} */
  let wake = null
  /** @type {{ usage?: any, error?: any } | null} */
  let finished = null
  const id = worker.id()
  const onAbort = () => worker.post({ type: 'abort', id })
  signal?.addEventListener('abort', onAbort, { once: true })
  /** @param {any[]} events */
  const push = (events) => {
    queue.push(.../** @type {StreamEvent[]} */ (events))
    wake?.()
  }
  holdStill(worker.call({
    type: 'generate',
    messages: openaiMessages(system, messages, { systemNotes: false, argsAsObject: true }),
    tools: tools.map(({ name, description, parameters }) => ({ type: 'function', function: { name, description, parameters } })),
    maxTokens: maxTokens ?? 4096,
    contextTokens: CONTEXT,
  }, { id, onMessage: (message) => { if (message.type === 'chunk') push(parser.feed(message.text)) } })).then((done) => {
    push(parser.end())
    finished = { usage: done.usage }
  }, (error) => {
    finished = { error }
  }).finally(() => wake?.())

  let text = ''
  /** @type {ToolCall[]} */
  const calls = []
  try {
    while (true) {
      while (queue.length) {
        const event = /** @type {StreamEvent} */ (queue.shift())
        if (event.type === 'tool_call') calls.push(event.call)
        else {
          if (event.type === 'text') text += event.delta
          yield event
        }
      }
      if (finished) break
      await new Promise((resolve) => { wake = () => resolve(undefined) })
      wake = null
    }
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
  const { error, usage } = /** @type {{ usage?: any, error?: any }} */ (finished)
  if (signal?.aborted) throw new LLMError('Request aborted', { code: 'aborted' })
  // Nothing to reconnect to here: what failed on the device would fail again (D202).
  if (error) throw new LLMError(error.message, { code: error.code === 'too_long' ? 'too_long' : 'server', retryable: false })
  // Tool calls come last, as from the other adapters (D31).
  for (const call of calls) yield { type: 'tool_call', call }
  yield {
    type: 'done',
    stopReason: calls.length ? 'tool_use' : 'end',
    usage,
    message: { role: 'assistant', content: text, ...(calls.length && { toolCalls: calls }) },
  }
}

// It answers the steps of a turn on the device's brain itself (core/hooks.js), and leaves the others to their brains.
register({ id: 'brain-local', hooks: [{ on: 'turn.step', run: (e, next) => (e.brain.api === 'device' ? stream(e) : next(e)) }] })
