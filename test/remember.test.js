// 0.4 "Remember": projects, instructions, memory and skills as plain files, and the
// sections of the frozen prompt that change through system notes (D46).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS } from '../app/core/fs.js'
import { parseFrontMatter, stringifyFrontMatter, listProjects, createProject, ensureHome, slug } from '../app/core/settings.js'
import { parseMemory, stringifyMemory, memoryText } from '../app/core/memory.js'
import { parseSkill, listSkills, saveSkill, skillLines, skillNamed } from '../app/core/skills.js'
import { buildSystemPrompt, promptState, promptRecord, frozenPrompt, changeNotes } from '../app/core/prompt.js'
import { alike, restated } from '../app/core/search.js'
import { importBackup, exportBackup } from '../app/caps/backup/archive.js'
import { attendees, knows, speakerPrompt, request, minutes, report, pool } from '../app/caps/projects/meeting.js'
import { createConversation, appendRecords } from '../app/core/conversations.js'
import { userRecords, envelope, metaRecord } from '../app/core/events.js'

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

test('skills are SKILL.md folders: name and description up front, steps read when needed', async () => {
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

  // Saved again, changed by the user, it keeps who made it and when, and its example (D517).
  await saveSkill(fs, '', { .../** @type {NonNullable<typeof skill>} */ (skill), metadata: { ...skill?.metadata, example: 'Les ventes de la semaine' }, body: '# Rapport des ventes\n\n1. Read it.', by: 'device-1', now: new Date('2026-10-20T10:00:00Z') })
  assert.match(/** @type {string} */ (await fs.read(path)), /^metadata:\n {2}format: "1"\n {2}author: jean\n {2}created: "2026-10-02T10:00:00.000Z"\n {2}example: Les ventes de la semaine\n---\n# Rapport des ventes\n\n1\. Read it\.\n$/m)

  // A project's skill with the same name replaces the global one; folders that don't match their name are skipped.
  await saveSkill(fs, 'projects/p', { name: 'weekly-sales', description: 'The bakery’s version.', body: 'Steps', by: 'jean' })
  await fs.write('skills/other/SKILL.md', '---\nname: mismatch\ndescription: d\n---\n')
  await fs.write('skills/broken/SKILL.md', 'no front matter')
  const skills = await listSkills(fs, ['', 'projects/p'])
  assert.deepEqual(skills.map((s) => [s.name, s.description, s.path]), [['weekly-sales', 'The bakery’s version.', 'projects/p/skills/weekly-sales/SKILL.md']])
  assert.equal(skills[0].title, 'weekly sales', 'without a heading, the name')
  assert.equal(skillLines(skills), '- weekly-sales: The bakery’s version.')
})

test('a skill named with underscores is read by its name, a file beside it as it is (D406)', () => {
  assert.equal(skillNamed(' process_improvement '), 'process-improvement')
  assert.equal(skillNamed('music_score/reference_notes.md'), 'music-score/reference_notes.md')
  assert.equal(skillNamed('music-score'), 'music-score')
})

test('the prompt holds project, instructions, memory and skills, frozen; changes come as notes', () => {
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

test('restated: something said again in another request, in any script, but not a request of the same kind or a common phrasing (D286)', () => {
  const earlier = [
    "I'm vegetarian and allergic to nuts, so keep that in mind whenever you suggest recipes. What could I cook tonight?",
    'Can you help me write an email to my boss about the budget?',
    'Hello! Can you help me with something?',
    'Please translate this into Spanish for me: see you next week.',
    'Je suis végétarienne et allergique aux noix. Que puis-je cuisiner ce soir ?',
    '私はベジタリアンでナッツアレルギーがあります。今夜は何を作ればいいですか？',
    '我吃素，而且对坚果过敏。我今晚可以做点什么？',
    'أنا نباتية وعندي حساسية من المكسرات، فتذكّر ذلك كلما اقترحت عليّ وصفات. ماذا يمكنني أن أطبخ الليلة؟',
  ]
  assert.ok(restated("As I said, I'm vegetarian and allergic to nuts. Plan a dinner party menu for six.", earlier, 0.5))
  assert.ok(restated("Remember I'm allergic to nuts and vegetarian. Suggest a dessert.", earlier, 0.5))
  assert.ok(restated('Comme je disais, je suis végétarienne et allergique aux noix. Propose un menu pour six.', earlier, 0.5))
  assert.ok(restated('前にも言いましたが、私はベジタリアンでナッツアレルギーがあります。六人分の献立を考えてください。', earlier, 0.5))
  assert.ok(restated('我说过，我吃素，而且对坚果过敏。帮我设计六个人的菜单。', earlier, 0.5))
  assert.ok(restated('كما قلت، أنا نباتية وعندي حساسية من المكسرات. اقترح قائمة طعام لستة أشخاص.', earlier, 0.5))
  // Common phrasings, other requests, and the same request again (Skills' business, D83) aren't.
  assert.ok(!restated('Hello! Can you help me with my homework?', earlier, 0.5))
  assert.ok(!restated('Can you help me write an email to my landlord about the heating?', earlier, 0.5))
  assert.ok(!restated('Please translate this into French for me: thank you so much.', earlier, 0.5))
  assert.ok(!restated('Write a short poem about autumn leaves.', earlier, 0.5))
  assert.ok(!restated("I'm vegetarian and allergic to nuts, so keep that in mind whenever you suggest recipes. What could I cook tomorrow?", earlier, 0.5))
  assert.ok(!restated("I'm vegetarian and allergic to nuts.", [], 0.5))
})

test('meetings (D224): who joins, what each speaker knows of its own project only, and the minutes', async () => {
  const fs = memoryFS()
  const home = await ensureHome(fs, { by: 'dev' })
  const made = []
  for (const [i, name] of ['Bakery', 'Garden', 'Health', 'Clients', 'Club', 'Choir', 'Shop'].entries()) made.push(await createProject(fs, { name, by: 'dev', now: new Date(Date.now() + 1000 * (i + 1)) }))
  const [bakery, garden, health] = made
  await fs.write(`${health}/project.md`, stringifyFrontMatter({ ...parseFrontMatter((await fs.read(`${health}/project.md`)) ?? '').data, cloud: false }, ''))
  const projects = await listProjects(fs)
  const cloud = { id: 'cloud', provider: 'openrouter', api: 'openai', baseURL: 'https://openrouter.ai/api/v1', model: 'm' }
  const device = { id: 'device', provider: 'device', api: 'device', baseURL: '', model: 'gemma' }
  const names = (/** @type {{ joins: any[] }} */ { joins }) => joins.map((project) => project.data.name)

  // From the bakery, every other project, the home one too; a project kept on this device hears no cloud brain; five at most.
  const all = attendees(projects, { here: bakery, brain: /** @type {any} */ (cloud) })
  assert.deepEqual(names(all), ['Home', 'Garden', 'Clients', 'Club', 'Choir'])
  assert.deepEqual(all.out, [{ name: 'Health', why: 'kept on this device' }, { name: 'Shop', why: '5 speak at most' }])
  assert.deepEqual(names(attendees(projects, { here: home, names: ['health', 'gard'], brain: /** @type {any} */ (device) })), ['Garden', 'Health'], 'named, by a part of the name, any case')
  // A brain kept to some projects is heard only there (D194).
  const kept = attendees(projects, { here: home, names: ['Garden', 'Bakery'], brain: /** @type {any} */ ({ ...cloud, projects: [projects[1].id] }) })
  assert.deepEqual(names(kept), ['Bakery'])
  assert.deepEqual(kept.out, [{ name: 'Garden', why: 'this brain is not used there' }])
  assert.throws(() => attendees(projects, { here: home, names: ['Bakry'], brain: null }), /No project is called bakry\. The projects are: Jean, Bakery, Garden/)

  // What the bakery's assistant knows: its instructions, memory and latest task, never the garden's.
  await fs.write(`${bakery}/instructions.md`, 'Prices in euros.\n')
  await fs.write(`${bakery}/memory.md`, stringifyMemory([{ text: 'Opens at 7', at: '2026-10-01T09:00:00.000Z', by: 'jean' }]))
  await fs.write(`${garden}/memory.md`, stringifyMemory([{ text: 'Roses in March', at: '2026-10-01T09:00:00.000Z', by: 'jean' }]))
  const task = await createConversation(fs, { projectDir: bakery, by: 'dev' })
  await appendRecords(fs, task.path, [...userRecords('Order flour', [], 'dev'), envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Ordered 40 kg of flour for Friday.' } }, 0), metaRecord('dev', { title: 'Flour order' })])
  const known = await knows(fs, /** @type {any} */ (projects.find((project) => project.dir === bakery)))
  assert.equal(known.instructions, 'Prices in euros.')
  assert.equal(known.memory, '- Opens at 7')
  assert.match(known.tasks, /^- Flour order, \d{4}-\d\d-\d\d: Ordered 40 kg of flour for Friday\.$/)
  const system = speakerPrompt({ speaker: 'Margot', project: 'Bakery', chair: 'Jean', body: 'Warm and brief.\n', ...known })
  assert.match(system, /^You are Margot, the assistant of the project "Bakery", in a meeting Jean holds/)
  assert.match(system, /<how-to-be>\nWarm and brief\.\n<\/how-to-be>\n\n<instructions>\nPrices in euros\.\n<\/instructions>\n\n<memory>\n- Opens at 7\n<\/memory>\n\n<tasks>\n- Flour order/)
  assert.doesNotMatch(system, /Roses/)

  // Each round hears the ones before; the chair gets the minutes, who was left out, and what to tell the user.
  const rounds = [[{ speaker: 'Bakery', said: 'We need flour by Friday.' }, { speaker: 'Garden', said: 'Nothing from me.' }]]
  assert.equal(request('Saturday'), 'The topic: Saturday\n\nWhat do you say for your project?')
  assert.equal(request('Saturday', minutes(rounds)), 'The topic: Saturday\n\nWhat was said so far:\n\nRound 1:\nBakery: We need flour by Friday.\nGarden: Nothing from me.\n\nWhat do you say for your project?')
  assert.equal(report('Saturday', rounds, [{ name: 'Health', why: 'kept on this device' }]).split('\n\n').at(-2), 'Left out: Health (kept on this device).')
  // Speakers take turns three at a time, in their order, and one that fails says so.
  let busy = 0
  let most = 0
  const said = await pool(Array.from({ length: 5 }, (_, i) => async () => {
    most = Math.max(most, ++busy)
    await new Promise((resolve) => setTimeout(resolve, 5))
    busy--
    if (i === 3) throw new Error('rate limited')
    return `speaker ${i}`
  }))
  assert.equal(most, 3)
  assert.deepEqual(said, ['speaker 0', 'speaker 1', 'speaker 2', '(Could not speak: rate limited)', 'speaker 4'])
})
