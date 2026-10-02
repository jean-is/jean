// 0.4 "Remember": projects, instructions, memory and routines as plain files, and the
// sections of the frozen prompt that change through system notes (D46).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS } from '../core/fs.js'
import { parseFrontMatter, stringifyFrontMatter, listProjects, createProject, ensureHome, slug } from '../core/settings.js'
import { parseMemory, stringifyMemory, memoryText } from '../core/memory.js'
import { parseSkill, listSkills, saveSkill, skillLines } from '../core/skills.js'
import { buildSystemPrompt, promptState, promptRecord, frozenPrompt, changeNotes } from '../core/prompt.js'
import { alike } from '../core/search.js'
import { importBackup, exportBackup } from '../caps/backup/archive.js'

test('front matter: one level of nesting, and strings that look like something else stay strings', () => {
  const text = stringifyFrontMatter({ name: 'weekly-report', description: 'true', count: '12', empty: '', metadata: { author: 'jean', format: '1' } }, '# Steps\n')
  assert.equal(text, '---\nname: weekly-report\ndescription: "true"\ncount: "12"\nempty: ""\nmetadata:\n  author: jean\n  format: "1"\n---\n# Steps\n')
  assert.deepEqual(parseFrontMatter(text).data, { name: 'weekly-report', description: 'true', count: '12', empty: '', metadata: { author: 'jean', format: '1' } })
})

test('projects: the home project, then others, each a folder named by a ULID', async () => {
  const fs = memoryFS()
  const home = await ensureHome(fs, { by: 'dev' })
  assert.equal(await ensureHome(fs, { by: 'dev' }), home, 'created once')
  // Folders sort by their ULID: by creation time (to the millisecond).
  const bakery = await createProject(fs, { name: 'Bakery · Margot', colour: 'oklch(0.74 0.17 145)', by: 'dev', now: new Date(Date.now() + 1000) })
  assert.match(bakery, /^projects\/[0-9A-HJKMNP-TV-Z]{26}-bakery-margot$/)
  const tokyo = await createProject(fs, { name: '東京', by: 'dev', now: new Date(Date.now() + 2000) })
  assert.match(tokyo, /^projects\/[0-9A-HJKMNP-TV-Z]{26}-project$/, 'a name with no Latin letters still makes a folder')
  const projects = await listProjects(fs)
  assert.deepEqual(projects.map((project) => project.data.name), ['Home', 'Bakery · Margot', '東京'])
  assert.equal(projects[0].data.default, true)
  assert.equal(projects[1].id, bakery.slice('projects/'.length, 'projects/'.length + 26))
  assert.equal(projects[1].data.colour, 'oklch(0.74 0.17 145)')
  assert.equal(projects[1].data.format, 1)
  assert.equal(slug('  Été à Paris! '), 'ete-a-paris')
})

test('a restored backup replaces the empty home a fresh device made', async () => {
  const old = memoryFS()
  const home = await ensureHome(old, { by: 'a' })
  await old.write(`${home}/conversations/x.jsonl`, '{}\n')
  const { bytes } = await exportBackup(old, { by: 'a' })
  const fresh = memoryFS()
  const empty = await ensureHome(fresh, { by: 'b' })
  await importBackup(fresh, bytes)
  assert.deepEqual((await listProjects(fresh)).map((project) => project.dir), [home])
  assert.equal(await fresh.exists(empty), false)
})

test('memory: one line per entry, with where it came from hidden in a comment', () => {
  const entries = [
    { text: 'Prefers short answers in French.', at: '2026-10-02T10:00:00.000Z', by: 'jean', conversation: 'projects/01H-home/conversations/01J.jsonl' },
    { text: 'Has two  cats --> Pixel and Mochi', at: '2026-10-02T11:00:00.000Z', by: 'dev' },
  ]
  const text = stringifyMemory(entries)
  assert.equal(text, '---\nformat: 1\nkind: memory\n---\n'
    + '- Prefers short answers in French. <!-- at=2026-10-02T10:00:00.000Z by=jean conversation=projects/01H-home/conversations/01J.jsonl -->\n'
    + '- Has two cats → Pixel and Mochi <!-- at=2026-10-02T11:00:00.000Z by=dev -->\n')
  assert.deepEqual(parseMemory(text), [entries[0], { ...entries[1], text: 'Has two cats → Pixel and Mochi' }])
  assert.deepEqual(parseMemory('- Edited by hand, no comment\nnot a line\n* Another'), [
    { text: 'Edited by hand, no comment', at: '', by: '' },
    { text: 'Another', at: '', by: '' },
  ])
  assert.deepEqual(parseMemory(null), [])
  assert.equal(stringifyMemory([]), '---\nformat: 1\nkind: memory\n---\n')
})

test('memory: the brain reads the newest lines that fit', () => {
  const entries = ['one', 'two', 'three'].map((text) => ({ text, at: '', by: '' }))
  assert.equal(memoryText(entries), '- one\n- two\n- three')
  assert.equal(memoryText(entries, 5), '- two\n- three')
  assert.equal(memoryText([]), '')
})

test('routines are SKILL.md folders: name and description up front, steps read when needed', async () => {
  const fs = memoryFS()
  const path = await saveSkill(fs, '', {
    name: 'weekly-sales', description: 'When the weekly sales CSV is shared: totals by region.',
    body: '# Rapport des ventes\n\n1. Read the file.\n2. Total by region.', by: 'jean', now: new Date('2026-10-02T10:00:00Z'),
  })
  assert.equal(path, 'skills/weekly-sales/SKILL.md')
  assert.equal(await fs.read(path), '---\nname: weekly-sales\ndescription: "When the weekly sales CSV is shared: totals by region."\n'
    + 'metadata:\n  format: "1"\n  author: jean\n  created: "2026-10-02T10:00:00.000Z"\n---\n# Rapport des ventes\n\n1. Read the file.\n2. Total by region.\n')
  const skill = parseSkill(/** @type {string} */ (await fs.read(path)), path)
  assert.equal(skill?.title, 'Rapport des ventes', 'the title is the first heading, in the user’s language')
  assert.equal(skill?.description, 'When the weekly sales CSV is shared: totals by region.')
  await assert.rejects(saveSkill(fs, '', { name: 'Not Valid', description: 'x', body: '', by: 'jean' }))

  // A project's routine with the same name replaces the global one; folders that don't match their name are skipped.
  await saveSkill(fs, 'projects/p', { name: 'weekly-sales', description: 'The bakery’s version.', body: 'Steps', by: 'jean' })
  await fs.write('skills/other/SKILL.md', '---\nname: mismatch\ndescription: d\n---\n')
  await fs.write('skills/broken/SKILL.md', 'no front matter')
  const skills = await listSkills(fs, ['', 'projects/p'])
  assert.deepEqual(skills.map((s) => [s.name, s.description, s.path]), [['weekly-sales', 'The bakery’s version.', 'projects/p/skills/weekly-sales/SKILL.md']])
  assert.equal(skills[0].title, 'weekly sales', 'without a heading, the name')
  assert.equal(skillLines(skills), '- weekly-sales: The bakery’s version.')
})

test('the prompt holds project, instructions, memory and routines, frozen; changes come as notes', () => {
  const sections = { project: 'Bakery', instructions: 'Use metric units.', memory: '- Opens at 7.' }
  const system = buildSystemPrompt({ assistantName: 'Jean', uiLanguage: 'English', sections })
  assert.match(system, /<project>\nBakery\n<\/project>\n\n<instructions>\nUse metric units\.\n<\/instructions>\n\n<memory>\n- Opens at 7\.\n<\/memory>/)
  assert.doesNotMatch(system, /<skills>/)

  const start = promptState({ language: 'English', tools: [], now: new Date(2026, 9, 2), sections })
  assert.deepEqual(Object.keys(start.sections ?? {}), ['project', 'instructions', 'memory'])
  const records = [promptRecord('dev', system, start)]
  assert.deepEqual(frozenPrompt(records)?.state, start)
  assert.deepEqual(changeNotes(start, start), [])

  const changed = { ...sections, memory: '- Opens at 7.\n- Closed on Mondays.', instructions: '', skills: '- weekly-sales: totals' }
  const now = promptState({ language: 'English', tools: [], now: new Date(2026, 9, 2), sections: changed })
  const notes = changeNotes(start, now, changed)
  assert.deepEqual(notes.map((note) => /** @type {any} */ (note.update).text), [
    'The <instructions> section is now empty.',
    'The <memory> section is now:\n- Opens at 7.\n- Closed on Mondays.',
    'The <skills> section is now:\n- weekly-sales: totals',
  ])
  const known = frozenPrompt([...records, ...notes])
  assert.equal(known?.system, system)
  assert.deepEqual(changeNotes(/** @type {any} */ (known).state, now, changed), [], 'each change is told once')

  // A conversation from before 0.4 learns about its sections once.
  const old = promptState({ language: 'English', tools: [], now: new Date(2026, 9, 2) })
  assert.equal(old.sections, undefined)
  assert.equal(changeNotes(old, now, changed).length, 3)
})

test('alike: the same kind of request scores high, in any language, whatever the common words', () => {
  const [same, other] = alike('Summarize the weekly sales by region', ['Summarize weekly sales by region please', 'What is the capital of France?'])
  assert.ok(same > 0.6, `same kind: ${same}`)
  assert.ok(other < 0.2, `another kind: ${other}`)
  const [ja] = alike('地域ごとの週間売上をまとめて', ['地域ごとの週間売上をまとめてください'])
  assert.ok(ja > 0.6, `Japanese: ${ja}`)
  assert.deepEqual(alike('anything', []), [])
  assert.deepEqual(alike('', ['x']), [0])
})
