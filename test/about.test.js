// What Jean knows of itself (D423): its guide has a part for every capability of the case, each named by its id, and
// for what is always there; every menu or button it names is a string of the room's or the dialogs', which `about` gives
// as the user's screen shows it. A capability's own words and how it is found come from the case, so each has them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = async (/** @type {string} */ path) => readFile(new URL(`../app/${path}`, import.meta.url), 'utf8')
const guide = await read('caps/own-skills/guide.txt')
const room = JSON.parse(await read('locales/en.json'))
const dialogs = JSON.parse(await read('locales/dialogs/en.json'))
const ids = [...guide.matchAll(/^## (.+)$/gm)].map(([, id]) => id)
// Every capability the case can show, wherever it can: those this browser lacks included.
const catalogue = [...(/export const CATALOGUE = \[(.*)\]$/m.exec(await read('ui/discovery.js'))?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].map(([, id]) => id)

test('the guide has a part for every capability of the case, once each, and its other parts are none', () => {
  assert.ok(catalogue.length > 20, 'the case is read')
  assert.deepEqual(catalogue.filter((id) => !ids.includes(id)), [], 'capabilities with no part')
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'parts twice')
  for (const id of ids) assert.match(id, /^[a-z-]+$/, `## ${id}`)
  // A part is a capability's when the case has words for it: one outside the case would be said to be "not here".
  assert.deepEqual(ids.filter((id) => `cap.${id}.text` in dialogs && !catalogue.includes(id)), [], 'capabilities the case never shows')
})

test('each capability has the case’s words for what it does and how it is found', () => {
  for (const id of catalogue) {
    assert.ok(`cap.${id}.text` in dialogs, `cap.${id}.text`)
    assert.ok(`cap.${id}.hint` in dialogs, `cap.${id}.hint`)
  }
})

test('every menu or button the guide names is a string the room or the dialogs hold, and it says no decision', () => {
  const keys = [...guide.matchAll(/\{([^}]*)\}/g)].map(([, key]) => key)
  assert.ok(keys.length > 20)
  assert.deepEqual(keys.filter((key) => !(key in room) && !(key in dialogs)), [], 'unknown strings')
  assert.doesNotMatch(guide, /\bD\d+\b/)
})

// They come from Settings' own list, as this keyboard writes them, those of a capability once it is found.
test('the guide writes no shortcut of its own', () => {
  assert.doesNotMatch(guide, /[⌘⇧⌥⌫]|\bCtrl\+(?!C\b)/)
})

test('a part that is always there opens with a paragraph of its own, which the overview gives', () => {
  for (const part of guide.split(/^## /m).slice(1)) {
    const [id, ...lines] = part.trim().split('\n')
    if (catalogue.includes(id)) continue
    assert.ok(lines.join('\n').trim().split('\n\n').length > 1, `## ${id} has a first paragraph, then the rest`)
  }
})
