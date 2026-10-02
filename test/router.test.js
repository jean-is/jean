import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conversationIn } from '../ui/router.js'

test('the address names a conversation only with a valid ULID', () => {
  assert.equal(conversationIn('#/c/01M3XN7APTVD76G6T68W6FRKC8'), '01M3XN7APTVD76G6T68W6FRKC8')
  assert.equal(conversationIn('#/c/01M3XN7APTVD76G6T68W6FRKC8/extra'), '01M3XN7APTVD76G6T68W6FRKC8')
  assert.equal(conversationIn('#/'), null)
  assert.equal(conversationIn(''), null)
  assert.equal(conversationIn('#/c/../../settings'), null)
  assert.equal(conversationIn('#/c/01m3xn7aptvd76g6t68w6frkc8'), null, 'ULIDs are upper case')
})

test('a project other than home is in the address too', async () => {
  const { placeIn, hashFor } = await import('../ui/router.js')
  const id = '01M3XN7APTVD76G6T68W6FRKC8'
  const project = '01M3XN7APTVD76G6T68W6FRKC9'
  assert.deepEqual(placeIn(`#/p/${project}/c/${id}`), { project, conversation: id })
  assert.deepEqual(placeIn(`#/p/${project}/`), { project, conversation: null })
  assert.deepEqual(placeIn(`#/c/${id}`), { project: null, conversation: id })
  assert.deepEqual(placeIn('#/p/nope/c/nope'), { project: null, conversation: null })
  const home = { dir: 'projects/x-home', id: 'X', data: { default: true }, body: '' }
  const bakery = { dir: `projects/${project}-bakery`, id: project, data: { name: 'Bakery' }, body: '' }
  assert.equal(hashFor(home, null), '#/')
  assert.equal(hashFor(home, id), `#/c/${id}`)
  assert.equal(hashFor(bakery, null), `#/p/${project}/`)
  assert.equal(hashFor(bakery, id), `#/p/${project}/c/${id}`)
})
