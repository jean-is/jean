// The bridge (D198): commands on this computer, in the folder it runs in, for Jean only.
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { generateKeyPairSync, createHash, sign } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath, stat } from 'node:fs/promises'
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
    assert.deepEqual((await client.listTools()).map((tool) => tool.name), ['bash', 'about', 'chatgpt'])
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
  // Claude Code's own folder, which holds its settings: this test's, not the user's.
  const config = process.env.CLAUDE_CONFIG_DIR

  before(async () => {
    llm = await import('../app/core/llm.js')
    folder = await realpath(await mkdtemp(join(tmpdir(), 'bridge-claude-')))
    process.env.CLAUDE_CONFIG_DIR = folder
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
    if (config === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = config
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
    assert.deepEqual([about.version, about.claude], ['3', true])
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
    messages.push(asked.done.message, { role: 'tool', toolCallId: asked.calls[0].id, name: 'weather', content: 'Sunny, 21°C' })
    assert.equal((await step(messages, [weather])).text, 'In Lyon: Sunny, 21°C')
  })

  test('what the user sent while a call ran (D365) is their next message, which Claude Code reads within its turn, apart from the result', async () => {
    const weather = { name: 'weather', description: 'The weather in a city', parameters: { type: 'object', properties: { city: { type: 'string' } } } }
    /** @type {any[]} */
    const messages = [{ role: 'user', content: 'The weather in Lyon?' }]
    const asked = await step(messages, [weather])
    messages.push(asked.done.message, { role: 'tool', toolCallId: asked.calls[0].id, name: 'weather', content: 'Sunny, 21°C' }, { role: 'user', content: 'In Celsius' })
    assert.equal((await step(messages, [weather])).text, 'In Lyon: Sunny, 21°C, then heard: In Celsius')
  })

  test('a plan’s limit is the brain’s limit', async () => {
    await assert.rejects(step([{ role: 'user', content: 'over the limit' }]), { code: 'rate_limit', message: /hit your limit/ })
  })

  test('beyond eight conversations, the least recently used idle one ends: the one used last and one in a step keep theirs', async () => {
    /** @type {any[]} */
    const first = [{ role: 'user', content: 'first' }]
    first.push((await step(first)).done.message, { role: 'user', content: 'first, again' })
    // A step under way until the file it made is gone.
    const held = join(folder, 'held')
    const holding = step([{ role: 'user', content: `hold ${held}` }])
    while (!existsSync(held)) await new Promise((wait) => setTimeout(wait, 10))
    /** @type {any[][]} */
    const others = []
    for (let i = 0; i < 8; i++) {
      if (i === 6) first.push((await step(first)).done.message, { role: 'user', content: 'and on' })
      others.push([{ role: 'user', content: `other ${i}` }])
      others[i].push((await step(others[i])).done.message, { role: 'user', content: 'again' })
    }
    assert.equal((await step(first)).text, 'Heard (opus, You are Jean): and on')
    await rm(held)
    assert.equal((await holding).text, 'Held')
    assert.match((await step(others[0])).text, /^Heard \(opus, You are Jean\): <earlier-conversation>/)
  })

  test('a gateway in Claude Code’s settings is reached, through their environment and key helpers, the rest left out', async () => {
    const settings = { env: { ANTHROPIC_BASE_URL: 'https://gateway.example', ANTHROPIC_AUTH_TOKEN: 't0ken' }, apiKeyHelper: '~/bin/key', hooks: { Stop: [] }, model: 'haiku' }
    await writeFile(join(folder, 'settings.json'), JSON.stringify(settings))
    // The bridge's own environment wins, as it does in Claude Code: the one these tests run in has none.
    const own = { ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN }
    delete process.env.ANTHROPIC_BASE_URL
    delete process.env.ANTHROPIC_AUTH_TOKEN
    try {
      assert.equal((await step([{ role: 'user', content: 'Which gateway?' }])).text, 'https://gateway.example {"apiKeyHelper":"~/bin/key"}')
      // Claude Code says it isn't signed in when a gateway's token is all it has, which it sends as it is.
      process.env.CLAUDE_SIGNED_OUT = '1'
      const client = mcpClient({ url: brain.baseURL.replace('/v1', '/'), client: { name: 'Jean', version: 'test' }, authorization: async () => `Bearer ${KEY}` })
      assert.equal((await client.callTool({ name: 'about' }, { claude: true })).structuredContent.claude, true)
    } finally {
      delete process.env.CLAUDE_SIGNED_OUT
      for (const [name, value] of Object.entries(own)) if (value !== undefined) process.env[name] = value
      await rm(join(folder, 'settings.json'))
    }
  })
})

// Copilot (D262): the user's own Copilot CLI, with their Copilot plan, answers Jean's Anthropic requests here, over ACP.
describe('Copilot through the bridge (D262)', { skip: process.platform === 'win32' }, () => {
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
  const copilot = [process.execPath, new URL('./fixtures/copilot.js', import.meta.url).pathname]

  before(async () => {
    llm = await import('../app/core/llm.js')
    folder = await realpath(await mkdtemp(join(tmpdir(), 'bridge-copilot-')))
    server = createServer((req, res) => work.handle(req, res))
    await new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(undefined)))
    const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port
    work = await bridge({ folder, origins: [JEAN], key: KEY, port, copilot })
    brain = { id: 'b', provider: 'copilot', api: 'anthropic', baseURL: `http://127.0.0.1:${port}/copilot/v1`, model: 'gpt-5-mini' }
  })
  after(async () => {
    server.close()
    await work.close()
    await rm(folder, { recursive: true, force: true })
  })

  /** One step, as Jean's loop reads it. @param {any[]} messages @param {any[]} [tools] */
  async function step(messages, tools = []) {
    let [text, thinking] = ['', '']
    /** @type {any} */
    let done
    /** @type {any[]} */
    const calls = []
    for await (const event of llm.streamChat({ brain, apiKey: KEY, system: 'You are Jean, briefly.', messages, tools })) {
      if (event.type === 'text') text += event.delta
      if (event.type === 'thinking') thinking += event.delta
      if (event.type === 'tool_call') calls.push(event.call)
      if (event.type === 'done') done = event
    }
    return { text, thinking, calls, done }
  }

  test('it says whether Copilot is here and signed in, and lists its models but its own Auto', async () => {
    const client = mcpClient({ url: brain.baseURL.replace('/copilot/v1', '/'), client: { name: 'Jean', version: 'test' }, authorization: async () => `Bearer ${KEY}` })
    process.env.COPILOT_SIGNED_OUT = '1'
    try {
      assert.equal((await client.callTool({ name: 'about' }, { copilot: true })).structuredContent.copilot, false)
      await assert.rejects(llm.listModels({ brain, apiKey: KEY }), { code: 'auth' })
    } finally {
      delete process.env.COPILOT_SIGNED_OUT
    }
    assert.equal((await client.callTool({ name: 'about' }, { copilot: true })).structuredContent.copilot, true)
    assert.deepEqual((await llm.listModels({ brain, apiKey: KEY })).map((model) => model.id), ['gpt-5-mini', 'claude-sonnet-5.5'])
    // Not on this computer at all.
    /** @type {Awaited<ReturnType<typeof bridge>>} */
    let elsewhere
    const there = createServer((req, res) => elsewhere.handle(req, res))
    await new Promise((ready) => there.listen(0, '127.0.0.1', () => ready(undefined)))
    const port = /** @type {import('node:net').AddressInfo} */ (there.address()).port
    elsewhere = await bridge({ folder, origins: [JEAN], key: KEY, port, copilot: [join(folder, 'no-copilot')] })
    const asked = mcpClient({ url: `http://127.0.0.1:${port}/`, client: { name: 'Jean', version: 'test' }, authorization: async () => `Bearer ${KEY}` })
    assert.equal((await asked.callTool({ name: 'about' }, { copilot: true })).structuredContent.copilot, null)
    there.close()
    await elsewhere.close()
  })

  test('a conversation goes on in one Copilot, with Jean’s prompt and only Jean’s tools; another history is told to a new one', async () => {
    const weather = { name: 'weather', description: 'The weather in a city', parameters: { type: 'object', properties: { city: { type: 'string' } } } }
    /** @type {any[]} */
    const messages = [{ role: 'user', content: 'hello' }]
    const first = await step(messages, [weather])
    // Copilot's notice of the tools it left out is not an answer.
    assert.equal(first.text, 'Heard (gpt-5-mini, You are Jean, jean-weather): hello')
    assert.deepEqual([first.done.stopReason, first.done.usage], ['end', { inputTokens: 10, outputTokens: 5 }])
    messages.push(first.done.message, { role: 'user', content: '/usage, said again' })
    // Only the new message reaches it, never as one of Copilot's commands.
    assert.equal((await step(messages, [weather])).text, 'Heard (gpt-5-mini, You are Jean, jean-weather): ​/usage, said again')
    const other = await step([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello!' }, { role: 'user', content: 'what now?' }])
    assert.equal(other.text, 'Heard (gpt-5-mini, You are Jean, jean-): <earlier-conversation>\nUser: hi\n\nAssistant: Hello!\n</earlier-conversation>\nwhat now?')
  })

  test('Copilot calls Jean’s tools: the step ends with the call it announced, and the next request brings its result', async () => {
    const weather = { name: 'weather', description: 'The weather in a city', parameters: { type: 'object', properties: { city: { type: 'string' } } } }
    /** @type {any[]} */
    const messages = [{ role: 'user', content: 'The weather in Lyon?' }]
    const asked = await step(messages, [weather])
    assert.deepEqual(asked.calls, [{ id: asked.calls[0]?.id, name: 'weather', args: { city: 'Lyon' } }])
    assert.match(asked.calls[0].id, /^call_/)
    assert.deepEqual([asked.thinking, asked.done.stopReason], ['Lyon, then.', 'tool_use'])
    messages.push(asked.done.message, { role: 'tool', toolCallId: asked.calls[0].id, name: 'weather', content: 'Sunny, 21°C' })
    const answered = await step(messages, [weather])
    assert.equal(answered.text, 'In Lyon: Sunny, 21°C')
    assert.deepEqual(answered.done.usage, { inputTokens: 30, outputTokens: 5, cacheReadTokens: 10 })
  })

  test('what the user sent while a call ran (D365) is their next message: once the call has its result, Copilot ends that turn and answers it', async () => {
    const weather = { name: 'weather', description: 'The weather in a city', parameters: { type: 'object', properties: { city: { type: 'string' } } } }
    /** @type {any[]} */
    const messages = [{ role: 'user', content: 'The weather in Lyon?' }]
    const asked = await step(messages, [weather])
    messages.push(asked.done.message, { role: 'tool', toolCallId: asked.calls[0].id, name: 'weather', content: 'The user declined this action.', isError: true },
      { role: 'user', content: 'Actually, leave out Training' })
    const answered = await step(messages, [weather])
    // The result reached the call alone; what the turn it ended said is gone.
    assert.equal(answered.text, 'Heard (gpt-5-mini, You are Jean, jean-weather), after The user declined this action. (an error): Actually, leave out Training')
    assert.equal(answered.done.stopReason, 'end')
  })

  test('a plan’s limit is the brain’s limit', async () => {
    await assert.rejects(step([{ role: 'user', content: 'over the limit' }]), { code: 'rate_limit', message: /premium request quota/ })
  })

  test('beyond eight conversations, one whose call waits for Jean’s result keeps its Copilot', async () => {
    const weather = { name: 'weather', description: 'The weather in a city', parameters: { type: 'object', properties: { city: { type: 'string' } } } }
    /** @type {any[]} */
    const messages = [{ role: 'user', content: 'The weather in Lyon?' }]
    const asked = await step(messages, [weather])
    for (let i = 0; i < 8; i++) await step([{ role: 'user', content: `other ${i}` }])
    messages.push(asked.done.message, { role: 'tool', toolCallId: asked.calls[0].id, name: 'weather', content: 'Sunny, 21°C' })
    assert.equal((await step(messages, [weather])).text, 'In Lyon: Sunny, 21°C')
  })
})

// ChatGPT (D262): Jean signs in to ChatGPT as itself through the bridge, which keeps the tokens and turns
// Jean's Chat Completions into the Responses a plan answers; here against a stand-in for OpenAI.
describe('a ChatGPT plan through the bridge (D262)', { skip: process.platform === 'win32' }, () => {
  /** @type {typeof import('../app/core/llm.js')} */
  let llm
  /** @type {Awaited<ReturnType<typeof bridge>>} */
  let work
  /** @type {import('node:http').Server} */
  let server
  /** @type {import('node:http').Server} */
  let openai
  /** @type {import('../app/core/types.js').BrainConfig} */
  let brain
  /** @type {string} */
  let home
  let issuer = ''
  /** What the stand-in was asked. @type {{ authorize: URLSearchParams[], tokens: URLSearchParams[], revoked: URLSearchParams[], responses: { auth: string, body: any }[] }} */
  const seen = { authorize: [], tokens: [], revoked: [], responses: [] }
  let deny = false
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
  /** @param {object} claims */
  const idToken = (claims) => {
    const encode = (/** @type {object} */ part) => Buffer.from(JSON.stringify(part)).toString('base64url')
    const signed = `${encode({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${encode(claims)}`
    return `${signed}.${sign('RSA-SHA256', Buffer.from(signed), keys.privateKey).toString('base64url')}`
  }
  /** Where the browser goes, followed as it would, to the address that isn't a redirect. @param {string} url */
  const follow = async (url) => {
    for (let at = url; ;) {
      const res = await fetch(at, { redirect: 'manual' })
      if (res.status !== 302) return { status: res.status, at }
      at = new URL(String(res.headers.get('location')), at).href
      if (at.startsWith(JEAN)) return { status: 302, at }
    }
  }

  before(async () => {
    llm = await import('../app/core/llm.js')
    home = await mkdtemp(join(tmpdir(), 'bridge-chatgpt-'))
    openai = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', issuer)
      let body = ''
      for await (const chunk of req) body += chunk
      const json = (/** @type {object} */ data, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data))
      if (url.pathname === '/.well-known/openid-configuration') return json({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, revocation_endpoint: `${issuer}/revoke` })
      if (url.pathname === '/jwks') return json({ keys: [jwk] })
      if (url.pathname === '/authorize') {
        const query = url.searchParams
        seen.authorize.push(query)
        const back = new URL(String(query.get('redirect_uri')))
        back.search = new URLSearchParams(deny ? { error: 'access_denied', state: String(query.get('state')) }
          : { code: 'c1', state: String(query.get('state')), scope: String(query.get('scope')), ...(query.get('client_id') === 'dynamic_agent_client' && { client_id: 'oaiapp_1' }) }).toString()
        return res.writeHead(302, { location: back.href }).end()
      }
      if (url.pathname === '/token') {
        const form = new URLSearchParams(body)
        seen.tokens.push(form)
        if (form.get('grant_type') === 'refresh_token') return json({ access_token: 'a2', refresh_token: 'r2', expires_in: 3600, scope: 'chatgpt.tokens.use.direct openid' })
        const asked = /** @type {URLSearchParams} */ (seen.authorize.at(-1))
        if (createHash('sha256').update(String(form.get('code_verifier'))).digest('base64url') !== asked.get('code_challenge')) return json({ error: 'invalid_grant' }, 400)
        return json({
          access_token: 'a1', refresh_token: 'r1', expires_in: 3600, token_type: 'Bearer', scope: String(asked.get('scope')),
          id_token: idToken({ iss: issuer, aud: form.get('client_id'), sub: 'user-1', email: 'user@example.com', nonce: asked.get('nonce'), exp: Math.floor(Date.now() / 1000) + 3600 }),
        })
      }
      if (url.pathname === '/revoke') {
        seen.revoked.push(new URLSearchParams(body))
        return res.writeHead(200).end()
      }
      if (url.pathname === '/v1/models') return json({ models: [{ slug: 'gpt-6-sol', display_name: 'GPT-6 Sol', visibility: 'list' }, { slug: 'gpt-old', display_name: 'Old', visibility: 'hide' }] })
      if (url.pathname === '/v1/responses') {
        const asked = JSON.parse(body)
        seen.responses.push({ auth: String(req.headers.authorization), body: asked })
        const said = JSON.stringify(asked.input)
        const events = /limit/.test(said) ? [{ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'Usage limit reached' } } }]
          : /weather/.test(said) && !/function_call_output/.test(said) ? [
            { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: 'call_1', namespace: 'jean', name: 'weather', arguments: '' } },
            { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"city":' },
            { type: 'response.function_call_arguments.delta', output_index: 0, delta: '"Lyon"}' },
            { type: 'response.completed', response: { usage: { input_tokens: 20, output_tokens: 4, input_tokens_details: { cached_tokens: 0 } } } },
          ] : [
            { type: 'response.reasoning_summary_text.delta', delta: 'Easy.' },
            { type: 'response.output_text.delta', delta: 'Hi from ' },
            { type: 'response.output_text.delta', delta: 'ChatGPT' },
            { type: 'response.completed', response: { usage: { input_tokens: 12, output_tokens: 3, input_tokens_details: { cached_tokens: 8 } } } },
          ]
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        for (const event of events) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        return res.end()
      }
      res.writeHead(404).end()
    })
    await new Promise((ready) => openai.listen(0, '127.0.0.1', () => ready(undefined)))
    issuer = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (openai.address()).port}`
    server = createServer((req, res) => work.handle(req, res))
    await new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(undefined)))
    const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port
    work = await bridge({ folder: home, origins: [JEAN], key: KEY, port, home })
    brain = { id: 'b', provider: 'chatgpt', api: 'openai', baseURL: `http://127.0.0.1:${port}/chatgpt/v1`, model: 'gpt-6-sol' }
  })
  after(async () => {
    server.close()
    openai.close()
    await work.close()
    await rm(home, { recursive: true, force: true })
  })

  const client = () => mcpClient({ url: brain.baseURL.replace('/chatgpt/v1', '/'), client: { name: 'Jean', version: 'test' }, authorization: async () => `Bearer ${KEY}` })
  const signIn = async () => String((await client().callTool({ name: 'chatgpt' }, { name: 'Jean', issuer, api: `${issuer}/v1`, back: `${JEAN}/` })).structuredContent.url)
  const planned = async () => (await client().callTool({ name: 'about' }, { chatgpt: true })).structuredContent.chatgpt

  test('Jean registers as itself the first time; the tokens stay on this computer, for the user’s eyes only; back to Jean only', async () => {
    assert.equal(await planned(), false)
    assert.deepEqual(await follow(await signIn()), { status: 302, at: `${JEAN}/?chatgpt=signed-in` })
    const asked = /** @type {URLSearchParams} */ (seen.authorize[0])
    assert.deepEqual([asked.get('client_id'), asked.get('agent_name_hint'), asked.get('resource'), asked.get('code_challenge_method')], ['dynamic_agent_client', 'Jean', `${issuer}/v1`, 'S256'])
    assert.match(String(asked.get('ext_agent_host_id')), /^urn:uuid:[\da-f-]{36}$/)
    assert.match(String(asked.get('scope')), /\bchatgpt\.tokens\.use\.direct\b/)
    assert.match(String(asked.get('redirect_uri')), /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/)
    assert.equal(await planned(), true)
    const kept = JSON.parse(await readFile(join(home, 'chatgpt.json'), 'utf8'))
    assert.deepEqual([kept.client, kept.sub, kept.email, kept.accessToken, kept.refreshToken], ['oaiapp_1', 'user-1', 'user@example.com', 'a1', 'r1'])
    assert.equal((await stat(join(home, 'chatgpt.json'))).mode & 0o777, 0o600)
    // A sign-in that would come back elsewhere isn't started; a callback with no sign-in under way goes nowhere.
    const elsewhere = await client().callTool({ name: 'chatgpt' }, { name: 'Jean', issuer, api: `${issuer}/v1`, back: 'https://elsewhere.example/' })
    assert.equal(elsewhere.isError, true)
    assert.equal((await fetch(`${brain.baseURL.replace('/chatgpt/v1', '/auth/callback')}?code=x&state=forged`, { redirect: 'manual' })).status, 400)
  })

  test('its models are the account’s; Jean’s Chat Completions become Responses, stored nowhere, Jean’s tools in a namespace', async () => {
    assert.deepEqual(await llm.listModels({ brain, apiKey: KEY }), [{ id: 'gpt-6-sol', name: 'GPT-6 Sol', contextLength: undefined, pricing: undefined, input: undefined, output: undefined }])
    const weather = { name: 'weather', description: 'The weather in a city', parameters: { type: 'object', properties: { city: { type: 'string' } } } }
    /** @param {any[]} messages */
    const step = async (messages) => {
      let [text, thinking] = ['', '']
      /** @type {any} */
      let done
      for await (const event of llm.streamChat({ brain, apiKey: KEY, system: 'You are Jean.', messages, tools: [weather], maxTokens: 100 })) {
        if (event.type === 'text') text += event.delta
        if (event.type === 'thinking') thinking += event.delta
        if (event.type === 'done') done = event
      }
      return { text, thinking, done }
    }
    const hello = await step([{ role: 'user', content: 'hello' }])
    assert.deepEqual([hello.text, hello.thinking, hello.done.stopReason, hello.done.usage], ['Hi from ChatGPT', 'Easy.', 'end', { inputTokens: 12, outputTokens: 3, cacheReadTokens: 8 }])
    const { auth, body } = /** @type {{ auth: string, body: any }} */ (seen.responses.at(-1))
    assert.equal(auth, 'Bearer a1')
    assert.deepEqual([body.instructions, body.store, body.stream, body.max_output_tokens, body.max_tokens], ['You are Jean.', false, true, undefined, undefined])
    assert.deepEqual(body.input, [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }])
    assert.deepEqual(body.tools, [{ type: 'namespace', name: 'jean', description: 'Tools of the app the user talks to.', tools: [{ type: 'function', name: 'weather', description: weather.description, parameters: weather.parameters, strict: false }] }])
    /** @type {any[]} */
    const messages = [{ role: 'user', content: 'The weather?' }]
    const asked = await step(messages)
    assert.deepEqual([asked.done.stopReason, asked.done.message.toolCalls], ['tool_use', [{ id: 'call_1', name: 'weather', args: { city: 'Lyon' } }]])
    messages.push(asked.done.message, { role: 'tool', toolCallId: 'call_1', name: 'weather', content: 'Sunny' })
    assert.equal((await step(messages)).text, 'Hi from ChatGPT')
    assert.deepEqual(/** @type {any} */ (seen.responses.at(-1)).body.input.slice(1), [
      { type: 'function_call', call_id: 'call_1', namespace: 'jean', name: 'weather', arguments: '{"city":"Lyon"}' },
      { type: 'function_call_output', call_id: 'call_1', output: 'Sunny' },
    ])
    await assert.rejects(step([{ role: 'user', content: 'over the limit' }]), { code: 'rate_limit', message: /Usage limit reached/ })
  })

  test('its tokens are renewed shortly before they end; signing out revokes them and keeps the registration', async () => {
    const file = join(home, 'chatgpt.json')
    await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), expiresAt: Date.now() + 1000 }))
    for await (const event of llm.streamChat({ brain, apiKey: KEY, system: 'You are Jean.', messages: [{ role: 'user', content: 'hello' }] })) void event
    assert.deepEqual([seen.tokens.at(-1)?.get('grant_type'), seen.tokens.at(-1)?.get('client_id'), seen.tokens.at(-1)?.get('refresh_token')], ['refresh_token', 'oaiapp_1', 'r1'])
    assert.equal(/** @type {any} */ (seen.responses.at(-1)).auth, 'Bearer a2')
    await client().callTool({ name: 'chatgpt' }, { out: true })
    assert.deepEqual([seen.revoked[0]?.get('token'), seen.revoked[0]?.get('client_id')], ['r2', 'oaiapp_1'])
    assert.equal(await planned(), false)
    await assert.rejects(llm.listModels({ brain, apiKey: KEY }), { code: 'auth' })
    // Signing in again uses the registration, and the account it was, without asking again.
    deny = true
    assert.deepEqual(await follow(await signIn()), { status: 302, at: `${JEAN}/?chatgpt=declined` })
    const again = /** @type {URLSearchParams} */ (seen.authorize.at(-1))
    assert.deepEqual([again.get('client_id'), again.get('agent_name_hint'), again.get('login_hint'), again.get('prompt')], ['oaiapp_1', null, 'user@example.com', null])
    assert.equal(again.get('ext_agent_host_id'), seen.authorize[0]?.get('ext_agent_host_id'))
  })
})
