// Policy by group (D429, ee/): policy's `groups` lists sections for the directory's groups and app roles, by the value the
// sign-in's ID token gives each; for each the person is in, in policy's order, its `policy` goes over the organisation's
// as a JSON Merge Patch (RFC 7386). What signs in, the key and the sections themselves are no group's.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { patch, check, theirs, forPerson } from '../app/ee/sections.js'

const ENGINEERING = '5a8e2c41-0b7d-4c1e-9f3a-6d2b8e4f1a07'
const POLICY = {
  signIn: { issuer: 'https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0', clientId: '4f1c0000-0000-0000-0000-000000000000', scopes: ['api://ai-gateway/chat'] },
  brains: [{ id: 'corp', provider: 'custom', api: 'openai', baseURL: 'https://ai.acme.example/v1', model: 'gpt-5', label: 'Acme AI', auth: 'oidc' }],
  capabilities: { deny: ['computer', 'connections'], preUnlock: ['files'] },
  rules: { fetch: 'ask', share: 'never' },
  groups: [
    // A security group, by its object id; an app role, by its value; a group by its name, as Okta and Keycloak give them.
    { id: ENGINEERING, name: 'Engineering', policy: { capabilities: { deny: ['connections'] } } },
    { id: 'Jean.Legal', name: 'Legal', policy: { brains: [{ id: 'legal', provider: 'custom', api: 'openai', baseURL: 'https://ai.acme.example/legal/v1', model: 'gpt-5', label: 'Acme AI for Legal', auth: 'oidc' }], rules: { share: null } } },
    { id: 'interns', policy: { capabilities: { deny: ['computer', 'connections', 'browser'] }, instructions: 'Ask your mentor before sending anything.' } },
  ],
}

test('a section goes over policy as RFC 7386 has it: objects merge, anything else takes the place of what was, null takes it away', () => {
  // RFC 7386, Appendix A.
  const cases = [
    [{ a: 'b' }, { a: 'c' }, { a: 'c' }],
    [{ a: 'b' }, { b: 'c' }, { a: 'b', b: 'c' }],
    [{ a: 'b' }, { a: null }, {}],
    [{ a: 'b', b: 'c' }, { a: null }, { b: 'c' }],
    [{ a: ['b'] }, { a: 'c' }, { a: 'c' }],
    [{ a: 'c' }, { a: ['b'] }, { a: ['b'] }],
    [{ a: { b: 'c' } }, { a: { b: 'd', c: null } }, { a: { b: 'd' } }],
    [{ a: [{ b: 'c' }] }, { a: [1] }, { a: [1] }],
    [['a', 'b'], ['c', 'd'], ['c', 'd']],
    [{ a: 'b' }, ['c'], ['c']],
    [{ a: 'foo' }, null, null],
    [{ a: 'foo' }, 'bar', 'bar'],
    [{ e: null }, { a: 1 }, { e: null, a: 1 }],
    [[1, 2], { a: 'b', c: null }, { a: 'b' }],
    [{}, { a: { bb: { ccc: null } } }, { a: { bb: {} } }],
  ]
  for (const [target, given, result] of cases) assert.deepEqual(patch(target, given), result, JSON.stringify([target, given]))
  const target = { rules: { send: 'ask' } }
  patch(target, { rules: { send: 'never' } })
  assert.deepEqual(target, { rules: { send: 'ask' } }, 'what it goes over stays as it was')
})

test('someone in no group of policy’s gets policy as it is; in one, its section over it, the rest kept', () => {
  assert.equal(forPerson(POLICY, []), POLICY)
  assert.equal(forPerson(POLICY, ['b2f0d9a4-7e1c-4a55-8c3d-1f6e9a2b7c40', 'Jean.Reader']), POLICY, 'groups policy names no section for change nothing')
  const engineer = forPerson(POLICY, [ENGINEERING])
  assert.deepEqual(engineer.capabilities, { deny: ['connections'], preUnlock: ['files'] }, 'the Computer allowed, what is unlocked kept')
  assert.deepEqual(engineer.rules, POLICY.rules)
  assert.equal(engineer.brains, POLICY.brains)
  assert.equal(engineer.signIn, POLICY.signIn)
  assert.equal(engineer.groups, POLICY.groups, 'the sections stay, for ee/ to check again')
  // An app role: its own brain, and sharing no longer locked, fetching still asked.
  const lawyer = forPerson(POLICY, ['Jean.Legal'])
  assert.deepEqual(lawyer.brains.map((/** @type {{ id: string }} */ brain) => brain.id), ['legal'])
  assert.deepEqual(lawyer.rules, { fetch: 'ask' })
  assert.deepEqual(POLICY.rules, { fetch: 'ask', share: 'never' }, 'the organisation’s policy stays as it was')
})

test('in several groups, each section goes in policy’s order, not the sign-in’s, the last one listed winning', () => {
  const intern = forPerson(POLICY, ['interns', ENGINEERING])
  assert.deepEqual(intern.capabilities.deny, ['computer', 'connections', 'browser'])
  assert.equal(intern.instructions, 'Ask your mentor before sending anything.')
  assert.deepEqual(forPerson(POLICY, ['Jean.Legal', ENGINEERING]).rules, { fetch: 'ask' })
  assert.deepEqual(theirs(POLICY, ['interns', 'Jean.Legal', 'nobody']).map((section) => section.id), ['Jean.Legal', 'interns'])
})

test('a sign-in with more groups than its token holds can’t say whose sections apply, so it stops Jean, saying how to fix it', () => {
  assert.throws(() => forPerson(POLICY, null), (/** @type {Error} */ error) => error.cause === 'many' && /Groups assigned to the application/.test(error.message))
})

test('sections Jean can’t read, or holding what no group’s can, stop Jean, saying why', () => {
  const wrong = (/** @type {unknown} */ groups, /** @type {RegExp} */ said, base = { signIn: POLICY.signIn }) => assert.throws(() => check({ ...base, groups }), said)
  wrong({ legal: {} }, /groups is a list/)
  wrong([{ policy: {} }], /groups\[0\] needs an id/)
  wrong([{ id: 'interns' }], /groups\[0\] needs an id.*and a policy/)
  wrong([{ id: 'interns', policy: [] }], /groups\[0\] needs an id.*and a policy/)
  wrong([{ id: 7, policy: {} }], /groups\[0\] needs an id/)
  wrong([{ id: 'interns', name: 7, policy: {} }], /groups\[0\]\.name is text/)
  for (const own of ['signIn', 'key', 'groups']) wrong([{ id: 'interns', policy: {} }, { id: 'it', policy: { [own]: {} } }], new RegExp(`groups\\[1\\]\\.policy holds ${own}`))
  // The organisation's sign-in is what says which groups the person is in.
  wrong(POLICY.groups, /groups need signIn/, {})
  assert.equal(check(POLICY), POLICY.groups)
})
