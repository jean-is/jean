// What policy.html checks (D415): a policy.json against what this version reads, every part Jean's code
// reads being in its schema, and an address against a site's Content-Security-Policy, by CSP Level 3's rules.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCHEMA, checkPolicy, policiesOf, allows } from '../app/caps/policy/checks.js'

const APP = fileURLToPath(new URL('../app/', import.meta.url))

test('every part of policy.json that Jean’s code reads is one the check knows', async () => {
  // Other policies than policy.json: Trusted Types', a page's CSP, a strings key's start (`policy.locked`), a signal's.
  const others = new Set(['createScriptURL', 'get', 'html', 'json', 'locked', 'parent', 'peek', 'split', 'value'])
  for (const entry of await readdir(APP, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js') || entry.parentPath.includes('vendor')) continue
    const text = await readFile(join(entry.parentPath, entry.name), 'utf8')
    for (const [, name] of text.matchAll(/(?:app\.policy|\bpolicy)\??\.([a-zA-Z]+)\b/g)) {
      if (!others.has(name)) assert.ok(name in SCHEMA, `${entry.name} reads policy.${name}, which checks.js doesn't know`)
    }
  }
})

test('a policy’s typos, wrong values, missing parts and plain-http addresses are found, with the addresses it names', () => {
  const { problems, addresses } = checkPolicy({
    brain: [], capabilites: {}, brand: { name: 'Acme' },
    brains: [{ id: 'corp', provider: 'custom', api: 'openai', baseURL: 'https://ai.corp.example/v1', model: 'gpt-5', auth: 'oidc', effort: 'max' }],
    rules: { fetch: 'deny', send: 'ask', share: 'never' },
    capabilities: { deny: ['computr', 'files'] },
    signIn: { issuer: 'https://login.microsoftonline.com/tenant/v2.0' },
    urls: { privacy: '', terms: 'terms', gateway: 'http://gateway.corp.example/', wikipedia: 'https://wiki.corp.example/{lang}/w/api.php', modelWeights: 'mirror' },
    pages: { network: 'yes' }, lock: 'required', locale: 'fr', key: 42, audit: { content: false },
  }, ['files', 'computer'])
  assert.deepEqual(problems, [
    ['brain', 'unread', 'brains'],
    ['capabilites', 'unread', 'capabilities'],
    ['brand', 'unread', undefined],
    ['brains[0].effort', 'oneOf', ['low', 'medium', 'high']],
    ['rules.fetch', 'oneOf', ['allow', 'ask', 'never']],
    ['rules.send', 'unread', undefined],
    ['capabilities.deny[0]', 'capability'],
    ['signIn.clientId', 'missing'],
    ['urls.gateway', 'https'],
    ['pages.network', 'flag'],
    ['key', 'text'],
    ['audit.otlpEndpoint', 'missing'],
  ])
  assert.deepEqual(addresses, [
    ['brains[0].baseURL', 'https://ai.corp.example/v1'],
    ['signIn.issuer', 'https://login.microsoftonline.com/tenant/v2.0'],
    ['urls.wikipedia', 'https://wiki.corp.example/{lang}/w/api.php'],
  ])
  assert.deepEqual(checkPolicy([]).problems, [['', 'object']])
  assert.deepEqual(checkPolicy({ urls: { npm: 'http://localhost:4873/' } }), { problems: [], addresses: [['urls.npm', 'http://localhost:4873/']] })
})

test('an address is allowed when every policy of the site’s header allows it, by CSP Level 3’s source lists', () => {
  const self = 'https://jean.corp.example/policy.html'
  const site = policiesOf("frame-ancestors 'self', connect-src 'self' https://ai.corp.example *.mirror.example:8443 https://docs.example/api/; img-src *")
  for (const [address, allowed] of /** @type {Array<[string, boolean]>} */ ([
    ['https://ai.corp.example/v1/models', true], ['http://ai.corp.example/', false], ['https://other.example/', false],
    ['https://jean.corp.example/policy.json', true], ['wss://jean.corp.example/relay', true],
    ['https://a.mirror.example:8443/hf/', true], ['https://mirror.example:8443/', false], ['https://a.mirror.example/', false],
    ['https://docs.example/api/v1', true], ['https://docs.example/apiv1', false],
  ])) assert.equal(allows(site, address, self), allowed, address)
  assert.equal(allows(policiesOf(null), 'https://any.example/', self), true, 'no header allows everything')
  assert.equal(allows(policiesOf("default-src 'none'"), 'https://any.example/', self), false)
  assert.equal(allows(policiesOf("default-src 'self'; connect-src https:"), 'https://any.example/', self), true, 'connect-src wins over default-src')
  assert.equal(allows(policiesOf('connect-src http:'), 'https://any.example/', self), true, 'http: reaches https')
  assert.equal(allows(policiesOf('connect-src https://ai.corp.example'), 'https://ai.corp.example:444/', self), false, 'only the default port')
  assert.equal(allows(policiesOf("connect-src 'self'"), 'http://jean.corp.example/', self), false, "'self' never goes down to http")
})

test('policy.html runs only its import map, by its hash, and Jean’s own modules, and may ask any https address', async () => {
  const page = await readFile(join(APP, 'policy.html'), 'utf8')
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(page)?.[1] ?? ''
  const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(page)?.[1] ?? ''
  assert.ok(csp.includes(`script-src 'self' 'sha256-${createHash('sha256').update(map).digest('base64')}';`), 'update the script-src hash of its import map')
  assert.match(csp, /connect-src 'self' https: wss: http:;/)
  assert.match(csp, /require-trusted-types-for 'script'; trusted-types lit-html$/)
})
