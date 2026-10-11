// The document evals' own truthfulness (test/documents/): the corpus is what it claims to be, in
// every format Jean reads. Each answer's evidence is found, once, in the text Jean extracts; it
// holds the answer; what is asked about and absent is truly absent; paraphrases share no words.
// The large sizes and the strategies' scores are scripts/documents.js's work.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { corpus, files } from './documents/corpus.js'
import { bytesOf, extract, pdfPages } from './documents/formats.js'
import { occurrences, place, sufficient } from './documents/gold.js'
import { sharedTerms } from './documents/text.js'
import * as extractor from '../app/caps/files/extract.js'

/** @typedef {import('./documents/corpus.js').Question} Question */

/** The corpus's files, each in its own format (PDF as Markdown: Chromium makes those) and extracted as Jean does. @param {ReturnType<typeof corpus>} c @param {'compendium' | 'project'} layout @param {string} [ext] */
async function extracted(c, layout, ext) {
  return Promise.all(files(c.sections, layout, ext).map(async (file) => {
    const name = file.name.replace(/\.pdf$/, '.md')
    return { name, pages: await extract(name, await bytesOf({ ...file, name })) }
  }))
}

/** Every question's evidence and distractors found, each anchor once. @param {Question[]} questions @param {{ name: string, pages: string[] }[]} found */
function assertFound(questions, found) {
  for (const q of questions) {
    for (const e of [...q.evidence, ...(q.distractors ?? []), ...(q.lures ?? [])]) {
      assert.equal(occurrences(found, e.anchor), 1, `${q.id}: "${e.anchor}" once`)
      assert.ok(place(found, e), `${q.id}: "${e.quote}" after "${e.anchor}"`)
    }
  }
}

const small = { xs: corpus({ seed: 7, size: 'xs' }), s: corpus({ seed: 1, size: 's' }), m: corpus({ seed: 1, size: 'm' }) }

test('the same seed makes the same corpus, another seed another', () => {
  const again = corpus({ seed: 1, size: 's' })
  assert.deepEqual(again.questions, small.s.questions)
  assert.deepEqual(files(again.sections, 'project'), files(small.s.sections, 'project'))
  assert.notDeepEqual(corpus({ seed: 2, size: 's' }).questions.map((q) => q.text), small.s.questions.map((q) => q.text))
})

test('every kind of question is asked, and sizes grow as promised', async () => {
  for (const c of [small.s, small.m]) {
    assert.deepEqual(new Set(c.questions.map((q) => q.type)), new Set(['lookup', 'paraphrase', 'filter', 'aggregate', 'multihop', 'temporal', 'crosslingual', 'negative', 'global']))
  }
  const pages = async (/** @type {ReturnType<typeof corpus>} */ c) => (await extracted(c, 'compendium'))[0].pages.length
  assert.ok(await pages(small.xs) <= 3)
  assert.ok(await pages(small.s) >= 6)
  assert.ok(await pages(small.m) >= 60)
  assert.ok(small.m.questions.some((q) => q.lang === 'ja') && small.m.questions.some((q) => q.lang === 'ar') && small.m.questions.some((q) => q.lang === 'fr'), 'questions in other languages')
})

test('each answer is found once in the compendium as Jean extracts it, at every small size', async () => {
  for (const c of Object.values(small)) assertFound(c.questions, await extracted(c, 'compendium'))
})

test('each answer is found in every format Jean reads: Word, Excel, PowerPoint, CSV, text and Markdown', async () => {
  for (const c of [small.xs, small.s]) assertFound(c.questions, await extracted(c, 'project'))
  // One document in each format, the whole compendium in it.
  for (const ext of ['docx', 'pptx', 'txt']) assertFound(small.s.questions, await extracted(small.s, 'compendium', ext))
})

test('what a question asks about and lacks is truly absent', async () => {
  for (const c of Object.values(small)) {
    const found = await extracted(c, 'compendium')
    for (const q of c.questions.filter((q) => q.answer.kind === 'none')) {
      for (const text of q.absent ?? []) assert.equal(occurrences(found, text), 0, `${q.id}: no "${text}"`)
      const code = /contract (C-\d{4}) set/.exec(q.text)?.[1]
      if (code) {
        const contract = c.world.contracts.find((/** @type {any} */ x) => x.code === code)
        assert.equal(contract.penalty, null, `${q.id}: ${code} has no penalty`)
      }
    }
  }
})

test('a paraphrase shares at most one content word with its evidence', () => {
  for (const c of Object.values(small)) {
    for (const q of c.questions.filter((q) => q.type === 'paraphrase')) {
      const shared = sharedTerms(q.text, q.evidence[0].quote)
      assert.ok(shared.length <= 1, `${q.id}: "${q.text}" shares ${shared.join(', ')}`)
    }
  }
})

test('the evidence suffices for each answer, and each piece of it is needed', async () => {
  for (const c of Object.values(small)) {
    const found = await extracted(c, 'compendium')
    for (const q of c.questions) {
      assert.equal(sufficient(q), '', q.id)
      const places = q.evidence.map((e) => place(found, e))
      // A count or a total needs every one of its places, each a different one.
      assert.equal(new Set(places.map((p) => p && `${p.file}:${p.page}:${p.start}`)).size, places.length, `${q.id}: distinct places`)
    }
  }
})

const FIXTURE = new URL('./fixtures/documents-xs.pdf', import.meta.url)

test('Jean reads a PDF that Chromium printed, in French, Japanese and Arabic, finding every answer', { skip: !existsSync(FIXTURE) && 'npm run documents -- --fixture prints it' }, async () => {
  assert.equal(typeof extractor.pageText, 'function', 'extract.js joins a PDF page’s text')
  const pages = await pdfPages(new Uint8Array(await readFile(FIXTURE)), extractor.pageText)
  const found = [{ name: 'compendium.pdf', pages }]
  assertFound(small.xs.questions, found)
  for (const lang of ['fr', 'ja', 'ar']) assert.ok(small.xs.sections.some((s) => s.blocks.some((b) => b.lang === lang)), `the fixture has ${lang}`)
})
