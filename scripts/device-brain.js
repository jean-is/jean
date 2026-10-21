// Jean's device brain as an OpenAI-compatible server, so that npm run tables (or any runner that takes
// BRAIN_ADDRESS) measures Jean's own runtime: Gemma 4 E2B through caps/brain-local/brain-worker.js,
// Transformers.js and ONNX Runtime on WebGPU, in headless Chromium, with the messages, tools, parser
// (gemma.js) and watermark brain-local.js uses. Requests are answered one at a time, as the worker
// does; each prints its timings. The weights, at the revision Jean pins, are downloaded once into
// --weights in Hugging Face's layout, and the browser's profile, which keeps its own copy, goes at exit.
// Usage: node scripts/device-brain.js q4f16                 what Jean ships (3.1 GB), its worker unchanged
//        node scripts/device-brain.js mixed                 the 8-bit decoder with the 4-bit embeddings (4.6 GB)
//        node scripts/device-brain.js q8                    all 8-bit (6.2 GB), which ONNX Runtime can't load
//        … --port 4417 --weights <dir>                      (default: <tmp>/jean-device-brain)
//   then BRAIN=custom:device BRAIN_ADDRESS=http://127.0.0.1:4417/v1 npm run tables -- --parallel 1
// Needs Playwright's Chromium, as the e2e tests do. Chromium gives a worker no buffer of 2 GiB or more,
// and the 8-bit decoder's and embeddings' files are larger: for those the worker gives ONNX Runtime the
// files' addresses, which it streams into its own memory, rather than reading them from its cache.
import { createServer } from 'node:http'
import { createReadStream, readFileSync, statSync, mkdirSync, rmSync } from 'node:fs'
import { mkdir, open, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { BRAIN, REVISION } from '../app/caps/brain-local/watermark.js'

const APP = fileURLToPath(new URL('../app/', import.meta.url))
const argv = process.argv.slice(2)
const flag = (/** @type {string} */ name, /** @type {string} */ fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback)
const dtype = argv[0] ?? 'q4f16'
const PORT = Number(flag('--port', '4417'))
const WEIGHTS = flag('--weights', join(tmpdir(), 'jean-device-brain'))
const BUILDS = /** @type {Record<string, { dtype: string | Record<string, string>, files: string[] }>} */ ({
  q4f16: { dtype: 'q4f16', files: ['embed_tokens_q4f16.onnx_data', 'decoder_model_merged_q4f16.onnx_data'] },
  // Transformers.js names 8 bits "q8" and their files "_quantized"; Hugging Face splits those files.
  mixed: { dtype: { embed_tokens: 'q4f16', decoder_model_merged: 'q8' }, files: ['embed_tokens_q4f16.onnx_data', 'decoder_model_merged_quantized.onnx_data', 'decoder_model_merged_quantized.onnx_data_1'] },
  q8: { dtype: 'q8', files: ['embed_tokens_quantized.onnx_data', 'embed_tokens_quantized.onnx_data_1', 'embed_tokens_quantized.onnx_data_2', 'decoder_model_merged_quantized.onnx_data', 'decoder_model_merged_quantized.onnx_data_1'] },
})
const build = BUILDS[dtype]
if (!build) throw new Error(`name a build: ${Object.keys(BUILDS).join(', ')}`)
const SMALL = ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'chat_template.jinja', 'preprocessor_config.json', 'processor_config.json']
const graphs = [...new Set(build.files.map((file) => `onnx/${file.replace(/\.onnx_data(_\d+)?$/, '.onnx')}`))]
const TYPES = /** @type {Record<string, string>} */ ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.jinja': 'text/plain; charset=utf-8' })

/** Each file not yet in WEIGHTS, from Hugging Face: a large one in parallel ranges, written at their offsets. @param {string[]} paths */
async function download(paths) {
  for (const path of paths) {
    const url = `https://huggingface.co/${BRAIN}/resolve/${REVISION}/${path}`
    const target = join(WEIGHTS, BRAIN, 'resolve', REVISION, path)
    await mkdir(dirname(target), { recursive: true })
    const head = await fetch(url, { method: 'HEAD', redirect: 'manual' })
    const size = Number(head.headers.get('x-linked-size'))
    const have = await stat(target).then((info) => info.size, () => -1)
    if (size ? have === size : have > 0) continue
    const handle = await open(target, 'w')
    if (!size) {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${path}: ${response.status}`)
      await handle.write(new Uint8Array(await response.arrayBuffer()))
      await handle.close()
      continue
    }
    const location = /** @type {string} */ (head.headers.get('location'))
    await handle.truncate(size)
    const pieces = []
    for (let at = 0; at < size; at += 2 ** 24) pieces.push([at, Math.min(size, at + 2 ** 24) - 1])
    console.log(`downloading ${path}, ${(size / 1e9).toFixed(2)} GB`)
    await Promise.all(Array.from({ length: 24 }, async () => {
      while (pieces.length) {
        const [from, to] = /** @type {number[]} */ (pieces.shift())
        for (let attempt = 0; ; attempt++) {
          try {
            const response = await fetch(location, { headers: { Range: `bytes=${from}-${to}` } })
            const bytes = new Uint8Array(await response.arrayBuffer())
            if (response.status !== 206 || bytes.length !== to - from + 1) throw new Error(`${path}: status ${response.status}, ${bytes.length} bytes`)
            await handle.write(bytes, 0, bytes.length, from)
            break
          } catch (error) {
            if (attempt > 8) throw error
            await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)))
          }
        }
      }
    }))
    await handle.close()
    if ((await stat(target)).size !== size) throw new Error(`${path}: not all of it came`)
  }
}

/** Jean's worker, given the list of weights files, and their addresses for a build whose files are over 2 GiB. */
function worker() {
  const source = readFileSync(join(APP, 'caps/brain-local/brain-worker.js'), 'utf8')
  const changes = [
    ['function load({ host, model, revision, dtype }, id) {', 'function load({ host, model, revision, dtype, files }, id) {'],
    ["loading ??= Promise.all(['embed_tokens', 'decoder_model_merged'].map((part) => weights(`${host.replace(/\\/$/, '')}/${model}/resolve/${revision}/onnx/${part}_${dtype}.onnx_data`, progress_callback)))",
      "loading ??= Promise.all((files ?? ['embed_tokens', 'decoder_model_merged'].map((part) => `${part}_${dtype}.onnx_data`)).map((file) => weights(`${host.replace(/\\/$/, '')}/${model}/resolve/${revision}/onnx/${file}`, progress_callback)))"],
    ...(dtype === 'q4f16' ? [] : [['data: data instanceof URL ? await read(data.href) : data', 'data: data instanceof URL ? data.href : data']]),
  ]
  return changes.reduce((text, [from, to]) => {
    if (!text.includes(from)) throw new Error('Jean’s worker changed: see how it loads its weights again')
    return text.replace(from, to)
  }, source)
}

const PAGE = /* html */ `<!doctype html>
<meta charset="utf-8">
<title>Device brain</title>
<script type="module">
import { gemmaParser } from '/caps/brain-local/gemma.js'
const worker = new Worker('/caps/brain-local/brain-worker-measured.js', { type: 'module' })
let next = 1
const call = (message, onChunk) => new Promise((resolve, reject) => {
  const id = next++
  const listen = ({ data }) => {
    if (data.id !== id) return
    if (data.type === 'chunk') onChunk?.(data.text)
    else if (data.type === 'progress') window.progress = data
    else if (data.type === 'error' || data.type === 'ready' || data.type === 'done') {
      worker.removeEventListener('message', listen)
      if (data.type === 'error') reject(new Error(data.message))
      else resolve(data)
    }
  }
  worker.addEventListener('message', listen)
  worker.postMessage({ ...message, id })
})
window.brain = {
  load: (dtype, files) => call({ type: 'load', host: location.origin + '/hf/', model: '${BRAIN}', revision: '${REVISION}', dtype, files }),
  async generate(messages, tools, maxTokens) {
    const parser = gemmaParser()
    const events = []
    let first = 0
    const started = performance.now()
    const done = await call({ type: 'generate', messages, tools, maxTokens, contextTokens: 32768 }, (chunk) => {
      first ||= performance.now()
      events.push(...parser.feed(chunk))
    })
    events.push(...parser.end())
    return { text: events.filter((e) => e.type === 'text').map((e) => e.delta).join(''), calls: events.filter((e) => e.type === 'tool_call').map((e) => e.call),
      usage: done.usage, firstMs: first - started, ms: performance.now() - started }
  },
}
window.ready = true
</script>`

await download([...SMALL, ...graphs, ...build.files.map((file) => `onnx/${file}`)])

const site = createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://x')
  const headers = { 'Cache-Control': 'no-cache', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }
  try {
    if (pathname === '/device.html') return res.writeHead(200, { ...headers, 'Content-Type': TYPES['.html'] }).end(PAGE)
    if (pathname === '/caps/brain-local/brain-worker-measured.js') return res.writeHead(200, { ...headers, 'Content-Type': TYPES['.js'] }).end(worker())
    // Hugging Face's main is the revision Jean pins, here.
    const file = pathname.startsWith('/hf/') ? join(WEIGHTS, normalize(decodeURIComponent(pathname.slice(4)).replace('/resolve/main/', `/resolve/${REVISION}/`))) : join(APP, normalize(decodeURIComponent(pathname)))
    const size = statSync(file).size
    res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Length': size })
    createReadStream(file).pipe(res)
  } catch {
    res.writeHead(404).end()
  }
})
await new Promise((ready) => site.listen(0, '127.0.0.1', () => ready(undefined)))

const PROFILE = join(tmpdir(), `jean-device-brain-profile-${process.pid}`)
mkdirSync(PROFILE, { recursive: true })
const { chromium } = await import('@playwright/test')
const context = await chromium.launchPersistentContext(PROFILE, { headless: true, channel: 'chromium', serviceWorkers: 'block', args: ['--enable-unsafe-webgpu'] })
const close = async () => {
  await context.close().catch(() => {})
  rmSync(PROFILE, { recursive: true, force: true })
  process.exit(0)
}
process.on('SIGINT', close)
process.on('SIGTERM', close)
/** What this browser's processes hold, in GB: only those that name its profile. */
const memory = () => Number((execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8' }).split('\n').filter((row) => row.includes(PROFILE))
  .reduce((sum, row) => sum + Number(row.trim().split(/\s+/)[0]), 0) / 2 ** 20).toFixed(1))
const page = context.pages()[0] ?? await context.newPage()
page.setDefaultTimeout(0)
page.on('pageerror', (error) => console.log('[page]', error.message))
await page.goto(`http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (site.address()).port}/device.html`)
await page.waitForFunction(() => /** @type {any} */ (window).ready)
let peak = 0
const watching = setInterval(() => { peak = Math.max(peak, memory()) }, 2000)
const started = Date.now()
try {
  await page.evaluate(([d, f]) => /** @type {any} */ (window).brain.load(d, f), /** @type {const} */ ([build.dtype, build.files]))
} catch (error) {
  console.log(JSON.stringify({ failed: dtype, error: error instanceof Error ? error.message : String(error), peakGB: Math.max(peak, memory()) }))
  await close()
}
clearInterval(watching)
console.log(JSON.stringify({ loaded: dtype, seconds: Math.round((Date.now() - started) / 1000), memoryGB: memory(), peakGB: Math.max(peak, memory()) }))

/** The wire's messages as brain-local.js gives them: arguments as objects, a tool's result with its name. @param {any[]} messages */
function deviceMessages(messages) {
  /** @type {Record<string, string>} */
  const names = {}
  return messages.map((message) => {
    if (message.role === 'tool') return { ...message, name: names[message.tool_call_id] }
    if (message.role !== 'assistant' || !message.tool_calls) return message
    for (const call of message.tool_calls) names[call.id] = call.function.name
    return { ...message, tool_calls: message.tool_calls.map((/** @type {any} */ call) => ({ ...call, function: { ...call.function,
      arguments: typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments || '{}') : call.function.arguments } })) }
  })
}

let queue = Promise.resolve()
createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://x')
  if (pathname.endsWith('/models')) return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: [{ id: `gemma-4-e2b-${dtype}` }] }))
  if (!pathname.endsWith('/chat/completions')) return res.writeHead(404).end()
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => { queue = queue.then(() => answer(JSON.parse(body), res)) })
}).listen(PORT, '127.0.0.1', () => console.log(`ready: BRAIN=custom:device BRAIN_ADDRESS=http://127.0.0.1:${PORT}/v1`))

/** One request, answered as an OpenAI-compatible server does, streamed or whole. @param {any} request @param {import('node:http').ServerResponse} res */
async function answer(request, res) {
  try {
    const reply = await page.evaluate(([m, t, n]) => /** @type {any} */ (window).brain.generate(m, t, n), [deviceMessages(request.messages), request.tools ?? [], request.max_tokens ?? 4096])
    const output = reply.usage?.outputTokens ?? 0
    console.log(JSON.stringify({ input: reply.usage?.inputTokens, output, firstMs: Math.round(reply.firstMs), ms: Math.round(reply.ms),
      tokensPerSecond: Number((output / Math.max(0.001, (reply.ms - reply.firstMs) / 1000)).toFixed(1)), calls: reply.calls.length }))
    const calls = reply.calls.map((/** @type {any} */ call, index) => ({ index, id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }))
    const usage = { prompt_tokens: reply.usage?.inputTokens ?? 0, completion_tokens: output }
    const finish = calls.length ? 'tool_calls' : 'stop'
    if (!request.stream) {
      return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: reply.text, ...(calls.length && { tool_calls: calls }) }, finish_reason: finish }], usage }))
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const data of [{ choices: [{ index: 0, delta: { role: 'assistant', content: reply.text } }] }, ...(calls.length ? [{ choices: [{ index: 0, delta: { tool_calls: calls } }] }] : []),
      { choices: [{ index: 0, delta: {}, finish_reason: finish }] }, { choices: [], usage }]) res.write(`data: ${JSON.stringify(data)}\n\n`)
    res.end('data: [DONE]\n\n')
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error) } }))
  }
}
