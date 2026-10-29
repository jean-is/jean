// Copies of Jean that Warehouse SAS hosts (D456, scripts/tenant.js): the registry and the command, which checks
// each address's policy as policy.html does and writes Caddy's configuration; and, where this computer has the
// image jean.is's Caddy runs, two addresses served from one release, each with its own policy and header, and no
// certificate for an address the registry doesn't list.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { request } from 'node:https'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { HEADERS, PAGES, TYPES } from '../app/caps/policy/checks.js'
import { ASK, SERVED, caddyfile, checkRegistry, checkTenant, cspOf, hostOf, main, outputs, readRegistry, sourceOf, tenantOf, withTenant, withoutTenant } from '../scripts/tenant.js'

const ACME = { brains: [{ id: 'corp', provider: 'custom', api: 'openai', baseURL: 'https://gateway.acme.example/v1', model: 'gpt-5', auth: 'oidc' }], signIn: { issuer: 'https://login.acme.example', clientId: 'jean' } }

describe('hosted copies', () => {
  it('lists an address by its host alone, in lower case', () => {
    assert.equal(hostOf('AI.Acme.com'), 'ai.acme.com')
    assert.equal(hostOf('acme.jean.is'), 'acme.jean.is')
    for (const name of [undefined, '', 'acme', 'https://ai.acme.com', 'ai.acme.com/', 'ai.acme.com:8443', '*.acme.com', '192.168.1.10', 'ai..acme.com', '-ai.acme.com', 'ai acme.com']) {
      assert.throws(() => hostOf(name), /isn't a host name/, String(name))
    }
  })

  it('writes an address as the source connect-src lists, a placeholder starting its host as any subdomain', () => {
    assert.equal(sourceOf('https://gateway.acme.example/v1'), 'https://gateway.acme.example')
    assert.equal(sourceOf('wss://relay.acme.example/x'), 'wss://relay.acme.example')
    assert.equal(sourceOf('https://{lang}.wikipedia.org/w/api.php'), 'https://*.wikipedia.org')
    assert.equal(sourceOf('http://localhost:11434/v1'), 'http://localhost:11434')
    assert.equal(sourceOf('https://Mirror.Acme.example:8443/hf/'), 'https://mirror.acme.example:8443')
    assert.equal(sourceOf('https://wiki.{region}.acme.example/'), null)
    assert.equal(sourceOf('http://ai.acme.example/'), null, 'plain http reaches only this computer')
  })

  it("narrows connect-src to what the policy has Jean fetch, its brains' providers included, but links", () => {
    const tenant = tenantOf('ai.acme.com', { ...ACME, brains: [...ACME.brains, { id: 'mistral', provider: 'mistral' }], urls: { privacy: 'https://intranet.acme.example/privacy', modelWeights: 'https://mirror.acme.example/hf/' } })
    assert.deepEqual(tenant.connect, ['https://gateway.acme.example', 'https://login.acme.example', 'https://mirror.acme.example', 'https://api.mistral.ai'])
    assert.equal(cspOf(tenant), "frame-ancestors 'self'; connect-src 'self' https://gateway.acme.example https://login.acme.example https://mirror.acme.example https://api.mistral.ai")
    assert.deepEqual(tenantOf('ai.acme.com', ACME, { connect: ['https://gateway.acme.example', 'https://tokens.acme.example'] }).connect, ['https://gateway.acme.example', 'https://login.acme.example', 'https://tokens.acme.example'])
    const open = tenantOf('acme.jean.is', {}, { open: true, release: '20261021-093000-91f6a1c3' })
    assert.deepEqual(open, { host: 'acme.jean.is', policy: {}, release: '20261021-093000-91f6a1c3' })
    assert.equal(cspOf(open), "frame-ancestors 'self'", 'people bring their own brains: only the header set')
    assert.throws(() => tenantOf('acme.jean.is', {}, { open: true, connect: ['https://x.example'] }), /--open/)
  })

  it('checks a policy as policy.html does: a typo warns, a wrong value, an address its own header refuses or no brain stops it', async () => {
    assert.deepEqual(await checkTenant(tenantOf('ai.acme.com', ACME)), { problems: [], warnings: [`Jean's own defaults its Content-Security-Policy refuses, unless the policy's urls name mirrors: modelWeights, wikipedia, vikidia, pyodide, pypi, npm, prices, timestamp, transparencyLog`] })
    const { problems, warnings } = await checkTenant({ ...tenantOf('ai.acme.com', { ...ACME, brain: [], rules: { fetch: 'maybe' } }), connect: ['https://login.acme.example', 'gateway'] })
    assert.ok(warnings.includes("brain isn't read by this version (brains?)"), warnings.join('; '))
    assert.ok(problems.includes('rules.fetch should be one of "allow", "ask", "never"'), problems.join('; '))
    assert.ok(problems.includes('connect "gateway" isn\'t an origin, such as https://gateway.acme.com'), problems.join('; '))
    assert.ok(problems.includes("brains[0].baseURL, https://gateway.acme.example/v1, is refused by the address's Content-Security-Policy: add --connect https://gateway.acme.example"), problems.join('; '))
    assert.match((await checkTenant(tenantOf('ai.acme.com', {}))).problems.join(), /Jean would reach no brain/)
    assert.deepEqual((await checkTenant(tenantOf('ai.acme.com', {}, { open: true }))).problems, [], 'open, people bring their own')
    assert.match((await checkTenant({ host: 'ai.acme.com', policy: {}, release: 'latest' })).problems.join(), /isn't a release's folder/)
    assert.deepEqual((await checkTenant({ host: 'ai.acme.com', policy: /** @type {any} */ ([]) })).problems, ['the policy should be an object, as policy.json is'])
  })

  it("asks ee/ about a key at the address itself, and leaves no page address behind", async () => {
    for (const policy of [{ key: 'not a key' }, { audit: { otlpEndpoint: 'https://otel.acme.example/v1/traces' } }]) {
      const { problems } = await checkTenant(tenantOf('ai.acme.com', { ...ACME, ...policy }, { connect: ['https://otel.acme.example'] }))
      assert.deepEqual(problems, ['ee/: policy.json holds no key, or one that is not a key'], JSON.stringify(policy))
    }
    assert.equal('location' in globalThis, false)
  })

  it('keeps one entry per address, in order, and refuses a registry of another shape', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'jean-tenants-'))
    try {
      const empty = await readRegistry(join(folder, 'tenants.json'))
      assert.deepEqual(empty, { format: 1, tenants: [] }, 'none yet')
      const two = withTenant(withTenant(empty, tenantOf('zeta.example.com', ACME)), tenantOf('ai.acme.com', ACME))
      assert.deepEqual(two.tenants.map((tenant) => tenant.host), ['ai.acme.com', 'zeta.example.com'])
      const replaced = withTenant(two, tenantOf('ai.acme.com', {}, { open: true }))
      assert.deepEqual(replaced.tenants.map((tenant) => [tenant.host, cspOf(tenant)]), [['ai.acme.com', "frame-ancestors 'self'"], ['zeta.example.com', cspOf(two.tenants[1])]])
      assert.deepEqual(withoutTenant(two, 'ai.acme.com').tenants.map((tenant) => tenant.host), ['zeta.example.com'])
      assert.throws(() => withoutTenant(two, 'b.example.com'), /isn't listed/)
      assert.match((await checkRegistry({ format: 1, tenants: [two.tenants[0], two.tenants[0]] })).problems.join(), /ai\.acme\.com: listed twice/)
      await writeFile(join(folder, 'other.json'), '{"tenants": {}}')
      await assert.rejects(readRegistry(join(folder, 'other.json')), /isn't a registry of hosted copies/)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it("writes Caddy's sites: the ask site for listed addresses alone, each address's release, policy and header, the header set and the pages", () => {
    const registry = { format: /** @type {const} */ (1), tenants: [tenantOf('acme.jean.is', {}, { open: true, release: '20261021-093000-91f6a1c3' }), tenantOf('ai.acme.com', ACME)] }
    const config = caddyfile(registry)
    assert.ok(config.includes(`http://${ASK} {\n\tbind 127.0.0.1\n\t@listed query domain=acme.jean.is domain=ai.acme.com\n\trespond @listed 200\n\trespond 404\n}`))
    assert.ok(config.includes(`acme.jean.is {\n\timport hosted ${SERVED}/releases/20261021-093000-91f6a1c3 ${SERVED}/tenants/acme.jean.is\n\theader Content-Security-Policy "frame-ancestors 'self'"\n}`))
    assert.ok(config.includes(`ai.acme.com {\n\timport hosted ${SERVED}/current ${SERVED}/tenants/ai.acme.com\n\theader Content-Security-Policy "${cspOf(registry.tenants[1])}"\n}`))
    assert.match(config, /\ttls \{\n\t\ton_demand\n\t\tissuer acme\n\t\}/, 'Let’s Encrypt alone, which a CAA record names')
    for (const [name, pattern, value] of HEADERS) {
      if (name === 'content-security-policy') for (const tenant of registry.tenants) assert.match(cspOf(tenant), pattern)
      else assert.ok(config.toLowerCase().includes(`\t\t${name} ${value}\n`), name)
    }
    assert.ok(config.includes('try_files {path} {path}.html'), `${PAGES.join(', ')} without .html`)
    assert.match(config, /handle \/policy\.json \{\n\t\troot \* \{args\[1\]\}\n\t\tfile_server\n\t\}/)
    assert.ok(caddyfile({ format: 1, tenants: [] }).includes(`http://${ASK} {\n\tbind 127.0.0.1\n\trespond 404\n}`), 'no address, no certificate')
    const files = outputs(registry)
    assert.deepEqual(Object.keys(files), ['Caddyfile', 'pinned', 'acme.jean.is/policy.json', 'ai.acme.com/policy.json'])
    assert.equal(files.pinned, 'releases/20261021-093000-91f6a1c3\n')
    assert.deepEqual(JSON.parse(files['ai.acme.com/policy.json']), ACME)
  })

  it('adds, replaces and removes an address, writing the registry and the folder only when every address passes', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'jean-tenants-'))
    const file = join(folder, 'tenants.json')
    const out = join(folder, 'out')
    /** @type {string[]} */
    const lines = []
    const where = { file, out, say: (/** @type {string} */ line) => lines.push(line) }
    try {
      await writeFile(join(folder, 'acme.json'), JSON.stringify(ACME))
      await main(['add', 'AI.acme.com', '--policy', join(folder, 'acme.json'), '--connect', 'https://tokens.acme.example'], where)
      await main(['add', 'acme.jean.is', '--open', '--release', '20261021-093000-91f6a1c3'], where)
      const registry = JSON.parse(await readFile(file, 'utf8'))
      assert.deepEqual(registry.tenants.map((/** @type {any} */ tenant) => tenant.host), ['acme.jean.is', 'ai.acme.com'])
      assert.deepEqual(registry.tenants[1].connect, ['https://gateway.acme.example', 'https://login.acme.example', 'https://tokens.acme.example'])
      assert.equal(await readFile(join(out, 'Caddyfile'), 'utf8'), caddyfile(registry))
      assert.deepEqual(JSON.parse(await readFile(join(out, 'ai.acme.com', 'policy.json'), 'utf8')), ACME)
      assert.ok(lines.includes(`tenant: ai.acme.com goes out with Content-Security-Policy: ${cspOf(registry.tenants[1])}`), lines.join('\n'))
      assert.ok(lines.includes("tenant: its DNS: ai.acme.com. CNAME the server's name"))
      await writeFile(join(folder, 'wrong.json'), JSON.stringify({ rules: { fetch: 'maybe' } }))
      await assert.rejects(main(['add', 'b.example.com', '--policy', join(folder, 'wrong.json'), '--open'], where), /nothing written:\n {2}b\.example\.com: rules\.fetch should be one of/)
      assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), registry, 'the registry as it was')
      await main(['remove', 'acme.jean.is'], where)
      assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).tenants.map((/** @type {any} */ tenant) => tenant.host), ['ai.acme.com'])
      await assert.rejects(readFile(join(out, 'acme.jean.is', 'policy.json')), /ENOENT/, "a removed address's policy goes")
      assert.equal(await readFile(join(out, 'pinned'), 'utf8'), '')
      lines.length = 0
      await main(['list'], where)
      assert.deepEqual(lines, [`ai.acme.com  current  ${cspOf(registry.tenants[1])}`])
      await assert.rejects(main(['list'], { ...where, file: '' }), /TENANTS names the registry/)
      await assert.rejects(main(['rename'], where), /add <host>/)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
})

/** The image jean.is's server runs Caddy from. */
const IMAGE = 'caddy:2.11-alpine'
const docker = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0

/**
 * A request to the container's 443 as a browser at that address makes it, its name sent in the handshake.
 * @param {number} port @param {string} host @param {string} path
 * @returns {Promise<{ status: number, headers: import('node:http').IncomingHttpHeaders, body: string }>}
 */
const get = (port, host, path) => new Promise((resolve, reject) => {
  request({ host: '127.0.0.1', port, servername: host, path, headers: { host }, rejectUnauthorized: false, timeout: 5000 }, (response) => {
    let body = ''
    response.setEncoding('utf8').on('data', (chunk) => { body += chunk }).on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body }))
  }).on('error', reject).on('timeout', function () { this.destroy(new Error('timed out')) }).end()
})

describe('hosted copies in Caddy', { skip: !docker && `no ${IMAGE} here` }, () => {
  it('serves two addresses from one release, each its own policy and header, and certifies only those listed', { timeout: 60_000 }, async () => {
    const folder = await mkdtemp(join(tmpdir(), 'jean-hosted-'))
    let container = ''
    try {
      const pinned = '20261021-093000-91f6a1c3'
      const registry = { format: /** @type {const} */ (1), tenants: [tenantOf('ai.acme.test', ACME), tenantOf('trial.jean.test', { locale: 'fr' }, { open: true, release: pinned })] }
      /** @type {Record<string, string>} */
      const files = {
        'current/index.html': '<!doctype html><html><head><meta name="app-policy" content="policy.json">\n</head><body>current</body></html>\n',
        'current/policy.json': '{}\n',
        'current/privacy.html': '<!doctype html><title>Privacy</title>\n',
        'current/LICENSE': 'MIT\n',
        ...Object.fromEntries(Object.keys(TYPES).map((ending) => [`current/file${ending}`, 'x'])),
        [`releases/${pinned}/index.html`]: '<!doctype html><body>pinned</body>\n',
        ...Object.fromEntries(Object.entries(outputs(registry, { issuer: 'issuer internal' })).map(([path, text]) => [`tenants/${path}`, text])),
      }
      for (const [path, text] of Object.entries(files)) {
        await mkdir(dirname(join(folder, 'hosted', path)), { recursive: true })
        await writeFile(join(folder, 'hosted', path), text)
      }
      await writeFile(join(folder, 'Caddyfile'), `{\n\tskip_install_trust\n\ton_demand_tls {\n\t\task http://${ASK}/\n\t}\n}\n\nimport ${SERVED}/tenants/Caddyfile\n`)
      const run = spawnSync('docker', ['run', '-d', '--rm', '-p', '127.0.0.1::443', '-v', `${join(folder, 'hosted')}:${SERVED}:ro`, '-v', `${join(folder, 'Caddyfile')}:/etc/caddy/Caddyfile:ro`, IMAGE], { encoding: 'utf8' })
      container = run.stdout.trim()
      assert.equal(run.status, 0, run.stderr)
      const port = Number(/:(\d+)\s*$/.exec(spawnSync('docker', ['port', container, '443/tcp'], { encoding: 'utf8' }).stdout.split('\n')[0])?.[1])
      let acme = null
      for (const until = Date.now() + 30_000; !acme && Date.now() < until;) acme = await get(port, 'ai.acme.test', '/').catch(() => new Promise((resolve) => setTimeout(() => resolve(null), 300)))
      assert.ok(acme, 'Caddy answers')
      assert.equal(acme.status, 200)
      assert.match(acme.body, /<meta name="app-policy" content="policy.json">[\s\S]*current/, 'the release index.html names the policy beside it')
      assert.equal(acme.headers['content-security-policy'], cspOf(registry.tenants[0]))
      for (const [name, pattern] of HEADERS) assert.match(String(acme.headers[name]), pattern, name)
      assert.equal(acme.headers['x-robots-tag'], 'noindex')
      assert.deepEqual(JSON.parse((await get(port, 'ai.acme.test', '/policy.json')).body), ACME)
      const trial = await get(port, 'trial.jean.test', '/')
      assert.match(trial.body, /pinned/, 'its own release')
      assert.equal(trial.headers['content-security-policy'], "frame-ancestors 'self'")
      assert.deepEqual(JSON.parse((await get(port, 'trial.jean.test', '/policy.json')).body), { locale: 'fr' })
      assert.equal((await get(port, 'ai.acme.test', '/privacy')).headers['content-type']?.split(';')[0], 'text/html', 'pages without .html')
      assert.equal((await get(port, 'ai.acme.test', '/nothing-here')).status, 404, 'no fallback page')
      /** @type {Record<string, string | undefined>} */
      const types = {}
      for (const [path, ending] of [...Object.keys(TYPES).map((ending) => [`/file${ending}`, ending]), ['/LICENSE', '']]) types[ending] = (await get(port, 'ai.acme.test', path)).headers['content-type']?.split(';')[0]
      assert.deepEqual(types, { ...TYPES, '': 'text/plain' }, 'every ending a deploy holds, LICENSE as text')
      await assert.rejects(get(port, 'stranger.test', '/'), 'no certificate for an address not listed')
      const asked = (/** @type {string} */ domain) => spawnSync('docker', ['exec', container, 'wget', '-q', '-O', '/dev/null', `http://${ASK}/?domain=${domain}`]).status
      assert.equal(asked('trial.jean.test'), 0, 'the ask site says yes to an address listed')
      assert.notEqual(asked('stranger.test'), 0, 'and no to any other')
    } finally {
      if (container) spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' })
      await rm(folder, { recursive: true, force: true })
    }
  })
})
