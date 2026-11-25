// SPDX-License-Identifier: MIT
// This computer's line (caps/machine/line.js, D198, D677, D766), run as a terminal runs it: the bridge only with the hash the
// page knows, then with sh, its own head running it on the computer's own Node, or, where it has none of 20 or later, on
// Node's build for that system, fetched once into Jean's folder and unpacked only with the hash the head pins for it. Here
// the bridge is its real head, pinning a Node that only passes the real one on, served from this computer, over a stand-in
// that says what it ran on.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { line, started, word } from '../app/caps/machine/line.js'
import { pin, runtimeOf } from '../scripts/lts.js'

const REAL = await readFile(new URL('../app/bridge/bridge.js', import.meta.url), 'utf8')
/** The bridge's shell head, up to the line that closes JavaScript's comment. */
const HEAD = REAL.slice(0, REAL.indexOf('\n*/\n') + 4)
const BODY = "console.log(`ran on ${process.env.PLAYED ?? 'its own'} Node with ${process.argv.slice(2).filter((arg) => !arg.startsWith('--node=')).join(' ')}, the key ${process.env.JEAN_BRIDGE_KEY ? 'in its environment' : 'missing'}`)\n"
const VERSION = '0.0.1-test'
const sha256 = (/** @type {string | Buffer} */ bytes) => createHash('sha256').update(bytes).digest('hex')

describe('This computer’s line', { skip: process.platform === 'win32' && 'The bridge needs bash' }, () => {
  /** @type {string} */
  let dir
  /** @type {import('node:http').Server} */
  let server
  /** @type {string} */
  let at
  /** @type {string} the archive's hash */
  let sum
  /** Each bridge served, by its path. @type {Record<string, string>} */
  const bridges = {}

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jean-line-'))
    // Node's build, played: bin/node passes the real one on, saying it was the one fetched.
    const build = join(dir, 'build', `node-v${VERSION}`)
    await mkdir(join(build, 'bin'), { recursive: true })
    await writeFile(join(build, 'bin', 'node'), `#!/bin/sh\nPLAYED=Jean\\'s exec '${process.execPath}' "$@"\n`)
    await chmod(join(build, 'bin', 'node'), 0o755)
    execFileSync('tar', ['-czf', join(dir, 'node.tar.gz'), '-C', join(dir, 'build'), `node-v${VERSION}`])
    const archive = await readFile(join(dir, 'node.tar.gz'))
    sum = sha256(archive)
    // A Node too old for the bridge, first on PATH.
    await mkdir(join(dir, 'old'))
    await writeFile(join(dir, 'old', 'node'), '#!/bin/sh\nexit 1\n')
    await chmod(join(dir, 'old', 'node'), 0o755)
    server = createServer((req, res) => {
      const body = bridges[req.url ?? ''] ?? (req.url?.startsWith(`/dist/v${VERSION}/node-v${VERSION}-`) ? archive : null)
      res.writeHead(body === null ? 404 : 200).end(body ?? '')
    })
    await new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(undefined)))
    at = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
  })
  after(async () => {
    server.close()
    await rm(dir, { recursive: true, force: true })
  })

  /** A bridge whose head pins Node's archive with this hash for every system, served, and what its line needs. @param {string} archive */
  const bridgeWith = (archive) => {
    const text = pin(HEAD, { version: VERSION, sha256: Object.fromEntries(Object.keys(runtimeOf(HEAD).sha256).map((platform) => [platform, archive])) }) + BODY
    const path = `/bridge-${sha256(text).slice(0, 8)}.js`
    bridges[path] = text
    return { bridge: `${at}${path}`, hash: sha256(text), url: `${at}/dist/v{version}/node-v{version}-{platform}.tar.gz`, origin: 'https://jean.example' }
  }
  /**
   * Runs a command in bash, without holding up the server here, which it may fetch from.
   * @param {string} text @param {Record<string, string>} env @returns {Promise<{ status: number, stdout: string, stderr: string }>}
   */
  const bash = (text, env) => new Promise((done) => execFile('bash', ['-c', text], { encoding: 'utf8', timeout: 30_000, env }, (error, stdout, stderr) => done({ status: Number(error?.code ?? 0), stdout, stderr })))
  /** A line, run in a home of its own, which is its temporary folder too, with PATH as given. @param {string} text @param {string} home @param {string} path */
  const run = (text, home, path) => bash(text, { HOME: home, TMPDIR: home, PATH: path })
  const own = `${join(process.execPath, '..')}:/usr/bin:/bin`
  const old = () => `${join(dir, 'old')}:/usr/bin:/bin`

  it('runs the bridge on the computer’s own Node, the key in its environment, fetching nothing and leaving nothing', async () => {
    const home = await mkdtemp(join(dir, 'home-'))
    const ran = await run(line({ ...bridgeWith(sum), port: 23456, key: 'k3y' }), home, own)
    assert.equal(ran.stdout, 'ran on its own Node with --port 23456 --origin https://jean.example, the key in its environment\n', ran.stderr)
    assert.equal(ran.stderr, '')
    assert.deepEqual(await readdir(home), [], 'nor its copy of the bridge, nor Jean’s folder')
  })

  it('with no Node of 20 or later, fetches Node’s build once, into Jean’s folder, and runs the bridge on it', async () => {
    const home = await mkdtemp(join(dir, 'home-'))
    const text = line({ ...bridgeWith(sum), port: 23456, key: 'k3y' })
    const first = await run(text, home, old())
    assert.equal(first.stdout, "ran on Jean's Node with --port 23456 --origin https://jean.example, the key in its environment\n", first.stderr)
    assert.equal(first.stderr, `Fetching Node.js ${VERSION} for Jean, once.\n`)
    assert.ok(existsSync(join(home, '.config', 'jean', `node-v${VERSION}`, 'bin', 'node')))
    const again = await run(text, home, old())
    assert.equal(again.stderr, '')
    assert.match(again.stdout, /^ran on Jean's Node/)
  })

  it('keeps nothing and runs nothing when Node’s archive hasn’t the hash pinned for it, and says so', async () => {
    const home = await mkdtemp(join(dir, 'home-'))
    const ran = await run(line({ ...bridgeWith('0'.repeat(64)), port: 23456, key: 'k3y' }), home, old())
    assert.equal(ran.status, 1)
    assert.equal(ran.stdout, '')
    assert.match(ran.stderr, /Jean's bridge runs on Node\.js 20 or later, which couldn't be fetched here/)
    assert.equal(existsSync(join(home, '.config', 'jean', `node-v${VERSION}`)), false)
  })

  it('runs no bridge but the one whose hash the page knows, and keeps nothing of it', async () => {
    const home = await mkdtemp(join(dir, 'home-'))
    const ran = await run(line({ ...bridgeWith(sum), hash: 'f'.repeat(64), port: 23456, key: 'k3y' }), home, own)
    assert.equal(ran.status, 1)
    assert.equal(ran.stdout, '')
    assert.match(ran.stderr, /This isn't the bridge this page expects, so nothing ran/)
    assert.deepEqual(await readdir(home), [])
  })

  it('in the desktop app, runs the bridge it fetches through the login shell, in the folder given, attached', async () => {
    const home = await mkdtemp(join(dir, 'home-'))
    const command = started({ ...bridgeWith(sum), port: 23456, folder: join(home, "Bob's") })
    const ran = await bash(command, { HOME: home, TMPDIR: home, PATH: own, SHELL: '/bin/sh', JEAN_BRIDGE_KEY: 'k3y' })
    assert.equal(ran.stdout, `ran on its own Node with --port 23456 --origin https://jean.example --folder ${home}/Bob's --attached, the key in its environment\n`, ran.stderr)
  })

  it('quotes any text as one word for the shell', () => {
    assert.equal(execFileSync('bash', ['-c', `printf %s ${word("it's \"$HOME\" `here`")}`], { encoding: 'utf8' }), "it's \"$HOME\" `here`")
  })
})
