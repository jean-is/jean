// What a web deploy serves (D318): Jean's own code minified, nothing else changed, and each file
// beside itself compressed; capabilities.json and sw.js describe the files served.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { buildCapabilities, computeVersion, integrityOf } from '../scripts/manifest.js'
import { minifies, minify, openSearch, precompress, restamp, withPolicy, withSearch } from '../scripts/web.js'

test('Jean’s own code is minified, never the service worker, the bridge, third-party code, the pages or the user’s starting CSS', () => {
  for (const path of ['brand.js', 'core/fs.js', 'ui/app.js', 'ui/style.css', 'ui/looks/neon.css', 'caps/computer/computer-worker.js', 'ee/keys.js']) assert.ok(minifies(path), path)
  for (const path of ['sw.js', 'bridge/bridge.js', 'vendor/marked.esm.js', 'vendor/maplibre/maplibre-gl.css', 'index.html', 'sandbox.html',
    'caps/browser/browser.html', 'ui/touches.css', 'locales/en.json', 'caps/skills/directory/pptx/SKILL.md', 'icons/icon.svg']) assert.ok(!minifies(path), path)
})

test('a module’s own names shorten and its exports stay; a classic script keeps its global names', async () => {
  const module = await minify('a.js', "import { a } from './b.js'\n// A comment.\nfunction helper (value) { return a + value }\nexport const result = helper(1)\n")
  assert.match(module, /export const result=/)
  assert.doesNotMatch(module, /helper|comment/)
  const script = await minify('worker.js', '// A worker.\nfunction onmessage (event) { reply(event.data) }\nfunction reply (data) { self.postMessage(data) }\n')
  assert.match(script, /function onmessage\(/)
  assert.match(script, /function reply\(/)
})

test('nothing is lowered or prefixed, text stays UTF-8, and an SPDX notice stays at the top', async () => {
  assert.equal(await minify('a.css', 'dialog[open] {\n  @starting-style { opacity: 0; }\n}\n.mask { mask: none; } /* Colours stay. */\n.fill { fill: oklch(0.69 0.16 27 / 0.5); }\n'),
    'dialog[open]{@starting-style{opacity:0}}.mask{mask:none}.fill{fill:oklch(0.69 0.16 27 / 0.5)}\n')
  assert.match(await minify('a.js', "export const words = (text) => text.match(/\\p{L}+/gu) ?? ['é', '日本']\n"), /^export const words=(\w)=>\1\.match\(\/\\p\{L\}\+\/gu\)\?\?\["é","日本"\];\n$/)
  const notice = '// SPDX-FileCopyrightText: 2026 Warehouse SAS\n// SPDX-License-Identifier: Elastic-2.0\n'
  assert.ok((await minify('ee/a.js', `${notice}export const key = 1 // The key.\n`)).startsWith(notice))
})

test('capabilities.json lists the files served, by their hashes, and sw.js carries the version they make; the render package keeps its own', async () => {
  const render = { version: '0.8.0-r000000000000', entry: 'ui/reader.js', files: ['ui/reader.js'], map: {}, integrity: { 'ui/reader.js': 'sha256-as-written' } }
  const listing = buildCapabilities('old', ['ui/reader.js', 'index.html'], ['locales/en.json'],
    { 'ui/reader.js': 'sha256-as-written', 'index.html': 'sha256-x', 'locales/en.json': 'sha256-y' }, { files: { files: ['ui/reader.js'] } }, render)
  const files = /** @type {Record<string, string>} */ ({ 'ui/reader.js': 'export{}', 'index.html': '<!doctype html>', 'locales/en.json': '{}' })
  const { version, listing: written, worker } = await restamp(listing, "// The worker.\nconst VERSION = 'old'\n", async (path) => Buffer.from(files[path]))
  const hex = (/** @type {string} */ text) => createHash('sha256').update(text).digest('hex')
  assert.equal(version, computeVersion(Object.entries(files).map(([path, text]) => [path, hex(text)])))
  const data = JSON.parse(written)
  assert.equal(data.version, version)
  assert.deepEqual(data.integrity, Object.fromEntries(Object.entries(files).map(([path, text]) => [path, integrityOf(hex(text))])))
  assert.deepEqual(data.render, render)
  assert.deepEqual([data.shell, data.locales, data.capabilities], [['ui/reader.js', 'index.html'], ['locales/en.json'], { files: { files: ['ui/reader.js'] } }])
  assert.equal(worker, `// The worker.\nconst VERSION = '${version}'\n`)
  await assert.rejects(restamp(listing, '// No version.\n', async (path) => Buffer.from(files[path])))
})

test('each file is beside itself in brotli and gzip, only when smaller, and never what is compressed already', async () => {
  const text = Buffer.from('Jean '.repeat(200))
  const copies = Object.fromEntries(await precompress('ui/a.js', text))
  assert.deepEqual(Object.keys(copies), ['.br', '.gz'])
  assert.deepEqual(brotliDecompressSync(copies['.br']), text)
  assert.deepEqual(gunzipSync(copies['.gz']), text)
  assert.deepEqual(await precompress('ui/b.js', Buffer.from('a')), [])
  for (const path of ['fonts/display.woff2', 'icons/icon-512.png', 'screenshots/en/welcome-wide.webp', 'vendor/pyodide/python_stdlib.zip']) assert.deepEqual(await precompress(path, text), [], path)
})

test('a deploy’s policy: index.html names the policy.json beside it, once, as an organisation would by hand (D344)', async () => {
  const page = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
  const named = withPolicy(page)
  assert.equal(named.match(/<meta name="app-policy" content="policy.json">/g)?.length, 1)
  assert.ok(named.indexOf('name="app-policy"') < named.indexOf('</head>'))
  assert.equal(named.replace('<meta name="app-policy" content="policy.json">\n', ''), page)
  assert.throws(() => withPolicy(named), /already names a policy/)
})

test('a deploy’s address makes it a search engine: whole addresses for a search and its icon, and index.html names it, once (D353)', async () => {
  const brand = { name: 'Jean & Co' }
  const description = 'Files in, <things> out.'
  for (const site of ['https://example.org', 'https://example.org/']) {
    const xml = openSearch(site, brand, description)
    assert.match(xml, /<Url type="text\/html" method="get" template="https:\/\/example\.org\/\?q=\{searchTerms\}"\/>/)
    assert.match(xml, />https:\/\/example\.org\/icons\/icon-192\.png</)
  }
  const nested = openSearch('https://example.org/teams/jean', brand, description)
  assert.match(nested, /template="https:\/\/example\.org\/teams\/jean\/\?q=\{searchTerms\}"/)
  assert.match(nested, /<ShortName>Jean &amp; Co<\/ShortName>/)
  assert.match(nested, /<Description>Files in, &lt;things&gt; out\.<\/Description>/)
  for (const site of ['ftp://example.org/', 'https://example.org/?q=1', 'https://example.org/#/', 'https://me@example.org/', 'example.org']) assert.throws(() => openSearch(site, brand, description), /ADDRESS/, site)

  const page = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
  const named = withSearch(withPolicy(page), { name: 'Jean "J"' })
  assert.equal(named.match(/<link rel="search" type="application\/opensearchdescription\+xml" title="Jean &quot;J&quot;" href="opensearch.xml">/g)?.length, 1)
  assert.ok(named.indexOf('rel="search"') < named.indexOf('</head>'))
  assert.throws(() => withSearch(named, brand), /already names a search/)
})
