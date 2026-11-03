import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { release, tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { agent } from '../cli/acp.js'
import { peer, RpcError } from '../cli/rpc.js'
import { LLMError } from '../app/core/llm.js'
import { setLoader, useStrings } from '../app/core/i18n.js'
import { memoryFS, walk } from '../app/core/fs.js'
import { syncRound } from '../app/caps/sync/mirror.js'
import { nodeFS } from '../cli/fs.js'

setLoader(async (lang, part) => (part === 'cli' ? JSON.parse(await readFile(new URL(`../cli/locales/${lang}.json`, import.meta.url), 'utf8')) : null))
await useStrings('cli')

/**
 * A brain of the test's own: each request gets the next step's events (or what a step function gives).
 * @param {any[]} steps
 */
function scripted(steps) {
  /** @type {{ system: string, messages: any[], tools: any[] }[]} */
  const asked = []
  /** @param {any} request */
  async function* stream({ system, messages, tools, signal }) {
    asked.push({ system, messages: [...messages], tools })
    const step = steps.shift() ?? [{ type: 'text', delta: 'Nothing more.' }]
    const events = typeof step === 'function' ? await step({ signal }) : step
    const calls = events.filter((/** @type {any} */ event) => event.type === 'tool_call').map((/** @type {any} */ event) => event.call)
    let content = ''
    for (const event of events) {
      if (event.type === 'text') content += event.delta
      yield event
    }
    yield { type: 'done', stopReason: calls.length ? 'tool_use' : 'end', message: { role: 'assistant', content, ...(calls.length && { toolCalls: calls }) } }
  }
  return { stream, asked }
}

const call = (/** @type {string} */ id, /** @type {string} */ name, /** @type {any} */ args) => ({ type: 'tool_call', call: { id, name, args } })

/**
 * Jean's folder (Sync's), a project kept to the editor's folder "work", and an editor speaking ACP to an agent on them.
 * @param {import('node:test').TestContext} t
 * @param {{ capabilities?: object, answer?: string, brain?: string, stream?: any, sync?: boolean, base?: string, buffers?: Record<string, string> }} [options]
 */
async function setup(t, { capabilities = {}, answer = 'allow_once', brain = 'custom:test', stream, sync = true, base, buffers = {} } = {}) {
  if (!base) {
    base = await mkdtemp(join(tmpdir(), 'cli-acp-'))
    const made = base
    t.after(() => rm(made, { recursive: true, force: true }))
    await mkdir(join(base, 'Jean', 'projects', '01JA0000000000000000000000-work'), { recursive: true })
    await mkdir(join(base, 'work'))
    if (sync) await writeFile(join(base, 'Jean', 'mirror.json'), '{"format":1}\n')
    await writeFile(join(base, 'Jean', 'projects', '01JA0000000000000000000000-work', 'project.md'), '---\nformat: 1\nname: Work\nfolder: work\n---\n')
    await writeFile(join(base, 'Jean', 'memory.md'), '---\nformat: 1\nkind: memory\n---\n- Likes short answers <!-- at=2026-10-01T00:00:00.000Z by=jean -->\n')
    await writeFile(join(base, 'work', 'notes.md'), 'Hello wrold\n')
  }
  const folder = join(base, 'Jean')
  const cwd = join(base, 'work')
  const there = new PassThrough()
  const back = new PassThrough()
  const { closed } = agent({ input: there, write: (line) => back.write(line), folder, brain, address: 'http://127.0.0.1:9/v1', version: '0.0.0', env: {}, stream })
  t.after(() => there.end())
  /** @type {any[]} */
  const updates = []
  /** @type {any[]} */
  const asked = []
  /** @type {any[]} */
  const written = []
  /** @type {string[]} */
  const terminals = []
  const editor = peer({ input: back, write: (line) => there.write(line), handle: async (method, params) => {
    if (method === 'session/update') return void updates.push(params.update)
    if (method === 'session/request_permission') {
      asked.push(params)
      return { outcome: { outcome: 'selected', optionId: answer } }
    }
    if (method === 'fs/read_text_file') return { content: buffers[params.path] ?? await readFile(params.path, 'utf8') }
    if (method === 'fs/write_text_file') {
      written.push(params)
      await writeFile(params.path, params.content)
      return null
    }
    if (method === 'terminal/create') return { terminalId: `term-${terminals.push(params.args.at(-1))}` }
    if (method === 'terminal/wait_for_exit') return { exitCode: 0, signal: null }
    if (method === 'terminal/output') return { output: 'hi\n', truncated: false, exitStatus: { exitCode: 0, signal: null } }
    if (method === 'terminal/release') return null
    throw new RpcError(-32601, method)
  } })
  const ready = await editor.request('initialize', { protocolVersion: 1, clientCapabilities: capabilities })
  return { base, folder, cwd, editor, updates, asked, written, terminals, closed, ready, end: () => there.end() }
}

/** The conversation's records, as kept. @param {string} folder @param {string} id */
async function kept(folder, id) {
  for (const project of await readdir(join(folder, 'projects'))) {
    const text = await readFile(join(folder, 'projects', project, 'conversations', `${id}.jsonl`), 'utf8').catch(() => null)
    if (text) return { project, records: text.trim().split('\n').slice(1).map((line) => JSON.parse(line)) }
  }
  return null
}

test('initialize says what Jean takes, and a session is a conversation in the project on the editor’s folder', async (t) => {
  const { editor, folder, cwd, ready } = await setup(t)
  assert.equal(ready.protocolVersion, 1)
  assert.deepEqual(ready.agentCapabilities, { loadSession: true, promptCapabilities: { image: true, embeddedContext: true }, mcpCapabilities: { http: true } })
  assert.deepEqual(ready.agentInfo, { name: 'jean-cli', title: 'Jean', version: '0.0.0' })
  // An editor that can't run a sign-in in a terminal is offered none.
  assert.deepEqual(ready.authMethods, [])
  const { sessionId } = await editor.request('session/new', { cwd, mcpServers: [] })
  assert.match(sessionId, /^[0-9A-HJKMNP-TV-Z]{26}$/)
  assert.equal((await kept(folder, sessionId))?.project, '01JA0000000000000000000000-work')
  // Who writes, kept at the top of the folder, which a mirror never carries.
  assert.match(JSON.parse(await readFile(join(folder, 'settings.json'), 'utf8')).device, /^[0-9A-HJKMNP-TV-Z]{26}$/)
})

test('a change is asked with its diff, read from the editor’s unsaved buffer and written through it, and the answer comes without its follow-ups', async (t) => {
  const brain = scripted([
    [call('c1', 'open', { path: 'notes.md' })],
    [call('c2', 'change', { path: 'notes.md', old: 'wrold', new: 'world' })],
    [{ type: 'text', delta: 'Fixed the typo.\n\n<suggestions>\nCheck the rest\n</suggestions>' }],
  ])
  const capabilities = { fs: { readTextFile: true, writeTextFile: true } }
  /** @type {Record<string, string>} */
  const buffers = {}
  const { editor, folder, cwd, updates, asked, written } = await setup(t, { capabilities, stream: brain.stream, buffers })
  const notes = join(cwd, 'notes.md')
  // The editor holds a change not saved yet.
  buffers[notes] = 'Hello wrold, not saved yet\n'
  const { sessionId } = await editor.request('session/new', { cwd, mcpServers: [] })
  const { stopReason } = await editor.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Fix the typo' }] })
  assert.equal(stopReason, 'end_turn')
  assert.equal(await readFile(notes, 'utf8'), 'Hello world, not saved yet\n')
  assert.deepEqual(written, [{ sessionId, path: notes, content: 'Hello world, not saved yet\n' }])
  assert.equal(asked.length, 1)
  assert.deepEqual(asked[0].options.map((/** @type {any} */ option) => [option.kind, option.name]), [['allow_once', 'Allow once'], ['allow_always', 'Always allow'], ['reject_once', 'Not now'], ['reject_always', 'Never']])
  assert.deepEqual(asked[0].toolCall.content, [{ type: 'diff', path: notes, oldText: 'Hello wrold, not saved yet\n', newText: 'Hello world, not saved yet\n' }])
  // The editor sees the calls with full paths, never Jean's own entry for the brain's step, and the answer alone.
  const opened = updates.find((update) => update.sessionUpdate === 'tool_call' && update.toolCallId === 'c1')
  assert.deepEqual(opened.locations, [{ path: notes }])
  assert.ok(!updates.some((update) => String(update.toolCallId).startsWith('brain-')))
  assert.equal(updates.filter((update) => update.sessionUpdate === 'agent_message_chunk').map((update) => update.content.text).join(''), 'Fixed the typo.')
  // The brain was told of the folder, of what Jean noticed, and of its tools.
  assert.match(brain.asked[0].system, /<folder>\nThe user's folder "work" is open in their editor/)
  assert.match(brain.asked[0].system, /Likes short answers/)
  assert.deepEqual(brain.asked[0].tools.map((/** @type {any} */ tool) => tool.name).sort(), ['change', 'find_in_files', 'list', 'open', 'read', 'recall', 'remember', 'skill'])
  // Kept as the browser keeps it: the diff by its path in the folder, the answer with its follow-ups.
  const { records } = /** @type {NonNullable<Awaited<ReturnType<typeof kept>>>} */ (await kept(folder, sessionId))
  assert.ok(records[0].meta.prompt.system.includes('<folder>'))
  assert.equal(records[1].update.content.text, 'Fix the typo')
  const changed = records.findLast((record) => record.update?.toolCallId === 'c2')
  assert.equal(changed.update.status, 'completed')
  assert.equal(changed.update.content[0].path, 'notes.md')
  assert.match(records.findLast((record) => record.update?.sessionUpdate === 'agent_message_chunk').update.content.text, /<suggestions>/)
})

test('a conversation opened again is told to the editor as it went, and goes on', async (t) => {
  const first = await setup(t, { stream: scripted([[{ type: 'text', delta: 'Hello.' }]]).stream })
  const { sessionId } = await first.editor.request('session/new', { cwd: first.cwd, mcpServers: [] })
  await first.editor.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Hi' }] })
  first.end()
  const brain = scripted([[{ type: 'text', delta: 'Again.' }]])
  const second = await setup(t, { base: first.base, stream: brain.stream })
  assert.equal(await second.editor.request('session/load', { sessionId, cwd: second.cwd, mcpServers: [] }), null)
  assert.deepEqual(second.updates.map((update) => [update.sessionUpdate, update.content?.text]), [['user_message_chunk', 'Hi'], ['agent_message_chunk', 'Hello.']])
  await second.editor.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Once more' }] })
  assert.deepEqual(brain.asked[0].messages.map((/** @type {any} */ message) => [message.role, message.content]), [['user', 'Hi'], ['assistant', 'Hello.'], ['user', 'Once more']])
  await assert.rejects(second.editor.request('session/load', { sessionId: '01JA0000000000000000000099', cwd: second.cwd, mcpServers: [] }), /isn’t in .* anymore/)
})

test('a summary is told only to an editor that says it takes them, on replay too, without what the brain reads, which the brain reads on from (D359)', async (t) => {
  const first = await setup(t, { stream: scripted([[{ type: 'text', delta: 'Hello.' }]]).stream })
  const { sessionId } = await first.editor.request('session/new', { cwd: first.cwd, mcpServers: [] })
  await first.editor.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Hi' }] })
  first.end()
  // The browser summed the conversation up, and Sync brought the record.
  const { project } = /** @type {NonNullable<Awaited<ReturnType<typeof kept>>>} */ (await kept(first.folder, sessionId))
  const update = { sessionUpdate: 'compaction_update', compactionId: '01JA0000000000000000000077', status: 'completed', summary: [{ type: 'text', text: 'They said hi.' }], _meta: { text: '<summary>\nThey said hi.\n</summary>', reason: 'window' } }
  await writeFile(join(first.folder, 'projects', project, 'conversations', `${sessionId}.jsonl`), `${JSON.stringify({ at: new Date().toISOString(), by: 'jean', step: 0, update })}\n`, { flag: 'a' })
  const plain = await setup(t, { base: first.base })
  await plain.editor.request('session/load', { sessionId, cwd: plain.cwd, mcpServers: [] })
  assert.ok(!plain.updates.some((one) => one.sessionUpdate === 'compaction_update'))
  plain.end()
  const brain = scripted([[{ type: 'text', delta: 'Again.' }]])
  const taking = await setup(t, { base: first.base, capabilities: { session: { compaction: true } }, stream: brain.stream })
  await taking.editor.request('session/load', { sessionId, cwd: taking.cwd, mcpServers: [] })
  assert.deepEqual(taking.updates.find((one) => one.sessionUpdate === 'compaction_update'), { ...update, _meta: { reason: 'window' } })
  await taking.editor.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Once more' }] })
  assert.deepEqual(brain.asked[0].messages.map((/** @type {any} */ message) => [message.role, message.content]), [['user', update._meta.text], ['user', 'Once more']])
})

test('session/cancel stops the answer, which ends as cancelled', async (t) => {
  const brain = scripted([async (/** @type {{ signal: AbortSignal }} */ { signal }) => {
    await new Promise((resolve) => signal.addEventListener('abort', resolve))
    throw new LLMError('Request aborted', { code: 'aborted' })
  }])
  const { editor, cwd } = await setup(t, { stream: brain.stream })
  const { sessionId } = await editor.request('session/new', { cwd, mcpServers: [] })
  const answered = editor.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Take your time' }] })
  while (!brain.asked.length) await new Promise((resolve) => setTimeout(resolve, 5))
  editor.notify('session/cancel', { sessionId })
  assert.deepEqual(await answered, { stopReason: 'cancelled' })
})

test('a command runs in the editor’s terminal, asked first, and the call shows that terminal', async (t) => {
  const brain = scripted([[call('c1', 'bash', { command: 'echo hi' })], [{ type: 'text', delta: 'It said hi.' }]])
  const { editor, cwd, updates, asked, terminals } = await setup(t, { capabilities: { terminal: true }, stream: brain.stream })
  const { sessionId } = await editor.request('session/new', { cwd, mcpServers: [] })
  await editor.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Say hi' }] })
  assert.deepEqual(terminals, ['echo hi'])
  assert.equal(asked[0].toolCall.title, 'Command: echo hi')
  const done = updates.findLast((update) => update.toolCallId === 'c1')
  assert.equal(done.status, 'completed')
  assert.deepEqual(done.content[0], { type: 'terminal', terminalId: 'term-1' })
  assert.equal(done.rawOutput, 'hi\nExit code: 0')
})

test('a service the editor connects, a program on its input and output, has its tools found and called, asked first', async (t) => {
  const brain = scripted([[call('c1', 'notes_echo', { text: 'hi' })], [{ type: 'text', delta: 'Done.' }]])
  const { editor, cwd, base, updates, asked } = await setup(t, { stream: brain.stream })
  const server = join(base, 'server.mjs')
  await writeFile(server, `import { createInterface } from 'node:readline'
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line)
  const reply = (result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\\n')
  if (message.method === 'initialize') reply({ protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'notes', version: '1' } })
  else if (message.method === 'tools/list') reply({ tools: [{ name: 'echo', description: 'Says it back', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] })
  else if (message.method === 'tools/call') reply({ content: [{ type: 'text', text: 'echo: ' + message.params.arguments.text }] })
}
`)
  const { sessionId } = await editor.request('session/new', { cwd, mcpServers: [{ name: 'Notes', command: process.execPath, args: [server], env: [] }] })
  await editor.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Echo hi' }] })
  assert.match(brain.asked[0].system, /<connections>\n- Notes: notes_echo\n<\/connections>/)
  assert.ok(brain.asked[0].tools.some((/** @type {any} */ tool) => tool.name === 'find_tools'))
  assert.equal(asked[0].toolCall.title, 'Notes: echo')
  assert.equal(updates.findLast((update) => update.toolCallId === 'c1').rawOutput, 'echo: hi')
})

test('a file the editor names is shared as the browser shares one: kept in the project, read by the brain', async (t) => {
  const brain = scripted([[{ type: 'text', delta: 'Read it.' }]])
  const { editor, cwd, folder } = await setup(t, { stream: brain.stream })
  await writeFile(join(cwd, 'todo.txt'), 'Buy milk\n')
  const { sessionId } = await editor.request('session/new', { cwd, mcpServers: [] })
  await editor.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Look' }, { type: 'resource_link', uri: `file://${join(cwd, 'todo.txt')}`, name: 'todo.txt' }] })
  assert.deepEqual(brain.asked[0].messages.at(-1).documents, [{ name: 'todo.txt', source: 1, text: 'Buy milk' }])
  const files = await readdir(join(folder, 'projects', '01JA0000000000000000000000-work', 'files'))
  assert.deepEqual(files.map((file) => file.replace(/sha256-\w+/, 'sha256-…')).sort(), ['sha256-….md', 'sha256-….meta.json', 'sha256-….txt'])
})

test('a folder of other files is refused, and with no brain to answer a session asks for a sign-in (ACP’s auth_required)', async (t) => {
  const lost = await setup(t, { sync: false })
  await assert.rejects(lost.editor.request('session/new', { cwd: lost.cwd, mcpServers: [] }), /isn’t a folder Sync keeps\. Give the one you chose in Settings › Your data\./)
  const brainless = await setup(t, { brain: 'device' })
  await assert.rejects(brainless.editor.request('session/new', { cwd: brainless.cwd, mcpServers: [] }), { code: -32000, message: /No brain can answer yet/ })
  const nameless = await setup(t, { brain: 'openai' })
  await assert.rejects(nameless.editor.request('session/new', { cwd: nameless.cwd, mcpServers: [] }), { code: -32603, message: /--brain openai:<its name>/ })
})

test('an editor that runs a sign-in in a terminal is offered Claude Code’s, as `jean-cli --login`', async (t) => {
  const method = { id: 'claude-code', name: 'Sign in with your Claude plan', type: 'terminal', args: ['--login'] }
  assert.deepEqual((await setup(t, { capabilities: { auth: { terminal: true } } })).ready.authMethods, [method])
  // The older word for it, which the ACP Registry's check still sends.
  assert.deepEqual((await setup(t, { capabilities: { _meta: { 'terminal-auth': true } } })).ready.authMethods, [method])
})

test('a folder not made yet becomes Sync’s, as an empty one does in the browser, and the session goes to its home project', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'cli-acp-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  await mkdir(join(base, 'work'))
  const { editor, folder, cwd } = await setup(t, { base })
  const { sessionId } = await editor.request('session/new', { cwd, mcpServers: [] })
  const mark = JSON.parse(await readFile(join(folder, 'mirror.json'), 'utf8'))
  assert.equal(mark.kind, 'mirror')
  assert.equal(mark.by, JSON.parse(await readFile(join(folder, 'settings.json'), 'utf8')).device)
  const { project } = /** @type {NonNullable<Awaited<ReturnType<typeof kept>>>} */ (await kept(folder, sessionId))
  assert.match(await readFile(join(folder, 'projects', project, 'project.md'), 'utf8'), /^default: true$/m)
})

/** What Finder reads for a folder's icon: its mark (Customize Folder's) and whether its custom-icon flag is up. @param {string} folder */
async function icon(folder) {
  const read = (/** @type {string[]} */ ...args) => new Promise((done) => execFile('/usr/bin/xattr', [...args, folder], (error, out) => done(error ? null : out.trim())))
  const info = /** @type {string | null} */ (await read('-px', 'com.apple.FinderInfo'))
  return { mark: await read('-p', 'com.apple.icon.folder#S'), custom: !!info && (parseInt(info.replace(/\s/g, '').slice(16, 18), 16) & 0x04) !== 0 }
}

test('on a Mac, a folder jean-cli sets up shows ～ on its icon; one Sync keeps already, or with a mark of the person’s, stays as it is', { skip: (process.platform !== 'darwin' || Number(release().split('.')[0]) < 25) && 'macOS 26 or later' }, async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'cli-acp-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  await mkdir(join(base, 'work'))
  const made = await setup(t, { base })
  await made.editor.request('session/new', { cwd: made.cwd, mcpServers: [] })
  assert.deepEqual(await icon(made.folder), { mark: '{"emoji":"～"}', custom: true })
  const kept = await setup(t)
  await kept.editor.request('session/new', { cwd: kept.cwd, mcpServers: [] })
  assert.deepEqual(await icon(kept.folder), { mark: null, custom: false })
  const theirs = await mkdtemp(join(tmpdir(), 'cli-acp-'))
  t.after(() => rm(theirs, { recursive: true, force: true }))
  await mkdir(join(theirs, 'work'))
  await mkdir(join(theirs, 'Jean'))
  await new Promise((done) => execFile('/usr/bin/xattr', ['-w', 'com.apple.icon.folder#S', '{"sym":"star"}', join(theirs, 'Jean')], done))
  const chosen = await setup(t, { base: theirs })
  await chosen.editor.request('session/new', { cwd: chosen.cwd, mcpServers: [] })
  assert.deepEqual(await icon(chosen.folder), { mark: '{"sym":"star"}', custom: false })
})

/** jean-cli as a program, on a home folder of its own, its words in English. @param {string[]} args @param {string} home @param {Record<string, string>} [env] */
const program = (args, home, env = {}) => spawn(process.execPath, ['cli/main.js', ...args], { env: { HOME: home, PATH: home, LANG: 'en_US.UTF-8', ...env } })

test('started as the ACP Registry starts it, with no folder named, it waits; with no brain it asks for a sign-in and makes nothing, with a key it keeps ~/Jean', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'cli-home-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  /** @param {Record<string, string>} [env] */
  const editor = async (env) => {
    const child = program(['acp'], home, env)
    t.after(() => child.kill())
    const it = peer({ input: child.stdout, write: (line) => child.stdin.write(line), handle: async () => null })
    return { it, ready: await it.request('initialize', { protocolVersion: 1, clientCapabilities: { _meta: { 'terminal-auth': true } } }) }
  }
  const signedOut = await editor()
  assert.deepEqual(signedOut.ready.authMethods.map((/** @type {any} */ method) => method.type), ['terminal'])
  await assert.rejects(signedOut.it.request('session/new', { cwd: home, mcpServers: [] }), { code: -32000 })
  assert.deepEqual(await readdir(home), [])
  const keyed = await editor({ ANTHROPIC_API_KEY: 'test' })
  await keyed.it.request('session/new', { cwd: home, mcpServers: [] })
  assert.equal(JSON.parse(await readFile(join(home, 'Jean', 'mirror.json'), 'utf8')).kind, 'mirror')
})

test('`jean-cli --login` signs in to Claude Code in the terminal the editor opens, and says what to do where there is none', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'cli-home-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  /** @param {string[]} args @returns {Promise<{ code: number | null, said: string }>} */
  const run = (args) => new Promise((done) => {
    const child = program(args, home)
    let said = ''
    child.stdout.on('data', (chunk) => { said += chunk })
    child.stderr.on('data', (chunk) => { said += chunk })
    child.once('exit', (code) => done({ code, said }))
  })
  const missing = await run(['acp', '--login'])
  assert.equal(missing.code, 1)
  assert.match(missing.said, /Claude Code isn’t on this computer/)
  await writeFile(join(home, 'claude'), '#!/bin/sh\necho "claude $*"\n', { mode: 0o755 })
  // ACP appends the method's arguments to the editor's own; an editor that puts them in their place gets the same.
  for (const args of [['acp', '--login'], ['--login']]) assert.deepEqual(await run(args), { code: 0, said: 'claude auth login\n' })
})

test('a conversation made in the editor reaches the browser at its next round, and one appended meanwhile follows at the next', async (t) => {
  const brain = scripted([[{ type: 'text', delta: 'One.' }], [{ type: 'text', delta: 'Two.' }]])
  const { editor, cwd, folder } = await setup(t, { stream: brain.stream })
  const browser = memoryFS()
  const { sessionId } = await editor.request('session/new', { cwd, mcpServers: [] })
  await editor.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'First' }] })
  await syncRound(browser, nodeFS(folder))
  const path = (await walk(browser)).find((file) => file.endsWith(`/conversations/${sessionId}.jsonl`))
  assert.ok(path, 'the conversation is in the browser')
  assert.ok(!(await walk(browser)).includes('settings.json'), "this computer's settings stay here")
  const answered = editor.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Second' }] })
  await syncRound(browser, nodeFS(folder))
  await answered
  await syncRound(browser, nodeFS(folder))
  assert.match(String(await browser.read(path)), /"Second"[\s\S]*"Two\."/)
})
