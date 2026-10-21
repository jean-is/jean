import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readManifest, shownIn, baseOf, RIGHTS } from '../app/caps/apps/manifest.js'

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
})
