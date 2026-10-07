// 0.5 "Reach": numbered sources from tools and from the brain's own search, the brain's own
// search in both adapters, pictures for codemode, connections over MCP (both eras, and
// signing in), Wikipedia, and live conversation's turn-taking.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runTurn } from '../core/loop.js'
import { toChatMessages, userRecord } from '../core/events.js'
import { PROVIDERS, streamChat } from '../core/llm.js'
import { generateImage } from '../caps/computer/picture.js'
import { buildSystemPrompt, promptState, changeNotes } from '../core/prompt.js'

const encoder = new TextEncoder()
const sse = (/** @type {string} */ text) => new Response(new ReadableStream({
  start(controller) {
    controller.enqueue(encoder.encode(text))
    controller.close()
  },
}), { status: 200, headers: { 'content-type': 'text/event-stream' } })
const anthropicSSE = (/** @type {any[]} */ events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
const openaiSSE = (/** @type {any[]} */ chunks) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'

/** @param {(url: string, init: any) => Response | Promise<Response>} respond */
function mockFetch(respond) {
  /** @type {{ url: string, init: any, body: any }[]} */
  const calls = []
  const fetch = /** @type {typeof globalThis.fetch} */ (/** @type {unknown} */ (async (/** @type {string} */ url, /** @type {any} */ init = {}) => {
    calls.push({ url: String(url), init, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined })
    return respond(String(url), init)
  }))
  return { fetch, calls }
}

/** @param {AsyncIterable<any>} iterable */
async function collect(iterable) {
  const out = []
  for await (const item of iterable) out.push(item)
  return out
}

const anthropic = { id: 'a', provider: /** @type {const} */ ('anthropic'), api: /** @type {const} */ ('anthropic'), baseURL: PROVIDERS.anthropic.baseURL, model: 'claude-opus-5-5' }
const openrouter = { id: 'o', provider: /** @type {const} */ ('openrouter'), api: /** @type {const} */ ('openai'), baseURL: PROVIDERS.openrouter.baseURL, model: 'openrouter/auto' }
const custom = { id: 'c', provider: /** @type {const} */ ('custom'), api: /** @type {const} */ ('openai'), baseURL: 'http://127.0.0.1:9/v1', model: 'm' }
const search = { name: 'web_search', description: 'Search the web.', parameters: { type: 'object', properties: { query: { type: 'string' } } }, native: /** @type {const} */ ('web_search') }

// A turn where Anthropic searched the web itself, then wrote one cited sentence.
const searched = anthropicSSE([
  { type: 'message_start', message: { usage: { input_tokens: 10 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'srv1', name: 'web_search', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"tide times"}' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'web_search_tool_result', tool_use_id: 'srv1', content: [{ type: 'web_search_result', url: 'https://tides.example/brest', title: 'Brest tides', encrypted_content: 'enc' }] } },
  { type: 'content_block_stop', index: 1 },
  { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'High tide is at 9:12.' } },
  { type: 'content_block_delta', index: 2, delta: { type: 'citations_delta', citation: { type: 'web_search_result_location', url: 'https://tides.example/brest', title: 'Brest tides', encrypted_index: 'ix', cited_text: 'High tide 09:12' } } },
  { type: 'content_block_stop', index: 2 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 9 } },
  { type: 'message_stop' },
])

describe('the brain’s own web search', () => {
  test('Anthropic: declared as the server tool, dynamic filtering from Claude 4.6 on', async () => {
    for (const [model, type] of [['claude-opus-5-5', 'web_search_20260209'], ['claude-haiku-4-5', 'web_search_20250305']]) {
      const { fetch, calls } = mockFetch(() => sse(searched))
      await collect(streamChat({ brain: { ...anthropic, model }, messages: [{ role: 'user', content: 'Tides?' }], tools: [search], fetch }))
      assert.deepEqual(calls[0].body.tools, [{ type, name: 'web_search', max_uses: 5 }])
    }
  })

  test('Anthropic: its citations come out as sources; search blocks are kept whole for replay', async () => {
    const { fetch } = mockFetch(() => sse(searched))
    const events = await collect(streamChat({ brain: anthropic, messages: [{ role: 'user', content: 'Tides?' }], tools: [search], fetch }))
    assert.deepEqual(events.filter((e) => e.type !== 'done'), [
      { type: 'text', delta: 'High tide is at 9:12.' },
      { type: 'cite', sources: [{ title: 'Brest tides', url: 'https://tides.example/brest', quote: 'High tide 09:12' }] },
    ])
    const { message, stopReason } = events.at(-1)
    assert.equal(stopReason, 'end')
    assert.equal(message.toolCalls, undefined, 'the provider’s own tool is not Jean’s to run')
    assert.deepEqual(message.raw.map((/** @type {any} */ block) => block.type), ['server_tool_use', 'web_search_tool_result', 'text'])
    assert.deepEqual(message.raw[0], { type: 'server_tool_use', id: 'srv1', name: 'web_search', input: { query: 'tide times' } })
    assert.equal(message.raw[1].content[0].encrypted_content, 'enc')
    assert.equal(message.raw[2].citations[0].encrypted_index, 'ix')
  })

  test('Anthropic: an organisation that turned web search off gets Jean’s own search instead', async () => {
    let n = 0
    const { fetch, calls } = mockFetch(() => (n++ === 0
      ? new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: 'Web search is not enabled for this organization.' } }), { status: 400 })
      : sse(searched)))
    const events = await collect(streamChat({ brain: anthropic, messages: [{ role: 'user', content: 'Tides?' }], tools: [search], fetch }))
    assert.equal(events.at(-1).type, 'done')
    assert.equal(calls.length, 2)
    assert.deepEqual(calls[1].body.tools, [{ name: 'web_search', description: 'Search the web.', input_schema: search.parameters, eager_input_streaming: true }])
  })

  test('OpenRouter: its own search tool, and url_citation annotations as sources', async () => {
    const chunks = [
      { choices: [{ index: 0, delta: { content: 'Sunny tomorrow.' } }] },
      { choices: [{ index: 0, delta: { annotations: [{ type: 'url_citation', url_citation: { url: 'https://weather.example', title: 'Forecast', content: 'Sunny' } }] } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    ]
    const { fetch, calls } = mockFetch(() => sse(openaiSSE(chunks)))
    const events = await collect(streamChat({ brain: openrouter, messages: [{ role: 'user', content: 'Weather?' }], tools: [search], fetch }))
    assert.deepEqual(calls[0].body.tools, [{ type: 'openrouter:web_search', parameters: { max_uses: 3 } }])
    assert.deepEqual(events[1], { type: 'cite', sources: [{ title: 'Forecast', url: 'https://weather.example', quote: 'Sunny' }] })
  })

  test('other servers get it as a function, answered by Jean (Wikipedia)', async () => {
    const { fetch, calls } = mockFetch(() => sse(openaiSSE([{ choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: 'stop' }] }])))
    await collect(streamChat({ brain: custom, messages: [{ role: 'user', content: 'Hi' }], tools: [search], fetch }))
    assert.deepEqual(calls[0].body.tools, [{ type: 'function', function: { name: 'web_search', description: 'Search the web.', parameters: search.parameters } }])
  })
})

describe('sources in the loop', () => {
  const brain = custom
  /** @param {any[][]} script */
  const scripted = (script) => {
    let call = 0
    return /** @type {any} */ (async function* () { for (const event of script[call++]) yield event })
  }
  const done = (/** @type {string} */ stopReason, /** @type {any} */ message) => ({ type: 'done', stopReason, message })

  test('the brain’s citations become [n] after the cited text, numbered from the turn’s first new source', async () => {
    /** @type {any[]} */
    const persisted = [userRecord('Tides?', 'dev')]
    const page = { title: 'Brest tides', url: 'https://tides.example/brest' }
    const result = await runTurn({
      brain, system: 's', history: [{ role: 'user', content: 'Tides?' }], firstSource: 3, persist: async (records) => { persisted.push(...records) },
      stream: scripted([[
        { type: 'text', delta: 'High tide is at 9:12.' }, { type: 'cite', sources: [page] },
        { type: 'text', delta: ' Low tide at 15:30.' }, { type: 'cite', sources: [page, { title: 'Port', url: 'https://port.example' }] },
        done('end', { role: 'assistant', content: 'High tide is at 9:12. Low tide at 15:30.', raw: [{ type: 'web_search_tool_result' }, { type: 'text', text: '…' }] }),
      ]]),
    })
    assert.equal(result.text, 'High tide is at 9:12. [3] Low tide at 15:30. [3, 4]')
    const entry = persisted.find((record) => record.update?.kind === 'think')?.update
    assert.deepEqual(entry._meta.sources, [{ ...page, n: 3 }, { title: 'Port', url: 'https://port.example', n: 4 }])
    assert.ok(entry._meta.raw, 'search results are kept for replay')
    assert.equal(toChatMessages(persisted).at(-1)?.content, result.text)
  })

  test('tools cite what they bring in, and record what they made; the counter is shared', async () => {
    const mailTool = {
      spec: { name: 'mail', description: 'Latest emails', parameters: { type: 'object' } },
      kind: /** @type {const} */ ('fetch'),
      title: () => 'Mail',
      run: async (/** @type {any} */ _, /** @type {import('../core/loop.js').ToolContext} */ ctx) => {
        const [a, b] = ctx.cite([{ title: 'Invoice', url: 'mail://1' }, { title: 'Lunch', url: 'mail://2' }])
        ctx.meta.image = { uri: 'files/x.png', name: 'x.png' }
        return `Source [${a}]: Invoice\nSource [${b}]: Lunch`
      },
    }
    const call = { id: 'c1', name: 'mail', args: {} }
    /** @type {any[]} */
    const persisted = []
    const result = await runTurn({
      brain, system: 's', history: [{ role: 'user', content: 'Mail?' }], tools: [mailTool], rule: () => 'allow', persist: async (records) => { persisted.push(...records) },
      stream: scripted([
        [{ type: 'tool_call', call }, done('tool_use', { role: 'assistant', content: '', toolCalls: [call] })],
        [{ type: 'text', delta: 'Two emails.' }, { type: 'cite', sources: [{ title: 'Lunch', url: 'mail://2' }, { title: 'Web', url: 'https://w.example' }] }, done('end', { role: 'assistant', content: 'Two emails.' })],
      ]),
    })
    const record = persisted.find((r) => r.update?.toolCallId === 'c1')?.update
    assert.deepEqual({ ...record._meta, ms: undefined }, { ms: undefined, sources: [{ title: 'Invoice', url: 'mail://1', n: 1 }, { title: 'Lunch', url: 'mail://2', n: 2 }], image: { uri: 'files/x.png', name: 'x.png' } })
    assert.equal(result.text, 'Two emails. [2, 3]')
  })

  test('a paused turn (the provider’s own tools ran long) is sent back and resumed', async () => {
    /** @type {any[][]} */
    const seen = []
    let call = 0
    const steps = [
      [{ type: 'text', delta: 'Searching…' }, done('pause', { role: 'assistant', content: 'Searching…', raw: [{ type: 'server_tool_use', id: 's' }] })],
      [{ type: 'text', delta: ' Found it.' }, done('end', { role: 'assistant', content: ' Found it.' })],
    ]
    const stream = /** @type {any} */ (async function* (/** @type {any} */ request) {
      seen.push(structuredClone(request.messages))
      for (const event of steps[call++]) yield event
    })
    const result = await runTurn({ brain, system: 's', history: [{ role: 'user', content: 'Find it' }], stream })
    assert.equal(result.stopReason, 'end')
    assert.deepEqual(seen[1].at(-1), { role: 'assistant', content: 'Searching…', raw: [{ type: 'server_tool_use', id: 's' }] })
  })
})

describe('pictures (models.image)', () => {
  const png = Buffer.from([137, 80, 78, 71]).toString('base64')

  test('OpenAI’s Images API, and compatible servers', async () => {
    const { fetch, calls } = mockFetch(() => Response.json({ data: [{ b64_json: png }] }))
    const picture = await generateImage({ brain: { ...custom, provider: 'openai' }, apiKey: 'k', model: 'gpt-image-1', prompt: 'A lighthouse', fetch })
    assert.equal(calls[0].url, 'http://127.0.0.1:9/v1/images/generations')
    assert.deepEqual(calls[0].body, { model: 'gpt-image-1', prompt: 'A lighthouse', n: 1 })
    assert.equal(calls[0].init.headers.authorization, 'Bearer k')
    assert.deepEqual([...picture.bytes], [137, 80, 78, 71])
    assert.equal(picture.mimeType, 'image/png')
  })

  test('OpenRouter: a chat completion that answers with an image', async () => {
    const { fetch, calls } = mockFetch(() => Response.json({ choices: [{ message: { content: '', images: [{ type: 'image_url', image_url: { url: `data:image/webp;base64,${png}` } }] } }] }))
    const picture = await generateImage({ brain: openrouter, model: 'google/gemini-image', prompt: 'A lighthouse', fetch })
    assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions')
    assert.deepEqual(calls[0].body, { model: 'google/gemini-image', messages: [{ role: 'user', content: 'A lighthouse' }], modalities: ['image', 'text'] })
    assert.equal(picture.mimeType, 'image/webp')
  })

  test('no picture in the answer is an error', async () => {
    const { fetch } = mockFetch(() => Response.json({ data: [{ url: 'https://example.com/a.png' }] }))
    await assert.rejects(generateImage({ brain: custom, model: 'dall-e-3', prompt: 'x', fetch }), /No picture/)
  })
})

describe('the <connections> section', () => {
  test('frozen with the prompt, changed by a note', () => {
    const sections = { connections: '- Mail: mail_search_emails, mail_read_email' }
    const system = buildSystemPrompt({ assistantName: 'Jean', uiLanguage: 'English', sections })
    assert.match(system, /<connections>\n- Mail: mail_search_emails, mail_read_email\n<\/connections>/)
    const known = promptState({ language: 'English', tools: [], sections })
    const later = { connections: '- Mail: mail_search_emails, mail_read_email\n- Drive: drive_search' }
    const notes = changeNotes(known, promptState({ language: 'English', tools: [], sections: later }), later)
    assert.equal(notes.length, 1)
    assert.match(String(notes[0].update?.sessionUpdate === '_system_note' && notes[0].update.text), /^The <connections> section is now:\n- Mail/)
  })
})

// ─── Connections (MCP) ───────────────────────────────────────────────────────

import { createFakeMail } from './fixtures/fake-mail.js'
import { mcpClient, paramHeaders, headerValue } from '../caps/connections/mcp.js'
import { parseChallenge, discover, registerClient, authorization, finish, refresh } from '../caps/connections/auth.js'
import { DIRECTORY, known, knownFor, covers } from '../caps/connections/directory.js'
import { gateway, covers as gatewayCovers } from '../gateway/gateway.js'
import { listener, speakable } from '../caps/live/turns.js'

/** @returns {Promise<{ origin: string, server: ReturnType<typeof createFakeMail>, close: () => Promise<void> }>} */
async function fakeMail() {
  const server = createFakeMail()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const address = /** @type {import('node:net').AddressInfo} */ (server.address())
  return { origin: `http://127.0.0.1:${address.port}`, server, close: () => new Promise((resolve) => server.close(() => resolve(undefined))) }
}
const jean = { name: 'Jean', version: '0.5' }

describe('MCP client', () => {
  test('the stateless revision: metadata in every request, mirrored in headers; streamed answers', async () => {
    const { origin, server, close } = await fakeMail()
    try {
      const mcp = mcpClient({ url: `${origin}/open/mcp`, client: jean })
      const tools = await mcp.listTools()
      assert.deepEqual(tools.map((tool) => tool.name), ['search_emails', 'read_email', 'send_email'])
      const result = await mcp.callTool(tools[1], { id: '2' })
      assert.equal(result.content?.[0].resource.title, 'Invoice 2041 is due Friday')
      // read_email asks for its `id` in a header too (x-mcp-header).
      assert.deepEqual(server.log, ['POST /open/mcp tools/list', 'POST /open/mcp tools/call 2'])
    } finally {
      await close()
    }
  })

  test('an earlier server: the handshake, its session, and a new one when it forgets', async () => {
    const { origin, server, close } = await fakeMail()
    try {
      const mcp = mcpClient({ url: `${origin}/legacy/mcp`, client: jean })
      assert.equal((await mcp.listTools()).length, 3)
      server.sessions.clear()
      const result = await mcp.callTool({ name: 'search_emails' }, { limit: 1 })
      assert.equal(result.content?.length, 2)
      // A modern probe first, then: initialize, initialized, list; the forgotten call, initialize, initialized, the call.
      assert.deepEqual(server.log, ['POST /legacy/mcp tools/list', ...Array(7).fill('POST /legacy/mcp')])
    } finally {
      await close()
    }
  })

  test('a 401 says the service wants a key or a sign-in, with its challenge', async () => {
    const { origin, close } = await fakeMail()
    try {
      await assert.rejects(mcpClient({ url: `${origin}/mcp`, client: jean }).listTools(), (/** @type {any} */ error) => error.auth && /resource_metadata=/.test(error.challenge))
      const signed = mcpClient({ url: `${origin}/mcp`, client: jean, authorization: async () => 'Bearer test-token' })
      assert.equal((await signed.listTools()).length, 3)
    } finally {
      await close()
    }
  })

  test('header values: plain ASCII as is, anything else in Base64; nested parameters too', () => {
    assert.equal(headerValue('us-west1'), 'us-west1')
    assert.equal(headerValue('Hello, 世界'), '=?base64?SGVsbG8sIOS4lueVjA==?=')
    assert.equal(headerValue(' padded '), '=?base64?IHBhZGRlZCA=?=')
    assert.equal(headerValue('=?base64?literal?='), '=?base64?PT9iYXNlNjQ/bGl0ZXJhbD89?=')
    const schema = { properties: { region: { type: 'string', 'x-mcp-header': 'Region' }, filter: { type: 'object', properties: { team: { type: 'string', 'x-mcp-header': 'Team' } } }, query: { type: 'string' } } }
    assert.deepEqual(paramHeaders(schema, { region: 'eu', filter: { team: 'ops' }, query: 'x' }), { 'mcp-param-region': 'eu', 'mcp-param-team': 'ops' })
  })
})

describe('signing in to a connection', () => {
  test('discovery, registration, PKCE with a resource indicator, the issuer check, tokens, refresh', async () => {
    const { origin, close } = await fakeMail()
    try {
      let challenge = null
      await mcpClient({ url: `${origin}/mcp`, client: jean }).listTools().catch((/** @type {any} */ error) => { challenge = error.challenge })
      assert.deepEqual(parseChallenge(challenge), { resource_metadata: `${origin}/.well-known/oauth-protected-resource/mcp`, scope: 'mail.read' })
      const metadata = await discover(`${origin}/mcp`, { challenge })
      assert.equal(metadata.issuer, origin)
      assert.equal(metadata.resource, `${origin}/mcp`)
      const redirectURI = 'http://127.0.0.1:4180/'
      const clientId = await registerClient(metadata, { redirectURI, name: 'Jean' })
      const { url, pending } = await authorization(metadata, { clientId, redirectURI })
      const asked = new URL(url).searchParams
      assert.equal(asked.get('scope'), 'mail.read offline_access')
      assert.equal(asked.get('code_challenge_method'), 'S256')
      // The service approves at once and sends the browser back.
      const back = new URL(/** @type {string} */ ((await fetch(url, { redirect: 'manual' })).headers.get('location')))
      await assert.rejects(finish(new URLSearchParams({ ...Object.fromEntries(back.searchParams), iss: 'https://elsewhere.example' }), pending), /another server/)
      await assert.rejects(finish(new URLSearchParams({ ...Object.fromEntries(back.searchParams), state: 'forged' }), pending), /not started here/)
      const tokens = await finish(back.searchParams, pending)
      assert.equal(tokens.refresh, 'refresh-me')
      const mcp = mcpClient({ url: `${origin}/mcp`, client: jean, authorization: async () => `Bearer ${tokens.access}` })
      assert.equal((await mcp.listTools()).length, 3)
      assert.deepEqual({ ...(await refresh(tokens)), expiresAt: 0 }, { ...tokens, access: 'renewed', expiresAt: 0 })
    } finally {
      await close()
    }
  })

  test('discovery without a readable challenge falls back to the well-known address', async () => {
    const { origin, close } = await fakeMail()
    try {
      assert.equal((await discover(`${origin}/mcp`)).token_endpoint, `${origin}/token`)
      const nowhere = /** @type {typeof fetch} */ (async () => new Response('Not Found', { status: 404 }))
      await assert.rejects(discover('https://mcp.example/mcp', { fetch: nowhere }), /does not say where to sign in/)
      // A sign-in page that isn't a web address is never followed.
      const hostile = /** @type {typeof fetch} */ (async (url) => Response.json(String(url).includes('protected-resource') ? { authorization_servers: ['https://as.example'] }
        : { issuer: 'https://as.example', authorization_endpoint: 'javascript:alert(1)', token_endpoint: 'https://as.example/token' }))
      await assert.rejects(discover('https://mcp.example/mcp', { fetch: hostile }), /could not be found/)
      // An issuer is compared as an address: a bare host's trailing slash is the same one (Box, Otter), a path's isn't.
      const named = (/** @type {string} */ server) => /** @type {typeof fetch} */ (async (url) => Response.json(String(url).includes('protected-resource') ? { authorization_servers: [server] }
        : { issuer: server.replace(/\/$/, ''), authorization_endpoint: 'https://as.example/authorize', token_endpoint: 'https://as.example/token' }))
      assert.equal((await discover('https://mcp.example/mcp', { fetch: named('https://as.example/') })).issuer, 'https://as.example')
      await assert.rejects(discover('https://mcp.example/mcp', { fetch: named('https://as.example/tenant/') }), /could not be found/)
    } finally {
      await close()
    }
  })

  test('a service that names no sign-in server (MCP 2025-03-26, as Atlassian’s) signs in at its own origin, with no resource indicator', async () => {
    /** @type {{ url: string, body?: string }[]} */
    const asked = []
    const atlassian = /** @type {typeof fetch} */ (async (url, init) => {
      asked.push({ url: String(url), body: init?.body?.toString() })
      if (String(url) === 'https://mcp.atlassian.example/.well-known/oauth-authorization-server') {
        return Response.json({ issuer: 'https://mcp.atlassian.example', authorization_endpoint: 'https://mcp.atlassian.example/v1/authorize', token_endpoint: 'https://mcp.atlassian.example/v1/token', registration_endpoint: 'https://mcp.atlassian.example/v1/register' })
      }
      if (String(url).endsWith('/v1/token')) return Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 })
      return new Response('Not Found', { status: 404 })
    })
    const metadata = await discover('https://mcp.atlassian.example/v1/mcp', { challenge: 'Bearer realm="OAuth", error="invalid_token"', fetch: atlassian })
    assert.equal(metadata.issuer, 'https://mcp.atlassian.example')
    assert.equal(metadata.resource, undefined)
    const redirectURI = 'http://127.0.0.1:4180/'
    const { url, pending } = await authorization(metadata, { clientId: 'jean', redirectURI })
    assert.equal(new URL(url).searchParams.has('resource'), false)
    const tokens = await finish(new URLSearchParams({ code: 'code', state: pending.state }), pending, atlassian)
    assert.equal(tokens.access, 'access')
    assert.equal(new URLSearchParams(asked.at(-1)?.body).has('resource'), false)
    await refresh(tokens, atlassian)
    assert.equal(new URLSearchParams(asked.at(-1)?.body).has('resource'), false)
  })

  test('a service may list its tools to anyone and run them only once signed in: its refusal says where (Google’s, D193)', async () => {
    const { origin, server, close } = await fakeMail()
    try {
      const open = mcpClient({ url: `${origin}/listed/mcp`, client: jean })
      const tools = await open.listTools()
      assert.equal(tools.length, 3)
      /** @type {any} */
      let refused = null
      await open.callTool(tools[0], { limit: 1 }).catch((error) => { refused = error })
      assert.equal(refused?.status, 401)
      assert.ok(refused.auth)
      const metadata = await discover(`${origin}/listed/mcp`, { challenge: refused.challenge })
      assert.deepEqual([metadata.issuer, metadata.resource], [origin, `${origin}/listed/mcp`])
      const redirectURI = 'http://127.0.0.1:4180/'
      const { url, pending } = await authorization(metadata, { clientId: await registerClient(metadata, { redirectURI, name: 'Jean' }), redirectURI })
      const back = new URL(/** @type {string} */ ((await fetch(url, { redirect: 'manual' })).headers.get('location')))
      const tokens = await finish(back.searchParams, pending)
      const signed = mcpClient({ url: `${origin}/listed/mcp`, client: jean, authorization: async () => `Bearer ${tokens.access}` })
      assert.equal((await signed.callTool(tools[0], { limit: 1 })).content?.length, 2)
      assert.deepEqual(server.log.filter((line) => line.startsWith('POST /listed/mcp')), ['POST /listed/mcp tools/list', 'POST /listed/mcp tools/call', 'POST /listed/mcp tools/call'])
    } finally {
      await close()
    }
  })
})

describe('the services Jean knows (D95)', () => {
  test('each is reached from the browser, through the gateway that relays to its host, or not yet; those reached first (D191)', () => {
    assert.equal(new Set(DIRECTORY.map((entry) => entry.id)).size, DIRECTORY.length)
    const services = known()
    assert.deepEqual(services.slice(0, 4).map((entry) => [entry.id, entry.via]), [['notion', 'browser'], ['canva', 'browser'], ['miro', 'browser'], ['granola', 'browser']])
    for (const entry of services.slice(0, 4)) assert.match(String(entry.url), /^https:\/\//)
    assert.equal(services.length, DIRECTORY.length)
    assert.ok(services.some((entry) => entry.id === 'microsoft-365' && entry.url === 'https://microsoft365.mcp.claude.com/mcp' && entry.via === null))
    assert.ok(services.some((entry) => entry.id === 'google-meet' && !entry.url && entry.via === null))
    // A gateway that relays to Google's and Slack's hosts reaches those with an address; Meet still has none.
    const through = known({}, ['googleapis.com', 'slack.com'])
    assert.deepEqual(through.filter((entry) => entry.via === 'gateway').map((entry) => entry.id), ['gmail', 'google-drive', 'google-calendar', 'slack', 'google-chat'])
    const ready = DIRECTORY.filter((entry) => entry.ready).length
    assert.deepEqual(through.slice(ready, ready + 5).map((entry) => entry.id), ['gmail', 'google-drive', 'google-calendar', 'slack', 'google-chat'])
    assert.equal(through.find((entry) => entry.id === 'google-meet')?.via, null)
    assert.equal(knownFor('https://gmailmcp.googleapis.com/mcp/v1', {}, ['googleapis.com'])?.id, 'gmail')
    assert.equal(knownFor('https://gmailmcp.googleapis.com/mcp/v1'), undefined)
  })

  test('the gateway reaches HTTPS on the hosts it names and their subdomains, HTTP only on this computer; Jean checks as it does', () => {
    const hosts = ['googleapis.com', '127.0.0.1']
    const cases = /** @type {const} */ ([
      ['https://googleapis.com/x', true], ['https://gmailmcp.googleapis.com/mcp/v1', true], ['https://evilgoogleapis.com/', false], ['https://googleapis.com.evil.example/', false],
      ['http://gmailmcp.googleapis.com/', false], ['http://127.0.0.1:4182/closed/mcp', true], ['ftp://googleapis.com/', false],
    ])
    for (const [url, expected] of cases) {
      assert.equal(covers(hosts, new URL(url)), expected, url)
      assert.equal(gatewayCovers(hosts, new URL(url)), expected, url)
    }
  })

  test('each service Jean knows has its brand\'s logo, its own file: a plain drawing, or a picture (D159)', async () => {
    for (const { id, logo } of DIRECTORY) {
      assert.match(String(logo), /^[\w-]+\.(svg|png)$/, id)
      const file = await readFile(new URL(`../caps/connections/logos/${logo}`, import.meta.url))
      if (logo?.endsWith('.png')) { assert.deepEqual([...file.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], id); continue }
      assert.match(String(file), /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, id)
      assert.doesNotMatch(String(file), /<script|<foreignObject|<image|href=|url\((?!#)/i, id)
    }
  })

  test('policy merges by id: a gateway and a client id switch one on; it can hide one, add one, or hold one back', () => {
    const policy = { directory: [
      { id: 'microsoft-365', url: 'https://mcp.m365.corp.example/mcp', clientId: 'corp-app' },
      { id: 'figma', hidden: true },
      { id: 'crm', name: 'CRM', url: 'https://mcp.crm.corp.example/mcp' },
      { id: 'canva', ready: false },
      { id: 'nameless', url: 'https://nowhere.example/mcp' },
    ] }
    const services = known(policy)
    const m365 = services.find((entry) => entry.id === 'microsoft-365')
    assert.deepEqual({ ...m365 }, { id: 'microsoft-365', name: 'Microsoft 365', url: 'https://mcp.m365.corp.example/mcp', includes: ['Outlook', 'OneDrive', 'SharePoint', 'Teams'], logo: 'microsoft-365.svg', clientId: 'corp-app', ready: true, via: 'browser' })
    assert.equal(services.find((entry) => entry.id === 'crm')?.via, 'browser')
    assert.equal(services.find((entry) => entry.id === 'canva')?.via, null)
    assert.ok(!services.some((entry) => entry.id === 'figma' || entry.id === 'nameless'))
    assert.equal(knownFor('https://mcp.m365.corp.example/mcp', policy)?.clientId, 'corp-app')
    assert.equal(knownFor('https://mcp.canva.com/mcp', policy), undefined)
  })

  test('a service that can\'t register Jean signs in with the client the organisation registered there', async () => {
    const { origin, close } = await fakeMail()
    try {
      let challenge = null
      await mcpClient({ url: `${origin}/fixed/mcp`, client: jean }).listTools().catch((/** @type {any} */ error) => { challenge = error.challenge })
      const metadata = await discover(`${origin}/fixed/mcp`, { challenge })
      assert.equal(metadata.issuer, `${origin}/fixed`)
      const redirectURI = 'http://127.0.0.1:4180/'
      await assert.rejects(registerClient(metadata, { redirectURI, name: 'Jean' }), /only accepts apps it registered/)
      const { url, pending } = await authorization(metadata, { clientId: 'jean-test', redirectURI })
      const back = new URL(/** @type {string} */ ((await fetch(url, { redirect: 'manual' })).headers.get('location')))
      const tokens = await finish(back.searchParams, pending)
      assert.equal(tokens.clientId, 'jean-test')
      const mcp = mcpClient({ url: `${origin}/fixed/mcp`, client: jean, authorization: async () => `Bearer ${tokens.access}` })
      assert.equal((await mcp.listTools()).length, 3)
    } finally {
      await close()
    }
  })
})

describe('the gateway (D191)', () => {
  const JEAN = 'http://127.0.0.1:4180'
  const AT = 'https://gateway.example/'
  /** Jean's fetch through a gateway: each address in `url`, from Jean's origin, as a browser sends it. @param {(request: Request) => Promise<Response>} handle */
  const through = (handle) => /** @type {typeof fetch} */ (async (input, init = {}) => {
    const url = new URL(AT)
    url.searchParams.set('url', String(input))
    const headers = new Headers(init.headers)
    headers.set('origin', JEAN)
    return handle(new Request(url, { ...init, headers }))
  })

  test('only for Jean’s origins and the hosts it names, and it says what it serves', async () => {
    const handle = gateway({ origins: [JEAN], hosts: ['127.0.0.1'], clients: [{ issuer: 'https://accounts.example', tokenEndpoint: 'https://accounts.example/token', clientId: 'app', clientSecret: 'secret' }] })
    const served = await handle(new Request(AT, { headers: { origin: JEAN } }))
    assert.deepEqual(await served.json(), { format: 1, hosts: ['127.0.0.1'], clients: { 'https://accounts.example': 'app' } })
    assert.equal(served.headers.get('access-control-allow-origin'), JEAN)
    const elsewhere = await handle(new Request(`${AT}?url=${encodeURIComponent('http://127.0.0.1:9/mcp')}`, { method: 'POST', headers: { origin: 'https://elsewhere.example' } }))
    assert.equal(elsewhere.status, 403)
    assert.equal(elsewhere.headers.get('access-control-allow-origin'), null)
    assert.equal((await through(handle)('https://example.com/mcp', { method: 'POST' })).status, 403)
    assert.equal((await through(handle)('not an address', { method: 'POST' })).status, 403)
    const preflight = await handle(new Request(`${AT}?url=${encodeURIComponent('http://127.0.0.1:9/mcp')}`, { method: 'OPTIONS', headers: { origin: JEAN, 'access-control-request-headers': 'authorization,mcp-method' } }))
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-headers'), 'authorization,mcp-method')
  })

  test('a service that answers no page: signing in with the app the gateway holds, its secret added on the way, then the tools', async () => {
    const { origin, server, close } = await fakeMail()
    try {
      for (const auth of /** @type {const} */ (['post', 'basic'])) {
        const fetch = through(gateway({ origins: [JEAN], hosts: ['127.0.0.1'], clients: [{ issuer: `${origin}/closed`, tokenEndpoint: `${origin}/token`, clientId: 'gateway-app', clientSecret: 'gateway-secret', auth }] }))
        let challenge = null
        await mcpClient({ url: `${origin}/closed/mcp`, client: jean, fetch }).listTools().catch((/** @type {any} */ error) => { challenge = error.challenge })
        const metadata = await discover(`${origin}/closed/mcp`, { challenge, fetch })
        assert.equal(metadata.issuer, `${origin}/closed`)
        assert.equal(metadata.registration_endpoint, undefined)
        // Another account of a service already connected: the sign-in asks which.
        const { url, pending } = await authorization(metadata, { clientId: 'gateway-app', redirectURI: `${JEAN}/`, another: true })
        assert.equal(new URL(url).searchParams.get('prompt'), 'select_account')
        const code = () => globalThis.fetch(url, { redirect: 'manual' }).then((res) => new URL(/** @type {string} */ (res.headers.get('location'))).searchParams)
        // Straight from the browser, without the app's secret, the code can't be traded.
        await assert.rejects(finish(await code(), pending), /invalid_client/)
        const tokens = await finish(await code(), pending, fetch)
        assert.equal(tokens.clientId, 'gateway-app')
        assert.equal((await refresh(tokens, fetch)).access, 'renewed')
        const mcp = mcpClient({ url: `${origin}/closed/mcp`, client: jean, fetch, authorization: async () => `Bearer ${tokens.access}` })
        const tools = await mcp.listTools()
        assert.equal(tools.length, 3)
        // A call's answer streams through, and the headers a tool asks for go with it.
        const read = await mcp.callTool(/** @type {any} */ (tools.find((tool) => tool.name === 'read_email')), { id: '2' })
        assert.match(read.content?.[0].resource.text, /Invoice 2041/)
      }
      assert.ok(server.log.includes('POST /closed/mcp tools/call 2'))
      assert.ok(!server.log.some((line) => line.includes('/closed') && line.includes(' from ')), 'the service never saw a page’s origin')
    } finally {
      await close()
    }
  })
})

describe('live conversation', () => {
  test('a turn starts after a quarter second of speech and ends after silence; interrupting takes longer', () => {
    const hear = listener()
    const frames = (/** @type {number} */ chance, /** @type {number} */ n, strict = false) => Array.from({ length: n }, () => hear(chance, strict)).filter(Boolean)
    assert.deepEqual(frames(0.2, 20), [])
    assert.deepEqual(frames(0.9, 7), [])
    assert.deepEqual(frames(0.9, 1), ['start'])
    assert.deepEqual(frames(0.4, 30), [], 'a pause above the keep threshold is still speech')
    assert.deepEqual(frames(0.1, 25), ['end'])
    assert.deepEqual(frames(0.9, 10, true), [], 'over Jean, a short sound is not a turn')
    assert.deepEqual(frames(0.9, 6, true), ['start'])
  })

  test('complete sentences are read as the answer streams; the last one when it ends', () => {
    let { ready, next } = speakable('Bonjour. Voici le résumé de vos', 0, 'fr', false)
    assert.deepEqual(ready, ['Bonjour.'])
    ;({ ready, next } = speakable('Bonjour. Voici le résumé de vos courriels. Trois sont', next, 'fr', false))
    assert.deepEqual(ready, ['Voici le résumé de vos courriels.'])
    assert.deepEqual(speakable('Bonjour. Voici le résumé de vos courriels. Trois sont arrivés', next, 'fr', true).ready, ['Trois sont arrivés'])
    assert.deepEqual(speakable('こんにちは。メールは三通です。', 0, 'ja', false).ready, ['こんにちは。'])
  })
})
