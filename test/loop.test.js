import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runTurn } from '../core/loop.js'
import { toChatMessages, userRecord } from '../core/events.js'

const brain = { id: 'b', provider: /** @type {const} */ ('custom'), api: /** @type {const} */ ('openai'), baseURL: 'http://x', model: 'test-model' }

/** A fake brain: one scripted list of events per model call. @param {any[][]} script */
function fakeStream(script) {
  /** @type {any[]} */
  const calls = []
  /** @param {any} request */
  async function* stream(request) {
    calls.push(structuredClone(request.messages))
    for (const event of script[calls.length - 1]) yield event
  }
  return { stream, calls }
}

const done = (/** @type {any} */ stopReason, /** @type {any} */ message) => ({ type: 'done', stopReason, usage: { inputTokens: 10, outputTokens: 5 }, message })

const readTool = {
  spec: { name: 'read', description: 'read a file', parameters: { type: 'object' } },
  kind: /** @type {const} */ ('read'),
  title: (/** @type {any} */ args) => `Read ${args.path}`,
  run: async (/** @type {any} */ args) => `contents of ${args.path}`,
}

test('loop: text-only turn persists brain entry and message', async () => {
  const { stream } = fakeStream([[
    { type: 'thinking', delta: 'Hmm. ' },
    { type: 'text', delta: 'Hel' },
    { type: 'text', delta: 'lo' },
    done('end', { role: 'assistant', content: 'Hello' }),
  ]])
  /** @type {any[]} */
  const persisted = []
  /** @type {any[]} */
  const live = []
  const result = await runTurn({
    brain, system: 'sys', history: [{ role: 'user', content: 'Hi' }], stream: /** @type {any} */ (stream),
    onUpdate: (update) => live.push(update), persist: async (records) => { persisted.push(...records) },
  })
  assert.equal(result.stopReason, 'end')
  assert.equal(result.text, 'Hello')
  assert.deepEqual(persisted.map((record) => record.update.sessionUpdate), ['tool_call', 'agent_thought_chunk', 'agent_message_chunk'])
  assert.equal(persisted[0].update.status, 'completed')
  assert.equal(persisted[2].update.content.text, 'Hello')
  assert.ok(live.some((update) => update.sessionUpdate === 'agent_message_chunk' && update.content.text === 'Hel'))
})

test('loop: tool call allowed by rule, then final answer; records replay as context', async () => {
  const { stream, calls } = fakeStream([
    [
      { type: 'text', delta: 'Let me read it.' },
      { type: 'tool_call', call: { id: 'c1', name: 'read', args: { path: 'a.csv' } } },
      done('tool_use', { role: 'assistant', content: 'Let me read it.', toolCalls: [{ id: 'c1', name: 'read', args: { path: 'a.csv' } }], raw: ['native'] }),
    ],
    [{ type: 'text', delta: 'Done.' }, done('end', { role: 'assistant', content: 'Done.' })],
  ])
  /** @type {any[]} */
  const persisted = [userRecord('Read a.csv', 'dev')]
  const result = await runTurn({
    brain, system: 'sys', history: [{ role: 'user', content: 'Read a.csv' }], tools: [readTool], stream: /** @type {any} */ (stream),
    rule: () => 'allow', persist: async (records) => { persisted.push(...records) },
  })
  assert.equal(result.stopReason, 'end')
  assert.equal(result.usage.inputTokens, 20)
  // Second model call saw the raw assistant message and the tool result.
  assert.deepEqual(calls[1].slice(1), [
    { role: 'assistant', content: 'Let me read it.', toolCalls: [{ id: 'c1', name: 'read', args: { path: 'a.csv' } }], raw: ['native'] },
    { role: 'tool', toolCallId: 'c1', name: 'read', content: 'contents of a.csv' },
  ])
  const toolRecord = persisted.find((record) => record.update?.toolCallId === 'c1')
  assert.equal(toolRecord.update.status, 'completed')
  assert.equal(toolRecord.update.title, 'Read a.csv')
  // How long the brain and the tool took, for the activity view.
  assert.equal(typeof persisted[1].update._meta.ms, 'number')
  assert.equal(typeof toolRecord.update._meta.ms, 'number')
  assert.deepEqual(toChatMessages(persisted).map((message) => message.role), ['user', 'assistant', 'tool', 'assistant'])
})

test('loop: ask → declined; never; unknown tool; invalid JSON', async () => {
  const script = (/** @type {any} */ call) => [
    [{ type: 'tool_call', call }, done('tool_use', { role: 'assistant', content: '', toolCalls: [call] })],
    [done('end', { role: 'assistant', content: 'ok' })],
  ]
  const cases = [
    { call: { id: 'a', name: 'read', args: { path: 'x' } }, rule: 'ask', answer: 'reject_once', expected: 'The user declined this action.' },
    { call: { id: 'b', name: 'read', args: { path: 'x' } }, rule: 'never', answer: 'allow_once', expected: 'The user declined this action.' },
    { call: { id: 'c', name: 'nope', args: {} }, rule: 'allow', answer: 'allow_once', expected: 'There is no tool named "nope".' },
    { call: { id: 'd', name: 'read', args: { __invalidJSON: '{' } }, rule: 'allow', answer: 'allow_once', expected: 'The arguments were not valid JSON. Try again.' },
  ]
  for (const { call, rule, answer, expected } of cases) {
    const { stream, calls } = fakeStream(script(call))
    let asked = 0
    await runTurn({
      brain, system: 's', history: [{ role: 'user', content: 'go' }], tools: [readTool], stream: /** @type {any} */ (stream),
      rule: () => /** @type {any} */ (rule), askPermission: async () => { asked++; return /** @type {any} */ (answer) },
    })
    const toolMessage = calls[1].at(-1)
    assert.equal(toolMessage.content, expected)
    assert.equal(toolMessage.isError, true)
    assert.equal(asked, rule === 'ask' ? 1 : 0)
  }
})

test('loop: stream errors persist partial output and rethrow', async () => {
  /** @param {any} _ */
  async function* stream(_) {
    yield { type: 'text', delta: 'Partial' }
    throw Object.assign(new Error('Network down'), { code: 'cors_or_offline' })
  }
  /** @type {any[]} */
  const persisted = []
  await assert.rejects(
    runTurn({ brain, system: 's', history: [{ role: 'user', content: 'Hi' }], stream: /** @type {any} */ (stream), persist: async (records) => { persisted.push(...records) } }),
    /Network down/,
  )
  assert.equal(persisted[0].update.status, 'failed')
  assert.equal(persisted[0].update.rawOutput.code, 'cors_or_offline')
  assert.equal(typeof persisted[0].update._meta.ms, 'number')
  assert.equal(persisted[1].update.content.text, 'Partial')
})

test('loop: stops after maxSteps', async () => {
  const call = { id: 'x', name: 'read', args: { path: 'a' } }
  const step = [{ type: 'tool_call', call }, done('tool_use', { role: 'assistant', content: '', toolCalls: [call] })]
  const { stream } = fakeStream([step, step, step])
  const result = await runTurn({ brain, system: 's', history: [{ role: 'user', content: 'loop' }], tools: [readTool], rule: () => 'allow', maxSteps: 2, stream: /** @type {any} */ (stream) })
  assert.equal(result.stopReason, 'max_steps')
})

test('loop: a helper’s turn runs under its call, shares the numbering, and stays out of the brain’s context', async () => {
  // The parent delegates; the helper reads a page and cites it; the parent answers.
  const { stream, calls } = fakeStream([
    [{ type: 'tool_call', call: { id: 'p1', name: 'delegate', args: {} } }, done('tool_use', { role: 'assistant', content: '', toolCalls: [{ id: 'p1', name: 'delegate', args: {} }] })],
    [{ type: 'thinking', delta: 'Helper thinks.' }, { type: 'tool_call', call: { id: 'h1', name: 'web', args: {} } }, done('tool_use', { role: 'assistant', content: '', toolCalls: [{ id: 'h1', name: 'web', args: {} }], raw: [{ type: 'thinking' }] })],
    [{ type: 'text', delta: 'The sky is blue [2].' }, done('end', { role: 'assistant', content: 'The sky is blue [2].' })],
    [{ type: 'text', delta: 'Blue [2].' }, done('end', { role: 'assistant', content: 'Blue [2].' })],
  ])
  const webTool = {
    spec: { name: 'web', description: 'web', parameters: { type: 'object' } },
    kind: /** @type {const} */ ('fetch'),
    title: () => 'Web',
    run: async (/** @type {any} */ args, /** @type {import('../core/loop.js').ToolContext} */ ctx) => `Source [${ctx.cite([{ title: 'Sky', url: 'https://sky.example' }])[0]}]: blue`,
  }
  const delegateTool = {
    spec: { name: 'delegate', description: 'delegate', parameters: { type: 'object' } },
    kind: /** @type {const} */ ('think'),
    title: () => 'Delegate',
    run: async (/** @type {any} */ args, /** @type {import('../core/loop.js').ToolContext} */ ctx) => (await ctx.turn({ system: 'helper', history: [{ role: 'user', content: 'Find the sky colour' }], declared: ['web'] })).text,
  }
  /** @type {any[]} */
  const persisted = [userRecord('Sky?', 'dev')]
  /** @type {any[]} */
  const asked = []
  /** @type {any[]} */
  const live = []
  const result = await runTurn({
    brain, system: 'sys', history: [{ role: 'user', content: 'Sky?' }], tools: [webTool, delegateTool], declared: ['delegate'], firstSource: 2, stream: /** @type {any} */ (stream),
    rule: (kind) => (kind === 'fetch' ? 'ask' : 'allow'),
    askPermission: async (request) => { asked.push(request.toolCall); return 'allow_once' },
    onUpdate: (update, step) => live.push({ update, step }), persist: async (records) => { persisted.push(...records) },
  })
  assert.equal(result.text, 'Blue [2].')
  // The helper saw only its own task, and the parent got the helper's report back.
  assert.deepEqual(calls[1], [{ role: 'user', content: 'Find the sky colour' }])
  assert.equal(calls[3].at(-1).content, 'The sky is blue [2].')
  // The approval names the helper's call under the parent's.
  assert.equal(asked[0].toolCallId, 'p1/h1')
  assert.equal(asked[0]._meta.parent, 'p1')
  // Its records: under the delegate call, at the parent's step, without its text or thinking blocks.
  const nested = persisted.filter((record) => record.update?._meta?.parent)
  assert.deepEqual(nested.map((record) => [record.update.toolCallId.replace(/brain-\d+-\w+/, 'brain'), record.update._meta.parent, record.step]), [
    ['p1/brain', 'p1', 0], ['p1/h1', 'p1', 0], ['p1/brain', 'p1', 0],
  ])
  assert.ok(nested.every((record) => !record.update._meta.raw))
  assert.deepEqual(nested[1].update._meta.sources, [{ title: 'Sky', url: 'https://sky.example', n: 2 }])
  assert.ok(!persisted.some((record) => record.update?.sessionUpdate === 'agent_message_chunk' && record.update.content.text.includes('sky is blue')))
  assert.ok(live.every(({ update }) => update.sessionUpdate !== 'agent_message_chunk' || update.content.text === 'Blue [2].'))
  // Replayed, the parent's context holds the delegate call and its result only.
  const replay = toChatMessages(persisted)
  assert.deepEqual(replay.map((message) => message.role), ['user', 'assistant', 'tool', 'assistant'])
  assert.equal(replay[2].content, 'The sky is blue [2].')
})
