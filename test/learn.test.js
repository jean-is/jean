// 0.7 "Learn and repeat": skills from elsewhere, read from discovery indexes and checked against
// their digests (D121), and routines, requests Jean sends itself on a schedule (D122).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { memoryFS, writeJSON } from '../core/fs.js'
import { writeZip } from '../core/zip.js'
import { saveSkill, parseSkill } from '../core/skills.js'
import { loadSettings, renamed } from '../core/settings.js'
import { SCHEMA, indexURL, parseIndex, sha256, unpack, untar, readIndexes, bestFit, SkillError } from '../caps/skills/sources.js'
import { schedule, dueTime, due, inEnglish, localStamp, listRoutines, newRoutine, writeRoutine, parseRoutine } from '../caps/routines/schedule.js'

const text = (/** @type {string} */ value) => new TextEncoder().encode(value)
const STEPS = '---\nname: weekly-sales-report\ndescription: Summarize weekly sales by region.\n---\n# Weekly sales report\n\n1. Read the spreadsheet.\n2. Total by region.\n'

/**
 * A tar.gz of these files; `type` '2' makes a link.
 * @param {{ path: string, body?: string, type?: string }[]} files
 */
function targz(files) {
  const blocks = files.flatMap(({ path, body = '', type = '0' }) => {
    const head = new Uint8Array(512)
    head.set(text(path), 0)
    head.set(text(`${body.length.toString(8).padStart(11, '0')}\0`), 124)
    head[156] = type.charCodeAt(0)
    head.set(text('ustar\x0000'), 257)
    const data = new Uint8Array(Math.ceil(body.length / 512) * 512)
    data.set(text(body))
    return [head, data]
  })
  const all = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 1024))
  let at = 0
  for (const block of blocks) {
    all.set(block, at)
    at += block.length
  }
  return new Uint8Array(gzipSync(all))
}

/** @param {Uint8Array} bytes @param {'skill-md' | 'archive'} [type] */
const entryFor = async (bytes, type = 'archive') => ({ name: 'weekly-sales-report', type, description: 'Summarize weekly sales by region.', url: 'https://skills.example/a', digest: await sha256(bytes), source: 'https://skills.example/.well-known/agent-skills/index.json' })

test('an index is found from a site, or given whole', () => {
  assert.equal(indexURL('skills.example'), 'https://skills.example/.well-known/agent-skills/index.json')
  assert.equal(indexURL(' https://skills.example/ '), 'https://skills.example/.well-known/agent-skills/index.json')
  assert.equal(indexURL('http://127.0.0.1:4182/team/index.json'), 'http://127.0.0.1:4182/team/index.json')
  assert.throws(() => indexURL('not a site at all'))
})

test('an index lists valid skills with absolute addresses, and one of another version is not read', () => {
  const source = 'https://skills.example/.well-known/agent-skills/index.json'
  const digest = `sha256:${'a'.repeat(64)}`
  const skills = parseIndex({ $schema: SCHEMA, skills: [
    { name: 'meeting-notes', type: 'skill-md', description: ' Notes into decisions. ', url: '/.well-known/agent-skills/meeting-notes/SKILL.md', digest },
    { name: 'pack', type: 'archive', description: 'An archive.', url: 'https://cdn.example/pack.tar.gz', digest },
    { name: 'Bad Name', type: 'skill-md', description: 'x', url: 'a', digest },
    { name: 'no-digest', type: 'skill-md', description: 'x', url: 'a' },
    { name: 'weird-type', type: 'zip', description: 'x', url: 'a', digest },
    { name: 'no-description', type: 'skill-md', description: '', url: 'a', digest },
    { name: 'scripted', type: 'skill-md', description: 'x', url: 'javascript:alert(1)', digest },
  ] }, source)
  assert.deepEqual(skills.map((skill) => [skill.name, skill.url, skill.description]), [
    ['meeting-notes', 'https://skills.example/.well-known/agent-skills/meeting-notes/SKILL.md', 'Notes into decisions.'],
    ['pack', 'https://cdn.example/pack.tar.gz', 'An archive.'],
  ])
  assert.equal(skills[0].source, source)
  assert.throws(() => parseIndex({ version: '0.1.0', skills: [] }, source), /Not a skills index/)
})

test('a skill is added only as its digest says, and only when it is made of instructions', async () => {
  assert.equal(await sha256(text('abc')), 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  const file = text(STEPS)
  const single = await unpack(await entryFor(file, 'skill-md'), file)
  assert.equal(single.body, '# Weekly sales report\n\n1. Read the spreadsheet.\n2. Total by region.')
  assert.deepEqual(single.files, [])
  await assert.rejects(unpack({ ...await entryFor(file, 'skill-md'), digest: `sha256:${'0'.repeat(64)}` }, file), (error) => error instanceof SkillError && error.code === 'digest')

  // An archive: SKILL.md at its root and Markdown beside it, folders and macOS leftovers skipped.
  const archive = targz([{ path: 'SKILL.md', body: STEPS }, { path: 'references/', type: '5' }, { path: 'references/regions.md', body: '# Regions\nNorth, South.' }, { path: '__MACOSX/._SKILL.md', body: 'x' }])
  const unpacked = await unpack(await entryFor(archive), archive)
  assert.deepEqual(unpacked.files, [{ path: 'references/regions.md', text: '# Regions\nNorth, South.' }])
  // The same as a zip.
  const zip = await writeZip([{ name: 'SKILL.md', bytes: text(STEPS) }, { name: 'LICENSE', bytes: text('MIT') }])
  assert.deepEqual((await unpack(await entryFor(zip), zip)).files, [{ path: 'LICENSE', text: 'MIT' }])

  const refused = async (/** @type {Uint8Array} */ bytes, /** @type {string} */ code) => assert.rejects(unpack(await entryFor(bytes), bytes), (error) => error instanceof SkillError && error.code === code)
  await refused(targz([{ path: 'SKILL.md', body: STEPS }, { path: 'scripts/total.py', body: 'print(1)' }]), 'programs')
  await refused(targz([{ path: 'SKILL.md', body: STEPS }, { path: 'logo.png', body: 'PNG' }]), 'programs')
  await refused(targz([{ path: 'SKILL.md', body: STEPS }, { path: '../outside.md', body: 'x' }]), 'invalid')
  await refused(targz([{ path: 'SKILL.md', body: STEPS }, { path: 'link.md', type: '2' }]), 'invalid')
  await refused(targz([{ path: 'skill/SKILL.md', body: STEPS }]), 'invalid')
  await refused(targz([{ path: 'SKILL.md', body: '---\nname: x\n---\n' }]), 'invalid')
  assert.deepEqual(untar(new Uint8Array(1024)), [], 'an empty tar')
})

test('indexes are read once a day, and one that fails keeps what it had', async () => {
  const fs = memoryFS()
  const url = 'https://skills.example/.well-known/agent-skills/index.json'
  const index = { $schema: SCHEMA, skills: [{ name: 'meeting-notes', type: 'skill-md', description: 'Notes into decisions.', url: 'notes.md', digest: `sha256:${'b'.repeat(64)}` }] }
  let calls = 0
  let fails = false
  const fetch = /** @type {typeof globalThis.fetch} */ (/** @type {unknown} */ (async () => {
    calls++
    if (fails) throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(index), { headers: { 'content-type': 'application/json' } })
  }))
  const now = new Date('2026-10-03T10:00:00Z')
  const [first] = await readIndexes(fs, [url], { fetch, now })
  assert.deepEqual(first.skills.map((skill) => skill.url), ['https://skills.example/.well-known/agent-skills/notes.md'])
  await readIndexes(fs, [url], { fetch, now: new Date('2026-10-03T20:00:00Z') })
  assert.equal(calls, 1, 'from the cache within a day')
  fails = true
  const [later] = await readIndexes(fs, [url], { fetch, now: new Date('2026-10-04T11:00:00Z') })
  assert.equal(calls, 2)
  assert.equal(later.error, 'Failed to fetch')
  assert.equal(later.skills.length, 1, 'what was read before')
  fails = false
  await readIndexes(fs, [url], { fetch, now: new Date('2026-10-04T11:01:00Z') })
  assert.equal(calls, 3, 'a source that failed is read again at once')
  await readIndexes(fs, [url], { fetch, now: new Date('2026-10-04T11:02:00Z'), again: true })
  assert.equal(calls, 4, 'or when asked')
  assert.ok((await fs.list('.cache/skills')).length === 1, 'kept in .cache/, which backups leave out')
})

test('a request finds the skill of its kind, never one the user has, and nothing when none fits', () => {
  const entries = ['weekly-sales-report: Summarize weekly sales by region from a spreadsheet, with totals.', 'meeting-notes: Turn meeting notes into a summary with decisions and action items.', 'neon-postgres: Guides and best practices for working with Postgres on Neon.']
    .map((line) => ({ name: line.split(':')[0], description: line.split(': ')[1], type: /** @type {const} */ ('skill-md'), url: 'https://x/a', digest: '', source: 'https://x/i.json' }))
  assert.equal(bestFit('Summarize the weekly sales by region', entries, [], 0.5)?.name, 'weekly-sales-report')
  assert.equal(bestFit('Turn these meeting notes into a summary', entries, [], 0.5)?.name, 'meeting-notes')
  assert.equal(bestFit('Summarize the weekly sales by region', entries, ['weekly-sales-report'], 0.5), null)
  assert.equal(bestFit('What is the capital of France?', entries, [], 0.5), null)
  assert.equal(bestFit('Write to my team about the new schedule', entries, [], 0.5), null)
})

test('a skill from elsewhere keeps where it came from and its digest', async () => {
  const fs = memoryFS()
  const path = await saveSkill(fs, '', { name: 'meeting-notes', description: 'Notes into decisions.', body: '# Meeting notes', by: 'device', now: new Date('2026-10-03T10:00:00Z'), source: 'https://skills.example/notes.md', digest: `sha256:${'c'.repeat(64)}` })
  const saved = /** @type {string} */ (await fs.read(path))
  assert.match(saved, /\n {2}source: "https:\/\/skills\.example\/notes\.md"\n {2}digest: "sha256:c{64}"\n/)
  assert.equal(parseSkill(saved, path)?.source, 'https://skills.example/notes.md')
  assert.equal(parseSkill(STEPS, 'skills/weekly-sales-report/SKILL.md')?.source, undefined)
})

test('settings name routines as they are now; before format 2, routines were skills (D115, D122)', async () => {
  const fs = memoryFS()
  await writeJSON(fs, 'settings.json', { format: 1, unlocked: ['files', 'routines', 'memory'], offers: { routines: '2026-10-02T10:00:00.000Z', backup: '2026-10-01T09:00:00.000Z' } })
  const before = await loadSettings(fs)
  assert.deepEqual(before.unlocked, ['files', 'skills', 'memory'])
  assert.deepEqual(before.offers, { skills: '2026-10-02T10:00:00.000Z', backup: '2026-10-01T09:00:00.000Z' })
  assert.equal(before.format, 2)
  await writeJSON(fs, 'settings.json', { ...before, unlocked: [...before.unlocked, 'routines'] })
  assert.deepEqual((await loadSettings(fs)).unlocked, ['files', 'skills', 'memory', 'routines'])
  assert.deepEqual((await loadSettings(memoryFS())).unlocked, [], 'no settings yet: the defaults')
  // Older conversations name the tools they were given.
  assert.deepEqual(['routine', 'save_routine', 'read', 'routines'].map(renamed), ['skill', 'save_skill', 'read', 'routines'])
})

test('a schedule is every day, working day, week or month, at a local time', () => {
  assert.deepEqual(schedule({ every: 'day', at: '8:05' }), { every: 'day', at: '08:05' })
  assert.deepEqual(schedule({ every: 'week', on: 'Monday', at: '09:00' }), { every: 'week', on: 1, at: '09:00' })
  assert.deepEqual(schedule({ every: 'week', on: '0', at: '09:00' }), { every: 'week', on: 0, at: '09:00' })
  assert.deepEqual(schedule({ every: 'month', on: 31, at: '23:59', }), { every: 'month', on: 31, at: '23:59' })
  assert.deepEqual(schedule({ every: 'weekday', on: 3, at: '07:30' }), { every: 'weekday', at: '07:30' }, 'a day only for a week or a month')
  for (const wrong of [{ every: 'hour', at: '08:00' }, { every: 'day', at: '25:00' }, { every: 'day' }, { every: 'week', at: '08:00' }, { every: 'month', on: 0, at: '08:00' }, { every: 'week', on: 'someday', at: '08:00' }]) assert.equal(schedule(wrong), null)
  assert.equal(inEnglish({ every: 'week', on: 1, at: '09:00' }), 'every Monday at 09:00')
  assert.equal(inEnglish({ every: 'month', on: 5, at: '08:00' }), 'on day 5 of every month at 08:00')
  assert.equal(localStamp(new Date(2026, 9, 5, 8, 0)), '2026-10-05 08:00 (Monday)')
})

test('a routine falls due once for the times missed, and runs again at the next', () => {
  const at = (/** @type {number} */ day, /** @type {number} */ hours, minutes = 0) => new Date(2026, 9, day, hours, minutes)
  const daily = { every: /** @type {const} */ ('day'), at: '08:00' }
  assert.deepEqual(dueTime(daily, at(3, 9)), at(3, 8))
  assert.deepEqual(dueTime(daily, at(3, 7)), at(2, 8))
  assert.deepEqual(dueTime(daily, at(3, 7), undefined, 1), at(3, 8), 'next')
  // Working days: Saturday 3 October 2026 goes back to Friday; where the weekend is Friday and Saturday, to Thursday.
  assert.deepEqual(dueTime({ every: 'weekday', at: '08:00' }, at(4, 9)), at(2, 8))
  assert.deepEqual(dueTime({ every: 'weekday', at: '08:00' }, at(3, 9), [5, 6]), at(1, 8))
  assert.deepEqual(dueTime({ every: 'week', on: 1, at: '09:00' }, at(3, 12)), new Date(2026, 8, 28, 9))
  // The 31st of a 30-day month is its last day.
  assert.deepEqual(dueTime({ every: 'month', on: 31, at: '08:00' }, new Date(2026, 10, 30, 9)), new Date(2026, 10, 30, 8))
  assert.deepEqual(dueTime({ every: 'month', on: 31, at: '08:00' }, new Date(2026, 10, 29, 9)), new Date(2026, 9, 31, 8))

  const routine = { ...daily, path: 'routines/x.md', title: 'Sales', request: 'Sum up the sales', author: 'jean', createdAt: at(1, 12).toISOString() }
  assert.deepEqual(due(routine, at(1, 13)), null, 'not before its first time')
  assert.deepEqual(due(routine, at(3, 9)), at(3, 8), 'two times missed: one run')
  assert.equal(due({ ...routine, lastRun: at(3, 9).toISOString() }, at(3, 20)), null)
  assert.deepEqual(due({ ...routine, lastRun: at(3, 9).toISOString() }, at(4, 8, 1)), at(4, 8))
})

test('routines are Markdown files named by ULID, the request in the body', async () => {
  const fs = memoryFS()
  const routine = newRoutine('projects/p', { title: 'Ventes: la semaine', request: 'Résume les ventes de la semaine.', by: 'jean', now: new Date('2026-10-03T10:00:00Z'), every: 'week', on: 0, at: '08:00' })
  assert.match(routine.path, /^projects\/p\/routines\/[0-9A-Z]{26}\.md$/)
  await writeRoutine(fs, routine)
  assert.equal(await fs.read(routine.path), '---\nformat: 1\ntitle: "Ventes: la semaine"\nevery: week\non: 0\nat: "08:00"\nauthor: jean\ncreatedAt: "2026-10-03T10:00:00.000Z"\n---\nRésume les ventes de la semaine.\n')
  await writeRoutine(fs, { ...routine, lastRun: '2026-10-04T08:00:00.000Z' })
  await fs.write('projects/p/routines/broken.md', '---\ntitle: x\nevery: hourly\nat: "08:00"\n---\nDo it')
  const [read, ...rest] = await listRoutines(fs, 'projects/p')
  assert.equal(rest.length, 0, 'what isn’t a routine is skipped')
  assert.deepEqual(read, { ...routine, lastRun: '2026-10-04T08:00:00.000Z' })
  assert.equal(parseRoutine('---\ntitle: x\nevery: day\nat: "08:00"\n---\n', 'r.md'), null, 'a routine needs a request')
})
