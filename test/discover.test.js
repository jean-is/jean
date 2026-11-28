// SPDX-License-Identifier: MIT
// 0.3 "Discover": deferred tools and find_tools (D47), nested calls from scripts (D48),
// BM25, Kev's packing in the Decisions API shape, Auto, suggestions and sources.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runTurn } from '../app/core/loop.js'
import { splitSuggestions, userRecords, noteRecord } from '../app/core/events.js'
import { changeNotes, frozenPrompt, promptRecord, toChatMessages } from '../app/core/prompt.js'
import { findTools, signature, takes, identifier } from '../app/core/deferred.js'
import { withArguments } from '../app/caps/connections/mcp.js'
import { bm25, words } from '../app/core/search.js'
import { KEV, pack, answers, render } from '../app/core/decide.js'
import { documentPart, sourceNumber } from '../app/core/files.js'
import { openaiMessages } from '../app/core/llm.js'
import { chooseBrain, chooseEffort, isLocal, tierFor, stepsOf, startedWith, secondOpinion, MIXES } from '../app/ui/auto.js'
import { REFLEXES, CAPABILITIES } from '../app/ui/questions.js'

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

/** @param {string} name @param {Partial<import('../app/core/loop.js').Tool>} [extra] @returns {import('../app/core/loop.js').Tool} */
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
  // The script's own start is kept first; its nested calls are kept as they end (D216).
  assert.deepEqual(calls.map((record) => [record.update.toolCallId, record.update._meta?.parent]), [['c1', undefined], ['c1.1', 'c1'], ['c1.2', 'c1'], ['c1', undefined]])
  assert.equal(calls[3].update.rawOutput, 'hidden:1 refused: The user declined this action.')
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
  const found = persisted.findLast((record) => record.update?.toolCallId === 'f').update
  assert.match(found.rawOutput, /^chart\(\{ x: number \}\): chart things/)
  assert.deepEqual(found._meta.declare, ['chart'])
  assert.equal(persisted.findLast((record) => record.update?.toolCallId === 'g').update.rawOutput, 'chart:3')

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
  const output = (/** @type {string} */ id) => persisted.findLast((record) => record.update?.toolCallId === id).update
  assert.equal(output('a').rawOutput, 'It needs x. Call it like this:\nnotion_notion_search({ x: number }): notion_notion_search things')
  assert.equal(output('b').rawOutput, 'notion_notion_search:3')
  assert.equal(output('b').title, 'notion_notion_search')
  assert.equal(output('c').rawOutput, 'There is no tool named "secret". Use find_tools to look for one.')
  assert.equal(asked, 1, 'only the call that runs asks first')
  assert.ok(requests.every((request) => request.tools.length === 1), 'nothing new is declared: the cache holds')
})

/** A tool that takes these parameters, or says this of itself. @param {string} name @param {any} [parameters] @param {string} [description] */
const described = (name, parameters = { type: 'object', properties: {} }, description = `${name} things`) => tool(name, { spec: { name, description, parameters } })

test('find_tools finds a tool by its name, however it is written, before the tools that mention it', async () => {
  const all = [
    described('notion_fetch', undefined, 'Fetch a page. Use it with update_data_source or query_data_sources, then query_data_sources again.'),
    described('notion_query_multiple_data_sources', undefined, 'Query several. Use query_data_sources for one data source.'),
    described('notion_query_data_sources', undefined, 'Rows, SQL or a saved view.'),
    described('notion_3_query_data_sources', undefined, 'Rows, SQL or a saved view.'),
    described('mail_search', undefined, 'Search the mail.'),
  ]
  const finder = findTools({ tools: () => all })
  const found = async (/** @type {string} */ query) => [.../** @type {string} */ (await finder.run({ query }, /** @type {any} */ ({ declared: ['find_tools', 'run'] }))).matchAll(/^(\w+)\(/gm)].map((match) => match[1])
  for (const query of ['query_data_sources', 'notion_query_data_sources', '"query_data_sources" notion', 'notion-query-data-sources', 'Query Data Sources']) {
    assert.equal((await found(query))[0], 'notion_query_data_sources', query)
  }
  assert.equal((await found('notion_3_query_data_sources'))[0], 'notion_3_query_data_sources', 'the connection named')
  assert.deepEqual((await found('query_data_sources')).slice(0, 3), ['notion_query_data_sources', 'notion_3_query_data_sources', 'notion_query_multiple_data_sources'])
  assert.equal((await found('read my mail'))[0], 'mail_search', 'words of what it does still find it')
  assert.equal((await found('saved view'))[0], 'notion_query_data_sources')
  assert.equal(await finder.run({ query: 'zzz' }, /** @type {any} */ ({ declared: ['find_tools', 'run'] })), 'No tool does that. Those that can be found: notion_fetch, notion_query_multiple_data_sources, notion_query_data_sources, notion_3_query_data_sources, mail_search.', 'nothing matches: said so, with what there is')
})

test('a signature shows what is nested: unions, values, arrays and references', () => {
  const parameters = {
    type: 'object', required: ['data'], $defs: { Url: { type: 'string' }, Node: { type: 'object', properties: { next: { $ref: '#/$defs/Node' } } } },
    properties: {
      data: { anyOf: [
        { type: 'object', required: ['mode', 'url'], properties: { mode: { const: 'rows' }, url: { $ref: '#/$defs/Url' } } },
        { type: 'object', required: ['urls', 'query'], properties: { mode: { const: 'sql' }, urls: { type: 'array', items: { type: 'string' } }, query: { type: 'string' }, params: { type: 'array', items: { type: ['string', 'number'] } } } },
      ] },
      sort: { enum: ['new', 'old'] },
      note: { type: ['string', 'null'] },
      list: { type: 'array' },
      free: {},
      node: { $ref: '#/$defs/Node' },
    },
  }
  assert.equal(signature(described('t', parameters)), 't({ data: { mode: "rows", url: string } | { mode?: "sql", urls: string[], query: string, params?: (string | number)[] }, '
    + 'sort?: "new" | "old", note?: string | null, list?: array, free?: any, node?: { next?: object } }): t things')
  assert.equal(takes(described('t', parameters).spec).startsWith('{ data: { mode: "rows"'), true, 'its arguments alone')
})

test('a signature stays short: too deep or too long, an argument says less', () => {
  const deep = { type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'object', properties: { c: { type: 'object', properties: { d: { type: 'string' } } } } } } } } }
  const wide = { type: 'object', properties: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`property_with_a_long_name_${i}`, { type: 'string' }])) }
  const names = { type: 'string', enum: Array.from({ length: 300 }, (_, i) => `value_${i}`) }
  const parameters = { type: 'object', properties: { deep, wide, names } }
  assert.equal(signature(described('t', parameters)), 't({ deep?: { a?: { b?: { c?: object } } }, wide?: object, names?: string }): t things')
})

test('a script that leaves out what a tool requires learns how to call it', async () => {
  let ran = 0
  const fetcher = tool('notion_fetch', { deferred: true, run: async () => { ran++; return 'page' } })
  /** @type {string[]} */
  const said = []
  const runner = tool('run', { kind: 'execute', run: async (_, ctx) => { said.push(await ctx.call('notion_fetch', { page_id: 'a' }).catch((/** @type {Error} */ error) => error.message)); return 'ok' } })
  const { stream } = fakeStream([
    [{ type: 'tool_call', call: { id: 'c', name: 'run', args: {} } }, done('tool_use', { role: 'assistant', content: '', toolCalls: [{ id: 'c', name: 'run', args: {} }] })],
    [done('end', { role: 'assistant', content: 'done' })],
  ])
  await runTurn({ brain, system: 's', history: [{ role: 'user', content: 'q' }], stream, tools: [runner, fetcher], declared: ['run'], rule: () => 'allow', persist: async () => {} })
  assert.deepEqual(said, ['It needs x. Call it like this:\nnotion_fetch({ x: number }): notion_fetch things'])
  assert.equal(ran, 0)
})

test('a service that refuses arguments is answered with what the tool takes; any other error stays as it is', () => {
  const takesThis = '{ data: { mode: "rows" } }'
  for (const message of ['Input validation error: Invalid arguments for tool notion-query-data-sources: data: Invalid input', 'MCP error -32602: bad', 'Invalid params']) {
    assert.equal(withArguments(message, takesThis), `${message}\nIts arguments: ${takesThis}`)
  }
  assert.equal(withArguments('No such page.', takesThis), 'No such page.')
  assert.equal(withArguments('HTTP 500', takesThis), 'HTTP 500')
})

test('a script reads a tool’s whole result; the conversation keeps the start of it', async () => {
  const long = 'x'.repeat(20_000)
  /** @type {(string | undefined)[]} */
  const parents = []
  let read = ''
  const big = tool('big', { hidden: true, run: async (_, ctx) => { parents.push(ctx.parent); return long } })
  const runner = tool('run', { kind: 'execute', run: async (_, ctx) => { parents.push(ctx.parent); read = await ctx.call('big', { x: 1 }); return 'ok' } })
  const { stream } = fakeStream([
    [{ type: 'tool_call', call: { id: 'c', name: 'run', args: {} } }, done('tool_use', { role: 'assistant', content: '', toolCalls: [{ id: 'c', name: 'run', args: {} }] })],
    [done('end', { role: 'assistant', content: 'done' })],
  ])
  /** @type {any[]} */
  const persisted = []
  await runTurn({ brain, system: 's', history: [{ role: 'user', content: 'q' }], stream, tools: [runner, big], rule: () => 'allow', persist: async (records) => { persisted.push(...records) } })
  assert.equal(read, long, 'the script has it whole')
  assert.deepEqual(parents, [undefined, 'c'])
  const kept = persisted.findLast((record) => record.update?.toolCallId === 'c.1').update
  assert.equal(kept.rawOutput, `${'x'.repeat(12_000)}\n… (cut here)`)
  assert.equal(kept.content.at(-1).content.text, kept.rawOutput)
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

test('a tool the user turns off is told once to a conversation that knows it, and told again once it is on (D304)', () => {
  const start = { language: 'English', date: '2026-10-13', tools: ['find_tools', 'web_search'] }
  const records = [promptRecord('dev', 'sys', start)]
  const off = changeNotes(start, { ...start, tools: ['find_tools'] }, {}, ['web_search'])
  assert.deepEqual(off.map((note) => note.update), [{ sessionUpdate: '_system_note', text: 'Turned off by the user, not to be called until it is on again: web_search.', data: { kind: 'switch', off: ['web_search'] } }])
  const known = /** @type {any} */ (frozenPrompt([...records, ...off])).state
  assert.deepEqual(known, { ...start, off: ['web_search'] }, 'still declared, so the request stays the same')
  assert.deepEqual(changeNotes(known, { ...start, tools: ['find_tools'] }, {}, ['web_search']), [], 'told once')
  const on = changeNotes(known, start)
  assert.deepEqual(on.map((note) => note.update), [{ sessionUpdate: '_system_note', text: 'Turned on again by the user: web_search.', data: { kind: 'switch', on: ['web_search'] } }])
  assert.deepEqual(frozenPrompt([...records, ...off, ...on])?.state, start)
  // A conversation that never knew it hears nothing of it off, and finds it once it is on.
  const without = { ...start, tools: ['find_tools'] }
  assert.deepEqual(changeNotes(without, without, {}, ['web_search']), [])
  assert.deepEqual(changeNotes(without, start).map((note) => note.update.data), [{ kind: 'tools', added: ['web_search'] }])
})

test('a tool the user turned off stays in the requests that declared it, and is refused; find_tools never offers it (D304)', async () => {
  const call = { id: 'a', name: 'web_search', args: { x: 1 } }
  const { stream, requests } = fakeStream([
    [{ type: 'tool_call', call }, done('tool_use', { role: 'assistant', content: '', toolCalls: [call] })],
    [done('end', { role: 'assistant', content: 'done' })],
  ])
  /** @type {any[]} */
  const persisted = []
  const search = tool('web_search', { off: true })
  await runTurn({ brain, system: 's', history: [{ role: 'user', content: 'q' }], stream, tools: [tool('find_tools'), search], declared: ['find_tools', 'web_search'],
    rule: () => 'allow', persist: async (records) => { persisted.push(...records) } })
  assert.equal(persisted.findLast((record) => record.update?.toolCallId === 'a').update.rawOutput, 'The user turned web_search off.')
  assert.ok(requests.every((request) => request.tools.length === 2), 'the cache holds')
  assert.equal(await findTools({ tools: () => [search] }).run({ query: 'search' }, /** @type {any} */ ({ declared: [] })), 'There are no other tools.')
  assert.equal(await findTools({ tools: () => [search], none: 'Offer it.' }).run({ query: 'search' }, /** @type {any} */ ({ declared: [] })), 'Offer it.')
  // Nothing that does it: said so, and nothing unrelated declared (a weather question once got `look`).
  assert.equal(await findTools({ tools: () => [tool('read'), tool('look')] }).run({ query: 'weather forecast' }, /** @type {any} */ ({ declared: [], declare: () => assert.fail('nothing to declare') })), 'No tool does that. Those that can be found: read, look.')
})

test('find_tools finds no tool given only to other brains (D491)', async () => {
  const rows = tool('table_rows'), change = tool('table_change', { for: (/** @type {any} */ brain) => brain.provider !== 'lmstudio' })
  const ctx = (/** @type {string} */ provider) => /** @type {any} */ ({ declared: ['javascript'], brain: { provider } })
  assert.doesNotMatch(await findTools({ tools: () => [rows, change] }).run({ query: 'table' }, ctx('lmstudio')), /table_change/)
  assert.match(await findTools({ tools: () => [rows, change] }).run({ query: 'table' }, ctx('anthropic')), /table_change/)
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
  assert.equal(chooseBrain({ brains: [cloud], signals: { demand: 0.2 } })?.brain.model, 'claude-haiku-5-5')
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
  // In the cloud too: the preferred one unless it can't see, then one that can, and the preferred one when none can (D645).
  const blind = { ...cloud, id: 'b', provider: /** @type {const} */ ('openrouter'), model: 'reads/text-only' }
  const eyes = (/** @type {{ id: string }} */ candidate) => candidate.id !== 'b'
  assert.equal(chooseBrain({ brains: [blind, cloud], preferred: 'b', signals: { pictures: true }, sees: eyes })?.brain.id, 'c')
  assert.equal(chooseBrain({ brains: [blind, cloud], preferred: 'b', sees: eyes })?.brain.id, 'b')
  assert.equal(chooseBrain({ brains: [blind], signals: { pictures: true }, sees: eyes })?.brain.id, 'b')
  // Offline, a brain on this device answers, and says why; with none, the cloud's is tried as before (D269).
  assert.deepEqual(chooseBrain({ brains: [cloud, device], online: false, floor: 1 }), { brain: device, level: 1, reason: 'offline' })
  assert.equal(chooseBrain({ brains: [device], online: false })?.reason, 'only')
  assert.equal(chooseBrain({ brains: [cloud], online: false, signals: { demand: 0 } })?.brain.model, 'claude-haiku-5-5')
  assert.equal(chooseBrain({ brains: [cloud, device], online: true })?.brain.id, 'c')
  assert.deepEqual([0, 1, 2, 3].map((demand) => tierFor(demand)), [0, 1, 1, 2])
  assert.ok(isLocal({ ...brain, baseURL: 'http://127.0.0.1:11434/v1' }))
  assert.ok(!isLocal(brain))
})

test('Auto: each step any brain connected, how much it thinks, and a mix that climbs them (D773)', () => {
  const claude = { id: 'c', provider: /** @type {const} */ ('anthropic'), api: /** @type {const} */ ('anthropic'), baseURL: 'https://api.anthropic.com/v1', model: 'claude-opus-5-5' }
  const gemini = { id: 'g', provider: /** @type {const} */ ('gemini'), api: /** @type {const} */ ('openai'), baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.8-flash', effort: /** @type {const} */ ('medium') }
  const groq = { id: 'q', provider: /** @type {const} */ ('groq'), api: /** @type {const} */ ('openai'), baseURL: 'https://api.groq.com/openai/v1', model: 'kimi-k3' }
  const device = { id: 'd', provider: /** @type {const} */ ('device'), api: /** @type {const} */ ('device'), baseURL: '', model: 'gemma' }
  // With nothing set, the steps are the versions of the brain Auto leans on; one with none at a level has nothing there.
  assert.deepEqual(stepsOf({ brains: [claude, gemini], preferred: 'c' }).map((brain) => brain?.model), ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'])
  assert.deepEqual(stepsOf({ brains: [groq] }), [null, null, null])
  assert.deepEqual(stepsOf({ brains: [claude], has: (_, model) => model !== 'claude-haiku-5-5' }).map((brain) => brain?.model), [undefined, 'claude-sonnet-5-5', 'claude-opus-5-5'])
  // The plans' steps are versions their programs list: Claude Code's, and Antigravity's, which offers no Gemini deeper than Gemini 4's fast one.
  const listed = { claudecode: ['claude-opus-5-5', 'claude-fable-5-2', 'claude-sonnet-5-5', 'claude-haiku-5-5'], antigravity: ['gemini-4-hydrogen', 'gemini-3.8-flash', 'claude-sonnet-4-6', 'claude-opus-4-6-thinking', 'gpt-oss-120b-medium'] }
  const plan = (/** @type {'claudecode' | 'antigravity'} */ provider) => stepsOf({ brains: [{ id: 'p', provider, api: 'anthropic', baseURL: 'http://127.0.0.1:41000/v1', model: listed[provider][0] }], has: (_, model) => listed[provider].includes(model) }).map((brain) => brain?.model)
  assert.deepEqual(plan('claudecode'), ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'])
  assert.deepEqual(plan('antigravity'), ['gemini-3.8-flash', 'gemini-4-hydrogen', undefined])
  // A step the user set is any brain and version, whoever makes it; one whose brain isn't here gives way to the usual.
  const steps = [{ brain: 'g', model: 'gemini-3.5-flash-lite', effort: /** @type {const} */ ('low') }, null, { brain: 'q', model: 'kimi-k3', effort: /** @type {const} */ ('high') }]
  assert.deepEqual(stepsOf({ brains: [claude, gemini, groq], preferred: 'c', steps }).map((brain) => brain && `${brain.id}:${brain.model}`), ['g:gemini-3.5-flash-lite', 'c:claude-sonnet-5-5', 'q:kimi-k3'])
  assert.deepEqual(stepsOf({ brains: [claude], steps }).map((brain) => brain?.id), ['c', 'c', 'c'])
  assert.equal(stepsOf({ brains: [claude], steps: [{ effort: 'low' }] })[0]?.model, 'claude-haiku-5-5', 'a step that only says how much it thinks keeps its brain')
  // Auto climbs them as before: each step's brain and how much it thinks, its own setting before its brain's.
  const chosen = (/** @type {Partial<Parameters<typeof chooseBrain>[0]>} */ input) => { const choice = chooseBrain({ brains: [claude, gemini, groq, device], preferred: 'c', steps, ...input }); return choice && [`${choice.brain.id}:${choice.brain.model}`, choice.level, choice.effort] }
  assert.deepEqual(chosen({ signals: { demand: 0 } }), ['g:gemini-3.5-flash-lite', 0, 'low'])
  assert.deepEqual(chosen({ signals: { demand: 1 } }), ['c:claude-sonnet-5-5', 1, undefined])
  assert.deepEqual(chosen({ signals: { demand: 3 } }), ['q:kimi-k3', 2, 'high'])
  assert.deepEqual(chosen({ signals: { demand: 0 }, steps: [{ brain: 'g', model: 'gemini-3.5-flash-lite' }] }), ['g:gemini-3.5-flash-lite', 0, 'medium'], 'the brain’s own thinking, when its step says none')
  assert.deepEqual(chosen({ signals: { demand: 0 }, floor: 2 }), ['q:kimi-k3', 2, 'high'], 'never a step down')
  assert.equal(chooseBrain({ brains: [groq] })?.brain.model, 'kimi-k3', 'a brain with no steps answers as it is')
  // Personal, offline and kept on this device stay the device's, whatever the steps say.
  assert.equal(chosen({ signals: { demand: 0, personal: true } })?.[0], 'd:gemma')
  assert.equal(chosen({ online: false })?.[0], 'd:gemma')
  assert.equal(chosen({ cloud: false })?.[0], 'd:gemma')
  // A picture takes the step of a brain that sees it, or the usual version of one that does.
  assert.deepEqual(chosen({ signals: { demand: 0, pictures: true }, sees: (brain) => brain.id === 'c' })?.slice(0, 2), ['c:claude-haiku-5-5', 0])
  // Spend less starts every message at the bottom and thinks little there; Best answers goes to the top past a quick question, thinking thoroughly.
  const mixed = (/** @type {import('../app/ui/auto.js').Mix} */ mix, /** @type {number | undefined} */ demand, unhappy = false) => {
    const choice = chooseBrain({ brains: [claude], mix, signals: { demand, unhappy } })
    return choice && [choice.brain.model, choice.effort]
  }
  assert.deepEqual(mixed('less', 3), ['claude-haiku-5-5', 'low'])
  assert.deepEqual(mixed('less', 3, true), ['claude-sonnet-5-5', undefined], 'a step up when an answer falls short')
  assert.deepEqual(mixed('less', undefined), ['claude-haiku-5-5', 'low'])
  assert.deepEqual(mixed('balanced', undefined), ['claude-sonnet-5-5', undefined])
  assert.deepEqual(mixed('best', 0), ['claude-haiku-5-5', undefined])
  assert.deepEqual(mixed('best', 1), ['claude-opus-5-5', 'high'])
  assert.deepEqual(mixed('best', undefined), ['claude-opus-5-5', 'high'])
  assert.deepEqual(Object.keys(MIXES), ['less', 'balanced', 'best'])
  // A step can be a brain on this device or on this computer, which answers that step's messages, free; Auto still leans on
  // one in the cloud for the others, and a picture goes past one that can't see it.
  const lmstudio = { id: 'l', provider: /** @type {const} */ ('lmstudio'), api: /** @type {const} */ ('openai'), baseURL: 'http://localhost:1234/v1', model: 'qwen3.6-35b-a3b' }
  const near = [{ brain: 'd', model: 'gemma' }, null, null]
  assert.deepEqual(stepsOf({ brains: [device, claude], steps: near }).map((brain) => brain && `${brain.id}:${brain.model}`), ['d:gemma', 'c:claude-sonnet-5-5', 'c:claude-opus-5-5'])
  assert.deepEqual(stepsOf({ brains: [device, claude] }).map((brain) => brain?.id), ['c', 'c', 'c'], 'leaning on the cloud’s, though one on this device comes first')
  assert.deepEqual(chosen({ steps: near, signals: { demand: 0 } }), ['d:gemma', 0, undefined])
  assert.deepEqual(chosen({ steps: near, signals: { demand: 1 } }), ['c:claude-sonnet-5-5', 1, undefined])
  const served = chooseBrain({ brains: [claude, lmstudio], steps: [{ brain: 'l', model: 'qwen3.6-35b-a3b', effort: 'low' }], signals: { demand: 0 } })
  assert.deepEqual([served?.brain.id, served?.effort], ['l', 'low'])
  assert.deepEqual(chosen({ steps: near, signals: { demand: 0, pictures: true }, sees: (brain) => brain.api !== 'device' })?.[0], 'c:claude-haiku-5-5')
})

test('a task that starts with a skill named with / is that skill’s, all through: its brain, when it names one (D773)', () => {
  const names = ['make-a-site', 'reply-to-a-client']
  assert.equal(startedWith('/make-a-site for my bakery', [], names), 'make-a-site')
  assert.equal(startedWith('Make a site for my bakery', [], names), undefined)
  assert.equal(startedWith('/make-a-sites please', [], names), undefined)
  assert.equal(startedWith('first /reply-to-a-client, then /make-a-site', [], names), 'reply-to-a-client', 'the first it names')
  // Once sent, what its first message named is read from the note it came with, whatever the next ones name.
  const started = [noteRecord('', { kind: 'mentions', words: ['/make-a-site'], skills: ['make-a-site'] }), ...userRecords('/make-a-site for my bakery', [], 'dev')]
  assert.equal(startedWith('now /reply-to-a-client', started, names), 'make-a-site')
  assert.equal(startedWith('/make-a-site again', userRecords('hello', [], 'dev'), names), undefined, 'a task that started otherwise')
})

test('a second opinion comes from another maker’s brain, one in the cloud first, never the same maker’s through another service (D100)', () => {
  const claude = { id: 'c', provider: /** @type {const} */ ('anthropic'), api: /** @type {const} */ ('anthropic'), baseURL: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5' }
  const routed = { id: 'r', provider: /** @type {const} */ ('openrouter'), api: /** @type {const} */ ('openai'), baseURL: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-opus-5.5' }
  const plan = { id: 'p', provider: /** @type {const} */ ('antigravity'), api: /** @type {const} */ ('anthropic'), baseURL: 'http://127.0.0.1:9/antigravity/v1', model: 'claude-sonnet-4-6' }
  const gemini = { ...plan, id: 'g', model: 'gemini-3.8-flash' }
  const gpt = { id: 'o', provider: /** @type {const} */ ('openai'), api: /** @type {const} */ ('openai'), baseURL: 'https://api.openai.com/v1', model: 'gpt-6-sol' }
  const device = { id: 'd', provider: /** @type {const} */ ('device'), api: /** @type {const} */ ('device'), baseURL: '', model: 'gemma-4-e2b' }
  const mistral = { id: 'm', provider: /** @type {const} */ ('lmstudio'), api: /** @type {const} */ ('openai'), baseURL: 'http://localhost:1234/v1', model: 'mistral-small' }
  assert.equal(secondOpinion(claude, [claude, routed, plan]), undefined, 'Claude through OpenRouter or a Gemini plan is still Anthropic’s')
  assert.equal(secondOpinion(claude, [claude, device, gemini])?.id, 'g', 'one in the cloud before the device’s')
  assert.equal(secondOpinion(claude, [claude, mistral])?.id, 'm')
  assert.equal(secondOpinion(gpt, [gpt, plan])?.id, 'p')
  assert.equal(secondOpinion(gemini, [device, gpt])?.id, 'o', 'Gemma is Google’s too')
})

test('Auto: as much thinking as the request demands, a step more when the user is unhappy, never less; the brain’s own setting first (D414)', () => {
  assert.deepEqual([0, 1, 2, 3].map((demand) => chooseEffort({ signals: { demand } })), ['low', 'medium', 'medium', 'high'])
  assert.equal(chooseEffort({ signals: { demand: 0, unhappy: true } }), 'medium')
  assert.equal(chooseEffort({ signals: { demand: 3, unhappy: true } }), 'high')
  assert.equal(chooseEffort({ signals: { demand: 0 }, floor: 2 }), 'high')
  assert.equal(chooseEffort({ floor: 1 }), 'medium')
  // Without Intuition, nothing asked yet: the brain decides as it would.
  assert.equal(chooseEffort({}), undefined)
  assert.equal(chooseEffort({ setting: 'low', signals: { demand: 3 }, floor: 2 }), 'low')
})

test('suggestions are hidden from the reply, even while the block streams in', () => {
  assert.deepEqual(splitSuggestions('Done.\n\n<suggestions>\n- Show a chart\n2. Shorter\n</suggestions>'), { text: 'Done.', suggestions: ['Show a chart', 'Shorter'] })
  assert.deepEqual(splitSuggestions('Done.\n<sugg'), { text: 'Done.', suggestions: [] })
  assert.deepEqual(splitSuggestions('a < b'), { text: 'a < b', suggestions: [] })
  // A tag broken over lines, as some brains write it.
  assert.deepEqual(splitSuggestions('Done.\n<suggestions\n>\n- Shorter\n</suggestions\n>'), { text: 'Done.', suggestions: ['Shorter'] })
  assert.deepEqual(splitSuggestions('Done.\n<suggestions\n'), { text: 'Done.', suggestions: [] })
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
