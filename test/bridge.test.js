// The bridge (D198): commands on this computer, in the folder it runs in, for Jean only.
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bridge } from '../app/bridge/bridge.js'
import { mcpClient } from '../app/caps/connections/mcp.js'

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

// Claude Code (D235): the user's own, with their Claude plan, answers Jean's Anthropic requests here.
describe('Claude Code through the bridge (D235)', { skip: process.platform === 'win32' }, () => {
  /** @type {typeof import('../app/core/llm.js')} */
  let llm
  /** @type {Awaited<ReturnType<typeof bridge>>} */
  let work
  /** @type {import('node:http').Server} */
  let server
  /** @type {import('../app/core/types.js').BrainConfig} */
  let brain
  /** @type {string} */
  let folder

  before(async () => {
    llm = await import('../app/core/llm.js')
    folder = await realpath(await mkdtemp(join(tmpdir(), 'bridge-claude-')))
    server = createServer((req, res) => work.handle(req, res))
    await new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(undefined)))
    const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port
    work = await bridge({ folder, origins: [JEAN], key: KEY, port, claude: [process.execPath, new URL('./fixtures/claude.js', import.meta.url).pathname] })
    brain = { id: 'b', provider: 'claudecode', api: 'anthropic', baseURL: `http://127.0.0.1:${port}/v1`, model: 'opus' }
  })
  after(async () => {
    server.close()
    await work.close()
    await rm(folder, { recursive: true, force: true })
  })

  /** One step, as Jean's loop reads it. @param {any[]} messages @param {any[]} [tools] */
  async function step(messages, tools = []) {
    let text = ''
    /** @type {any} */
    let done
    /** @type {any[]} */
    const calls = []
    for await (const event of llm.streamChat({ brain, apiKey: KEY, system: 'You are Jean, briefly.', messages, tools })) {
      if (event.type === 'text') text += event.delta
      if (event.type === 'tool_call') calls.push(event.call)
      if (event.type === 'done') done = event
    }
    return { text, calls, done }
  }

  test('it lists Claude Code’s own names, and says whether Claude Code is here and signed in', async () => {
    assert.deepEqual((await llm.listModels({ brain, apiKey: KEY })).map((model) => model.id), ['haiku', 'sonnet', 'opus'])
    await assert.rejects(llm.listModels({ brain, apiKey: 'nope' }), { code: 'auth' })
    const client = mcpClient({ url: brain.baseURL.replace('/v1', '/'), client: { name: 'Jean', version: 'test' }, authorization: async () => `Bearer ${KEY}` })
    const about = (await client.callTool({ name: 'about' }, { claude: true })).structuredContent
    assert.deepEqual([about.version, about.claude], ['2', true])
    process.env.CLAUDE_SIGNED_OUT = '1'
    try {
      assert.equal((await client.callTool({ name: 'about' }, { claude: true })).structuredContent.claude, false)
    } finally {
      delete process.env.CLAUDE_SIGNED_OUT
    }
    // Warming the cache ahead is Claude Code's own matter.
    assert.equal(await llm.warmCache({ brain, apiKey: KEY, system: 'x'.repeat(4000), messages: [{ role: 'user', content: 'hi' }] }), null)
  })

  test('a conversation goes on in one Claude Code; another history is told to a new one', async () => {
    /** @type {any[]} */
    const messages = [{ role: 'user', content: 'hello' }]
    const first = await step(messages)
    assert.equal(first.text, 'Heard (opus, You are Jean): hello')
    assert.equal(first.done.stopReason, 'end')
    messages.push(first.done.message, { role: 'user', content: 'and again' })
    // Only the new message reaches it: the rest it heard already.
    assert.equal((await step(messages)).text, 'Heard (opus, You are Jean): and again')
    // Gone back to the first request (D188), or another brain's turns: told in one.
    const other = await step([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello!' }, { role: 'system', content: 'A note' }, { role: 'user', content: 'what now?' }])
    assert.equal(other.text, 'Heard (opus, You are Jean): <earlier-conversation>\nUser: hi\n\nAssistant: Hello!\n</earlier-conversation>\n<system-note>\nA note\n</system-note>\nwhat now?')
  })

  test('Claude Code calls Jean’s tools: the step ends with the call, and the next request brings its result', async () => {
    const weather = { name: 'weather', description: 'The weather in a city', parameters: { type: 'object', properties: { city: { type: 'string' } } } }
    /** @type {any[]} */
    const messages = [{ role: 'user', content: 'The weather in Lyon?' }]
    const asked = await step(messages, [weather])
    assert.deepEqual(asked.calls, [{ id: asked.calls[0]?.id, name: 'weather', args: { city: 'Lyon' } }])
    assert.equal(asked.done.stopReason, 'tool_use')
    // What the user said meanwhile comes with it.
    messages.push(asked.done.message, { role: 'tool', toolCallId: asked.calls[0].id, name: 'weather', content: 'Sunny, 21°C' }, { role: 'user', content: 'In Celsius' })
    const answered = await step(messages, [weather])
    assert.equal(answered.text, 'In Lyon: Sunny, 21°C / In Celsius')
  })

  test('a plan’s limit is the brain’s limit', async () => {
    await assert.rejects(step([{ role: 'user', content: 'over the limit' }]), { code: 'rate_limit', message: /hit your limit/ })
  })
})
