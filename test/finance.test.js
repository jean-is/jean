// SPDX-License-Identifier: MIT
// jean.is's page for banks, insurers and asset managers, the page for IT's sibling (D428): it leads to a trial key and
// to the risk committee, shows one price per firm at every size beside its cost per person, circles what of the
// firm's data the vendor holds in its DORA register entry, and marks each answer with a status the style sheet draws.
// What every page of the site must be, test/site.test.js holds it to (D438).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BRAND } from '../app/brand.js'
import { PRICE, SMALL, STATUSES } from '../site/enterprise/page.js'
import page from '../site/finance/page.js'
import { buildSite, wordsOf } from '../site/site.js'

const BASE = 'https://jean.is/'
/** The site's files as build:web writes them for jean.is, with its homepage. */
const built = buildSite({ brand: BRAND, base: BASE, index: () => '<!doctype html><html lang="en" dir="ltr"><head></head><body><noscript><p class="noscript">No scripts.</p></noscript></body></html>' })
const site = async () => (await built).files
/** What a page's main part says, without its tags. @param {string} html */
const said = (html) => (/<main id="main">([\s\S]*)<\/main>/.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, ' ')

test('it is at /finance in English and /fr/finance in French, and the foot of every page leads to it', async () => {
  assert.deepEqual(page.addresses, { en: 'finance', fr: 'fr/finance' })
  const files = await site()
  for (const path of ['finance.html', 'fr/finance.html', 'finance.css']) assert.ok(files[path], path)
  assert.match(files['enterprise.html'], /<li><a href="finance">Banks and insurers<\/a><\/li>/)
  assert.match(files['fr/entreprise.html'], /<li><a href="\.\.\/fr\/finance">Banques et assurances<\/a><\/li>/)
})

test('its one button asks for a trial key, and its end sends the page’s address to the risk committee', async () => {
  const files = await site()
  for (const address of Object.values(page.addresses)) {
    const html = files[`${address}.html`].split('<main id="main">')[1]
    const top = html.split('</section>')[0]
    assert.equal(top.match(/class="button/g)?.length, 1, `${address}: one button at the top`)
    assert.match(top, /class="button primary" href="(\.\.\/)?(fr\/entreprise\/cle|enterprise\/key)#trial"/, `${address}: it asks for a trial key`)
    assert.match(top, /<a href="#fin-share">/, `${address}: then the way to share it`)
    assert.match(html, /href="mailto:\?subject=[^"]+&amp;body=[^"]*jean\.is%2F(fr%2F)?finance/, `${address}: the committee is sent the page’s address`)
  }
})

test('one price for the firm at every size, its cost per person in each language’s own numbers, and free under the threshold', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const table = /<table class="fin-price">([\s\S]*?)<\/table>/.exec(files[`${address}.html`])?.[1] ?? ''
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    const cents = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const words = /** @type {Record<string, string>} */ (await wordsOf('finance', lang))
    assert.ok(table.includes(words['price.small'].replace('{small}', new Intl.NumberFormat(lang).format(SMALL))), `${lang}: free under ${SMALL} people`)
    assert.equal(table.split(money.format(PRICE)).length - 1, 3, `${lang}: the same price at each size`)
    for (const size of [1000, 5000, 20000]) assert.ok(table.includes(cents.format(PRICE / size)), `${lang}: ${size} people`)
  }
})

test('the register entry circles what of the firm’s data the vendor hosts, and every answer has a status the style sheet draws', async () => {
  const css = await readFile(new URL('../site/finance/finance.css', import.meta.url), 'utf8')
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = files[`${address}.html`]
    const [, none] = /** @type {string[][]} */ ((await wordsOf('finance', lang))?.['register.rows'])[2]
    assert.match(html, new RegExp(`<dd><span class="felt is-circle">${none}<svg`), `${lang}: ${none}`)
    const statuses = [...html.matchAll(/class="fin-status is-(\w+)"/g)].map(([, status]) => status)
    assert.equal(statuses.length, 12, `${lang}: twelve answers`)
    for (const status of statuses) assert.ok(STATUSES.includes(status) && css.includes(`.fin-status.is-${status}`), `${lang}: ${status}`)
  }
})

test('it never says agent, MCP or token, and names no product it compares itself with', async () => {
  const files = await site()
  for (const address of Object.values(page.addresses)) {
    const text = said(files[`${address}.html`])
    assert.doesNotMatch(text, /\b(agents?|MCP|tokens?)\b/i, address)
    assert.doesNotMatch(text, /\b(ChatGPT|Claude|Gemini)\b/, address)
  }
})
