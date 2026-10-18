// jean.is's family page (D424): a page of its own in each language with words, English's at the root and the others
// under their language's folder,
// which promises a child's profile and shows the tutor's measurement, never the tutor, and runs nothing but the
// theme script its policy names.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BRAND } from '../app/brand.js'
import { ADDRESSES, appWords, familyAddress, familyFiles, familyLanguages, familyWords, measured, theme } from '../scripts/family.js'

const BASE = 'https://jean.is/'
const NOW = new Date('2026-10-19T10:00:00')

test('each language with words has a page at its address, English first', async () => {
  assert.deepEqual(await familyLanguages(), ['en', 'fr'])
  assert.deepEqual(Object.keys(await familyFiles(BASE, BRAND, NOW)).sort(), ['family.css', 'family.html', 'fr/famille.html'])
  assert.equal(familyAddress('fr'), 'fr/famille')
  assert.equal(familyAddress('ja'), 'family', 'a language without a page links English’s')
})

test('every language’s words have English’s, each of the same kind and with the same {params}', async () => {
  const english = await familyWords('en')
  const shape = (/** @type {unknown} */ value) => Array.isArray(value) ? `list of ${value.length}` : typeof value
  const params = (/** @type {unknown} */ value) => [...new Set(JSON.stringify(value).match(/\{\w+\}/g) ?? [])].sort().join()
  for (const lang of (await familyLanguages()).slice(1)) {
    const words = await familyWords(lang)
    assert.deepEqual(Object.keys(words).sort(), Object.keys(english).sort(), lang)
    for (const [key, value] of Object.entries(english)) {
      assert.equal(shape(words[key]), shape(value), `${lang}: ${key}`)
      assert.equal(params(words[key]), params(value), `${lang}: ${key}`)
    }
  }
})

test('the app’s own words it repeats are there in every language with a page', async () => {
  for (const lang of await familyLanguages()) {
    const words = await appWords(lang)
    for (const key of ['profiles.tier', 'profiles.concern', 'profiles.choice.later', 'profiles.topic.death', 'profiles.shared', 'composer.ai', 'first.free', 'profiles.add']) assert.ok(words[key], `${lang}: ${key}`)
  }
})

test('the page says what a search engine and a shared link read, and names its other languages', async () => {
  const files = await familyFiles(BASE, BRAND, NOW)
  for (const [lang, word] of Object.entries(ADDRESSES)) {
    const page = files[`${word}.html`]
    assert.match(page, new RegExp(`<html lang="${lang}" dir="ltr">`))
    assert.match(page, new RegExp(`<link rel="canonical" href="${BASE}${word}">`))
    assert.match(page, new RegExp(`<meta property="og:url" content="${BASE}${word}">`))
    for (const [other, address] of Object.entries(ADDRESSES)) assert.match(page, new RegExp(`<link rel="alternate" hreflang="${other}" href="${BASE}${address}">`))
    assert.match(page, new RegExp(`<link rel="alternate" hreflang="x-default" href="${BASE}family">`))
    assert.match(page, /<meta name="description" content="[^"]{80,}">/)
    assert.doesNotMatch(page, /noindex/)
  }
})

test('its policy runs the theme script and nothing else, with no style but the site’s own sheets', async () => {
  const { script } = await theme()
  const files = await familyFiles(BASE, BRAND, NOW)
  for (const word of Object.values(ADDRESSES)) {
    const page = files[`${word}.html`]
    const ran = /<script>([^<]*)<\/script>/.exec(page)?.[1] ?? ''
    const up = '../'.repeat(word.split('/').length - 1)
    assert.equal(ran, script.replace('href: `ui/looks/', `href: \`${up}ui/looks/`), `${word}: the app’s theme script, its looks named from the site’s root`)
    const hash = `'sha256-${createHash('sha256').update(ran).digest('base64')}'`
    assert.match(page, new RegExp(`script-src ${hash.replace(/[+/]/g, '\\$&')};`))
    assert.equal(page.match(/<script\b/g)?.length, 1, 'one script, the theme’s')
    assert.doesNotMatch(page, /\sstyle="|<style\b|\son\w+=/, 'no inline style or handler for the policy to refuse')
    assert.match(page, /style-src 'self';/)
  }
})

test('the button begins a child’s profile in the app, in the page’s language', async () => {
  const files = await familyFiles(BASE, BRAND, NOW)
  assert.match(files['family.html'], /<a class="button primary" href="\.\/\?child">/)
  assert.match(files['fr/famille.html'], /<a class="button primary" href="\.\.\/fr\?child">/)
})

test('a page under a language’s folder reaches the site’s own files one folder up', async () => {
  const files = await familyFiles(BASE, BRAND, NOW)
  assert.match(files['family.html'], /<link rel="stylesheet" href="family\.css">/)
  assert.match(files['fr/famille.html'], /<link rel="stylesheet" href="\.\.\/family\.css">/)
  assert.match(files['fr/famille.html'], /<a href="\.\.\/family" hreflang="en"/)
  assert.doesNotMatch(files['fr/famille.html'], /href="(?!\.\.\/|https?:|mailto:|#)[^"]+"/, 'every relative link climbs out of fr/')
})

test('it promises the profile and shows the measurement, never the tutor, until the gate passes', async () => {
  const files = await familyFiles(BASE, BRAND, NOW)
  const rows = await measured()
  for (const word of Object.values(ADDRESSES)) {
    const page = files[`${word}.html`]
    const heading = /<h1 id="fam-title">([^<]*)<\/h1>/.exec(page)?.[1] ?? ''
    assert.doesNotMatch(heading, /tutor|tuteur|homework|devoirs/i)
    assert.doesNotMatch(page.replace(/<script>[^<]*<\/script>/, ''), /\{\w+\}/, 'every {param} filled')
    if (rows.length) for (const row of rows) assert.ok(page.includes(`<bdi>${row.brain}</bdi>`), `${word}: ${row.brain}`)
    else assert.doesNotMatch(page, /<table class="fam-table">/)
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
