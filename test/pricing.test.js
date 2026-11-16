// SPDX-License-Identifier: MIT
// jean.is's pricing page, the price's one address (D428 · D464): its one button opens Jean, its two prices lead to
// their parts, its figures are the page for IT's and the public sector's numbers in each language's own, and it says
// the homepage's four ways and the page for IT's price cards in their words. Under what the price comes to per person
// stands a price per seat, SEAT's list price for a year, never a figure its words hold, with its maker's page and the
// day it was read there; and whoever hosts Jean for an organisation is shown the way to a key beside the one button
// and at the page's end. What every page of the site must be, test/site.test.js holds it to (D438).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BRAND } from '../app/brand.js'
import key from '../site/enterprise-key/page.js'
import { PRICE, SMALL } from '../site/enterprise/page.js'
import page, { SEAT } from '../site/pricing/page.js'
import { THRESHOLD } from '../site/public-sector/page.js'
import { buildSite, fill, wordsOf, xml } from '../site/site.js'

const BASE = 'https://jean.is/'
/** The site's files as build:web writes them for jean.is, with its homepage. */
const built = buildSite({ brand: BRAND, base: BASE, index: () => '<!doctype html><html lang="en" dir="ltr"><head></head><body><noscript><p class="noscript">No scripts.</p></noscript></body></html>' })
const site = async () => (await built).files
/** A language's words, as a page fills them. @param {string} name @param {string} lang */
const words = async (name, lang) => /** @type {Record<string, any>} */ (await wordsOf(name, lang))
const said = (/** @type {string} */ text) => xml(fill(text, { name: BRAND.name, small: new Intl.NumberFormat('en').format(SMALL) }))

test('it is at /pricing in English, /fr/tarifs in French and /ko/pricing in Korean, only on jean.is, and the foot of every page and the site map lead to it', async () => {
  assert.deepEqual(page.addresses, { en: 'pricing', fr: 'fr/tarifs', ko: 'ko/pricing' })
  assert.ok(!page.ships)
  const files = await site()
  for (const path of ['pricing.html', 'fr/tarifs.html', 'ko/pricing.html', 'pricing.css']) assert.ok(files[path], path)
  assert.match(files['enterprise.html'], /<li><a href="help">Help center<\/a><\/li><li><a href="pricing">Pricing<\/a><\/li>/)
  assert.match(files['fr/entreprise.html'], /<li><a href="\.\.\/fr\/tarifs">Tarifs<\/a><\/li>/)
  assert.match(files['ko/enterprise.html'], /<li><a href="\.\.\/ko\/pricing">요금<\/a><\/li>/)
  assert.match(files['ja.html'], /<li><a href="pricing">料金<\/a><\/li>/, 'a language it isn’t in leads to its English')
  assert.match(files['site-map.html'], /<li><a href="pricing">Pricing<\/a><\/li>/)
  assert.match(files['pricing.html'], /<li><a href="pricing" aria-current="page">Pricing<\/a><\/li>/)
  assert.match(files['enterprise.html'], /<\/ul>\s*<p><a href="pricing">Pricing<\/a><\/p>\s*<p class="site-source">/, 'under the page for IT’s price cards')
  assert.match(files['fr/travail.html'], /<a href="\.\.\/fr\/tarifs">9\u202f900\u00a0€<\/a>/, 'from the price in the page for work’s answer')
  assert.match(files['ko/work.html'], /<a href="\.\.\/ko\/pricing">€9,900<\/a>/, 'in Korean too')
})

test('its top has one button, Open Jean, and its two prices lead to their parts, in each language’s own numbers', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = files[`${address}.html`].split('<main id="main">')[1]
    const top = html.split('</section>')[0]
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    assert.equal(top.match(/class="button/g)?.length, 1, `${lang}: one button at the top`)
    assert.match(top, /<a class="button primary" href="(\.\/|\.\.\/fr|\.\.\/ko)">/, `${lang}: it opens Jean`)
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

test('under what the price comes to per person stands a price per seat: the plan’s list price for a year, in each language’s own numbers, its words holding no figure', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = files[`${address}.html`]
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: SEAT.currency, maximumFractionDigits: 0 })
    const at = html.indexOf('<div class="pricing-seat">')
    const seat = html.slice(at, html.indexOf('<p class="site-source">', at))
    assert.ok(at > html.indexOf('class="site-stats"'), `${lang}: after the price per person`)
    assert.ok(seat.includes(`<b>${xml(money.format(SEAT.month * 12))}</b>`), `${lang}: twelve months of a seat`)
    assert.ok(seat.includes(xml(money.format(SEAT.month))) && seat.includes(SEAT.plan), `${lang}: the plan and its price a month`)
    const own = await words('pricing', lang)
    assert.ok(own['seat.note'].includes('{plan}') && own['seat.note'].includes('{month}') && !/\d/.test(own['seat.note'] + own['seat.at']), `${lang}: its words hold no figure`)
  }
  assert.ok(files['pricing.html'].includes('<b>$240</b>'), 'for the list price read on its maker’s page')
})

test('the price per seat names its maker’s page and the day it was read there, which has been', async () => {
  assert.match(SEAT.checked, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(Date.parse(`${SEAT.checked}T00:00:00Z`) <= Date.now(), 'read on a day that has been')
  assert.equal(new URL(SEAT.url).protocol, 'https:')
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    assert.match(files[`${address}.html`], new RegExp(`<p class="site-source">[^<]*<a href="${SEAT.url}">[^<]+</a>[^<]*<time datetime="${SEAT.checked}">[^<]+</time>`), lang)
  }
})

test('whoever hosts it for an organisation is shown the way to a key beside the one button, and again at the end', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = files[`${address}.html`]
    const ways = [...html.matchAll(/<(?:span|p) class="pricing-other">[^<]*<a href="([^"]+)">[^<]+<\/a>/g)]
    assert.equal(ways.length, 2, lang)
    for (const [, href] of ways) assert.ok(href.endsWith(key.addresses[lang]), `${lang}: ${href}`)
    assert.ok(ways[0].index < html.indexOf('class="site-facts') && ways[1].index > html.indexOf('id="pricing-turn"'), lang)
  }
})
