// Data toolkit: Python, for data work that goes beyond simple maths (docs/product.md). Pyodide
// runs the brain's script in its own sandbox (caps/python/sandbox.html, D80): an opaque origin
// with no network, which receives Pyodide's files from Jean. Only Python's standard library is
// there (csv, statistics, decimal, datetime…): no package can be fetched. As in Calculations, a
// script can read shared files and call Jean's tools, under the same rules (D48).
import { register } from '../../ui/caps.js'
import { sandbox } from '../../ui/sandbox.js'

// No limit on memory or computing time inside Pyodide (it would need a cross-origin isolated
// page): the parent's watchdog stops a script that goes quiet for 40 s. 60 s to start.
const python = sandbox({
  capability: 'python',
  runtime: 'vendor/pyodide/',
  worker: new URL('./python-worker.js', import.meta.url),
  page: new URL('./sandbox.html', import.meta.url),
  limits: { output: 6000 },
  bootMs: 60_000,
})

/** @type {import('../../core/loop.js').Tool} */
const pythonTool = {
  spec: {
    name: 'python',
    description: [
      'Run Python 3 in a sandbox with no network. Only the standard library is available (csv, statistics, decimal, datetime, json, re, math…).',
      'Top-level await works; the value of the last line comes back as JSON, with anything printed.',
      'Available in scripts: await file(name) returns the whole text of a shared file (spreadsheets as tab-separated rows under "Sheet:" lines);',
      'await tools.<name>(**args) calls any tool, including ones found with await search_tools(query).',
    ].join(' '),
    parameters: { type: 'object', properties: { code: { type: 'string', description: 'The script' } }, required: ['code'] },
  },
  kind: 'execute',
  title: () => 'Python',
  run: (args, ctx) => python.execute(String(args?.code ?? ''), ctx),
}

register({
  id: 'python',
  tools: [pythonTool],
  lines: [{ name: 'python', line: 'run Python (its standard library only) in a sandbox, for data work beyond simple maths' }],
})
