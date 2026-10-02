// The multilingual reflex test set (scripts/reflexes.js measures Kev on it): every launch
// language holds every example, in the same shape as the English source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { LOCALES } from './fixtures/locales.js'

const dir = new URL('./reflexes/', import.meta.url)
const english = JSON.parse(await readFile(new URL('en.json', dir), 'utf8'))
const files = (await readdir(dir)).filter((file) => file.endsWith('.json'))

test('one file per launch language', () => {
  assert.deepEqual(files.map((file) => file.slice(0, -5)).sort(), [...LOCALES].sort())
})

for (const file of files.filter((name) => name !== 'en.json')) {
  test(`reflexes/${file} has every example`, async () => {
    const { states } = JSON.parse(await readFile(new URL(file, dir), 'utf8'))
    assert.deepEqual(Object.keys(states).sort(), Object.keys(english.states).sort())
    for (const [id, source] of Object.entries(english.states)) {
      const state = states[id]
      if (Array.isArray(source)) assert.ok(Array.isArray(state) && state.length === 2 && state.every((part) => part.trim()), `${file} ${id}`)
      else assert.ok(typeof state === 'string' && state.trim() && state !== source || id === 't4', `${file} ${id} is translated`)
    }
  })
}
