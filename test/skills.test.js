// Skills from elsewhere (D116, D120): discovery indexes read, checked and cached; a skill added
// only as its publisher listed it; skills matched with the user's requests on the device.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS } from '../core/fs.js'
import { parseFrontMatter } from '../core/settings.js'
import { parseSkill, saveSkill, skillLines } from '../core/skills.js'
import { indexURL, places, parseIndex, fetchSkill, refreshIndexes, cachedIndexes, offered, readyMade, searchSkills } from '../caps/skills/sources.js'

const SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'
const INDEX = 'https://example.com/.well-known/agent-skills/index.json'
const SKILL = '---\nname: weekly-sales\ndescription: Summarize the weekly sales by region.\nlicense: MIT\n---\n# Weekly sales\n\n1. Total by region.\n'
const ANY_DIGEST = `sha256:${'a'.repeat(64)}`

/** @param {string} text */
const sha256 = async (text) => `sha256:${Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('hex')}`

/** @param {string} name @param {string} description @param {string} [type] */
const entry = (name, description, type = 'skill-md') => ({ name, description, type, url: `https://example.com/${name}/SKILL.md`, digest: ANY_DIGEST, index: INDEX })

test('a skill’s front matter as publishers write it: single quotes, folded and literal blocks', () => {
  const quoted = parseSkill("---\r\nname: llms-visibility\r\ndescription: 'Make sites readable to LLMs. Don''t use for SEO.'\r\nlicense: MIT\r\n---\r\n# Visible to LLMs\r\n", 'a')
  assert.deepEqual([quoted?.description, quoted?.license, quoted?.title], ['Make sites readable to LLMs. Don\'t use for SEO.', 'MIT', 'Visible to LLMs'])
  const folded = parseSkill('---\nname: inertia-types\ndescription: >-\n  TypeScript types for Inertia: shared props,\n  flash: and errors.\n\n'
    + "license: 'CC BY 4.0'\nmetadata:\n  author: 'vercel'\n  hint: |\n    one\n    two\n---\n# Body\n", 'b')
  assert.deepEqual([folded?.description, folded?.license, folded?.body], ['TypeScript types for Inertia: shared props, flash: and errors.', 'CC BY 4.0', '# Body'])
  const literal = parseSkill('---\nname: notes\ndescription: |\n  Meeting notes.\n  Decisions first.\n---\n', 'c')
  assert.equal(literal?.description, 'Meeting notes. Decisions first.', 'one line in the prompt')
  assert.deepEqual(parseFrontMatter("---\nkind: 'as written'\n---\n").data, { kind: "'as written'" }, 'Jean’s own files keep the minimal reader')
})

test('an address is a site or an index: https, or http on this computer', () => {
  assert.equal(indexURL('example.com'), INDEX)
  assert.equal(indexURL(' https://example.com/ '), INDEX)
  assert.equal(indexURL('https://example.com/team/skills.json'), 'https://example.com/team/skills.json')
  assert.equal(indexURL('http://127.0.0.1:4183'), 'http://127.0.0.1:4183/.well-known/agent-skills/index.json')
  assert.equal(indexURL('http://example.com'), null, 'not over plain http elsewhere')
  assert.equal(indexURL('ftp://example.com'), null)
  assert.equal(indexURL('not an address'), null)
  assert.equal(indexURL(''), null)
  assert.deepEqual(places({ skillIndexes: [INDEX, 'ftp://nope'] }, { skillIndexes: ['corp.example', 'example.com'] }),
    ['https://corp.example/.well-known/agent-skills/index.json', INDEX], 'the organisation’s first, each once')
})

test('an index lists skills with a digest; entries Jean can’t check or doesn’t know are left out', () => {
  const { entries } = parseIndex({ $schema: SCHEMA, skills: [
    { name: 'weekly-sales', type: 'skill-md', description: ' Summarize the weekly sales. ', url: 'weekly-sales/SKILL.md', digest: ANY_DIGEST, extra: true },
    { name: 'deploy', type: 'archive', description: 'Deploy.', url: '/deploy.tar.gz', digest: ANY_DIGEST },
    { name: 'Not Valid', type: 'skill-md', description: 'x', url: 'a', digest: ANY_DIGEST },
    { name: 'no-digest', type: 'skill-md', description: 'x', url: 'a' },
    { name: 'bad-digest', type: 'skill-md', description: 'x', url: 'a', digest: 'sha256:XYZ' },
    { name: 'no-description', type: 'skill-md', url: 'a', digest: ANY_DIGEST },
    { name: 'future', type: 'plugin', description: 'x', url: 'a', digest: ANY_DIGEST },
    { name: 'script', type: 'skill-md', description: 'x', url: 'javascript:alert(1)', digest: ANY_DIGEST },
  ] }, INDEX)
  assert.deepEqual(entries.map((e) => [e.name, e.type, e.url]), [
    ['weekly-sales', 'skill-md', 'https://example.com/.well-known/agent-skills/weekly-sales/SKILL.md'],
    ['deploy', 'archive', 'https://example.com/deploy.tar.gz'],
  ])
  assert.equal(entries[0].description, 'Summarize the weekly sales.')
  assert.equal(entries[0].index, INDEX)
  assert.throws(() => parseIndex({ $schema: 'https://schemas.agentskills.io/discovery/0.3.0/schema.json', skills: [] }, INDEX), /format/)
  assert.throws(() => parseIndex({ skills: [{ name: 'a', files: ['SKILL.md'] }] }, INDEX), /format/, 'v0.1 has no digests to check')
  assert.throws(() => parseIndex([], INDEX), /format/)
})

test('a skill is added only as its publisher listed it', async () => {
  const listed = { ...entry('weekly-sales', 'Summarize.'), digest: await sha256(SKILL) }
  const serve = (/** @type {string} */ body, status = 200) => /** @type {typeof fetch} */ (async () => new Response(body, { status }))
  const skill = await fetchSkill(listed, serve(SKILL))
  assert.deepEqual({ ...skill, body: skill.body.slice(0, 14) }, {
    name: 'weekly-sales', description: 'Summarize the weekly sales by region.', title: 'Weekly sales', body: '# Weekly sales',
    path: listed.url, license: 'MIT', source: listed.url, digest: listed.digest,
  })
  await assert.rejects(fetchSkill(listed, serve(SKILL.replace('region', 'country'))), { code: 'changed' })
  await assert.rejects(fetchSkill(listed, serve('', 404)), { code: 'unreadable' })
  await assert.rejects(fetchSkill({ ...listed, digest: await sha256('no front matter') }, serve('no front matter')), { code: 'unreadable' })
  await assert.rejects(fetchSkill({ ...listed, type: 'archive' }, serve(SKILL)), { code: 'unsupported' })
})

test('a skill from elsewhere keeps where it came from; each description in the prompt is capped', async () => {
  const fs = memoryFS()
  const path = await saveSkill(fs, '', {
    name: 'weekly-sales', description: 'Summarize.', body: '# Weekly sales', by: 'dev', now: new Date('2026-10-03T10:00:00Z'),
    license: 'MIT', source: 'https://example.com/w/SKILL.md', digest: ANY_DIGEST,
  })
  assert.equal(await fs.read(path), '---\nname: weekly-sales\ndescription: Summarize.\nlicense: MIT\nmetadata:\n  format: "1"\n  author: dev\n'
    + `  created: "2026-10-03T10:00:00.000Z"\n  source: "https://example.com/w/SKILL.md"\n  digest: "${ANY_DIGEST}"\n---\n# Weekly sales\n`)
  const skill = parseSkill(/** @type {string} */ (await fs.read(path)), path)
  assert.deepEqual([skill?.license, skill?.source, skill?.digest], ['MIT', 'https://example.com/w/SKILL.md', ANY_DIGEST])

  const long = 'Use it when the user asks for it. '.repeat(20).trim()
  const [line] = skillLines([{ name: 'long', description: long, title: 'Long', body: '', path: '' }]).split('\n')
  assert.equal([...line].length, '- long: '.length + 300)
  assert.ok(line.endsWith('…'))
})

test('indexes are cached in .cache/ and read again after a day, or when asked', async () => {
  const fs = memoryFS()
  const broken = 'https://broken.example/.well-known/agent-skills/index.json'
  let calls = 0
  const fetcher = /** @type {typeof fetch} */ (async (url) => {
    calls++
    return String(url) === INDEX
      ? Response.json({ $schema: SCHEMA, skills: [{ name: 'weekly-sales', type: 'skill-md', description: 'Summarize the weekly sales.', url: 'w/SKILL.md', digest: ANY_DIGEST }] })
      : new Response('', { status: 500 })
  })
  const now = new Date('2026-10-03T10:00:00Z')
  const first = await refreshIndexes(fs, [INDEX, broken], { fetcher, now })
  assert.deepEqual(first[INDEX].entries?.map((e) => e.url), ['https://example.com/.well-known/agent-skills/w/SKILL.md'])
  assert.equal(first[broken].error, 'failed')
  assert.equal(calls, 2)
  assert.deepEqual(await cachedIndexes(fs), first, 'kept in .cache/, rebuilt from the sources whenever needed')
  await refreshIndexes(fs, [INDEX], { fetcher, now: new Date('2026-10-03T20:00:00Z') })
  assert.equal(calls, 2, 'fresh enough')
  await refreshIndexes(fs, [INDEX], { fetcher, now: new Date('2026-10-04T11:00:00Z') })
  assert.equal(calls, 3, 'a day later')
  await refreshIndexes(fs, [INDEX], { fetcher, now, force: true })
  assert.equal(calls, 4, 'when asked')
  assert.deepEqual(Object.keys(await cachedIndexes(fs)), [INDEX, broken], 'one refreshed keeps the others')
})

test('skills are found on the device: by a request like the one that keeps coming back, or by a search', () => {
  const indexes = {
    [INDEX]: { at: '', entries: [entry('weekly-sales-summary', 'Summarize the weekly sales by region from a spreadsheet.'),
      entry('invoice-chase', 'Write polite reminders for unpaid invoices, firmer as they age.'), entry('deploy', 'Deploy a site.', 'archive')] },
    'https://old.example/i.json': { at: '', entries: [entry('old', 'Summarize the weekly sales.')] },
  }
  const { usable, other } = offered(indexes, [INDEX])
  assert.deepEqual(usable.map((e) => e.name), ['weekly-sales-summary', 'invoice-chase'], 'only from the places listed now')
  assert.equal(other, 1, 'an archive needs more than Jean has')
  assert.deepEqual(readyMade('Summarize the weekly sales by region', usable, []).map((e) => e.name), ['weekly-sales-summary'])
  assert.deepEqual(readyMade('Write a reminder for the unpaid invoice from ACME', usable, []).map((e) => e.name), ['invoice-chase'])
  assert.deepEqual(readyMade('Summarize the weekly sales by region', usable, ['weekly-sales-summary']), [], 'not one already added')
  assert.deepEqual(readyMade('What is the capital of France?', usable, []), [])
  assert.deepEqual(searchSkills('invoices', usable).map((e) => e.name), ['invoice-chase'])
  assert.deepEqual(searchSkills('  ', usable).map((e) => e.name), ['weekly-sales-summary', 'invoice-chase'], 'no search: all of them')
})
