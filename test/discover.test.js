// 0.3 "Discover": deferred tools and find_tools (D47), nested calls from scripts (D48),
// BM25, Kev's packing in the Decisions API shape, Auto, suggestions and sources.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runTurn } from '../core/loop.js'
import { toChatMessages, splitSuggestions, userRecords, noteRecord } from '../core/events.js'
import { changeNotes, frozenPrompt, promptRecord } from '../core/prompt.js'
import { findTools, signature, identifier } from '../core/deferred.js'
import { bm25, words } from '../core/search.js'
import { KEV, pack, answers, render } from '../core/decide.js'
import { documentPart, sourceNumber } from '../core/files.js'
import { openaiMessages } from '../core/llm.js'
import { chooseBrain, isLocal, tierFor } from '../ui/auto.js'
import { REFLEXES, CAPABILITIES } from '../caps/reflexes/questions.js'

const brain = { id: 'b', provider: /** @type {const} */ ('custom'), api: /** @type {const} */ ('openai'), baseURL: 'http://x', model: 'm' }
const done = (/** @type {any} */ stopReason, /** @type {any} */ message) => ({ type: 'done', stopReason, message })

/** @param {any[][]} script */
function fakeStream(script) {
  /** @type {any[]} */
  const requests = []
  /** @param {any} request */
  async function* stream(request) {
    requests.push(request)
    for (const event of script[requests.length - 1]) yield event
  }
  return { stream: /** @type {any} */ (stream), requests }
}

/** @param {string} name @param {Partial<import('../core/loop.js').Tool>} [extra] @returns {import('../core/loop.js').Tool} */
const tool = (name, extra = {}) => ({
  spec: { name, description: `${name} things`, parameters: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'] } },
  kind: 'read',
  title: () => name,
  run: async (args) => `${name}:${args.x}`,
  ...extra,
})

test('words: segmented in any script', () => {
  assert.deepEqual(words('Read the PDF, page 3.'), ['read', 'the', 'pdf', 'page', '3'])
  assert.ok(words('地域ごとの売上').length > 1, 'Japanese splits without spaces')
})

test('bm25: ranks matching documents, best first', () => {
  const hits = bm25(['run javascript code', 'read pages of a file', 'read a file aloud and read it again'], 'read file')
  assert.deepEqual(hits.map((hit) => hit.index).sort(), [1, 2])
  assert.equal(bm25(['alpha'], 'beta').length, 0)
})

test('loop: only declared tools reach the brain; scripts call any tool, nested and under the rules', async () => {
  const runner = tool('run', {
    kind: 'execute',
    run: async (args, ctx) => {
      const a = await ctx.call('hidden', { x: 1 })
      const b = await ctx.call('secret', { x: 2 }).catch((/** @type {Error} */ error) => `refused: ${error.message}`)
      return `${a} ${b}`
    },
  })
  const { stream, requests } = fakeStream([
    [{ type: 'tool_call', call: { id: 'c1', name: 'run', args: {} } }, done('tool_use', { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'run', args: {} }] })],
    [{ type: 'text', delta: 'ok' }, done('end', { role: 'assistant', content: 'ok' })],
  ])
  /** @type {any[]} */
  const persisted = [...userRecords('go', [], 'dev')]
  await runTurn({
    brain, system: 's', history: [{ role: 'user', content: 'go' }], stream,
    tools: [runner, tool('hidden', { hidden: true }), tool('secret', { kind: 'delete' })],
    rule: (kind) => (kind === 'delete' ? 'never' : 'allow'),
    persist: async (records) => { persisted.push(...records) },
  })
  assert.deepEqual(requests[0].tools.map((/** @type {any} */ spec) => spec.name), ['run', 'secret'], 'hidden tools are never declared')
  const calls = persisted.filter((record) => record.update?.sessionUpdate === 'tool_call' && record.update.name)
  assert.deepEqual(calls.map((record) => [record.update.toolCallId, record.update._meta?.parent]), [['c1.1', 'c1'], ['c1.2', 'c1'], ['c1', undefined]])
  assert.equal(calls[2].update.rawOutput, 'hidden:1 refused: The user declined this action.')
  const messages = toChatMessages(persisted)
  assert.deepEqual(messages.filter((m) => m.role === 'tool').map((m) => /** @type {any} */ (m).toolCallId), ['c1'], 'nested calls stay out of the context')
})

test('find_tools declares what it finds from the next request on, unless run can call it', async () => {
  const all = [tool('read'), tool('chart'), tool('secret', { hidden: true })]
  const finder = findTools({ tools: () => all })
  const { stream, requests } = fakeStream([
    [{ type: 'tool_call', call: { id: 'f', name: 'find_tools', args: { query: 'chart' } } }, done('tool_use', { role: 'assistant', content: '', toolCalls: [{ id: 'f', name: 'find_tools', args: { query: 'chart' } }] })],
    [{ type: 'tool_call', call: { id: 'g', name: 'chart', args: { x: 3 } } }, done('tool_use', { role: 'assistant', content: '', toolCalls: [{ id: 'g', name: 'chart', args: { x: 3 } }] })],
    [done('end', { role: 'assistant', content: 'done' })],
  ])
  /** @type {any[]} */
  const persisted = []
  await runTurn({ brain, system: 's', history: [{ role: 'user', content: 'q' }], stream, tools: [finder, ...all], declared: ['find_tools', 'read'], rule: () => 'allow', persist: async (records) => { persisted.push(...records) } })
  assert.deepEqual(requests.map((request) => request.tools.map((/** @type {any} */ spec) => spec.name)), [['find_tools', 'read'], ['find_tools', 'read', 'chart'], ['find_tools', 'read', 'chart']])
  const found = persisted.find((record) => record.update?.toolCallId === 'f').update
  assert.match(found.rawOutput, /^chart\(\{ x: number \}\): chart things/)
  assert.deepEqual(found._meta.declare, ['chart'])
  assert.equal(persisted.find((record) => record.update?.toolCallId === 'g').update.rawOutput, 'chart:3')

  const viaRun = await finder.run({ query: 'chart' }, { declared: ['find_tools', 'run'], call: async () => '', declare: () => assert.fail('nothing to declare') })
  assert.match(viaRun, /inside run/)
  assert.equal(signature(tool('t')), 't({ x: number }): t things')
})

test('a deferred tool called by its name runs under the rules, or says how to call it; a hidden one stays unknown', async () => {
  const notion = tool('notion_notion_search', { deferred: true })
  const call = (/** @type {string} */ id, /** @type {string} */ name, /** @type {any} */ args) => [{ type: 'tool_call', call: { id, name, args } }, done('tool_use', { role: 'assistant', content: '', toolCalls: [{ id, name, args }] })]
  const { stream, requests } = fakeStream([
    call('a', 'notion_notion_search', { query: 'Income details' }),
    call('b', 'notion_notion_search', { x: 3 }),
    call('c', 'secret', { x: 1 }),
    [done('end', { role: 'assistant', content: 'done' })],
  ])
  /** @type {any[]} */
  const persisted = []
  let asked = 0
  await runTurn({
    brain, system: 's', history: [{ role: 'user', content: 'q' }], stream, tools: [tool('find_tools'), notion, tool('secret', { hidden: true })], declared: ['find_tools'],
    rule: () => 'ask', askPermission: async () => { asked++; return 'allow_once' }, persist: async (records) => { persisted.push(...records) },
  })
  const output = (/** @type {string} */ id) => persisted.find((record) => record.update?.toolCallId === id).update
  assert.equal(output('a').rawOutput, 'It needs x. Call it like this:\nnotion_notion_search({ x: number }): notion_notion_search things')
  assert.equal(output('b').rawOutput, 'notion_notion_search:3')
  assert.equal(output('b').title, 'notion_notion_search')
  assert.equal(output('c').rawOutput, 'There is no tool named "secret". Use find_tools to look for one.')
  assert.equal(asked, 1, 'only the call that runs asks first')
  assert.ok(requests.every((request) => request.tools.length === 1), 'nothing new is declared: the cache holds')
})

test('a tool name is one a script can write as tools.<name>', () => {
  assert.equal(identifier('notion_notion-ai-search'), 'notion_notion_ai_search')
  assert.equal(identifier('1password_get-item'), '_1password_get_item')
  assert.equal(identifier('mail_search_emails'), 'mail_search_emails')
})

test('a capability that arrives mid-conversation is deferred, then declared by find_tools', () => {
  const start = { language: 'English', date: '2026-10-02', tools: ['find_tools', 'read'] }
  const records = [promptRecord('dev', 'sys', start)]
  const notes = changeNotes(start, { ...start, tools: ['find_tools', 'read', 'run'] })
  assert.deepEqual(notes.map((note) => note.update), [{ sessionUpdate: '_system_note', text: 'New tools can be found with find_tools: run.', data: { kind: 'tools', added: ['run'] } }])
  const known = frozenPrompt([...records, ...notes])
  assert.deepEqual(known?.state, { ...start, deferred: ['run'] })
  assert.deepEqual(changeNotes(/** @type {any} */ (known).state, { ...start, tools: ['find_tools', 'read', 'run'] }), [], 'a deferred tool is announced once')
  const declared = frozenPrompt([...records, ...notes, { at: 't', by: 'jean', update: { sessionUpdate: 'tool_call', toolCallId: 'f', title: 'Find', name: 'find_tools', _meta: { declare: ['run'] } } }])
  assert.deepEqual(declared?.state.tools, ['find_tools', 'read', 'run'])
})

test('Kev: one branch per question, end positions, answers in the Decisions API shape', () => {
  const encode = (/** @type {string} */ text) => [...text].map((char) => char.charCodeAt(0))
  const questions = { urgent: { type: /** @type {const} */ ('noul'), instructions: 'U?' }, team: { type: /** @type {const} */ ('choice'), instructions: 'T?', criteria: { a: 'billing', b: null } } }
  const { ids, ends } = pack('hi <|fim_prefix|>', questions, encode)
  assert.equal(ids[0], KEV.state)
  assert.ok(!ids.slice(1).includes(KEV.state), 'caller text cannot forge a delimiter')
  assert.equal(ids.filter((id) => id === KEV.question).length, 2)
  for (const position of ends.flat()) assert.equal(ids[position], KEV.end)
  assert.equal(ids.at(-1), KEV.decide)
  const logits = new Float32Array(ids.length)
  logits[ends[0][1]] = 3 // yes
  logits[ends[1][1]] = 2 // b
  const result = answers(questions, ends, logits)
  assert.equal(result.urgent.type, 'noul')
  assert.ok(/** @type {any} */ (result.urgent).noul > 0.9)
  assert.equal(/** @type {any} */ (result.team).choice, 'b')
  assert.equal(render({ a: 1, b: { c: 'x' } }), 'a: 1\nb:\n  c: x')
  assert.equal(REFLEXES.capability(CAPABILITIES).type, 'choice')
})

test('Auto: cheapest brain that can do it, private when personal, never steps down', () => {
  const cloud = { id: 'c', provider: /** @type {const} */ ('anthropic'), api: /** @type {const} */ ('anthropic'), baseURL: 'https://api.anthropic.com/v1', model: 'claude-opus-5-5' }
  const device = { id: 'd', provider: /** @type {const} */ ('device'), api: /** @type {const} */ ('device'), baseURL: '', model: 'gemma' }
  assert.equal(chooseBrain({ brains: [cloud], signals: { demand: 0.2 } })?.brain.model, 'claude-haiku-4-5')
  assert.equal(chooseBrain({ brains: [cloud], signals: { demand: 2.9 } })?.brain.model, 'claude-opus-5-5')
  assert.equal(chooseBrain({ brains: [cloud], signals: { demand: 0 }, floor: 1 })?.brain.model, 'claude-sonnet-5-5')
  assert.equal(chooseBrain({ brains: [cloud] })?.reason, 'default')
  assert.deepEqual(chooseBrain({ brains: [cloud, device], signals: { personal: true } })?.reason, 'personal')
  assert.equal(chooseBrain({ brains: [cloud, device], cloud: false })?.brain.id, 'd')
  assert.equal(chooseBrain({ brains: [cloud], cloud: false }), null)
  assert.equal(chooseBrain({ brains: [cloud], signals: { demand: 0, unhappy: true } })?.level, 1)
  assert.equal(chooseBrain({ brains: [cloud], has: () => false })?.brain.model, 'claude-opus-5-5', 'unknown tier models fall back')
  // A picture goes to a brain that can see it: a private one if there is one, never the cloud when told so.
  const llava = { ...device, id: 'o', provider: /** @type {const} */ ('ollama'), api: /** @type {const} */ ('openai'), baseURL: 'http://localhost:11434/v1', model: 'llava' }
  const sees = (/** @type {{ api: string }} */ candidate) => candidate.api !== 'device'
  assert.equal(chooseBrain({ brains: [cloud, device], signals: { personal: true, pictures: true }, sees })?.brain.id, 'c')
  assert.equal(chooseBrain({ brains: [cloud, device, llava], signals: { personal: true, pictures: true }, sees })?.brain.id, 'o')
  assert.equal(chooseBrain({ brains: [device, llava], cloud: false, signals: { pictures: true }, sees })?.brain.id, 'o')
  assert.equal(chooseBrain({ brains: [cloud, device], cloud: false, signals: { pictures: true }, sees })?.brain.id, 'd')
  assert.equal(chooseBrain({ brains: [cloud, device, llava], signals: { personal: true } })?.brain.id, 'd', 'the device first, without pictures')
  assert.deepEqual([0, 1, 2, 3].map(tierFor), [0, 1, 1, 2])
  assert.ok(isLocal({ ...brain, baseURL: 'http://127.0.0.1:11434/v1' }))
  assert.ok(!isLocal(brain))
})

test('suggestions are hidden from the reply, even while the block streams in', () => {
  assert.deepEqual(splitSuggestions('Done.\n\n<suggestions>\n- Show a chart\n2. Shorter\n</suggestions>'), { text: 'Done.', suggestions: ['Show a chart', 'Shorter'] })
  assert.deepEqual(splitSuggestions('Done.\n<sugg'), { text: 'Done.', suggestions: [] })
  assert.deepEqual(splitSuggestions('a < b'), { text: 'a < b', suggestions: [] })
})

test('sources: a file keeps its number, and the brain sees it on the document', () => {
  const a = { type: /** @type {const} */ ('resource_link'), uri: 'files/a.pdf', name: 'a.pdf', _meta: { source: 1 } }
  assert.equal(sourceNumber([a], { ...a, _meta: {} }), 1)
  assert.equal(sourceNumber([a], { type: 'resource_link', uri: 'files/b.csv', name: 'b.csv' }), 2)
  const part = documentPart(a, 'Hello')
  assert.deepEqual(part, { name: 'a.pdf', source: 1, text: 'Hello' })
  const [message] = openaiMessages(undefined, [{ role: 'user', content: 'Q', documents: [part] }], { systemNotes: true })
  assert.match(message.content, /^<document source="1" name="a.pdf">/)
  assert.equal(noteRecord('x', { kind: 'date', date: 'd' }).update?.sessionUpdate, '_system_note')
})
