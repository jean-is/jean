// The sandbox (D65): an opaque-origin frame with no network (sandbox.html), where a worker runs code
// the brain wrote: the Computer's (D162), whose engines (the shell, QuickJS, Pyodide) come in as
// files the first time a run needs each. The parent fetches the worker's source and the files and
// posts them in. The sandbox gets code and data, never a key: every call a script makes, every
// engine it needs and every request it makes of the internet comes back here as a message, and
// Jean answers it under the same rules as the brain's own calls (D48).
//
// → { type: 'boot', source }                                   ← { type: 'ready' } | { type: 'failed', error }
// → { type: 'load', engine, files: { name: text | bytes } }    ← { type: 'loaded', engine, error?, memory }
// → { type: 'run', run, engine, … }                            ← { type: 'call' | 'need' | 'fetch', run, id, … }…, { type: 'done', run, ok, memory, … }
// → { type: 'answer', run, id, ok, value, error }              ← { type: 'reset' }: start a fresh sandbox next time
import { signal } from '@preact/signals-core'

/** @typedef {import('../core/loop.js').ToolContext} ToolContext */
/** @typedef {{ frame: HTMLIFrameElement, runs: Map<number, (message: any) => void>, engines: Map<string, Promise<void>>, loading: Map<string, (message: any) => void>, reset: boolean, epoch: number }} Box */
/**
 * What a sandbox is doing, for Settings to show (D176): asleep until a run needs it, waking up while
 * it or an engine starts, then ready, or working while a run goes on; each engine waking or ready;
 * whether a run computes now, rather than waits on Jean; and the memory the worker said it holds.
 * @typedef {{ state: 'asleep' | 'waking' | 'ready' | 'working', engines: Record<string, 'waking' | 'ready'>, computing: boolean, memory: number }} Status
 */

// No word from the sandbox for this long, while nothing is waiting on Jean: stop it.
const WATCHDOG_MS = 40_000
// A script can't start another script, hand work to helpers, or interrupt the user with an offer or questions.
const NOT_FROM_SCRIPTS = new Set(['run', 'javascript', 'python', 'bash', 'offer', 'delegate', 'helper', 'ask_user', 'flow_step'])

const ROOT = new URL('../', import.meta.url)

// The sandbox's lines in the browser console start with ▣: → is what goes in, ← what
// comes out. 1 is a run, 1.2 its second call to Jean (the call goes out, its answer in).
const trace = (/** @type {string} */ label, /** @type {unknown[]} */ ...details) => console.info(`▣ ${label}`, ...details)
const since = (/** @type {number} */ began) => `(${Math.round(performance.now() - began)} ms)`

/**
 * A sandbox, started on its first run and kept for the next ones, with its engines loaded as runs need them.
 * @param {{ capability: string, worker: URL, page: URL, engines: Record<string, { runtime: string, bootMs: number }> }} options
 *   runtime: the folder whose files the engine is made of, e.g. 'vendor/quickjs/'; page: the sandbox document
 */
export function sandbox({ capability, worker, page, engines }) {
  /** @type {Promise<Box> | null} */
  let started = null
  let lastRun = 0
  let epoch = 0
  const status = signal(/** @type {Status} */ ({ state: 'asleep', engines: {}, computing: false, memory: 0 }))
  let booting = false
  /** The runs going on, and those of them waiting on Jean, by id. */
  const going = { runs: new Set(), waiting: new Set() }
  /** @type {Status['engines']} */
  let woken = {}
  /** @param {number} [memory] */
  const tell = (memory = status.peek().memory) => {
    const state = booting || Object.values(woken).includes('waking') ? 'waking' : !started ? 'asleep' : going.runs.size ? 'working' : 'ready'
    status.value = { state, engines: { ...woken }, computing: going.runs.size > going.waiting.size, memory: started ? memory : 0 }
  }

  /** Loads the sandbox document and starts its worker, from the source sent from here. */
  async function start() {
    booting = true
    tell()
    const source = await fetch(worker).then((response) => response.text())
    const frame = document.createElement('iframe')
    // Scripts, but an opaque origin: never together with allow-same-origin (AGENTS.md).
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.hidden = true
    /** @type {Box} */
    const box = { frame, runs: new Map(), engines: new Map(), loading: new Map(), reset: false, epoch: ++epoch }
    return new Promise((resolve, reject) => {
      const fail = (/** @type {string} */ message) => {
        console.warn('▣', message)
        clearTimeout(slow)
        frame.remove()
        removeEventListener('message', listen)
        started = null
        booting = false
        tell()
        reject(new Error(message))
      }
      const slow = setTimeout(() => fail('The sandbox did not start.'), 20_000)
      /** @param {MessageEvent} event */
      function listen({ source: from, data }) {
        if (from !== frame.contentWindow || !data) return
        if (data.type === 'ready') {
          clearTimeout(slow)
          booting = false
          resolve(box)
          tell()
        } else if (data.type === 'failed') fail(data.error)
        else if (data.type === 'loaded') box.loading.get(data.engine)?.(data)
        else if (data.type === 'reset') {
          trace('reset')
          box.reset = true
        } else box.runs.get(data.run)?.(data)
      }
      addEventListener('message', listen)
      frame.addEventListener('load', () => frame.contentWindow?.postMessage({ type: 'boot', source }, '*'), { once: true })
      frame.src = page.href
      document.body.append(frame)
    })
  }

  /** Sends an engine's files in, once a sandbox; their list comes from capabilities.json. @param {Box} box @param {string} engine */
  function load(box, engine) {
    let pending = box.engines.get(engine)
    if (pending) return pending
    /** An engine of the sandbox running now, waking, ready, or gone. @param {'waking' | 'ready' | null} to @param {number} [memory] */
    const wake = (to, memory) => {
      if (box.epoch !== epoch) return
      if (to) woken[engine] = to
      else delete woken[engine]
      tell(memory)
    }
    wake('waking')
    pending = (async () => {
      const { runtime, bootMs } = engines[engine]
      const began = performance.now()
      const listing = await fetch(new URL('capabilities.json', ROOT)).then((response) => response.json())
      const paths = /** @type {string[]} */ (listing.capabilities?.[capability]?.files ?? []).filter((path) => path.startsWith(runtime))
      /** @type {Record<string, string | ArrayBuffer>} */
      const files = {}
      await Promise.all(paths.map(async (path) => {
        const response = await fetch(new URL(path, ROOT))
        files[path.slice(runtime.length)] = /\.(m?js|json)$/.test(path) ? await response.text() : await response.arrayBuffer()
      }))
      await new Promise((resolve, reject) => {
        const slow = setTimeout(() => reject(new Error('The sandbox did not start.')), bootMs)
        box.loading.set(engine, (/** @type {any} */ data) => {
          clearTimeout(slow)
          if (data.error) return reject(new Error(data.error))
          trace(`${engine} ready`, since(began))
          wake('ready', data.memory)
          resolve(undefined)
        })
        box.frame.contentWindow?.postMessage({ type: 'load', engine, files }, '*')
      })
    })()
    pending.catch(() => {
      box.engines.delete(engine)
      wake(null)
    })
    box.engines.set(engine, pending)
    return pending
  }

  function stop() {
    const current = started
    started = null
    woken = {}
    tell()
    current?.then((box) => box.frame.remove(), () => {})
  }

  /**
   * Runs a message in the sandbox, its engine loaded first. The calls it makes are made here under
   * the rules; anything else it asks of Jean (a request to the internet) goes to `handle`. `prepare`
   * adds what depends on the sandbox it runs in (what it already has, by its epoch). Resolves with
   * the `done` message.
   * @param {{ engine: string } & Record<string, any>} message @param {ToolContext} ctx
   * @param {{ handle?: (message: any) => Promise<any>, prepare?: (epoch: number) => Promise<Record<string, any>>, quietMs?: number }} [options]
   * @returns {Promise<any>}
   */
  async function execute(message, ctx, { handle, prepare, quietMs = WATCHDOG_MS } = {}) {
    const box = await (started ??= start().catch((error) => {
      started = null
      throw error
    }))
    await load(box, message.engine)
    const extra = await prepare?.(box.epoch)
    const id = ++lastRun
    const began = performance.now()
    const post = (/** @type {any} */ data) => box.frame.contentWindow?.postMessage(data, '*')
    return new Promise((resolve, reject) => {
      let waiting = 0
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let timer
      const watch = () => {
        clearTimeout(timer)
        if (!waiting) timer = setTimeout(() => finish(new Error('It took too long and was stopped.'), true), quietMs)
      }
      const abort = () => finish(new Error('Stopped.'), true)
      /** @param {Error | null} error @param {boolean} [kill] @param {any} [done] */
      const finish = (error, kill = false, done = null) => {
        clearTimeout(timer)
        box.runs.delete(id)
        going.runs.delete(id)
        going.waiting.delete(id)
        tell(done?.memory)
        ctx.signal?.removeEventListener('abort', abort)
        if (kill) trace(`${id} ←`, error?.message, since(began))
        if (kill || box.reset) stop()
        if (error) reject(error)
        else resolve(done)
      }
      ctx.signal?.addEventListener('abort', abort, { once: true })
      box.runs.set(id, async (/** @type {any} */ data) => {
        if (data.type === 'done') {
          trace(`${id} ←`, data.ok ? data.result ?? data.exit : data.error, ...(data.logs?.length ? [data.logs] : []), since(began))
          return finish(null, false, data)
        }
        trace(`${id}.${data.id} ←`, data.type === 'call' ? data.name : data.type, data.args ?? data.engine ?? data.url)
        waiting++
        if (going.runs.has(id)) going.waiting.add(id)
        tell()
        watch()
        let answer
        try {
          if (data.type === 'need') answer = { ok: true, value: await load(box, data.engine) }
          else if (data.type !== 'call') answer = { ok: true, value: await handle?.(data) }
          else if (NOT_FROM_SCRIPTS.has(data.name)) throw new Error(`${data.name} can't be used from a script.`)
          else answer = { ok: true, value: await ctx.call(data.name, data.args) }
        } catch (error) {
          answer = { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
        if (!--waiting) going.waiting.delete(id)
        tell()
        watch()
        trace(`${id}.${data.id} →`, answer.ok ? answer.value : `Error: ${answer.error}`)
        post({ type: 'answer', run: id, id: data.id, ...answer })
      })
      // The code as an argument, not in the label, so a "%" in it is not read as a format.
      trace(`${id} →`, message.code ?? message.command)
      post({ ...message, ...extra, type: 'run', run: id })
      going.runs.add(id)
      tell()
      watch()
    })
  }

  return { execute, stop, status }
}
