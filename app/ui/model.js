// The page's side of a model's worker (the device's brain, Intuition, dictation): each request has
// an id, gets its progress and chunks along the way, then its answer or its error. The worker
// starts with the first request, and again after it stops.
import { scriptURL } from './trusted.js'

/**
 * @param {URL} url the worker's module @param {string} stopped what requests are told when it stops
 * @returns {{ id: () => number, post: (message: any) => void,
 *   call: (message: Record<string, any>, options?: { onMessage?: (message: any) => void, id?: number, transfer?: Transferable[] }) => Promise<any> }}
 */
export function modelWorker(url, stopped) {
  /** @type {Worker | null} */
  let worker = null
  let ids = 0
  /** @type {Map<number, { resolve: (value: any) => void, reject: (error: any) => void, onMessage: (message: any) => void }>} */
  const pending = new Map()
  function start() {
    const started = new Worker(scriptURL(url), { type: 'module' })
    started.onmessage = ({ data }) => {
      const request = pending.get(data.id)
      if (!request) return
      if (data.type === 'progress' || data.type === 'chunk') return request.onMessage(data)
      pending.delete(data.id)
      if (data.type === 'error') request.reject(Object.assign(new Error(data.message), { code: data.code }))
      else request.resolve(data)
    }
    started.onerror = (event) => {
      for (const request of pending.values()) request.reject(new Error(event.message || stopped))
      pending.clear()
      worker = null
    }
    return started
  }
  return {
    // A request's id ahead of it, for a message about it (an abort).
    id: () => ++ids,
    post: (message) => worker?.postMessage(message),
    call: (message, { onMessage = () => {}, id = ++ids, transfer = [] } = {}) => new Promise((resolve, reject) => {
      const target = (worker ??= start())
      pending.set(id, { resolve, reject, onMessage })
      target.postMessage({ ...message, id }, transfer)
    }),
  }
}

let working = 0

/** Every loop's play state, `var(--loops, running)` in the style sheets, set on the root (CSSOM: the CSP refuses style attributes). @param {boolean} still */
const loops = (still) => (still ? document.documentElement.style.setProperty('--loops', 'paused') : document.documentElement.style.removeProperty('--loops'))

/**
 * Holds the page still while a model works on this device's GPU (D285): every frame the browser
 * draws waits there behind the model's work, so the page's loops pause and only what changes is
 * drawn: typing, the answer, the picture as it forms. An entrance still plays.
 * @template T @param {Promise<T>} work @returns {Promise<T>}
 */
export async function holdStill(work) {
  loops(++working > 0)
  try {
    return await work
  } finally {
    loops(--working > 0)
  }
}

/**
 * Weights coming in, as a download's state: loading once every byte is here. @param {{ loaded: number, total: number }} progress
 * @param {number} bytes what they are expected to weigh @returns {{ state: 'loading' } | { state: 'downloading', loaded: number, total: number }}
 */
export const downloading = ({ loaded, total }, bytes) => (loaded >= total * 0.999 ? { state: 'loading' } : { state: 'downloading', loaded, total: Math.max(total, bytes) })
