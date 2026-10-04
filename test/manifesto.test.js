// manifesto.html: the same words as MANIFESTO.md, and a CSP that allows only index.html's first-paint line.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const page = await readFile(new URL('../manifesto.html', import.meta.url), 'utf8')
const source = await readFile(new URL('../MANIFESTO.md', import.meta.url), 'utf8')

/** Words only: typographic and straight apostrophes alike, spaces collapsed. @param {string} text */
const words = (text) => text.replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()

test('the page says what MANIFESTO.md says', () => {
  const main = /<main[^>]*>([\s\S]*)<\/main>/.exec(page)?.[1] ?? ''
  const text = words(main.replace(/<[^>]+>/g, ' ').replace(/ ([.,:;])/g, '$1'))
  const blocks = source.split(/\n+/).map((line) => words(line.replace(/^#+ |^- /, '').replace(/\*\*/g, ''))).filter(Boolean)
  for (const block of blocks) assert.ok(text.includes(block), `missing from manifesto.html: ${block}`)
})

test('the page allows exactly its inline script, which is index.html’s light or dark and look', async () => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(page)?.[1] ?? ''
  const inline = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1])
  assert.equal(inline.length, 1)
  assert.ok(csp.includes(`'sha256-${createHash('sha256').update(inline[0]).digest('base64')}'`), 'update the CSP script-src hash')
  assert.equal(csp.match(/'sha256-/g)?.length, 1)
  for (const directive of ["object-src 'none'", "base-uri 'none'", "connect-src 'none'", "require-trusted-types-for 'script'", "style-src 'self'"]) assert.ok(csp.includes(directive), directive)
  assert.ok(!/unsafe-/.test(csp))
  assert.ok(page.indexOf('Content-Security-Policy') < page.indexOf('<script'))
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.equal(inline[0], /<script>([\s\S]*?)<\/script>/.exec(index)?.[1], 'copy index.html’s first-paint line, and its hash')
})
