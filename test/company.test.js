// SPDX-License-Identifier: MIT
// A company's own server (D762): the gateway reads again the file the keeper writes, and install.sh checks what it is
// given, keeps its images' commands, pins and signer in step with the rest of the repository, and verifies updates.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { unwatchFile } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reloading } from '../gateway/serve.js'
import { NAMESPACE, SIGNER } from '../scripts/release.js'

const INSTALL = 'deploy/company/install.sh'
const install = await readFile(INSTALL, 'utf8')
/** What install.sh writes to a file, between `cat > <file> <<'EOF'` and the EOF closing it. @param {string} file */
const written = (file) => {
  const start = install.indexOf(`cat > ${file} <<'EOF'\n`)
  assert.ok(start >= 0, `install.sh writes ${file}`)
  const body = install.slice(install.indexOf('\n', start) + 1)
  return body.slice(0, body.indexOf('\nEOF\n') + 1)
}
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('the gateway takes the configuration the keeper writes as soon as it changes, and keeps the last good one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-'))
  const file = join(dir, 'gateway.json')
  try {
    const served = async (/** @type {(request: Request) => Promise<Response>} */ handle) => (await (await handle(new Request('https://gateway.example/'))).json()).clients
    const handle = reloading(file, { origins: ['https://jean.example'] }, 20)
    assert.deepEqual(await served(handle), {}, 'no file yet: the fallback')
    const google = { issuer: 'https://accounts.google.com', tokenEndpoint: 'https://oauth2.googleapis.com/token', clientId: 'id', clientSecret: 'secret' }
    await writeFile(file, JSON.stringify({ origins: ['https://jean.example'], clients: [google] }))
    await sleep(200)
    assert.deepEqual(await served(handle), { 'https://accounts.google.com': 'id' })
    await writeFile(file, '{ not json')
    await sleep(200)
    assert.deepEqual(await served(handle), { 'https://accounts.google.com': 'id' }, 'a file it can’t read leaves the last good configuration')
  } finally {
    unwatchFile(file)
    await rm(dir, { recursive: true, force: true })
  }
})

test('install.sh and the update script it writes are sound shell', () => {
  execFileSync('sh', ['-n', INSTALL])
  execFileSync('sh', ['-n'], { input: written('update') })
})

test('install.sh refuses what it isn’t given right, before touching the system', () => {
  const run = (/** @type {string[]} */ args) => spawnSync('sh', [INSTALL, ...args], { encoding: 'utf8' })
  const key = 'B' + 'A'.repeat(86)
  const image = `ghcr.io/jean-is/jean@sha256:${'0'.repeat(64)}`
  const good = ['--address', 'jean.acme.example', '--owner', key, '--jean', image, '--gateway', image]
  for (const [args, message] of /** @type {[string[], RegExp][]} */ ([
    [['--address', 'Not A Name', ...good.slice(2)], /--address needs a name/],
    [[...good, '--gateway-address', 'jean.acme.example'], /an address of its own/],
    [[...good.slice(0, 2), '--owner', 'short', ...good.slice(4)], /--owner needs/],
    [[...good.slice(0, 4), '--jean', 'ghcr.io/jean-is/jean:latest', ...good.slice(6)], /--jean needs an image by digest/],
    [[...good, '--updates', 'http://releases.example/server.env'], /--updates needs an https address/],
    [[...good, '--sideways'], /needs a value|is not an option/],
    [good.slice(0, 4), /--updates, or --jean and --gateway, must name the images/],
  ])) {
    const ran = run(args)
    assert.equal(ran.status, 2, args.join(' '))
    assert.match(ran.stderr, message)
  }
  // Given all it needs, images or an announcement, it goes no further than asking for root, unless this already is
  // root, which it would set up.
  if (process.getuid?.() !== 0) {
    assert.match(run(good).stderr, /run it as root/)
    assert.match(run([...good.slice(0, 4), '--updates', 'https://releases.example/server.env']).stderr, /run it as root/)
  }
})

test('install.sh reads an announcement as the update script does', () => {
  const update = written('update')
  const line = (/** @type {string} */ text, /** @type {string} */ name) => text.split('\n').find((one) => one.startsWith(`${name} ()`))
  assert.equal(line(install, 'image'), line(update, 'image'))
  assert.equal(line(install, 'release')?.replace(/^release/, ''), line(update, 'version')?.replace(/^version/, ''))
  assert.match(install, /ssh-keygen -Y verify -f allowed_signers -I jean\.is -n file -s "\$work\/server\.env\.sig" < "\$work\/server\.env"/)
})

test('the server’s images run as Jean’s images do, the gateway reading only its own folder and the keeper’s file', async () => {
  const [dockerfile, server] = await Promise.all([readFile('deploy/docker/Dockerfile', 'utf8'), readFile('deploy/server/compose.yaml', 'utf8')])
  const compose = written('compose.yaml')
  const cmd = JSON.parse(String(/^CMD (\[.*"gateway\/serve\.js"\])$/m.exec(dockerfile)?.[1]))
  const gateway = JSON.parse(String(/command: (\[.*"gateway\/serve\.js"\])/.exec(compose)?.[1]))
  assert.deepEqual(gateway.filter((/** @type {string} */ flag) => flag !== '--allow-fs-read=/config/'), cmd)
  const keeper = JSON.parse(String(/command: (\[.*"keeper\/serve\.js"\])/.exec(compose)?.[1]))
  assert.deepEqual(keeper.filter((/** @type {string} */ flag) => !flag.includes('/data/')).slice(0, -1), cmd.slice(0, -1))
  assert.match(dockerfile, /^COPY keeper\/ keeper\/$/m, 'the gateway’s image carries the keeper')
  const caddy = (/** @type {string} */ text) => /image: (caddy:[^\s]+@sha256:[0-9a-f]{64})/.exec(text)?.[1]
  assert.equal(caddy(compose), caddy(server), 'Caddy pinned as on Jean’s own server')
})

test('updates are trusted as Jean’s releases are: the same signer, namespace and allowed signers', async () => {
  assert.equal(written('allowed_signers'), await readFile('docs/trust/allowed_signers', 'utf8'))
  const update = written('update')
  assert.match(update, new RegExp(`ssh-keygen -Y verify -f allowed_signers -I ${SIGNER.replace('.', '\\.')} -n ${NAMESPACE} `))
  // And an announcement signed by a key the file names passes, a changed one fails.
  const dir = await mkdtemp(join(tmpdir(), 'announce-'))
  try {
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'test', '-f', join(dir, 'key')])
    await writeFile(join(dir, 'allowed_signers'), `${SIGNER} namespaces="${NAMESPACE}" ${await readFile(join(dir, 'key.pub'), 'utf8')}`)
    const announcement = `VERSION=1.2.3\nJEAN_IMAGE=ghcr.io/jean-is/jean@sha256:${'1'.repeat(64)}\nGATEWAY_IMAGE=ghcr.io/jean-is/jean-gateway@sha256:${'2'.repeat(64)}\n`
    await writeFile(join(dir, 'server.env'), announcement)
    execFileSync('ssh-keygen', ['-q', '-Y', 'sign', '-f', join(dir, 'key'), '-n', NAMESPACE, join(dir, 'server.env')])
    const verify = (/** @type {string} */ text) => spawnSync('ssh-keygen', ['-Y', 'verify', '-f', join(dir, 'allowed_signers'), '-I', SIGNER, '-n', NAMESPACE, '-s', join(dir, 'server.env.sig')], { input: text }).status
    assert.equal(verify(announcement), 0)
    assert.notEqual(verify(announcement.replace('1.2.3', '9.9.9')), 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
