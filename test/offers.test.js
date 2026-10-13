// The multilingual offer test set (scripts/offers.js measures brains on it, D284): every
// request labelled, and every language holding every request, translated.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

const dir = new URL('./offers/', import.meta.url)
const english = JSON.parse(await readFile(new URL('en.json', dir), 'utf8'))
const files = (await readdir(dir)).filter((file) => file.endsWith('.json'))

test('every English request has a label, and every label a request', () => {
  assert.deepEqual(Object.keys(english.requests).sort(), Object.keys(english.labels).sort())
  for (const label of Object.values(english.labels)) assert.match(label, /^[a-z]+$/)
})

for (const file of files.filter((name) => name !== 'en.json')) {
  test(`offers/${file} has every request`, async () => {
    const { requests } = JSON.parse(await readFile(new URL(file, dir), 'utf8'))
    assert.deepEqual(Object.keys(requests).sort(), Object.keys(english.requests).sort())
    for (const [id, source] of Object.entries(english.requests)) {
      assert.ok(typeof requests[id] === 'string' && requests[id].trim() && requests[id] !== source, `${file} ${id} is translated`)
    }
  })
}
