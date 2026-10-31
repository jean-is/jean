import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { LOCALES } from './fixtures/locales.js'
import { intlLocales } from '../app/core/i18n.js'
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
      const categories = new Intl.PluralRules(intlLocales(lang)).resolvedOptions().pluralCategories
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
  const files = Object.entries(await sources()).map(([path, text]) => [path, text, keysIn(text, all)])
  for (const key of all) {
    const users = files.filter(([, , named]) => /** @type {Set<string>} */ (named).has(key))
    assert.ok(users.length, `${key} is never used`)
    if (dialogs.includes(key)) for (const [path, text] of users) assert.ok(showsDialogs(path, text), `${key} is used by ${path}, which doesn't load the dialogs' strings`)
    for (const [id, keys] of Object.entries(own)) {
      if (keys.includes(key)) for (const [path] of users) assert.ok(owner(id).test(path), `${key} is used by ${path}, outside the part whose strings it is`)
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

// French, and Breton and Corsican as French writes them, set ? ! : ; apart with a narrow no-break space (U+202F): after a
// plain one, the sign can wrap onto a line of its own. Canadian French sets only : apart, with a no-break space (D496).
test('French, Breton and Corsican never put a plain space before ? ! : ;, nor Canadian French any before ? ! ;', async () => {
  const rules = /** @type {const} */ ([['fr', / [?!:;]/], ['br', / [?!:;]/], ['co', / [?!:;]/], ['fr-CA', /[   ][?!;]/]])
  for (const part of PARTS) {
    for (const [lang, wrong] of rules) {
      for (const [key, value] of Object.entries(await load(part, `${lang}.json`))) {
        for (const text of typeof value === 'string' ? [value] : Object.values(value)) assert.doesNotMatch(text, wrong, `${part}${lang}.json ${key}`)
      }
    }
  }
  const skills = new URL('../app/caps/skills/directory/', import.meta.url)
  for (const name of await readdir(skills)) {
    const skill = await readFile(new URL(`${name}/SKILL.md`, skills), 'utf8')
    for (const [lang, wrong] of rules) {
      for (const [, text] of skill.matchAll(new RegExp(`^\\s*(?:title|text)-${lang}: "(.*)"$`, 'gm'))) assert.doesNotMatch(text, wrong, `${name}/SKILL.md ${lang}`)
    }
  }
})

// Greek asks with ; (D563), Romanian writes ș and ț with a comma below, never the cedilla's ş and ţ, and Hungarian
// and Finnish never end a placeholder with a case ending, whose form follows the sound of what fills it: Finnish
// puts it on a word joined by a hyphen ("{service}-palvelu").
test('Greek never asks with ?, Romanian never writes a cedilla under s or t, Hungarian and Finnish never inflect a placeholder', async () => {
  const rules = /** @type {const} */ ([['el', /\?/], ['ro', /[şţŞŢ]/], ['hu', /\}[-\p{L}]/u], ['fi', /\}:?\p{L}/u]])
  for (const part of PARTS) {
    for (const [lang, wrong] of rules) {
      for (const [key, value] of Object.entries(await load(part, `${lang}.json`))) {
        for (const text of typeof value === 'string' ? [value] : Object.values(value)) assert.doesNotMatch(text, wrong, `${part}${lang}.json ${key}`)
      }
    }
  }
})

// Croatian's "one" is also 21's, Breton's "two" 22's, Filipino's "one" 2's and 3's: a form more than one number
// takes says which (D563).
test('a plural form that more than one number takes shows the number', async () => {
  for (const lang of LOCALES.filter((code) => code !== 'en')) {
    const rules = new Intl.PluralRules(intlLocales(lang))
    const shared = new Set(Array.from({ length: 200 }, (_, n) => rules.select(n + 1)).filter((form, n, all) => all.indexOf(form) !== n))
    for (const part of PARTS) {
      for (const [key, value] of Object.entries(await load(part, `${lang}.json`))) {
        const number = typeof value === 'object' && english[part][key].other.match(/\{(count|n)\}/)?.[0]
        if (number) for (const form of shared) assert.ok(value[form].includes(number), `${part}${lang}.json ${key}: "${form}" without ${number}`)
      }
    }
  }
})
