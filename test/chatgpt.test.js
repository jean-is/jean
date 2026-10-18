// Bringing in ChatGPT's export (D341): of each conversation, the branch the user saw last, what
// the user and ChatGPT said in it, its title, its times and the files shared, from its parts, once.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS } from '../app/core/fs.js'
import { writeZip } from '../app/core/zip.js'
import { loadConversation, listConversations } from '../app/core/conversations.js'
import { importExport, unpack } from '../app/caps/backup/imports.js'
import { chatgptOf } from '../app/caps/backup/chatgpt.js'

const encoder = new TextEncoder()
/** Seconds since 1970, as ChatGPT writes times. @param {string} time */
const at = (time) => Date.parse(time) / 1000

/** A conversation's tree from its nodes, each [id, parent, message], with its children. @param {[string, string | null, Record<string, any> | null][]} nodes */
function mapping(nodes) {
  return Object.fromEntries(nodes.map(([id, parent, message]) => [id, { id, parent, children: nodes.filter((other) => other[1] === id).map((other) => other[0]), message: message && { id, ...message } }]))
}

/** A message, its words in `parts`. @param {string} role @param {any[]} parts @param {string} time @param {Record<string, any>} [fields] */
const said = (role, parts, time, fields = {}) => ({ author: { role }, create_time: at(time), content: { content_type: parts.some((part) => typeof part !== 'string') ? 'multimodal_text' : 'text', parts }, ...fields })

const trip = {
  title: 'Trip to Lisbon',
  conversation_id: 'conv-trip',
  create_time: at('2026-02-01T09:00:00Z'),
  current_node: 'a2',
  mapping: mapping([
    ['root', null, null],
    ['sys', 'root', { ...said('system', [''], '2026-02-01T09:00:00Z'), metadata: { is_visually_hidden_from_conversation: true } }],
    ['u1', 'sys', said('user', [{ content_type: 'image_asset_pointer', asset_pointer: 'sediment://file_00000000aa11' }, 'Plan a day in Lisbon'], '2026-02-01T09:00:00Z', {
      metadata: { attachments: [{ id: 'file-Notes1', name: 'notes.txt', mime_type: 'text/plain' }] },
    })],
    ['old', 'u1', said('assistant', ['An answer tried again'], '2026-02-01T09:01:00Z')],
    ['think', 'u1', { ...said('assistant', [], '2026-02-01T09:01:00Z'), content: { content_type: 'thoughts', thoughts: [{ summary: 'Thinking' }] } }],
    ['call', 'think', said('assistant', ['{"query":"Lisbon"}'], '2026-02-01T09:01:00Z', { recipient: 'web.run' })],
    ['tool', 'call', said('tool', ['Results'], '2026-02-01T09:01:00Z')],
    ['a1', 'tool', said('assistant', ['Start at Belém\ue200cite\ue202turn0search1\ue201.'], '2026-02-01T09:02:00Z', { recipient: 'all' })],
    ['u2', 'a1', said('user', ['And dinner?'], '2026-02-01T09:05:00Z', { metadata: { attachments: [{ id: 'file_00000000bb22' }] } })],
    ['a2', 'u2', said('assistant', ['Try the fish.'], '2026-02-01T09:06:00Z')],
  ]),
}
const capital = {
  title: null,
  conversation_id: 'conv-capital',
  create_time: at('2026-03-01T10:00:00Z'),
  current_node: 'b2',
  mapping: mapping([['b1', null, said('user', ['What is the capital of Portugal?'], '2026-03-01T10:00:00Z')], ['b2', 'b1', said('assistant', ['Lisbon.'], '2026-03-01T10:00:30Z')]]),
}

/** An export as ChatGPT makes it, its conversations split in two files. */
const exportFiles = () => [
  { name: 'conversations-000.json', bytes: encoder.encode(JSON.stringify([trip])) },
  { name: 'conversations-001.json', bytes: encoder.encode(JSON.stringify([capital])) },
  { name: 'conversation_asset_file_names.json', bytes: encoder.encode(JSON.stringify({ 'file_00000000bb22.dat': 'menu.md' })) },
  { name: 'file-Notes1-notes.txt', bytes: encoder.encode('Bring sunscreen') },
  { name: 'user-abc/file_00000000aa11-0f1e.png', bytes: new Uint8Array([137, 80, 78, 71]) },
  { name: 'file_00000000bb22.dat', bytes: encoder.encode('# Menu') },
  { name: 'chat.html', bytes: encoder.encode('<html></html>') },
  { name: 'user.json', bytes: encoder.encode('{}') },
]

test('a conversation is the branch the user saw last: what the user and ChatGPT said, and the files shared', async () => {
  const entries = await unpack(await writeZip(exportFiles()), 'export.zip')
  const { chats } = await chatgptOf([trip, capital], entries)
  assert.deepEqual(chats.map((chat) => [chat.key, chat.title, chat.turns.map((turn) => [turn.time, turn.request, turn.answer, turn.files.map((file) => `${file.name} ${file.type ?? ''}`)])]), [
    ['chatgpt conv-trip', 'Trip to Lisbon', [
      ['2026-02-01T09:00:00.000Z', 'Plan a day in Lisbon', 'Start at Belém.', ['notes.txt text/plain', 'file_00000000aa11-0f1e.png ']],
      ['2026-02-01T09:05:00.000Z', 'And dinner?', 'Try the fish.', ['menu.md ']],
    ]],
    ['chatgpt conv-capital', '', [['2026-03-01T10:00:00.000Z', 'What is the capital of Portugal?', 'Lisbon.', []]]],
  ])
})

test('an export comes in once, its conversations with their titles, times and files', async () => {
  const fs = memoryFS()
  const projectDir = 'projects/01HOME-home'
  const entries = await unpack(await writeZip(exportFiles()), '0f9a-2026-10-14-10-00-00.zip')
  assert.deepEqual(await importExport(fs, entries, { projectDir, by: 'device-1' }), { conversations: 2, projects: 0, files: 3 })
  const list = await listConversations(fs, projectDir)
  assert.deepEqual(list.map((item) => [item.title, item.createdAt]), [
    ['What is the capital of Portugal?', '2026-03-01T10:00:00.000Z'],
    ['Trip to Lisbon', '2026-02-01T09:00:00.000Z'],
  ])
  const conversation = await loadConversation(fs, list[1].path)
  assert.deepEqual(conversation?.records.filter((record) => record.update).map((record) => {
    const update = /** @type {any} */ (record.update)
    return [record.by, update.content.text ?? `${update.content.name} ${update.content.mimeType}`, record.at]
  }), [
    ['device-1', 'notes.txt text/plain', '2026-02-01T09:00:00.000Z'],
    ['device-1', 'file_00000000aa11-0f1e.png image/png', '2026-02-01T09:00:00.000Z'],
    ['device-1', 'Plan a day in Lisbon', '2026-02-01T09:00:00.000Z'],
    ['jean', 'Start at Belém.', '2026-02-01T09:00:00.000Z'],
    ['device-1', 'menu.md undefined', '2026-02-01T09:05:00.000Z'],
    ['device-1', 'And dinner?', '2026-02-01T09:05:00.000Z'],
    ['jean', 'Try the fish.', '2026-02-01T09:05:00.000Z'],
  ])
  assert.equal(await fs.read(`${projectDir}/files/${(await fs.list(`${projectDir}/files`)).find((entry) => /\.txt$/.test(entry.name))?.name.replace(/\.txt$/, '.md')}`), '[[page 1]]\nBring sunscreen')

  // Again, or its conversations.json alone: nothing new.
  assert.deepEqual(await importExport(fs, entries, { projectDir, by: 'device-1' }), { conversations: 0, projects: 0, files: 0 })
  const alone = await unpack(encoder.encode(JSON.stringify([trip, capital])), 'conversations.json')
  assert.deepEqual(await importExport(fs, alone, { projectDir, by: 'device-1' }), { conversations: 0, projects: 0, files: 0 })
  assert.equal((await listConversations(fs, projectDir)).length, 2)
})
