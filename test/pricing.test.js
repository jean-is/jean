// SPDX-License-Identifier: MIT
// jean.is's pricing page, the price's one address (D428 · D464): its one button opens Jean, its two prices lead to
// their parts, its figures are the page for IT's and the public sector's numbers in each language's own, and it says
// the homepage's four ways and the page for IT's price cards in their words. What every page of the site must be,
// test/site.test.js holds it to (D438).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BRAND } from '../app/brand.js'
import { PRICE, SMALL } from '../site/enterprise/page.js'
import page from '../site/pricing/page.js'
import { THRESHOLD } from '../site/public-sector/page.js'
import { buildSite, fill, wordsOf, xml } from '../site/site.js'

const BASE = 'https://jean.is/'
/** The site's files as build:web writes them for jean.is, with its homepage. */
const built = buildSite({ brand: BRAND, base: BASE, index: () => '<!doctype html><html lang="en" dir="ltr"><head></head><body><noscript><p class="noscript">No scripts.</p></noscript></body></html>' })
const site = async () => (await built).files
/** A language's words, as a page fills them. @param {string} name @param {string} lang */
const words = async (name, lang) => /** @type {Record<string, any>} */ (await wordsOf(name, lang))
const said = (/** @type {string} */ text) => xml(fill(text, { name: BRAND.name, small: new Intl.NumberFormat('en').format(SMALL) }))

test('it is at /pricing in English and /fr/tarifs in French, only on jean.is, and the foot of every page and the site map lead to it', async () => {
  assert.deepEqual(page.addresses, { en: 'pricing', fr: 'fr/tarifs' })
  assert.ok(!page.ships)
  const files = await site()
  for (const path of ['pricing.html', 'fr/tarifs.html', 'pricing.css']) assert.ok(files[path], path)
  assert.match(files['enterprise.html'], /<li><a href="help">Help center<\/a><\/li><li><a href="pricing">Pricing<\/a><\/li>/)
  assert.match(files['fr/entreprise.html'], /<li><a href="\.\.\/fr\/tarifs">Tarifs<\/a><\/li>/)
  assert.match(files['ko/enterprise.html'], /<li><a href="\.\.\/pricing">요금<\/a><\/li>/, 'a language it isn’t in leads to its English')
  assert.match(files['site-map.html'], /<li><a href="pricing">Pricing<\/a><\/li>/)
  assert.match(files['pricing.html'], /<li><a href="pricing" aria-current="page">Pricing<\/a><\/li>/)
  assert.match(files['enterprise.html'], /<\/ul>\s*<p><a href="pricing">Pricing<\/a><\/p>\s*<p class="site-source">/, 'under the page for IT’s price cards')
  assert.match(files['fr/travail.html'], /<a href="\.\.\/fr\/tarifs">9\u202f900\u00a0€<\/a>/, 'from the price in the page for work’s answer')
})

test('its top has one button, Open Jean, and its two prices lead to their parts, in each language’s own numbers', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = files[`${address}.html`].split('<main id="main">')[1]
    const top = html.split('</section>')[0]
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    assert.equal(top.match(/class="button/g)?.length, 1, `${lang}: one button at the top`)
    assert.match(top, /<a class="button primary" href="(\.\/|\.\.\/fr)">/, `${lang}: it opens Jean`)
    assert.match(top, new RegExp(`<a class="pricing-tag" href="#pricing-you">[\\s\\S]*${money.format(0)}<svg class="felt-circle"`), `${lang}: a person’s price, circled`)
    assert.match(top, new RegExp(`<a class="pricing-tag" href="#pricing-orgs">[\\s\\S]*<b>${money.format(PRICE)}</b>`), `${lang}: an organisation’s`)
    for (const id of ['pricing-you', 'pricing-orgs']) assert.match(html, new RegExp(`<section id="${id}" class="site-act`), `${lang}: ${id}`)
  }
})

test('what the price comes to per person, and the public threshold, are worked out from the numbers, in each language', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = files[`${address}.html`]
    const cents = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    for (const size of [SMALL, 1000, 5000]) assert.ok(html.includes(`<b>${cents.format(PRICE / size)}</b>`), `${lang}: ${size} people`)
    assert.ok(html.includes(money.format(THRESHOLD)), `${lang}: the threshold`)
  }
  assert.ok((await site())['pricing.html'].includes('<b>€39.60</b>'), 'as the wireframe says it, for today’s price')
})

test('it says the homepage’s four ways and the page for IT’s price cards in their words, the cards leading to the key they ask for', async () => {
  const files = await site()
  const home = await words('home', 'en')
  const html = files['pricing.html']
  for (const way of home['any.ways']) assert.ok(html.includes(`</svg>${said(way)}</span></th>`), way)
  for (const line of home['any.catch'].slice(1)) assert.ok(html.includes(`<li>${said(line)}</li>`), line)
  const [few, many] = (await words('enterprise', 'en'))['price.cards']
  assert.match(html, new RegExp(`<a class="button" href="enterprise/key#free">${said(few[3])}</a>`))
  assert.match(html, new RegExp(`<a class="button primary" href="enterprise/key#trial">${said(many[3])}</a>`))
})
