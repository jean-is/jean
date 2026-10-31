import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readManifest, shownIn, baseOf, siteOf, RIGHTS } from '../app/caps/extensions/manifest.js'

const extension = {
  format: 1, name: 'word-count', version: '1.2.0', title: 'Word count', 'title-fr': 'Nombre de mots',
  description: 'Counts the words of each answer.', 'description-fr': 'Compte les mots de chaque réponse.',
  author: { name: 'Ada', email: 'ada@example.com' }, homepage: 'https://example.com/word-count', main: 'main.js', rights: ['draw', 'watch'],
}

test('an extension’s manifest is Jean’s own extension.json: its name, what it is called in each language, its module and the rights it asks for (D296)', () => {
  const manifest = readManifest(JSON.stringify(extension))
  assert.deepEqual(manifest, {
    format: 1, name: 'word-count', version: '1.2.0', title: 'Word count', description: 'Counts the words of each answer.', author: 'Ada',
    homepage: 'https://example.com/word-count', main: 'main.js', rights: ['watch', 'draw'],
    shown: { fr: { title: 'Nombre de mots', description: 'Compte les mots de chaque réponse.' } },
  })
  assert.deepEqual(shownIn(manifest, 'fr'), { title: 'Nombre de mots', description: 'Compte les mots de chaque réponse.' })
  assert.deepEqual(shownIn(manifest, 'ja'), { title: 'Word count', description: 'Counts the words of each answer.' })
  assert.deepEqual(RIGHTS, ['watch', 'draw', 'notify', 'change', 'refuse', 'loosen'])
  // The glyph of Jean's it is shown with, when it names one by a name that could be one.
  assert.equal(readManifest(JSON.stringify({ ...extension, icon: 'moon' })).icon, 'moon')
  assert.equal(readManifest(JSON.stringify({ ...extension, icon: '<svg>' })).icon, undefined)
  // Never one that stands for safety or for one of Jean's controls: it would read as Jean's own.
  for (const icon of ['shield', 'lock', 'check', 'trash']) assert.equal(readManifest(JSON.stringify({ ...extension, icon })).icon, undefined)
  // What is wrong is said by its code, which the page words.
  for (const [given, code] of /** @type {[string, string][]} */ ([
    ['not json', 'json'], [JSON.stringify({ ...extension, format: 2 }), 'format'], [JSON.stringify({ ...extension, name: 'Word Count' }), 'name'],
    [JSON.stringify({ ...extension, main: '../steal.js' }), 'main'], [JSON.stringify({ ...extension, rights: ['watch', 'everything'] }), 'rights'],
  ])) assert.throws(() => readManifest(given), { message: code })
})

test('an extension is added from its folder’s address, or a repository’s page on GitHub, read as its files', () => {
  assert.equal(baseOf('https://extensions.example.com/word-count/extension.json'), 'https://extensions.example.com/word-count/')
  assert.equal(baseOf('https://extensions.example.com/word-count'), 'https://extensions.example.com/word-count/')
  assert.equal(baseOf('github.com/ada/word-count'), 'https://raw.githubusercontent.com/ada/word-count/HEAD/')
  assert.equal(baseOf('https://github.com/ada/extensions/tree/main/word-count'), 'https://raw.githubusercontent.com/ada/extensions/main/word-count/')
  assert.equal(baseOf('ftp://example.com/x'), null)
  assert.equal(baseOf('not an address'), null)
  // Its page says where it comes from as the person gave it: a repository on GitHub, not the raw files read.
  assert.equal(siteOf('https://raw.githubusercontent.com/ada/extensions/main/word-count/'), 'github.com/ada/extensions')
  assert.equal(siteOf('https://extensions.example.com:8443/word-count/'), 'extensions.example.com:8443')
})
