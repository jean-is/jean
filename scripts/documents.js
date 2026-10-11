// The document evals (test/documents/): a fictional company's files at five sizes and in every
// format Jean reads, the questions asked of them, and how each way of reading them scores.
// Usage: npm run documents -- --fixture              print test/fixtures/documents-xs.pdf with Chromium
//        npm run documents -- --corpus xl            make (or reuse) a corpus and report its size
//        npm run documents -- --retrieval --sizes s,m --seeds 1,2,3 [--split test] [--passage 200]
//                                 [--strategies pages,lexical,exact,lexical+exact,preselect,dense:e5,hybrid:e5]
//                                                    score the strategies, keeping each run's results in .cache/results/
// Generated files are kept in test/documents/.cache/ (never committed), keyed by seed and size.
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { corpus, files } from '../test/documents/corpus.js'
import { bytesOf, extract, html } from '../test/documents/formats.js'
import { pageText } from '../app/caps/files/extract.js'
import { STRATEGIES, denseStrategies, evaluate, prepare } from '../test/documents/retrieval.js'
import { embed, int8 } from '../test/documents/dense.js'

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
  const path = `${dir}${model}-${size}.i8`
  const texts = docs.flatMap((d) => d.index.passages.map((p) => `${p.head}\n${d.pages[p.page - 1].slice(p.start, p.end)}`))
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
          /** @type {any} */ (ctx.vectors)[model] = { matrix, dims, query: (/** @type {any} */ q) => byId.get(q.id) }
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
  if (browser) await (await browser).close()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2))
