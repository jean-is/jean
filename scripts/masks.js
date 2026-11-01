// Measures how well masked requests (D681) hide people's names: Jean's own worker in headless Chromium, on WebAssembly with
// one thread and no graphics chip as Jean's pages get, over an annotated set of written documents in eight languages, marked
// through the engine's whole pipeline. Any new model, export or Transformers.js upgrade can move these numbers.
// Weights are fetched once into test/masks/.cache/, never committed.
// Usage: npm run masks
//        npm run masks -- --thresholds 0.002,0.005,0.01   the thresholds to show
//        npm run masks -- --speed                         also 10 pages' seconds and the tab's memory
//        npm run masks -- --look README.md                what it flags in a text with few names
//        npm run masks -- --write                         also write test/masks/results.md
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import { fire } from '../app/core/hooks.js'
import { maskHooks, plainOf } from '../app/ee/mask.js'
import { namesIn, THRESHOLD, UNCAPITALISED } from '../app/ee/names.js'
import { MODEL, READER } from '../app/ee/model.js'
import { coverOf, parse, tally, wilson } from '../test/masks/score.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HERE = join(ROOT, 'test/masks')
const CACHE = join(HERE, '.cache')
const GATE = { recall: 0.95, over: 0.05 }
const LANGS = ['en', 'fr', 'de', 'es', 'ar', 'ja', 'zh', 'ko']
const LATIN = ['en', 'fr', 'de', 'es']
const option = (/** @type {string} */ name) => { const at = process.argv.indexOf(`--${name}`); return at < 0 ? undefined : process.argv[at + 1] }
const has = (/** @type {string} */ name) => process.argv.includes(`--${name}`)
const THRESHOLDS = (option('thresholds') ?? `${THRESHOLD},0.002,0.01,0.05`).split(',').map(Number)
const LOWER = Number(option('uncapitalised') ?? UNCAPITALISED)
const TYPES = /** @type {Record<string, string>} */ ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' })

/** Jean's files, and the weights, fetched the first time. */
const serve = () => new Promise((resolve) => {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname)
    if (path === '/page') { response.writeHead(200, { 'Content-Type': 'text/html' }); return response.end('<!doctype html><title>masks</title>') }
    let file = join(ROOT, 'app', path)
    if (path.startsWith('/weights/')) {
      file = join(CACHE, path)
      if (!existsSync(file)) {
        const got = await fetch(`https://huggingface.co/${path.slice('/weights/'.length)}`)
        if (!got.ok) { response.writeHead(404); return response.end() }
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, Buffer.from(await got.arrayBuffer()))
      }
    }
    if (!existsSync(file) || statSync(file).isDirectory()) { response.writeHead(404); return response.end() }
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Length': statSync(file).size })
    createReadStream(file).pipe(response)
  })
  server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${/** @type {any} */ (server.address()).port}` }))
})

const { server, origin } = /** @type {any} */ (await serve())
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-webgpu'] })
const page = await (await browser.newContext()).newPage()
page.on('pageerror', (error) => console.warn('[page]', error.message))
await page.goto(`${origin}/page`)
await page.evaluate(() => {
  const worker = new Worker('/ee/mask-worker.js', { type: 'module' })
  const waiting = new Map()
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') return
    waiting.get(data.id)?.(data)
    waiting.delete(data.id)
  }
  let ids = 0
  ;/** @type {any} */ (window).ask = (message) => new Promise((resolve) => {
    const id = ++ids
    waiting.set(id, resolve)
    worker.postMessage({ ...message, id })
  })
})
const ask = (/** @type {any} */ message) => page.evaluate((/** @type {any} */ one) => /** @type {any} */ (window).ask(one), message)
const ready = await ask({ type: 'load', host: `${origin}/weights/`, model: MODEL.model, revision: MODEL.revision, files: MODEL.files })
if (ready.type !== 'ready') throw new Error(`The model didn't load: ${ready.message}`)

const read = async (/** @type {string} */ text) => {
  const said = await ask({ type: 'read', text })
  if (said.type !== 'read') throw new Error(said.message)
  return /** @type {[number, number, number][]} */ (said.flagged)
}

if (has('look')) {
  const text = readFileSync(join(ROOT, option('look') ?? 'README.md'), 'utf8')
  const flagged = await read(text)
  for (const threshold of THRESHOLDS) {
    const names = namesIn(text, flagged, threshold, LOWER).map(({ start, end }) => text.slice(start, end))
    const counts = new Map()
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
    const words = [...new Intl.Segmenter('en', { granularity: 'word' }).segment(text)].filter((word) => word.isWordLike).length
    console.log(`P≥${threshold}: ${names.length} found in ${words} words (${(100 * names.length / words).toFixed(1)}%): ${[...counts].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([name, n]) => `${name}${n > 1 ? `×${n}` : ''}`).join(', ')}`)
  }
}

/** What the engine leaves of a document, for a threshold. @param {any} doc @param {[number, number, number][]} flagged @param {number} threshold */
async function masked(doc, flagged, threshold) {
  const hooks = maskHooks({ mask: { hide: ['person'] } }, {
    isLocal: () => false,
    load: async () => ({ id: doc.id, records: [] }),
    keep: async () => {},
    assistant: () => 'Jean',
    open: () => false,
    heldReason: () => '',
    why: () => '',
    mayGo: () => '',
    reason: () => '',
    names: async (text) => (text === plainOf(doc.text) ? namesIn(text, flagged, threshold, LOWER) : []),
    // eslint-disable-next-line require-yield
    async* refused(why) { throw new Error(why) },
    scripts: 'any',
  })
  let wire = ''
  for await (const _ of await fire(hooks, 'turn.step', { task: 't', brain: { id: 'b', model: 'm' }, system: '', messages: [{ role: 'user', content: doc.text }] }, async function* (/** @type {any} */ going) {
    wire = going.messages[0].content
  }));
  return wire
}

const readings = /** @type {Record<string, any[]>} */ ({})
const lines = []
for (const lang of LANGS) {
  const file = join(HERE, 'corpus', `${lang}.txt`)
  if (!existsSync(file)) continue
  const docs = parse(readFileSync(file, 'utf8'), lang)
  const stored = join(CACHE, `readings-${READER}-${MODEL.revision.slice(0, 8)}-${lang}.json`)
  if (existsSync(stored) && !has('again')) readings[lang] = JSON.parse(readFileSync(stored, 'utf8'))
  else {
    const started = performance.now()
    readings[lang] = []
    for (const doc of docs) readings[lang].push(await read(plainOf(doc.text)))
    mkdirSync(CACHE, { recursive: true })
    writeFileSync(stored, JSON.stringify(readings[lang]))
    console.log(`${lang}: ${docs.length} documents read in ${((performance.now() - started) / 1000).toFixed(1)} s`)
  }
  for (const threshold of THRESHOLDS) {
    const total = { names: 0, whole: 0, words: 0, over: 0, misses: /** @type {string[]} */ ([]), overs: /** @type {string[]} */ ([]) }
    for (const [i, doc] of docs.entries()) {
      const one = tally(doc, coverOf(doc.text, await masked(doc, readings[lang][i], threshold)))
      total.names += one.names
      total.whole += one.whole
      total.words += one.words
      total.over += one.over
      total.misses.push(...one.misses)
      total.overs.push(...one.overs)
    }
    const recall = total.whole / total.names
    const over = total.over / total.words
    const [low, high] = wilson(total.whole, total.names)
    const pass = recall >= GATE.recall && over < GATE.over
    const counts = new Map()
    for (const word of total.overs) counts.set(word, (counts.get(word) ?? 0) + 1)
    lines.push({ lang, threshold, names: total.names, recall, low, high, over, pass, misses: total.misses, overs: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, n]) => `${word}×${n}`) })
  }
}
const pct = (/** @type {number} */ x) => (100 * x).toFixed(1)
const rows = lines.map((line) => `| ${line.lang} | ${line.threshold} | ${line.names} | ${pct(line.recall)} | ${pct(line.low)}–${pct(line.high)} | ${pct(line.over)} | ${line.pass ? 'pass' : 'fail'} |`)
const table = ['| Language | Threshold | Names | Recall | 95% range | Over-masked | Gates |', '|---|---:|---:|---:|---|---:|---|', ...rows].join('\n')
console.log(`\n${table}\n`)
for (const line of lines) if (line.threshold === THRESHOLD && LATIN.includes(line.lang)) console.log(`${line.lang} missed: ${line.misses.slice(0, 12).join(', ') || 'none'}\n${line.lang} over-masked: ${line.overs.join(', ')}`)

let speed = ''
if (has('speed')) {
  const text = readFileSync(join(HERE, 'corpus', 'en.txt'), 'utf8').replace(/\[\[[A-Z]+:([^\]]*)\]\]/g, '$1').slice(0, 30_000)
  const started = performance.now()
  await read(`${text} `)
  const seconds = (performance.now() - started) / 1000
  const cdp = await browser.newBrowserCDPSession()
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo')
  const pids = processInfo.filter((one) => one.type === 'renderer').map((one) => one.id)
  const memory = execFileSync('/bin/ps', ['-o', 'rss=', '-p', pids.join(',')], { encoding: 'utf8' }).trim().split(/\s+/).reduce((sum, one) => sum + Number(one), 0) / 1024 / 1024
  speed = `10 pages (30,000 characters) on one thread here: ${seconds.toFixed(1)} s; the tab now holds ${memory.toFixed(2)} GB.`
  console.log(speed)
}
if (has('write')) {
  writeFileSync(join(HERE, 'results.md'), `# Names in masked requests: what Jean's worker finds\n\nWritten by \`npm run masks -- --write\`. ${MODEL.model} at ${MODEL.revision.slice(0, 8)}, through the engine's whole pipeline, in headless Chromium on one thread of WebAssembly. The set is written, not real, and deliberately dense with names: 120 documents, every person invented. A name counts only if every letter of it is hidden. Gates: recall at least 95%, over-masked under 5%. Only en, fr, de and es are claimed: text holding letters of another script is refused.\n\n${table}\n${speed ? `\n${speed}\n` : ''}`)
}
await browser.close()
server.close()
