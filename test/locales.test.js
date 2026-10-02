import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { LOCALES } from './fixtures/locales.js'

const dir = new URL('../locales/', import.meta.url)
const load = async (/** @type {string} */ file) => JSON.parse(await readFile(new URL(file, dir), 'utf8'))
const placeholders = (/** @type {unknown} */ value) => new Set(JSON.stringify(value).match(/\{\w+\}/g) ?? [])

const en = await load('en.json')
const others = (await readdir(dir)).filter((file) => file.endsWith('.json') && file !== 'en.json')

for (const file of others) {
  test(`${file} matches en.json`, async () => {
    const catalog = await load(file)
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(en).sort())
    const lang = file.slice(0, -'.json'.length)
    const categories = new Intl.PluralRules(lang).resolvedOptions().pluralCategories
    for (const [key, value] of Object.entries(catalog)) {
      const allowed = placeholders(en[key])
      for (const name of placeholders(value)) assert.ok(allowed.has(name), `${file} ${key}: unknown placeholder ${name}`)
      // A plural covers every form the language uses (Arabic has six).
      if (typeof en[key] === 'object') for (const category of categories) assert.ok(category in value, `${file} ${key}: no "${category}" form`)
      else assert.equal(typeof value, 'string', `${file} ${key}`)
    }
  })
}

test('the language menu offers exactly the catalogues there are', async () => {
  const state = await readFile(new URL('../ui/state.js', import.meta.url), 'utf8')
  const listed = JSON.parse((/export const LOCALES = (\[[^\]]*\])/.exec(state)?.[1] ?? '[]').replace(/'/g, '"'))
  assert.deepEqual(listed, [...LOCALES].sort((a, b) => (a < b ? -1 : 1)))
  assert.deepEqual([...others.map((file) => file.slice(0, -5)), 'en'].sort(), [...LOCALES].sort())
})

test('the UI never says "model", "agent", "token" or "skill" in English', () => {
  for (const [key, value] of Object.entries(en)) {
    assert.doesNotMatch(String(value), /\b(models?|agents?|tokens?|skills?|MCP)\b/i, key)
  }
})
