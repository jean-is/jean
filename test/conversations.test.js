import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS } from '../core/fs.js'
import { ulid } from '../core/ulid.js'
import {
  appendRecords,
  createConversation,
  deleteConversation,
  listConversations,
  loadConversation,
  rewriteRecords,
} from '../core/conversations.js'

/** @typedef {import('../core/types.js').Envelope} Envelope */

const projectDir = 'projects/01HOME-home'
const now = new Date('2026-01-02T03:04:05.000Z')

/** @param {string} at @param {string} text @returns {Envelope} */
const say = (at, text) => ({
  at,
  by: 'user',
  update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } },
})
/** @param {string} at @param {string} title @returns {Envelope} */
const titled = (at, title) => ({ at, by: 'jean', meta: { title } })

function spyFS() {
  const inner = memoryFS()
  /** @type {[string, string][]} */
  const appends = []
  const fs = {
    ...inner,
    /** @param {string} path @param {string} text */
    append: async (path, text) => {
      appends.push([path, text])
      return inner.append(path, text)
    },
  }
  return { fs, appends }
}

test('createConversation writes the header line', async () => {
  const fs = memoryFS()
  const { id, path, header } = await createConversation(fs, { projectDir, by: 'device-1', now })
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/)
  assert.equal(id.slice(0, 10), ulid(now.getTime()).slice(0, 10))
  assert.equal(path, `${projectDir}/conversations/${id}.jsonl`)
  assert.deepEqual(header, { format: 1, kind: 'conversation', id, createdAt: now.toISOString(), by: 'device-1' })
  assert.equal(await fs.read(path), JSON.stringify(header) + '\n')
})

test('appendRecords writes N lines in one append', async () => {
  const { fs, appends } = spyFS()
  const { path } = await createConversation(fs, { projectDir, by: 'd', now })
  const records = [say('2026-01-02T03:05:00.000Z', 'a\nb'), titled('2026-01-02T03:06:00.000Z', 'T'), say('2026-01-02T03:07:00.000Z', 'c')]
  await appendRecords(fs, path, records)
  assert.equal(appends.length, 1)
  const [appendedPath, text] = appends[0]
  assert.equal(appendedPath, path)
  assert.equal(text, records.map((r) => JSON.stringify(r) + '\n').join(''))
  assert.equal(text.split('\n').length, records.length + 1)
  await appendRecords(fs, path, [])
  assert.equal(appends.length, 1)
})

test('loadConversation round-trips header and records', async () => {
  const fs = memoryFS()
  const { path, header } = await createConversation(fs, { projectDir, by: 'd', now })
  const first = [say('2026-01-02T03:05:00.000Z', 'hello')]
  const second = [say('2026-01-02T03:06:00.000Z', 'again'), say('2026-01-02T03:07:00.000Z', 'more')]
  await appendRecords(fs, path, first)
  await appendRecords(fs, path, second)
  const loaded = await loadConversation(fs, path)
  assert.deepEqual(loaded, { header, records: [...first, ...second], title: '', updatedAt: '2026-01-02T03:07:00.000Z' })
})

test('updatedAt falls back to createdAt and title to the latest meta.title', async () => {
  const fs = memoryFS()
  const { path } = await createConversation(fs, { projectDir, by: 'd', now })
  assert.deepEqual(await loadConversation(fs, path), {
    header: { format: 1, kind: 'conversation', id: path.slice(-32, -6), createdAt: now.toISOString(), by: 'd' },
    records: [],
    title: '',
    updatedAt: now.toISOString(),
  })
  await appendRecords(fs, path, [titled('2026-01-02T03:05:00.000Z', 'First'), say('2026-01-02T03:06:00.000Z', 'x')])
  await appendRecords(fs, path, [titled('2026-01-02T03:07:00.000Z', 'Second'), say('2026-01-02T03:08:00.000Z', 'y')])
  const loaded = await loadConversation(fs, path)
  assert.equal(loaded?.title, 'Second')
  assert.equal(loaded?.updatedAt, '2026-01-02T03:08:00.000Z')
})

test('a malformed trailing line (crash mid-append) is ignored silently', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const fs = memoryFS()
  const { path } = await createConversation(fs, { projectDir, by: 'd', now })
  await appendRecords(fs, path, [say('2026-01-02T03:05:00.000Z', 'kept')])
  await fs.append(path, '{"at":"2026-01-02T03:06:00.000Z","by":"us')
  const loaded = await loadConversation(fs, path)
  assert.deepEqual(loaded?.records.map((r) => r.at), ['2026-01-02T03:05:00.000Z'])
  assert.equal(loaded?.updatedAt, '2026-01-02T03:05:00.000Z')
  assert.equal(warn.mock.callCount(), 0)
})

test('appending after a torn last line starts a new line', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const fs = memoryFS()
  const { path } = await createConversation(fs, { projectDir, by: 'd', now })
  await fs.append(path, '{"at":"torn')
  const reopened = memoryFS({ [path]: /** @type {string} */ (await fs.read(path)) }) // as after a reload
  await appendRecords(reopened, path, [say('2026-01-02T03:06:00.000Z', 'after crash')])
  const loaded = await loadConversation(reopened, path)
  assert.deepEqual(loaded?.records.map((r) => r.at), ['2026-01-02T03:06:00.000Z'])
  assert.equal(warn.mock.callCount(), 1) // the torn line is now in the middle
})

test('malformed lines in the middle are skipped with a warning', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const fs = memoryFS()
  const { path } = await createConversation(fs, { projectDir, by: 'd', now })
  await fs.append(path, 'not json\n\n[1,2]\n')
  await appendRecords(fs, path, [say('2026-01-02T03:05:00.000Z', 'ok')])
  const loaded = await loadConversation(fs, path)
  assert.equal(loaded?.records.length, 1)
  assert.equal(warn.mock.callCount(), 2)
})

test('loadConversation throws without a valid header and returns null when missing', async () => {
  const fs = memoryFS({
    'c/empty.jsonl': '',
    'c/other.jsonl': '{"format":1,"kind":"note"}\n',
    'c/future.jsonl': '{"format":2,"kind":"conversation"}\n',
    'c/torn.jsonl': '{"format":1,"ki',
  })
  for (const name of ['empty', 'other', 'future', 'torn']) {
    await assert.rejects(loadConversation(fs, `c/${name}.jsonl`), /conversation/)
  }
  assert.equal(await loadConversation(fs, 'c/missing.jsonl'), null)
})

test('appendRecords refuses to create a conversation without a header', async () => {
  await assert.rejects(appendRecords(memoryFS(), 'c/missing.jsonl', [say('x', 'y')]), /not found/)
})

test('listConversations sorts by updatedAt desc, keeps how each opened, and skips unreadable files', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const fs = memoryFS()
  const a = await createConversation(fs, { projectDir, by: 'd', now: new Date('2026-01-01T00:00:00.000Z') })
  const b = await createConversation(fs, { projectDir, by: 'd', now: new Date('2026-01-02T00:00:00.000Z') })
  const c = await createConversation(fs, { projectDir, by: 'd', now: new Date('2026-01-03T00:00:00.000Z') })
  await appendRecords(fs, a.path, [titled('2026-01-05T00:00:00.000Z', 'A')])
  await appendRecords(fs, b.path, [say('2026-01-04T00:00:00.000Z', 'hi')])
  await fs.write(`${projectDir}/conversations/broken.jsonl`, 'garbage\n')
  await fs.write(`${projectDir}/conversations/notes.txt`, 'ignored')
  await fs.write(`${projectDir}/conversations/sub/x.jsonl`, 'ignored')

  const list = await listConversations(fs, projectDir)
  assert.deepEqual(list, [
    { id: a.id, path: a.path, title: 'A', opening: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' },
    { id: b.id, path: b.path, title: '', opening: 'hi', createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z' },
    { id: c.id, path: c.path, title: '', opening: '', createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' },
  ])
  assert.equal(warn.mock.callCount(), 1)
  assert.deepEqual(await listConversations(fs, 'projects/none'), [])
})

test('rewriteRecords keeps the header and only the records given, and appending goes on after them', async () => {
  const { fs, appends } = spyFS()
  const { path, header } = await createConversation(fs, { projectDir, by: 'device-1', now })
  await appendRecords(fs, path, [say('2026-01-02T03:04:06.000Z', 'Hi'), titled('2026-01-02T03:04:07.000Z', 'Greetings'), say('2026-01-02T03:04:08.000Z', 'Again')])
  await rewriteRecords(fs, path, [say('2026-01-02T03:04:06.000Z', 'Hi')])
  await appendRecords(fs, path, [say('2026-01-02T03:04:09.000Z', 'Then')])
  assert.equal(appends.length, 2, 'the rewrite is one write, not an append')
  const loaded = await loadConversation(fs, path)
  assert.deepEqual(loaded?.header, header)
  assert.deepEqual(loaded?.records.map((record) => record.update?.sessionUpdate === 'user_message_chunk' && record.update.content.type === 'text' && record.update.content.text), ['Hi', 'Then'])
  await assert.rejects(rewriteRecords(fs, `${projectDir}/conversations/${ulid()}.jsonl`, []), /not found/)
})

test('deleteConversation removes the file', async () => {
  const fs = memoryFS()
  const kept = await createConversation(fs, { projectDir, by: 'd', now })
  const gone = await createConversation(fs, { projectDir, by: 'd', now })
  await deleteConversation(fs, gone.path)
  assert.equal(await loadConversation(fs, gone.path), null)
  assert.deepEqual((await listConversations(fs, projectDir)).map((s) => s.id), [kept.id])
  await assert.rejects(appendRecords(fs, gone.path, [say('x', 'y')]), /not found/)
})
