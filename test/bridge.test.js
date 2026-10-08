// The bridge (D198): commands on this computer, in the folder it runs in, for Jean only.
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bridge } from '../bridge/bridge.js'
import { mcpClient } from '../caps/connections/mcp.js'

const JEAN = 'https://jean.example'
const KEY = 'k3y-for-the-test'

describe('the bridge (D198)', { skip: process.platform === 'win32' }, () => {
  /** @type {string} */
  let folder
  /** @type {Awaited<ReturnType<typeof bridge>>} */
  let work
  /** @type {import('node:http').Server} */
  let server
  let port = 0

  before(async () => {
    folder = await realpath(await mkdtemp(join(tmpdir(), 'bridge-test-')))
    await mkdir(join(folder, 'site'))
    await writeFile(join(folder, 'site', 'index.html'), '<h1>Hi</h1>')
    server = createServer((req, res) => work.handle(req, res))
    await new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(undefined)))
    port = /** @type {import('node:net').AddressInfo} */ (server.address()).port
    work = await bridge({ folder, origins: [JEAN], key: KEY, port })
  })
  after(async () => {
    server.close()
    await work.close()
    await rm(folder, { recursive: true, force: true })
  })

  test('a command runs in the folder, which is /workspace both ways, and its shell keeps its directory', async () => {
    const listed = await work.run('ls /workspace/site && pwd', { computer: 'a' })
    assert.equal(listed.exit, 0)
    assert.equal(listed.stdout, 'index.html\n/workspace\n')
    await work.run('cd site', { computer: 'a' })
    assert.equal((await work.run('pwd', { computer: 'a' })).stdout, '/workspace/site\n')
    // Another conversation's shell starts at the top.
    assert.equal((await work.run('pwd', { computer: 'b' })).stdout, '/workspace\n')
    assert.equal((await work.run(`echo ${folder}/x`)).stdout, '/workspace/x\n')
    const failed = await work.run('echo oops >&2; exit 3')
    assert.deepEqual([failed.exit, failed.stderr], [3, 'oops\n'])
  })

  test('a command that serves keeps running once it printed its address, until the bridge ends it', async () => {
    const script = "const s = require('http').createServer((q, r) => r.end('served')).listen(0, '0.0.0.0', () => console.log('ready at http://0.0.0.0:' + s.address().port + '/'))"
    const ran = await work.run(`node -e "${script}"`, { timeMs: 10_000 })
    assert.equal(ran.exit, 0)
    const address = ran.serving?.addresses[0] ?? ''
    // Listening on every address, it is reached at this computer's own.
    assert.match(address, /^http:\/\/127\.0\.0\.1:\d+\/$/)
    assert.equal(await (await fetch(address)).text(), 'served')
    const group = ran.serving?.group ?? 0
    assert.doesNotThrow(() => process.kill(group, 0))
    await work.close()
    await new Promise((r) => setTimeout(r, 300))
    assert.throws(() => process.kill(group, 0))
    work = await bridge({ folder, origins: [JEAN], key: KEY, port })
  })

  test('a command stopped by Jean ends with what it started; one out of time ends too', async () => {
    const stop = new AbortController()
    setTimeout(() => stop.abort(), 300)
    const stopped = await work.run('sleep 30 & sleep 30', { signal: stop.signal })
    assert.notEqual(stopped.exit, 0)
    assert.match(stopped.stderr, /\^C/)
    const slow = await work.run('sleep 30', { timeMs: 300 })
    assert.equal(slow.exit, 124)
  })

  test("over HTTP: only this computer's names, only Jean's origin, only with the key; Jean's own client calls it", async () => {
    const at = `http://127.0.0.1:${port}/`
    const post = (/** @type {Record<string, string>} */ headers) => fetch(at, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
    assert.equal((await post({ authorization: `Bearer ${KEY}` })).status, 200)
    assert.equal((await post({})).status, 401)
    assert.equal((await post({ authorization: 'Bearer nope' })).status, 401)
    assert.equal((await post({ authorization: `Bearer ${KEY}`, origin: 'https://elsewhere.example' })).status, 403)
    // A name that leads here from elsewhere (DNS rebinding) is refused; fetch can't set Host, node:http can.
    const rebound = await new Promise((done) => request(at, { method: 'POST', headers: { host: `rebound.example:${port}`, authorization: `Bearer ${KEY}` } }, (res) => done(res.statusCode)).end('{}'))
    assert.equal(rebound, 403)
    const preflight = await fetch(at, { method: 'OPTIONS', headers: { origin: JEAN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type,mcp-method', 'access-control-request-private-network': 'true' } })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), JEAN)
    assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true')
    assert.equal(preflight.headers.get('access-control-allow-headers'), 'authorization,content-type,mcp-method')

    const client = mcpClient({ url: at, client: { name: 'Jean', version: 'test' }, authorization: async () => `Bearer ${KEY}` })
    assert.deepEqual((await client.listTools()).map((tool) => tool.name), ['bash', 'about'])
    const about = await client.callTool({ name: 'about' }, {})
    assert.equal(about.structuredContent.path, folder)
    const ran = await client.callTool({ name: 'bash' }, { command: 'cat /workspace/site/index.html' })
    assert.equal(ran.structuredContent.stdout, '<h1>Hi</h1>')
  })
})
