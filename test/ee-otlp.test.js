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
  const follow = tracer({ send: (span) => spans.push(span), serviceOf: (name) => (name === 'crm_search' ? { id: '01JCRM', address: 'crm.acme.example' } : undefined), now: () => Date.parse('2026-10-17T10:00:09Z'), ...options })
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
      'gen_ai.conversation.id': '01J00000000000000000000002', 'jean.tool.kind': 'fetch', 'jean.tool.service': '01JCRM', 'server.address': 'crm.acme.example',
      'jean.decision': 'ask', 'jean.decided_by': 'clients',
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

  test('a failed request is an error, its words only with content; going back to a request says how many records went', () => {
    /** @type {import('../app/ee/otlp.js').Span[]} */
    const spans = []
    const failed = (/** @type {ReturnType<typeof tracer>} */ follow) => follow.record({ task: TASK, type: 'tool_call', record: kept('2026-10-17T10:00:03Z', { sessionUpdate: 'tool_call', toolCallId: 'brain-0-x', kind: 'think', rawInput: { provider: 'custom', model: 'corp' }, status: 'failed', rawOutput: { error: 'No mailbox for ada@acme.example', code: 'auth', status: 401 }, _meta: { ms: 100 } }, 0) })
    const follow = tracer({ send: (span) => spans.push(span) })
    failed(follow)
    follow.record({ task: TASK, type: 'removed', records: [kept('2026-10-17T10:00:00Z', {}), kept('2026-10-17T10:00:01Z', {})] })
    failed(tracer({ send: (span) => spans.push(span), content: true }))
    // A tool's or a server's words may name anyone (D427).
    assert.deepEqual(spans[0].status, { code: 2 })
    assert.deepEqual(spans[2].status, { code: 2, message: 'No mailbox for ada@acme.example' })
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

describe('skills, connections, routines and what is taken away (D421)', () => {
  const ROUTINE = 'projects/01J00000000000000000000001-home/routines/01J00000000000000000000005.md'
  /** @param {any} data */
  const note = (data) => ({ at: '2026-10-17T10:00:00Z', by: 'jean', update: { sessionUpdate: '_system_note', text: '…', data } })
  /** @param {string} text */
  const asked = (text) => ({ at: '2026-10-17T10:00:00Z', by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } } })
  /** @param {string} id @param {string} name @param {string} [status] */
  const read = (id, name, status = 'completed') => kept('2026-10-17T10:00:02Z', { sessionUpdate: 'tool_call', toolCallId: id, name: 'skill', kind: 'read', rawInput: { name }, status, rawOutput: '' }, 0)
  function follow(options = {}) {
    /** @type {import('../app/ee/otlp.js').Span[]} */
    const spans = []
    const tracing = tracer({ send: (span) => spans.push(span), now: () => Date.parse('2026-10-17T10:00:09Z'), ...options })
    return { spans, tracing, record: (/** @type {any} */ envelope, task = TASK) => tracing.record({ task, type: envelope.update.sessionUpdate, record: envelope }) }
  }

  test('each skill used is a span in its turn: read by the brain under its call, named with / or followed by a mode of the box under the turn', () => {
    const { spans, tracing, record } = follow()
    record(note({ kind: 'mentions', words: ['/weekly-report', '/Notion'], skills: ['weekly-report'] }))
    record(note({ kind: 'mode', mode: 'visual-answers' }))
    record(asked('/weekly-report for Notion'))
    // The brain's name, its underscores read as hyphens (D406); a file beside the steps, or a skill there isn't, is no use of one.
    record(read('call_1', 'process_improvement'))
    record(read('call_2', 'weekly-report/forms.md'))
    record(read('call_3', 'nowhere', 'failed'))
    tracing.end({ task: TASK, at: '2026-10-17T10:00:00Z' })
    const root = /** @type {import('../app/ee/otlp.js').Span} */ (spans.find((span) => span.name === 'invoke_agent'))
    const call = spans.find((span) => attrs(span)['gen_ai.tool.call.id'] === 'call_1')
    const uses = spans.filter((span) => span.name === 'use_skill')
    assert.deepEqual(uses.map(attrs), [
      { 'gen_ai.conversation.id': '01J00000000000000000000002', 'jean.skill.name': 'process-improvement', 'jean.skill.via': 'call' },
      { 'gen_ai.conversation.id': '01J00000000000000000000002', 'jean.skill.name': 'weekly-report', 'jean.skill.via': 'name' },
      { 'gen_ai.conversation.id': '01J00000000000000000000002', 'jean.skill.name': 'visual-answers', 'jean.skill.via': 'mode' },
    ])
    assert.deepEqual(uses.map((span) => span.parentSpanId), [call?.spanId, root.spanId, root.spanId])
    for (const span of uses) assert.equal(span.traceId, root.traceId)
    // Named in the box, at its request's time.
    assert.equal(uses[1].startTimeUnixNano, String(Date.parse('2026-10-17T10:00:00Z') * 1e6))
    // The next turn names none.
    record(asked('Thanks'))
    tracing.end({ task: TASK, at: '2026-10-17T10:00:10Z' })
    assert.equal(spans.filter((span) => span.name === 'use_skill').length, 3)
  })

  test('a routine’s run says which routine it is and what set it off; a later turn in its task, only that it is one', () => {
    const { spans, tracing, record } = follow()
    const run = (/** @type {Record<string, unknown>} */ data, task = TASK) => {
      record(note({ kind: 'routine', routine: ROUTINE, title: 'Weekly report', due: '2026-10-17T10:00:00Z', ...data }), task)
      record(asked('The weekly report'), task)
      tracing.end({ task, at: '2026-10-17T10:00:00Z', routine: ROUTINE })
    }
    run({})
    run({ asked: true }, TASK.replace(/2\.jsonl$/, '3.jsonl'))
    run({ file: 'invoice.pdf' }, TASK.replace(/2\.jsonl$/, '4.jsonl'))
    record(asked('And last week?'))
    tracing.end({ task: TASK, at: '2026-10-17T10:00:10Z', routine: ROUTINE })
    assert.deepEqual(spans.map(attrs).map((given) => [given['jean.routine'], given['jean.routine.id'], given['jean.routine.trigger']]), [
      [true, '01J00000000000000000000005', 'schedule'], [true, '01J00000000000000000000005', 'person'], [true, '01J00000000000000000000005', 'file'], [true, undefined, undefined],
    ])
  })

  test('what was done outside the records is a span of its own named for it, its file by its id, its host alone, its title only with content', () => {
    const { spans, tracing } = follow()
    tracing.act({ type: 'skill.add', name: 'weekly-report', source: 'elsewhere', address: 'raw.githubusercontent.com', digest: 'sha256-abc' })
    tracing.act({ type: 'routine.add', path: ROUTINE, title: 'Weekly report', every: 'week' })
    tracing.act({ type: 'connection.remove', id: '01JCRM', address: 'crm.acme.example' })
    tracing.act({ type: 'answer.save', task: TASK, format: 'docx' })
    tracing.act({ type: 'nothing' })
    assert.deepEqual(spans.map((span) => span.name), ['add_skill', 'add_routine', 'remove_connection', 'save_answer'])
    assert.deepEqual(spans.map(attrs), [
      { 'jean.skill.name': 'weekly-report', 'jean.skill.source': 'elsewhere', 'server.address': 'raw.githubusercontent.com', 'jean.skill.digest': 'sha256-abc' },
      { 'jean.routine.id': '01J00000000000000000000005', 'jean.routine.every': 'week' },
      { 'jean.connection.id': '01JCRM', 'server.address': 'crm.acme.example' },
      { 'gen_ai.conversation.id': '01J00000000000000000000002', 'gen_ai.agent.id': '01J00000000000000000000001', 'jean.answer.format': 'docx' },
    ])
    for (const span of spans) {
      assert.equal(span.parentSpanId, undefined)
      assert.equal(span.startTimeUnixNano, String(Date.parse('2026-10-17T10:00:09Z') * 1e6))
    }
    assert.equal(new Set(spans.map((span) => span.traceId)).size, 4)
    const told = follow({ content: true })
    told.tracing.act({ type: 'routine.add', path: ROUTINE, title: 'Weekly report', every: 'week' })
    assert.equal(attrs(told.spans[0])['jean.routine.title'], 'Weekly report')
  })

  test('done in a task while its turn is under way, it is in the turn', () => {
    const { spans, tracing, record } = follow()
    record(asked('Save this as a skill'))
    tracing.act({ type: 'skill.add', task: TASK, name: 'weekly-report', source: 'made' })
    tracing.end({ task: TASK, at: '2026-10-17T10:00:00Z' })
    const [added, root] = spans
    assert.equal(added.name, 'add_skill')
    assert.equal(added.traceId, root.traceId)
    assert.equal(added.parentSpanId, root.spanId)
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

describe('a tamper-evident stream (D675)', async () => {
  const { chain, sha256, verify, FIRST, signer, signed } = await import('../app/ee/chain.js')
  const { createHash } = await import('node:crypto')
  const { attributes: attrsOf } = await import('../app/ee/otlp.js')
  /** @param {string} name @returns {import('../app/ee/otlp.js').Span} */
  const span = (name) => ({ traceId: 'a'.repeat(32), spanId: name.padEnd(16, '0'), name, kind: 1, startTimeUnixNano: '1', endTimeUnixNano: '2', attributes: attrsOf({ 'gen_ai.tool.name': name, 'jean.declined': false, 'gen_ai.usage.input_tokens': 7 }), status: { code: 1 } })

  test('SHA-256 is SHA-256, of any length and in any script', () => {
    for (const text of ['', 'abc', 'é'.repeat(55), 'x'.repeat(56), 'y'.repeat(64), '日本語'.repeat(1000)]) assert.equal(sha256(text), createHash('sha256').update(text).digest('hex'), text.slice(0, 8))
  })

  test('each span has its place, once, as a copy nothing changes later', () => {
    const line = chain()
    const first = span('one')
    const placed = line.link(first)
    assert.equal(line.link(placed), placed)
    assert.equal(attrs(placed)['jean.audit.prev'], FIRST)
    assert.equal(attrs(placed)['jean.audit.seq'], '0')
    assert.equal(attrs(line.link(span('two')))['jean.audit.prev'], attrs(placed)['jean.audit.hash'])
    first.attributes.push({ key: 'later', value: { stringValue: 'x' } })
    assert.equal(verify([placed]).problems.length, 0)
  })

  test('a chain starts where the last ended', () => {
    const kept = new Map()
    const store = { getItem: (/** @type {string} */ key) => kept.get(key) ?? null, setItem: (/** @type {string} */ key, /** @type {string} */ value) => { kept.set(key, value) } }
    const end = attrs(chain({ store }).link(span('one')))['jean.audit.hash']
    assert.equal(attrs(chain({ store }).link(span('two')))['jean.audit.prev'], end)
  })

  test('whatever order a collector keeps, a whole copy holds; changed, removed or put in, it shows', () => {
    const line = chain()
    const spans = ['one', 'two', 'three', 'four'].map((name) => line.link(span(name)))
    assert.deepEqual(verify(spans), { chains: 1, spans: 4, unlinked: 0, dropped: 0, problems: [] })
    assert.deepEqual(verify([spans[2], spans[0], spans[3], spans[1]]).problems, [])
    const shuffled = spans.map((one) => ({ ...one, attributes: [...one.attributes].reverse() }))
    assert.deepEqual(verify(shuffled).problems, [])
    assert.match(verify([spans[0], spans[1], spans[3]]).problems.join(), /1 missing before 3/)
    const changed = structuredClone(spans)
    changed[1].attributes.find((/** @type {any} */ one) => one.key === 'gen_ai.tool.name').value.stringValue = 'another'
    assert.match(verify(changed).problems.join(), /1 was changed/)
    const declined = structuredClone(spans)
    declined[2].attributes.find((/** @type {any} */ one) => one.key === 'jean.declined').value.boolValue = true
    assert.match(verify(declined).problems.join(), /2 was changed/)
    // Rewritten with a hash of its own, it no longer follows what came before, or leads to what comes after.
    const forged = structuredClone(spans)
    const hash = forged[1].attributes.find((/** @type {any} */ one) => one.key === 'jean.audit.hash')
    hash.value.stringValue = sha256(`${attrs(forged[1])['jean.audit.prev']}\nforged`)
    assert.ok(verify(forged).problems.length > 0)
    assert.equal(verify([...spans, span('unplaced')]).unlinked, 1)
  })

  test('an exporter places what it sends, says what it let go, and signs where each batch ends', async () => {
    const { fetch, calls } = collector([])
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
    const signs = await signer(keys)
    const out = exporter({ endpoint: 'https://otel.example/v1/traces', resource: () => ({ 'service.name': 'jean' }), fetch, max: 2, every: 1_000_000, chain: chain(),
      prove: async (tip) => ({ 'jean.audit.tip': tip, 'jean.audit.signature': await signs.sign(tip), 'jean.audit.key': signs.key }) })
    for (const name of ['one', 'two', 'three']) out.add(span(name))
    await out.flush()
    const [batch] = calls[0].body.resourceSpans
    const spans = batch.scopeSpans[0].spans
    assert.deepEqual(spans.map((/** @type {any} */ one) => one.name), ['two', 'three'])
    assert.equal(attrs(spans[0])['jean.audit.dropped'], '1')
    assert.deepEqual(verify(spans), { chains: 1, spans: 2, unlinked: 0, dropped: 1, problems: [] })
    const resource = Object.fromEntries(batch.resource.attributes.map((/** @type {any} */ one) => [one.key, Object.values(one.value)[0]]))
    assert.equal(resource['jean.audit.tip'], attrs(spans[1])['jean.audit.hash'])
    assert.equal(await signed({ tip: resource['jean.audit.tip'], signature: resource['jean.audit.signature'], key: resource['jean.audit.key'] }), true)
    assert.equal(await signed({ tip: 'another', signature: resource['jean.audit.signature'], key: resource['jean.audit.key'] }), false)
    assert.ok(!resource['jean.audit.key'].includes('"d"'))
  })

  test('a batch refused for now goes again unchanged', async () => {
    const { fetch, calls } = collector([503])
    const out = exporter({ endpoint: 'https://otel.example/v1/traces', resource: () => ({}), fetch, every: 1_000_000, chain: chain() })
    out.add(span('one'))
    await out.flush()
    await out.flush()
    assert.deepEqual(calls[0].body.resourceSpans[0].scopeSpans[0].spans, calls[1].body.resourceSpans[0].scopeSpans[0].spans)
  })

  test('a copy rewritten whole, its hashes made again, shows under a pinned key, and with none says nobody vouches for it', async () => {
    const { report } = await import('../app/ee/verify.js')
    const keysOf = () => crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
    const [mine, theirs] = [await signer(await keysOf()), await signer(await keysOf())]
    const line = chain({ id: 'forged-chain' })
    const spans = ['changed', 'history'].map((name) => line.link(span(name)))
    const tip = String(attrs(spans[1])['jean.audit.hash'])
    const body = (/** @type {Record<string, string>} */ proof) => JSON.stringify({ resourceSpans: [{ resource: { attributes: attrsOf(proof) }, scopeSpans: [{ spans }] }] })
    // No signature at all, or one by a key of the forger's: it holds together, which says nothing.
    assert.equal((await report(body({}))).pinned, false)
    assert.match((await report(body({}), { keys: [mine.key] })).problems.join(), /no signature by a pinned key/)
    const forged = body({ 'jean.audit.tip': tip, 'jean.audit.signature': await theirs.sign(tip), 'jean.audit.key': theirs.key })
    assert.deepEqual((await report(forged)).problems, [])
    assert.match((await report(forged, { keys: [mine.key] })).problems.join(), /signed by a key not pinned/)
  })

  test('a chain removed from the middle, or what no signature reaches before one that does, shows', async () => {
    const { report } = await import('../app/ee/verify.js')
    const signs = await signer(await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']))
    const kept = new Map()
    const store = { getItem: (/** @type {string} */ key) => kept.get(key) ?? null, setItem: (/** @type {string} */ key, /** @type {string} */ value) => { kept.set(key, value) } }
    const loads = await Promise.all(['one', 'two', 'three'].map(async (name) => {
      const line = chain({ store, id: `chain-${name}` })
      return [line.link(span(`${name}-a`)), line.link(span(`${name}-b`))]
    }))
    const batch = async (/** @type {any[]} */ held, signedToo = true) => {
      const tip = String(attrs(held.at(-1))['jean.audit.hash'])
      return JSON.stringify({ resourceSpans: [{ resource: { attributes: attrsOf(signedToo ? { 'jean.audit.tip': tip, 'jean.audit.signature': await signs.sign(tip), 'jean.audit.key': signs.key } : {}) }, scopeSpans: [{ spans: held }] }] })
    }
    const all = await Promise.all(loads.map((held) => batch(held)))
    const chainAfter = () => [chain({ store, id: 'chain-four' }).link(span('four-a'))]
    const keys = { keys: [signs.key] }
    assert.deepEqual((await report(all.join('\n'), keys)).problems, [])
    // Across page loads, a later signature reaches an earlier chain sent as a page left.
    assert.deepEqual((await report([await batch(loads[0], false), all[1], all[2]].join('\n'), keys)).problems, [])
    assert.match((await report([all[0], all[2]].join('\n'), keys)).problems.join(), /chain-three: what came before it is gone/)
    // A chain removed, and the proofs of the one after it taken away, shows all the same.
    assert.match((await report([all[0], await batch(loads[2], false), await batch(chainAfter(), true)].join('\n'), keys)).problems.join(), /chain-three: what came before it is gone/)
    // What no signature reaches is only counted, a short visit's too: it proves nothing, and nothing says it was changed.
    const open = await report([all[0], await batch(loads[1], false), await batch(loads[2], false)].join('\n'), keys)
    assert.deepEqual([open.problems, open.unsigned], [[], 4])
    // A copy of a later period begins partway, which it says.
    const later = await report([all[1], all[2]].join('\n'), keys)
    assert.deepEqual([later.problems, later.begins], [[], 1])
    const cut = await report([all[0], all[1], await batch([loads[2][0]]).then((one) => one.replace(String(attrs(loads[2][0])['jean.audit.hash']), 'f'.repeat(64)))].join('\n'), keys)
    assert.ok(cut.problems.length > 0)
  })

  test('a list’s value hashes the same whether a collector keeps an empty one’s items or not', () => {
    const line = chain()
    const placed = line.link({ ...span('one'), attributes: attrsOf({ 'jean.none': /** @type {string[]} */ ([]), 'jean.some': ['a', 'b'] }) })
    assert.deepEqual(verify([placed]).problems, [])
    const kept = structuredClone(placed)
    delete kept.attributes.find((/** @type {any} */ one) => one.key === 'jean.none').value.arrayValue.values
    assert.deepEqual(verify([kept]).problems, [])
  })

  test('a collector’s file is checked as a whole, and says so when it isn’t', async () => {
    const { report, batches } = await import('../app/ee/verify.js')
    const line = chain()
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
    const signs = await signer(keys)
    const spans = ['one', 'two'].map((name) => line.link(span(name)))
    const tip = String(attrs(spans[1])['jean.audit.hash'])
    const batch = (/** @type {any[]} */ held, signature = '') => JSON.stringify({ resourceSpans: [{ resource: { attributes: attrsOf({ 'jean.audit.tip': tip, 'jean.audit.signature': signature, 'jean.audit.key': signs.key }) }, scopeSpans: [{ spans: held }] }] })
    const good = batch(spans, await signs.sign(tip))
    assert.equal(batches(`${good}\n${good}\n`).length, 2)
    const whole = await report(good)
    assert.deepEqual([whole.spans, whole.proofs, whole.keys, whole.unsigned, whole.pinned, whole.problems], [2, 1, [signs.key], 0, false, []])
    assert.deepEqual((await report(`${good}\n${good}\n`)).problems, [], 'a batch sent twice, after an answer lost on the way')
    assert.deepEqual((await report(good, { keys: [signs.key] })).problems, [])
    assert.match((await report(batch([spans[1]], await signs.sign(tip)))).problems.join(), /1 missing before 1/)
    assert.match((await report(batch(spans, await signs.sign('another')))).problems.join(), /signature doesn't hold/)
    assert.match((await report(batch([spans[0]], await signs.sign(tip)))).problems.join(), /on no span here/)
    assert.match((await report(batch([...spans, span('unplaced')], await signs.sign(tip)))).problems.join(), /1 spans have no place/)
    assert.match((await report('')).problems.join(), /holds no span/)
  })
})
