import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { HEADERS } from '../app/caps/policy/checks.js'
import { ACTION, RELEASES, deployToBunny, objectOf, oldReleases, rulesFor, typeOf, zoneOf } from '../scripts/bunny.js'
import { KEEP, parseTarget, releaseName, remote, unpublished } from '../scripts/deploy.js'

describe('deploy', () => {
  it('reads the server and its folder from DEPLOY_TO, as rsync writes them', () => {
    assert.deepEqual(parseTarget('myserver:/srv/jean'), { host: 'myserver', folder: '/srv/jean' })
    assert.deepEqual(parseTarget('me@example.org:/apps/jean/site/'), { host: 'me@example.org', folder: '/apps/jean/site' })
  })

  it('refuses a target it would have to quote: none, relative, the root, spaces, quotes or a host read as an option', () => {
    for (const target of [undefined, '', 'myserver', 'myserver:', 'myserver:srv/jean', 'myserver:/', 'my server:/srv', "myserver:/srv/it's", 'myserver:/srv/a b', '-oProxyCommand=x:/srv']) {
      assert.throws(() => parseTarget(target), /DEPLOY_TO/, String(target))
    }
  })

  it('names a release by its time in UTC, then its commit, so names sort by time', () => {
    assert.equal(releaseName(new Date('2026-10-13T20:31:43.512Z'), '88a08e7'), '20261013-203143-88a08e7')
    const names = [new Date('2026-12-01T09:00:00Z'), new Date('2026-10-13T20:31:43Z')].map((date) => releaseName(date, 'abc1234'))
    assert.deepEqual([...names].sort(), names.reverse())
  })

  it('starts a release as hard links to the current one, swaps current in one step and keeps the last ones', () => {
    const { prepare, publish } = remote('/srv/jean', '20261013-203143-88a08e7')
    assert.match(prepare, /cp -al '\/srv\/jean\/current\/' '\/srv\/jean\/releases\/20261013-203143-88a08e7'/)
    assert.match(prepare, /else mkdir '\/srv\/jean\/releases\/20261013-203143-88a08e7'/, 'the first release has nothing to start from')
    assert.match(publish, /ln -sfn 'releases\/20261013-203143-88a08e7' current\.new; mv -T current\.new current/)
    assert.match(publish, new RegExp(`head -n -${KEEP} \\| \\{ if \\[ -f tenants/pinned \\]; then grep -vxF -f tenants/pinned; else cat; fi; \\} \\| xargs -r rm -rf`), 'but those hosted copies are pinned to (D456)')
    for (const command of [prepare, publish]) assert.match(command, /^set -e; /)
  })

  it('publishes the render package only when npm lacks the version the build names (D321)', () => {
    const listing = { render: { version: '0.8.0-r9e695e594201' } }
    assert.equal(unpublished(listing, ['0.0.0-stage', '0.8.0-re4c5b5a2bb10']), '0.8.0-r9e695e594201')
    assert.equal(unpublished(listing, []), '0.8.0-r9e695e594201', 'before its first version')
    assert.equal(unpublished(listing, ['0.8.0-re4c5b5a2bb10', '0.8.0-r9e695e594201']), null)
    assert.equal(unpublished({}, []), null, 'a build without a reader has no package')
  })
})

describe('deploy to Bunny', () => {
  it('reads the storage zone from DEPLOY_TO=bunny:<zone>, and leaves a server to parseTarget', () => {
    assert.equal(zoneOf('bunny:jean-site'), 'jean-site')
    assert.equal(zoneOf('myserver:/srv/jean'), null)
    assert.equal(zoneOf(undefined), null)
    for (const target of ['bunny:', 'bunny:a', 'bunny:jean/site', 'bunny:-jean', "bunny:jean'site"]) assert.throws(() => zoneOf(target), /DEPLOY_TO/, target)
  })

  it('stores each file with its type, a file without an ending under <path>.html, and leaves the compressed copies', () => {
    const built = new Set(['index.html', 'index.html.br', 'index.html.gz', 'privacy.html', 'LICENSE', 'LICENSE.br', 'vendor/pdfjs/cmaps/LICENSE', 'vendor/a.wasm', 'vendor/a.wasm.br', 'archive.tar.gz', 'x.unknown'])
    assert.deepEqual(objectOf('index.html', built), { key: 'index.html', type: 'text/html; charset=utf-8' })
    assert.equal(objectOf('index.html.br', built), null)
    assert.equal(objectOf('index.html.gz', built), null)
    assert.deepEqual(objectOf('LICENSE', built), { key: 'LICENSE.html', type: 'text/plain; charset=utf-8' }, 'found by the script that asks for /LICENSE.html, with its own type')
    assert.deepEqual(objectOf('vendor/pdfjs/cmaps/LICENSE', built), { key: 'vendor/pdfjs/cmaps/LICENSE.html', type: 'text/plain; charset=utf-8' })
    assert.deepEqual(objectOf('vendor/a.wasm', built), { key: 'vendor/a.wasm', type: 'application/wasm' })
    assert.deepEqual(objectOf('archive.tar.gz', built), { key: 'archive.tar.gz', type: 'application/octet-stream' }, 'a .gz of its own is a file')
    assert.equal(objectOf('x.unknown', built)?.type, 'application/octet-stream')
    assert.deepEqual(['.json', '.css', '.svg', '.sf3'].map(typeOf), ['application/json; charset=utf-8', 'text/css; charset=utf-8', 'image/svg+xml', 'application/octet-stream'], 'text in UTF-8')
  })

  it('serves the release from its folder by one rule, written last, behind a rule that hides every folder, with the header set', () => {
    const rules = rulesFor({ id: 42, name: 'jean-site' }, '20261027-120000-abc1234')
    assert.deepEqual(rules.map((rule) => rule.ActionType), [ACTION.block, ACTION.header, ACTION.storage])
    const [gate, headers, serve] = rules
    assert.deepEqual(gate.Triggers, [{ Type: 0, PatternMatches: [`*/${RELEASES}/*`], PatternMatchingType: 0 }])
    assert.deepEqual([serve.ActionParameter1, serve.ActionParameter2, serve.ActionParameter3], ['42', 'jean-site', `/${RELEASES}/20261027-120000-abc1234/`])
    assert.deepEqual(serve.Triggers, [{ Type: 0, PatternMatches: [`*/${RELEASES}/*`], PatternMatchingType: 2 }], 'every address but the folders')
    const set = Object.fromEntries([headers, ...(headers.ExtraActions ?? [])].map((action) => [action.ActionParameter1, action.ActionParameter2]))
    assert.deepEqual(set, Object.fromEntries(HEADERS.map(([name, , value]) => [name, value])), 'the header set policy.html checks')
    assert.equal(new Set(rules.map((rule) => rule.Description)).size, 3, 'each known by its own description')
    const narrowed = rulesFor({ id: 42, name: 'jean-site' }, 'r', "connect-src 'self' https://ai.corp.example")[1].ExtraActions?.find((action) => action.ActionParameter1 === 'content-security-policy')
    assert.equal(narrowed?.ActionParameter2, "frame-ancestors 'self'; connect-src 'self' https://ai.corp.example", 'the organisation’s policy after the header set’s')
  })

  it('uploads the release, sets the zone, points it at the release last, purges twice and removes the oldest', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'jean-bunny-'))
    await mkdir(join(dist, 'ui'))
    await Promise.all([['index.html', '<!doctype html>'], ['index.html.br', 'x'], ['LICENSE', 'MIT'], ['ui/app.js', 'export {}']].map(([path, text]) => writeFile(join(dist, path), text)))
    /** @type {Array<{ method: string, url: string, headers: Record<string, string>, body: string }>} */
    const calls = []
    let logging = true
    const real = globalThis.fetch
    globalThis.fetch = /** @type {typeof fetch} */ (async (input, init = {}) => {
      const url = String(input)
      const body = init.body instanceof Uint8Array ? Buffer.from(init.body).toString() : String(init.body ?? '')
      calls.push({ method: init.method ?? 'GET', url, headers: /** @type {Record<string, string>} */ (init.headers), body })
      if (url.endsWith('/pullzone/7') && init.method === 'POST') logging = JSON.parse(body).EnableLogging
      if (url.endsWith('/pullzone/7')) return Response.json({ StorageZoneId: 3, MiddlewareScriptId: 9, EnableLogging: logging, EdgeRules: [{ Guid: 'g1', Description: 'jean: serve the current release' }] })
      if (url.endsWith('/storagezone/3')) return Response.json({ Id: 3, Name: 'jean-site' })
      if (url.endsWith(`/${RELEASES}/`)) return Response.json(['20261001-000000-a', '20261002-000000-b', '20261027-120000-c'].map((ObjectName) => ({ ObjectName, IsDirectory: true })))
      return new Response(null, { status: init.method === 'PUT' ? 201 : 200 })
    })
    try {
      const env = { BUNNY_STORAGE_KEY: 'storage', BUNNY_API_KEY: 'api', BUNNY_PULL_ZONE: '7' }
      await deployToBunny({ dist, zone: 'jean-site', release: '20261027-120000-c', keep: 2, env, say: () => {}, settle: 0 })
    } finally {
      globalThis.fetch = real
      await rm(dist, { recursive: true, force: true })
    }
    const puts = calls.filter((call) => call.method === 'PUT')
    assert.deepEqual(puts.map((call) => call.url).sort(), ['LICENSE.html', 'index.html', 'ui/app.js'].map((key) => `https://storage.bunnycdn.com/jean-site/${RELEASES}/20261027-120000-c/${key}`))
    const license = puts.find((call) => call.url.endsWith('LICENSE.html'))
    assert.deepEqual([license?.headers.AccessKey, license?.headers['content-type'], license?.headers.checksum], ['storage', 'text/plain; charset=utf-8', createHash('sha256').update('MIT').digest('hex').toUpperCase()])
    const steps = calls.filter((call) => call.method !== 'PUT' && call.method !== 'GET').map((call) => `${call.method} ${new URL(call.url).pathname}`)
    assert.deepEqual(steps, ['POST /pullzone/7', ...Array(3).fill('POST /pullzone/7/edgerules/addOrUpdate'), 'POST /pullzone/7/purgeCache', 'POST /pullzone/7/purgeCache', `DELETE /jean-site/${RELEASES}/20261001-000000-a/`])
    const rules = calls.filter((call) => call.url.endsWith('addOrUpdate')).map((call) => JSON.parse(call.body))
    assert.equal(rules.at(-1).ActionParameter3, `/${RELEASES}/20261027-120000-c/`, 'the switch comes last')
    assert.equal(rules.at(-1).Guid, 'g1', 'and replaces the rule it wrote before')
    assert.ok(calls.filter((call) => call.url.startsWith('https://api.bunny.net')).every((call) => call.headers.AccessKey === 'api'))
  })

  it('refuses a pull zone without its script, or one that keeps logs', async () => {
    const real = globalThis.fetch
    const env = { BUNNY_STORAGE_KEY: 'storage', BUNNY_API_KEY: 'api', BUNNY_PULL_ZONE: '7' }
    try {
      globalThis.fetch = /** @type {typeof fetch} */ (async (input) => (String(input).endsWith('/storagezone/3') ? Response.json({ Id: 3, Name: 'jean-site' }) : Response.json({ StorageZoneId: 3, MiddlewareScriptId: 0 })))
      await assert.rejects(deployToBunny({ dist: '/nowhere', zone: 'jean-site', release: 'r', keep: 5, env, say: () => {}, settle: 0 }), /has no script/)
      globalThis.fetch = /** @type {typeof fetch} */ (async (input) => (String(input).endsWith('/storagezone/3') ? Response.json({ Id: 3, Name: 'other' }) : Response.json({ StorageZoneId: 3, MiddlewareScriptId: 9 })))
      await assert.rejects(deployToBunny({ dist: '/nowhere', zone: 'jean-site', release: 'r', keep: 5, env, say: () => {}, settle: 0 }), /doesn't serve the storage zone jean-site/)
      await assert.rejects(deployToBunny({ dist: '/nowhere', zone: 'jean-site', release: 'r', keep: 5, env: {}, say: () => {}, settle: 0 }), /BUNNY_STORAGE_KEY/)
    } finally {
      globalThis.fetch = real
    }
  })

  it('keeps the newest releases by name, which sorts by time', () => {
    const names = ['20261027-120000-c', '20261001-090000-a', '20261020-100000-b', '20261010-080000-x']
    assert.deepEqual(oldReleases(names, 2), ['20261010-080000-x', '20261001-090000-a'])
    assert.deepEqual(oldReleases(names, KEEP), [])
  })
})
