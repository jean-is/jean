// The document evals (test/documents/): a fictional company's files at five sizes and in every
// format Jean reads, the questions asked of them, and how each way of reading them scores.
// Usage: npm run documents -- --fixture              print test/fixtures/documents-xs.pdf with Chromium
//        npm run documents -- --corpus xl            make (or reuse) a corpus and report its size
//        npm run documents -- --retrieval --sizes s,m --seeds 1,2,3 [--split test] [--passage 200]
//                                 [--strategies pages,lexical,exact,lexical+exact,preselect,dense:e5,hybrid:e5]
//                                                    score the strategies, keeping each run's results in .cache/results/
//        npm run documents -- --bench scan,first-search  H1: a flat vector scan at 1, 10 and 40 times XL; H6: the first search of XL in Chromium slowed 4×
//        npm run documents -- --answers H4,H5 [--concurrency 3]   the answer eval with OpenRouter's free brains (OPENROUTER_API_KEY),
//                                 resuming where it stopped; it stops itself when the day's free requests run low
// Generated files are kept in test/documents/.cache/ (never committed), keyed by seed and size.
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { corpus, files } from '../test/documents/corpus.js'
import { bytesOf, extract, html } from '../test/documents/formats.js'
import { pageText } from '../app/caps/files/extract.js'
import { STRATEGIES, denseStrategies, evaluate, nearest, prepare } from '../test/documents/retrieval.js'
import { percentile } from '../test/documents/stats.js'
import { embed, int8 } from '../test/documents/dense.js'
import { BRAINS, ask, grade, grounded, library } from '../test/documents/answers.js'
import { rng } from '../test/documents/corpus.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const CACHE = `${ROOT}test/documents/.cache/`

/** @param {string[]} argv */
const options = (argv) => {
  const value = (/** @type {string} */ name, /** @type {string} */ fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback)
  return { argv, has: (/** @type {string} */ name) => argv.includes(`--${name}`), value }
}

/** @type {Promise<any> | null} */
let browser = null
/**
 * A PDF of blocks, printed by Chromium: A4, a running header with the title and page numbers in the footer.
 * @param {import('../test/documents/corpus.js').Block[]} blocks @param {string} title
 */
export async function printPdf(blocks, title) {
  const { chromium } = await import('@playwright/test')
  browser ??= chromium.launch()
  const page = await (await browser).newPage()
  try {
    await page.setContent(html(blocks, title), { waitUntil: 'load', timeout: 0 })
    return new Uint8Array(await page.pdf({ format: 'A4', displayHeaderFooter: true, timeout: 0, margin: { top: '16mm', bottom: '16mm', left: '13mm', right: '13mm' },
      headerTemplate: `<div style="font: 7pt Helvetica; width: 100%; text-align: center">${title.replace(/</g, '&lt;')}</div>`,
      footerTemplate: '<div style="font: 7pt Helvetica; width: 100%; text-align: center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' }))
  } finally {
    await page.close()
  }
}

/**
 * A layout's files, made once and kept: bytes on disk, and their text as Jean extracts it.
 * @param {{ seed: number, size: any, layout: 'compendium' | 'project', ext?: string }} which
 * @returns {Promise<{ corpus: ReturnType<typeof corpus>, files: { name: string, path: string, bytes: number, pages: string[] }[] }>}
 */
export async function made({ seed, size, layout, ext = 'pdf' }) {
  const c = corpus({ seed, size })
  const dir = `${CACHE}${seed}-${size}-${layout}${layout === 'compendium' ? `-${ext}` : ''}/`
  await mkdir(dir, { recursive: true })
  const out = []
  for (const file of files(c.sections, layout, ext)) {
    const path = `${dir}${file.name}`
    const text = `${path}.pages.json`
    if (!existsSync(text)) {
      const bytes = file.name.endsWith('.pdf') ? await printPdf(file.blocks, file.name.replace(/\.pdf$/, '')) : await bytesOf(file)
      await writeFile(path, bytes)
      await writeFile(text, JSON.stringify(await extract(file.name, bytes, pageText)))
    }
    out.push({ name: file.name, path, bytes: (await stat(path)).size, pages: JSON.parse(await readFile(text, 'utf8')) })
  }
  return { corpus: c, files: out }
}

/** Tokens by Kev's tokenizer (Qwen's, cached by npm run reflexes) and by Jean's estimate. @param {string} text */
async function tokens(text) {
  const { AutoTokenizer, env } = await import('@huggingface/transformers')
  env.allowRemoteModels = false
  const tokenizer = await AutoTokenizer.from_pretrained('onnx-community/kev-0.6b-ONNX').catch(() => null)
  return { qwen: tokenizer ? tokenizer.encode(text).length : null, jean: Math.ceil(new TextEncoder().encode(text).length / 3) }
}

/**
 * Vectors of a corpus's passages for an embedder, made once and kept beside the corpus.
 * @param {string} dir @param {import('../test/documents/retrieval.js').Doc[]} docs @param {any} model @param {number} size
 */
async function passageVectors(dir, docs, model, size) {
  const texts = docs.flatMap((d) => d.index.passages.map((p) => `${p.head}\n${d.pages[p.page - 1].slice(p.start, p.end)}`))
  // Named by what was embedded, so a change in how passages are cut or headed makes new vectors.
  let hash = 0x811c9dc5
  for (const text of texts) for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  const path = `${dir}${model}-${size}-${(hash >>> 0).toString(36)}.i8`
  if (existsSync(path)) {
    const bytes = await readFile(path)
    const dims = bytes.readUInt32LE(0)
    if ((bytes.length - 4) / dims === texts.length) return { matrix: new Int8Array(bytes.buffer, bytes.byteOffset + 4, bytes.length - 4), dims }
  }
  const started = performance.now()
  const vectors = await embed(model, texts, 'passage', (done) => { if (done % 1024 < 16) process.stderr.write(`\r${model}: ${done} / ${texts.length} passages`) })
  const ms = performance.now() - started
  process.stderr.write(`\r${model}: ${texts.length} passages in ${Math.round(ms / 1000)} s\n`)
  const { matrix, dims } = int8(vectors)
  const header = Buffer.alloc(4)
  header.writeUInt32LE(dims)
  await writeFile(path, Buffer.concat([header, Buffer.from(matrix.buffer)]))
  const chars = texts.reduce((sum, t) => sum + t.length, 0)
  await writeFile(`${path}.json`, JSON.stringify({ model, passages: texts.length, chars, ms, msPerMillionChars: ms / (chars / 1e6) }))
  return { matrix, dims }
}

async function main(argv) {
  const o = options(argv)
  if (o.has('fixture')) {
    // The smallest corpus with French, Japanese and Arabic in it, printed as the unit tests read it.
    const c = corpus({ seed: 7, size: 'xs' })
    const [file] = files(c.sections, 'compendium', 'pdf')
    const bytes = await printPdf(file.blocks, file.name.replace(/\.pdf$/, ''))
    await writeFile(`${ROOT}test/fixtures/documents-xs.pdf`, bytes)
    console.log(`test/fixtures/documents-xs.pdf: ${bytes.length} bytes`)
  }
  const sizes = o.value('corpus', '')
  for (const size of sizes ? sizes.split(',') : []) {
    const seed = Number(o.value('seed', '1'))
    const started = performance.now()
    const { corpus: c, files: list } = await made({ seed, size, layout: 'compendium', ext: o.value('ext', 'pdf') })
    const text = list.flatMap((file) => file.pages).join('\n\n')
    const count = await tokens(text)
    console.log(`${size}: ${list.map((f) => `${f.name}, ${f.pages.length} pages, ${(f.bytes / 1e6).toFixed(1)} MB`).join('; ')}; ${text.length} characters; tokens: ${count.qwen ?? '?'} (Qwen), ${count.jean} (Jean's estimate); ${c.questions.length} questions; ${Math.round((performance.now() - started) / 1000)} s`)
  }
  if (o.has('retrieval')) {
    const budgets = [8000, 32000, 128000]
    const split = o.value('split', 'test')
    const size = Number(o.value('passage', '200'))
    const wanted = o.value('strategies', 'pages,lexical,exact,lexical+exact,preselect').split(',')
    await mkdir(`${CACHE}results/`, { recursive: true })
    for (const seed of o.value('seeds', '1').split(',').map(Number)) {
      for (const which of o.value('sizes', 's').split(',')) {
        const { corpus: c, files: list } = await made({ seed, size: which, layout: 'compendium', ext: o.value('ext', 'pdf') })
        const questions = c.questions.filter((q) => split === 'all' || q.split === split)
        const started = performance.now()
        const docs = prepare(list, size)
        const indexMs = performance.now() - started
        /** @type {import('../test/documents/retrieval.js').Context} */
        const ctx = { docs, vectors: {} }
        /** @type {Record<string, any>} */
        const strategies = Object.fromEntries(Object.entries(STRATEGIES).filter(([name]) => wanted.includes(name)))
        for (const model of new Set(wanted.filter((name) => /^(dense|hybrid):/.test(name)).map((name) => name.split(':')[1]))) {
          const dir = `${CACHE}${seed}-${which}-compendium-${o.value('ext', 'pdf')}/`
          const { matrix, dims } = await passageVectors(dir, docs, model, size)
          const queries = int8(await embed(/** @type {any} */ (model), questions.map((q) => q.text), 'query'))
          const byId = new Map(questions.map((q, i) => [q.id, queries.matrix.subarray(i * dims, (i + 1) * dims)]))
          const vectors = /** @type {Record<string, any>} */ (ctx.vectors)
          vectors[model] = { matrix, dims, query: (/** @type {any} */ q) => byId.get(q.id) }
          Object.assign(strategies, Object.fromEntries(Object.entries(denseStrategies(model)).filter(([name]) => wanted.includes(name))))
        }
        const results = evaluate(questions, list, ctx, strategies, budgets)
        const out = { seed, size: which, split, passage: size, ext: o.value('ext', 'pdf'), indexMs, passages: docs.reduce((n, d) => n + d.units.length, 0), pages: list.reduce((n, f) => n + f.pages.length, 0), budgets, results }
        const name = `${CACHE}results/retrieval-${seed}-${which}-${split}-${size}-${o.value('ext', 'pdf')}.json`
        // A run adds its strategies to what an earlier run of the same corpus kept.
        if (existsSync(name)) {
          const before = JSON.parse(await readFile(name, 'utf8'))
          const byId = new Map(before.results.map((/** @type {any} */ r) => [r.id, r]))
          for (const r of out.results) Object.assign(r.by, { ...byId.get(r.id)?.by, ...r.by })
        }
        await writeFile(name, JSON.stringify(out))
        const line = Object.keys(strategies).map((s) => `${s} ${(results.reduce((sum, r) => sum + r.by[s].at[32000].recall, 0) / (results.length || 1)).toFixed(2)}`).join(', ')
        console.log(`seed ${seed} ${which}: ${questions.length} ${split} questions, ${out.passages} passages over ${out.pages} pages (indexed in ${Math.round(indexMs)} ms); recall@32k: ${line}`)
      }
    }
  }
  const hypotheses = o.value('answers', '')
  if (hypotheses) await answers(hypotheses.split(','), Number(o.value('concurrency', '3')), o.value('dense', 'qwen3'), Number(o.value('passage', '200')), Number(o.value('limit', 'Infinity')))
  const benches = o.value('bench', '')
  if (benches) {
    await mkdir(`${CACHE}results/`, { recursive: true })
    /** @type {Record<string, any>} */
    const out = {}
    const xl = await made({ seed: 1, size: 'xl', layout: 'compendium', ext: 'pdf' })
    const passageCount = prepare(xl.files).reduce((n, d) => n + d.units.length, 0)
    if (benches.includes('scan')) {
      // Random normalised vectors stand in for real ones: a scan's time depends on their number only.
      for (const dims of [384, 1024]) {
        for (const times of [1, 10, 40]) {
          const rows = passageCount * times
          const matrix = new Int8Array(rows * dims)
          for (let i = 0; i < matrix.length; i++) matrix[i] = ((i * 2654435761) >>> 24) - 128
          const timings = []
          for (let q = 0; q < 12; q++) {
            const query = matrix.subarray(q * dims, (q + 1) * dims)
            const started = performance.now()
            nearest(matrix, dims, query, 200)
            timings.push(performance.now() - started)
          }
          out[`scan-${dims}-${times}x`] = { rows, dims, mb: matrix.length / 1e6, p50: percentile(timings, 50), p95: percentile(timings, 95) }
          console.log(`scan: ${rows} vectors of ${dims} (${times}× XL), ${(matrix.length / 1e6).toFixed(0)} MB: p50 ${out[`scan-${dims}-${times}x`].p50.toFixed(1)} ms, p95 ${out[`scan-${dims}-${times}x`].p95.toFixed(1)} ms`)
        }
      }
    }
    if (benches.includes('first-search')) {
      // The XL compendium's text, read, cut, indexed and searched once, in Chromium, as Jean's page would.
      const { chromium } = await import('@playwright/test')
      const chrome = await chromium.launch()
      const page = await chrome.newPage()
      await page.route('http://jean.test/**', async (route) => {
        const path = new URL(route.request().url()).pathname
        if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>bench</title>' })
        if (path === '/text.md') return route.fulfill({ contentType: 'text/markdown', body: xl.files[0].pages.map((p, i) => `[[page ${i + 1}]]\n${p}`).join('\n\n') })
        return route.fulfill({ contentType: 'text/javascript', body: await readFile(`${ROOT}app${path}`) })
      })
      await page.goto('http://jean.test/')
      const cdp = await page.context().newCDPSession(page)
      for (const rate of [1, 4]) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate })
        const timing = await page.evaluate(async () => {
          const files = await import('/core/files.js')
          const search = await import('/core/search.js')
          const text = await (await fetch('/text.md')).text()
          const started = performance.now()
          const pages = files.splitPages(text)
          const index = files.indexOf(pages)
          const built = performance.now()
          search.lookup([index.lexicon], 'What notice period applies to terminating contract C-4471?')
          return { split: 0, build: built - started, query: performance.now() - built, total: performance.now() - started, passages: index.passages.length }
        })
        out[`first-search-${rate}x`] = timing
        console.log(`first search of XL in Chromium, CPU ${rate}× slower: ${Math.round(timing.total)} ms (index ${Math.round(timing.build)} ms, query ${Math.round(timing.query)} ms, ${timing.passages} passages)`)
      }
      await chrome.close()
    }
    out.passagesXL = passageCount
    const path = `${CACHE}results/bench.json`
    await writeFile(path, JSON.stringify({ ...(existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : {}), ...out }))
  }
  if (browser) await (await browser).close()
}

/** How many of the day's free requests the key has left. @param {string} key */
async function remaining(key) {
  const res = await fetch('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${key}` } })
  return (await res.json())?.data?.free_model_daily_requests?.remaining ?? 0
}

/**
 * The answer eval for some hypotheses: each one's questions (its registered sample, from the test
 * split of the three seeds, as many of each kind and seed as can be), under its two conditions.
 * @param {string[]} ids @param {number} concurrency @param {string} dense @param {number} passage @param {number} [limit] at most this many answers this time
 */
async function answers(ids, concurrency, dense, passage, limit = Infinity) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('Set OPENROUTER_API_KEY')
  const registered = JSON.parse(await readFile(`${ROOT}test/documents/hypotheses.json`, 'utf8'))
  const path = `${CACHE}results/answers.jsonl`
  await mkdir(`${CACHE}results/`, { recursive: true })
  const done = new Set(existsSync(path) ? (await readFile(path, 'utf8')).split('\n').filter(Boolean).map((line) => { const r = JSON.parse(line); return `${r.id}|${r.condition}|${r.brain}` }) : [])
  /** @type {{ hypothesis: string, question: any, condition: string, brain: 'large' | 'small', seed: number, size: string }[]} */
  const jobs = []
  for (const id of ids) {
    const h = registered.hypotheses.find((/** @type {any} */ x) => x.id === id)
    const r = h.rule
    const sizes = r.sizes ?? [r.size]
    /** @type {any[]} */
    const pool = []
    for (const size of sizes) for (const seed of registered.corpus.seeds) for (const q of corpus({ seed, size }).questions) if (q.split === 'test' && r.types.includes(q.type)) pool.push({ q, seed, size })
    // As many of each kind, seed and size as the sample allows, in an order fixed by the seed.
    const random = rng(7)
    const groups = new Map()
    for (const item of pool.sort(() => random() - 0.5)) groups.set(`${item.q.type}|${item.seed}|${item.size}`, [...(groups.get(`${item.q.type}|${item.seed}|${item.size}`) ?? []), item])
    const lists = [...groups.values()]
    const sample = []
    for (let i = 0; sample.length < Math.min(r.questions, pool.length); i++) for (const list of lists) if (list[i] && sample.length < r.questions) sample.push(list[i])
    for (const { q, seed, size } of sample) for (const condition of [r.a, r.b]) jobs.push({ hypothesis: id, question: q, condition, brain: r.brain === 'small' ? 'small' : 'large', seed, size })
  }
  const open = jobs.filter((job) => !done.has(`${job.question.id}|${job.condition}|${job.brain}`))
  const todo = open.slice(0, limit)
  console.log(`${jobs.length} answers asked for, ${jobs.length - open.length} already there, ${todo.length} to go now`)
  /** @type {Map<string, Promise<any>>} */
  const corpora = new Map()
  const load = (/** @type {number} */ seed, /** @type {string} */ size) => corpora.get(`${seed}-${size}`) ?? corpora.set(`${seed}-${size}`, (async () => {
    const { files: list } = await made({ seed, size, layout: 'compendium', ext: 'pdf' })
    const docs = prepare(list, passage)
    return { files: list, lib: await library(list), docs, dir: `${CACHE}${seed}-${size}-compendium-pdf/` }
  })()).get(`${seed}-${size}`)
  let left = await remaining(key)
  let stop = false
  const worker = async () => {
    while (todo.length && !stop) {
      if (left < 20) {
        left = await remaining(key)
        if (left < 20) { stop = true; console.log('The free requests for today are nearly spent: run again tomorrow to go on.'); break }
      }
      const job = /** @type {any} */ (todo.shift())
      const c = await load(job.seed, job.size)
      let extra = {}
      if (job.condition === 'search+meaning') {
        const { matrix, dims } = await passageVectors(c.dir, c.docs, dense, passage)
        extra = { docs: c.docs, vectors: { matrix, dims, embedQuery: async (/** @type {string} */ text) => int8(await embed(/** @type {any} */ (dense), [text], 'query')).matrix } }
      }
      try {
        const run = await ask({ question: job.question, condition: job.condition, brain: job.brain, files: c.files, lib: c.lib, extra, apiKey: key })
        left -= run.calls.length + 1
        const graded = grade(job.question, run.text)
        const record = { id: job.question.id, type: job.question.type, lang: job.question.lang, hypothesis: job.hypothesis, condition: job.condition, brain: job.brain, model: BRAINS[/** @type {'large'} */ (job.brain)].model, ...graded, grounded: grounded(job.question, run), steps: run.calls.length, stopReason: run.stopReason, ms: Math.round(run.ms), usage: run.usage, reply: run.text, calls: run.calls.map((call) => ({ name: call.name, args: call.args, output: call.output })), shownTokens: Math.round(run.shown.length / 3), at: new Date().toISOString() }
        await writeFile(path, `${JSON.stringify(record)}\n`, { flag: 'a' })
        console.log(`${job.hypothesis} ${job.question.id} ${job.condition}: ${graded.correct ? 'right' : graded.abstained ? 'abstained' : 'wrong'} (${record.answer.slice(0, 60)}) in ${record.steps} calls, ${Math.round(run.ms / 1000)} s`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.log(`${job.hypothesis} ${job.question.id} ${job.condition}: failed, ${message.slice(0, 120)}`)
        if (/per-day|daily|quota/i.test(message)) stop = true
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2))
