// The deploy recipes (deploy/, D415) send the header set, a type for every ending a deploy holds, and the
// pages without .html, as checks.js and so policy.html expect them: IIS, Static Web Apps, CloudFront and the container.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { HEADERS, TYPES, PAGES } from '../app/caps/policy/checks.js'
import { shippedFiles } from '../scripts/desktop.js'

const ROOT = new URL('../', import.meta.url)
const read = (/** @type {string} */ path) => readFile(new URL(path, ROOT), 'utf8')
const escape = (/** @type {string} */ text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const value = (/** @type {string} */ name) => /** @type {string} */ (HEADERS.find(([header]) => header === name)?.[2])

test('every ending a deploy holds has its type in the header set, and LICENSE none', async () => {
  const endings = new Set((await shippedFiles(fileURLToPath(new URL('app/', ROOT)))).map((path) => /\.[^./]+$/.exec(path)?.[0] ?? ''))
  for (const ending of endings) assert.ok(ending === '' || ending in TYPES, `${ending} has no type in checks.js's TYPES`)
})

test('IIS sends the header set and every type, and answers the pages without .html', async () => {
  const config = await read('deploy/iis/web.config')
  assert.match(config, /<clientCache cacheControlMode="DisableCache" \/>/, 'Cache-Control: no-cache')
  for (const name of ['X-Content-Type-Options', 'Content-Security-Policy', 'Strict-Transport-Security']) {
    assert.ok(config.includes(`<add name="${name}" value="${value(name.toLowerCase())}" />`), name)
  }
  for (const [ending, type] of Object.entries(TYPES)) assert.match(config, new RegExp(`<remove fileExtension="${escape(ending)}" /><mimeMap fileExtension="${escape(ending)}" mimeType="${escape(type)}[;"]`), ending)
  assert.match(config, /<remove fileExtension="\." \/><mimeMap fileExtension="\." mimeType="text\/plain/)
  assert.ok(config.includes(`<match url="^(${PAGES.join('|')})$" />`))
})

test('Static Web Apps sends the header set and every type, and answers the pages without .html', async () => {
  const config = JSON.parse(await read('deploy/azure/staticwebapp.config.json'))
  for (const [name, pattern] of HEADERS) {
    const header = Object.entries(config.globalHeaders).find(([key]) => key.toLowerCase() === name)?.[1]
    assert.match(String(header), pattern, name)
  }
  for (const [ending, type] of Object.entries(TYPES)) assert.equal(config.mimeTypes[ending]?.split(';')[0], type, ending)
  assert.deepEqual(config.routes, PAGES.map((page) => ({ route: `/${page}`, rewrite: `/${page}.html` })))
  assert.equal(config.navigationFallback, undefined, 'an address that names no file is a 404')
})

test('S3 and CloudFront send the header set and every type, and answer the pages without .html', async () => {
  const { SecurityHeadersConfig: security } = JSON.parse(await read('deploy/aws/headers.json'))
  assert.equal(security.ContentTypeOptions.Override, true)
  assert.match(security.ContentSecurityPolicy.ContentSecurityPolicy, /^frame-ancestors 'self'/)
  assert.equal(`max-age=${security.StrictTransportSecurity.AccessControlMaxAgeSec}`, value('strict-transport-security'))
  const sync = await read('deploy/aws/sync.sh')
  assert.match(sync, /--cache-control no-cache/)
  for (const [ending, type] of Object.entries(TYPES)) assert.match(sync, new RegExp(`^put '${escape(type)}[;'].*'\\*${escape(ending)}'`, 'm'), ending)
  const pages = await read('deploy/aws/pages.js')
  assert.ok(pages.includes(`/^\\/(${PAGES.join('|')})$/`))
})

test('the container sends the header set but HSTS, which its proxy adds, and answers the pages without .html', async () => {
  const config = await read('deploy/docker/nginx.conf')
  for (const name of ['cache-control', 'x-content-type-options', 'content-security-policy']) {
    assert.match(config, new RegExp(`add_header ${name} "${value(name)}" always;`, 'i'), name)
  }
  assert.match(config, /try_files \$uri \$uri\.html \$uri\/ =404;/)
})
