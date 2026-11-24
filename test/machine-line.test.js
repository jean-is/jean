// SPDX-License-Identifier: MIT
// This computer's line (caps/machine/line.js, D198, D677), run as a terminal runs it: the bridge only with the hash the page
// knows, on the computer's own Node, or, where it has none of 20 or later, Node's build for that system, fetched once into
// Jean's folder and unpacked only with the hash Jean pins for it. Here a stand-in bridge says what it ran on, and a Node
// that only passes the real one on plays Node's build, served from this computer.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SYSTEMS, line, started, word } from '../app/caps/machine/line.js'

const BRIDGE = "console.log(`ran on ${process.env.PLAYED ?? 'its own'} Node with ${process.argv.slice(1).join(' ')}, the key ${process.env.JEAN_BRIDGE_KEY ? 'in its environment' : 'missing'}`)\n"
const VERSION = '0.0.1-test'

describe('This computer’s line', { skip: process.platform === 'win32' && 'The bridge needs bash' }, () => {
  /** @type {string} */
  let dir
  /** @type {import('node:http').Server} */
  let server
  /** @type {string} */
  let at
  /** @type {string} the archive's hash */
  let sum
  /** @type {Record<string, string>} */
  const served = {}

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jean-line-'))
    // Node's build, played: bin/node passes the real one on, saying it was the one fetched.
    const build = join(dir, 'build', `node-v${VERSION}`)
    await mkdir(join(build, 'bin'), { recursive: true })
    await writeFile(join(build, 'bin', 'node'), `#!/bin/sh\nPLAYED=Jean\\'s exec '${process.execPath}' "$@"\n`)
    await chmod(join(build, 'bin', 'node'), 0o755)
    execFileSync('tar', ['-czf', join(dir, 'node.tar.gz'), '-C', join(dir, 'build'), `node-v${VERSION}`])
    const archive = await readFile(join(dir, 'node.tar.gz'))
    sum = createHash('sha256').update(archive).digest('hex')
    // A Node too old for the bridge, first on PATH.
    await mkdir(join(dir, 'old'))
    await writeFile(join(dir, 'old', 'node'), '#!/bin/sh\nexit 1\n')
    await chmod(join(dir, 'old', 'node'), 0o755)
    server = createServer((req, res) => {
      const body = req.url === '/bridge.js' ? BRIDGE : served[req.url ?? ''] ? archive : null
      res.writeHead(body === null ? 404 : 200).end(body ?? '')
    })
    await new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(undefined)))
    at = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
    for (const platform of Object.keys(SYSTEMS)) served[`/dist/v${VERSION}/node-v${VERSION}-${platform}.tar.gz`] = 'yes'
  })
  after(async () => {
    server.close()
    await rm(dir, { recursive: true, force: true })
  })

  /** The line for this test's bridge, Node's archives all of the hash given. @param {string} hash */
  const lineWith = (hash) => line({ bridge: `${at}/bridge.js`, hash: createHash('sha256').update(BRIDGE).digest('base64'), runtime: { version: VERSION, sha256: Object.fromEntries(Object.keys(SYSTEMS).map((platform) => [platform, hash])) },
    url: `${at}/dist/v{version}/node-v{version}-{platform}.tar.gz`, port: 23456, key: 'k3y', origin: 'https://jean.example' })
  /**
   * Runs a command in bash, without holding up the server here, which it may fetch from.
   * @param {string} text @param {Record<string, string>} env @returns {Promise<{ status: number, stdout: string, stderr: string }>}
   */
  const bash = (text, env) => new Promise((done) => execFile('bash', ['-c', text], { encoding: 'utf8', timeout: 30_000, env }, (error, stdout, stderr) => done({ status: Number(error?.code ?? 0), stdout, stderr })))
  /** A line, run in a home of its own, with PATH as given. @param {string} text @param {string} home @param {string} path */
  const run = (text, home, path) => bash(text, { HOME: home, PATH: path })

  it('runs the bridge on the computer’s own Node, the key in its environment, fetching nothing', async () => {
    const home = await mkdtemp(join(dir, 'home-'))
    const ran = await run(lineWith(sum), home, `${join(process.execPath, '..')}:/usr/bin:/bin`)
    assert.equal(ran.stdout, 'ran on its own Node with --port 23456 --origin https://jean.example, the key in its environment\n', ran.stderr)
    assert.equal(ran.stderr, '')
    assert.equal(existsSync(join(home, '.config', 'jean')), false)
  })

  it('with no Node of 20 or later, fetches Node’s build once, into Jean’s folder, and runs the bridge on it', async () => {
    const home = await mkdtemp(join(dir, 'home-'))
    const path = `${join(dir, 'old')}:/usr/bin:/bin`
    const first = await run(lineWith(sum), home, path)
    assert.equal(first.stdout, "ran on Jean's Node with --port 23456 --origin https://jean.example, the key in its environment\n", first.stderr)
    assert.equal(first.stderr, `Fetching Node.js ${VERSION} for Jean, once.\n`)
    assert.ok(existsSync(join(home, '.config', 'jean', `node-v${VERSION}`, 'bin', 'node')))
    const again = await run(lineWith(sum), home, path)
    assert.equal(again.stderr, '')
    assert.match(again.stdout, /^ran on Jean's Node/)
  })

  it('keeps nothing and runs nothing when Node’s archive hasn’t the hash pinned for it, and says so', async () => {
    const home = await mkdtemp(join(dir, 'home-'))
    const ran = await run(lineWith('0'.repeat(64)), home, `${join(dir, 'old')}:/usr/bin:/bin`)
    assert.equal(ran.status, 1)
    assert.equal(ran.stdout, '')
    assert.match(ran.stderr, /Jean's bridge runs on Node\.js 20 or later, which couldn't be fetched here/)
    assert.equal(existsSync(join(home, '.config', 'jean', `node-v${VERSION}`)), false)
  })

  it('runs no bridge but the one whose hash the page knows', async () => {
    const home = await mkdtemp(join(dir, 'home-'))
    const ran = await run(lineWith(sum).replace(/!=="[^"]+"/, '!=="not-this-one"'), home, `${join(process.execPath, '..')}:/usr/bin:/bin`)
    assert.equal(ran.status, 1)
    assert.equal(ran.stdout, '')
    assert.match(ran.stderr, /This isn't the bridge this page expects, so nothing ran/)
  })

  it('in the desktop app, runs the bridge it fetches through the login shell, in the folder given, attached', async () => {
    const home = await mkdtemp(join(dir, 'home-'))
    const command = started({ bridge: `${at}/bridge.js`, hash: createHash('sha256').update(BRIDGE).digest('base64'), runtime: { version: VERSION, sha256: { 'darwin-arm64': sum } },
      url: `${at}/dist/v{version}/node-v{version}-{platform}.tar.gz`, port: 23456, origin: "https://jean.example", folder: join(home, "Bob's") })
    const ran = await bash(command, { HOME: home, PATH: `${join(process.execPath, '..')}:/usr/bin:/bin`, SHELL: '/bin/sh', JEAN_BRIDGE_KEY: 'k3y' })
    assert.match(ran.stdout, new RegExp(`ran on its own Node with ${`${at}/bridge.js`.replace(/[./]/g, '\\$&')} --port 23456 --origin https://jean\\.example --folder ${home.replace(/[./]/g, '\\$&')}/Bob's --attached, the key in its environment`), ran.stderr)
  })

  it('quotes any text as one word for the shell', () => {
    assert.equal(execFileSync('bash', ['-c', `printf %s ${word("it's \"$HOME\" `here`")}`], { encoding: 'utf8' }), "it's \"$HOME\" `here`")
  })
})
