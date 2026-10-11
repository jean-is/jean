// The document evals (test/documents/): a fictional company's files at five sizes and in every
// format Jean reads, the questions asked of them, and how each way of reading them scores.
// Usage: npm run documents -- --fixture              print test/fixtures/documents-xs.pdf with Chromium
//        npm run documents -- --corpus xl            make (or reuse) a corpus and report its size
//        npm run documents -- --size s,m --write     the retrieval eval, written to test/documents/results.md
// Generated files are kept in test/documents/.cache/ (never committed), keyed by seed and size.
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { corpus, files } from '../test/documents/corpus.js'
import { bytesOf, extract, html } from '../test/documents/formats.js'
import { pageText } from '../app/caps/files/extract.js'

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
  if (browser) await (await browser).close()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2))
