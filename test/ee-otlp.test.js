// The audit export (D386): Jean's records as OpenTelemetry GenAI spans, and the batches that carry them.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tracer, exporter, attributes } from '../app/ee/otlp.js'
import { removal } from '../app/ui/removal.js'

const TASK = 'projects/01J00000000000000000000001-home/conversations/01J00000000000000000000002.jsonl'
/** @param {string} at @param {any} update @param {number} [step] */
const kept = (at, update, step) => ({ at, by: 'jean', ...(step !== undefined && { step }), update })
/** @param {import('../app/ee/otlp.js').Span} span */
const attrs = (span) => Object.fromEntries(span.attributes.map(({ key, value }) => [key, Object.values(value)[0]]))

/** A collector that answers each request with the next status, then 200. @param {number[]} statuses */
function collector(statuses) {
  /** @type {{ url: string, init: any, body: any }[]} */
  const calls = []
  const fetch = /** @type {typeof globalThis.fetch} */ (/** @type {unknown} */ (async (/** @type {string} */ url, /** @type {any} */ init) => {
    calls.push({ url, init, body: JSON.parse(init.body) })
    return new Response(null, { status: statuses.shift() ?? 200 })
  }))
  return { fetch, calls }
}

/** A turn as Jean keeps it: a request, a brain step that calls a script, the script's own call, and the answer. */
function turn(options = {}) {
  /** @type {import('../app/ee/otlp.js').Span[]} */
  const spans = []
  const follow = tracer({ send: (span) => spans.push(span), serviceOf: (name) => (name === 'crm_search' ? '01JCRM' : undefined), now: () => Date.parse('2026-10-17T10:00:09Z'), ...options })
  const record = (/** @type {any} */ envelope) => follow.record({ task: TASK, type: envelope.update.sessionUpdate, record: envelope })
  record({ at: '2026-10-17T10:00:00Z', by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Who are our top clients?' } } })
  const brain = { toolCallId: 'brain-0-abc', title: 'gpt-5', kind: 'think', rawInput: { provider: 'openai', model: 'gpt-5', local: false } }
  record(kept('2026-10-17T10:00:03Z', { sessionUpdate: 'tool_call', ...brain, status: 'completed', rawOutput: { stopReason: 'tool_use', usage: { inputTokens: 1200, outputTokens: 80, cacheReadTokens: 1000 } }, _meta: { ms: 2500 } }, 0))
  record(kept('2026-10-17T10:00:03Z', { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Search the CRM.' } }, 0))
  record(kept('2026-10-17T10:00:03Z', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Looking.' } }, 0))
  const script = { toolCallId: 'call_1', name: 'run_script', title: 'Run a script', kind: 'execute', rawInput: { code: 'crm_search("top")' } }
  record(kept('2026-10-17T10:00:04Z', { sessionUpdate: 'tool_call', ...script, status: 'in_progress' }, 1))
  record(kept('2026-10-17T10:00:05Z', { sessionUpdate: 'tool_call', toolCallId: 'call_1/a', name: 'crm_search', title: 'Search', kind: 'fetch', rawInput: { q: 'top' }, status: 'completed', rawOutput: 'Acme, Globex', _meta: { parent: 'call_1', ms: 400, by: 'clients', decision: 'ask' } }, 1))
  record(kept('2026-10-17T10:00:06Z', { sessionUpdate: 'tool_call', ...script, status: 'completed', rawOutput: 'Acme, Globex', _meta: { ms: 2000 } }, 1))
  record(kept('2026-10-17T10:00:06Z', { sessionUpdate: 'tool_call', toolCallId: 'call_2', name: 'send_mail', title: 'Send', kind: 'other', rawInput: { to: 'x' }, status: 'failed', rawOutput: 'The user declined this action.', _meta: { declined: true } }, 1))
  follow.end({ task: TASK, at: '2026-10-17T10:00:00Z', answer: 'Acme and Globex.' })
  return spans
}

describe('the tracer', () => {
  test('a turn is one trace: invoke_agent over a chat span per request and an execute_tool span per call', () => {
    const spans = turn()
    assert.deepEqual(spans.map((span) => span.name), ['chat gpt-5', 'execute_tool crm_search', 'execute_tool run_script', 'execute_tool send_mail', 'invoke_agent'])
    const [chat, search, script, mail, root] = spans
    assert.equal(new Set(spans.map((span) => span.traceId)).size, 1)
    assert.match(root.traceId, /^[0-9a-f]{32}$/)
    assert.match(root.spanId, /^[0-9a-f]{16}$/)
    assert.equal(root.parentSpanId, undefined)
    for (const span of [chat, script, mail]) assert.equal(span.parentSpanId, root.spanId)
    // A script's call goes under the script.
    assert.equal(search.parentSpanId, script.spanId)
    assert.deepEqual([chat.kind, script.kind, root.kind], [3, 1, 1])
    // Times from the records: a request's from how long it took, a call's from its start.
    assert.equal(chat.startTimeUnixNano, String(Date.parse('2026-10-17T10:00:00.500Z') * 1e6))
    assert.equal(chat.endTimeUnixNano, String(Date.parse('2026-10-17T10:00:03Z') * 1e6))
    assert.equal(script.startTimeUnixNano, String(Date.parse('2026-10-17T10:00:04Z') * 1e6))
    assert.equal(root.startTimeUnixNano, String(Date.parse('2026-10-17T10:00:00Z') * 1e6))
    assert.equal(root.endTimeUnixNano, String(Date.parse('2026-10-17T10:00:09Z') * 1e6))
  })

  test('metadata in the GenAI conventions, and whose rule decided a call (D308)', () => {
    const [chat, search, script, mail, root] = turn()
    assert.deepEqual(attrs(chat), {
      'gen_ai.operation.name': 'chat', 'gen_ai.provider.name': 'openai', 'gen_ai.request.model': 'gpt-5', 'gen_ai.conversation.id': '01J00000000000000000000002',
      'gen_ai.usage.input_tokens': '1200', 'gen_ai.usage.output_tokens': '80', 'gen_ai.usage.cache_read.input_tokens': '1000',
      'gen_ai.response.finish_reasons': { values: [{ stringValue: 'tool_call' }] }, 'jean.brain.local': false,
    })
    assert.deepEqual(attrs(search), {
      'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': 'crm_search', 'gen_ai.tool.call.id': 'call_1/a', 'gen_ai.tool.type': 'extension',
      'gen_ai.conversation.id': '01J00000000000000000000002', 'jean.tool.kind': 'fetch', 'jean.tool.service': '01JCRM', 'jean.decision': 'ask', 'jean.decided_by': 'clients',
    })
    assert.equal(attrs(script)['gen_ai.tool.type'], 'function')
    // Declined is no error.
    assert.equal(attrs(mail)['jean.declined'], true)
    assert.deepEqual(mail.status, { code: 1 })
    assert.deepEqual(attrs(root), { 'gen_ai.operation.name': 'invoke_agent', 'gen_ai.conversation.id': '01J00000000000000000000002', 'gen_ai.agent.id': '01J00000000000000000000001' })
  })

  test('content stays out unless asked for', () => {
    for (const span of turn()) for (const key of ['gen_ai.input.messages', 'gen_ai.output.messages', 'gen_ai.tool.call.arguments', 'gen_ai.tool.call.result']) assert.ok(!(key in attrs(span)), `${span.name} ${key}`)
    const [chat, search, , mail, root] = turn({ content: true })
    assert.deepEqual(JSON.parse(String(attrs(chat)['gen_ai.output.messages'])), [{ role: 'assistant', parts: [{ type: 'reasoning', content: 'Search the CRM.' }, { type: 'text', content: 'Looking.' }], finish_reason: 'tool_call' }])
    assert.deepEqual(JSON.parse(String(attrs(search)['gen_ai.tool.call.arguments'])), { q: 'top' })
    assert.equal(attrs(search)['gen_ai.tool.call.result'], 'Acme, Globex')
    assert.equal(attrs(mail)['gen_ai.tool.call.result'], 'The user declined this action.')
    assert.deepEqual(JSON.parse(String(attrs(root)['gen_ai.input.messages'])), [{ role: 'user', parts: [{ type: 'text', content: 'Who are our top clients?' }] }])
    assert.deepEqual(JSON.parse(String(attrs(root)['gen_ai.output.messages'])), [{ role: 'assistant', parts: [{ type: 'text', content: 'Acme and Globex.' }], finish_reason: 'stop' }])
  })

  test('a failed request is an error; going back to a request says how many records went', () => {
    /** @type {import('../app/ee/otlp.js').Span[]} */
    const spans = []
    const follow = tracer({ send: (span) => spans.push(span) })
    follow.record({ task: TASK, type: 'tool_call', record: kept('2026-10-17T10:00:03Z', { sessionUpdate: 'tool_call', toolCallId: 'brain-0-x', kind: 'think', rawInput: { provider: 'custom', model: 'corp' }, status: 'failed', rawOutput: { error: 'Unauthorized', code: 'auth', status: 401 }, _meta: { ms: 100 } }, 0) })
    follow.record({ task: TASK, type: 'removed', records: [kept('2026-10-17T10:00:00Z', {}), kept('2026-10-17T10:00:01Z', {})] })
    assert.deepEqual(spans[0].status, { code: 2, message: 'Unauthorized' })
    assert.equal(attrs(spans[0])['error.type'], 'auth')
    assert.equal(attrs(spans[0])['gen_ai.provider.name'], 'custom')
    assert.equal(spans[1].name, 'remove_records')
    assert.equal(attrs(spans[1])['jean.records.removed'], '2')
  })

  test('a task deleted, alone or with its project, is a removal of its own, and so is a profile, by its id alone (D412)', () => {
    /** @type {import('../app/ee/otlp.js').Span[]} */
    const spans = []
    const follow = tracer({ send: (span) => spans.push(span), now: () => Date.parse('2026-10-17T10:00:09Z') })
    const records = [kept('2026-10-17T10:00:00Z', {}), kept('2026-10-17T10:00:01Z', {}), kept('2026-10-17T10:00:02Z', {})]
    // Told on record once each is gone: what going back to a request left out, a task, a profile.
    follow.record({ task: TASK, type: 'removed', records: records.slice(1) })
    follow.record({ task: TASK, type: 'removed', records, all: true })
    follow.record({ type: 'removed', profile: 'profiles/01J00000000000000000000003-work' })
    assert.deepEqual(spans.map((span) => span.name), ['remove_records', 'remove_records', 'remove_profile'])
    const [back, deleted, profile] = spans
    assert.deepEqual(attrs(back), { 'gen_ai.conversation.id': '01J00000000000000000000002', 'gen_ai.agent.id': '01J00000000000000000000001', 'jean.records.removed': '2', 'jean.removed.all': false })
    assert.deepEqual(attrs(deleted), { 'gen_ai.conversation.id': '01J00000000000000000000002', 'gen_ai.agent.id': '01J00000000000000000000001', 'jean.records.removed': '3', 'jean.removed.all': true })
    assert.deepEqual(attrs(profile), { 'jean.profile.id': '01J00000000000000000000003' })
    // Each a moment, a trace of its own.
    assert.equal(new Set(spans.map((span) => span.traceId)).size, 3)
    for (const span of spans) {
      assert.equal(span.parentSpanId, undefined)
      assert.equal(span.startTimeUnixNano, String(Date.parse('2026-10-17T10:00:09Z') * 1e6))
      assert.equal(span.endTimeUnixNano, span.startTimeUnixNano)
    }
  })

  test('a request sent while the brain works stays in its turn', () => {
    /** @type {import('../app/ee/otlp.js').Span[]} */
    const spans = []
    const follow = tracer({ send: (span) => spans.push(span) })
    const user = (/** @type {Record<string, unknown>} */ meta) => follow.record({ task: TASK, type: 'user_message_chunk', record: { at: '2026-10-17T10:00:00Z', by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Hi' }, _meta: meta } } })
    user({})
    follow.record({ task: TASK, type: 'tool_call', record: kept('2026-10-17T10:00:01Z', { sessionUpdate: 'tool_call', toolCallId: 'a', name: 'read', kind: 'read', status: 'completed', rawOutput: '' }, 0) })
    user({ steer: true })
    follow.record({ task: TASK, type: 'tool_call', record: kept('2026-10-17T10:00:02Z', { sessionUpdate: 'tool_call', toolCallId: 'b', name: 'read', kind: 'read', status: 'completed', rawOutput: '' }, 1) })
    follow.end({ task: TASK, at: '2026-10-17T10:00:00Z' })
    assert.equal(new Set(spans.map((span) => span.traceId)).size, 1)
  })
})

describe('removals, as Jean asks and tells them (D412)', () => {
  test('a project whose deletion retention refuses partway reaches the collector not at all; a task deleted, once it is gone', async () => {
    const { fetch, calls } = collector([])
    const out = exporter({ endpoint: 'https://otel', resource: () => ({}), fetch, every: 60_000 })
    const follow = tracer({ send: out.add })
    // As ee/audit.js and ee/retention.js hook them, retention unable to keep the project's second task.
    /** @type {import('../app/core/hooks.js').Hook[]} */
    const hooks = [
      { on: 'record', tier: 'policy', run: (e, next) => { follow.record(e); return next(e) } },
      { on: 'remove', tier: 'policy', run: (e, next) => (e.task.endsWith('3.jsonl') ? { refuse: 'No copy could be kept.' } : next(e)) },
    ]
    const tasks = ['2', '3'].map((last) => ({ task: TASK.replace(/2\.jsonl$/, `${last}.jsonl`), all: true }))
    const read = async () => [kept('2026-10-17T10:00:00Z', {}), kept('2026-10-17T10:00:01Z', {})]
    let gone = 0
    const act = async () => { gone++ }
    assert.equal(await removal(hooks, tasks, act, read), 'No copy could be kept.')
    await out.flush()
    assert.equal(gone, 0)
    assert.equal(calls.length, 0)
    assert.equal(await removal(hooks, tasks.slice(0, 1), act, read), undefined)
    await out.flush()
    assert.equal(gone, 1)
    const spans = calls.flatMap(({ body }) => body.resourceSpans[0].scopeSpans[0].spans)
    assert.deepEqual(spans.map((/** @type {any} */ span) => span.name), ['remove_records'])
    assert.deepEqual(attrs(spans[0]), { 'gen_ai.conversation.id': '01J00000000000000000000002', 'gen_ai.agent.id': '01J00000000000000000000001', 'jean.records.removed': '2', 'jean.removed.all': true })
  })
})

describe('the exporter', () => {
  const span = (/** @type {string} */ name) => /** @type {any} */ ({ name, traceId: '0'.repeat(32), spanId: '0'.repeat(16), kind: 1, startTimeUnixNano: '0', endTimeUnixNano: '0', attributes: [], status: { code: 1 } })
  const resource = () => ({ 'service.name': 'jean', 'device.id': '01JDEVICE', 'user.email': 'ana@acme.example' })

  test('OTLP/HTTP JSON, with the resource and the credentials', async () => {
    const { fetch, calls } = collector([200])
    const out = exporter({ endpoint: 'https://otel.acme.example/v1/traces', resource, headers: async () => ({ authorization: 'Bearer t' }), fetch, every: 60_000 })
    out.add(span('a'))
    out.add(span('b'))
    await out.flush()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://otel.acme.example/v1/traces')
    assert.deepEqual({ ...calls[0].init.headers }, { 'content-type': 'application/json', authorization: 'Bearer t' })
    assert.deepEqual(calls[0].body.resourceSpans[0].resource.attributes, attributes(resource()))
    assert.deepEqual(calls[0].body.resourceSpans[0].scopeSpans[0].scope, { name: 'jean' })
    assert.deepEqual(calls[0].body.resourceSpans[0].scopeSpans[0].spans.map((/** @type {any} */ one) => one.name), ['a', 'b'])
    assert.equal(out.waiting, 0)
  })

  test('refused for now, a batch waits for the next; refused for good, it goes', async () => {
    const { fetch, calls } = collector([503, 200, 400])
    const out = exporter({ endpoint: 'https://otel', resource, fetch, every: 60_000 })
    out.add(span('a'))
    await out.flush()
    assert.equal(out.waiting, 1)
    out.add(span('b'))
    await out.flush()
    assert.deepEqual(calls[1].body.resourceSpans[0].scopeSpans[0].spans.map((/** @type {any} */ one) => one.name), ['a', 'b'])
    out.add(span('c'))
    await out.flush()
    assert.equal(out.waiting, 0)
    // Unreachable is as refused for now.
    const down = exporter({ endpoint: 'https://otel', resource, fetch: async () => { throw new TypeError('Failed to fetch') }, every: 60_000 })
    down.add(span('d'))
    await down.flush()
    assert.equal(down.waiting, 1)
    await down.flush(true)
  })

  test('as many as it keeps, the oldest let go; many at once go at once', async () => {
    const { fetch, calls } = collector([])
    const out = exporter({ endpoint: 'https://otel', resource, fetch, every: 60_000, max: 3 })
    for (const name of ['a', 'b', 'c', 'd', 'e']) out.add(span(name))
    assert.equal(out.waiting, 3)
    await out.flush()
    assert.deepEqual(calls[0].body.resourceSpans[0].scopeSpans[0].spans.map((/** @type {any} */ one) => one.name), ['c', 'd', 'e'])
    const soon = exporter({ endpoint: 'https://otel', resource, fetch, every: 60_000, batch: 2 })
    soon.add(span('f'))
    soon.add(span('g'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(calls.length, 2)
    assert.equal(soon.waiting, 0)
  })

  test('leaving sends what fits in a keepalive request, with the credentials it has', async () => {
    const { fetch, calls } = collector([])
    const out = exporter({ endpoint: 'https://otel', resource, headers: async () => ({ authorization: 'Bearer t' }), fetch, every: 60_000 })
    const big = { ...span('big'), attributes: attributes({ text: 'x'.repeat(25_000) }) }
    for (let i = 0; i < 4; i++) out.add(big)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await out.flush(true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].init.keepalive, true)
    assert.equal(calls[0].init.headers.authorization, 'Bearer t')
    assert.ok(calls[0].init.body.length < 64 * 1024)
    assert.equal(calls[0].body.resourceSpans[0].scopeSpans[0].spans.length, 2)
    assert.equal(out.waiting, 2)
    await out.flush()
  })
})
