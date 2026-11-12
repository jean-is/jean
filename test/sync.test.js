// SPDX-License-Identifier: MIT
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS, walk } from '../app/core/fs.js'
import { listProjects } from '../app/core/settings.js'
import { claim, syncRound, settleHomes, carried, MARK, BASE } from '../app/caps/sync/mirror.js'
import { removal } from '../app/ui/removal.js'
import { createConversation, appendRecords } from '../app/core/conversations.js'

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

test('two Jeans on the same folder, with no drive between, each bring in the other’s work at their next round, both ways, and settle', async () => {
  const B = `${HOME}/conversations/01J0000000000000000000000B.jsonl`
  const laptop = memoryFS({ [A]: header('01J0000000000000000000000A') + line('Hello'), 'memory.md': '- likes tea\n' })
  const desk = memoryFS()
  const folder = memoryFS({ [MARK]: '{}' })
  await syncRound(laptop, folder)
  assert.deepEqual((await syncRound(desk, folder)).sort(), [A, 'memory.md'].sort())

  // Each works apart: the desk goes on with a task and starts one, the laptop changes its memory.
  await desk.append(A, line('From the desk'))
  await desk.write(B, header('01J0000000000000000000000B'))
  await laptop.write('memory.md', '- likes green tea\n')
  assert.deepEqual(await syncRound(laptop, folder), [])
  assert.deepEqual(await syncRound(desk, folder), ['memory.md'])
  assert.deepEqual((await syncRound(laptop, folder)).sort(), [A, B].sort())
  assert.equal(await laptop.read(A), header('01J0000000000000000000000A') + line('Hello') + line('From the desk'))

  // A task deleted on one goes from the other.
  await laptop.remove(B)
  await syncRound(laptop, folder)
  assert.deepEqual(await syncRound(desk, folder), [B])
  for (const jean of [laptop, desk]) assert.deepEqual(await syncRound(jean, folder), [])
  assert.deepEqual(await files(desk), await files(laptop))
  assert.deepEqual(await files(folder), await files(laptop))
})

/** A round's `removing`, Jean's protocol with a hook that notes what it is asked and lets it go or not. @param {{ lets: boolean }} answer @param {any[]} asked */
const removing = (answer, asked) => /** @type {(removals: any[], act: () => Promise<unknown>) => Promise<boolean>} */ (async (removals, act) => !(await removal([{ on: 'remove', run: (e, next) => {
  asked.push(e)
  return answer.lets ? next(e) : { refuse: 'No copy.' }
} }], removals, act, async () => [])))

test('a conversation deleted on the other side is asked about first, with its records: refused, it stays, and the next round asks again (D412)', async () => {
  const [first, second] = [line('Sort the applications'), line('Rank the shortlist')]
  const B = `${HOME}/conversations/01J0000000000000000000000B.jsonl`
  const here = memoryFS({ [A]: header('01J0000000000000000000000A') + first + second, [B]: header('01J0000000000000000000000B'), 'memory.md': '- likes tea\n', 'instructions.md': 'Be brief.' })
  const there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there)
  for (const path of [A, B, 'memory.md']) await there.remove(path)
  /** @type {any[]} */
  const asked = []
  const answer = { lets: false }
  // A conversation with no records, and a file of another kind, have nothing to ask about.
  assert.deepEqual((await syncRound(here, there, { removing: removing(answer, asked) })).sort(), ['memory.md', B])
  assert.deepEqual(asked, [{ task: A, records: [JSON.parse(first), JSON.parse(second)], all: true }])
  assert.equal(await here.read(A), header('01J0000000000000000000000A') + first + second)
  assert.equal(await there.exists(A), false)

  answer.lets = true
  assert.deepEqual(await syncRound(here, there, { removing: removing(answer, asked) }), [A])
  assert.equal(asked.length, 2)
  assert.equal(await here.exists(A), false)
  assert.deepEqual(await syncRound(here, there, { removing: removing(answer, asked) }), [])
  assert.equal(asked.length, 2)
})

test('a conversation that lost records on the other side is asked about those alone; one that grew, or changed on both sides, is not (D412)', async () => {
  const id = '01J0000000000000000000000A'
  const [first, second, third, fourth] = ['Sort the applications', 'Rank the shortlist', 'Write to them', 'Write to Ana'].map(line)
  const title = JSON.stringify({ at: '2026-10-04T10:02:00.000Z', by: 'user', meta: { title: 'Shortlist' } }) + '\n'
  const here = memoryFS({ [A]: header(id) + first + second + title })
  const there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there)
  /** @type {any[]} */
  const asked = []
  const answer = { lets: true }
  const round = () => syncRound(here, there, { removing: removing(answer, asked) })

  await later()
  await there.write(A, header(id) + first + second + title + third)
  assert.deepEqual(await round(), [A])
  assert.deepEqual(asked, [])

  // Gone back to a request there: what came after it left, but the title, and a new answer came.
  await later()
  const back = header(id) + first + title + fourth
  await there.write(A, back)
  answer.lets = false
  assert.deepEqual(await round(), [])
  assert.deepEqual(asked, [{ task: A, records: [JSON.parse(second), JSON.parse(third)], all: false }])
  assert.equal(await here.read(A), header(id) + first + second + title + third)
  answer.lets = true
  assert.deepEqual(await round(), [A])
  assert.equal(await here.read(A), back)
  assert.equal(asked.length, 2)

  // Changed on both sides, the longer stays here: nothing leaves.
  await later()
  await here.append(A, line('One more'))
  await there.write(A, header(id) + first)
  await round()
  assert.equal(await there.read(A), `${back}${line('One more')}`)
  assert.equal(asked.length, 2)
})

test('a record that comes late doesn’t bring back without its header a conversation a round took', async () => {
  const here = memoryFS({ 'memory.md': '- likes tea\n' })
  const { path } = await createConversation(here, { projectDir: HOME, by: 'laptop' })
  await appendRecords(here, path, [JSON.parse(line('Hello'))])
  const there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there)
  await there.remove(path)
  assert.deepEqual(await syncRound(here, there), [path])
  await assert.rejects(appendRecords(here, path, [JSON.parse(line('Late'))]), /not found/)
  assert.equal(await here.exists(path), false)
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

test('changed on both sides: a conversation’s longer version wins, anything else but Markdown the newer', async () => {
  const start = header('01J0000000000000000000000A') + line('Hello')
  const PLAN = `${HOME}/workspace/plan.txt`
  const here = memoryFS({ [A]: start, [PLAN]: 'Be brief.' })
  const there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there)
  await here.append(A, line('Mine'))
  await there.append(A, line('Mine') + line('And more'))
  await here.write(PLAN, 'Be brief, here.')
  await later()
  await there.write(PLAN, 'Be brief, there.')
  assert.deepEqual((await syncRound(here, there)).sort(), [A, PLAN])
  assert.equal(await here.read(A), start + line('Mine') + line('And more'))
  assert.equal(await here.read(PLAN), 'Be brief, there.')
})

test('a document changed on two computers keeps the changes of both, line by line, and the newer one’s front matter; with no version both had, the newer wins', async () => {
  const DOC = `${HOME}/documents/01K90000000000000000000000-trip.md`
  const head = (/** @type {string} */ changed) => `---\nformat: 1\nauthor: user\nchanged: ${changed}\n---\n`
  const body = '# Trip\n\nWe leave on Monday.\n\nCall Anna.\n'
  const here = memoryFS({ [DOC]: head('09:00') + body })
  const there = memoryFS({ [MARK]: '{}' })
  await syncRound(here, there)
  // Apart, each changes its own paragraph, the folder's later.
  await here.write(DOC, head('10:00') + body.replace('Monday', 'Tuesday'))
  await later()
  await there.write(DOC, head('11:00') + body.replace('Anna', 'Anna and Tom'))
  assert.deepEqual(await syncRound(here, there), [DOC])
  const both = head('11:00') + '# Trip\n\nWe leave on Tuesday.\n\nCall Anna and Tom.\n'
  assert.equal(await here.read(DOC), both)
  assert.equal(await there.read(DOC), both)
  assert.deepEqual(await syncRound(here, there), [])
  // Again: the version both had is that one now. Memory merges the same way.
  await here.write(DOC, both.replace('# Trip', '# Our trip'))
  await there.write(DOC, both.replace('Tom.\n', 'Tom.\n\nPack light.\n'))
  await syncRound(here, there)
  assert.equal(await here.read(DOC), head('11:00') + '# Our trip\n\nWe leave on Tuesday.\n\nCall Anna and Tom.\n\nPack light.\n')
  // With what both had lost, a cache cleared: the newer.
  await here.remove(`.cache/sync/${DOC}`)
  await here.write(DOC, head('12:00') + 'Mine.\n')
  await later()
  await there.write(DOC, head('13:00') + 'Theirs.\n')
  await syncRound(here, there)
  assert.equal(await here.read(DOC), head('13:00') + 'Theirs.\n')
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
  // The next round sees both changed, and keeps both lines, from the version both had.
  await syncRound(here, there)
  assert.equal(await here.read('memory.md'), '- likes green tea\n\n- likes coffee\n')
})

/** An FS whose writes of the paths `when` names are refused, as the store refuses a version that moved since it was read. @param {FS} fs @param {(path: string) => boolean} when */
const refusing = (fs, when) => ({ ...fs, writeBytes: async (/** @type {string} */ path, /** @type {Uint8Array} */ bytes) => {
  if (when(path)) throw new DOMException('It moved.', 'InvalidModificationError')
  return fs.writeBytes(path, bytes)
} })

test('a write the other side refuses keeps this side’s words: alone, or merged with that side’s, until a round gets them there', async () => {
  for (const both of [false, true]) {
    const here = memoryFS({ 'memory.md': 'A\n\nB\n\nC\n' })
    const there = memoryFS({ [MARK]: '{}' })
    await syncRound(here, there)
    await here.write('memory.md', 'A mine\n\nB\n\nC\n')
    await later()
    if (both) await there.write('memory.md', 'A\n\nB\n\nC theirs\n')
    await syncRound(here, refusing(there, (path) => path === 'memory.md'))
    if (!both) await there.write('memory.md', 'A\n\nB\n\nC theirs\n')
    await later()
    await syncRound(here, there)
    assert.equal(await here.read('memory.md'), 'A mine\n\nB\n\nC theirs\n', both ? 'merged' : 'alone')
    assert.equal(await there.read('memory.md'), 'A mine\n\nB\n\nC theirs\n')
  }
})

test('a conversation that grew by as many bytes as a sealed file’s size counts beyond its words still goes', async () => {
  const added = line('And one more thing.')
  // OPFS says a sealed file's size, which is more than its words.
  const sealed = (/** @type {FS} */ fs) => ({ ...fs, stat: async (/** @type {string} */ path) => ((one) => one && { ...one, size: one.size + new TextEncoder().encode(added).length })(await fs.stat?.(path)) })
  const here = memoryFS({ [A]: header('01J0000000000000000000000A') + line('Hello') })
  const there = sealed(memoryFS({ [MARK]: '{}' }))
  await syncRound(here, there)
  await here.append(A, added)
  await syncRound(here, there)
  assert.equal(await there.read(A), header('01J0000000000000000000000A') + line('Hello') + added)
})

test('two mirrors each keep their base and their versions to merge from where `cache` says, and a path `carry` leaves out stays here', async () => {
  const BAKERY = 'projects/01J00000000000000000000001-bakery/project.md'
  const here = memoryFS({ 'memory.md': '- likes tea\n', [BAKERY]: '---\nname: Bakery\n---\n' })
  const [one, two] = [memoryFS({ [MARK]: '{}' }), memoryFS({ [MARK]: '{}' })]
  await syncRound(here, one, { cache: '.cache/one' })
  await syncRound(here, two, { cache: '.cache/two' })
  assert.deepEqual([await here.exists('.cache/one.json'), await here.exists('.cache/two.json'), await here.exists(BASE)], [true, true, false])
  assert.deepEqual([await here.read('.cache/one/memory.md'), await here.read('.cache/two/memory.md')], ['- likes tea\n', '- likes tea\n'])
  // The bakery kept on this device from now on: the mirror's copy goes as `carry` withdraws it, never this device's.
  const kept = (/** @type {string} */ path) => carried(path) && !path.startsWith('projects/01J00000000000000000000001-bakery/')
  await one.remove(BAKERY)
  await syncRound(here, one, { cache: '.cache/one', carry: kept })
  assert.equal(await here.read(BAKERY), '---\nname: Bakery\n---\n')
})

test('a path that fails waits for the next round, the others go on, the base is kept and the failure thrown; a file deleted takes its version to merge from', async () => {
  const here = memoryFS({ 'memory.md': '- likes tea\n', 'skills/a/SKILL.md': '---\nname: a\n---\n' })
  const there = memoryFS({ [MARK]: '{}' })
  const failing = { ...there, writeBytes: async (/** @type {string} */ path, /** @type {Uint8Array} */ bytes) => {
    if (path === 'memory.md') throw new Error('The drive is full.')
    return there.writeBytes(path, bytes)
  } }
  await assert.rejects(syncRound(here, failing), /The drive is full/)
  assert.ok(await there.exists('skills/a/SKILL.md'))
  assert.equal(await there.exists('memory.md'), false)
  await syncRound(here, there)
  assert.equal(await there.read('memory.md'), '- likes tea\n')
  await there.remove('memory.md')
  await syncRound(here, there)
  assert.deepEqual([await here.exists('memory.md'), await here.exists('.cache/sync/memory.md')], [false, false])
})

test('a first round takes four paths at a time, words before pictures', async () => {
  const pictures = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`${HOME}/files/sha256-${i}.png`, 'picture']))
  const here = memoryFS({ ...pictures, 'memory.md': '- likes tea\n', [A]: header('01J0000000000000000000000A') })
  const there = memoryFS({ [MARK]: '{}' })
  let [now, most] = [0, 0]
  /** @type {string[]} */
  const order = []
  const counting = { ...there, writeBytes: async (/** @type {string} */ path, /** @type {Uint8Array} */ bytes) => {
    order.push(path)
    most = Math.max(most, ++now)
    await later()
    now--
    return there.writeBytes(path, bytes)
  } }
  await syncRound(here, counting)
  assert.equal(most, 4)
  assert.deepEqual(order.slice(0, 2).sort(), ['memory.md', A])
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

test('rounds (rounds.js): one round at a time, each kind once; one that sends outside starts none while an answer is written, here or in another tab', async () => {
  globalThis.sessionStorage ??= /** @type {any} */ ({ getItem: () => 'profiles/01J00000000000000000000000-ada' })
  const { app } = await import('../app/ui/state.js')
  const { rounds, round, answering } = await import('../app/caps/sync/rounds.js')
  const { mine } = await import('../app/ui/opfs.js')
  const ran = /** @type {string[]} */ ([])
  /** A kind of round that takes a moment. @param {string} name @param {boolean} [outside] */
  const kind = (name, outside = false) => rounds({ carry: () => true, outside, run: async () => { ran.push(name); await later(); return [] } })
  const stops = [kind('folder'), kind('store', true)]
  // Asked twice at once: the second finds the first under way and comes later; each kind runs once.
  await Promise.all([round(), round()])
  assert.deepEqual(ran.splice(0), ['folder', 'store'])
  // An answer here: the tab holds `app-answering` meanwhile, and the store's round waits, the folder's goes on.
  app.running.value = ['projects/x/conversations/a.jsonl']
  await later()
  assert.ok((await navigator.locks.query()).held?.some((one) => one.name === mine('app-answering') && one.mode === 'shared'))
  assert.equal(await answering(), true)
  await round()
  assert.deepEqual(ran.splice(0), ['folder'])
  app.running.value = []
  await later()
  assert.equal(await answering(), false)
  // An answer in another tab, which holds the lock: the same.
  let release = () => {}
  navigator.locks.request(mine('app-answering'), { mode: 'shared' }, () => new Promise((resolve) => { release = () => resolve(undefined) }))
  await later()
  await round()
  assert.deepEqual(ran.splice(0), ['folder'])
  release()
  await later()
  await round()
  assert.deepEqual(ran.splice(0), ['folder', 'store'])
  for (const stop of stops) stop()
})
