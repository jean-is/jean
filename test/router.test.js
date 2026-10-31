import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeIn } from '../app/ui/router.js'

test('the address names a conversation only with a valid ULID', () => {
  assert.equal(placeIn('#/c/01M3XN7APTVD76G6T68W6FRKC8').conversation, '01M3XN7APTVD76G6T68W6FRKC8')
  assert.equal(placeIn('#/c/01M3XN7APTVD76G6T68W6FRKC8/extra').conversation, '01M3XN7APTVD76G6T68W6FRKC8')
  assert.equal(placeIn('#/').conversation, null)
  assert.equal(placeIn('').conversation, null)
  assert.equal(placeIn('#/c/../../settings').conversation, null)
  assert.equal(placeIn('#/c/01m3xn7aptvd76g6t68w6frkc8').conversation, null, 'ULIDs are upper case')
})

test('a project other than home is in the address too', async () => {
  const { placeIn, hashFor } = await import('../app/ui/router.js')
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

test('Settings is in the address over any place, on its section or one of its pages (D509)', async () => {
  const { placeIn, settingsIn, withSettings } = await import('../app/ui/router.js')
  const id = '01M3XN7APTVD76G6T68W6FRKC8'
  const project = '01M3XN7APTVD76G6T68W6FRKC9'
  assert.equal(withSettings('#/', 'general'), '#/settings')
  assert.equal(withSettings('#/', 'brains'), '#/settings/brains')
  assert.equal(withSettings(`#/c/${id}`, 'appearance'), `#/c/${id}/settings/appearance`)
  assert.equal(withSettings(`#/p/${project}/`, 'general'), `#/p/${project}/settings`)
  assert.equal(withSettings(`#/p/${project}/c/${id}`, null), `#/p/${project}/c/${id}`)
  for (const place of ['#/', `#/c/${id}`, `#/p/${project}/`, `#/p/${project}/c/${id}`]) {
    for (const section of ['general', 'brains', `routines/${id}`, 'routines/new', `brains/${id}`, 'brains/auto', 'brains/key', 'skills/reply-to-a-client', 'skills/add/music-score', 'skills/sites']) {
      const address = withSettings(place, section)
      assert.equal(settingsIn(address), section, address)
      assert.deepEqual(placeIn(address), placeIn(place), address)
    }
    assert.equal(settingsIn(place), null, place)
  }
  assert.equal(settingsIn(''), null)
  assert.equal(settingsIn('#/settings/../../x'), 'general', 'a section is lower-case letters')
  assert.equal(settingsIn('#/settings/routines/../x'), 'routines', 'a page is letters, digits, hyphens and slashes')
})

test('the windows beside a place come after a ?, in the order they opened, each with what it shows (D220)', async () => {
  const { signal } = await import('@preact/signals-core')
  const { placeIn, settingsIn, beside } = await import('../app/ui/router.js')
  const { keep, written } = await import('../app/ui/windows.js')
  const id = '01M3XN7APTVD76G6T68W6FRKC8'
  const address = `#/c/${id}/settings/brains?browser=https://example.com/a?b=c%26d&terminal`
  assert.deepEqual(placeIn(address), { project: null, conversation: id })
  assert.equal(settingsIn(address), 'brains')
  assert.equal(placeIn(`#/c/${id}?terminal`).conversation, id)
  assert.equal(settingsIn(`#/c/${id}?terminal`), null)

  const terminal = signal(/** @type {string | null} */ (null))
  const browser = signal(/** @type {string | null} */ (null))
  keep('terminal', { get: () => terminal.value, set: (state) => { terminal.value = state } })
  keep('browser', { get: () => browser.value, set: (state) => { browser.value = state } })
  assert.equal(written.value, '')
  terminal.value = ''
  const page = 'https://example.com/a b?q=1&r=2+3#top'
  browser.value = page
  assert.equal(written.value, 'terminal&browser=https://example.com/a%20b%3Fq%3D1%26r%3D2%2B3%23top')
  assert.equal(beside.value, written.value, 'the router writes what changed')
  // What the address holds comes back as it was.
  assert.deepEqual([...new URLSearchParams(written.value)], [['terminal', ''], ['browser', page]])
  terminal.value = null
  terminal.value = ''
  assert.equal(written.value, 'browser=https://example.com/a%20b%3Fq%3D1%26r%3D2%2B3%23top&terminal', 'reopened, it comes last')
  for (const word of ['/workspace/charts/é.html', 'folder:Notes/index.html', 'made:files/sha256-ab.html']) {
    browser.value = word
    assert.equal(new URLSearchParams(written.value).get('browser'), word)
  }
  assert.match(written.value, /browser=made:files\/sha256-ab\.html/, 'slashes and colons stay as they are')
})
