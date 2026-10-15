// Bringing in Claude's export (D341): of each conversation, the branch the user saw last, what was
// said in it, its name, its times and the text of the files shared; its projects with their
// instructions and documents, from its parts, once.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS } from '../app/core/fs.js'
import { writeZip } from '../app/core/zip.js'
import { loadConversation, listConversations } from '../app/core/conversations.js'
import { listProjects, parseFrontMatter } from '../app/core/settings.js'
import { importExport, unpack } from '../app/caps/backup/imports.js'
import { claudeOf } from '../app/caps/backup/claude.js'

const encoder = new TextEncoder()
const ROOT = '00000000-0000-4000-8000-000000000000'

/** A message, its words in text blocks. @param {string} uuid @param {string} parent @param {'human' | 'assistant'} sender @param {string} text @param {string} time @param {Record<string, any>} [fields] */
const said = (uuid, parent, sender, text, time, fields = {}) => ({ uuid, parent_message_uuid: parent, sender, text, created_at: time, content: [{ type: 'text', text }], attachments: [], files: [], ...fields })

const conversations = [
  {
    uuid: 'c-budget',
    name: 'Budget review',
    created_at: '2026-04-01T08:00:00.123456Z',
    current_leaf_message_uuid: 'm4',
    chat_messages: [
      said('m1', ROOT, 'human', 'Check this budget', '2026-04-01T08:00:00.123456Z', {
        attachments: [{ file_name: 'budget.xlsx', file_type: 'xlsx', extracted_content: 'Rent 1200\nFood 400' }, { file_name: '', file_type: 'txt', extracted_content: 'Some pasted notes here please' }],
      }),
      said('m2', 'm1', 'assistant', '', '2026-04-01T08:00:10Z', {
        content: [{ type: 'thinking', thinking: 'Rent first' }, { type: 'text', text: 'Rent is high.' }, { type: 'tool_use', name: 'web_search', input: { query: 'rent' } }, { type: 'tool_result', content: [{ type: 'text', text: 'Results' }] }, { type: 'text', text: 'Cut food.' }],
      }),
      said('m3', 'm2', 'human', 'And savings?', '2026-04-01T08:05:00Z'),
      said('m4old', 'm3', 'assistant', 'An answer tried again', '2026-04-01T08:05:10Z'),
      said('m4', 'm3', 'assistant', 'Save 10%.', '2026-04-01T08:06:00Z'),
    ],
  },
  {
    uuid: 'c-hello',
    name: '',
    created_at: '2026-04-02T09:00:00Z',
    chat_messages: [
      said('n1', ROOT, 'human', 'Hello there', '2026-04-02T09:00:00Z'),
      said('n2', 'n1', 'assistant', 'Hi!', '2026-04-02T09:00:05Z'),
      said('n2b', 'n1', 'assistant', 'Hey.', '2026-04-02T09:00:20Z'),
      said('n3', 'n2b', 'human', 'Bye', '2026-04-02T09:01:00Z'),
    ],
  },
  {
    uuid: 'c-old',
    name: 'Old',
    created_at: '2025-01-01T00:00:00Z',
    chat_messages: [
      { uuid: 'o1', sender: 'human', text: 'Old question', created_at: '2025-01-01T00:00:00Z' },
      { uuid: 'o2', sender: 'assistant', text: 'Old answer\n\n```\nThis block is not supported on your current device yet.\n```', created_at: '2025-01-01T00:00:05Z' },
    ],
  },
]
const projects = [
  { uuid: 'p-tax', name: 'Tax help', description: 'Taxes', prompt_template: 'Answer as a tax adviser.', is_starter_project: false, docs: [{ filename: 'rules.pdf', content: 'Deduct what you gave.' }, { filename: 'notes.md', content: '# Notes' }] },
  { uuid: 'p-start', name: 'How to use Claude', prompt_template: '', is_starter_project: true, docs: [{ filename: 'guide.md', content: '# Guide' }] },
]

test('a conversation is the branch the user saw last, else the longest, or its list; a file shared is the text Claude read', () => {
  const { chats, rooms } = claudeOf([...conversations, ...projects])
  assert.deepEqual(chats.map((chat) => [chat.key, chat.title, chat.turns.map((turn) => [turn.time, turn.request, turn.answer, turn.files.map((file) => file.name)])]), [
    ['claude c-budget', 'Budget review', [
      ['2026-04-01T08:00:00.123Z', 'Check this budget', 'Rent is high.\n\nCut food.', ['budget.xlsx.txt', 'Some pasted notes here….txt']],
      ['2026-04-01T08:05:00.000Z', 'And savings?', 'Save 10%.', []],
    ]],
    ['claude c-hello', '', [['2026-04-02T09:00:00.000Z', 'Hello there', 'Hey.', []], ['2026-04-02T09:01:00.000Z', 'Bye', '', []]]],
    ['claude c-old', 'Old', [['2025-01-01T00:00:00.000Z', 'Old question', 'Old answer', []]]],
  ])
  assert.deepEqual(rooms.map((room) => [room.name, room.instructions, room.files.map((file) => file.name)]), [['Tax help', 'Answer as a tax adviser.', ['rules.pdf.txt', 'notes.md']]])
})

test('an export comes in once, its parts together: conversations into the project, projects with their instructions and documents', async () => {
  const fs = memoryFS()
  const projectDir = 'projects/01HOME-home'
  await fs.write(`${projectDir}/project.md`, '---\nformat: 1\ndefault: true\nname: Home\n---\n')
  const parts = await Promise.all([
    writeZip([{ name: 'conversations.json', bytes: encoder.encode(JSON.stringify(conversations)) }, { name: 'users.json', bytes: encoder.encode('[]') }]),
    writeZip([{ name: 'projects.json', bytes: encoder.encode(JSON.stringify(projects)) }]),
  ])
  const entries = (await Promise.all(parts.map((bytes, i) => unpack(bytes, `data-2026-10-14-batch-000${i}.zip`)))).flat()
  assert.deepEqual(await importExport(fs, entries, { projectDir, by: 'device-1' }), { conversations: 3, projects: 1, files: 4 })

  const list = await listConversations(fs, projectDir)
  assert.deepEqual(list.map((item) => [item.title, item.createdAt]), [
    ['Hello there', '2026-04-02T09:00:00.000Z'],
    ['Budget review', '2026-04-01T08:00:00.123Z'],
    ['Old', '2025-01-01T00:00:00.000Z'],
  ])
  const budget = await loadConversation(fs, list[1].path)
  assert.deepEqual(budget?.records.filter((record) => record.update).map((record) => {
    const update = /** @type {any} */ (record.update)
    return [record.by, update.content.text ?? update.content.name]
  }), [
    ['device-1', 'budget.xlsx.txt'],
    ['device-1', 'Some pasted notes here….txt'],
    ['device-1', 'Check this budget'],
    ['jean', 'Rent is high.\n\nCut food.'],
    ['device-1', 'And savings?'],
    ['jean', 'Save 10%.'],
  ])
  const tax = (await listProjects(fs)).find((project) => project.data.name === 'Tax help')
  assert.ok(tax)
  assert.equal(parseFrontMatter((await fs.read(`${tax.dir}/instructions.md`)) ?? '').body.trim(), 'Answer as a tax adviser.')
  const docs = await Promise.all((await fs.list(`${tax.dir}/files`)).filter((entry) => entry.name.endsWith('.meta.json')).map(async (entry) => JSON.parse((await fs.read(`${tax.dir}/files/${entry.name}`)) ?? '{}').name))
  assert.deepEqual(docs.sort(), ['notes.md', 'rules.pdf.txt'])
  assert.ok(!(await listProjects(fs)).some((project) => project.data.name === 'How to use Claude'), 'the example project stays out')

  // Again: nothing new.
  assert.deepEqual(await importExport(fs, entries, { projectDir, by: 'device-1' }), { conversations: 0, projects: 0, files: 0 })
  assert.equal((await listProjects(fs)).length, 2)
})
