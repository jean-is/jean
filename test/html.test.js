// index.html guards: the CSP must allow exactly the inline import map and the
// light-or-dark line, and keep the protections Jean relies on.
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

test('the CSP allows exactly the inline scripts there are', () => {
  const inline = [...html.matchAll(/<script(?:\s+type="importmap")?>([\s\S]*?)<\/script>/g)].map((match) => match[1])
  const hashes = inline.map((code) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`)
  for (const hash of hashes) assert.ok(csp.includes(hash), `add ${hash} to the CSP script-src`)
  assert.equal(csp.match(/'sha256-/g)?.length, hashes.length, 'remove the CSP hashes of scripts that are gone')
})

test('light or dark is set before the first paint, with the key ui/state.js uses', async () => {
  const theme = /<script>([\s\S]*?)<\/script>/.exec(html)
  assert.ok(theme && theme.index < html.indexOf('<link rel="stylesheet"'), 'before the stylesheet, which would hold it back')
  const state = await readFile(new URL('../ui/state.js', import.meta.url), 'utf8')
  const key = /THEME_KEY = '([^']+)'/.exec(state)?.[1]
  assert.ok(key && theme[1].includes(`localStorage.getItem('${key}')`))
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

const sandbox = await readFile(new URL('../sandbox.html', import.meta.url), 'utf8')
const sandboxCSP = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(sandbox)?.[1] ?? ''

test('the sandbox allows exactly its inline relay, and no network', () => {
  const relay = /<script>([\s\S]*?)<\/script>/.exec(sandbox)?.[1] ?? ''
  const hash = createHash('sha256').update(relay).digest('base64')
  assert.ok(sandboxCSP.includes(`'sha256-${hash}'`), `update the sandbox's script-src hash to 'sha256-${hash}'`)
  for (const directive of ["default-src 'none'", "connect-src 'none'", 'worker-src blob:', "base-uri 'none'"]) assert.ok(sandboxCSP.includes(directive), directive)
  assert.ok(!/'self'|unsafe-inline|unsafe-eval'|https?:/.test(sandboxCSP.replace("'wasm-unsafe-eval'", '')), 'nothing to load from anywhere')
  assert.ok(sandbox.indexOf('Content-Security-Policy') < sandbox.indexOf('<script'))
})

test('the sandbox is only ever framed without allow-same-origin', async () => {
  const client = await readFile(new URL('../ui/sandbox.js', import.meta.url), 'utf8')
  assert.match(client, /setAttribute\('sandbox', 'allow-scripts'\)/)
  assert.doesNotMatch(client, /allow-same-origin'/)
})

const python = await readFile(new URL('../caps/python/sandbox.html', import.meta.url), 'utf8')
const pythonCSP = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(python)?.[1] ?? ''

test('the Python sandbox has the same relay and no network; eval is allowed there only (D80)', () => {
  const relay = /<script>([\s\S]*?)<\/script>/.exec(python)?.[1] ?? ''
  assert.equal(relay, /<script>([\s\S]*?)<\/script>/.exec(sandbox)?.[1], 'the same relay as sandbox.html')
  assert.equal(pythonCSP, sandboxCSP.replace("'wasm-unsafe-eval'", "'wasm-unsafe-eval' 'unsafe-eval'"))
  assert.ok(!/unsafe-eval'/.test(sandboxCSP.replace("'wasm-unsafe-eval'", '')), 'Calculations never get eval')
  assert.ok(python.indexOf('Content-Security-Policy') < python.indexOf('<script'))
})
