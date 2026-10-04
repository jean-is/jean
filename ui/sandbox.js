// The sandbox (D65): an opaque-origin frame with no network, where a worker runs code the
// brain wrote. Each runtime has its own frame and document: QuickJS for Calculations
// (sandbox.html), Pyodide for Python (caps/python/sandbox.html, D80). The parent fetches the
// worker's source and the runtime's files and posts them in. The sandbox gets code and data,
// never a key: every call a script makes comes back here as a message, and Jean makes it under
// the same rules as the brain's own calls (D48). Loaded by the capabilities that run code.
//
// → { type: 'boot', source, files: { name: text | bytes } }   ← { type: 'ready' } | { type: 'failed', error }
// → { type: 'run', run, code, limits }                         ← { type: 'call', run, id, name, args }…, { type: 'done', run, ok, result, logs, error }
// → { type: 'answer', run, id, ok, value, error }              ← { type: 'reset' }: start a fresh sandbox next time

/** @typedef {import('../core/loop.js').ToolContext} ToolContext */
/** @typedef {{ frame: HTMLIFrameElement, runs: Map<number, (message: any) => void>, reset: boolean }} Box */

// No word from the sandbox for this long, while no call is waiting on Jean: stop it.
const WATCHDOG_MS = 40_000
const MAX_OUTPUT = 8000
// A script can't start another script, hand work to helpers, or interrupt the user with an offer or questions.
const NOT_FROM_SCRIPTS = new Set(['run', 'python', 'offer', 'delegate', 'helper', 'ask_user'])

const ROOT = new URL('../', import.meta.url)

// The sandbox's lines in the browser console start with ▣: → is what goes in, ← what
// comes out. 1 is a run, 1.2 its second call to Jean (the call goes out, its answer in).
const trace = (/** @type {string} */ label, /** @type {unknown[]} */ ...details) => console.info(`▣ ${label}`, ...details)
const since = (/** @type {number} */ began) => `(${Math.round(performance.now() - began)} ms)`

/**
 * A sandbox for one runtime, started on its first run and kept for the next ones.
 * @param {{ capability: string, runtime: string, worker: URL, page: URL, limits: Record<string, number>, bootMs: number }} options
 *   runtime: the folder whose files the worker receives, e.g. 'vendor/quickjs/'; page: the sandbox document
 */
export function sandbox({ capability, runtime, worker, page, limits, bootMs }) {
  /** @type {Promise<Box> | null} */
  let started = null
  let lastRun = 0

  /** Loads the sandbox document and boots the runtime in its worker, with files sent from here. */
  async function start() {
    const began = performance.now()
    const listing = await fetch(new URL('capabilities.json', ROOT)).then((response) => response.json())
    const paths = /** @type {string[]} */ (listing.capabilities?.[capability]?.files ?? []).filter((path) => path.startsWith(runtime))
    /** @type {Record<string, string | ArrayBuffer>} */
    const files = {}
    await Promise.all(paths.map(async (path) => {
      const response = await fetch(new URL(path, ROOT))
      files[path.slice(runtime.length)] = /\.(m?js|json)$/.test(path) ? await response.text() : await response.arrayBuffer()
    }))
    const source = await fetch(worker).then((response) => response.text())
    const frame = document.createElement('iframe')
    // Scripts, but an opaque origin: never together with allow-same-origin (AGENTS.md).
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.hidden = true
    /** @type {Box} */
    const box = { frame, runs: new Map(), reset: false }
    return new Promise((resolve, reject) => {
      const fail = (/** @type {string} */ message) => {
        console.warn('▣', message)
        clearTimeout(slow)
        frame.remove()
        removeEventListener('message', listen)
        started = null
        reject(new Error(message))
      }
      const slow = setTimeout(() => fail('The sandbox did not start.'), bootMs)
      /** @param {MessageEvent} event */
      function listen({ source: from, data }) {
        if (from !== frame.contentWindow || !data) return
        if (data.type === 'ready') {
          clearTimeout(slow)
          trace(`${capability} ready`, since(began))
          resolve(box)
        } else if (data.type === 'failed') fail(data.error)
        else if (data.type === 'reset') {
          trace('reset')
          box.reset = true
        } else box.runs.get(data.run)?.(data)
      }
      addEventListener('message', listen)
      frame.addEventListener('load', () => frame.contentWindow?.postMessage({ type: 'boot', source, files }, '*'), { once: true })
      frame.src = page.href
      document.body.append(frame)
    })
  }

  function stop() {
    const current = started
    started = null
    current?.then((box) => box.frame.remove(), () => {})
  }

  /** @param {string} code @param {ToolContext} ctx @returns {Promise<string>} */
  async function execute(code, ctx) {
    const box = await (started ??= start().catch((error) => {
      started = null
      throw error
    }))
    const id = ++lastRun
    const began = performance.now()
    const post = (/** @type {any} */ message) => box.frame.contentWindow?.postMessage(message, '*')
    return new Promise((resolve, reject) => {
      let waiting = 0
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let timer
      const watch = () => {
        clearTimeout(timer)
        if (!waiting) timer = setTimeout(() => finish(new Error('The calculation took too long and was stopped.'), true), WATCHDOG_MS)
      }
      const abort = () => finish(new Error('Stopped.'), true)
      /** @param {Error | null} error @param {boolean} [kill] @param {string} [output] */
      const finish = (error, kill = false, output = '') => {
        clearTimeout(timer)
        box.runs.delete(id)
        ctx.signal?.removeEventListener('abort', abort)
        if (kill) trace(`${id} ←`, error?.message, since(began))
        if (kill || box.reset) stop()
        if (error) reject(error)
        else resolve(output)
      }
      ctx.signal?.addEventListener('abort', abort, { once: true })
      box.runs.set(id, async (/** @type {any} */ message) => {
        if (message.type === 'done') {
          const text = report(message)
          trace(`${id} ←`, message.ok ? message.result : message.error, ...(message.logs.length ? [message.logs] : []), since(began))
          return message.ok ? finish(null, false, text) : finish(new Error(text))
        }
        if (message.type !== 'call') return
        trace(`${id}.${message.id} ←`, message.name, message.args)
        waiting++
        watch()
        let answer
        try {
          if (NOT_FROM_SCRIPTS.has(message.name)) throw new Error(`${message.name} can't be used from a script.`)
          answer = { ok: true, value: await ctx.call(message.name, message.args) }
        } catch (error) {
          answer = { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
        waiting--
        watch()
        trace(`${id}.${message.id} →`, answer.ok ? answer.value : `Error: ${answer.error}`)
        post({ type: 'answer', run: id, id: message.id, ...answer })
      })
      // The code as an argument, not in the label, so a "%" in it is not read as a format.
      trace(`${id} →`, code)
      post({ type: 'run', run: id, code, limits })
      watch()
    })
  }

  return { execute }
}

/** What the brain reads back: the result, then the log. @param {{ ok: boolean, result?: unknown, error?: string, logs: string[] }} message */
function report({ ok, result, error, logs }) {
  // "Result: null" reads like an answer, and a small brain then makes one up.
  const empty = result === null && !logs.length
  const parts = [!ok ? `The script failed: ${error}`
    : empty ? 'The script gave no result: end it with the value you need, or return it.'
    : `Result: ${typeof result === 'string' ? result : JSON.stringify(result, null, 1)}`]
  if (logs.length) parts.push(`Log:\n${logs.join('\n')}`)
  const text = parts.join('\n\n')
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (cut here: return less)` : text
}
