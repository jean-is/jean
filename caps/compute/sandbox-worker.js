// Runs scripts the brain wrote, in QuickJS, inside the sandbox's worker (sandbox.html): an
// opaque origin with no network. A script reaches only what Jean hands it, with memory and
// computing-time limits (D13). Every call it makes crosses back to Jean as a message, and
// Jean makes it under the same rules as the brain's own calls (D48).
//
// { type: 'boot', files: { name: text | bytes } }              → { type: 'ready' }
// { type: 'run', run, code, limits: { memory, cpu, output } }   → { type: 'call', run, id, name, args }…,
//                                                                  { type: 'done', run, ok, result, logs, error }
// { type: 'answer', run, id, ok, value, error }                 the result of a call
// A classic script (no static imports): the sandbox can only start classic workers.

// QuickJS's JS_EVAL_FLAG_ASYNC (1 << 7), which quickjs-emscripten doesn't name: a global
// script where await works, evaluating to a promise of { value: <last expression> }.
const ASYNC_SCRIPT = 128

/** @type {any} */
let quickjs = null
/** @type {Map<number, { answer: (message: any) => void }>} */
const runs = new Map()

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'boot') {
      quickjs ??= await load(data.files)
      self.postMessage({ type: 'ready' })
    } else if (data.type === 'run') await run(data)
    else if (data.type === 'answer') runs.get(data.run)?.answer(data)
  } catch (error) {
    self.postMessage({ type: data.type === 'boot' ? 'failed' : 'done', run: data.run, ok: false, error: String(error?.message ?? error), logs: [] })
  }
}

/**
 * The runtime arrives as files: each module gets a blob URL, leaves first, with its
 * `./name.mjs` imports pointed at the URLs of the files they name.
 * @param {Record<string, string | ArrayBuffer>} all
 */
async function load(all) {
  const wasm = all['emscripten-module.wasm']
  /** @type {Record<string, string>} */
  const files = Object.fromEntries(Object.entries(all).filter(([name]) => name.endsWith('.mjs')))
  /** @type {Record<string, string>} */
  const urls = {}
  const pending = Object.keys(files)
  const imports = (/** @type {string} */ name) => [...files[name].matchAll(/["']\.\/([\w.-]+\.mjs)["']/g)].map((match) => match[1])
  while (pending.length) {
    const next = pending.findIndex((name) => imports(name).every((dep) => urls[dep] || !files[dep]))
    if (next < 0) throw new Error('The runtime has an import cycle')
    const [name] = pending.splice(next, 1)
    const text = files[name].replace(/(["'])\.\/([\w.-]+\.mjs)\1/g, (match, quote, dep) => (urls[dep] ? quote + urls[dep] + quote : match))
    urls[name] = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }))
  }
  const { newQuickJSWASMModuleFromVariant, newVariant } = await import(urls['index.mjs'])
  const variant = {
    type: 'sync',
    importFFI: () => import(urls['ffi.mjs']).then((module) => module.QuickJSFFI),
    importModuleLoader: () => import(urls['emscripten-module.mjs']).then((module) => module.default),
  }
  // The bytes come from Jean, so nothing is fetched; a location keeps Emscripten from
  // resolving one against import.meta.url, which a blob: URL can't be a base for.
  return newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmBinary: wasm, wasmLocation: 'emscripten-module.wasm' }))
}

// What a script can use, besides plain JavaScript. Every call goes through __call.
const PRELUDE = `
globalThis.tools = new Proxy({}, { get: (_, name) => (args = {}) => __call(String(name), JSON.stringify(args)) })
globalThis.searchTools = (query) => tools.find_tools({ query })
globalThis.models = { decide: async (state, questions) => JSON.parse(await tools.decide({ state, questions })) }
globalThis.file = (name) => tools.file({ file: name })
globalThis.csv = (text) => {
  const lines = String(text).replace(/\\r\\n?/g, '\\n').split('\\n').filter((line) => line.trim())
  const head = lines[0] ?? ''
  const separator = [',', ';', '\\t'].map((s) => [s, head.split(s).length]).sort((a, b) => b[1] - a[1])[0][0]
  const split = (line) => {
    const cells = []
    let cell = '', quoted = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (quoted) { if (c === '"' && line[i + 1] === '"') { cell += c; i++ } else if (c === '"') quoted = false; else cell += c }
      else if (c === '"') quoted = true
      else if (c === separator) { cells.push(cell); cell = '' }
      else cell += c
    }
    cells.push(cell)
    return cells.map((value) => value.trim()).map((value) => (/^-?\\d+(\\.\\d+)?$/.test(value) ? Number(value) : value))
  }
  const names = split(head).map(String)
  return lines.slice(1).map((line) => Object.fromEntries(split(line).map((value, i) => [names[i] ?? 'column ' + (i + 1), value])))
}
`

/** @param {{ run: number, code: string, limits: { memory: number, cpu: number, output: number } }} message */
async function run({ run: id, code, limits }) {
  const runtime = quickjs.newRuntime()
  runtime.setMemoryLimit(limits.memory)
  runtime.setMaxStackSize(512 * 1024)
  // Computing time only: waiting for Jean (or for the user's approval) doesn't count.
  let spent = 0
  let started = Date.now()
  runtime.setInterruptHandler(() => spent + Date.now() - started > limits.cpu)
  const step = (/** @type {() => void} */ work) => {
    started = Date.now()
    try {
      work()
    } finally {
      spent += Date.now() - started
    }
  }
  const vm = runtime.newContext()
  /** @type {string[]} */
  const logs = []
  let logged = 0
  let calls = 0
  /** @type {Map<number, any>} */
  const waiting = new Map()
  runs.set(id, {
    answer: ({ id: call, ok, value, error }) => {
      const deferred = waiting.get(call)
      if (!deferred) return
      waiting.delete(call)
      const handle = ok ? vm.newString(String(value)) : vm.newError(String(error))
      ok ? deferred.resolve(handle) : deferred.reject(handle)
      handle.dispose()
      step(() => runtime.executePendingJobs())
    },
  })
  try {
    const log = vm.newFunction('log', (/** @type {any[]} */ ...args) => {
      const line = args.map((handle) => show(vm.dump(handle))).join(' ')
      logged += line.length
      if (logged < limits.output) logs.push(line)
    })
    const console = vm.newObject()
    vm.setProp(console, 'log', log)
    vm.setProp(console, 'error', log)
    vm.setProp(vm.global, 'console', console)
    console.dispose()
    log.dispose()
    const host = vm.newFunction('__call', (/** @type {any} */ name, /** @type {any} */ args) => {
      const deferred = vm.newPromise()
      const call = ++calls
      waiting.set(call, deferred)
      self.postMessage({ type: 'call', run: id, id: call, name: vm.getString(name), args: JSON.parse(vm.getString(args)) })
      return deferred.handle
    })
    vm.setProp(vm.global, '__call', host)
    host.dispose()
    vm.unwrapResult(vm.evalCode(PRELUDE, 'prelude.js')).dispose()

    /** Waits for a value in the script's world, a promise or not. @param {any} handle */
    const settle = async (handle) => {
      const settled = vm.resolvePromise(handle)
      handle.dispose()
      step(() => runtime.executePendingJobs())
      const outcome = await settled
      if (outcome.error) {
        const error = vm.dump(outcome.error)
        outcome.error.dispose()
        throw new Error(typeof error === 'object' && error ? `${error.name ?? 'Error'}: ${error.message}` : String(error))
      }
      return outcome.value
    }
    // The result is what the script returns or, as in a console, its last expression
    // (small brains write `Math.cos(9)` and expect its value). First as a script with
    // top-level await, which resolves to { value: <last expression> }; a top-level return
    // doesn't parse there, and nothing ran, so then as the body of an async function.
    /** @type {any} */
    let evaluated
    step(() => { evaluated = vm.evalCode(code, 'script.js', ASYNC_SCRIPT) })
    const asScript = !evaluated.error
    if (!asScript) {
      evaluated.error.dispose()
      step(() => { evaluated = vm.evalCode(`(async () => {\n${code}\n})()`, 'script.js') })
    }
    let value = await settle(vm.unwrapResult(evaluated))
    if (asScript) {
      const completion = value
      value = await settle(vm.getProp(completion, 'value'))
      completion.dispose()
    }
    const result = vm.dump(value)
    value.dispose()
    self.postMessage({ type: 'done', run: id, ok: true, result: result === undefined ? null : result, logs })
  } catch (error) {
    const message = /interrupted/i.test(String(error)) ? 'The script used all its computing time and was stopped.'
      : /out of memory/i.test(String(error)) ? 'The script ran out of memory and was stopped.'
      : String(/** @type {any} */ (error)?.message ?? error)
    self.postMessage({ type: 'done', run: id, ok: false, error: message, logs })
  } finally {
    runs.delete(id)
    for (const deferred of waiting.values()) deferred.dispose()
    try {
      vm.dispose()
      runtime.dispose()
    } catch {
      // A script stopped mid-way can leave QuickJS unusable: ask for a fresh sandbox.
      quickjs = null
      self.postMessage({ type: 'reset' })
    }
  }
}

/** @param {unknown} value */
function show(value) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}
