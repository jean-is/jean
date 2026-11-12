// SPDX-License-Identifier: MIT
// The secrets file, .secrets/keys.json: changed one change at a time, so that writers at once
// (a sign-in's connections, brains, shares, other tabs) keep each other's, and never over a file
// that can't be read. And settings.json the same way, so that a stale tab never reverts another's change.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS } from '../app/core/fs.js'
import { getSecret, setSecret, deleteSecret } from '../app/ui/secrets.js'
import { app, changeSettings, updateSettings } from '../app/ui/state.js'

const FILE = '.secrets/keys.json'

test('secrets set and deleted at once all land', async () => {
  const fs = memoryFS({ [FILE]: JSON.stringify({ old: 'o', gone: 'g' }) })
  const ids = Array.from({ length: 8 }, (_, i) => `connection:${i}`)
  await Promise.all([...ids.map((id) => setSecret(fs, id, id)), deleteSecret(fs, 'gone')])
  for (const id of ids) assert.equal(await getSecret(fs, id), id)
  assert.equal(await getSecret(fs, 'old'), 'o')
  assert.equal(await getSecret(fs, 'gone'), null)
})

test('a secrets file that can’t be read is never written over', async () => {
  const fs = memoryFS({ [FILE]: '{"brain:openai": "sk-' })
  await assert.rejects(setSecret(fs, 'share:1', 'token'))
  await assert.rejects(deleteSecret(fs, 'brain:openai'))
  assert.equal(await fs.read(FILE), '{"brain:openai": "sk-')
})

test('a secret is set where there were none, and deleting one that isn’t there writes nothing', async () => {
  const fs = memoryFS()
  await deleteSecret(fs, 'missing')
  assert.equal(await fs.read(FILE), null)
  await setSecret(fs, 'brain:openai', 'sk-1')
  assert.equal(await getSecret(fs, 'brain:openai'), 'sk-1')
})

test('settings are written over the file as it is: a stale tab never reverts another’s change, nor writes what it holds alone', async () => {
  const other = (/** @type {object} */ settings) => app.fs.write('settings.json', JSON.stringify(settings))
  app.fs = memoryFS({ 'settings.json': JSON.stringify({ locale: 'fr' }) })
  await changeSettings()
  assert.equal(app.settings.value.locale, 'fr')
  // Another tab names the person; this one reads the file again, and writes nothing.
  await other({ locale: 'fr', name: 'Ada' })
  const written = await app.fs.read('settings.json')
  await changeSettings()
  assert.equal(app.settings.value.name, 'Ada')
  assert.equal(await app.fs.read('settings.json'), written)
  // A look being tried, in memory alone; another tab changes the language, unread here; this one changes two things at once.
  app.settings.value = { ...app.settings.value, look: { id: 'tried' } }
  await other({ locale: 'ja', name: 'Ada' })
  await Promise.all([updateSettings({ cloud: false }), updateSettings({ unlocked: ['find'] })])
  const file = JSON.parse(/** @type {string} */ (await app.fs.read('settings.json')))
  assert.deepEqual([file.locale, file.name, file.cloud, file.unlocked, file.look], ['ja', 'Ada', false, ['find'], undefined])
  assert.deepEqual([app.settings.value.cloud, app.settings.value.unlocked, app.settings.value.look], [false, ['find'], { id: 'tried' }])
  // Another tab's change now comes in, and only it: the look still being tried here stays.
  assert.equal(app.settings.value.locale, 'ja')
  await other({ ...file, name: 'Grace' })
  await changeSettings()
  assert.deepEqual([app.settings.value.name, app.settings.value.look, app.settings.value.cloud], ['Grace', { id: 'tried' }, false])
  // An earlier write finishing never puts its value back over a newer one already shown.
  const first = updateSettings({ name: 'Ada' })
  app.settings.value = { ...app.settings.value, name: 'Lovelace' }
  await first
  assert.equal(app.settings.value.name, 'Lovelace')
  // A file that doesn't read is neither written over nor read as the defaults.
  await app.fs.write('settings.json', '{"locale": "fr", ')
  await changeSettings()
  assert.equal(app.settings.value.name, 'Lovelace')
  await assert.rejects(changeSettings({ cloud: true }))
  assert.equal(await app.fs.read('settings.json'), '{"locale": "fr", ')
})
