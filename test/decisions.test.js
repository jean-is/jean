// docs/decisions.md is where a Dnnn leads: every number cited in the code, the tests, the scripts
// and the docs is one entry's, under its heading, so a comment or a commit message finds its rule.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const decisions = await readFile(new URL('docs/decisions.md', root), 'utf8')
const header = decisions.slice(0, decisions.indexOf('\n## '))

/** The numbers an entry's heading opens with, as in "- **D7 · D224 · One agent loop…". */
const headings = decisions.split('\n').filter((line) => line.startsWith('- **'))
  .map((line) => (/^- \*\*((?:D\d+ · )+)/.exec(line)?.[1].match(/\d+/g) ?? []).map(Number))
const all = headings.flat()

// Where decisions are cited: everything in the repository but third-party code, and the ready-made
// skills' steps, whose 8D disciplines are D1 to D8.
const PLACES = ['app/', 'site/', 'test/', 'scripts/', 'cli/', 'gateway/', 'desktop/', 'deploy/', 'examples/', 'docs/', 'AGENTS.md', 'README.md']
const SKIP = /(^|\/)(node_modules|vendor|dist)\/|\/directory\/[^/]+\/SKILL\.md$|\.(png|jpg|webp|ico|pdf|wasm|tsr|woff2?|ttf|zip|gz|onnx|sf3)$/
/** @param {string} path @returns {Promise<string[]>} */
const files = async (path) => {
  if (!path.endsWith('/')) return [path]
  const found = []
  for (const entry of await readdir(new URL(path, root), { withFileTypes: true })) {
    const inner = `${path}${entry.name}${entry.isDirectory() ? '/' : ''}`
    if (!SKIP.test(inner)) found.push(...(await files(inner)))
  }
  return found
}
/** Each number cited, with a file that cites it. @type {Map<number, string>} */
const cited = new Map()
for (const path of (await Promise.all(PLACES.map(files))).flat()) {
  const text = path === 'docs/decisions.md' ? decisions.slice(header.length) : await readFile(new URL(path, root), 'utf8')
  if (text.includes('\0')) continue
  for (const [, n] of text.matchAll(/\bD([1-9]\d{0,2})\b/g)) if (!cited.has(+n)) cited.set(+n, path)
}

test('every decision cited is in docs/decisions.md, under one heading', () => {
  const missing = [...cited].filter(([n]) => !all.includes(n)).map(([n, path]) => `${path} cites D${n}, which no entry heads`)
  assert.deepEqual(missing, [])
})

test('no number heads two entries', () => {
  const twice = [...new Set(all.filter((n, i) => all.indexOf(n) !== i))].map((n) => `D${n}`)
  assert.deepEqual(twice, [], `${twice.join(', ')} each head more than one entry`)
})

test('an entry is 200 words at most, its heading and rejected items included, the numbers heading it apart', () => {
  const lengths = decisions.split('\n').filter((line) => line.startsWith('- **'))
    .map((line) => [/D\d+/.exec(line)?.[0] ?? line.slice(4, 30), line.slice(2).replace(/^\*\*(?:D\d+ · )+/, '**').split(/\s+/).filter(Boolean).length])
  const long = lengths.filter(([, words]) => words > 200).map(([id, words]) => `${id} (${words})`)
  assert.deepEqual(long, [], 'move how it works to architecture.md or product.md, and say each reason in fewer words')
})
