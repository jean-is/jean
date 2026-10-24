// jean.is's family page (D424): it promises a child's profile, begins one in the page's language, and, the gate
// passed (D394), says how a child learns, with its measurement. What every page of the site must be, test/site.test.js
// holds it to (D438).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BRAND } from '../app/brand.js'
import page, { measured } from '../site/family/page.js'
import { appWords, buildSite } from '../site/site.js'

const BASE = 'https://jean.is/'
/** The site's files as build:web writes them for jean.is, with its homepage, whose French the button opens. */
const site = async () => (await buildSite({ brand: BRAND, base: BASE, now: new Date('2026-10-19T10:00:00'),
  index: () => '<!doctype html><html lang="en" dir="ltr"><head></head><body><noscript><p class="noscript">No scripts.</p></noscript></body></html>' })).files

test('it is at /family in English, /fr/famille in French and /ko/family in Korean', async () => {
  assert.deepEqual(page.addresses, { en: 'family', fr: 'fr/famille', ko: 'ko/family' })
  const files = await site()
  for (const path of ['family.html', 'fr/famille.html', 'ko/family.html', 'family.css']) assert.ok(files[path], path)
})

test('the app’s own words it repeats are there in every language with a page', async () => {
  for (const lang of Object.keys(page.addresses)) {
    const words = await appWords(lang)
    for (const key of ['profiles.tier', 'profiles.concern', 'profiles.choice.later', 'profiles.topic.death', 'profiles.shared', 'composer.ai', 'first.free', 'profiles.add']) assert.ok(words[key], `${lang}: ${key}`)
  }
})

test('the button begins a child’s profile in the app, in the page’s language', async () => {
  const files = await site()
  assert.match(files['family.html'], /<a class="button primary" href="\.\/\?child">/)
  assert.match(files['fr/famille.html'], /<a class="button primary" href="\.\.\/fr\?child">/)
})

test('its gate passed, it says how a child learns, Jean only helping, with the measurement as its proof', async () => {
  const files = await site()
  const rows = await measured()
  for (const address of Object.values(page.addresses)) {
    const html = files[`${address}.html`]
    assert.doesNotMatch(html.replace(/<[^>]*>/g, ''), /tutor|tuteur/i, 'never a tutor, even after the gate')
    assert.doesNotMatch(html.replace(/<script>[^<]*<\/script>/, ''), /\{\w+\}/, 'every {param} filled')
    assert.equal(html.match(/<ol class="fam-steps">(.*?)<\/ol>/)?.[1].match(/<li>/g)?.length, 3, `${address}: three steps`)
    assert.equal(html.match(/<ol class="fam-ladder">(.*?)<\/ol>/)?.[1].match(/<li>/g)?.length, 4, `${address}: four rungs`)
    assert.match(html, /<p class="fam-measure">[^<]+<a href="#fam-learn">/)
    if (rows.length) for (const row of rows) assert.ok(html.includes(/* html */ `<bdi>${row.brain}</bdi>`), `${address}: ${row.brain}`)
    else assert.doesNotMatch(html, /<table class="fam-table">/)
  }
})

test('the measurement is read from npm run tutor’s results, as a child’s profile asks', async () => {
  const text = await readFile(new URL('tutor/results.md', import.meta.url), 'utf8')
  const rows = await measured()
  assert.equal(rows.length, text.split('\n').filter((line) => line.startsWith('|') && line.includes(', Learn it with each message |')).length)
  for (const row of rows) {
    assert.ok(row.given >= 0 && row.given <= 1 && row.pressure >= 0 && row.pressure <= 1, row.brain)
    assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/)
  }
})
