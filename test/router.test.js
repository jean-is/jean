import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeIn } from '../ui/router.js'

test('the address names a conversation only with a valid ULID', () => {
  assert.equal(placeIn('#/c/01M3XN7APTVD76G6T68W6FRKC8').conversation, '01M3XN7APTVD76G6T68W6FRKC8')
  assert.equal(placeIn('#/c/01M3XN7APTVD76G6T68W6FRKC8/extra').conversation, '01M3XN7APTVD76G6T68W6FRKC8')
  assert.equal(placeIn('#/').conversation, null)
  assert.equal(placeIn('').conversation, null)
  assert.equal(placeIn('#/c/../../settings').conversation, null)
  assert.equal(placeIn('#/c/01m3xn7aptvd76g6t68w6frkc8').conversation, null, 'ULIDs are upper case')
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

test('Settings is in the address over any place, on its section', async () => {
  const { placeIn, settingsIn, withSettings } = await import('../ui/router.js')
  const id = '01M3XN7APTVD76G6T68W6FRKC8'
  const project = '01M3XN7APTVD76G6T68W6FRKC9'
  assert.equal(withSettings('#/', 'general'), '#/settings')
  assert.equal(withSettings('#/', 'brains'), '#/settings/brains')
  assert.equal(withSettings(`#/c/${id}`, 'appearance'), `#/c/${id}/settings/appearance`)
  assert.equal(withSettings(`#/p/${project}/`, 'general'), `#/p/${project}/settings`)
  assert.equal(withSettings(`#/p/${project}/c/${id}`, null), `#/p/${project}/c/${id}`)
  for (const place of ['#/', `#/c/${id}`, `#/p/${project}/`, `#/p/${project}/c/${id}`]) {
    for (const section of ['general', 'brains']) {
      const address = withSettings(place, section)
      assert.equal(settingsIn(address), section, address)
      assert.deepEqual(placeIn(address), placeIn(place), address)
    }
    assert.equal(settingsIn(place), null, place)
  }
  assert.equal(settingsIn(''), null)
  assert.equal(settingsIn('#/settings/../../x'), 'general', 'a section is lower-case letters')
})
