// jean.is's page for public bodies, the page for IT's sibling (D428): it says first that nobody needs a key, leads to a
// trial key, keeps every band under France's threshold for buying without a procedure over three years, and gives staff
// representatives the page for IT's own answers. What every page of the site must be, test/site.test.js holds it to (D438).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BRAND } from '../app/brand.js'
import { PRICE, SMALL, STATUSES } from '../site/enterprise/page.js'
import page from '../site/public-sector/page.js'
import { buildSite, wordsOf } from '../site/site.js'

const BASE = 'https://jean.is/'
/** The site's files as build:web writes them for jean.is, with its homepage. */
const site = async () => (await buildSite({ brand: BRAND, base: BASE, index: () => '<!doctype html><html lang="en" dir="ltr"><head></head><body><noscript><p class="noscript">No scripts.</p></noscript></body></html>' })).files
/** What a page's main part says, without its tags. @param {string} html */
const said = (html) => (/<main id="main">([\s\S]*)<\/main>/.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, ' ')

test('it is at /public-sector in English and /fr/secteur-public in French', async () => {
  assert.deepEqual(page.addresses, { en: 'public-sector', fr: 'fr/secteur-public' })
  const files = await site()
  for (const path of ['public-sector.html', 'fr/secteur-public.html', 'public-sector.css']) assert.ok(files[path], path)
})

test('it says nobody needs a key before any button, then leads to a trial key and to the review team', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = files[`${address}.html`].split('<main id="main">')[1]
    const words = /** @type {Record<string, string>} */ (await wordsOf('public-sector', lang))
    const first = html.indexOf('class="button')
    assert.ok(html.indexOf(words.nokey.replace('{name}', BRAND.name)) < first, `${lang}: no key needed, said first`)
    assert.match(html.slice(first), /^class="button primary" href="(\.\.\/)?(fr\/entreprise\/cle|enterprise\/key)#trial"/, `${lang}: the first button asks for a trial key`)
    assert.match(html, /<a class="button" href="#ps-share">/, `${lang}: the second shares the page`)
    assert.match(html, /href="mailto:\?subject=[^"]+&amp;body=[^"]*jean\.is%2F/, `${lang}: the review team is sent the page's address`)
  }
})

test('the price, over four years, stays under the threshold the page names, in each language’s own numbers', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = files[`${address}.html`]
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    assert.ok(html.includes(money.format(60_000)), `${lang}: the threshold`)
    assert.ok(PRICE * 4 < 60_000, 'four years under the threshold')
    for (const price of [PRICE, PRICE * 4]) assert.ok(html.includes(money.format(price)), `${lang}: ${price}`)
    assert.ok(html.includes(new Intl.NumberFormat(lang).format(SMALL)), `${lang}: a free key under ${SMALL} people`)
  }
})

test('every answer has a status the style sheet draws, and staff representatives get the page for IT’s own answers', async () => {
  const css = await readFile(new URL('../site/public-sector/public-sector.css', import.meta.url), 'utf8')
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = files[`${address}.html`]
    for (const [, status] of html.matchAll(/class="ps-status is-(\w+)"/g)) assert.ok(STATUSES.includes(status) && css.includes(`.ps-status.is-${status}`), `${lang}: ${status}`)
    const theirs = /** @type {string[][]} */ ((await wordsOf('enterprise', lang))?.['answers.staff'])
    for (const [question, answer] of theirs) assert.ok(html.includes(`<dt>${question}</dt><dd>${answer}</dd>`), `${lang}: ${question}`)
  }
})

test('it never says what free covers beyond a key for small organisations, nor agent, model, MCP or token', async () => {
  const files = await site()
  for (const address of Object.values(page.addresses)) {
    const text = said(files[`${address}.html`])
    assert.doesNotMatch(text, /\b(schools?|écoles?|universit(y|ies|és?)|non-profits?|associations?)\b/i, address)
    assert.doesNotMatch(text, /\b(agents?|models?|MCP|tokens?)\b/i, address)
  }
})
