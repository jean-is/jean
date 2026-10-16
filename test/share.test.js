// Sharing by link (D361): what of a task goes in a share, its seal, which only the link's secret, and
// its password when there is one, opens, and the host, which keeps what it can't read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { envelope, userRecord, noteRecord, metaRecord, foldTurns } from '../app/core/events.js'
import { copyOf } from '../app/caps/share/copy.js'
import { sealValue, openValue, materialOf, keysOf, saltOf, random, linkOf, base64url, bytesOf, newId, isPart, hashOf } from '../app/caps/share/seal.js'

const PICTURE = { uri: 'files/sha256-aa.png', name: 'Cat.png', mimeType: 'image/png', size: 3 }
const DOCUMENT = { uri: 'files/sha256-bb.docx', name: 'Letter.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 9 }

/** A task as its file keeps it: a note, its prompt, a request with a file shared, a search, thinking, a picture and a letter made, the answer. */
function task() {
  const header = { format: 1, kind: 'conversation', id: '01M4N18BCYXJ5WQDF3TW1C43KC', createdAt: '2026-10-16T09:00:00.000Z', by: 'device-1' }
  const records = [
    noteRecord('The <memory> section is now: Ana lives in Lyon.', { kind: 'section', name: 'memory', version: 'abc' }),
    metaRecord('device-1', { prompt: { system: 'You are Jean. Ana lives in Lyon.', state: { language: 'en', date: '2026-10-16', tools: [] } } }),
    envelope('device-1', { sessionUpdate: 'user_message_chunk', content: { type: 'resource_link', uri: 'files/sha256-cc.pdf', name: 'Divorce settlement.pdf', mimeType: 'application/pdf' } }),
    userRecord('Draw my cat and write a letter.', 'device-1'),
    envelope('jean', { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Ana is going through a divorce.' } }, 0),
    envelope('jean', { sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'Searching your email for "lawyer"', kind: 'fetch', status: 'pending', rawInput: { query: 'lawyer' } }, 0),
    envelope('jean', { sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'From: Maître Dupont' } }] }, 0),
    envelope('jean', { sessionUpdate: 'tool_call', toolCallId: 'c2', title: 'Drawing', kind: 'other', status: 'pending', rawInput: { description: 'A grey cat', size: 'square' } }, 1),
    envelope('jean', { sessionUpdate: 'tool_call_update', toolCallId: 'c2', status: 'completed', _meta: { picture: PICTURE, made: { kind: 'picture', provider: 'openai', model: 'gpt-image-1', local: false } } }, 1),
    envelope('jean', { sessionUpdate: 'tool_call', toolCallId: 'c3', title: 'Writing', kind: 'edit', status: 'completed', rawInput: { name: 'Letter.docx', text: 'Dear Maître Dupont' }, _meta: { file: DOCUMENT } }, 1),
    envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Here is your cat, and the letter.' } }, 1),
    metaRecord('device-1', { reached: { from: '2026-10-16T09:00:00.000Z', to: '2026-10-16T09:00:05.000Z', hosts: { 'gateway.corp.example': 3 } } }),
  ]
  return [header, ...records].map((record) => JSON.stringify(record)).join('\n') + '\n'
}

/** @param {string} jsonl */
const parse = (jsonl) => jsonl.trim().split('\n').map((line) => JSON.parse(line))

test('a share copy keeps the requests, the answers and what was made, and leaves the rest here', () => {
  const copy = copyOf(task(), { aFile: 'a file' })
  const [header, ...records] = parse(copy)
  assert.deepEqual(header, { format: 1, kind: 'conversation', id: '01M4N18BCYXJ5WQDF3TW1C43KC', createdAt: '2026-10-16T09:00:00.000Z', by: 'user' })
  // Nothing of the memory, the prompt, the thinking, the email searched, what was reached or the device.
  for (const secret of ['Lyon', 'divorce', 'Divorce', 'lawyer', 'Dupont', 'gateway.corp', 'device-1', 'sha256-cc', 'sha256-bb']) assert.ok(!copy.includes(secret), secret)
  assert.deepEqual(records.map((record) => record.update.sessionUpdate), ['user_message_chunk', 'user_message_chunk', 'tool_call', 'tool_call', 'agent_message_chunk'])
  assert.deepEqual(records[0].update.content, { type: 'resource_link', uri: '', name: 'a file' })
  // The picture under its address, which the copy holds it under, with who made it and what it shows; the letter by its name.
  assert.deepEqual(records[2].update, { sessionUpdate: 'tool_call', toolCallId: 'c2', title: '', status: 'completed', _meta: { picture: PICTURE, made: { kind: 'picture', provider: 'openai', model: 'gpt-image-1', local: false } }, rawInput: { description: 'A grey cat' } })
  assert.deepEqual(records[3].update._meta, { file: { ...DOCUMENT, uri: '' } })
  // The room folds it as it folds the task: one turn, its request and its answer.
  const [turn] = foldTurns(records)
  assert.equal(turn.user?.text, 'Draw my cat and write a letter.')
  assert.equal(turn.steps.map((step) => step.text).join(''), 'Here is your cat, and the letter.')
})

test('with what Jean read, the files shared go by their names and the calls whole', () => {
  const copy = copyOf(task(), { read: true, aFile: 'a file' })
  assert.ok(copy.includes('Divorce settlement.pdf') && copy.includes('Maître Dupont'))
  for (const secret of ['Lyon', 'Ana is going', 'gateway.corp', 'device-1', 'sha256-cc']) assert.ok(!copy.includes(secret), secret)
})

test('a seal opens with its secret alone, and with a password only with that password too', async () => {
  const value = { title: 'Cat', file: copyOf(task(), { aFile: 'a file' }) }
  const [secret, salt] = [random(32), random(16)]
  const open = await sealValue(value, { secret, salt })
  assert.deepEqual(saltOf(open.sealed), salt)
  assert.deepEqual(await openValue(open.sealed, secret), value)
  await assert.rejects(openValue(open.sealed, random(32)))
  const closed = await sealValue(value, { secret, salt, password: 'horse battery' })
  await assert.rejects(openValue(closed.sealed, secret))
  await assert.rejects(openValue(closed.sealed, await materialOf(secret, salt, 'horse batter')))
  assert.deepEqual(await openValue(closed.sealed, await materialOf(secret, salt, 'horse battery')), value)
  // The proof the host asks for comes from the secret and the password together, and a password typed in another form of Unicode is the same.
  assert.equal((await keysOf(await materialOf(secret, salt, 'café'), salt)).access, (await keysOf(await materialOf(secret, salt, 'café'), salt)).access)
  assert.notEqual(closed.access, open.access)
  assert.notEqual((await keysOf(await materialOf(random(32), salt, 'horse battery'), salt)).access, closed.access)
})

test('a link names the host, the id and the secret after #, which browsers never send', async () => {
  const secret = random(32)
  const id = newId()
  const link = new URL(linkOf('https://hst.ing', id, secret))
  assert.equal(link.origin + link.pathname, `https://hst.ing/${id}`)
  assert.deepEqual(bytesOf(link.hash.slice(1)), secret)
  assert.ok(isPart(id) && isPart(base64url(secret)) && !isPart('../x') && !isPart('short'))
  assert.match(await hashOf('token'), /^[\w-]{43}$/)
})

// ─── The host ────────────────────────────────────────────────────────────────

const { host, LIMIT } = await import('../host/host.js')
const { folder, sealRecord, openRecord } = await import('../host/serve.js')

/** A store in memory, its records and reports kept to look at. */
function memory() {
  /** @type {Map<string, any>} */
  const metas = new Map()
  /** @type {Map<string, Uint8Array>} */
  const bodies = new Map()
  const records = /** @type {any[]} */ ([])
  const reports = /** @type {any[]} */ ([])
  return {
    records, reports, metas,
    meta: async (/** @type {string} */ id) => metas.get(id) ?? null,
    body: async (/** @type {string} */ id) => bodies.get(id) ?? null,
    put: async (/** @type {string} */ id, /** @type {any} */ meta, /** @type {Uint8Array} */ body) => { metas.set(id, meta); if (body) bodies.set(id, body) },
    remove: async (/** @type {string} */ id) => { metas.delete(id); bodies.delete(id) },
    report: async (/** @type {string} */ text) => { reports.push(JSON.parse(text)) },
    record: async (/** @type {string} */ text) => { records.push(JSON.parse(text)) },
  }
}

const JEAN = 'https://jean.example'
const CLIENT = { address: '203.0.113.7', port: 51234, protocol: 'HTTP/1.1' }
const VIEWER = { base: 'https://cdn.example/npm/r@1/', entry: 'https://cdn.example/npm/r@1/caps/share/view.js', imports: { 'lit-html': 'https://cdn.example/npm/r@1/vendor/lit-html/lit-html.js' }, integrity: { 'https://cdn.example/npm/r@1/caps/share/view.js': 'sha384-abc' } }

/** A host on a store in memory, and a way to ask it. */
function hostOn(config = {}) {
  const store = memory()
  const handle = host({ origins: [JEAN], viewer: VIEWER, render: 'https://cdn.example/npm/r@{version}/', app: `${JEAN}/`, store, ...config })
  /** @param {string} path @param {RequestInit & { origin?: string }} [init] */
  const ask = (path, { origin, ...init } = {}) => handle(new Request(`https://hst.example${path}`, { ...init, headers: { ...(origin && { origin }), ...init.headers } }), CLIENT)
  return { store, ask }
}

/** A sealed copy as Jean puts it. @param {string} [password] */
async function sealed(password) {
  const secret = random(32)
  const salt = random(16)
  const { sealed: body, access } = await sealValue({ title: 'Cat' }, { secret, salt, password })
  return { secret, salt, body, access, token: base64url(random(32)), id: newId() }
}

test('the host keeps a sealed copy from the Jeans it serves, and records each change, never a read', async () => {
  const { store, ask } = hostOn()
  const share = await sealed()
  const put = (/** @type {string} */ origin, token = share.token) => ask(`/v1/${share.id}`, { method: 'PUT', origin, body: share.body, headers: { authorization: `Bearer ${token}`, 'share-days': '365' } })
  assert.equal((await put('https://evil.example')).status, 403)
  const made = await put(JEAN)
  assert.equal(made.status, 201)
  assert.equal(made.headers.get('access-control-allow-origin'), JEAN)
  const { expires } = await made.json()
  assert.ok(Date.parse(expires) - Date.now() > 364 * 86_400_000)
  assert.equal(store.metas.get(share.id).salt, base64url(share.salt))
  assert.notEqual(store.metas.get(share.id).token, share.token)
  // Anyone with the link reads it, and nothing says who.
  const read = await ask(`/v1/${share.id}`)
  assert.equal(read.status, 200)
  assert.equal(read.headers.get('access-control-allow-origin'), '*')
  assert.deepEqual(new Uint8Array(await read.arrayBuffer()), share.body)
  assert.deepEqual(await openValue(share.body, share.secret), { title: 'Cat' })
  // Someone else's token changes nothing; the sharer's changes it, then stops sharing it.
  assert.equal((await put(JEAN, base64url(random(32)))).status, 403)
  assert.equal((await put(JEAN)).status, 200)
  assert.equal((await ask(`/v1/${share.id}`, { method: 'DELETE', origin: JEAN, headers: { authorization: `Bearer ${share.token}` } })).status, 200)
  assert.equal((await ask(`/v1/${share.id}`)).status, 404)
  assert.deepEqual(store.records.map(({ operation, address, port, id }) => [operation, address, port, id]), [['create', CLIENT.address, CLIENT.port, share.id], ['change', CLIENT.address, CLIENT.port, share.id], ['delete', CLIENT.address, CLIENT.port, share.id]])
})

test('a password’s share is handed out only for its proof, a few tries an hour', async () => {
  const { ask } = hostOn()
  const share = await sealed('horse battery')
  assert.equal((await ask(`/v1/${share.id}`, { method: 'PUT', origin: JEAN, body: share.body, headers: { authorization: `Bearer ${share.token}`, 'share-proof': await hashOf(share.access) } })).status, 201)
  const without = await ask(`/v1/${share.id}`)
  assert.equal(without.status, 401)
  assert.equal((await without.json()).salt, base64url(share.salt))
  const right = await ask(`/v1/${share.id}`, { headers: { authorization: `Share ${share.access}` } })
  assert.deepEqual(new Uint8Array(await right.arrayBuffer()), share.body)
  const wrong = (await keysOf(await materialOf(share.secret, share.salt, 'horse batter'), share.salt)).access
  for (let i = 0; i < 10; i++) assert.equal((await ask(`/v1/${share.id}`, { headers: { authorization: `Share ${wrong}` } })).status, 401)
  assert.equal((await ask(`/v1/${share.id}`, { headers: { authorization: `Share ${share.access}` } })).status, 429)
})

test('the host refuses what isn’t a share, too big, past its end or taken down', async () => {
  const { store, ask } = hostOn()
  const share = await sealed()
  const headers = { authorization: `Bearer ${share.token}` }
  assert.equal((await ask(`/v1/${share.id}`, { method: 'PUT', origin: JEAN, body: new Uint8Array(LIMIT + 1), headers })).status, 413)
  assert.equal((await ask(`/v1/${share.id}`, { method: 'PUT', origin: JEAN, body: new Uint8Array(3), headers })).status, 400)
  assert.equal((await ask(`/v1/${share.id}`, { method: 'PUT', origin: JEAN, body: share.body })).status, 401)
  assert.equal((await ask('/v1/../etc/passwd')).status, 404)
  await ask(`/v1/${share.id}`, { method: 'PUT', origin: JEAN, body: share.body, headers })
  store.metas.set(share.id, { ...store.metas.get(share.id), expires: new Date(Date.now() - 1000).toISOString() })
  assert.equal((await ask(`/v1/${share.id}`)).status, 404)
  assert.equal(store.metas.has(share.id), false)
  store.metas.set(share.id, { removed: new Date().toISOString() })
  assert.equal((await ask(`/v1/${share.id}`)).status, 410)
  assert.equal((await ask(`/v1/${share.id}`, { method: 'PUT', origin: JEAN, body: share.body, headers })).status, 410)
  // A report is kept for whoever runs the host, the link only when given.
  assert.equal((await ask(`/v1/${share.id}/report`, { method: 'POST', body: JSON.stringify({ words: 'A scam', link: `https://hst.example/${share.id}#key` }) })).status, 202)
  assert.deepEqual(store.reports.map(({ id, words, link }) => [id, words, link]), [[share.id, 'A scam', `https://hst.example/${share.id}#key`]])
})

test('the viewer is the same page for every share, unindexed, and draws in an opaque frame', async () => {
  const { ask } = hostOn()
  const page = await ask(`/${newId()}`)
  assert.equal(page.status, 200)
  assert.equal(page.headers.get('x-robots-tag'), 'noindex')
  const policy = String(page.headers.get('content-security-policy'))
  assert.match(policy, /script-src https:\/\/cdn\.example 'sha256-/)
  assert.match(policy, /frame-ancestors 'none'/)
  const text = await page.text()
  assert.match(text, /<script type="module" src="https:\/\/cdn\.example\/npm\/r@1\/caps\/share\/view\.js" integrity="sha384-abc"/)
  assert.match(text, /"app":"https:\/\/jean\.example\/"/)
  const frame = await ask('/frame')
  assert.match(String(frame.headers.get('content-security-policy')), /^sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox;/)
  assert.doesNotMatch(String(frame.headers.get('content-security-policy')), /allow-same-origin|allow-downloads/)
})

test('a folder keeps shares and records, sealed to a key only its private half opens, and sweeps what ended', async () => {
  const { mkdtemp, readFile, readdir } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'share-host-'))
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
  const store = folder(dir, keys.publicKey)
  await store.put('a'.repeat(22), { format: 1, salt: '', token: 't', expires: new Date(Date.now() - 1).toISOString(), size: 3 }, new Uint8Array([1, 2, 3]))
  await store.put('b'.repeat(22), { format: 1, salt: '', token: 't', expires: new Date(Date.now() + 86_400_000).toISOString(), size: 3 }, new Uint8Array([4, 5, 6]))
  await store.record('{"operation":"create"}')
  const [day] = await readdir(join(dir, 'records'))
  const line = (await readFile(join(dir, 'records', day), 'utf8')).trim()
  assert.ok(!line.includes('create'))
  assert.equal(await openRecord(line, keys.privateKey), '{"operation":"create"}')
  assert.equal(await openRecord(await sealRecord('x', keys.publicKey), keys.privateKey), 'x')
  await store.sweep()
  assert.equal(await store.meta('a'.repeat(22)), null)
  assert.deepEqual(await store.body('b'.repeat(22)), new Uint8Array([4, 5, 6]))
})
