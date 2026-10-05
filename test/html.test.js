// index.html guards: the CSP must allow exactly the inline import map, the light-or-dark
// line and the opt-in to view transitions, and keep the protections Jean relies on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { sources } from './fixtures/keys.js'
import { pageRights, pagePolicy, pageAllow, site } from '../ui/csp.js'

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? ''

test('the CSP hash matches the inline import map', () => {
  const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''
  const hash = createHash('sha256').update(map).digest('base64')
  assert.ok(csp.includes(`'sha256-${hash}'`), `update the CSP script-src hash to 'sha256-${hash}'`)
  assert.doesNotThrow(() => JSON.parse(map))
})

test('the CSP allows exactly the inline scripts and styles there are', () => {
  const hashes = (/** @type {RegExp} */ pattern) => [...html.matchAll(pattern)].map((match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`)
  const directive = (/** @type {string} */ name) => csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? ''
  const scripts = hashes(/<script(?:\s+type="importmap")?>([\s\S]*?)<\/script>/g)
  const styles = hashes(/<style>([\s\S]*?)<\/style>/g)
  for (const hash of scripts) assert.ok(directive('script-src').includes(hash), `add ${hash} to the CSP script-src`)
  for (const hash of styles) assert.ok(directive('style-src').includes(hash), `add ${hash} to the CSP style-src`)
  assert.equal(csp.match(/'sha256-/g)?.length, scripts.length + styles.length, 'remove the CSP hashes of scripts and styles that are gone')
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

test('the sandbox allows exactly its inline relay, eval for Pyodide (D80, D162), and no network', () => {
  const relay = /<script>([\s\S]*?)<\/script>/.exec(sandbox)?.[1] ?? ''
  const hash = createHash('sha256').update(relay).digest('base64')
  assert.ok(sandboxCSP.includes(`'sha256-${hash}'`), `update the sandbox's script-src hash to 'sha256-${hash}'`)
  for (const directive of ["default-src 'none'", "connect-src 'none'", 'worker-src blob:', "base-uri 'none'"]) assert.ok(sandboxCSP.includes(directive), directive)
  assert.match(sandboxCSP, /script-src [^;]*'wasm-unsafe-eval' 'unsafe-eval';/)
  assert.ok(!/'self'|unsafe-inline|unsafe-eval'|https?:/.test(sandboxCSP.replace("'wasm-unsafe-eval' 'unsafe-eval'", '')), 'nothing to load from anywhere')
  assert.ok(sandbox.indexOf('Content-Security-Policy') < sandbox.indexOf('<script'))
})

test('the sandbox is only ever framed without allow-same-origin', async () => {
  const client = await readFile(new URL('../ui/sandbox.js', import.meta.url), 'utf8')
  assert.match(client, /setAttribute\('sandbox', 'allow-scripts'\)/)
  assert.doesNotMatch(client, /allow-same-origin'/)
})

const preview = await readFile(new URL('../preview.html', import.meta.url), 'utf8')
const previewCSP = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(preview)?.[1] ?? ''

test('a page runs its own scripts by default, and reaches nothing unless Settings or policy lets it (D143)', () => {
  const { allows, locked } = pageRights({})
  assert.deepEqual(allows, { scripts: true, fullscreen: true, downloads: true, web: false, network: false })
  assert.equal(locked.size, 0)
  const policy = pagePolicy(allows)
  for (const directive of ["default-src 'none'", "script-src 'unsafe-inline';", "connect-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(policy.includes(directive), directive)
  assert.ok(!/'self'|https?:|\*|blob:|unsafe-eval|sha256-|nonce-/.test(policy), 'nothing to load from anywhere, and no hash, which would turn unsafe-inline off')
  assert.match(pagePolicy({ scripts: false, web: true, network: true }), /script-src 'none';.*img-src data: https:;/, 'no script runs, not even from the web')
  assert.match(pagePolicy({ scripts: true, web: false, network: true }), /script-src 'unsafe-inline';.*connect-src https:;/)
  // The user's choice, then the organisation's, which is locked.
  const set = pageRights({ pages: { web: true, scripts: false, sites: ['a.example'] } }, { pages: { scripts: true, sites: ['corp.example'] } })
  assert.deepEqual(set.allows, { scripts: true, fullscreen: true, downloads: true, web: true, network: false })
  assert.deepEqual(set.sites, ['corp.example'])
  assert.deepEqual([...set.locked], ['scripts', 'sites'])
})

test('a page reaches any site, or only those listed, as typed or pasted (D143)', () => {
  for (const [typed, normal] of [['*', '*'], [' API.Example.com ', 'api.example.com'], ['*.example.org', '*.example.org'],
    ['https://example.com:8443/path?q', 'example.com:8443'], ['café.fr', 'xn--caf-dma.fr'], ['*.com', '*.com'], ['example.com:*', 'example.com:*'],
    ['localhost:3000', 'localhost:3000'], ['localhost:*', 'localhost:*'], ['http://localhost:3000/app', 'localhost:3000'], ['127.0.0.1:8080', '127.0.0.1:8080'], ['localhost', 'localhost']]) assert.equal(site(typed), normal, typed)
  for (const typed of ['', 'example', 'com', '*.', 'localhost:3000:*', 'ftp://localhost', 'http://example.com', 'wss://example.com', 'ex*ample.com', 'a b.com', 'user@example.com', "x.com; script-src *"]) assert.equal(site(typed), null, typed)
  const on = { scripts: true, web: false, network: true }
  assert.match(pagePolicy(on), /connect-src https:;/, 'any site by default')
  assert.match(pagePolicy(on, ['api.example.com', '*.example.org']), /connect-src https:\/\/api\.example\.com https:\/\/\*\.example\.org;/)
  assert.match(pagePolicy(on, ['x.com; script-src *']), /connect-src 'none';/, 'a list with nothing valid in it reaches nothing')
  assert.match(pagePolicy(on, ['localhost:3000', '127.0.0.1:*']), /connect-src http:\/\/localhost:3000 http:\/\/127\.0\.0\.1:\*;/, 'this computer over http, which covers https')
  assert.match(pagePolicy({ ...on, network: false }, ['api.example.com']), /connect-src 'none';/)
})

test('the preview frame allows at most what Settings can, and its relay writes the policy first (D126, D143)', () => {
  assert.equal(previewCSP, pagePolicy({ scripts: true, web: true, network: true }, ['*', 'localhost:*', '127.0.0.1:*'], true), "preview.html's policy is the loosest a page can be given, a folder's included")
  assert.match(pagePolicy({ scripts: true, web: false, network: false }, [], true), /script-src 'unsafe-inline' data:;/, "a folder's page: its scripts and modules as data (D156)")
  assert.ok(preview.indexOf('Content-Security-Policy') < preview.indexOf('<script'))
  const relay = /<script>([\s\S]*?)<\/script>/.exec(preview)?.[1] ?? ''
  assert.ok(relay.indexOf('http-equiv="Content-Security-Policy"') < relay.indexOf('document.write(data.page)'), "the page's policy, before the page")
  assert.match(relay, /typeof data\?\.policy !== 'string'/, 'no page without its policy')
  // What keeps the frame from being taken elsewhere is the page around it.
  assert.ok(csp.includes("frame-src 'self'"), "index.html's frame-src stays 'self'")
})

test('a page may fill the screen and save files unless Settings says no; it can always copy (D158)', async () => {
  const { allows } = pageRights({})
  assert.equal(pageAllow(allows), 'fullscreen *; clipboard-write *')
  assert.equal(pageAllow({ ...allows, fullscreen: false }), 'clipboard-write *')
  const locked = pageRights({ pages: { fullscreen: true } }, { pages: { fullscreen: false, downloads: false } })
  assert.equal(pageAllow(locked.allows), 'clipboard-write *')
  assert.deepEqual([...locked.locked], ['fullscreen', 'downloads'])
  // Saving isn't the frame's (no allow-downloads): the relay hands the file to Jean, which saves it when allowed, on a click.
  const relay = /<script>([\s\S]*?)<\/script>/.exec(preview)?.[1] ?? ''
  assert.ok(relay.indexOf('URL.createObjectURL =') < relay.indexOf('document.write(data.page)'), 'what the page makes is known before it runs')
  assert.match(relay, /if \(!saved\(link\)\) parent\.postMessage\(\{ open: /)
  const save = await readFile(new URL('../ui/save.js', import.meta.url), 'utf8')
  assert.match(save, /if \(allowed && blob instanceof Blob && navigator\.userActivation\?\.isActive !== false\) save\(/)
  const client = await readFile(new URL('../ui/preview.js', import.meta.url), 'utf8')
  assert.match(client, /savePage\(data, rights\.peek\(\)\.allows\.downloads\)/)
})

test('the preview is only ever framed without allow-same-origin, and the page never opens in a tab', async () => {
  const client = await readFile(new URL('../ui/preview.js', import.meta.url), 'utf8')
  const frames = [...client.matchAll(/<iframe\b[^>]*>/g)].map((match) => match[0])
  assert.equal(frames.length, 1)
  assert.match(frames[0], /\ssandbox="allow-scripts" allow=\$\{allow\} src=\$\{FRAME\}\s/, 'scripts, and nothing else: no same origin, pop-ups, forms or top navigation; what it allows set before its address (D158)')
  assert.doesNotMatch(client, /srcdoc|setAttribute\('sandbox'/, 'srcdoc would take index.html\'s policy instead of the preview\'s')
  const state = await readFile(new URL('../ui/state.js', import.meta.url), 'utf8')
  assert.doesNotMatch(state, /createObjectURL[\s\S]{0,200}open\(/, 'a file in a tab of Jean\'s origin would run its scripts there')
})

const host = await readFile(new URL('../caps/browser/browser.html', import.meta.url), 'utf8')
const hostCSP = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(host)?.[1] ?? ''

test('the browser’s frame is in a document with no script, whose policy lets a frame show another site (D140)', () => {
  const style = /<style>([\s\S]*?)<\/style>/.exec(host)?.[1] ?? ''
  const hash = createHash('sha256').update(style).digest('base64')
  assert.ok(hostCSP.includes(`style-src 'sha256-${hash}';`), `its style alone: update the browser's style-src hash to 'sha256-${hash}'`)
  assert.doesNotMatch(host, /<script/i, 'no script: Jean puts the frame in')
  assert.doesNotMatch(hostCSP, /script-src|'unsafe|blob:|data:|\s\*[\s;]/, "default-src 'none' keeps scripts out; no blob, data or any address shows here")
  for (const directive of ["default-src 'none'", 'frame-src https: http://localhost:* http://127.0.0.1:*;', "base-uri 'none'", "form-action 'none'", "require-trusted-types-for 'script'", "trusted-types 'none'"]) {
    assert.ok(hostCSP.includes(directive), directive)
  }
  assert.ok(host.indexOf('Content-Security-Policy') < host.indexOf('<style'))
})

test('only the browser’s frame keeps its site’s origin, and the site can never take Jean’s place (D140)', async () => {
  // Code lines only: comments say where it is never given.
  const code = Object.entries(await sources()).filter(([, text]) => text.split('\n').some((line) => line.includes('allow-same-origin') && !/^\s*(\/\/|\*|\/\*)/.test(line)))
  assert.deepEqual(code.map(([path]) => path), ['caps/browser/browser.js'])
  const browser = code[0][1]
  const flags = /const SANDBOX = '([^']+)'/.exec(browser)?.[1].split(' ') ?? []
  assert.ok(flags.includes('allow-scripts') && flags.includes('allow-same-origin'))
  assert.ok(!flags.some((flag) => flag.startsWith('allow-top-navigation')), 'the site never navigates Jean')
  assert.match(browser, /frame = doc\.createElement\('iframe'\)/, 'made in browser.html, whose policy alone lets it show another site')
  assert.match(browser, /setAttribute\('sandbox', SANDBOX\)/)
  assert.match(browser, /if \(!isLocal\(url\) && \(!showable\(url, location\.href\)/, 'never one of Jean\'s own pages')
  // A page of the user's folder never goes there: it is in a frame of the preview's kind, scripts only, an opaque origin (D156).
  assert.match(browser, /function frameTo\(url, click = false\) \{\n  if \(isLocal\(url\)\) return void folderTo\(url, click\)/)
  assert.match(browser, /const PAGE = new URL\('\.\.\/\.\.\/preview\.html', import\.meta\.url\)/)
  assert.match(browser, /element\.setAttribute\('sandbox', 'allow-scripts'\)\n  element\.setAttribute\('allow', allows\)\n  element\.addEventListener\('load', \(\) => element\.contentWindow\?\.postMessage\(\{ page: source, policy: rules \}, '\*'\), \{ once: true \}\)\n  element\.src = PAGE/)
})
