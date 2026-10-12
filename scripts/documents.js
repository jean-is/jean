// The document evals (test/documents/): a fictional company's files at five sizes and in every
// format Jean reads, the questions asked of them, and how each way of reading them scores.
// Usage: npm run documents -- --fixture              print test/fixtures/documents-xs.pdf with Chromium
//        npm run documents -- --corpus xl            make (or reuse) a corpus and report its size
//        npm run documents -- --retrieval --sizes s,m --seeds 1,2,3 [--split test] [--passage 200]
//                                 [--strategies pages,lexical,exact,lexical+exact,preselect,dense:e5,hybrid:e5]
//                                                    score the strategies, keeping each run's results in .cache/results/
//        npm run documents -- --bench scan,first-search  H1: a flat vector scan at 1, 10 and 40 times XL; H6: the first search of XL in Chromium slowed 4×
//        npm run documents -- --report [--write]         results.md and strategies.json from every run kept
//        npm run documents -- --answers H4,H5 [--concurrency 3] [--requests 4] [--helpers 4] [--dense e5] [--dollars 10]   the answer eval with OpenRouter's brains (OPENROUTER_API_KEY),
//        npm run documents -- --answers overall --conditions search,search+meaning   ten questions of each kind at XL, for the targets
//                                 that many questions at once, their requests that many at a time (the rest queued), the helpers'
//                                 (notes, every_page) --helpers at a time with each provider not the answers' own, resuming
//                                 where it stopped; it stops itself once the run has spent --dollars, or a free brain's day runs out
// Generated files are kept in test/documents/.cache/ (never committed), keyed by seed and size.
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { corpus, files } from '../test/documents/corpus.js'
import { bytesOf, extract, html } from '../test/documents/formats.js'
import { pageText } from '../app/caps/files/extract.js'
import { STRATEGIES, denseStrategies, evaluate, nearest, prepare } from '../test/documents/retrieval.js'
import { mean, percentile } from '../test/documents/stats.js'
import { verdicts, rows as rowsOf, table, pct } from '../test/documents/report.js'
import { overlap } from '../test/documents/text.js'
import { execFileSync } from 'node:child_process'
import { embed, int8 } from '../test/documents/dense.js'
import { BRAINS, ask, grade, grounded, library, queues, setRequests, summarise } from '../test/documents/answers.js'
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
      // A PDF printed before is read again (the text Jean extracts may have changed), not printed again.
      const bytes = file.name.endsWith('.pdf') ? existsSync(path) ? new Uint8Array(await readFile(path)) : await printPdf(file.blocks, file.name.replace(/\.pdf$/, '')) : await bytesOf(file)
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
    await writeFile(`${CACHE}${seed}-${size}-compendium-${o.value('ext', 'pdf')}/stats.json`, JSON.stringify({ seed, size, pages: list.reduce((n, f) => n + f.pages.length, 0), mb: list.reduce((n, f) => n + f.bytes, 0) / 1e6, characters: text.length, qwen: count.qwen, jean: count.jean, questions: c.questions.length }))
  }
  if (o.has('retrieval')) {
    const budgets = [8000, 32000, 128000]
    const split = o.value('split', 'test')
    const size = Number(o.value('passage', '100'))
    const wanted = o.value('strategies', 'pages,lexical,exact,lexical+exact,preselect').split(',')
    await mkdir(`${CACHE}results/`, { recursive: true })
    for (const seed of o.value('seeds', '1').split(',').map(Number)) {
      for (const which of o.value('sizes', 's').split(',')) {
        const layout = /** @type {'compendium' | 'project'} */ (o.value('layout', 'compendium'))
        const ext = layout === 'project' ? 'mixed' : o.value('ext', 'pdf')
        const { corpus: c, files: list } = await made({ seed, size: which, layout, ext })
        const questions = c.questions.filter((q) => split === 'all' || q.split === split)
        const started = performance.now()
        const docs = prepare(list, size)
        const indexMs = performance.now() - started
        /** @type {import('../test/documents/retrieval.js').Context} */
        const ctx = { docs, vectors: {} }
        /** @type {Record<string, any>} */
        const strategies = Object.fromEntries(Object.entries(STRATEGIES).filter(([name]) => wanted.includes(name)))
        for (const model of new Set(wanted.filter((name) => /^(dense|hybrid):/.test(name)).map((name) => name.split(':')[1]))) {
          const dir = `${CACHE}${seed}-${which}-${layout}${layout === 'compendium' ? `-${ext}` : ''}/`
          const { matrix, dims } = await passageVectors(dir, docs, model, size)
          const queries = int8(await embed(/** @type {any} */ (model), questions.map((q) => q.text), 'query'))
          const byId = new Map(questions.map((q, i) => [q.id, queries.matrix.subarray(i * dims, (i + 1) * dims)]))
          const vectors = /** @type {Record<string, any>} */ (ctx.vectors)
          vectors[model] = { matrix, dims, query: (/** @type {any} */ q) => byId.get(q.id) }
          Object.assign(strategies, Object.fromEntries(Object.entries(denseStrategies(model)).filter(([name]) => wanted.includes(name))))
        }
        const results = evaluate(questions, list, ctx, strategies, budgets)
        const out = { seed, size: which, split, passage: size, ext, layout, indexMs, passages: docs.reduce((n, d) => n + d.units.length, 0), pages: list.reduce((n, f) => n + f.pages.length, 0), budgets, results }
        const name = `${CACHE}results/retrieval-${seed}-${which}-${split}-${size}-${ext}.json`
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
  if (o.has('report')) await report(o.has('write'))
  const hypotheses = o.value('answers', '')
  setRequests(Number(o.value('requests', '4')), Number(o.value('helpers', o.value('requests', '4'))))
  if (hypotheses) await answers(hypotheses.split(','), Number(o.value('concurrency', '3')), o.value('dense', 'e5'), Number(o.value('passage', '100')), Number(o.value('limit', 'Infinity')), o.value('conditions', 'search').split(','), Number(o.value('dollars', '10')))
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

/** What each strategy is for, as an agent or a reader decides between them; the numbers come from the runs. */
const USES = {
  whole: { useWhen: 'the files fit in about a quarter of the brain’s context', avoidWhen: 'they don’t: it shows the first pages only', needs: [], onDevice: true },
  pages: { useWhen: 'never alone past a few dozen pages: today’s first pages, then read page by page', avoidWhen: 'a file is longer than the brain’s share of context', needs: [], onDevice: true },
  lexical: { useWhen: 'names, codes, numbers, dates, terms the files use; any size, any language the query is written in', avoidWhen: 'the question’s words aren’t the files’ (a paraphrase, another language) and the brain can’t rewrite them', needs: ['an index made once per file'], onDevice: true },
  exact: { useWhen: 'every place a code or phrase is: counting, the latest of several versions, totals over rows', avoidWhen: 'the wording varies', needs: [], onDevice: true },
  'lexical+exact': { useWhen: 'a question naming a code: its places first, then the best passages', avoidWhen: '', needs: ['an index made once per file'], onDevice: true },
  preselect: { useWhen: 'a brain whose context can’t hold the file (the device’s 32k): the matching pages instead of the first', avoidWhen: 'the brain can call tools well and has room', needs: ['an index made once per file'], onDevice: true },
  'dense:e5': { useWhen: 'meaning over words, many languages, a small download (~120 MB)', avoidWhen: 'codes, numbers and absent things: it ranks look-alikes', needs: ['an embedding model on the device or a service', 'embedding every passage at ingestion'], onDevice: true },
  'hybrid:e5': { useWhen: 'paraphrases and other languages, keeping codes found by words', avoidWhen: 'the brain writes good queries itself', needs: ['an embedding model', 'embedding every passage at ingestion'], onDevice: true },
  'dense:qwen3': { useWhen: 'meaning over words with the strongest open embedder tried (~600 MB)', avoidWhen: 'codes, numbers and absent things; devices without room or time to embed', needs: ['an embedding model', 'embedding every passage at ingestion (slow on a CPU)'], onDevice: true },
  'hybrid:qwen3': { useWhen: 'paraphrases and other languages from the user’s own words', avoidWhen: 'the brain writes good queries itself; devices without room or time to embed', needs: ['an embedding model', 'embedding every passage at ingestion (slow on a CPU)'], onDevice: true },
}

/** The registration's commit, the latest change to the hypotheses. */
const registration = () => { try { return execFileSync('git', ['log', '-1', '--format=%h %cs', '--', 'test/documents/hypotheses.json'], { cwd: ROOT }).toString().trim() } catch { return '?' } }

/**
 * results.md and strategies.json from every run kept in .cache/results/.
 * @param {boolean} write
 */
async function report(write) {
  const registered = JSON.parse(await readFile(`${ROOT}test/documents/hypotheses.json`, 'utf8'))
  const { readdir } = await import('node:fs/promises')
  const dir = `${CACHE}results/`
  const names = existsSync(dir) ? await readdir(dir) : []
  /** @type {import('../test/documents/report.js').Run[]} */
  const all = await Promise.all(names.filter((n) => n.startsWith('retrieval-')).map(async (n) => JSON.parse(await readFile(`${dir}${n}`, 'utf8'))))
  // Each strategy at the passage size it scored best with on the dev split (L, recall at 32k), the same tuning for all.
  const dev = all.filter((run) => run.split === 'dev')
  /** @type {Record<string, number>} */
  const tuned = {}
  for (const strategy of new Set(dev.flatMap((run) => Object.keys(run.results[0]?.by ?? {})))) {
    const sizes = [...new Set(dev.map((run) => run.passage))]
    const score = (/** @type {number} */ size) => mean(dev.filter((run) => run.passage === size).flatMap((run) => run.results).filter((r) => r.by[strategy] && r.type !== 'negative').map((r) => r.by[strategy].at[32000].recall))
    tuned[strategy] = sizes.sort((a, b) => score(b) - score(a))[0]
  }
  const formats = all.filter((run) => run.split === 'test' && run.ext !== 'pdf')
  const test = all.filter((run) => run.split === 'test' && run.ext === 'pdf')
  // One run per corpus, each strategy's rows from the run at its tuned size.
  /** @type {import('../test/documents/report.js').Run[]} */
  const runs = []
  for (const key of new Set(test.map((run) => `${run.seed}-${run.size}`))) {
    const same = test.filter((run) => `${run.seed}-${run.size}` === key)
    const base = same.find((run) => run.passage === 200) ?? same[0]
    const c = corpus({ seed: base.seed, size: /** @type {any} */ (base.size) })
    const byId = new Map(c.questions.map((q) => [q.id, q]))
    runs.push({ ...base, results: base.results.map((row) => {
      const q = byId.get(row.id)
      const by = Object.fromEntries(Object.keys(USES).concat(Object.keys(row.by)).flatMap((s) => {
        const from = same.find((run) => run.passage === (tuned[s] ?? 200) && run.results.some((r) => r.id === row.id && r.by[s])) ?? same.find((run) => run.results.some((r) => r.id === row.id && r.by[s]))
        const cell = from?.results.find((r) => r.id === row.id)?.by[s]
        return cell ? [[s, cell]] : []
      }))
      return { ...row, by, overlap: q && q.evidence.length ? Math.max(...q.evidence.map((e) => overlap(q.text, e.quote))) : 1 }
    }) })
  }
  const answersPath = `${dir}answers.jsonl`
  const answerRecords = existsSync(answersPath) ? (await readFile(answersPath, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []
  /** @type {Map<string, any>} */
  const answerRows = new Map()
  // A question's answers by brain: two conditions pair only when one brain answered both.
  for (const a of answerRecords) {
    const row = answerRows.get(`${a.id}|${a.model}`) ?? { id: a.id, model: a.model, type: a.type, lang: a.lang, split: 'test', missing: 0, by: {} }
    row.by[a.condition] = { rr: 0, ms: a.ms, at: { 0: { accuracy: a.correct, hallucination: !a.correct && !a.abstained ? 1 : 0, grounded: a.grounded ? 1 : 0 } } }
    answerRows.set(`${a.id}|${a.model}`, row)
  }
  const bench = existsSync(`${dir}bench.json`) ? JSON.parse(await readFile(`${dir}bench.json`, 'utf8')) : {}
  for (const cost of names.length ? [] : []) void cost
  const strategies = [...new Set(runs.flatMap((run) => run.results.flatMap((r) => Object.keys(r.by))))]
  const denseNames = strategies.filter((s) => s.startsWith('dense:'))
  const bestDense = denseNames.sort((a, b) => mean(dev.flatMap((run) => run.results).filter((r) => r.by[b]).map((r) => r.by[b].at[32000].recall)) - mean(dev.flatMap((run) => run.results).filter((r) => r.by[a]).map((r) => r.by[a].at[32000].recall)))[0] ?? 'dense:qwen3'
  const marks = verdicts(registered, { runs, bench, answers: [...answerRows.values()], dense: bestDense })
  const sizes = ['s', 'm', 'l', 'xl'].filter((size) => runs.some((run) => run.size === size))
  const types = ['lookup', 'paraphrase', 'filter', 'aggregate', 'multihop', 'temporal', 'crosslingual', 'negative', 'global']
  const stats = []
  for (const size of ['xs', 's', 'm', 'l', 'xl']) {
    const list = await Promise.all([1, 2, 3].map(async (seed) => { const p = `${CACHE}${seed}-${size}-compendium-pdf/stats.json`; return existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : null }))
    const found = list.filter(Boolean)
    const count = (/** @type {number} */ n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : `${Math.round(n / 1e3)} k`)
    if (found.length) stats.push([size.toUpperCase(), Math.round(mean(found.map((x) => x.pages))), count(mean(found.map((x) => x.characters))), found[0].qwen ? count(mean(found.map((x) => x.qwen))) : '–', count(mean(found.map((x) => x.jean))), found.reduce((n, x) => n + x.questions, 0)])
  }
  const recallTable = (/** @type {number} */ budget) => table(['Strategy', ...sizes.map((s) => s.toUpperCase())], strategies.map((s) => [`\`${s}\``, ...sizes.map((size) => pct(mean(rowsOf(runs, size).filter((r) => r.type !== 'negative' && r.by[s]).map((r) => r.by[s].at[budget].recall))))]))
  const byType = (/** @type {string} */ size) => table(['Strategy', ...types], strategies.map((s) => [`\`${s}\``, ...types.map((t) => {
    const list = rowsOf(runs, size, [t]).filter((r) => r.by[s])
    return t === 'negative' ? `${pct(mean(list.map((r) => r.by[s].at[32000].lure)))} lure` : pct(mean(list.map((r) => r.by[s].at[32000].recall)))
  })]))
  const answerTableOf = (/** @type {any[]} */ records, /** @type {string[]} */ head) => table(head, [...new Set(records.map((a) => `${a.condition}|${a.model}`))].map((key) => {
    const [condition, model] = key.split('|')
    const list = records.filter((a) => a.condition === condition && a.model === model)
    const negatives = list.filter((a) => a.type === 'negative')
    return [`\`${condition}\``, model, list.length, `${pct(mean(list.map((a) => a.correct)))}%`, `${pct(mean(list.map((a) => (!a.correct && !a.abstained ? 1 : 0))))}%`, `${pct(mean(list.map((a) => (a.grounded ? 1 : 0))))}%`, negatives.length ? `${pct(mean(negatives.map((a) => a.correct)))}%` : '–', mean(list.map((a) => a.steps)).toFixed(1), Math.round(mean(list.map((a) => a.ms)) / 1000)]
  }))
  const answerTable = answerTableOf(answerRecords, ['Condition', 'Brain', 'Answers', 'Right', 'Hallucinated', 'Evidence seen', 'Abstained on absent things', 'Calls', 'Seconds'])
  // The overall sample under the conditions and brains its run used, whichever hypothesis's run answered each question.
  const overall = new Set(sample(OVERALL, registered.corpus.seeds).map(({ q }) => q.id))
  const overallRuns = new Set(answerRecords.filter((a) => a.hypothesis === 'overall').map((a) => `${a.condition}|${a.model}`))
  const overallRecords = answerRecords.filter((a) => overall.has(a.id) && overallRuns.has(`${a.condition}|${a.model}`))
  const { targets } = registered
  const targetTable = answerTableOf(overallRecords, ['Condition', 'Brain', 'Answers', `Right (target ${pct(targets.accuracy)}%)`, `Hallucinated (at most ${pct(targets.hallucination.max)}%)`, 'Evidence seen', `Abstained on absent things (${pct(targets.negativeAbstention)}%)`, 'Calls', 'Seconds'])
  const embedCosts = []
  for (const size of ['l', 'xl']) {
    for (const seed of [1, 2, 3]) {
      const d = `${CACHE}${seed}-${size}-compendium-pdf/`
      if (!existsSync(d)) continue
      for (const n of await readdir(d)) if (n.endsWith('.i8.json')) embedCosts.push({ size, ...JSON.parse(await readFile(`${d}${n}`, 'utf8')) })
    }
  }
  const costTable = table(['Embedder', 'Passages embedded', 'Minutes per million characters', 'Minutes for one XL corpus (12.5 M characters)'], [...new Set(embedCosts.map((c) => c.model))].map((model) => {
    const list = embedCosts.filter((c) => c.model === model)
    const perM = mean(list.map((c) => c.msPerMillionChars)) / 60000
    return [model, list.reduce((n, c) => n + c.passages, 0), perM.toFixed(2), (perM * 12.5).toFixed(0)]
  }))
  const indexCost = runs.filter((run) => run.size === 'xl').map((run) => run.indexMs)
  const queryTable = table(['Strategy', 'p50 ms', 'p95 ms'], strategies.map((s) => {
    const ms = runs.filter((run) => run.size === 'xl').flatMap((run) => run.results.map((r) => r.by[s]?.ms)).filter((x) => x !== undefined)
    return [`\`${s}\``, ms.length ? percentile(ms, 50).toFixed(1) : '–', ms.length ? percentile(ms, 95).toFixed(1) : '–']
  }))
  const md = `# Document evals: results

Made by \`npm run documents -- --report --write\` from the runs kept in \`test/documents/.cache/results/\`; the corpus, the questions and how they're scored are in [test/documents/](.), the hypotheses were registered in \`hypotheses.json\` at ${registration()}, before any result on the test split. Everything below is on the test split, the three seeds pooled, the compendium printed as a PDF by Chromium, unless it says otherwise. Each strategy uses the passage size it scored best with on the dev split (${Object.entries(tuned).map(([s, n]) => `${s} ${n}`).join(', ') || 'not tuned yet'} tokens).

## The corpus

${table(['Size', 'PDF pages', 'Characters', 'Tokens (Qwen)', 'Tokens (Jean’s estimate)', 'Questions (3 seeds)'], stats)}

## The hypotheses

${table(['', 'Claim', 'Verdict', 'Evidence'], marks.map((m) => [m.id, m.claim, `**${m.verdict}**`, m.evidence || '–']))}

## Finding the evidence: recall within 32k tokens (all kinds but absent things)

${recallTable(32000)}

Within 8k tokens, a device brain’s share:

${recallTable(8000)}

Within 128k tokens:

${recallTable(128000)}

## By kind of question at ${sizes.includes('xl') ? 'XL' : (sizes.at(-1) ?? '').toUpperCase()}, within 32k tokens

For absent things, how often the strategy handed over a lure (lower is better).

${sizes.length ? byType(sizes.includes('xl') ? 'xl' : /** @type {string} */ (sizes.at(-1))) : ''}

## Answers

${answerRecords.length ? answerTable : 'Not run yet.'}

Against the targets, on ten questions of each kind at XL (\`--answers overall\`); faithfulness isn't measured yet.

${overallRecords.length ? targetTable : 'Not run yet.'}

## By format

The same questions with the compendium as Word, Markdown or text, and as a project of ten files (Word, Excel, PowerPoint, CSV, text and PDF), lexical search, recall within 32k tokens (absent things aside).

${table(['Size', 'Format', 'Questions', 'pages', 'lexical', 'lexical+exact', 'preselect'], [...new Set([...test, ...formats].map((run) => `${run.size}|${run.ext}`))].sort().map((key) => {
    const [size, ext] = key.split('|')
    const list = [...test, ...formats].filter((run) => run.size === size && run.ext === ext && run.passage === 100).flatMap((run) => run.results).filter((r) => r.type !== 'negative')
    const cell = (/** @type {string} */ s) => pct(mean(list.filter((r) => r.by[s]).map((r) => r.by[s].at[32000].recall)))
    return [size.toUpperCase(), ext === 'mixed' ? 'project' : ext, list.length, cell('pages'), cell('lexical'), cell('lexical+exact'), cell('preselect')]
  }))}

## Costs

Making an XL compendium’s index in memory: ${indexCost.length ? `${Math.round(mean(indexCost))} ms in node on this computer` : 'not measured'}; in Chromium, see H6.

${embedCosts.length ? costTable : ''}

Time to rank one question’s passages at XL:

${queryTable}
`
  const out = Object.fromEntries(strategies.map((s) => [s, {
    ...(USES[/** @type {keyof typeof USES} */ (s)] ?? {}),
    passage: tuned[s] ?? 200,
    scores: Object.fromEntries(sizes.map((size) => [size, Object.fromEntries(types.map((t) => {
      const list = rowsOf(runs, size, [t]).filter((r) => r.by[s])
      return [t, t === 'negative' ? { lure: mean(list.map((r) => r.by[s].at[32000].lure)), n: list.length } : { recall: mean(list.map((r) => r.by[s].at[32000].recall)), strict: mean(list.map((r) => r.by[s].at[32000].strict)), n: list.length }]
    }))])),
    seeds: [...new Set(runs.map((run) => run.seed))],
    commit: registration(),
    knownLimits: ['scanned PDFs, with no text layer, are not read', 'Arabic letters some fonts draw as ligatures can come back from PDFs in the wrong order'],
  }]))
  console.log(md)
  if (write) {
    await writeFile(`${ROOT}test/documents/results.md`, md)
    await writeFile(`${ROOT}test/documents/strategies.json`, `${JSON.stringify(out, null, 2)}\n`)
  }
}

/** @type {Map<string, Promise<string[]>>} */
const notes = new Map()
/**
 * A corpus's search notes (H8), written once by the large brain and kept, resuming where they stopped.
 * @param {{ files: { pages: string[] }[], dir: string }} c @param {string} key
 */
function notesOf(c, key) {
  if (!notes.has(c.dir)) {
    notes.set(c.dir, (async () => {
      const path = `${c.dir}notes.json`
      const done = existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : []
      const started = performance.now()
      const all = await summarise(c.files[0].pages, key, async (so, total) => {
        await writeFile(path, JSON.stringify(so))
        process.stderr.write(`\rnotes on ${c.dir.split('/').at(-2)}: ${so.filter(Boolean).length} / ${total}`)
      }, 40, done)
      await writeFile(path, JSON.stringify(all))
      await writeFile(`${path.replace(/\.json$/, '')}.cost.json`, JSON.stringify({ groups: all.length, requests: all.length - done.filter(Boolean).length, ms: performance.now() - started }))
      return all
    })().catch((error) => { notes.delete(c.dir); throw error }))
  }
  return /** @type {Promise<string[]>} */ (notes.get(c.dir))
}

/** What the key has spent so far, in dollars, asked again for about two minutes while OpenRouter can't be reached. @param {string} key */
async function spent(key) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${key}` } })
      const usage = (await res.json())?.data?.usage
      if (typeof usage !== 'number') throw new Error('OpenRouter did not say what the key has spent')
      return usage
    } catch (error) {
      if (attempt === 8) throw error
      await new Promise((resolve) => setTimeout(resolve, 15000))
    }
  }
}

/** The overall sample: ten of each kind at XL, for the targets great results mean. */
const OVERALL = { size: 'xl', types: ['lookup', 'paraphrase', 'filter', 'aggregate', 'multihop', 'temporal', 'crosslingual', 'negative', 'global'], questions: 90 }

/**
 * A rule's questions from the test split: as many of each kind, seed and size as its sample allows, in an order fixed by the seed.
 * @param {{ size?: string, sizes?: string[], types: string[], questions: number }} r @param {number[]} seeds
 */
function sample(r, seeds) {
  /** @type {{ q: any, seed: number, size: string }[]} */
  const pool = []
  for (const size of r.sizes ?? [/** @type {string} */ (r.size)]) for (const seed of seeds) for (const q of corpus({ seed, size }).questions) if (q.split === 'test' && r.types.includes(q.type)) pool.push({ q, seed, size })
  const random = rng(7)
  const groups = new Map()
  for (const item of pool.sort(() => random() - 0.5)) groups.set(`${item.q.type}|${item.seed}|${item.size}`, [...(groups.get(`${item.q.type}|${item.seed}|${item.size}`) ?? []), item])
  const lists = [...groups.values()]
  const out = []
  for (let i = 0; out.length < Math.min(r.questions, pool.length); i++) for (const list of lists) if (list[i] && out.length < r.questions) out.push(list[i])
  return out
}

/**
 * The answer eval for some hypotheses: each one's questions (its registered sample, from the test
 * split of the three seeds, as many of each kind and seed as can be), under its two conditions.
 * @param {string[]} ids hypotheses, or overall @param {number} concurrency @param {string} dense @param {number} passage @param {number} [limit] at most this many answers this time
 * @param {string[]} [conditions] overall's @param {number} [dollars] at most this much spent this time
 */
async function answers(ids, concurrency, dense, passage, limit = Infinity, conditions = ['search'], dollars = 10) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('Set OPENROUTER_API_KEY')
  const registered = JSON.parse(await readFile(`${ROOT}test/documents/hypotheses.json`, 'utf8'))
  const path = `${CACHE}results/answers.jsonl`
  await mkdir(`${CACHE}results/`, { recursive: true })
  const done = new Set(existsSync(path) ? (await readFile(path, 'utf8')).split('\n').filter(Boolean).map((line) => { const r = JSON.parse(line); return `${r.id}|${r.condition}|${r.model}` }) : [])
  /** @type {{ hypothesis: string, question: any, condition: string, brain: 'large' | 'small', seed: number, size: string }[]} */
  const jobs = []
  for (const id of ids) {
    // overall: under the conditions named.
    const r = id === 'overall' ? { ...OVERALL, a: conditions[0], b: conditions[1] ?? conditions[0] } : registered.hypotheses.find((/** @type {any} */ x) => x.id === id).rule
    for (const { q, seed, size } of sample(r, registered.corpus.seeds)) for (const condition of new Set([r.a, r.b])) jobs.push({ hypothesis: id, question: q, condition, brain: r.brain === 'small' ? 'small' : 'large', seed, size })
  }
  const open = jobs.filter((job) => !done.has(`${job.question.id}|${job.condition}|${BRAINS[job.brain].model}`))
  const todo = open.slice(0, limit)
  console.log(`${jobs.length} answers asked for, ${jobs.length - open.length} already there, ${todo.length} to go now`)
  /** @type {Map<string, Promise<any>>} */
  const corpora = new Map()
  const load = (/** @type {number} */ seed, /** @type {string} */ size) => corpora.get(`${seed}-${size}`) ?? corpora.set(`${seed}-${size}`, (async () => {
    const { files: list } = await made({ seed, size, layout: 'compendium', ext: 'pdf' })
    const docs = prepare(list, passage)
    return { files: list, lib: await library(list), docs, dir: `${CACHE}${seed}-${size}-compendium-pdf/` }
  })()).get(`${seed}-${size}`)
  const before = await spent(key)
  let stop = false
  const worker = async () => {
    while (todo.length && !stop) {
      if (await spent(key) - before >= dollars) { stop = true; console.log(`$${dollars} spent: run again, with a higher --dollars if need be, to go on.`); break }
      // Another worker may have taken the last job while this one checked.
      const job = /** @type {any} */ (todo.shift())
      if (!job) break
      const { condition } = job
      try {
        const c = await load(job.seed, job.size)
        let extra = {}
        let { files: shownFiles, lib } = c
        if (condition === 'summaries') {
          const notes = await notesOf(c, key)
          shownFiles = [...c.files, { name: 'Search notes.md', pages: notes }]
          lib = await library(shownFiles)
        }
        if (job.condition === 'search+meaning') {
          const { matrix, dims } = await passageVectors(c.dir, c.docs, dense, passage)
          extra = { docs: c.docs, vectors: { matrix, dims, embedQuery: async (/** @type {string} */ text) => int8(await embed(/** @type {any} */ (dense), [text], 'query')).matrix } }
        }
        const run = await ask({ question: job.question, condition, brain: job.brain, files: shownFiles, lib, extra, apiKey: key })
        // every_page failing is the provider's doing, not the brain's: the answer isn't kept, so that a later run asks again.
        const lost = run.calls.find((call) => call.name === 'every_page' && call.failed)
        if (lost) throw new Error(`every_page failed: ${lost.output}`)
        const graded = grade(job.question, run.text)
        const { model, provider } = BRAINS[/** @type {'large'} */ (job.brain)]
        const record = { id: job.question.id, type: job.question.type, lang: job.question.lang, hypothesis: job.hypothesis, condition, brain: job.brain, model, ...(provider && { provider }), ...graded, grounded: grounded(job.question, run), steps: run.calls.length, stopReason: run.stopReason, ms: Math.round(run.ms), usage: run.usage, reply: run.text, calls: run.calls.map((call) => ({ name: call.name, args: call.args, output: call.output })), shownTokens: Math.round(run.shown.length / 3), at: new Date().toISOString() }
        await writeFile(path, `${JSON.stringify(record)}\n`, { flag: 'a' })
        console.log(`${job.hypothesis} ${job.question.id} ${job.condition}: ${graded.correct ? 'right' : graded.abstained ? 'abstained' : 'wrong'} (${record.answer.slice(0, 60)}) in ${record.steps} calls, ${Math.round(run.ms / 1000)} s`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.log(`${job.hypothesis} ${job.question.id} ${job.condition}: failed, ${message.slice(0, 120)}`)
        // A free brain's day, or the account's credit, has run out: the jobs left would all fail.
        // It exits with an error, so that a run chained after it doesn't start.
        if (/per-day|daily|quota|HTTP 402/i.test(message) && !stop) { stop = true; process.exitCode = 1; console.log('Out of requests or credit: run again once there is more to go on.') }
      }
    }
  }
  // Every five minutes, how the requests stand with each provider.
  const status = setInterval(() => console.log(`\nrequests: ${queues().map((q) => `${q.provider} ${q.inFlight} in flight, ${q.waiting} waiting, ${q.done ?? 0} done, ${q.refused ?? 0} refused, ${q.idle ?? 0} idle, ${q.failed ?? 0} failed`).join('; ')}`), 300000)
  await Promise.all(Array.from({ length: concurrency }, worker))
  clearInterval(status)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2))
