// The deploy recipes (deploy/, D415) send the header set, a type for every ending a deploy holds, and the
// pages without .html, as checks.js and so policy.html expect them: IIS, Static Web Apps, CloudFront, the container and Bunny.
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
  assert.ok(pages.includes(`/^\\/(${PAGES.map((page) => page.replace('/', '\\/')).join('|')})$/`))
})

test('the container sends the header set but HSTS, which its proxy adds, and answers the pages without .html', async () => {
  const config = await read('deploy/docker/nginx.conf')
  for (const name of ['cache-control', 'x-content-type-options', 'content-security-policy']) {
    assert.match(config, new RegExp(`add_header ${name} "${value(name)}" always;`, 'i'), name)
  }
  assert.match(config, /try_files \$uri \$uri\.html \$uri\/ =404;/)
})

test('the container’s APP_NAME names Jean in brand.js and every manifest, as written and as minified, whatever the name holds (D698)', async () => {
  const { execFile } = await import('node:child_process')
  const { mkdtemp, mkdir, writeFile, readdir, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { minify } = await import('../scripts/web.js')
  const run = (/** @type {string} */ from, /** @type {string} */ out, /** @type {string} */ name) => new Promise((resolve, reject) => {
    execFile('sh', [fileURLToPath(new URL('deploy/docker/app-name.sh', ROOT)), from, out], { env: { ...process.env, APP_NAME: name } }, (error, stdout, stderr) => (error ? reject(error) : resolve(stderr)))
  })
  const scratch = await mkdtemp(join(tmpdir(), 'app-name-'))
  try {
    const languages = (await readdir(new URL('app/manifests/', ROOT))).slice(0, 3)
    const brand = await read('app/brand.js')
    for (const [kind, source] of [['as written', brand], ['minified', await minify('brand.js', brand)]]) {
      const [from, out] = [join(scratch, kind, 'srv'), join(scratch, kind, 'named')]
      await mkdir(join(from, 'manifests'), { recursive: true })
      await writeFile(join(from, 'brand.js'), source)
      for (const path of ['manifest.webmanifest', ...languages.map((file) => `manifests/${file}`)]) await writeFile(join(from, path), await read(`app/${path}`))
      for (const name of ['Reefknot AI', 'Ana’s "assistant" & co | \\ /é', 'جان']) {
        assert.equal(await run(from, out, name), '', kind)
        const { BRAND, PAGES } = await import(`${new URL(`file://${join(out, 'brand.js')}`).href}?${encodeURIComponent(kind + name)}`)
        assert.deepEqual({ ...BRAND }, { name, domain: 'jean.is' }, `${kind}: ${name}`)
        assert.ok(PAGES.home, kind)
        for (const path of ['manifest.webmanifest', ...languages.map((file) => `manifests/${file}`)]) {
          const [manifest, own] = [JSON.parse(await readFile(join(out, path), 'utf8')), JSON.parse(await read(`app/${path}`))]
          assert.deepEqual(manifest, { ...own, name, short_name: name }, `${path}: ${name}`)
        }
      }
      // A line break would leave the files broken: Jean keeps its own name, and says why.
      assert.match(String(await run(from, out, 'Two\nlines')), /APP_NAME holds a line break/)
      await assert.rejects(readFile(join(out, 'brand.js')), 'nothing written')
      // Without one, nothing is written, and nginx serves Jean's own.
      await run(from, out, 'Reefknot AI')
      await run(from, out, '')
      await assert.rejects(readFile(join(out, 'brand.js')), 'what an earlier start wrote is gone')
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
  const [nginx, docker] = await Promise.all([read('deploy/docker/nginx.conf'), read('deploy/docker/Dockerfile')])
  assert.match(nginx, /location ~ \^\/\(brand\\\.js\|manifest\\\.webmanifest\|manifests\/\[\\w-\]\+\\\.webmanifest\)\$ \{\s+root \/tmp\/app-name;\s+try_files \$uri @jean;/)
  assert.match(docker, /^COPY --chmod=755 deploy\/docker\/app-name\.sh \/docker-entrypoint\.d\/40-app-name\.sh$/m)
})

test('the container images run on a hardened cluster: any user in group 0, a read-only root, nothing they never run', async () => {
  const docker = await read('deploy/docker/Dockerfile')
  /** Each stage by its name, the last one, Jean's, as ''. */
  const stages = Object.fromEntries(docker.split(/^FROM /m).slice(1).map((stage) => [/^.*\bAS ([\w-]+)$/m.exec(stage.split('\n')[0])?.[1] ?? '', stage]))
  // Node and nothing else: no shell, no package manager, nothing an intruder could run. Its binary stripped, and the
  // Alpine packages it links, whole, with apk's record of them, gathered on the builder's own platform, the build stopping
  // on a library left out.
  assert.match(stages['node-runtime'], /^scratch AS node-runtime\nCOPY --from=node-files \/target\/ \/$/m)
  assert.match(stages['node-files'], /^--platform=\$BUILDPLATFORM /)
  assert.deepEqual(/keep=' ([^']+) '/.exec(stages['node-files'])?.[1].split(' '), ['musl', 'libgcc', 'libatomic', 'libstdc++', 'ca-certificates-bundle', 'alpine-release'])
  assert.ok(stages['node-files'].includes('llvm-strip -o /target/usr/local/bin/node /node/usr/local/bin/node'), 'Node stripped')
  assert.ok(stages['node-files'].includes('llvm-readelf --needed-libs'), 'every library Node links, there')
  for (const name of ['gateway', 'relay']) {
    const stage = stages[name]
    assert.match(stage, /^node-runtime AS /, `${name} runs on node-runtime`)
    // A user by number, which Kubernetes can tell isn't root without running it.
    assert.match(stage, /^USER 1000$/m, `${name} runs as 1000`)
    const cmd = JSON.parse(/^CMD (\[.*\])$/m.exec(stage)?.[1] ?? '[]')
    assert.deepEqual(cmd.slice(0, 3), ['node', '--permission', '--allow-net'], `${name} runs under Node's permission model`)
    assert.ok(!cmd.some((/** @type {string} */ flag) => /^--allow-(child-process|worker|addons|wasi|ffi|inspector)/.test(flag)), `${name} spawns nothing`)
    assert.ok(!stage.includes('COPY package.json'), `${name} takes no package.json but its own`)
  }
  assert.ok(!JSON.parse(/^CMD (\[.*\])$/m.exec(stages.gateway)?.[1] ?? '[]').some((/** @type {string} */ flag) => flag.startsWith('--allow-fs-write')), 'the gateway writes nothing')
  // The relay's folder, its user's and group 0's, which any user OpenShift picks is in.
  assert.match(stages.relay, /^COPY --from=relay-data --chown=1000:0 --chmod=770 \/data \/data$/m)
  // Two nginx workers, not one per processor of the machine, written before the root is read-only.
  assert.match(stages['nginx-conf'], /^--platform=\$BUILDPLATFORM /)
  assert.ok(stages['nginx-conf'].includes("s/^worker_processes .*/worker_processes 2;/"))
  assert.match(stages[''], /^COPY --from=nginx-conf \/etc\/nginx\/nginx\.conf \/etc\/nginx\/nginx\.conf$/m)
  // Every image for another platform runs nothing under emulation: a RUN only where the builder's own platform is.
  for (const [name, stage] of Object.entries(stages)) if (/^RUN /m.test(stage)) assert.match(stage, /^--platform=\$BUILDPLATFORM /, `${name || 'jean'} runs only on the builder's platform`)
})

test('each container image carries Jean’s own labels, in place of nginx’s, and CI labels and annotates it alike', async () => {
  const [docker, ci] = await Promise.all([read('deploy/docker/Dockerfile'), read('.github/workflows/ci.yml')])
  /** Each stage by its name, the last one, Jean's, as ''. */
  const stages = Object.fromEntries(docker.split(/^FROM /m).slice(1).map((stage) => [/^.*\bAS ([\w-]+)$/m.exec(stage.split('\n')[0])?.[1] ?? '', stage]))
  /** A stage's labels over those of the stage it starts from. @param {string} name @returns {Record<string, string>} */
  const labelsOf = (name) => {
    const stage = stages[name]
    const base = /^\S+/.exec(stage)?.[0] ?? ''
    const own = [...stage.replace(/\\\n/g, ' ').matchAll(/^LABEL (.+)$/gm)].flatMap(([, line]) => [...line.matchAll(/([\w.-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))
    return { ...(base !== name && base in stages ? labelsOf(base) : {}), ...Object.fromEntries(own) }
  }
  const { parse, substitute } = await import('../scripts/ci.js')
  const images = /** @type {any} */ (parse(ci)).jobs.images
  const meta = images.steps.find((/** @type {any} */ step) => step.id === 'meta').with
  const OCI = 'org.opencontainers.image.'
  for (const entry of /** @type {{ image: string, target: string, description: string, licenses: string }[]} */ (images.strategy.matrix.include)) {
    const labels = labelsOf(entry.target)
    assert.deepEqual([labels[`${OCI}title`], labels[`${OCI}description`], labels[`${OCI}licenses`]], [entry.image, entry.description, entry.licenses], entry.image)
    // Every label nginx's image has, said again, so that none of its own passes on, and who made it and where to read more.
    for (const key of ['title', 'description', 'licenses', 'url', 'source', 'version', 'revision', 'created', 'vendor', 'authors', 'documentation']) assert.ok(`${OCI}${key}` in labels, `${entry.image} has its own ${key}`)
    assert.equal(labels.maintainer, labels[`${OCI}vendor`], `${entry.image}'s maintainer`)
    assert.equal(labels[`${OCI}version`], '${VERSION}', `${entry.image}'s version comes from CI, "dev" otherwise`)
    // What CI writes where the metadata action would say the repository's, the same as the Dockerfile.
    for (const kind of ['labels', 'annotations']) {
      for (const line of substitute(meta[kind], { matrix: entry, github: {}, steps: {} }).split('\n').filter(Boolean)) {
        const at = line.indexOf('=')
        assert.equal(line.slice(at + 1), labels[line.slice(0, at)], `CI's ${kind} for ${entry.image}: ${line.slice(0, at)}`)
      }
    }
  }
})

test('Bunny gets the header set and every type at each deploy, and its script answers the pages without .html', async () => {
  const { BARE, objectOf, rulesFor } = await import('../scripts/bunny.js')
  const headers = rulesFor({ id: 1, name: 'jean-site' }, 'r')[1]
  // The rule sends all but Cache-Control, which is the zone's own browser cache time, 0.
  const sent = { 'cache-control': 'public, max-age=0', ...Object.fromEntries([headers, ...headers.ExtraActions ?? []].map((action) => [action.ActionParameter1, action.ActionParameter2])) }
  for (const [name, pattern] of HEADERS) assert.match(String(sent[name]), pattern, name)
  for (const [ending, type] of Object.entries(TYPES)) assert.equal(objectOf(`a${ending}`, new Set())?.type.split(';')[0], type, ending)
  assert.ok((await read('deploy/bunny/pages.js')).includes(`/${BARE.source}/.test(url.pathname)`), 'the script asks for what deploy stores')
  for (const page of PAGES) assert.ok(BARE.test(`/${page}`), page)
})

test('every recipe sends what keeps other sites and pages away from Jean', async () => {
  const names = ['referrer-policy', 'cross-origin-opener-policy', 'permissions-policy']
  const iis = await read('deploy/iis/web.config')
  const nginx = await read('deploy/docker/nginx.conf')
  const tenant = await read('scripts/tenant.js')
  const azure = JSON.parse(await read('deploy/azure/staticwebapp.config.json')).globalHeaders
  const aws = JSON.parse(await read('deploy/aws/headers.json'))
  for (const name of names) {
    const mixed = name.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join('-')
    assert.ok(iis.includes(`<add name="${mixed}" value="${value(name)}" />`), `IIS ${name}`)
    assert.ok(nginx.includes(`add_header ${mixed} "${value(name)}" always;`), `nginx ${name}`)
    assert.ok(tenant.includes(`${mixed} `), `hosted copies ${name}`)
    assert.equal(azure[mixed], value(name), `Azure ${name}`)
  }
  assert.equal(aws.SecurityHeadersConfig.ReferrerPolicy.ReferrerPolicy, value('referrer-policy'))
  assert.deepEqual(aws.CustomHeadersConfig.Items.map((/** @type {{ Header: string, Value: string }} */ item) => [item.Header.toLowerCase(), item.Value]), names.slice(1).map((name) => [name, value(name)]))
})
