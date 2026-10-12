import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runTurn } from '../app/core/loop.js'
import { LLMError } from '../app/core/llm.js'
import { userRecord, unanswered } from '../app/core/events.js'
import { toChatMessages } from '../app/core/prompt.js'

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
  // Its start is kept first, then its end, which replaces it when the records are read back.
  assert.deepEqual(persisted.filter((record) => record.update?.toolCallId === 'c1').map((record) => record.update.status), ['in_progress', 'completed'])
  const toolRecord = persisted.findLast((record) => record.update?.toolCallId === 'c1')
  assert.equal(toolRecord.update.status, 'completed')
  assert.equal(toolRecord.update.title, 'Read a.csv')
  // How long the brain and the tool took, for the activity view.
  assert.equal(typeof persisted[1].update._meta.ms, 'number')
  assert.equal(typeof toolRecord.update._meta.ms, 'number')
  assert.deepEqual(toChatMessages(persisted).map((message) => message.role), ['user', 'assistant', 'tool', 'assistant'])
})

test('loop: a call says how it is coming as it runs, live only, never kept (a picture as it forms)', async () => {
  const { stream } = fakeStream([
    [{ type: 'tool_call', call: { id: 'c1', name: 'paint', args: {} } }, done('tool_use', { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'paint', args: {} }] })],
    [done('end', { role: 'assistant', content: 'Done.' })],
  ])
  const paint = {
    spec: { name: 'paint', description: 'paint', parameters: { type: 'object' } },
    kind: /** @type {const} */ ('edit'),
    title: () => 'Paint',
    run: async (/** @type {any} */ _, /** @type {import('../app/core/loop.js').ToolContext} */ ctx) => {
      ctx.progress({ _meta: { making: { done: 0.5 } }, content: [{ type: 'content', content: { type: 'image', mimeType: 'image/png', data: 'AAAA' } }] })
      ctx.meta.picture = { uri: 'files/a.png' }
      return 'Made it.'
    },
  }
  /** @type {any[]} */
  const live = []
  /** @type {any[]} */
  const persisted = []
  await runTurn({
    brain, system: 'sys', history: [{ role: 'user', content: 'Paint' }], tools: [paint], stream: /** @type {any} */ (stream),
    rule: () => 'allow', onUpdate: (update) => live.push(update), persist: async (records) => { persisted.push(...records) },
  })
  const calls = live.filter((update) => update.toolCallId === 'c1')
  assert.deepEqual(calls.map((update) => update.status), ['pending', 'in_progress', undefined, 'completed'])
  assert.deepEqual(calls[2], { sessionUpdate: 'tool_call_update', toolCallId: 'c1', _meta: { making: { done: 0.5 } }, content: [{ type: 'content', content: { type: 'image', mimeType: 'image/png', data: 'AAAA' } }] })
  // Its end replaces what it showed meanwhile, and nothing of it is kept.
  assert.deepEqual(calls[3].content, [{ type: 'content', content: { type: 'text', text: 'Made it.' } }])
  assert.ok(!JSON.stringify(persisted).includes('AAAA'))
  assert.ok(!JSON.stringify(persisted).includes('making'))
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

test('loop: a turn.step hook answers a step with its own brain, the turn’s own facts on it, and its key never', async () => {
  const { stream: never } = fakeStream([])
  const { stream: own, calls } = fakeStream([[{ type: 'text', delta: 'Here.' }, done('end', { role: 'assistant', content: 'Here.' })]])
  /** @type {any[]} */
  const seen = []
  const hooks = [{ on: 'turn.step', run: (/** @type {any} */ e) => (seen.push(e), own(e)) }]
  const result = await runTurn({ brain, apiKey: 'secret', system: 's', history: [{ role: 'user', content: 'hi' }], stream: /** @type {any} */ (never), hooks, about: { task: 'conversations/1.jsonl' } })
  assert.equal(result.text, 'Here.')
  assert.equal(calls.length, 1)
  assert.equal(seen[0].task, 'conversations/1.jsonl')
  assert.equal(seen[0].step, 0)
  assert.equal(seen[0].brain.model, 'test-model')
  assert.ok(!('apiKey' in seen[0]))
})

test('loop: a tool.check hook refuses, with or without a reason, or lets through what the rules would ask, but never a reserved action', async () => {
  const run = async (/** @type {any} */ hook, /** @type {any} */ tool = readTool, rule = 'ask') => {
    const call = { id: 'a', name: tool.spec.name, args: { path: 'x' } }
    const { stream, calls } = fakeStream([[{ type: 'tool_call', call }, done('tool_use', { role: 'assistant', content: '', toolCalls: [call] })], [done('end', { role: 'assistant', content: 'ok' })]])
    let asked = 0
    await runTurn({
      brain, system: 's', history: [{ role: 'user', content: 'go' }], tools: [tool], stream: /** @type {any} */ (stream), hooks: [{ on: 'tool.check', match: { kind: 'read' }, run: hook }],
      rule: () => /** @type {any} */ (rule), askPermission: async () => { asked++; return 'reject_once' },
    })
    return { output: calls[1].at(-1).content, asked }
  }
  assert.deepEqual(await run(() => ({ decision: 'never' })), { output: 'The user declined this action.', asked: 0 })
  assert.deepEqual(await run(() => ({ decision: 'never', reason: 'Not on Sundays.' })), { output: 'Not on Sundays.', asked: 0 })
  assert.deepEqual(await run(() => ({ refuse: 'It could not be checked.' })), { output: 'It could not be checked.', asked: 0 })
  assert.deepEqual(await run(() => ({ decision: 'allow' })), { output: 'contents of x', asked: 0 })
  assert.deepEqual(await run((/** @type {any} */ e, /** @type {any} */ next) => next(e)), { output: 'The user declined this action.', asked: 1 })
  assert.deepEqual(await run(() => ({ decision: 'allow' }), { ...readTool, reserved: true }, 'never'), { output: 'The user declined this action.', asked: 0 })
})

test('loop: a call a hook refused or asked about keeps whose answer it was, for whoever follows the records; one the rules decided keeps none (D299)', async () => {
  const run = async (/** @type {any[]} */ hooks, rule = 'allow') => {
    const call = { id: 'a', name: 'read', args: { path: 'x' } }
    const { stream } = fakeStream([[{ type: 'tool_call', call }, done('tool_use', { role: 'assistant', content: '', toolCalls: [call] })], [done('end', { role: 'assistant', content: 'ok' })]])
    /** @type {any[]} */
    const kept = []
    await runTurn({ brain, system: 's', history: [{ role: 'user', content: 'go' }], tools: [readTool], stream: /** @type {any} */ (stream), hooks,
      rule: () => /** @type {any} */ (rule), askPermission: async () => 'allow_once', persist: async (added) => { kept.push(...added) } })
    return kept.findLast((record) => record.update?.toolCallId === 'a').update._meta
  }
  assert.equal((await run([{ on: 'tool.check', by: 'school', tier: 'user', run: () => ({ decision: 'never', reason: 'Not at school.' }) }])).by, 'school')
  assert.equal((await run([{ on: 'tool.check', by: 'careful', run: () => ({ decision: 'ask' }) }])).by, 'careful')
  assert.equal((await run([{ on: 'tool.check', by: 'watching', run: (/** @type {any} */ e, /** @type {any} */ next) => next(e) }], 'never')).by, undefined)
})

test('loop: a declined call says so in its record; one running when the page closed is read back as cut short, and not run again', async () => {
  const call = { id: 'a', name: 'read', args: { path: 'a' } }
  const { stream } = fakeStream([[{ type: 'tool_call', call }, done('tool_use', { role: 'assistant', content: '', toolCalls: [call] })], [done('end', { role: 'assistant', content: 'ok' })]])
  /** @type {any[]} */
  const declined = []
  await runTurn({ brain, system: 's', history: [{ role: 'user', content: 'go' }], tools: [readTool], stream: /** @type {any} */ (stream), rule: () => 'never', persist: async (added) => { declined.push(...added) } })
  assert.equal(declined.find((record) => record.update?.toolCallId === 'a').update._meta.declined, true)
  // A call that never ends: the page closes while it runs.
  const slowTool = { ...readTool, run: () => new Promise(() => {}) }
  /** @type {any[]} */
  const records = [userRecord('go', 'dev')]
  runTurn({ brain, system: 's', history: [{ role: 'user', content: 'go' }], tools: [slowTool], stream: /** @type {any} */ (fakeStream([[{ type: 'tool_call', call }, done('tool_use', { role: 'assistant', content: '', toolCalls: [call] })]]).stream),
    rule: () => 'allow', persist: async (added) => { records.push(...added) } })
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(records.at(-1).update.status, 'in_progress')
  assert.equal(unanswered(records), null)
  assert.deepEqual(toChatMessages(records).slice(1), [
    { role: 'assistant', content: '', toolCalls: [call] },
    { role: 'tool', toolCallId: 'a', name: 'read', content: 'Cut short before it ended: it may not have been done.', isError: true },
  ])
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

test('loop: a request that fails before anything of the answer came is asked again after a moment, which its entry says meanwhile (D202)', async () => {
  let calls = 0
  /** @param {any} _ */
  async function* stream(_) {
    // Offline looks like a refused cross-origin request to a browser; a busy server passes too.
    if (++calls === 1) throw new LLMError('Failed to fetch', { code: 'cors_or_offline' })
    if (calls === 2) throw new LLMError('Overloaded', { code: 'server' })
    yield { type: 'text', delta: 'Hello' }
    yield done('end', { role: 'assistant', content: 'Hello' })
  }
  /** @type {any[]} */
  const persisted = []
  /** @type {any[]} */
  const live = []
  const result = await runTurn({
    brain, system: 's', history: [{ role: 'user', content: 'Hi' }], stream: /** @type {any} */ (stream), retries: [0, 0, 0],
    onUpdate: (update) => live.push(update), persist: async (records) => { persisted.push(...records) },
  })
  assert.equal(calls, 3)
  assert.equal(result.text, 'Hello')
  assert.deepEqual(persisted.map((record) => [record.update.sessionUpdate, record.update.status]), [['tool_call', 'completed'], ['agent_message_chunk', undefined]])
  assert.deepEqual(live.flatMap((update) => (update._meta && 'retrying' in update._meta ? [update._meta.retrying] : [])), [true, false, true, false])
  assert.equal(new Set(live.flatMap((update) => update.toolCallId ?? [])).size, 1)
})

test('loop: it asks again only while it may help: not past its retries, a lasting error, a long wait, or part of an answer (D202)', async () => {
  /** @type {[string, LLMError, boolean, number][]} */
  const cases = [
    ['past its retries', new LLMError('Busy', { code: 'rate_limit' }), false, 4],
    ['a lasting error', new LLMError('Wrong key', { code: 'auth' }), false, 1],
    ['a wait longer than half a minute', new LLMError('Busy', { code: 'rate_limit', retryAfter: 60_000 }), false, 1],
    ['part of an answer shown', new LLMError('The response stream ended early', { code: 'network' }), true, 1],
  ]
  for (const [why, error, partial, expected] of cases) {
    let calls = 0
    /** @param {any} _ */
    async function* stream(_) {
      calls++
      if (partial) yield { type: 'text', delta: 'Half an answ' }
      throw error
    }
    await assert.rejects(runTurn({ brain, system: 's', history: [{ role: 'user', content: 'Hi' }], stream: /** @type {any} */ (stream), retries: [0, 0, 0] }), error)
    assert.equal(calls, expected, why)
  }
})

test('loop: stopped while it waits to ask again, it asks no more (D202)', async () => {
  const controller = new AbortController()
  let calls = 0
  /** @param {any} _ */
  async function* stream(_) {
    calls++
    yield* []
    throw new LLMError('The connection dropped', { code: 'network' })
  }
  /** @type {any[]} */
  const persisted = []
  await assert.rejects(runTurn({
    brain, system: 's', history: [{ role: 'user', content: 'Hi' }], stream: /** @type {any} */ (stream), retries: [20_000], signal: controller.signal,
    onUpdate: (update) => update._meta?.retrying && controller.abort(), persist: async (records) => { persisted.push(...records) },
  }), { code: 'aborted' })
  assert.equal(calls, 1)
  assert.equal(persisted[0].update.status, 'failed')
})

test('loop: once stopped, it runs and asks for nothing more', async () => {
  const first = { id: 'a', name: 'read', args: { path: 'a' } }
  const second = { id: 'b', name: 'read', args: { path: 'b' } }
  const { stream, calls } = fakeStream([[
    { type: 'tool_call', call: first },
    { type: 'tool_call', call: second },
    done('tool_use', { role: 'assistant', content: '', toolCalls: [first, second] }),
  ]])
  const controller = new AbortController()
  /** @type {string[]} */
  const asked = []
  /** @type {any[]} */
  const persisted = []
  // Stopped while the first card waits, which is then declined: the second is never shown.
  await assert.rejects(runTurn({
    brain, system: 's', history: [{ role: 'user', content: 'go' }], tools: [readTool], stream: /** @type {any} */ (stream), signal: controller.signal,
    rule: () => 'ask',
    askPermission: async (request) => {
      asked.push(request.toolCall.toolCallId)
      controller.abort()
      return 'reject_once'
    },
    persist: async (records) => { persisted.push(...records) },
  }), { code: 'aborted' })
  assert.deepEqual(asked, ['a'])
  assert.equal(calls.length, 1)
  // Kept as pending while the card waited (D212); declined, the turn isn't asked again, and what never ran reads as cut short.
  assert.deepEqual(persisted.filter((record) => record.update?.name).map(({ update }) => [update.toolCallId, update.status]), [['a', 'pending'], ['b', 'pending'], ['a', 'failed']])
  const records = [userRecord('go', 'dev'), ...persisted]
  assert.equal(unanswered(records), null)
  assert.deepEqual(toChatMessages(records).at(-1), { role: 'tool', toolCallId: 'b', name: 'read', content: 'Cut short before it ended: it may not have been done.', isError: true })
})

test('loop: a call that waits for the user is kept as pending with the calls after it, and a turn the page closed on goes on from there, asking again (D212)', async () => {
  const question = { id: 'q', name: 'ask_user', args: { questions: [{ question: 'Which tone?' }] } }
  const read = { id: 'r', name: 'read', args: { path: 'a' } }
  /** @type {((answer: string) => void)[]} */
  const answers = []
  const askTool = {
    spec: { name: 'ask_user', description: 'ask', parameters: { type: 'object' } },
    kind: /** @type {const} */ ('think'),
    asks: true,
    title: () => 'Which tone?',
    run: () => new Promise((/** @type {(answer: string) => void} */ resolve) => answers.push(resolve)),
  }
  const tools = [askTool, readTool]
  const first = fakeStream([[{ type: 'text', delta: 'A few questions.' }, { type: 'tool_call', call: question }, { type: 'tool_call', call: read }, done('tool_use', { role: 'assistant', content: 'A few questions.', toolCalls: [question, read] })]])
  /** @type {any[]} */
  const records = [userRecord('Write a letter', 'dev')]
  const persist = async (/** @type {any[]} */ added) => { records.push(...added) }
  // The page closes while the question waits: that turn never ends.
  runTurn({ brain, system: 's', history: [{ role: 'user', content: 'Write a letter' }], tools, rule: () => 'allow', stream: /** @type {any} */ (first.stream), persist })
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepEqual(records.filter((record) => record.update?.name).map(({ update }) => [update.toolCallId, update.status, Boolean(update._meta?.waiting)]), [['q', 'pending', true], ['r', 'pending', false]])
  const resume = unanswered(records)
  assert.deepEqual(resume, { step: 0, calls: [question, read] })
  // Read as it is, every call has its result: what never ended was cut short.
  assert.deepEqual(toChatMessages(records).slice(1).map((message) => (message.role === 'tool' ? [message.toolCallId, message.isError] : message.toolCalls?.map((call) => call.id))), [['q', 'r'], ['q', true], ['r', true]])

  // Opened again: the calls run again in their step, the question asked first, and the brain goes on.
  const second = fakeStream([[{ type: 'text', delta: 'Formal it is.' }, done('end', { role: 'assistant', content: 'Formal it is.' })]])
  const turn = runTurn({ brain, system: 's', history: toChatMessages(records, undefined, resume), resume, tools, rule: () => 'allow', stream: /** @type {any} */ (second.stream), persist })
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(answers.length, 2)
  answers[1]('Formal')
  assert.equal((await turn).text, 'Formal it is.')
  const asked = [
    { role: 'user', content: 'Write a letter' },
    { role: 'assistant', content: 'A few questions.', toolCalls: [question, read] },
    { role: 'tool', toolCallId: 'q', name: 'ask_user', content: 'Formal' },
    { role: 'tool', toolCallId: 'r', name: 'read', content: 'contents of a' },
  ]
  assert.deepEqual(second.calls[0], asked)
  // The file reads as one turn never cut: the brain's next step after the calls, nothing left waiting.
  assert.equal(unanswered(records), null)
  assert.deepEqual(toChatMessages(records), [...asked, { role: 'assistant', content: 'Formal it is.' }])
  assert.deepEqual(records.filter((record) => record.update?.kind === 'think' && !record.update.name).map((record) => record.step), [0, 1])
})

test('loop: an approval the page closed on is asked again; one that was running when it closed is not (D212)', async () => {
  const call = { id: 'a', name: 'read', args: { path: 'a' } }
  const later = { id: 'b', name: 'read', args: { path: 'b' } }
  const { stream } = fakeStream([[{ type: 'tool_call', call }, { type: 'tool_call', call: later }, done('tool_use', { role: 'assistant', content: '', toolCalls: [call, later] })]])
  /** @type {any[]} */
  const records = [userRecord('go', 'dev')]
  /** @type {((option: any) => void)[]} */
  const cards = []
  runTurn({
    brain, system: 's', history: [{ role: 'user', content: 'go' }], tools: [readTool], stream: /** @type {any} */ (stream),
    rule: () => 'ask', askPermission: () => new Promise((resolve) => cards.push(resolve)), persist: async (added) => { records.push(...added) },
  })
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepEqual(unanswered(records), { step: 0, calls: [call, later] })
  // Allowed, the first ran; the page closed while the second waited: that one is asked again.
  cards[0]('allow_once')
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepEqual(unanswered(records), { step: 0, calls: [later] })
  // Had the second been running, without a card, it wouldn't run again by itself.
  const running = records.filter((record) => !(record.update?.toolCallId === 'b' && record.update._meta?.waiting))
  assert.equal(unanswered(running), null)
})

test('loop: a check asks even where the rules allow, shows its diff on the card, and the run gets the answer and keeps the diff (D141)', async () => {
  const diff = { type: /** @type {const} */ ('diff'), path: 'a.txt', oldText: 'one', newText: 'two' }
  /** @type {any[]} */
  const answers = []
  const changeTool = {
    spec: { name: 'change', description: 'change a file', parameters: { type: 'object' } },
    kind: /** @type {const} */ ('edit'),
    title: () => 'Change a.txt',
    check: async (/** @type {any} */ args) => (args.broken ? Promise.reject(new Error('no folder')) : { ask: !args.trusted, meta: { folder: 'Clients' }, content: [diff] }),
    run: async (/** @type {any} */ args, /** @type {any} */ ctx) => {
      if (args.broken) throw new Error('No folder is open.')
      answers.push(ctx.answer)
      ctx.content.push(diff)
      return 'Changed a.txt.'
    },
  }
  const cases = [
    { args: {}, answer: 'allow_always', asked: 1, output: 'Changed a.txt.' },
    { args: {}, answer: 'reject_once', asked: 1, output: 'The user declined this action.' },
    { args: { trusted: true }, answer: 'reject_once', asked: 0, output: 'Changed a.txt.' },
    { args: { broken: true }, answer: 'allow_once', asked: 0, output: 'Error: No folder is open.' },
  ]
  for (const { args, answer, asked, output } of cases) {
    const call = { id: 'c', name: 'change', args }
    const { stream, calls } = fakeStream([[{ type: 'tool_call', call }, done('tool_use', { role: 'assistant', content: '', toolCalls: [call] })], [done('end', { role: 'assistant', content: 'ok' })]])
    /** @type {any[]} */
    const cards = []
    /** @type {any[]} */
    const persisted = []
    await runTurn({
      brain, system: 's', history: [{ role: 'user', content: 'go' }], tools: [changeTool], stream: /** @type {any} */ (stream), rule: () => 'allow',
      askPermission: async ({ toolCall }) => { cards.push(toolCall); return /** @type {any} */ (answer) }, persist: async (records) => { persisted.push(...records) },
    })
    assert.equal(calls[1].at(-1).content, output)
    assert.equal(cards.length, asked)
    if (asked) assert.deepEqual([cards[0].content, cards[0]._meta.folder], [[diff], 'Clients'])
    const record = persisted.findLast((item) => item.update?.toolCallId === 'c').update
    assert.deepEqual(record.content.map((/** @type {any} */ part) => part.type), output.startsWith('Changed') ? ['diff', 'content'] : ['content'])
  }
  assert.deepEqual(answers, ['allow_always', undefined])
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
    run: async (/** @type {any} */ args, /** @type {import('../app/core/loop.js').ToolContext} */ ctx) => `Source [${ctx.cite([{ title: 'Sky', url: 'https://sky.example' }])[0]}]: blue`,
  }
  const delegateTool = {
    spec: { name: 'delegate', description: 'delegate', parameters: { type: 'object' } },
    kind: /** @type {const} */ ('think'),
    title: () => 'Delegate',
    run: async (/** @type {any} */ args, /** @type {import('../app/core/loop.js').ToolContext} */ ctx) => (await ctx.turn({ system: 'helper', history: [{ role: 'user', content: 'Find the sky colour' }], declared: ['web'] })).text,
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
    ['p1/brain', 'p1', 0], ['p1/h1', 'p1', 0], ['p1/h1', 'p1', 0], ['p1/brain', 'p1', 0],
  ])
  assert.ok(nested.every((record) => !record.update._meta.raw))
  assert.deepEqual(nested[2].update._meta.sources, [{ title: 'Sky', url: 'https://sky.example', n: 2 }])
  assert.ok(!persisted.some((record) => record.update?.sessionUpdate === 'agent_message_chunk' && record.update.content.text.includes('sky is blue')))
  assert.ok(live.every(({ update }) => update.sessionUpdate !== 'agent_message_chunk' || update.content.text === 'Blue [2].'))
  // Replayed, the parent's context holds the delegate call and its result only.
  const replay = toChatMessages(persisted)
  assert.deepEqual(replay.map((message) => message.role), ['user', 'assistant', 'tool', 'assistant'])
  assert.equal(replay[2].content, 'The sky is blue [2].')
})

test('a turn that starts on a call runs it alone, and a helper’s turn inside it doesn’t start on it again (D218)', async () => {
  let runs = 0
  const delegateTool = {
    spec: { name: 'delegate', description: 'delegate', parameters: { type: 'object' } },
    kind: /** @type {const} */ ('think'),
    title: () => 'Delegate',
    run: async (/** @type {any} */ args, /** @type {import('../app/core/loop.js').ToolContext} */ ctx) => {
      runs++
      return (await ctx.turn({ system: 'helper', history: [{ role: 'user', content: 'part' }], maxSteps: 2 })).text
    },
  }
  const { stream, calls } = fakeStream([[{ type: 'text', delta: 'Part done.' }, done('end', { role: 'assistant', content: 'Part done.' })]])
  /** @type {any[]} */
  const persisted = []
  const result = await runTurn({
    brain, system: 's', history: [], resume: { step: 0, calls: [{ id: 'd', name: 'delegate', args: {} }] }, maxSteps: 1, tools: [delegateTool], stream: /** @type {any} */ (stream),
    rule: () => 'allow', persist: async (records) => { persisted.push(...records) },
  })
  assert.equal(runs, 1)
  assert.equal(calls.length, 1, 'only the helper asked the brain')
  assert.equal(result.stopReason, 'max_steps')
  assert.equal(persisted.findLast((record) => record.update?.toolCallId === 'd').update.rawOutput, 'Part done.')
})
