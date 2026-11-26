// SPDX-License-Identifier: MIT
// Reports for support (D771): what a report keeps of a profile full of the person's own words, names, addresses and keys (none of them),
// what it says of where a request waited, the log scrubbed, a stand-in made from it that Jean's own restore opens, and the trail of a
// request through the hooks that hold it, the chain otherwise the same.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { build, markdown, scrub, shape, scriptOf, addressOf } from '../app/caps/report/build.js'
import { standIn, filler, filled } from '../app/caps/report/standin.js'
import { memoryFS } from '../app/core/fs.js'
import { fire } from '../app/core/hooks.js'
import { readZip, writeZip } from '../app/core/zip.js'
import { importBackup } from '../app/caps/backup/archive.js'
import { loadConversation } from '../app/core/conversations.js'
import { listProjects, loadSettings } from '../app/core/settings.js'
import { PROVIDERS } from '../app/core/llm.js'

// ui/trail.js reads the room (state.js, caps.js) and the page's events: stand-ins for them.
const UI = new URL('../app/ui/', import.meta.url).href
registerHooks({ load(url, context, next) {
  if (url === `${UI}state.js`) return { format: 'module', shortCircuit: true, source: 'export const app = { current: { peek: () => null }, busy: { peek: () => false } }; export const runs = new Map(); export const decisionsHere = () => []' }
  if (url === `${UI}caps.js`) return { format: 'module', shortCircuit: true, source: 'export const unlock = async () => true' }
  return next(url, context)
} })
Object.assign(globalThis, { document: { addEventListener() {} }, addEventListener() {} })

const ORIGIN = 'https://jean.is'
// What a person wrote, named or keyed, which no report may hold.
const SECRETS = ['Marie Dupont', 'marie@acme.example', 'Projet Hermès', 'confidential-plan.pdf', 'sk-live-5544332211', 'acme-prod-4471', 'llm.acme.internal', 'the merger',
  '14 rue de la Paix', 'Contrat Dupont', 'secret plan', 'acme.sharepoint.example', 'Q3-salaries', '01M8BSD50QQ7K1X3GZDPBFPP60', 'never mention salaries']
const TASK = 'projects/01M8B0000000000000000HOME-home/conversations/01M8BSD50QQ7K1X3GZDPBFPP60.jsonl'
const at = (/** @type {number} */ s) => new Date(Date.UTC(2026, 10, 26, 9, 0, s)).toISOString()

/** A profile and a task as the room would gather them, full of the person's own. */
const gathered = (include = false) => ({
  made: Date.UTC(2026, 10, 26, 9, 1), why: 'stalled', origin: ORIGIN, include,
  jean: { version: '0.26.0', host: 'jean.is' }, browser: { brands: [{ brand: 'Google Chrome', version: '158.0.8127.37' }], platform: 'macOS', language: 'fr' },
  settings: { format: 1, locale: 'fr', name: 'Marie Dupont', auto: true, cloud: true, limit: 20, unlocked: ['files', 'connections', 'reflexes'], offers: { memory: at(1) }, rules: { fetch: 'ask' }, voice: null,
    guards: [{ id: 'no-salaries', pattern: 'Q3-salaries' }], grouped: ['Projet Hermès'], maskWords: ['Dupont'], activeBrain: '01M8B00000000000000000BRN1',
    urls: { gateway: 'https://acme.sharepoint.example/gateway' },
    brains: [{ id: '01M8B00000000000000000BRN1', provider: 'vertex', api: 'openai', model: 'google/gemini-3.8-flash', baseURL: 'https://aiplatform.googleapis.com/v1/projects/acme-prod-4471/locations/global/endpoints/openapi', label: 'Marie Dupont brain' },
      { id: '01M8B00000000000000000BRN2', provider: 'custom', api: 'openai', model: 'acme-llm', baseURL: 'https://llm.acme.internal/v1', headers: { 'x-team': 'the merger' } },
      { id: '01M8B00000000000000000BRN3', provider: 'mistral', api: 'openai', model: 'mistral-medium-latest', baseURL: 'https://api.mistral.ai/v1' }],
    connections: [{ id: '01M8B00000000000000000CON1', name: 'Google Workspace', url: 'https://workspace.example/mcp', auth: 'oauth' }, { id: '01M8B00000000000000000CON2', name: 'Acme CRM', url: 'https://acme.sharepoint.example/mcp', auth: 'key' }] },
  policy: { brains: [{ id: 'acme', label: 'Projet Hermès' }], urls: { support: 'mailto:marie@acme.example' }, rules: { share: 'never' } },
  words: ['files', 'connections', 'reflexes', 'memory', 'receipt', 'vertex', 'mistral', 'custom', 'fetch', 'ask', 'turn.step', 'gateway', 'google-workspace', 'read_file', 'search'],
  tools: ['read_file'], defaults: { gateway: '', 'provider:vertex': PROVIDERS.vertex.baseURL, 'provider:mistral': PROVIDERS.mistral.baseURL }, keyed: ['01M8B00000000000000000BRN3'],
  directory: { 'https://workspace.example/mcp': 'google-workspace' },
  projects: [{ dir: 'projects/01M8B0000000000000000HOME-home', data: { default: true, name: 'Projet Hermès', assistantName: 'Marie' }, body: 'never mention salaries', current: true }],
  skills: [{ name: 'Contrat Dupont', body: 'the merger', ready: false }, { name: 'make-a-deck', body: 'Decks', ready: true }],
  routines: [{ place: 'home', count: 1 }], flows: 0, memory: 2,
  extensions: [{ name: 'acme-secret', source: 'file', hooks: ['turn.step'], slots: [], rights: ['network'], on: true }], status: { '01M8B00000000000000000CON1': { tools: [{}, {}], error: 'auth' } },
  now: { busy: true, presence: 'thinking', task: TASK, runs: [{ path: TASK, provider: 'mistral', model: 'mistral-medium-latest', steps: 0, stopped: false }],
    trail: { began: Date.UTC(2026, 10, 26, 9, 0, 10), path: TASK, stages: [{ id: 'choose', at: 0, ms: 12 }, { id: 'prepare', at: 12, ms: 40 }, { id: 'ask', brain: 'mistral', at: 52, ms: 3 }, { id: 'hook', by: 'receipt', on: 'turn.step', at: 55 }] },
    ended: [], attempts: [{ at: Date.UTC(2026, 10, 26, 9, 0, 10), busy: false, asked: false, reached: 4 }], waiting: [{ path: TASK, kind: 'question' }],
    hooks: [{ by: 'receipt', on: 'turn.step', tier: 'jean' }, { by: 'acme-secret', on: 'turn.step', tier: 'user' }], loaded: ['files', 'receipt'], denied: [], probes: { storage: 3, ready: 'no answer' } },
  task: { path: TASK, records: [
    { at: at(0), by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Write to Marie Dupont about the merger at 14 rue de la Paix' } } },
    { at: at(1), by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'resource_link', uri: 'files/abc.pdf', name: 'confidential-plan.pdf', mimeType: 'application/pdf', size: 1200 } } },
    { at: at(2), by: 'jean', step: 0, update: { sessionUpdate: 'tool_call', toolCallId: 'brain-0', title: 'x', kind: 'think', status: 'failed', rawInput: { provider: 'mistral', model: 'mistral-medium-latest' },
      rawOutput: { error: "Bad request: 'Write to Marie Dupont about the merger'", code: 'bad_request', status: 400 }, _meta: { ms: 900 } } },
    { at: at(3), by: 'jean', step: 0, update: { sessionUpdate: 'tool_call', toolCallId: 'c1', name: 'google_workspace__send', title: 'Send', kind: 'other', status: 'completed', rawInput: { to: 'marie@acme.example', body: 'the merger', count: 2 }, _meta: { limitedUse: true, ms: 40 } } },
    { at: at(4), by: 'jean', step: 0, update: { sessionUpdate: 'plan', entries: [{ content: 'secret plan', status: 'pending', priority: 'high' }] } },
    { at: at(5), by: 'jean', step: 1, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Accès direct bloqué : le connecteur Google pour Marie Dupont' } } },
    { at: at(6), by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'retente' } } },
  ] },
  log: [{ at: Date.UTC(2026, 10, 26, 9, 0, 30), level: 'warn', text: 'connections on turn.step TypeError: "marie@acme.example" failed at https://acme.sharepoint.example/x?id=4471 /Users/marie/secret plan/x.txt',
    stack: `TypeError: x\n    at refused (${ORIGIN}/caps/connections/connections.js:296:9)\n    at /Users/marie/elsewhere.js:1:1` }],
})

test('a report keeps none of the person’s words, names, addresses or keys, in its JSON or its page', () => {
  const report = build(/** @type {any} */ (gathered()))
  const all = `${JSON.stringify(report)}\n${markdown(report, (key) => key)}`
  for (const secret of SECRETS) assert.ok(!all.includes(secret), `the report holds ${secret}`)
})

test('a report says where the request waited, whose hook held it, and what helps to see why', () => {
  const report = build(/** @type {any} */ (gathered()))
  assert.deepEqual(report.now.trail.stages.at(-1), { id: 'hook', by: 'receipt', on: 'turn.step', at: 55 })
  assert.equal(report.now.trail.task, report.now.task)
  assert.deepEqual(report.now.hooks, ['receipt turn.step jean', 'other turn.step user'])
  assert.equal(report.now.probes.ready, 'no answer')
  assert.deepEqual(report.settings.brains.map((/** @type {any} */ brain) => [brain.provider, brain.model, brain.address, brain.key]),
    [['vertex', 'google/gemini-3.8-flash', 'elsewhere', false], ['custom', 'acme-llm', 'elsewhere', false], ['mistral', 'mistral-medium-latest', 'default', true]])
  assert.equal(report.settings.activeBrain, report.settings.brains[0].id)
  assert.deepEqual(report.settings.connections.map((/** @type {any} */ one) => one.known), ['google-workspace', 'own'])
  assert.deepEqual(report.context.connections[0], { id: report.settings.connections[0].id, tools: 2, error: 'auth' })
  assert.deepEqual(report.context.skills.map((/** @type {any} */ skill) => skill.name), [{ text: 14, script: 'Latin' }, 'make-a-deck'])
  const [request, file, brain, call] = report.task.last
  assert.deepEqual(request.text, shape('Write to Marie Dupont about the merger at 14 rue de la Paix'))
  assert.deepEqual(file.file.name, { text: 21, script: 'Latin' })
  assert.equal(brain.code, 'bad_request')
  assert.equal(brain.http, 400)
  assert.deepEqual([call.tool, call.kind, call.limitedUse, call.args.count], ['other', 'other', true, 2])
  assert.equal(report.task.last.at(-1).text.text, 7)
  assert.match(report.log[0].text, /^connections on turn\.step TypeError: ‹…› failed at ‹address› ‹path›\nat refused \/caps\/connections\/connections\.js:296:9$/)
})

test('a task’s words go only when the person chose them, and only the task’s', () => {
  const report = build(/** @type {any} */ (gathered(true)))
  assert.equal(report.task.last[0].text, 'Write to Marie Dupont about the merger at 14 rue de la Paix')
  assert.equal(report.words, true)
  assert.ok(!JSON.stringify({ ...report, task: null }).includes('Marie Dupont'))
})

test('scrubbing keeps a line’s shape: quotes, addresses, emails, paths, ids and long numbers marked, Jean’s own frames kept', () => {
  assert.equal(scrub('Failed “Bonjour Marie” and \'x\' at 12345'), 'Failed ‹…› and ‹…› at ‹number›')
  assert.equal(scrub('see https://a.example/b?c=d or mailto:a@b.example, me@x.example'), 'see ‹address› or ‹address› ‹email›')
  assert.equal(scrub('in C:\\Users\\marie\\x.txt'), 'in ‹path›')
  assert.equal(scrub('in /Users/marie/secret plan/x.txt'), 'in ‹path›')
  assert.equal(scrub('task 01M8BSD50QQ7K1X3GZDPBFPP60 gone\nsecond line'), 'task ‹id› gone')
  assert.equal(scrub('x', 'Error\n    at f (https://jean.is/ui/send.js:12:3)\n    at https://evil.example/x.js:1:1', 'https://jean.is'), 'x\nat f /ui/send.js:12:3')
})

test('a text’s shape is its length and the script most of its letters are in', () => {
  assert.equal(scriptOf('مرحبا بك'), 'Arabic')
  assert.equal(scriptOf('これは東京です'), 'Japanese')
  assert.equal(scriptOf('北京欢迎你'), 'Han')
  assert.equal(scriptOf('Привет'), 'Cyrillic')
  assert.equal(scriptOf('1234'), 'Common')
  assert.deepEqual(shape('Hé'), { text: 2, script: 'Latin' })
  assert.equal(addressOf('http://localhost:11434/v1'), 'local:11434')
  assert.equal(addressOf('https://jean.is/x', { origin: ORIGIN }), 'own')
  assert.equal(addressOf('mailto:a@b.example'), 'mail')
})

test('filler has a text’s length and script, and walked values fill again', () => {
  for (const script of ['Latin', 'Arabic', 'Japanese', 'Han', 'Hangul', 'Cyrillic']) {
    const text = filler({ text: 37, script })
    assert.equal([...text].length, 37)
    assert.equal(scriptOf(text), script)
  }
  assert.deepEqual(filled({ to: { text: 5, script: 'Latin' }, n: 2, at: { address: 'elsewhere' } }), { to: 'lorem', n: 2, at: 'https://example.invalid/' })
})

test('a stand-in made from a report restores as a backup into an empty profile, with the same switches, brains and task, and no key', async () => {
  const report = JSON.parse(JSON.stringify(build(/** @type {any} */ (gathered()))))
  const { files, missing } = standIn(report, { now: new Date(Date.UTC(2026, 10, 27)), providers: PROVIDERS, directory: { 'google-workspace': { name: 'Google Workspace', url: 'https://workspace.example/mcp' } } })
  const fs = memoryFS()
  await importBackup(fs, await writeZip(files), ['reflexes'])
  const settings = await loadSettings(fs)
  // A month's limit is this device's own, which a restore leaves as it is: the stand-in says so.
  assert.deepEqual([settings.locale, settings.auto, settings.limit, settings.unlocked], ['fr', true, undefined, ['files', 'connections', 'reflexes']])
  assert.deepEqual(settings.brains.map((brain) => [brain.provider, brain.model, brain.baseURL]), [['vertex', 'google/gemini-3.8-flash', PROVIDERS.vertex.baseURL], ['custom', 'acme-llm', ''], ['mistral', 'mistral-medium-latest', PROVIDERS.mistral.baseURL]])
  assert.equal(settings.activeBrain, settings.brains[0].id)
  assert.deepEqual(settings.connections?.map((one) => [one.name, one.url, one.auth]), [['Google Workspace', 'https://workspace.example/mcp', 'oauth']])
  assert.deepEqual(missing.sort(), ['browser', 'device', 'files', 'keys', 'own', 'policy', 'routines'])
  assert.equal(await fs.read('.secrets/keys.json'), null)
  const [project] = await listProjects(fs)
  assert.equal(project.data.default, true)
  assert.equal([...project.body].length, 'never mention salaries'.length)
  const conversation = (await fs.list(`${project.dir}/conversations`))[0]
  const loaded = await loadConversation(fs, `${project.dir}/conversations/${conversation.name}`)
  assert.ok(loaded)
  const [request, , brain, call] = loaded.records.filter((record) => record.update)
  assert.equal(/** @type {any} */ (request.update).content.text.length, 'Write to Marie Dupont about the merger at 14 rue de la Paix'.length)
  assert.deepEqual([/** @type {any} */ (brain.update).status, /** @type {any} */ (brain.update).rawOutput.code], ['failed', 'bad_request'])
  assert.deepEqual([/** @type {any} */ (call.update).kind, /** @type {any} */ (call.update)._meta.limitedUse], ['other', true])
  const zipped = readZip(await writeZip(files)).map((entry) => entry.name)
  assert.ok(zipped.includes('backup.json') && zipped.includes('settings.json') && zipped.includes('skills/skill-1/SKILL.md') && zipped.includes('memory.md'))
  const text = new TextDecoder().decode(files.map((file) => file.bytes).reduce((a, b) => new Uint8Array([...a, ...b])))
  for (const secret of SECRETS) assert.ok(!text.includes(secret), `the stand-in holds ${secret}`)
})

test('a request’s trail marks each hook while it holds the event and puts back the stage before, the chain answering as it did', async () => {
  const { begin, mark, end, watched, trails } = await import('../app/ui/trail.js')
  const trail = begin('task')
  mark(trail, 'ask', { brain: 'mistral' })
  /** @type {string[]} */
  const seen = []
  const hooks = watched([
    { on: 'turn.step', by: 'receipt', run: async (/** @type {any} */ e, /** @type {any} */ next) => { seen.push(trail.stages.at(-1)?.by ?? ''); return next(e) } },
    { on: 'turn.step', by: 'connections', tier: 'jean', run: async (/** @type {any} */ e, /** @type {any} */ next) => { seen.push(trail.stages.at(-1)?.by ?? ''); return next({ ...e, more: true }) } },
  ], trail)
  const answer = await fire(hooks, 'turn.step', { step: 0 }, (e) => { seen.push(trail.stages.at(-1)?.id ?? ''); return e.more })
  assert.equal(answer, true)
  assert.deepEqual(seen, ['receipt', 'connections', 'ask'])
  assert.deepEqual(trail.stages.map((stage) => stage.by ?? stage.id), ['ask', 'receipt', 'ask', 'connections', 'ask'])
  // One that answers of its own keeps whose it is; a guard that fails before going on still refuses; a generator's stream goes through.
  assert.deepEqual(await fire(watched([{ on: 'x', by: 'dlp', run: async () => ({ refuse: 'no' }) }], trail), 'x', {}, () => null), { refuse: 'no', by: 'dlp' })
  assert.deepEqual(await fire(watched([{ on: 'x', by: 'g', refuse: 'closed', run: async () => { throw new Error('down') } }], trail), 'x', {}, () => null), { refuse: 'closed' })
  const streamed = await fire(watched([{ on: 'x', by: 'mask', tier: 'edge', run: async function* (/** @type {any} */ e, /** @type {any} */ next) { for await (const one of await next(e)) yield one * 2 } }], trail), 'x', {}, async function* () { yield 1; yield 2 })
  const got = []
  for await (const one of streamed) got.push(one)
  assert.deepEqual(got, [2, 4])
  // A hook that asks the person, then goes on, still puts back the stage before it.
  await fire(watched([{ on: 'turn.step', by: 'receipt', run: async (/** @type {any} */ e, /** @type {any} */ next) => { const answered = mark(trail, 'decide', { kind: 'question' }); answered(); return next(e) } }], trail), 'turn.step', {}, () => null)
  assert.deepEqual(trail.stages.slice(-4).map((stage) => stage.by ?? stage.id), ['receipt', 'decide', 'receipt', 'ask'])
  // A hook that never goes on is where the request waits.
  void fire(watched([{ on: 'turn.step', by: 'receipt', run: () => new Promise(() => {}) }], trail), 'turn.step', {}, () => null)
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual(trail.stages.at(-1), { id: 'hook', by: 'receipt', on: 'turn.step', at: trail.stages.at(-1)?.at })
  end(trail, 'stopped')
  assert.equal(trails.has('task'), false)
  assert.equal(trail.outcome, 'stopped')
})
