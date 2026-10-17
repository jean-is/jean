import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSSE } from '../app/core/sse.js'
import { PROVIDERS, LLMError, headersFor, streamChat, listModels, checkKey, warmCache, openaiMessages } from '../app/core/llm.js'
import { minimumCacheable } from '../app/core/anthropic.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const encoder = new TextEncoder()

/** Splits bytes into chunks of awkward sizes so boundaries land mid-line and mid-character. */
function byteStream(text, sizes = [3, 17, 50, 7, 101, 29]) {
  const bytes = encoder.encode(text)
  const chunks = []
  for (let i = 0, k = 0; i < bytes.length; k++) {
    const n = sizes[k % sizes.length]
    chunks.push(bytes.slice(i, i + n))
    i += n
  }
  return new ReadableStream({
    pull(controller) {
      if (chunks.length) controller.enqueue(chunks.shift())
      else controller.close()
    },
  })
}

/** @param {Uint8Array[]} chunks */
function chunkStream(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    },
  })
}

async function collect(iterable) {
  const out = []
  for await (const item of iterable) out.push(item)
  return out
}

const openaiSSE = (chunks) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
const anthropicSSE = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')

/** A fetch mock that records requests and answers with `respond(url, init)`. */
function mockFetch(respond) {
  const calls = []
  const fetch = async (url, init = {}) => {
    calls.push({ url, init, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined })
    if (init.signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError')
    return respond(url, init)
  }
  return { fetch, calls }
}

const sseResponse = (text, sizes) => () =>
  new Response(byteStream(text, sizes), { status: 200, headers: { 'content-type': 'text/event-stream' } })

const brains = {
  openrouter: { id: 'b1', provider: 'openrouter', api: 'openai', baseURL: PROVIDERS.openrouter.baseURL, model: 'openrouter/auto' },
  openai: { id: 'b2', provider: 'openai', api: 'openai', baseURL: PROVIDERS.openai.baseURL, model: 'gpt-5' },
  ollama: { id: 'b3', provider: 'ollama', api: 'openai', baseURL: 'http://localhost:11434/v1/', model: 'qwen3' },
  anthropic: { id: 'b4', provider: 'anthropic', api: 'anthropic', baseURL: PROVIDERS.anthropic.baseURL, model: 'claude-opus-5-5' },
}

const anthropicWith = (model) => ({ ...brains.anthropic, model })

async function run(brain, sseText, { sizes, ...extra } = {}) {
  const { fetch, calls } = mockFetch(sseResponse(sseText, sizes))
  const events = await collect(streamChat({ brain, apiKey: 'sk-test', messages: [{ role: 'user', content: 'Hi' }], fetch, ...extra }))
  return { events, request: calls[0] }
}

async function rejectsWith(promise, expected) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof LLMError, `expected LLMError, got ${error}`)
    for (const [key, value] of Object.entries(expected)) assert.equal(error[key], value, key)
    return true
  })
}

// ─── parseSSE ────────────────────────────────────────────────────────────────

describe('parseSSE', () => {
  test('parses events, event names and defaults to "message"', async () => {
    const text = 'event: ping\ndata: {"a":1}\n\ndata: plain\n\n'
    assert.deepEqual(await collect(parseSSE(byteStream(text))), [
      { event: 'ping', data: '{"a":1}' },
      { event: 'message', data: 'plain' },
    ])
  })

  test('handles CRLF line endings', async () => {
    const text = 'event: a\r\ndata: one\r\n\r\ndata: two\r\n\r\n'
    assert.deepEqual(await collect(parseSSE(byteStream(text))), [
      { event: 'a', data: 'one' },
      { event: 'message', data: 'two' },
    ])
  })

  test('joins multi-line data with \\n and keeps only one leading space', async () => {
    const text = 'data: first\ndata:second\ndata:  third\n\n'
    assert.deepEqual(await collect(parseSSE(byteStream(text))), [{ event: 'message', data: 'first\nsecond\n third' }])
  })

  test('ignores comments, unknown fields and events without data', async () => {
    const text = ': OPENROUTER PROCESSING\n\nid: 7\nretry: 100\nevent: lonely\n\n:keep-alive\ndata: x\n\n'
    assert.deepEqual(await collect(parseSSE(byteStream(text))), [{ event: 'message', data: 'x' }])
  })

  test('decodes multi-byte characters split across chunks', async () => {
    const bytes = encoder.encode('data: héllo 世界 🎉\n\n')
    const euro = bytes.indexOf(0xe4) // first byte of 世
    const emoji = bytes.indexOf(0xf0)
    const stream = chunkStream([bytes.slice(0, euro + 1), bytes.slice(euro + 1, emoji + 2), bytes.slice(emoji + 2)])
    assert.deepEqual(await collect(parseSSE(stream)), [{ event: 'message', data: 'héllo 世界 🎉' }])
  })

  test('one byte at a time gives the same result', async () => {
    const text = 'event: e\r\ndata: ünï\r\ndata: côdé\r\n\r\n: c\ndata: z\n\n'
    const whole = await collect(parseSSE(chunkStream([encoder.encode(text)])))
    const bytewise = await collect(parseSSE(byteStream(text, [1])))
    assert.deepEqual(bytewise, whole)
    assert.equal(whole.length, 2)
  })

  test('flushes a final event without a trailing blank line', async () => {
    assert.deepEqual(await collect(parseSSE(byteStream('data: a\n\ndata: last'))), [
      { event: 'message', data: 'a' },
      { event: 'message', data: 'last' },
    ])
    assert.deepEqual(await collect(parseSSE(byteStream('event: x\ndata: y\n'))), [{ event: 'x', data: 'y' }])
  })
})

// ─── Headers ─────────────────────────────────────────────────────────────────

describe('headersFor', () => {
  test('OpenAI-compatible: bearer only with a key, extra headers merged in lower case', () => {
    assert.deepEqual(headersFor(brains.openrouter, 'k'), { 'content-type': 'application/json', authorization: 'Bearer k' })
    assert.deepEqual(headersFor(brains.ollama), { 'content-type': 'application/json' })
    const brain = { ...brains.openrouter, headers: { 'HTTP-Referer': 'https://example.test', Authorization: 'Bearer override' } }
    assert.deepEqual(headersFor(brain, 'k'), {
      'content-type': 'application/json',
      authorization: 'Bearer override',
      'http-referer': 'https://example.test',
    })
  })

  test('Anthropic: key, version and the browser-access header', () => {
    assert.deepEqual(headersFor(brains.anthropic, 'k'), {
      'content-type': 'application/json',
      'x-api-key': 'k',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    })
  })
})

// ─── OpenAI-compatible ───────────────────────────────────────────────────────

describe('streamChat (OpenAI-compatible)', () => {
  test('streams text and reasoning, then done with trailing usage', async () => {
    const sse = ': OPENROUTER PROCESSING\n\n' + openaiSSE([
      { choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] },
      { choices: [{ index: 0, delta: { reasoning: 'Pondering ', content: null } }] },
      { choices: [{ index: 0, delta: { reasoning_content: 'deeply.' } }] },
      { choices: [{ index: 0, delta: { content: 'Héllo ' } }] },
      { choices: [{ index: 0, delta: { content: 'wörld 🌍' }, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 12, completion_tokens: 5 } },
    ])
    const { events } = await run(brains.openrouter, sse)
    assert.deepEqual(events, [
      { type: 'thinking', delta: 'Pondering ' },
      { type: 'thinking', delta: 'deeply.' },
      { type: 'text', delta: 'Héllo ' },
      { type: 'text', delta: 'wörld 🌍' },
      {
        type: 'done',
        stopReason: 'end',
        usage: { inputTokens: 12, outputTokens: 5 },
        message: { role: 'assistant', content: 'Héllo wörld 🌍' },
      },
    ])
  })

  test('accumulates streamed tool calls by index and parses arguments strictly', async () => {
    const sse = openaiSSE([
      { choices: [{ delta: { content: 'Let me check.' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'read', arguments: '' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"pa' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_b', function: { name: 'search', arguments: '{"q":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"a.md"}' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '"été"}' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 2, id: 'call_c', function: { name: 'list' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 3, id: 'call_d', function: { name: 'write', arguments: '{"broken": ' } }] } }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ])
    const { events } = await run(brains.openrouter, sse)
    const calls = [
      { id: 'call_a', name: 'read', args: { path: 'a.md' } },
      { id: 'call_b', name: 'search', args: { q: 'été' } },
      { id: 'call_c', name: 'list', args: {} },
      { id: 'call_d', name: 'write', args: { __invalidJSON: '{"broken": ' } },
    ]
    assert.deepEqual(events.slice(1, 5), calls.map((call) => ({ type: 'tool_call', call })))
    const done = events.at(-1)
    assert.equal(events.length, 6)
    assert.equal(done.stopReason, 'tool_use')
    assert.equal(done.usage, undefined)
    assert.deepEqual(done.message, { role: 'assistant', content: 'Let me check.', toolCalls: calls })
  })

  test('tolerates servers that omit the index or the id', async () => {
    const sse = openaiSSE([
      { choices: [{ delta: { tool_calls: [{ id: 'x1', function: { name: 'a', arguments: '{"n":1}' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ id: 'x2', function: { name: 'b', arguments: '{}' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 2, function: { name: 'c', arguments: '{}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ])
    const { events } = await run(brains.ollama, sse)
    const done = events.at(-1)
    assert.equal(done.stopReason, 'tool_use', "a local server saying 'stop' after tool calls")
    assert.deepEqual(done.message.toolCalls.slice(0, 2), [
      { id: 'x1', name: 'a', args: { n: 1 } },
      { id: 'x2', name: 'b', args: {} },
    ])
    assert.match(done.message.toolCalls[2].id, /^call_/)
  })

  test('byte-sized chunks (mid-line, mid-character) give the same events', async () => {
    const sse = openaiSSE([
      { choices: [{ delta: { reasoning: 'Penser… ' } }] },
      { choices: [{ delta: { content: 'Ça va ? 世界 🎉' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'f', arguments: '{"q":"é' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"}' } }] }, finish_reason: 'tool_calls' }] },
    ])
    const whole = await run(brains.openrouter, sse, { sizes: [100000] })
    const split = await run(brains.openrouter, sse, { sizes: [1, 2] })
    assert.deepEqual(split.events, whole.events)
    assert.equal(whole.events.at(-1).message.content, 'Ça va ? 世界 🎉')
  })

  test('maps finish reasons', async () => {
    const cases = { stop: 'end', length: 'max_tokens', content_filter: 'refusal', tool_calls: 'tool_use', weird: 'other' }
    for (const [finish, expected] of Object.entries(cases)) {
      const { events } = await run(brains.openai, openaiSSE([{ choices: [{ delta: { content: 'x' }, finish_reason: finish }] }]))
      assert.equal(events.at(-1).stopReason, expected, finish)
    }
    const { events } = await run(brains.openai, openaiSSE([{ choices: [{ delta: { content: 'x' } }] }]))
    assert.equal(events.at(-1).stopReason, 'other', 'no finish_reason at all')
  })

  test('throws on an error object in the stream', async () => {
    const sse = openaiSSE([
      { choices: [{ delta: { content: 'partial' } }] },
      { error: { code: 'server_error', message: 'Upstream exploded' }, choices: [{ delta: {}, finish_reason: 'error' }] },
    ])
    await rejectsWith(run(brains.openrouter, sse), { code: 'bad_response', message: 'Upstream exploded' })
    const limited = openaiSSE([{ error: { code: 429, message: 'Slow down' } }])
    await rejectsWith(run(brains.openrouter, limited), { code: 'rate_limit', status: 429, retryable: true })
  })

  test('asks OpenRouter again for as long an answer as the credits left cover (402), and says any other 402 is credits run out', async () => {
    const short = { error: { code: 402, message: 'This request requires more credits, or fewer max_tokens. You requested up to 65536 tokens, but can only afford 62555. To increase, visit https://openrouter.ai/settings/credits and add more credits' } }
    const { fetch, calls } = mockFetch((_, init) => (JSON.parse(String(init.body)).max_tokens === undefined
      ? new Response(JSON.stringify(short), { status: 402 }) : sseResponse(openaiSSE([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]))()))
    const events = await collect(streamChat({ brain: brains.openrouter, apiKey: 'sk-or', messages: [{ role: 'user', content: 'Hi' }], fetch }))
    assert.equal(events.at(-1).message.content, 'ok')
    assert.deepEqual(calls.map((call) => call.body.max_tokens), [undefined, 62555])
    const broke = mockFetch(() => new Response(JSON.stringify({ error: { code: 402, message: 'Insufficient credits' } }), { status: 402 }))
    await rejectsWith(collect(streamChat({ brain: brains.openrouter, apiKey: 'sk-or', messages: [], fetch: broke.fetch })), { code: 'credits', status: 402, retryable: false })
    assert.equal(broke.calls.length, 1)
  })

  test('throws when the server sends no events at all', async () => {
    const { fetch } = mockFetch(() => new Response('{"choices":[]}', { status: 200 }))
    await rejectsWith(collect(streamChat({ brain: brains.ollama, messages: [], fetch })), { code: 'bad_response' })
  })

  test('builds the request: URL, headers, body, message conversion and OpenRouter asked for providers that keep nothing (D381)', async () => {
    const tools = [{ name: 'read', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } }]
    const messages = [
      { role: 'user', content: 'Read a.md' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'read', args: { path: 'a.md' } }], raw: [{ ignored: true }] },
      { role: 'tool', toolCallId: 'c1', name: 'read', content: 'Hello' },
      { role: 'assistant', content: 'Next.', toolCalls: [{ id: 'c2', name: 'read', args: { path: 'b.md' } }] },
      { role: 'tool', toolCallId: 'c2', name: 'read', content: 'No such file', isError: true },
      { role: 'assistant', content: 'Done.' },
    ]
    const { fetch, calls } = mockFetch(sseResponse(openaiSSE([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }])))
    await collect(streamChat({ brain: brains.openrouter, apiKey: 'sk-or', system: 'Be brief.', messages, tools, fetch }))
    const [{ url, init, headers, body }] = calls
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions')
    assert.equal(init.method, 'POST')
    assert.equal(headers.authorization, 'Bearer sk-or')
    assert.equal(headers['content-type'], 'application/json')
    assert.deepEqual(body, {
      model: 'openrouter/auto',
      stream: true,
      provider: { data_collection: 'deny' },
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'Read a.md' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read', arguments: '{"path":"a.md"}' } }] },
        { role: 'tool', tool_call_id: 'c1', content: 'Hello' },
        { role: 'assistant', content: 'Next.', tool_calls: [{ id: 'c2', type: 'function', function: { name: 'read', arguments: '{"path":"b.md"}' } }] },
        { role: 'tool', tool_call_id: 'c2', content: 'Error: No such file' },
        { role: 'assistant', content: 'Done.' },
      ],
      tools: [{ type: 'function', function: tools[0] }],
    })
  })

  test('local servers: no key, usage asked of Ollama and LM Studio (D359), trailing slash, max_tokens only when given', async () => {
    const ok = openaiSSE([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }])
    const { fetch, calls } = mockFetch(sseResponse(ok))
    await collect(streamChat({ brain: { ...brains.ollama, headers: { 'X-Extra': '1' } }, messages: [], fetch }))
    await collect(streamChat({ brain: brains.ollama, messages: [], fetch, maxTokens: 100 }))
    assert.equal(calls[0].url, 'http://localhost:11434/v1/chat/completions')
    assert.deepEqual(calls[0].headers, { 'content-type': 'application/json', 'x-extra': '1' })
    assert.deepEqual(calls[0].body, { model: 'qwen3', stream: true, messages: [], stream_options: { include_usage: true } })
    assert.equal(calls[1].body.max_tokens, 100)
    await collect(streamChat({ brain: { ...brains.ollama, provider: 'custom' }, messages: [], fetch }))
    assert.equal(calls[2].body.stream_options, undefined)
  })

  test('OpenAI itself gets max_completion_tokens', async () => {
    const { request } = await run(brains.openai, openaiSSE([{ choices: [{ delta: { content: 'x' }, finish_reason: 'stop' }] }]), { maxTokens: 50 })
    assert.equal(request.body.max_completion_tokens, 50)
    assert.equal(request.body.max_tokens, undefined)
    assert.deepEqual(request.body.stream_options, { include_usage: true })
  })
})

// ─── Anthropic ───────────────────────────────────────────────────────────────

const messageStart = (input = 25) => ({ type: 'message_start', message: { id: 'msg_1', role: 'assistant', content: [], usage: { input_tokens: input, output_tokens: 1 } } })
const blockStart = (index, block) => ({ type: 'content_block_start', index, content_block: block })
const blockDelta = (index, delta) => ({ type: 'content_block_delta', index, delta })
const blockStop = (index) => ({ type: 'content_block_stop', index })
const messageDelta = (stop, output = 40) => ({ type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: output } })
const messageStop = { type: 'message_stop' }

function textTurn(stop = 'end_turn') {
  return anthropicSSE([
    messageStart(),
    blockStart(0, { type: 'text', text: '' }),
    blockDelta(0, { type: 'text_delta', text: 'Bonjour ' }),
    blockDelta(0, { type: 'text_delta', text: 'à vous 👋' }),
    blockStop(0),
    messageDelta(stop),
    messageStop,
  ])
}

describe('streamChat (Anthropic)', () => {
  test('streams text and reports done with usage and raw blocks', async () => {
    const { events } = await run(brains.anthropic, textTurn())
    assert.deepEqual(events, [
      { type: 'text', delta: 'Bonjour ' },
      { type: 'text', delta: 'à vous 👋' },
      {
        type: 'done',
        stopReason: 'end',
        usage: { inputTokens: 25, outputTokens: 40 },
        message: { role: 'assistant', content: 'Bonjour à vous 👋', raw: [{ type: 'text', text: 'Bonjour à vous 👋' }] },
      },
    ])
  })

  test('byte-sized chunks (mid-line, mid-character) give the same events', async () => {
    const whole = await run(brains.anthropic, textTurn(), { sizes: [100000] })
    const split = await run(brains.anthropic, textTurn(), { sizes: [1, 2] })
    assert.deepEqual(split.events, whole.events)
    assert.equal(whole.events.at(-1).message.content, 'Bonjour à vous 👋')
  })

  test('thinking with signature, then a tool call with input split across deltas', async () => {
    const sse = ': comment\n\n' + anthropicSSE([
      messageStart(),
      { type: 'ping' },
      blockStart(0, { type: 'thinking', thinking: '', signature: '' }),
      blockDelta(0, { type: 'thinking_delta', thinking: 'The user wants ' }),
      blockDelta(0, { type: 'thinking_delta', thinking: 'a file.' }),
      blockDelta(0, { type: 'signature_delta', signature: 'EqQBCgIYAhIM' }),
      blockStop(0),
      blockStart(1, { type: 'redacted_thinking', data: 'EmwKAhgB' }),
      blockStop(1),
      blockStart(2, { type: 'text', text: '' }),
      blockDelta(2, { type: 'text_delta', text: 'Reading it.' }),
      blockStop(2),
      blockStart(3, { type: 'tool_use', id: 'toolu_1', name: 'read', input: {} }),
      blockDelta(3, { type: 'input_json_delta', partial_json: '' }),
      blockDelta(3, { type: 'input_json_delta', partial_json: '{"path": "ré' }),
      blockDelta(3, { type: 'input_json_delta', partial_json: 'sumé.md"}' }),
      blockStop(3),
      blockStart(4, { type: 'tool_use', id: 'toolu_2', name: 'list', input: {} }),
      blockStop(4),
      messageDelta('tool_use', 99),
      messageStop,
    ])
    const { events } = await run(brains.anthropic, sse)
    const calls = [
      { id: 'toolu_1', name: 'read', args: { path: 'résumé.md' } },
      { id: 'toolu_2', name: 'list', args: {} },
    ]
    assert.deepEqual(events.slice(0, -1), [
      { type: 'thinking', delta: 'The user wants ' },
      { type: 'thinking', delta: 'a file.' },
      { type: 'text', delta: 'Reading it.' },
      ...calls.map((call) => ({ type: 'tool_call', call })),
    ])
    assert.deepEqual(events.at(-1), {
      type: 'done',
      stopReason: 'tool_use',
      usage: { inputTokens: 25, outputTokens: 99 },
      message: {
        role: 'assistant',
        content: 'Reading it.',
        toolCalls: calls,
        raw: [
          { type: 'thinking', thinking: 'The user wants a file.', signature: 'EqQBCgIYAhIM' },
          { type: 'redacted_thinking', data: 'EmwKAhgB' },
          { type: 'text', text: 'Reading it.' },
          { type: 'tool_use', id: 'toolu_1', name: 'read', input: { path: 'résumé.md' } },
          { type: 'tool_use', id: 'toolu_2', name: 'list', input: {} },
        ],
      },
    })
  })

  test('invalid tool input JSON is kept for the agent loop to report', async () => {
    const sse = anthropicSSE([
      messageStart(),
      blockStart(0, { type: 'tool_use', id: 't', name: 'write', input: {} }),
      blockDelta(0, { type: 'input_json_delta', partial_json: '{"text": "unfinished' }),
      blockStop(0),
      messageDelta('max_tokens'),
      messageStop,
    ])
    const done = (await run(brains.anthropic, sse)).events.at(-1)
    assert.equal(done.stopReason, 'max_tokens')
    assert.deepEqual(done.message.toolCalls, [{ id: 't', name: 'write', args: { __invalidJSON: '{"text": "unfinished' } }])
  })

  test('maps stop reasons', async () => {
    const cases = { end_turn: 'end', tool_use: 'tool_use', max_tokens: 'max_tokens', model_context_window_exceeded: 'max_tokens', refusal: 'refusal', pause_turn: 'pause', stop_sequence: 'other' }
    for (const [stop, expected] of Object.entries(cases)) {
      const { events } = await run(brains.anthropic, textTurn(stop))
      assert.equal(events.at(-1).stopReason, expected, stop)
    }
  })

  test('ignores unknown block types and drops non-text blocks declined before a fallback', async () => {
    const sse = anthropicSSE([
      messageStart(),
      blockStart(0, { type: 'thinking', thinking: '', signature: '' }),
      blockDelta(0, { type: 'thinking_delta', thinking: 'hmm' }),
      blockDelta(0, { type: 'signature_delta', signature: 'sig0' }),
      blockStop(0),
      blockStart(1, { type: 'text', text: '' }),
      blockDelta(1, { type: 'text_delta', text: 'Start. ' }),
      blockStop(1),
      blockStart(2, { type: 'tool_use', id: 'declined', name: 'read', input: {} }),
      blockStop(2),
      blockStart(3, { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-5' } }),
      blockStop(3),
      blockStart(4, { type: 'some_future_block', payload: 1 }),
      blockDelta(4, { type: 'some_future_delta', x: 1 }),
      blockStop(4),
      blockStart(5, { type: 'text', text: '' }),
      blockDelta(5, { type: 'text_delta', text: 'Continued.' }),
      blockStop(5),
      messageDelta('end_turn'),
      messageStop,
    ])
    const { events } = await run(brains.anthropic, sse)
    assert.ok(!events.some((e) => e.type === 'tool_call'), 'no tool call from the declined partial')
    assert.deepEqual(events.at(-1).message, {
      role: 'assistant',
      content: 'Start. Continued.',
      raw: [
        { type: 'text', text: 'Start. ' },
        { type: 'text', text: 'Continued.' },
      ],
    })
  })

  test('error events become LLMErrors', async () => {
    const cases = {
      overloaded_error: { code: 'server', retryable: true },
      api_error: { code: 'server', retryable: true },
      rate_limit_error: { code: 'rate_limit', retryable: true },
      authentication_error: { code: 'auth', retryable: false },
      permission_error: { code: 'auth', retryable: false },
      invalid_request_error: { code: 'bad_request', retryable: false },
      mystery_error: { code: 'bad_response', retryable: false },
    }
    for (const [type, expected] of Object.entries(cases)) {
      const sse = anthropicSSE([
        messageStart(),
        blockStart(0, { type: 'text', text: '' }),
        blockDelta(0, { type: 'text_delta', text: 'Hi' }),
        { type: 'error', error: { type, message: `${type} happened` } },
      ])
      await rejectsWith(run(brains.anthropic, sse), { ...expected, message: `${type} happened` })
    }
  })

  test('a stream that ends before message_stop is a network error', async () => {
    const sse = anthropicSSE([messageStart(), blockStart(0, { type: 'text', text: '' }), blockDelta(0, { type: 'text_delta', text: 'Hi' })])
    await rejectsWith(run(brains.anthropic, sse), { code: 'network', retryable: true })
  })

  test('builds the request: URL, headers, thinking, fallbacks, tools', async () => {
    const tools = [{ name: 'read', description: 'Read a file', parameters: { type: 'object', properties: {} } }]
    const { request } = await run(brains.anthropic, textTurn(), { system: 'Be brief.', tools })
    assert.equal(request.url, 'https://api.anthropic.com/v1/messages')
    assert.equal(request.init.method, 'POST')
    assert.deepEqual(request.headers, {
      'content-type': 'application/json',
      'x-api-key': 'sk-test',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    })
    assert.deepEqual(request.body, {
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      stream: true,
      system: [{ type: 'text', text: 'Be brief.', cache_control: { type: 'ephemeral' } }],
      cache_control: { type: 'ephemeral' },
      thinking: { type: 'adaptive', display: 'summarized' },
      fallbacks: 'default',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
      tools: [{ name: 'read', description: 'Read a file', input_schema: { type: 'object', properties: {} }, eager_input_streaming: true }],
    })
  })

  test('thinking and fallbacks depend on the model', async () => {
    const cases = {
      'claude-fable-5-1': [true, true],
      'claude-opus-5-5': [true, true],
      'claude-opus-5': [true, true],
      'claude-sonnet-5-5': [true, true],
      'claude-mythos-5-1': [true, false],
      'claude-sonnet-5': [true, false],
      'claude-opus-4-8': [true, false],
      'claude-sonnet-4-6': [true, false],
      'claude-opus-4-5': [false, false],
      'claude-sonnet-4-5': [false, false],
      'claude-haiku-4-5': [false, false],
    }
    for (const [model, [thinking, fallback]] of Object.entries(cases)) {
      const { request } = await run(anthropicWith(model), textTurn(), { maxTokens: 1000 })
      assert.equal('thinking' in request.body, thinking, `${model} thinking`)
      assert.equal('fallbacks' in request.body, fallback, `${model} fallbacks`)
      assert.equal('anthropic-beta' in request.headers, fallback, `${model} beta header`)
      assert.equal(request.body.max_tokens, 1000)
      assert.ok(!('budget_tokens' in (request.body.thinking ?? {})))
    }
  })

  test('omits system and tools when empty', async () => {
    const { request } = await run(anthropicWith('claude-haiku-4-5'), textTurn())
    assert.deepEqual(Object.keys(request.body).sort(), ['cache_control', 'max_tokens', 'messages', 'model', 'stream'])
  })

  test('converts messages: raw echo, grouped tool results, merged roles', async () => {
    const raw = [
      { type: 'thinking', thinking: 'Plan.', signature: 'sig' },
      { type: 'tool_use', id: 't1', name: 'read', input: { path: 'a' } },
      { type: 'tool_use', id: 't2', name: 'read', input: { path: 'b' } },
    ]
    const messages = [
      { role: 'user', content: 'First.' },
      { role: 'user', content: 'Second.' },
      { role: 'assistant', content: 'Sure.', toolCalls: [{ id: 't0', name: 'list', args: {} }] },
      { role: 'tool', toolCallId: 't0', name: 'list', content: 'a, b' },
      { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'read', args: { path: 'a' } }, { id: 't2', name: 'read', args: { path: 'b' } }], raw },
      { role: 'tool', toolCallId: 't1', name: 'read', content: 'A' },
      { role: 'tool', toolCallId: 't2', name: 'read', content: 'Not found', isError: true },
      { role: 'user', content: 'And?' },
      { role: 'assistant', content: '' },
    ]
    const { request } = await run(brains.anthropic, textTurn(), { messages })
    assert.deepEqual(request.body.messages, [
      { role: 'user', content: [{ type: 'text', text: 'First.' }, { type: 'text', text: 'Second.' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Sure.' }, { type: 'tool_use', id: 't0', name: 'list', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't0', content: 'a, b' }] },
      { role: 'assistant', content: raw },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 't1', content: 'A' },
          { type: 'tool_result', tool_use_id: 't2', content: 'Not found', is_error: true },
          { type: 'text', text: 'And?' },
        ],
      },
    ])
    assert.equal(messages[4].raw.length, 3, 'input raw is not mutated')
  })
})

// ─── Errors ──────────────────────────────────────────────────────────────────

describe('system notes, documents and caching (D46, D49)', () => {
  const doc = { name: 'Report "Q3".pdf', text: '[[page 1]]\nRevenue grew.' }
  const conversation = [
    { role: 'user', content: 'Summarise.', documents: [doc] },
    { role: 'assistant', content: 'It grew.' },
    { role: 'system', content: 'The interface language is now French.' },
    { role: 'user', content: 'Et maintenant ?' },
  ]

  test('Anthropic: native system messages after the next user message, documents as blocks', async () => {
    const { request } = await run(brains.anthropic, textTurn(), { system: 'Be brief.', messages: conversation })
    assert.deepEqual(request.body.messages, [
      { role: 'user', content: [{ type: 'text', text: '<document name="Report  Q3 .pdf">\n[[page 1]]\nRevenue grew.\n</document>' }, { type: 'text', text: 'Summarise.' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'It grew.' }] },
      { role: 'user', content: [{ type: 'text', text: 'Et maintenant ?' }] },
      { role: 'system', content: 'The interface language is now French.' },
    ])
  })

  test('Anthropic: a tagged block on models without mid-conversation system messages', async () => {
    const { request } = await run(anthropicWith('claude-sonnet-5'), textTurn(), { messages: conversation })
    assert.deepEqual(request.body.messages.at(-1), {
      role: 'user',
      content: [{ type: 'text', text: '<system-note>\nThe interface language is now French.\n</system-note>' }, { type: 'text', text: 'Et maintenant ?' }],
    })
  })

  test('OpenAI and OpenRouter take system messages where they fall; local servers get a tagged block', () => {
    const native = openaiMessages('Be brief.', conversation, { systemNotes: true })
    assert.deepEqual(native.map((m) => m.role), ['system', 'user', 'assistant', 'system', 'user'])
    assert.match(native[1].content, /^<document name="Report  Q3 \.pdf">\n\[\[page 1\]\]\nRevenue grew\.\n<\/document>\n\nSummarise\.$/)
    const tagged = openaiMessages(undefined, conversation, { systemNotes: false })
    assert.deepEqual(tagged.map((m) => m.role), ['user', 'assistant', 'user'])
    assert.equal(tagged[2].content, '<system-note>\nThe interface language is now French.\n</system-note>\n\nEt maintenant ?')
  })

  test('chat-template messages keep arguments as objects and name tool results', () => {
    const out = openaiMessages(undefined, [
      { role: 'user', content: 'Go' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'read', args: { file: 'a' } }] },
      { role: 'tool', toolCallId: 'c1', name: 'read', content: 'A' },
    ], { systemNotes: false, argsAsObject: true })
    assert.deepEqual(out[1].tool_calls[0].function.arguments, { file: 'a' })
    assert.equal(out[2].name, 'read')
  })

  test('a picture follows its document: an image_url part, or an Anthropic image block', async () => {
    const picture = { name: 'Screen.png', source: 2, text: '(The picture follows.)', image: { mimeType: 'image/png', data: 'iVBORw0K' } }
    const asked = [{ role: 'user', content: 'What is this?', documents: [doc, picture] }]
    const tag = '<document source="2" name="Screen.png">\n(The picture follows.)\n</document>'
    const [message] = openaiMessages(undefined, asked, { systemNotes: true })
    assert.deepEqual(message.content, [
      { type: 'text', text: '<document name="Report  Q3 .pdf">\n[[page 1]]\nRevenue grew.\n</document>' },
      { type: 'text', text: tag },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0K' } },
      { type: 'text', text: 'What is this?' },
    ])
    const { request } = await run(brains.anthropic, textTurn(), { messages: asked })
    assert.deepEqual(request.body.messages[0].content.slice(1), [
      { type: 'text', text: tag },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0K' } },
      { type: 'text', text: 'What is this?' },
    ])
  })

  test('raw blocks are replayed only to the model that made them', async () => {
    const raw = [{ type: 'thinking', thinking: 'Hm.', signature: 'sig' }, { type: 'text', text: 'Yes.' }]
    const messages = [{ role: 'user', content: 'Q' }, { role: 'assistant', content: 'Yes.', raw, rawModel: 'claude-opus-5-5' }, { role: 'user', content: 'Q2' }]
    const same = await run(brains.anthropic, textTurn(), { messages })
    assert.deepEqual(same.request.body.messages[1].content, raw)
    const other = await run(anthropicWith('claude-sonnet-5-5'), textTurn(), { messages })
    assert.deepEqual(other.request.body.messages[1].content, [{ type: 'text', text: 'Yes.' }])
  })

  test('a stale thinking signature is retried once without the earlier reasoning', async () => {
    const raw = [{ type: 'thinking', thinking: 'Hm.', signature: 'sig' }, { type: 'text', text: 'Yes.' }]
    const messages = [{ role: 'user', content: 'Q' }, { role: 'assistant', content: 'Yes.', raw, rawModel: 'claude-opus-5-5' }, { role: 'user', content: 'Q2' }]
    let n = 0
    const { fetch, calls } = mockFetch(() => (n++ === 0
      ? new Response(JSON.stringify({ error: { message: 'messages.1.content.0: Invalid `signature` in `thinking` block.' } }), { status: 400 })
      : sseResponse(textTurn())()))
    const events = await collect(streamChat({ brain: brains.anthropic, apiKey: 'k', messages, fetch }))
    assert.equal(calls.length, 2)
    assert.deepEqual(calls[1].body.messages[1].content, [{ type: 'text', text: 'Yes.' }])
    assert.equal(events.at(-1).type, 'done')
  })

  test('cache usage: Anthropic counts cached input apart, Usage counts all of it', async () => {
    const start = { type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 900, cache_creation_input_tokens: 50, output_tokens: 1 } } }
    const sse = anthropicSSE([start, blockStart(0, { type: 'text', text: '' }), blockDelta(0, { type: 'text_delta', text: 'Hi' }), messageDelta('end_turn', 7), messageStop])
    const { events } = await run(brains.anthropic, sse)
    assert.deepEqual(events.at(-1).usage, { inputTokens: 960, outputTokens: 7, cacheReadTokens: 900, cacheWriteTokens: 50 })
  })

  test('cache usage: OpenAI reports cached prompt tokens', async () => {
    const sse = openaiSSE([
      { choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 1200, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 1024 } } },
    ])
    const { events } = await run(brains.openai, sse)
    assert.deepEqual(events.at(-1).usage, { inputTokens: 1200, outputTokens: 3, cacheReadTokens: 1024 })
  })

  test('warmCache: max_tokens 0, unstreamed, breakpoint on the last shared block, placeholder after it', async () => {
    const { fetch, calls } = mockFetch(() => new Response(JSON.stringify({ content: [], stop_reason: 'max_tokens', usage: { input_tokens: 3, cache_creation_input_tokens: 4000, output_tokens: 0 } })))
    const big = { name: 'big.pdf', text: 'word '.repeat(4000) }
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi.' },
      { role: 'system', content: 'Today is 2026-10-03.' },
      { role: 'user', content: '', documents: [big] },
    ]
    const usage = await warmCache({ brain: brains.anthropic, apiKey: 'k', system: 'Be brief.', messages, fetch })
    assert.deepEqual(usage, { inputTokens: 4003, outputTokens: 0, cacheWriteTokens: 4000 })
    const body = calls[0].body
    assert.equal(body.max_tokens, 0)
    assert.ok(!('stream' in body) && !('cache_control' in body) && !('fallbacks' in body))
    assert.deepEqual(body.thinking, { type: 'adaptive', display: 'summarized' })
    const last = body.messages.at(-1)
    assert.equal(last.role, 'user')
    assert.deepEqual(last.content.map((b) => [b.type, Boolean(b.cache_control)]), [['text', true], ['text', false]])
    assert.equal(last.content[1].text, '…')
    assert.ok(last.content[0].text.startsWith('<document name="big.pdf">'))
  })

  test('warmCache skips prefixes too small to cache and brains that are not Anthropic', async () => {
    const { fetch, calls } = mockFetch(() => new Response('{}'))
    assert.equal(await warmCache({ brain: brains.anthropic, messages: [{ role: 'user', content: 'Hi' }], fetch }), null)
    assert.equal(await warmCache({ brain: brains.openai, messages: [{ role: 'user', content: 'Hi' }], fetch }), null)
    assert.equal(calls.length, 0)
    assert.equal(minimumCacheable('claude-opus-5-5'), 512)
    assert.equal(minimumCacheable('claude-opus-4-8'), 1024)
    assert.equal(minimumCacheable('claude-haiku-4-5'), 4096)
  })

  test('the device brain is refused by the HTTP adapters', async () => {
    const brain = { id: 'd', provider: 'device', api: 'device', baseURL: '', model: 'gemma' }
    await rejectsWith(collect(streamChat({ brain, messages: [] })), { code: 'bad_request' })
  })
})

describe('errors', () => {
  const statuses = {
    400: ['bad_request', false],
    401: ['auth', false],
    403: ['auth', false],
    404: ['not_found', false],
    413: ['too_long', false],
    418: ['bad_response', false],
    422: ['bad_request', false],
    429: ['rate_limit', true],
    500: ['server', true],
    503: ['server', true],
    529: ['server', true],
  }

  for (const [status, [code, retryable]] of Object.entries(statuses)) {
    test(`HTTP ${status} → ${code}`, async () => {
      const body = JSON.stringify({ type: 'error', error: { type: 'x', message: `Provider says ${status}` } })
      const { fetch } = mockFetch(() => new Response(body, { status: Number(status) }))
      const promise = collect(streamChat({ brain: brains.anthropic, apiKey: 'k', messages: [], fetch }))
      await rejectsWith(promise, { code, retryable, status: Number(status) })
      await promise.catch((error) => assert.match(error.message, new RegExp(`Provider says ${status}`)))
    })
  }

  test('keeps how long the provider asks to wait (Retry-After), in seconds or until a date (D202)', async () => {
    const later = new Date(Date.now() + 30_000).toUTCString()
    for (const [value, expected] of [['7', 7000], [later, 30_000], ['soon', undefined], [null, undefined]]) {
      const headers = value === null ? {} : { 'retry-after': value }
      const { fetch } = mockFetch(() => new Response('{}', { status: 429, headers }))
      await assert.rejects(collect(streamChat({ brain: brains.ollama, messages: [], fetch })), (error) => {
        if (expected === undefined) assert.equal(error.retryAfter, undefined)
        else assert.ok(Math.abs(error.retryAfter - expected) < 1500, `${value} → ${error.retryAfter}`)
        return true
      })
    }
  })

  test('a request past the brain’s window is too long, however the provider says it (D359)', async () => {
    /** @type {[any, number, any][]} */
    const said = [
      [brains.anthropic, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'prompt is too long: 210000 tokens > 200000 maximum' } }],
      [brains.openai, 400, { error: { message: "This model's maximum context length is 128000 tokens. However, your messages resulted in 140000 tokens.", type: 'invalid_request_error', code: 'context_length_exceeded' } }],
      [brains.openai, 400, { error: { code: 400, message: 'The input token count (1100000) exceeds the maximum number of tokens allowed (1048576).', status: 'INVALID_ARGUMENT' } }],
      [brains.ollama, 400, { error: { message: 'the request exceeds the available context size, try increasing it' } }],
      [brains.anthropic, 413, { type: 'error', error: { type: 'request_too_large', message: 'Request exceeds the maximum size' } }],
    ]
    for (const [brain, status, body] of said) {
      const { fetch } = mockFetch(() => Response.json(body, { status }))
      await rejectsWith(collect(streamChat({ brain, apiKey: 'k', messages: [{ role: 'user', content: 'Hi' }], fetch })), { code: 'too_long', retryable: false })
    }
    // OpenRouter says it in the stream too.
    const sse = openaiSSE([{ error: { code: 400, message: "This endpoint's maximum context length is 8192 tokens. However, you requested about 9000 tokens." } }])
    await rejectsWith(run(brains.openrouter, sse), { code: 'too_long' })
    // Anything else wrong with the request stays what it was.
    const { fetch } = mockFetch(() => Response.json({ error: { message: 'messages: field required' } }, { status: 400 }))
    await rejectsWith(collect(streamChat({ brain: brains.openai, apiKey: 'k', messages: [], fetch })), { code: 'bad_request' })
  })

  test('extracts provider messages from different error shapes', async () => {
    const shapes = [
      ['{"error":{"message":"Invalid key","code":401}}', 'Invalid key'],
      ['{"error":"model not found"}', 'model not found'],
      ['{"message":"Nope"}', 'Nope'],
      ['<html>Bad gateway</html>', '<html>Bad gateway</html>'],
    ]
    for (const [body, expected] of shapes) {
      const { fetch } = mockFetch(() => new Response(body, { status: 502 }))
      await assert.rejects(collect(streamChat({ brain: brains.ollama, messages: [], fetch })), (error) => {
        assert.equal(error.message, `HTTP 502: ${expected}`)
        return true
      })
    }
  })

  test('fetch TypeError → cors_or_offline', async () => {
    const fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    // Being offline passes; a refused cross-origin request looks the same to a browser (D202).
    await rejectsWith(collect(streamChat({ brain: brains.anthropic, messages: [], fetch })), { code: 'cors_or_offline', retryable: true })
    await rejectsWith(listModels({ brain: brains.ollama, fetch }), { code: 'cors_or_offline' })
  })

  test('abort before the request → aborted', async () => {
    const { fetch } = mockFetch(sseResponse(textTurn()))
    const controller = new AbortController()
    controller.abort()
    await rejectsWith(collect(streamChat({ brain: brains.anthropic, messages: [], fetch, signal: controller.signal })), { code: 'aborted' })
  })

  test('abort mid-stream → aborted', async () => {
    const controller = new AbortController()
    const fetch = async (url, init) =>
      new Response(
        new ReadableStream({
          start(stream) {
            stream.enqueue(encoder.encode(openaiSSE([{ choices: [{ delta: { content: 'Hello' } }] }]).replace('data: [DONE]\n\n', '')))
            // Like a real fetch: aborting the signal errors the body.
            init.signal.addEventListener('abort', () => stream.error(new DOMException('Aborted', 'AbortError')))
          },
        }),
      )
    const seen = []
    await rejectsWith(
      (async () => {
        for await (const event of streamChat({ brain: brains.ollama, messages: [], fetch, signal: controller.signal })) {
          seen.push(event)
          controller.abort()
        }
      })(),
      { code: 'aborted' },
    )
    assert.deepEqual(seen, [{ type: 'text', delta: 'Hello' }])
  })

  test('a connection dropped mid-stream → network', async () => {
    const fetch = async () =>
      new Response(
        new ReadableStream({
          start(stream) {
            stream.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'))
            stream.error(new TypeError('network error'))
          },
        }),
      )
    await rejectsWith(collect(streamChat({ brain: brains.ollama, messages: [], fetch })), { code: 'network', retryable: true })
  })

  test('missing body → bad_response', async () => {
    const fetch = async () => new Response(null, { status: 200 })
    await rejectsWith(collect(streamChat({ brain: brains.anthropic, messages: [], fetch })), { code: 'bad_response' })
  })

  test('malformed JSON in the stream → bad_response', async () => {
    await rejectsWith(run(brains.ollama, 'data: {not json}\n\n'), { code: 'bad_response' })
  })
})

// ─── listModels ──────────────────────────────────────────────────────────────

describe('listModels', () => {
  test('OpenAI-compatible (OpenRouter): pricing as numbers, provider order kept', async () => {
    const data = [
      { id: 'z/model', name: 'Z Model', context_length: 128000, pricing: { prompt: '0.000003', completion: '0.000015' } },
      { id: 'a/model', name: 'A Model', context_length: 8192, pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text', 'image'], output_modalities: ['image', 'text'] } },
    ]
    const { fetch, calls } = mockFetch(() => Response.json({ data }))
    const models = await listModels({ brain: brains.openrouter, apiKey: 'sk-or', fetch })
    assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/models')
    assert.deepEqual(calls[0].headers, { authorization: 'Bearer sk-or' })
    assert.deepEqual(models, [
      { id: 'z/model', name: 'Z Model', contextLength: 128000, pricing: { prompt: 0.000003, completion: 0.000015 }, input: undefined, output: undefined },
      { id: 'a/model', name: 'A Model', contextLength: 8192, pricing: { prompt: 0, completion: 0 }, input: ['text', 'image'], output: ['image', 'text'] },
    ])
  })

  test('OpenAI-compatible (Ollama): bare ids', async () => {
    const { fetch, calls } = mockFetch(() => Response.json({ object: 'list', data: [{ id: 'qwen3', object: 'model', owned_by: 'library' }] }))
    const models = await listModels({ brain: brains.ollama, fetch })
    assert.equal(calls[0].url, 'http://localhost:11434/v1/models')
    assert.deepEqual(calls[0].headers, {})
    assert.deepEqual(models, [{ id: 'qwen3', name: undefined, contextLength: undefined, pricing: undefined, input: undefined, output: undefined }])
  })

  test('Gemini: models/ dropped from ids, which it answers to bare', async () => {
    const brain = { id: 'g', provider: 'gemini', api: 'openai', baseURL: PROVIDERS.gemini.baseURL, model: '' }
    const { fetch, calls } = mockFetch(() => Response.json({ object: 'list', data: [{ id: 'models/gemini-3.8-flash', object: 'model', owned_by: 'google' }] }))
    const models = await listModels({ brain, apiKey: 'AIza', fetch })
    assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/openai/models')
    assert.equal(models[0].id, 'gemini-3.8-flash')
  })

  test('Gemini: a wrong key, answered with 400, is still a refused key', async () => {
    const brain = { id: 'g', provider: 'gemini', api: 'openai', baseURL: PROVIDERS.gemini.baseURL, model: '' }
    const { fetch } = mockFetch(() => Response.json({ error: { code: 400, message: 'Please pass a valid API key', status: 'INVALID_ARGUMENT' } }, { status: 400 }))
    await rejectsWith(listModels({ brain, apiKey: 'nope', fetch }), { code: 'auth' })
  })

  test('Vertex AI: Google’s own Gemini from its catalogue, named as Chat Completions takes them', async () => {
    const brain = { id: 'v', provider: 'vertex', api: 'openai', baseURL: PROVIDERS.vertex.baseURL.replace('{project}', 'acme'), model: '' }
    const publisherModels = [{ name: 'publishers/google/models/gemini-3.8-flash' }, { name: 'publishers/google/models/imagen-5' }]
    const { fetch, calls } = mockFetch(() => Response.json({ publisherModels }))
    const models = await listModels({ brain, apiKey: 'ya29', fetch })
    assert.equal(calls[0].url, 'https://aiplatform.googleapis.com/v1beta1/publishers/google/models')
    assert.deepEqual(calls[0].headers, { authorization: 'Bearer ya29' })
    assert.deepEqual(models, [{ id: 'google/gemini-3.8-flash' }])
  })

  test('a key is checked where the model list is public, and nowhere else', async () => {
    const huggingface = { id: 'h', provider: 'huggingface', api: 'openai', baseURL: PROVIDERS.huggingface.baseURL, model: '' }
    const refused = mockFetch(() => Response.json({ error: 'Invalid username or password.' }, { status: 401 }))
    await rejectsWith(checkKey({ brain: huggingface, apiKey: 'hf_wrong', fetch: refused.fetch }), { code: 'auth' })
    assert.equal(refused.calls[0].url, 'https://huggingface.co/api/whoami-v2')
    const untouched = mockFetch(() => Response.json({}))
    await checkKey({ brain: brains.openai, apiKey: 'sk', fetch: untouched.fetch })
    assert.equal(untouched.calls.length, 0)
  })

  test('Anthropic', async () => {
    const data = [
      { type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', max_input_tokens: 1000000, created_at: '2026-09-01T00:00:00Z' },
      { type: 'model', id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5', max_input_tokens: 200000 },
    ]
    const { fetch, calls } = mockFetch(() => Response.json({ data, has_more: false }))
    const models = await listModels({ brain: brains.anthropic, apiKey: 'sk-ant', fetch })
    assert.equal(calls[0].url, 'https://api.anthropic.com/v1/models?limit=100')
    assert.deepEqual(calls[0].headers, {
      'x-api-key': 'sk-ant',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    })
    assert.deepEqual(models, [
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', contextLength: 1000000 },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', contextLength: 200000 },
    ])
  })

  test('maps errors the same way, an account out of credits too', async () => {
    const { fetch } = mockFetch(() => Response.json({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }, { status: 401 }))
    await rejectsWith(listModels({ brain: brains.anthropic, apiKey: 'bad', fetch }), { code: 'auth', message: 'HTTP 401: invalid x-api-key' })
    const broke = mockFetch(() => Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } }, { status: 400 }))
    await rejectsWith(collect(streamChat({ brain: brains.anthropic, apiKey: 'sk-ant', messages: [{ role: 'user', content: 'Hi' }], fetch: broke.fetch })), { code: 'credits', retryable: false })
    const wrong = mockFetch(() => Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'messages: field required' } }, { status: 400 }))
    await rejectsWith(collect(streamChat({ brain: brains.anthropic, apiKey: 'sk-ant', messages: [], fetch: wrong.fetch })), { code: 'bad_request' })
    const { fetch: notJSON } = mockFetch(() => new Response('<html></html>', { status: 200 }))
    await rejectsWith(listModels({ brain: brains.ollama, fetch: notJSON }), { code: 'bad_response' })
  })
})
