import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readManifest, shownIn, baseOf, siteOf, RIGHTS } from '../app/caps/apps/manifest.js'
import { decided } from '../app/caps/apps/decided.js'

const app = {
  format: 1, name: 'word-count', version: '1.2.0', title: 'Word count', 'title-fr': 'Nombre de mots',
  description: 'Counts the words of each answer.', 'description-fr': 'Compte les mots de chaque réponse.',
  author: { name: 'Ada', email: 'ada@example.com' }, homepage: 'https://example.com/word-count', main: 'main.js', rights: ['draw', 'watch'],
}

test('an app’s manifest is Jean’s own app.json: its name, what it is called in each language, its module and the rights it asks for (D296)', () => {
  const manifest = readManifest(JSON.stringify(app))
  assert.deepEqual(manifest, {
    format: 1, name: 'word-count', version: '1.2.0', title: 'Word count', description: 'Counts the words of each answer.', author: 'Ada',
    homepage: 'https://example.com/word-count', main: 'main.js', rights: ['watch', 'draw'],
    shown: { fr: { title: 'Nombre de mots', description: 'Compte les mots de chaque réponse.' } },
  })
  assert.deepEqual(shownIn(manifest, 'fr'), { title: 'Nombre de mots', description: 'Compte les mots de chaque réponse.' })
  assert.deepEqual(shownIn(manifest, 'ja'), { title: 'Word count', description: 'Counts the words of each answer.' })
  assert.deepEqual(RIGHTS, ['watch', 'draw', 'notify', 'change', 'refuse', 'loosen'])
  // The glyph of Jean's it is shown with, when it names one by a name that could be one (D535).
  assert.equal(readManifest(JSON.stringify({ ...app, icon: 'moon' })).icon, 'moon')
  assert.equal(readManifest(JSON.stringify({ ...app, icon: '<svg>' })).icon, undefined)
  // What is wrong is said by its code, which the page words.
  for (const [given, code] of /** @type {[string, string][]} */ ([
    ['not json', 'json'], [JSON.stringify({ ...app, format: 2 }), 'format'], [JSON.stringify({ ...app, name: 'Word Count' }), 'name'],
    [JSON.stringify({ ...app, main: '../steal.js' }), 'main'], [JSON.stringify({ ...app, rights: ['watch', 'everything'] }), 'rights'],
  ])) assert.throws(() => readManifest(given), { message: code })
})

test('an app is added from its folder’s address, or a repository’s page on GitHub, read as its files', () => {
  assert.equal(baseOf('https://apps.example.com/word-count/app.json'), 'https://apps.example.com/word-count/')
  assert.equal(baseOf('https://apps.example.com/word-count'), 'https://apps.example.com/word-count/')
  assert.equal(baseOf('github.com/ada/word-count'), 'https://raw.githubusercontent.com/ada/word-count/HEAD/')
  assert.equal(baseOf('https://github.com/ada/apps/tree/main/word-count'), 'https://raw.githubusercontent.com/ada/apps/main/word-count/')
  assert.equal(baseOf('ftp://example.com/x'), null)
  assert.equal(baseOf('not an address'), null)
  // Its page says where it comes from as the person gave it: a repository on GitHub, not the raw files read.
  assert.equal(siteOf('https://raw.githubusercontent.com/ada/apps/main/word-count/'), 'github.com/ada/apps')
  assert.equal(siteOf('https://apps.example.com:8443/word-count/'), 'apps.example.com:8443')
})

test('what each app decided is read from the tasks’ records, from a time on, a call kept twice counted once (D535)', () => {
  const call = (/** @type {string} */ id, /** @type {string} */ at, /** @type {string} */ by, /** @type {string} */ decision) => ({ at, update: { sessionUpdate: 'tool_call', toolCallId: id, _meta: { by, decision } } })
  const records = [
    call('a', '2026-10-15T09:00:00Z', 'quiet-hours', 'ask'),
    call('b', '2026-10-21T09:00:00Z', 'quiet-hours', 'ask'), call('b', '2026-10-21T09:00:05Z', 'quiet-hours', 'ask'),
    call('c', '2026-10-22T21:40:00Z', 'quiet-hours', 'ask'), call('d', '2026-10-22T10:00:00Z', 'trusted-sites', 'allow'),
    { at: '2026-10-22T11:00:00Z', update: { sessionUpdate: 'tool_call', toolCallId: 'e' } },
  ]
  const seen = decided(records, '2026-10-16T00:00:00Z')
  assert.deepEqual(seen.get('quiet-hours'), new Map([['ask', { count: 2, at: '2026-10-22T21:40:00Z' }]]))
  assert.deepEqual(seen.get('trusted-sites'), new Map([['allow', { count: 1, at: '2026-10-22T10:00:00Z' }]]))
  // Another task's records add to what was counted.
  assert.equal(decided([call('f', '2026-10-23T08:00:00Z', 'quiet-hours', 'never')], '2026-10-16T00:00:00Z', seen).get('quiet-hours')?.get('never')?.count, 1)
})
