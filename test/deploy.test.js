// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { HEADERS } from '../app/caps/policy/checks.js'
import { ACTION, RELEASES, bunnyRelease, objectOf, oldReleases, rulesFor, typeOf, zoneOf } from '../scripts/bunny.js'
import { KEEP, parseTarget, releaseName, remote, together, unpublished, whenPublic } from '../scripts/deploy.js'
import { held } from '../scripts/render.js'

/** A release uploaded then served, as a deploy does once npm lists its render package. @param {Parameters<typeof bunnyRelease>[0]} options */
const uploadAndServe = async (options) => {
  const site = bunnyRelease(options)
  await site.upload()
  await site.serve()
}

describe('deploy', () => {
  it('sends Jean’s server every module its services have, which its update script expects, taking what older commits sent too', async () => {
    const [ci, update] = await Promise.all([readFile('.github/workflows/ci.yml', 'utf8'), readFile('deploy/server/update.sh', 'utf8')])
    const archived = String(/git archive HEAD ([^|]+)\|/.exec(ci)?.[1]).trim().split(/\s+/)
    const copied = String(/cp ((?:dist\/host\/\S+ )+)stage\/host\//.exec(ci)?.[1]).trim().split(/\s+/).map((one) => one.replace(/^dist\//, ''))
    const expected = String(/^expected='([^']+)'/m.exec(update)?.[1]).split(' ')
    const modules = (await Promise.all(['gateway', 'relay', 'requests'].map(async (dir) => (await readdir(dir)).filter((name) => name.endsWith('.js')).map((name) => `${dir}/${name}`)))).flat()
    assert.deepEqual(archived.toSorted(), modules.toSorted(), 'CI sends each module of the gateway, the relay and the request service')
    assert.deepEqual([...archived, ...copied].toSorted(), expected.toSorted(), 'the update script expects what CI sends')
    // Its own `without`, as the server runs it, for what commits from before the journals, the colleagues and the stores sent.
    const without = (/** @type {string} */ pattern) => execFileSync('sh', ['-c', `${/^expected=.*$/m.exec(update)?.[0]}\n${/^without \(\).*$/m.exec(update)?.[0]}\nwithout '${pattern}'`]).toString().trim().split(' ').toSorted()
    assert.deepEqual(without('relay/journal.js'), expected.filter((one) => one !== 'relay/journal.js').toSorted())
    assert.deepEqual(without('relay/(colleagues|journal).js'), expected.filter((one) => !/^relay\/(colleagues|journal)\.js$/.test(one)).toSorted())
    assert.deepEqual(without('relay/(colleagues|journal|store).js'), expected.filter((one) => !/^relay\/(colleagues|journal|store)\.js$/.test(one)).toSorted())
    assert.match(update, /\[ "\$found" = "\$\(without 'relay\/journal\.js'\)" \] \|\| \[ "\$found" = "\$\(without 'relay\/\(colleagues\|journal\)\.js'\)" \] \|\| \[ "\$found" = "\$\(without 'relay\/\(colleagues\|journal\|store\)\.js'\)" \]/)
  })

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
    assert.equal(remote('/srv/jean', '20261013-203143-88a08e7').discard, "rm -rf '/srv/jean/releases/20261013-203143-88a08e7'", 'a release that won’t be served goes, current untouched')
  })

  it('uploads while npm makes the render package public, and a failure of either stops the other and undoes the upload once both stopped', async () => {
    /** @type {string[]} */
    const steps = []
    await together([async () => { steps.push('upload') }, async () => { steps.push('publish') }], () => { steps.push('undo') })
    assert.deepEqual(steps, ['upload', 'publish'], 'nothing undone when both succeed')

    steps.length = 0
    const refused = new Error('npm publish ./dist/render failed (exit 1)')
    const upload = async (/** @type {AbortSignal} */ signal) => {
      await new Promise((resolve) => signal.addEventListener('abort', resolve))
      steps.push('upload stopped')
      throw signal.reason
    }
    const publish = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      throw refused
    }
    await assert.rejects(together([upload, publish], () => { steps.push('undo') }), (error) => error === refused, 'the first failure, not the stop it caused')
    assert.deepEqual(steps, ['upload stopped', 'undo'], 'undone once the upload has stopped')
  })

  it('publishes the render package only when npm lacks the version the build names (D321)', () => {
    const listing = { render: { version: '0.8.0-r9e695e594201' } }
    assert.equal(unpublished(listing, ['0.0.0-stage', '0.8.0-re4c5b5a2bb10']), '0.8.0-r9e695e594201')
    assert.equal(unpublished(listing, []), '0.8.0-r9e695e594201', 'before its first version')
    assert.equal(unpublished(listing, ['0.8.0-re4c5b5a2bb10', '0.8.0-r9e695e594201']), null)
    assert.equal(unpublished({}, []), null, 'a build without a reader has no package')
  })

  it('goes on only once npm lists the version it published, which npm may hold staged for minutes, and stops past its time', async () => {
    const lists = [[], ['0.8.0-r1a'], ['0.8.0-r1a', '0.8.0-r2b']]
    const waits = /** @type {number[]} */ ([])
    const quiet = { wait: async (/** @type {number} */ ms) => { waits.push(ms) }, say: () => {} }
    await whenPublic('0.8.0-r2b', () => lists.shift() ?? [], { every: 10, within: 100, ...quiet })
    assert.deepEqual(waits, [10, 10])
    await assert.rejects(whenPublic('0.8.0-r3c', () => [], { every: 10, within: 30, ...quiet }), /npm stage list @jean-is\/render/)
    // The upload beside it failed: it stops waiting at once, not a minute later.
    const stop = new AbortController()
    const waiting = whenPublic('0.8.0-r3c', () => [], { every: 60_000, say: () => {}, signal: stop.signal })
    stop.abort(new Error('Bunny answered 401'))
    await assert.rejects(waiting, { name: 'AbortError' })
    // Run again while npm holds it, the publish is refused, and the deploy waits for it all the same.
    // npm holds the version CI's render job published minutes before, or has made it public since it was asked: no failure.
    assert.equal(held('npm error 409 Conflict - PUT https://registry.npmjs.org/@jean-is%2frender - Cannot publish over previously staged version "0.8.0-r2ac5fe39c4a3".'), true)
    assert.equal(held('npm error 403 403 Forbidden - PUT https://registry.npmjs.org/@jean-is%2frender - You cannot publish over the previously published versions: 0.8.0-r2ac5fe39c4a3.'), true)
    assert.equal(held('npm error code E403\nnpm error 403 OIDC permission denied for this action'), false)
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
    assert.deepEqual(objectOf('.well-known/security.txt', built), { key: '.well-known/security.txt', type: 'text/plain; charset=utf-8' }, 'as RFC 9116 asks')
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
    assert.deepEqual(set, Object.fromEntries(HEADERS.filter(([name]) => name !== 'cache-control').map(([name, , value]) => [name, value])), 'the header set policy.html checks, but its Cache-Control')
    assert.match('public, max-age=0', /** @type {RegExp} */ (HEADERS.find(([name]) => name === 'cache-control')?.[1]), 'which the zone sends, and policy.html takes')
    assert.equal(new Set(rules.map((rule) => rule.Description)).size, 3, 'each known by its own description')
    const narrowed = rulesFor({ id: 42, name: 'jean-site' }, 'r', "connect-src 'self' https://ai.corp.example")[1].ExtraActions?.find((action) => action.ActionParameter1 === 'content-security-policy')
    assert.equal(narrowed?.ActionParameter2, "frame-ancestors 'self'; connect-src 'self' https://ai.corp.example", 'the organisation’s policy after the header set’s')
  })

  it('uploads the release, sets the zone, points it at the release last, purges twice and removes the oldest', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'jean-bunny-'))
    await mkdir(join(dist, 'ui'))
    await mkdir(join(dist, '.well-known'))
    await Promise.all([['index.html', '<!doctype html>'], ['index.html.br', 'x'], ['LICENSE', 'MIT'], ['ui/app.js', 'export {}'], ['.well-known/security.txt', 'Contact: mailto:a@example.org\n']].map(([path, text]) => writeFile(join(dist, path), text)))
    /** @type {Array<{ method: string, url: string, headers: Record<string, string>, body: string }>} */
    const calls = []
    /** The pull zone's settings, as Bunny keeps them: logs and cookies, until the deploy sets them. */
    let zone = { EnableLogging: true, DisableCookies: false }
    const real = globalThis.fetch
    globalThis.fetch = /** @type {typeof fetch} */ (async (input, init = {}) => {
      const url = String(input)
      const body = init.body instanceof Uint8Array ? Buffer.from(init.body).toString() : String(init.body ?? '')
      calls.push({ method: init.method ?? 'GET', url, headers: /** @type {Record<string, string>} */ (init.headers), body })
      if (url.endsWith('/pullzone/7') && init.method === 'POST') zone = { ...zone, ...JSON.parse(body) }
      if (url.endsWith('/pullzone/7')) return Response.json({ StorageZoneId: 3, MiddlewareScriptId: 9, ...zone, EdgeRules: [{ Guid: 'g1', Description: 'jean: serve the current release' }] })
      if (url.endsWith('/storagezone/3')) return Response.json({ Id: 3, Name: 'jean-site' })
      if (url.endsWith(`/${RELEASES}/`)) return Response.json(['20261001-000000-a', '20261002-000000-b', '20261027-120000-c'].map((ObjectName) => ({ ObjectName, IsDirectory: true })))
      return new Response(null, { status: init.method === 'PUT' ? 201 : 200 })
    })
    try {
      const env = { BUNNY_STORAGE_KEY: 'storage', BUNNY_API_KEY: 'api', BUNNY_PULL_ZONE: '7' }
      await uploadAndServe({ dist, zone: 'jean-site', release: '20261027-120000-c', keep: 2, env, say: () => {}, settle: 0 })
    } finally {
      globalThis.fetch = real
      await rm(dist, { recursive: true, force: true })
    }
    const puts = calls.filter((call) => call.method === 'PUT')
    assert.deepEqual(puts.map((call) => call.url).sort(), ['.well-known/security.txt', 'LICENSE.html', 'index.html', 'ui/app.js'].map((key) => `https://storage.bunnycdn.com/jean-site/${RELEASES}/20261027-120000-c/${key}`))
    const license = puts.find((call) => call.url.endsWith('LICENSE.html'))
    assert.deepEqual([license?.headers.AccessKey, license?.headers['override-content-type'], license?.headers.checksum], ['storage', 'text/plain; charset=utf-8', createHash('sha256').update('MIT').digest('hex').toUpperCase()])
    const steps = calls.filter((call) => call.method !== 'PUT' && call.method !== 'GET').map((call) => `${call.method} ${new URL(call.url).pathname}`)
    assert.deepEqual(steps, ['POST /pullzone/7', ...Array(3).fill('POST /pullzone/7/edgerules/addOrUpdate'), 'POST /pullzone/7/purgeCache', 'POST /pullzone/7/purgeCache', `DELETE /jean-site/${RELEASES}/20261001-000000-a/`])
    const rules = calls.filter((call) => call.url.endsWith('addOrUpdate')).map((call) => JSON.parse(call.body))
    assert.equal(rules.at(-1).ActionParameter3, `/${RELEASES}/20261027-120000-c/`, 'the switch comes last')
    assert.equal(rules.at(-1).Guid, 'g1', 'and replaces the rule it wrote before')
    assert.ok(calls.filter((call) => call.url.startsWith('https://api.bunny.net')).every((call) => call.headers.AccessKey === 'api'))
    assert.deepEqual([zone.EnableLogging, zone.DisableCookies, zone.StickySessionType], [false, true, 0], 'no logs, and no cookie of any kind')
  })

  it('puts a file again that the Storage API failed to write, and stops at a refusal', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'jean-bunny-'))
    await writeFile(join(dist, 'tool.js'), 'export {}')
    /** @type {string[]} */
    const puts = []
    let refuse = 400
    const real = globalThis.fetch
    globalThis.fetch = /** @type {typeof fetch} */ (async (input, init = {}) => {
      const url = String(input)
      if (init.method === 'PUT') {
        puts.push(url)
        return puts.length === 1 ? Response.json({ HttpCode: refuse, Message: 'Unable to upload file: ' }, { status: refuse }) : new Response(null, { status: 201 })
      }
      if (url.endsWith('/pullzone/7')) return Response.json({ StorageZoneId: 3, MiddlewareScriptId: 9, EnableLogging: false, DisableCookies: true, EdgeRules: [] })
      if (url.endsWith('/storagezone/3')) return Response.json({ Id: 3, Name: 'jean-site' })
      if (url.endsWith(`/${RELEASES}/`)) return Response.json([])
      return new Response(null, { status: 200 })
    })
    const env = { BUNNY_STORAGE_KEY: 'storage', BUNNY_API_KEY: 'api', BUNNY_PULL_ZONE: '7' }
    try {
      await uploadAndServe({ dist, zone: 'jean-site', release: 'r', keep: 5, env, say: () => {}, settle: 0 })
      assert.equal(puts.length, 2, 'the same file, put again')
      puts.length = 0
      refuse = 429
      await uploadAndServe({ dist, zone: 'jean-site', release: 'r', keep: 5, env, say: () => {}, settle: 0 })
      assert.equal(puts.length, 2, 'and after too many at once')
      puts.length = 0
      refuse = 401
      await assert.rejects(uploadAndServe({ dist, zone: 'jean-site', release: 'r', keep: 5, env, say: () => {}, settle: 0 }), /Bunny answered 401/)
      assert.equal(puts.length, 1, 'a refusal stops at once')
    } finally {
      globalThis.fetch = real
      await rm(dist, { recursive: true, force: true })
    }
  })

  it('uploads without touching the pull zone, so a deploy can wait on npm before serving, stops when told, and removes a release it won’t serve', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'jean-bunny-'))
    await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(dist, `${i}.js`), 'export {}')))
    /** @type {string[]} */
    const calls = []
    const stop = new AbortController()
    const real = globalThis.fetch
    globalThis.fetch = /** @type {typeof fetch} */ (async (input, init = {}) => {
      const url = String(input)
      calls.push(`${init.method ?? 'GET'} ${new URL(url).pathname}`)
      if (url.endsWith('/pullzone/7')) return Response.json({ StorageZoneId: 3, MiddlewareScriptId: 9, EdgeRules: [] })
      if (url.endsWith('/storagezone/3')) return Response.json({ Id: 3, Name: 'jean-site' })
      if (url.includes('/r2/') && calls.filter((call) => call.startsWith('PUT')).length === 40) stop.abort(new Error('npm publish ./dist/render failed (exit 1)'))
      return new Response(null, { status: init.method === 'PUT' ? 201 : 200 })
    })
    const env = { BUNNY_STORAGE_KEY: 'storage', BUNNY_API_KEY: 'api', BUNNY_PULL_ZONE: '7' }
    try {
      const site = bunnyRelease({ dist, zone: 'jean-site', release: 'r', keep: 5, env, say: () => {}, settle: 0 })
      await site.discard()
      assert.equal(calls.length, 0, 'nothing to remove before a file went up')
      await site.upload()
      assert.equal(calls.filter((call) => call.startsWith('PUT')).length, 80)
      assert.deepEqual(calls.filter((call) => !call.startsWith('PUT')), ['GET /pullzone/7', 'GET /storagezone/3'], 'the zone read, never written')

      calls.length = 0
      const stopped = bunnyRelease({ dist, zone: 'jean-site', release: 'r2', keep: 5, env, say: () => {}, settle: 0 })
      await assert.rejects(stopped.upload(stop.signal), /npm publish/)
      const puts = calls.filter((call) => call.startsWith('PUT')).length
      assert.ok(puts >= 40 && puts < 80, `stops taking files once told (${puts} put)`)
      await stopped.discard()
      assert.equal(calls.at(-1), `DELETE /jean-site/${RELEASES}/r2/`)
    } finally {
      globalThis.fetch = real
      await rm(dist, { recursive: true, force: true })
    }
  })

  it('refuses a pull zone without its script, or one that keeps logs or cookies', async () => {
    const real = globalThis.fetch
    const env = { BUNNY_STORAGE_KEY: 'storage', BUNNY_API_KEY: 'api', BUNNY_PULL_ZONE: '7' }
    try {
      globalThis.fetch = /** @type {typeof fetch} */ (async (input) => (String(input).endsWith('/storagezone/3') ? Response.json({ Id: 3, Name: 'jean-site' }) : Response.json({ StorageZoneId: 3, MiddlewareScriptId: 0 })))
      await assert.rejects(uploadAndServe({ dist: '/nowhere', zone: 'jean-site', release: 'r', keep: 5, env, say: () => {}, settle: 0 }), /has no script/)
      globalThis.fetch = /** @type {typeof fetch} */ (async (input) => (String(input).endsWith('/storagezone/3') ? Response.json({ Id: 3, Name: 'other' }) : Response.json({ StorageZoneId: 3, MiddlewareScriptId: 9 })))
      await assert.rejects(uploadAndServe({ dist: '/nowhere', zone: 'jean-site', release: 'r', keep: 5, env, say: () => {}, settle: 0 }), /doesn't serve the storage zone jean-site/)
      await assert.rejects(uploadAndServe({ dist: '/nowhere', zone: 'jean-site', release: 'r', keep: 5, env: {}, say: () => {}, settle: 0 }), /BUNNY_STORAGE_KEY/)
      // A zone that keeps what the deploy sets: its logs, or a cookie to pin each visitor to a server.
      for (const [kept, refused] of /** @type {const} */ ([[{ EnableLogging: true, DisableCookies: true }, /didn't take EnableLogging:/], [{ EnableLogging: false }, /didn't take DisableCookies:/],
        [{ EnableLogging: false, DisableCookies: true, StickySessionType: 1 }, /didn't take StickySessionType:/]])) {
        const dist = await mkdtemp(join(tmpdir(), 'jean-bunny-'))
        globalThis.fetch = /** @type {typeof fetch} */ (async (input, init = {}) => {
          const url = String(input)
          if (url.endsWith('/storagezone/3')) return Response.json({ Id: 3, Name: 'jean-site' })
          if (url.endsWith('/pullzone/7')) return init.method === 'POST' ? new Response(null) : Response.json({ StorageZoneId: 3, MiddlewareScriptId: 9, ...kept })
          return new Response(null, { status: 201 })
        })
        await assert.rejects(uploadAndServe({ dist, zone: 'jean-site', release: 'r', keep: 5, env, say: () => {}, settle: 0 }), refused).finally(() => rm(dist, { recursive: true, force: true }))
      }
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
