import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { LOCALES } from './fixtures/locales.js'
import { sources, keysIn, showsDialogs, owner, PARTS as OWN } from './fixtures/keys.js'

const dir = new URL('../app/locales/', import.meta.url)
/** A part's folder: jean-cli's lives with it (D243). @param {string} part */
const folder = (part) => (part === 'cli/' ? new URL('../cli/locales/', import.meta.url) : new URL(part, dir))
const load = async (/** @type {string} */ part, /** @type {string} */ file) => JSON.parse(await readFile(new URL(file, folder(part)), 'utf8'))
const placeholders = (/** @type {unknown} */ value) => new Set(JSON.stringify(value).match(/\{\w+\}/g) ?? [])

// Each language has parts: the room's strings, the dialogs' (locales/dialogs/, D97), and those of
// a capability that brings its own (locales/<id>/, D140), and jean-cli's (cli/locales/).
const PARTS = ['', 'dialogs/', ...OWN.map((id) => `${id}/`)]
const english = Object.fromEntries(await Promise.all(PARTS.map(async (part) => [part, await load(part, 'en.json')])))
const others = (await readdir(dir)).filter((file) => file.endsWith('.json') && file !== 'en.json')

for (const file of others) {
  for (const part of PARTS) {
    test(`${part}${file} matches ${part}en.json`, async () => {
      const en = english[part]
      const catalog = await load(part, file)
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
}

test('the language menu offers exactly the catalogues there are', async () => {
  const i18n = await readFile(new URL('../app/core/i18n.js', import.meta.url), 'utf8')
  const listed = JSON.parse((/export const LOCALES = (\[[^\]]*\])/.exec(i18n)?.[1] ?? '[]').replace(/'/g, '"'))
  assert.deepEqual(listed, [...LOCALES].sort((a, b) => (a < b ? -1 : 1)))
  assert.deepEqual([...others.map((file) => file.slice(0, -5)), 'en'].sort(), [...LOCALES].sort())
})

test('every string is used, the dialogs’ strings only by modules that show a dialog, and a capability’s own only by it', async () => {
  const room = Object.keys(english[''])
  const dialogs = Object.keys(english['dialogs/'])
  const own = Object.fromEntries(OWN.map((id) => [id, Object.keys(english[`${id}/`])]))
  const all = [room, dialogs, ...Object.values(own)].flat()
  assert.equal(new Set(all).size, all.length, 'a string in two parts')
  const files = Object.entries(await sources())
  for (const key of all) {
    const users = files.filter(([, text]) => keysIn(text, [key]).size)
    assert.ok(users.length, `${key} is never used`)
    if (dialogs.includes(key)) for (const [path, text] of users) assert.ok(showsDialogs(path, text), `${key} is used by ${path}, which doesn't load the dialogs' strings`)
    for (const [id, keys] of Object.entries(own)) {
      if (keys.includes(key)) for (const [path] of users) assert.ok(path.startsWith(owner(id)), `${key} is used by ${path}, outside the part whose strings it is`)
    }
  }
})

// "Routine" is only for tasks Jean does on a schedule (D115, D122): a skill is a skill.
test('the UI never says "model", "agent" or "token" in English, and "routine" only for routines', () => {
  for (const [key, value] of Object.entries(Object.assign({}, ...Object.values(english)))) {
    assert.doesNotMatch(String(value), /\b(models?|agents?|tokens?|MCP)\b/i, key)
    if (/\broutines?\b/i.test(String(value))) assert.match(key, /routine|schedule/, key)
  }
})

// French sets ? ! : ; apart with a narrow no-break space (U+202F): after a plain one, the sign can wrap onto a line of its own.
test('French never puts a plain space before ? ! : ;', async () => {
  for (const part of PARTS) {
    for (const [key, value] of Object.entries(await load(part, 'fr.json'))) {
      for (const text of typeof value === 'string' ? [value] : Object.values(value)) assert.doesNotMatch(text, / [?!:;]/, `${part}fr.json ${key}`)
    }
  }
  const skills = new URL('../app/caps/skills/directory/', import.meta.url)
  for (const name of await readdir(skills)) {
    const skill = await readFile(new URL(`${name}/SKILL.md`, skills), 'utf8')
    for (const [, text] of skill.matchAll(/^\s*(?:title|text)-fr:(.*)$/gm)) assert.doesNotMatch(text, / [?!:;]/, `${name}/SKILL.md`)
  }
})
