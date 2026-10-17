// Profiles (D228): each is a whole Jean in profiles/<ulid>-<slug>/, behind a view of the FS rooted
// there, so no other module knows of profiles and nothing crosses between them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS, rootedFS, walk } from '../app/core/fs.js'
import { profileOf } from '../app/core/settings.js'

const A = 'profiles/01JA0000000000000000000000-profile'
const B = 'profiles/01JB0000000000000000000000-lea'

test('a rooted view reads, writes and lists its folder as the root', async () => {
  const whole = memoryFS({ [`${A}/settings.json`]: '{"locale":"fr"}', 'outside.txt': 'no' })
  const fs = rootedFS(whole, A)
  assert.equal(await fs.read('settings.json'), '{"locale":"fr"}')
  await fs.write('projects/01J-home/project.md', 'home')
  await fs.append('memory.md', '- one\n')
  await fs.writeBytes('files/a.bin', new Uint8Array([1, 2]))
  assert.equal(await whole.read(`${A}/projects/01J-home/project.md`), 'home')
  assert.deepEqual(await fs.readBytes('files/a.bin'), new Uint8Array([1, 2]))
  assert.deepEqual((await fs.list('')).map((entry) => entry.name), ['files', 'memory.md', 'projects', 'settings.json'])
  assert.deepEqual(await fs.list('projects'), [{ name: '01J-home', kind: 'directory' }])
  assert.equal(await fs.exists('outside.txt'), false)
  assert.equal((await fs.stat?.('memory.md'))?.size, 6)
  await fs.remove('files')
  assert.equal(await whole.exists(`${A}/files/a.bin`), false)
  assert.equal(await whole.read('outside.txt'), 'no')
})

test('nothing above its folder is reached, and the root is no file', async () => {
  const fs = rootedFS(memoryFS({ 'secret.txt': 'x' }), A)
  for (const path of ['../secret.txt', '/secret.txt', 'a/../../secret.txt', '']) {
    await assert.rejects(async () => fs.read(path), TypeError, JSON.stringify(path))
  }
  await assert.rejects(async () => fs.write('..', 'x'), TypeError)
  await assert.rejects(async () => fs.list('..'), TypeError)
})

test('two profiles on one FS never see each other’s files', async () => {
  const whole = memoryFS()
  const [a, b] = [rootedFS(whole, A), rootedFS(whole, B)]
  await a.write('memory.md', '- likes tea\n')
  await b.write('memory.md', '- likes football\n')
  assert.equal(await a.read('memory.md'), '- likes tea\n')
  assert.equal(await b.read('memory.md'), '- likes football\n')
  assert.deepEqual(await walk(b), ['memory.md'])
  assert.deepEqual((await whole.list('profiles')).map((entry) => entry.name), [A.slice(9), B.slice(9)])
})

test('a rooted view hears of changes in its folder only, by its own paths', async () => {
  /** @type {(path: string) => void} */
  let tell = () => {}
  const whole = { ...memoryFS(), watch: (/** @type {(path: string) => void} */ cb) => { tell = cb; return () => {} } }
  /** @type {string[]} */
  const heard = []
  rootedFS(whole, A).watch?.((path) => heard.push(path))
  tell(`${A}/projects/x/project.md`)
  tell(`${B}/settings.json`)
  tell(`${A}-other/settings.json`)
  tell('family/01JA/notice.json')
  assert.deepEqual(heard, ['projects/x/project.md'])
})

test('an address finds its profile by its project’s or its task’s ULID', async () => {
  const whole = memoryFS({
    [`${A}/projects/01JA1111111111111111111111-home/conversations/01JA2222222222222222222222.jsonl`]: '',
    [`${B}/projects/01JB1111111111111111111111-home/conversations/01JB2222222222222222222222.jsonl`]: '',
    [`${B}/projects/01JB3333333333333333333333-maths/project.md`]: '---\nname: Maths\n---\n',
  })
  const dirs = [A, B]
  assert.equal(await profileOf(whole, dirs, '01JB3333333333333333333333'), B)
  assert.equal(await profileOf(whole, dirs, '01JB2222222222222222222222'), B)
  assert.equal(await profileOf(whole, dirs, '01JA2222222222222222222222'), A)
  assert.equal(await profileOf(whole, dirs, '01JC0000000000000000000000'), null)
})

test('what a child’s profile tells its parent’s opens with the parent’s key alone, and holds no words', async () => {
  const { pair, sealFor, openFrom, inbox } = await import('../app/caps/profiles/family.js')
  const [parent, other] = [await pair(), await pair()]
  const sealed = await sealFor(parent.public, { kind: 'bullying', at: '2026-10-17T16:20:00.000Z' })
  assert.ok(!sealed.includes('bullying'))
  assert.deepEqual(await openFrom(parent.key, sealed), { kind: 'bullying', at: '2026-10-17T16:20:00.000Z' })
  await assert.rejects(openFrom(other.key, sealed))
  assert.equal(inbox(A), 'family/01JA0000000000000000000000')
})

test('a parent’s first choices follow the child’s age, from the school year they turn 13 (4e)', async () => {
  const { age, tierFor, asPolicy, helpline, TOPICS } = await import('../app/caps/profiles/tier.js')
  assert.equal(age(2013, new Date('2026-10-17')), 13)
  assert.equal(age(2013, new Date('2027-06-30')), 13)
  assert.equal(age(2013, new Date('2026-08-31')), 12)
  const young = tierFor(new Date().getFullYear() - 9)
  assert.deepEqual(young.searches, ['vikidia'])
  assert.equal(young.topics.violence, 'later')
  assert.ok(young.capabilities.deny.includes('connections'))
  const teen = tierFor(new Date().getFullYear() - 16)
  assert.ok(Object.values(teen.topics).every((choice) => choice !== 'later'))
  assert.deepEqual(teen.searches, ['vikidia', 'wikipedia'])
  assert.deepEqual(Object.keys(young.topics), Object.keys(TOPICS))

  const policy = asPolicy({ ...young, rules: { fetch: 'ask' }, brains: [] }, { rules: { execute: 'never' }, capabilities: { deny: ['sync'] }, instructions: 'Be brief.' }, helpline(['fr-FR']))
  assert.equal(policy.child, true)
  assert.deepEqual(policy.rules, { fetch: 'ask', execute: 'never' })
  assert.deepEqual(policy.capabilities.deny, [...young.capabilities.deny, 'sync'])
  assert.deepEqual(policy.brains, [])
  assert.equal(policy.pictureCheck.suggestive, true)
  assert.match(policy.instructions, /the child helpline, 119/)
  assert.match(policy.instructions, /For these, say why they are for later, without details: violence and crime in detail; frightening content; weapons\./)
  assert.match(policy.instructions, /Be brief\.$/)
  assert.equal(helpline(['ja']), 'the child helpline, 0120-0-78310')
  const { learning } = await import('../app/caps/profiles/tier.js')
  assert.equal(learning('# Learn it\n\n1. Start from what they sent.\n'), 'For this message, follow the steps of the skill learn-it:\n\n# Learn it\n\n1. Start from what they sent.')
  assert.equal(helpline(['xx']), 'their country’s child helpline')
})

test('a child’s profile has the brains a parent left it, even none, and the child can’t add one', async () => {
  const { applyPolicy, DEFAULT_SETTINGS } = await import('../app/core/settings.js')
  const brain = /** @type {import('../app/core/types.js').BrainConfig} */ ({ id: 'b', provider: 'openrouter', api: 'openai', baseURL: 'https://example.org/v1', model: 'm' })
  const none = applyPolicy({ ...DEFAULT_SETTINGS, brains: [brain], activeBrain: 'b' }, { brains: [] })
  assert.deepEqual(none.settings.brains, [])
  assert.equal(none.settings.activeBrain, null)
  assert.ok(none.locked.has('brains'))
  assert.ok(!applyPolicy({ ...DEFAULT_SETTINGS, brains: [brain] }, {}).locked.has('brains'))
})

test('Intuition’s danger reads as its kind, or as at home, which the parent isn’t told, but self-harm', async () => {
  const { dangerOf, YES } = await import('../app/caps/reflexes/questions.js')
  /** @param {string} choice @param {number} p @param {number} home */
  const read = (choice, p, home) => dangerOf({ danger: { type: 'choice', choice, probabilities: { [choice]: p } }, home: { type: 'noul', noul: home } })
  assert.equal(read('bullying', 0.9, 0.1), 'bullying')
  assert.equal(read('abuse', 0.9, 0.9), 'home')
  assert.equal(read('secrecy', 0.8, 0.7), 'home')
  assert.equal(read('harm', 0.9, 0.9), 'harm')
  assert.equal(read('abuse', YES - 0.01, 0), undefined)
  assert.equal(read('none', 0.99, 0), undefined)
  assert.equal(dangerOf({}), undefined)
})
