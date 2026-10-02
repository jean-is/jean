// Runs Python the brain wrote, with Pyodide (CPython on WebAssembly), in the Python sandbox's
// worker (caps/python/sandbox.html): an opaque origin with no network. Pyodide's loader expects
// to fetch its files; here they arrive from Jean in the boot message, and fetch() serves only
// those (D80). Same messages as the QuickJS worker (ui/sandbox.js).
// A classic script (no static imports): the sandbox can only start classic workers. Pyodide
// refuses classic workers when importScripts() accepts a data: URL; the sandbox's policy
// refuses data: scripts, so it never does.

// Never resolved: the fetch below answers for it.
const INDEX = 'https://sandbox.invalid/pyodide/'

// What a script can use, besides Python's standard library. Every call goes through _call.
const PRELUDE = `
import json as _json

class _Tools:
    def __getattr__(self, name):
        async def call(**args):
            return await _call(name, _json.dumps(args))
        return call

tools = _Tools()

async def file(name):
    return await tools.file(file=name)

async def search_tools(query):
    return await tools.find_tools(query=query)
`

/** @type {any} */
let pyodide = null
/** @type {Map<number, { answer: (message: any) => void }>} */
const runs = new Map()

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'boot') {
      pyodide ??= await load(data.files)
      self.postMessage({ type: 'ready' })
    } else if (data.type === 'run') await run(data)
    else if (data.type === 'answer') runs.get(data.run)?.answer(data)
  } catch (error) {
    self.postMessage({ type: data.type === 'boot' ? 'failed' : 'done', run: data.run, ok: false, error: String(error?.message ?? error), logs: [] })
  }
}

/** @param {Record<string, string | ArrayBuffer>} files */
async function load(files) {
  self.fetch = async (input) => {
    const url = String(input?.url ?? input)
    const body = url.startsWith(INDEX) ? files[url.slice(INDEX.length)] : undefined
    if (body === undefined) throw new TypeError('There is no network in the sandbox.')
    return new Response(body, { headers: { 'Content-Type': url.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' } })
  }
  const module = (/** @type {string} */ name) => import(URL.createObjectURL(new Blob([files[name]], { type: 'text/javascript' })))
  const [{ loadPyodide }, { default: createPyodideModule }] = await Promise.all([module('pyodide.mjs'), module('pyodide.asm.mjs')])
  // `import js` reaches only this empty object, not the worker's globals.
  return loadPyodide({ indexURL: INDEX, lockFileContents: files['pyodide-lock.json'], packageBaseUrl: INDEX, createPyodideModule, jsglobals: {} })
}

/** @param {{ run: number, code: string, limits: { output: number } }} message */
async function run({ run: id, code, limits }) {
  /** @type {string[]} */
  const logs = []
  let logged = 0
  const write = (/** @type {string} */ line) => {
    logged += line.length
    if (logged < limits.output) logs.push(line)
  }
  pyodide.setStdout({ batched: write })
  pyodide.setStderr({ batched: write })
  let calls = 0
  /** @type {Map<number, { resolve: (value: string) => void, reject: (error: Error) => void }>} */
  const waiting = new Map()
  runs.set(id, {
    answer: ({ id: call, ok, value, error }) => {
      const pending = waiting.get(call)
      waiting.delete(call)
      if (ok) pending?.resolve(String(value))
      else pending?.reject(new Error(String(error)))
    },
  })
  const scope = pyodide.globals.get('dict')()
  try {
    scope.set('_call', (/** @type {string} */ name, /** @type {string} */ args) => new Promise((resolve, reject) => {
      const call = ++calls
      waiting.set(call, { resolve, reject })
      self.postMessage({ type: 'call', run: id, id: call, name, args: JSON.parse(args) })
    }))
    await pyodide.runPythonAsync(PRELUDE, { globals: scope })
    // The result is the value of the last line, as in a console, as JSON (anything else as text).
    const value = await pyodide.runPythonAsync(code, { globals: scope })
    scope.set('_result', value)
    value?.destroy?.()
    const json = pyodide.runPython('_json.dumps(_result, default=str, ensure_ascii=False)', { globals: scope })
    self.postMessage({ type: 'done', run: id, ok: true, result: JSON.parse(json), logs })
  } catch (error) {
    self.postMessage({ type: 'done', run: id, ok: false, error: explain(error), logs })
  } finally {
    runs.delete(id)
    scope.destroy()
  }
}

/**
 * A Python error carries its whole traceback: keep where it happened and what happened, but
 * not Pyodide's advice to install a package, which can't be done here.
 * @param {any} error
 */
function explain(error) {
  const lines = String(error?.message ?? error).trim().split('\n')
  const frame = lines.findLastIndex((line) => /^\s*File "/.test(line))
  const what = lines.slice(frame + 1).filter((line) => !/^\s/.test(line))
  const advice = what.findIndex((line) => /^You can install it/.test(line))
  if (advice >= 0) what.splice(advice, what.length, 'Only the standard library is available here.')
  return [lines[frame]?.trim(), ...what].filter(Boolean).join('\n')
}
