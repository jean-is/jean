// index.html guards: the CSP must allow exactly the inline import map, and keep
// the protections Jean relies on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? ''

test('the CSP hash matches the inline import map', () => {
  const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''
  const hash = createHash('sha256').update(map).digest('base64')
  assert.ok(csp.includes(`'sha256-${hash}'`), `update the CSP script-src hash to 'sha256-${hash}'`)
  assert.doesNotThrow(() => JSON.parse(map))
})

test('the CSP keeps its protections', () => {
  for (const directive of ["object-src 'none'", "base-uri 'none'", "require-trusted-types-for 'script'", "style-src 'self'"]) {
    assert.ok(csp.includes(directive), directive)
  }
  assert.ok(!/unsafe-inline|unsafe-eval'/.test(csp.replace("'wasm-unsafe-eval'", '')), 'no unsafe-inline or unsafe-eval')
})

test('the CSP meta comes before any script', () => {
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'))
})
