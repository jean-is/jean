// Calculations: Jean works numbers out exactly by writing a short script, run in QuickJS
// inside the sandbox (sandbox.html: an opaque origin with no network). Codemode (D48): a
// script can read shared files and call Jean's tools, deferred ones included; each call
// goes through Do it / Ask me first / Never and shows under the run in the activity view.
// The sandbox gets code and data, never a key: Jean makes every call itself.
import { register } from '../../ui/caps.js'

/** @typedef {import('../../core/loop.js').ToolContext} ToolContext */
/** @typedef {{ frame: HTMLIFrameElement, runs: Map<number, (message: any) => void>, reset: boolean }} Sandbox */

const LIMITS = { memory: 64 * 1024 * 1024, cpu: 20_000, output: 6000 }
// No word from the sandbox for this long, while no call is waiting on Jean: stop it.
const WATCHDOG_MS = 40_000
const BOOT_MS = 20_000
const MAX_OUTPUT = 8000
// A script can't start another script, or interrupt the user with an offer.
const NOT_FROM_SCRIPTS = new Set(['run', 'offer'])

const ROOT = new URL('../../', import.meta.url)

/** @type {Promise<Sandbox> | null} */
let sandbox = null
let lastRun = 0

// The sandbox's lines in the browser console start with ▣: → is what goes in, ← what
// comes out. 1 is a run, 1.2 its second call to Jean (the call goes out, its answer in).
const trace = (/** @type {string} */ label, /** @type {unknown[]} */ ...details) => console.info(`▣ ${label}`, ...details)
const since = (/** @type {number} */ began) => `(${Math.round(performance.now() - began)} ms)`

/** Loads the sandbox document and boots QuickJS in its worker, with files sent from here. */
async function start() {
  const began = performance.now()
  const listing = await fetch(new URL('capabilities.json', ROOT)).then((response) => response.json())
  const paths = /** @type {string[]} */ (listing.capabilities?.compute?.files ?? []).filter((path) => path.startsWith('vendor/quickjs/'))
  /** @type {Record<string, string>} */
  const files = {}
  let wasm = new ArrayBuffer(0)
  await Promise.all(paths.map(async (path) => {
    const response = await fetch(new URL(path, ROOT))
    if (path.endsWith('.wasm')) wasm = await response.arrayBuffer()
    else files[path.split('/').at(-1) ?? path] = await response.text()
  }))
  const source = await fetch(new URL('./sandbox-worker.js', import.meta.url)).then((response) => response.text())
  const frame = document.createElement('iframe')
  // Scripts, but an opaque origin: never together with allow-same-origin (AGENTS.md).
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.hidden = true
  /** @type {Sandbox} */
  const box = { frame, runs: new Map(), reset: false }
  return new Promise((resolve, reject) => {
    const fail = (/** @type {string} */ message) => {
      console.warn('▣', message)
      clearTimeout(slow)
      frame.remove()
      removeEventListener('message', listen)
      sandbox = null
      reject(new Error(message))
    }
    const slow = setTimeout(() => fail('The sandbox did not start.'), BOOT_MS)
    /** @param {MessageEvent} event */
    function listen({ source: from, data }) {
      if (from !== frame.contentWindow || !data) return
      if (data.type === 'ready') {
        clearTimeout(slow)
        trace('ready', since(began))
        resolve(box)
      } else if (data.type === 'failed') fail(data.error)
      else if (data.type === 'reset') {
        trace('reset')
        box.reset = true
      } else box.runs.get(data.run)?.(data)
    }
    addEventListener('message', listen)
    frame.addEventListener('load', () => frame.contentWindow?.postMessage({ type: 'boot', source, files, wasm }, '*'), { once: true })
    frame.src = new URL('sandbox.html', ROOT).href
    document.body.append(frame)
  })
}

function stopSandbox() {
  const current = sandbox
  sandbox = null
  current?.then((box) => box.frame.remove(), () => {})
}

/** @param {string} code @param {ToolContext} ctx @returns {Promise<string>} */
async function execute(code, ctx) {
  const box = await (sandbox ??= start().catch((error) => {
    sandbox = null
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
      if (kill || box.reset) stopSandbox()
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
    post({ type: 'run', run: id, code, limits: LIMITS })
    watch()
  })
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

/** @type {import('../../core/loop.js').Tool} */
const runTool = {
  spec: {
    name: 'run',
    description: [
      'Run JavaScript in a sandbox with no network. Top-level await works; return the result, which comes back as JSON with anything logged.',
      'Available in scripts: await file(name) returns the whole text of a shared file (spreadsheets as tab-separated rows under "Sheet:" lines);',
      'csv(text) turns CSV or tab-separated text into rows, objects keyed by the header, numbers as numbers;',
      'await tools.<name>({ … }) calls any tool, including ones found with await searchTools(query);',
      'await models.decide(state, questions) asks the on-device decision helper, when it is on (types noul, choice, score).',
    ].join(' '),
    parameters: { type: 'object', properties: { code: { type: 'string', description: 'The script' } }, required: ['code'] },
  },
  kind: 'execute',
  title: () => 'Calculate',
  run: (args, ctx) => execute(String(args?.code ?? ''), ctx),
}

register({
  id: 'compute',
  tools: [runTool],
  lines: [{ name: 'run', line: 'run JavaScript in a sandbox to work things out exactly; scripts can read shared files and call tools' }],
  rules: ['Compute numbers with run instead of estimating them.'],
})
