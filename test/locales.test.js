import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

const dir = new URL('../locales/', import.meta.url)
const load = async (/** @type {string} */ file) => JSON.parse(await readFile(new URL(file, dir), 'utf8'))
const placeholders = (/** @type {unknown} */ value) => new Set(JSON.stringify(value).match(/\{\w+\}/g) ?? [])

const en = await load('en.json')
const others = (await readdir(dir)).filter((file) => file.endsWith('.json') && file !== 'en.json')

for (const file of others) {
  test(`${file} matches en.json`, async () => {
    const catalog = await load(file)
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(en).sort())
    for (const [key, value] of Object.entries(catalog)) {
      const allowed = placeholders(en[key])
      for (const name of placeholders(value)) assert.ok(allowed.has(name), `${file} ${key}: unknown placeholder ${name}`)
    }
  })
}

test('the UI never says "model", "agent", "token" or "skill" in English', () => {
  for (const [key, value] of Object.entries(en)) {
    assert.doesNotMatch(String(value), /\b(models?|agents?|tokens?|skills?|MCP)\b/i, key)
  }
})
