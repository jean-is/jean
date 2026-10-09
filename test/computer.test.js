// The Computer (D162): what it may reach and how, what /workspace holds of a folder and what it
// gives back, and the capabilities it folds in.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS } from '../core/fs.js'
import { computerRights, relayed, covers, judge, registryOf, authorization, reach, COMPUTER_DEFAULTS } from '../caps/computer/net.js'
import { outgoing, incoming, preview, decline, within } from '../caps/computer/mount.js'
import { callsIn, filesMade, versionsOf, nextVersion, latestOf } from '../core/events.js'

const DEFAULTS = { pyodide: 'https://cdn.example/pyodide/v{version}/full/', pypi: 'https://pypi.example/pypi/{package_name}/json', npm: 'https://registry.example/' }
const decoder = new TextDecoder()
const later = () => new Promise((resolve) => setTimeout(resolve, 5))

test('Settings › Computer: defaults, the user’s, then policy’s, locked; the relay, global or its own', () => {
  const plain = computerRights({}, {}, DEFAULTS)
  assert.equal(plain.rights.internet, 'ask')
  assert.equal(plain.rights.timeMs, COMPUTER_DEFAULTS.timeMs)
  assert.deepEqual(plain.rights.registries, DEFAULTS)
  assert.equal(plain.relay, '')
  assert.equal(plain.locked.size, 0)
  const mine = computerRights({ computer: { internet: 'any', sites: ['example.com'], registries: { npm: 'https://npm.corp/' } }, relay: 'https://relay.example/?u={url}' }, {}, DEFAULTS)
  assert.equal(mine.rights.internet, 'any')
  assert.equal(mine.rights.registries.npm, 'https://npm.corp/')
  assert.equal(mine.relay, 'https://relay.example/?u={url}', 'the global relay, by default')
  assert.equal(computerRights({ computer: { relay: 'own', ownRelay: 'https://mine/' }, relay: 'https://global/' }).relay, 'https://mine/')
  assert.equal(computerRights({ computer: { relay: 'none' }, relay: 'https://global/' }).relay, '')
  const theirs = computerRights({ computer: { internet: 'any' } }, { computer: { internet: 'off', registries: { pypi: 'https://pypi.corp/simple/' } }, relay: 'https://gateway.corp/{url}' }, DEFAULTS)
  assert.equal(theirs.rights.internet, 'off')
  assert.equal(theirs.rights.registries.pypi, 'https://pypi.corp/simple/')
  assert.deepEqual([...theirs.locked].sort(), ['globalRelay', 'internet', 'registries.pypi'])
  assert.equal(theirs.global, 'https://gateway.corp/{url}')
})

test('a relay takes the address in place of {url}, or after its own', () => {
  assert.equal(relayed('https://a.example/x?y=1', ''), 'https://a.example/x?y=1')
  assert.equal(relayed('https://a.example/x?y=1', 'https://r.example/?url={url}'), 'https://r.example/?url=https%3A%2F%2Fa.example%2Fx%3Fy%3D1')
  assert.equal(relayed('https://a.example/x', 'https://r.example/'), 'https://r.example/https://a.example/x')
})

test('a listed site covers its addresses: a domain, its subdomains with *., a port, this computer over http', () => {
  const url = (/** @type {string} */ text) => new URL(text)
  assert.ok(covers('example.com', url('https://example.com/a')))
  assert.ok(!covers('example.com', url('https://www.example.com/')))
  assert.ok(!covers('example.com', url('http://example.com/')), 'https only')
  assert.ok(covers('*.example.com', url('https://www.example.com/')))
  assert.ok(covers('*.example.com', url('https://example.com/')))
  assert.ok(covers('*.com', url('https://shop.com/')))
  assert.ok(!covers('example.com', url('https://example.com:8443/')))
  assert.ok(covers('example.com:8443', url('https://example.com:8443/')))
  assert.ok(covers('localhost:3000', url('http://localhost:3000/api')))
  assert.ok(covers('localhost:*', url('http://localhost:5173/')))
  assert.ok(!covers('*', url('http://localhost:3000/')), '* is the internet, not this computer')
})

test('a request is made at once, asked about, or refused, by what Settings say', () => {
  const rights = computerRights({ computer: { sites: ['api.example.com', 'localhost:3000'] } }, {}, DEFAULTS).rights
  const origin = 'https://jean.example'
  assert.equal(judge('https://api.example.com/v1', { rights, origin }).verdict, 'allow')
  assert.deepEqual(judge('https://news.example.org/', { rights, origin }), { verdict: 'ask', site: 'news.example.org' })
  assert.equal(judge('https://registry.example/lodash', { rights, origin }).verdict, 'allow', 'a registry needs no asking')
  assert.equal(judge('http://localhost:3000/', { rights, origin }).verdict, 'allow', 'this computer, listed')
  assert.equal(judge('http://localhost:8080/', { rights, origin }).verdict, 'deny', 'this computer, not listed')
  assert.equal(judge('https://192.168.1.10/', { rights, origin }).verdict, 'deny', 'the network, not listed')
  assert.equal(judge('https://jean.example/capabilities.json', { rights, origin }).verdict, 'deny', "Jean's own origin")
  assert.equal(judge('ftp://files.example/', { rights, origin }).verdict, 'deny')
  assert.equal(judge('not an address', { rights, origin }).verdict, 'deny')
  assert.equal(judge('https://news.example.org/', { rights: { ...rights, internet: 'any' }, origin }).verdict, 'allow')
  const off = judge('https://api.example.com/', { rights: { ...rights, internet: 'off' }, origin })
  assert.equal(off.verdict, 'deny')
  assert.match(String(off.why), /Settings › Computer/)
})

test("a registry's key goes with requests under its address only, as Basic or Bearer", () => {
  const rights = computerRights({}, {}, DEFAULTS).rights
  assert.equal(registryOf('https://registry.example/lodash/-/lodash-4.17.21.tgz', rights), 'npm')
  assert.equal(registryOf('https://pypi.example/pypi/pandas/json', rights), 'pypi')
  assert.equal(registryOf('https://cdn.example/pyodide/v0.28.0/full/numpy.whl', rights), 'pyodide')
  assert.equal(registryOf('https://elsewhere.example/', rights), undefined)
  assert.equal(authorization('abc123'), 'Bearer abc123')
  assert.equal(authorization('me:secret'), `Basic ${btoa('me:secret')}`)
})

test('Jean makes the request: no cookies, the key added, the body cut past the limit, a redirect checked', async () => {
  /** @type {any[]} */
  const seen = []
  /** @type {typeof fetch} */
  const fetch = async (input, init) => {
    seen.push({ url: String(input), init })
    if (String(input).includes('big')) return new Response(new Uint8Array(2000))
    if (String(input).includes('moved')) return Object.defineProperty(new Response('elsewhere'), 'url', { value: 'https://evil.example/' })
    return new Response('hello', { status: 201, headers: { 'x-a': '1' } })
  }
  const answer = await reach({ url: 'https://api.example.com/x', method: 'POST', headers: { 'content-type': 'text/plain' }, body: new TextEncoder().encode('hi').buffer }, { token: 'k', limit: 1000, allowed: () => true, fetch })
  assert.equal(answer.status, 201)
  assert.equal(decoder.decode(answer.body), 'hello')
  assert.equal(answer.headers['x-a'], '1')
  assert.equal(seen[0].init.credentials, 'omit')
  assert.equal(seen[0].init.referrerPolicy, 'no-referrer')
  assert.equal(seen[0].init.headers.authorization, 'Bearer k')
  await assert.rejects(reach({ url: 'https://api.example.com/big' }, { limit: 1000, allowed: () => true, fetch }), /larger than/)
  await assert.rejects(reach({ url: 'https://api.example.com/moved' }, { limit: 1000, allowed: (to) => !to.includes('evil'), fetch }), /may not reach/)
  await reach({ url: 'https://api.example.com/x' }, { relay: 'https://relay.example/?u={url}', limit: 1000, allowed: () => true, fetch })
  assert.equal(seen.at(-1).url, 'https://relay.example/?u=https%3A%2F%2Fapi.example.com%2Fx')
})

test('/workspace: what changed since is sent, what went is named, .gitignore and the limit hold', async () => {
  const fs = memoryFS({ 'a.csv': 'x,y\n1,2\n', 'docs/b.txt': 'b', '.gitignore': 'secret/\n', 'secret/key.txt': 'no', 'node_modules/x/index.js': 'no' })
  /** @type {import('../caps/computer/mount.js').Held} */
  const held = new Map()
  const first = await outgoing(fs, held, { limit: 1e6 })
  assert.deepEqual(Object.keys(first.put).sort(), ['.gitignore', 'a.csv', 'docs/b.txt'])
  assert.equal(decoder.decode(first.put['a.csv']), 'x,y\n1,2\n')
  assert.deepEqual(first.gone, [])
  assert.deepEqual(await outgoing(fs, held, { limit: 1e6 }), { put: {}, gone: [], left: [] }, 'nothing changed')
  await later()
  await fs.write('a.csv', 'x,y\n1,2\n3,4\n')
  await fs.remove('docs/b.txt')
  const next = await outgoing(fs, held, { limit: 1e6 })
  assert.deepEqual(Object.keys(next.put), ['a.csv'])
  assert.deepEqual(next.gone, ['docs/b.txt'])
  const small = await outgoing(memoryFS({ 'big.bin': 'x'.repeat(50), 'small.txt': 'y' }), new Map(), { limit: 10 })
  assert.deepEqual(small.left, ['big.bin'])
  assert.deepEqual(Object.keys(small.put), ['small.txt'])
})

test('/workspace: a run’s changes are written back, unless the file moved meanwhile; declined ones are sent again', async () => {
  const fs = memoryFS({ 'a.txt': 'one', 'b.txt': 'two', 'c.txt': 'three' })
  /** @type {import('../caps/computer/mount.js').Held} */
  const held = new Map()
  await outgoing(fs, held, { limit: 1e6 })
  await later()
  await fs.write('b.txt', 'changed by someone else')
  const bytes = (/** @type {string} */ text) => new TextEncoder().encode(text).buffer
  const changes = { put: { 'a.txt': bytes('ONE'), 'b.txt': bytes('TWO'), 'new.txt': bytes('new') }, gone: ['c.txt'] }
  const shown = await preview(fs, changes)
  assert.deepEqual(shown.find((each) => each.path === 'a.txt'), { path: 'a.txt', oldText: 'one', newText: 'ONE', binary: false })
  assert.deepEqual(shown.find((each) => each.path === 'new.txt'), { path: 'new.txt', oldText: null, newText: 'new', binary: false })
  assert.deepEqual(shown.find((each) => each.path === 'c.txt'), { path: 'c.txt', oldText: 'three', newText: null, binary: false })
  const done = await incoming(fs, held, changes)
  assert.deepEqual(done, { saved: ['a.txt', 'new.txt'], removed: ['c.txt'], refused: ['b.txt'] })
  assert.equal(await fs.read('a.txt'), 'ONE')
  assert.equal(await fs.read('b.txt'), 'changed by someone else')
  assert.equal(await fs.exists('c.txt'), false)
  assert.deepEqual(Object.keys((await outgoing(fs, held, { limit: 1e6 })).put), ['b.txt'], 'the refused file, sent again as it is')
  decline(held, { put: { 'a.txt': bytes('x') }, gone: [] })
  assert.deepEqual(Object.keys((await outgoing(fs, held, { limit: 1e6 })).put), ['a.txt'], 'a declined change, undone in the computer')
})

test('a project’s workspace is a folder of its FS, as an FS of its own', async () => {
  const fs = memoryFS({ 'projects/p/workspace/a.txt': 'a' })
  const workspace = within(fs, 'projects/p/workspace')
  assert.equal(await workspace.read('a.txt'), 'a')
  await workspace.write('d/b.txt', 'b')
  assert.equal(await fs.read('projects/p/workspace/d/b.txt'), 'b')
  assert.deepEqual((await workspace.list('')).map((entry) => entry.name).sort(), ['a.txt', 'd'])
  assert.equal((await workspace.stat?.('a.txt'))?.size, 1)
})

test('a file made again is a version of its own: numbered in the conversation, the earlier ones kept (D164)', () => {
  const file = (/** @type {string} */ name, /** @type {string} */ uri) => ({ uri, name, mimeType: 'text/html', size: 1 })
  const call = (/** @type {string} */ id, /** @type {Record<string, any>} */ meta) => ({ at: 't', by: 'jean', update: { sessionUpdate: 'tool_call', toolCallId: id, title: id, _meta: meta } })
  const records = /** @type {any[]} */ ([
    call('a', { file: file('Plan.docx', 'files/sha256-1.docx') }),
    call('b', { files: [file('Chart.html', 'files/sha256-2.html'), file('data.csv', 'files/sha256-3.csv')] }),
    { at: 't', by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'bluer' } } },
    call('c', { files: [file('Chart.html', 'files/sha256-4.html')] }),
  ])
  const live = [{ tools: /** @type {any[]} */ ([{ toolCallId: 'd', _meta: { files: [file('Chart.html', 'files/sha256-4.html')] } }, { toolCallId: 'e', _meta: { file: file('Chart.html', 'files/sha256-2.html') } }]) }]
  const made = filesMade(callsIn(records, live))
  assert.deepEqual(made.map((each) => each.uri), ['files/sha256-1.docx', 'files/sha256-2.html', 'files/sha256-3.csv', 'files/sha256-4.html', 'files/sha256-4.html', 'files/sha256-2.html'])
  const chart = versionsOf(made, 'Chart.html')
  assert.deepEqual(chart.map((each) => [each.version, each.uri]), [[1, 'files/sha256-2.html'], [2, 'files/sha256-4.html'], [3, 'files/sha256-2.html']], 'the same again just after is one version; going back to an earlier one is a new one')
  assert.equal(versionsOf(made, 'Plan.docx').length, 1)
  assert.equal(nextVersion(made, 'Chart.html', 'files/sha256-2.html'), 3, 'the last one again')
  assert.equal(nextVersion(made, 'Chart.html', 'files/sha256-9.html'), 4)
  assert.equal(nextVersion(made, 'New.html', 'files/sha256-9.html'), 1)
  // A workbook the user changed in the preview stays the version it was, holding their last copy (D229).
  const note = (/** @type {string} */ was, /** @type {string} */ uri) => ({ at: 't', by: 'jean', update: { sessionUpdate: '_system_note', text: 'The user changed Budget.xlsx', data: { kind: 'cells', was, uri } } })
  const changed = /** @type {any[]} */ ([...records, call('f', { file: file('Budget.xlsx', 'files/sha256-5.xlsx') }), note('files/sha256-5.xlsx', 'files/sha256-6.xlsx'), note('files/sha256-5.xlsx', 'files/sha256-7.xlsx')])
  assert.deepEqual(versionsOf(filesMade(callsIn(changed)), 'Budget.xlsx').map((each) => [each.version, each.uri]), [[1, 'files/sha256-5.xlsx']])
  assert.equal(latestOf(changed, 'files/sha256-5.xlsx'), 'files/sha256-7.xlsx')
  assert.equal(latestOf(changed, 'files/sha256-2.html'), 'files/sha256-2.html')
})
