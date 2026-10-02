// Calculations: Jean works numbers out exactly by writing a short script, run in QuickJS
// inside the sandbox (sandbox.html: an opaque origin with no network). Codemode (D48): a
// script can read shared files and call Jean's tools, deferred ones included; each call
// goes through Do it / Ask me first / Never and shows under the run in the activity view.
// The sandbox gets code and data, never a key: Jean makes every call itself.
import { register } from '../../ui/caps.js'
import { sandbox } from '../../ui/sandbox.js'
import { imageTool } from './images.js'

// 64 MB of memory, 20 s of computing time (waiting on Jean or on the user doesn't count),
// 6,000 characters of log; 20 s to start (D65).
const quickjs = sandbox({
  capability: 'compute',
  runtime: 'vendor/quickjs/',
  worker: new URL('./sandbox-worker.js', import.meta.url),
  page: new URL('../../sandbox.html', import.meta.url),
  limits: { memory: 64 * 1024 * 1024, cpu: 20_000, output: 6000 },
  bootMs: 20_000,
})

/** @type {import('../../core/loop.js').Tool} */
const runTool = {
  spec: {
    name: 'run',
    description: [
      'Run JavaScript in a sandbox with no network. Top-level await works; return the result, which comes back as JSON with anything logged.',
      'Available in scripts: await file(name) returns the whole text of a shared file (spreadsheets as tab-separated rows under "Sheet:" lines);',
      'csv(text) turns CSV or tab-separated text into rows, objects keyed by the header, numbers as numbers;',
      'await tools.<name>({ … }) calls any tool, including ones found with await searchTools(query) and those of connected services;',
      'await models.decide(state, questions) asks the on-device decision helper, when it is on (types noul, choice, score);',
      'await models.image(description) makes a picture, which the user sees.',
    ].join(' '),
    parameters: { type: 'object', properties: { code: { type: 'string', description: 'The script' } }, required: ['code'] },
  },
  kind: 'execute',
  title: () => 'Calculate',
  run: (args, ctx) => quickjs.execute(String(args?.code ?? ''), ctx),
}

register({
  id: 'compute',
  tools: [runTool, imageTool],
  lines: [{ name: 'run', line: 'run JavaScript in a sandbox to work things out exactly; scripts can read shared files and call tools' }],
  rules: ['Compute numbers with run instead of estimating them.'],
})
