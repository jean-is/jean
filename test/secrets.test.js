// The secrets file, .secrets/keys.json: changed one change at a time, so that writers at once
// (a sign-in's connections, brains, shares, other tabs) keep each other's, and never over a file
// that can't be read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS } from '../app/core/fs.js'
import { getSecret, setSecret, deleteSecret } from '../app/ui/secrets.js'

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
