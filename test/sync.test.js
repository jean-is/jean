import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS, walk } from '../app/core/fs.js'
import { listProjects } from '../app/core/settings.js'
import { claim, syncRound, settleHomes, carried, MARK, BASE } from '../app/caps/sync/mirror.js'

/** @typedef {import('../app/core/types.js').FS} FS */

const HOME = 'projects/01J00000000000000000000000-home'
const A = `${HOME}/conversations/01J0000000000000000000000A.jsonl`
const header = (/** @type {string} */ id) => JSON.stringify({ format: 1, kind: 'conversation', id, createdAt: '2026-10-04T10:00:00.000Z', by: 'laptop' }) + '\n'
const line = (/** @type {string} */ text) => JSON.stringify({ at: '2026-10-04T10:01:00.000Z', by: 'user', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } } }) + '\n'
const later = () => new Promise((resolve) => setTimeout(resolve, 30))

/** Every file Jean's mirror would carry, with its text. @param {FS} fs */
async function files(fs) {
  /** @type {Record<string, string | null>} */
  const out = {}
  for (const path of (await walk(fs)).filter(carried).sort()) out[path] = await fs.read(path)
  return out
}

test('a folder to sync with: an empty one gets the mark, one Jean syncs with is taken, one of other files is refused', async () => {
  const empty = memoryFS({ '.DS_Store': 'x' })
  assert.equal(await claim(empty, { by: 'laptop', now: new Date('2026-10-04T10:00:00Z') }), true)
  assert.deepEqual(JSON.parse(String(await empty.read(MARK))), { format: 1, kind: 'mirror', createdAt: '2026-10-04T10:00:00.000Z', by: 'laptop' })
  assert.equal(await claim(memoryFS({ [MARK]: '{}', 'memory.md': 'x' }), { by: 'desk' }), true)
  const theirs = memoryFS({ 'Taxes/2025.pdf': 'x' })
  assert.equal(await claim(theirs, { by: 'laptop' }), false)
  assert.equal(await theirs.exists(MARK), false)
})

test('the first round brings each side what the other has; keys, caches, settings and what drives leave stay', async () => {
  const here = memoryFS({ 'memory.md': '- likes tea\n', [A]: header('01J0000000000000000000000A'), 'settings.json': '{"locale":"fr"}', '.secrets/keys.json': 'k', '.cache/index.json': 'i' })
  const there = memoryFS({ [MARK]: '{}', 'instructions.md': 'Be brief.', 'settings.json': '{"locale":"ja"}', '.DS_Store': 'x', 'projects/desktop.ini': 'x', '~$notes.docx': 'x' })
  const came = await syncRound(here, there)
  assert.deepEqual(came, ['instructions.md'])
  assert.deepEqual(Object.keys(await files(there)), ['instructions.md', 'memory.md', A])
  assert.equal(await here.read('instructions.md'), 'Be brief.')
  assert.equal(await here.read('settings.json'), '{"locale":"fr"}')
  assert.equal(await there.read('settings.json'), '{"locale":"ja"}')
  for (const path of ['.secrets/keys.json', '.cache/index.json']) assert.equal(await there.exists(path), false)
  assert.equal(await here.exists('.DS_Store'), false)
  assert.ok(await here.exists(BASE))
  // Nothing moved: a second round does nothing; nor does a drive that wrote the same again.
  assert.deepEqual(await syncRound(here, there), [])
  await later()
  await there.write('instructions.md', 'Be brief.')
  assert.deepEqual(await syncRound(here, there), [])
})

test('a change, a new file or a deletion on one side goes to the other, and emptied folders go with their last file', async () => {
  const here = memoryFS({ 'memory.md': '- likes tea\n', 'projects/01J00000000000000000000001-bakery/project.md': '---\nname: Bakery\n---\n' })
  const there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there)
  await here.write('memory.md', '- likes green tea\n')
  await there.write('skills/invoices/SKILL.md', '---\nname: invoices\n---\n')
  assert.deepEqual(await syncRound(here, there), ['skills/invoices/SKILL.md'])
  assert.equal(await there.read('memory.md'), '- likes green tea\n')

  await here.remove('projects/01J00000000000000000000001-bakery')
  await there.remove('skills/invoices/SKILL.md')
  assert.deepEqual(await syncRound(here, there), ['skills/invoices/SKILL.md'])
  assert.equal(await here.exists('skills'), false)
  assert.deepEqual((await there.list('')).map((entry) => entry.name), ['memory.md', MARK])
})

test('a file deleted on one side and changed on the other is kept, changed', async () => {
  const here = memoryFS({ 'instructions.md': 'Be brief.' })
  const there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there)
  await here.remove('instructions.md')
  await there.write('instructions.md', 'Be brief, and kind.')
  assert.deepEqual(await syncRound(here, there), ['instructions.md'])
  assert.equal(await here.read('instructions.md'), 'Be brief, and kind.')
  assert.equal(await there.read('instructions.md'), 'Be brief, and kind.')
})

test('changed on both sides: a conversation’s longer version wins, anything else the newer', async () => {
  const start = header('01J0000000000000000000000A') + line('Hello')
  const here = memoryFS({ [A]: start, 'instructions.md': 'Be brief.' })
  const there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there)
  await here.append(A, line('Mine'))
  await there.append(A, line('Mine') + line('And more'))
  await here.write('instructions.md', 'Be brief, here.')
  await later()
  await there.write('instructions.md', 'Be brief, there.')
  assert.deepEqual((await syncRound(here, there)).sort(), ['instructions.md', A])
  assert.equal(await here.read(A), start + line('Mine') + line('And more'))
  assert.equal(await here.read('instructions.md'), 'Be brief, there.')
})

test('a table changed on two computers keeps every change of both, each cell its latest, and the columns’ choices of both (D491)', async () => {
  const folder = `${HOME}/collections/01K85Z1T00000000000000000A-jobs`
  const table = (/** @type {string[]} */ choices, /** @type {string} */ changed) => JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000A', name: 'Jobs', author: 'jean', created: '2026-10-21T09:00:00.000Z', changed,
    properties: [{ id: 'company', name: 'Company', type: 'text' }, { id: 'stage', name: 'Stage', type: 'select', options: choices.map((name) => ({ name })) }], views: [{ id: 'table', type: 'table' }] })
  const change = (/** @type {string} */ row, /** @type {object} */ set, /** @type {number} */ minute) => `${JSON.stringify({ row, set, at: `2026-10-21T09:${String(minute).padStart(2, '0')}:00.000Z`, by: 'user' })}\n`
  const start = change('01K80000000000000000000001', { company: 'Acme', stage: 'Applied' }, 1)
  const here = memoryFS({ [`${folder}/collection.json`]: table(['Applied'], '2026-10-21T09:00:00.000Z'), [`${folder}/changes.jsonl`]: start })
  const there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there)
  await here.append(`${folder}/changes.jsonl`, change('01K80000000000000000000001', { stage: 'Interview' }, 5))
  await here.write(`${folder}/collection.json`, table(['Applied', 'Interview'], '2026-10-21T09:05:00.000Z'))
  await later()
  await there.append(`${folder}/changes.jsonl`, change('01K80000000000000000000002', { company: 'Globex', stage: 'Offer' }, 3))
  await there.write(`${folder}/collection.json`, table(['Applied', 'Offer'], '2026-10-21T09:03:00.000Z'))
  await syncRound(here, there)
  for (const fs of [here, there]) {
    assert.equal(await fs.read(`${folder}/changes.jsonl`), start + change('01K80000000000000000000002', { company: 'Globex', stage: 'Offer' }, 3) + change('01K80000000000000000000001', { stage: 'Interview' }, 5))
    assert.deepEqual(JSON.parse(await fs.read(`${folder}/collection.json`) ?? '').properties[1].options.map((/** @type {{ name: string }} */ option) => option.name), ['Applied', 'Interview', 'Offer'])
  }
  assert.deepEqual(Object.keys(await files(here)).filter((path) => path.includes('/conversations/')), [])
})

test('a drive that kept the other computer’s file of a table over this one’s loses none of this computer’s changes (D491)', async () => {
  const path = `${HOME}/collections/01K85Z1T00000000000000000A-jobs/changes.jsonl`
  const change = (/** @type {string} */ row, /** @type {string} */ stage, /** @type {number} */ minute) => `${JSON.stringify({ row: `01K8000000000000000000000${row}`, set: { stage }, at: `2026-10-21T09:0${minute}:00.000Z`, by: 'user' })}\n`
  const here = memoryFS({ [path]: change('1', 'Applied', 1) + change('2', 'Offer', 5) })
  const there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there)
  await later()
  await there.write(path, change('1', 'Applied', 1) + change('3', 'Interview', 4))
  await syncRound(here, there)
  const whole = change('1', 'Applied', 1) + change('3', 'Interview', 4) + change('2', 'Offer', 5)
  for (const fs of [here, there]) assert.equal(await fs.read(path), whole)
  // Settled: the next round finds nothing to do.
  await later()
  assert.deepEqual(await syncRound(here, there), [])
})

test('a conversation that went apart on two computers stays, and the mirror’s becomes a new conversation of its own', async () => {
  const start = header('01J0000000000000000000000A') + line('Hello')
  const here = memoryFS({ [A]: start })
  const there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there)
  await here.append(A, line('On the laptop'))
  await there.append(A, line('On the desktop'))
  const came = await syncRound(here, there)
  assert.equal(came.length, 1)
  const [fork] = came
  assert.match(fork, /^projects\/[^/]+\/conversations\/[0-9A-HJKMNP-TV-Z]{26}\.jsonl$/)
  assert.equal(await here.read(A), start + line('On the laptop'))
  assert.equal(await there.read(A), start + line('On the laptop'))
  const [head, ...rest] = String(await here.read(fork)).split('\n')
  assert.equal(JSON.parse(head).id, fork.slice(-32, -6))
  assert.equal(rest.join('\n'), line('Hello') + line('On the desktop'))
  assert.equal(await there.read(fork), await here.read(fork))
  assert.deepEqual(await syncRound(here, there), [])
})

test('a copy a drive kept of a conversation comes in as a conversation of its own, and leaves the mirror', async () => {
  const here = memoryFS({ [A]: header('01J0000000000000000000000A') })
  const there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there)
  const copy = `${HOME}/conversations/01J0000000000000000000000A (desktop's conflicted copy).jsonl`
  await there.write(copy, header('01J0000000000000000000000A') + line('Elsewhere'))
  const [fork] = await syncRound(here, there)
  assert.match(fork, /\/[0-9A-HJKMNP-TV-Z]{26}\.jsonl$/)
  assert.equal(await there.exists(copy), false)
  assert.equal(await here.exists(copy), false)
  assert.equal(JSON.parse(String(await there.read(fork)).split('\n')[0]).id, fork.slice(-32, -6))
})

test('a mirror emptied, or a drive not down yet, takes nothing away: it gets everything back', async () => {
  const here = memoryFS({ 'memory.md': '- likes tea\n', [A]: header('01J0000000000000000000000A') })
  let there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there)
  there = memoryFS({ [MARK]: '{}' })
  assert.deepEqual(await syncRound(here, there), [])
  assert.deepEqual(Object.keys(await files(here)), ['memory.md', A])
  assert.deepEqual(Object.keys(await files(there)), ['memory.md', A])
})

test('a conversation being answered waits; a file that moves while the round works on it isn’t overwritten', async () => {
  const here = memoryFS({ [A]: header('01J0000000000000000000000A'), 'memory.md': '- likes tea\n' })
  const there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there, { busy: (path) => path === A })
  assert.equal(await there.exists(A), false)
  await syncRound(here, there)
  assert.ok(await there.exists(A))

  await here.write('memory.md', '- likes green tea\n')
  await later()
  // The drive writes the mirror's copy after the round looked at it, before it writes there.
  const racing = { ...here, readBytes: async (/** @type {string} */ path) => (path === 'memory.md' && await there.write(path, '- likes coffee\n'), here.readBytes(path)) }
  await syncRound(racing, there)
  assert.equal(await there.read('memory.md'), '- likes coffee\n')
  // The next round sees both changed, and the newer wins.
  await syncRound(here, there)
  assert.equal(await here.read('memory.md'), '- likes coffee\n')
})

test('two homes: the oldest stays the home, a newer empty one goes, one with conversations stays as a project', async () => {
  const project = (/** @type {string} */ by) => `---\nformat: 1\ndefault: true\nname: Home\nby: ${by}\n---\n`
  const fs = memoryFS({ [`${HOME}/project.md`]: project('laptop'), 'projects/01J00000000000000000000009-home/project.md': project('desk') })
  assert.equal(await settleHomes(fs), true)
  assert.deepEqual((await listProjects(fs)).map((each) => each.dir), [HOME])

  await fs.write('projects/01J00000000000000000000009-home/project.md', project('phone'))
  await fs.write('projects/01J00000000000000000000009-home/conversations/01J0000000000000000000000B.jsonl', header('01J0000000000000000000000B'))
  assert.equal(await settleHomes(fs), true)
  const [home, other] = await listProjects(fs)
  assert.equal(home.data.default, true)
  assert.equal(other.data.default, undefined)
  assert.equal(other.data.name, 'Home')
  assert.equal(await settleHomes(fs), false)
})
