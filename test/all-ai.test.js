// SPDX-License-Identifier: MIT
// jean.is's page for every AI in one place: its one button opens Jean, each way in its table opens Jean on that way,
// it promises one AI at a time and never two answers side by side, the line under its thread's answers is the app's
// own, and it says the homepage's, the comparison hub's and the pricing page's words where it says the same. What
// every page of the site must be, test/site.test.js holds it to (D438).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BRAND } from '../app/brand.js'
import { PROVIDERS } from '../app/core/llm.js'
import page, { WAYS } from '../site/all-ai/page.js'
import { USES, appWords, buildSite, fill, wordsOf, xml } from '../site/site.js'

const BASE = 'https://jean.is/'
/** The site's files as build:web writes them for jean.is, with its homepage. */
const built = buildSite({ brand: BRAND, base: BASE, index: () => '<!doctype html><html lang="en" dir="ltr"><head></head><body><noscript><p class="noscript">No scripts.</p></noscript></body></html>' })
const site = async () => (await built).files
/** A language's words, as a page fills them. @param {string} name @param {string} lang */
const words = async (name, lang) => /** @type {Record<string, any>} */ (await wordsOf(name, lang))
const said = (/** @type {string} */ text) => xml(fill(text, { name: BRAND.name, zero: '€0' }))
/** A page's main part. @param {string} html */
const main = (html) => html.split('<main id="main">')[1].split('</main>')[0]

test('it is at /all-ai in English and /fr/toutes-les-ia in French, only on jean.is, first under Uses in every page’s foot, and in the site map', async () => {
  assert.deepEqual(page.addresses, { en: 'all-ai', fr: 'fr/toutes-les-ia' })
  assert.ok(!page.ships)
  assert.equal(USES[0], 'all-ai')
  const files = await site()
  for (const path of ['all-ai.html', 'fr/toutes-les-ia.html', 'all-ai.css']) assert.ok(files[path], path)
  assert.match(files['enterprise.html'], /<h2 class="site-foot-head">Uses<\/h2><ul>\s*<li><a href="all-ai">Every AI<\/a><\/li><li><a href="excel">/)
  assert.match(files['fr/entreprise.html'], /<li><a href="\.\.\/fr\/toutes-les-ia">Toutes les IA<\/a><\/li>/)
  assert.match(files['ja.html'], /<li><a href="all-ai">すべての AI<\/a><\/li>/, 'a language it isn’t in leads to its English')
  assert.match(files['site-map.html'], /<li><a href="all-ai">Every AI<\/a><\/li>/)
  assert.match(files['all-ai.html'], /<li><a href="all-ai" aria-current="page">Every AI<\/a><\/li>/)
})

test('the homepage’s act on any AI and the hub’s “You don’t have to choose” each lead to it, in the homepage’s words in their language', async () => {
  const files = await site()
  const arrow = ' <span class="flip-rtl" aria-hidden="true">→</span></a>'
  const act = (/** @type {string} */ html) => html.split('<section id="home-any"')[1].split('</section>')[0]
  const choose = (/** @type {string} */ html) => html.split('<section class="site-block" aria-labelledby="cmp-choose')[1].split('</header>')[0]
  assert.ok(act(files['index.html']).includes(`<a href="all-ai">Every AI in one place${arrow}<a href="compare">`), 'first, before the hub')
  assert.ok(act(files['fr.html']).includes(`<a href="fr/toutes-les-ia">Toutes les IA au même endroit${arrow}`))
  assert.ok(act(files['ja.html']).includes(`<a href="all-ai">${xml((await words('home', 'ja'))['any.all'])}${arrow}`), 'a language it isn’t in leads to its English')
  assert.ok(choose(files['compare.html']).includes(`<a href="all-ai">Every AI in one place${arrow}`))
  assert.ok(choose(files['fr/comparer.html']).includes(`<a href="../fr/toutes-les-ia">Toutes les IA au même endroit${arrow}`))
  assert.ok(choose(files['ko/compare.html']).includes(`<a href="../all-ai">${xml((await words('home', 'ko'))['any.all'])}${arrow}`))
})

test('its top has one button, Open Jean, its promise is its three acts with what is never lost underlined, and the chip that picks the AI is circled', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = main(files[`${address}.html`])
    const top = html.split('</section>')[0]
    const own = await words('all-ai', lang)
    assert.equal(top.match(/class="button/g)?.length, 1, `${lang}: one button at the top`)
    assert.match(top, /<a class="button primary" href="(\.\/|\.\.\/fr)">/, `${lang}: it opens Jean`)
    assert.ok(top.includes(`<span class="felt is-under">${xml(own['h1.mark'])}<svg class="felt-under"`), `${lang}: ${own['h1.mark']}`)
    assert.match(top, /<span class="felt is-circle"><b class="allai-chip">/, `${lang}: the chip, circled`)
    assert.deepEqual([...html.matchAll(/<section id="(allai-[a-z]+)" class="site-act/g)].map(([, id]) => id), ['allai-place', 'allai-switch', 'allai-free'], lang)
  }
})

test('each way in its table opens Jean on that way, one Settings › Brains has, and Your turn’s other link on a plan', async () => {
  const known = /const WAYS = \[([^\]]*)\]/.exec(await readFile(new URL('../app/ui/brain-pages.js', import.meta.url), 'utf8'))?.[1].match(/[\w-]+/g)
  for (const way of WAYS) assert.ok(known?.includes(way), `${way} is a way of ui/brain-pages.js`)
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = main(files[`${address}.html`])
    const start = lang === 'en' ? './' : '../fr'
    assert.deepEqual([...html.matchAll(/<td class="allai-go"><a href="([^"]+)">/g)].map(([, href]) => href), WAYS.map((way) => `${start}?brain=${way}`), lang)
    assert.match(html, new RegExp(`<p class="allai-other">[^<]*<a href="${start.replace(/\./g, '\\.')}\\?brain=chatgpt">`), `${lang}: Your turn’s other link`)
  }
})

test('it promises one AI at a time, never two answers side by side, in the second act’s catch and the first question, and keeps Jean’s vocabulary', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = main(files[`${address}.html`])
    const own = await words('all-ai', lang)
    const second = html.split('<section id="allai-switch"')[1].split('<section id="allai-free"')[0]
    assert.ok(second.includes(`<li>${said(own['switch.limits'][0])}</li>`), `${lang}: the second act’s catch`)
    assert.match(html, new RegExp(`<details name="allai-questions" open><summary><span>${xml(own['faq.items'][0][0]).replace(/[?]/g, '\\?')}</span>`), `${lang}: the first question, open`)
    const text = html.replace(/<[^>]+>/g, ' ')
    assert.doesNotMatch(text, /\b(agents?|models?|MCP|tokens?)\b/i, lang)
  }
  const en = await words('all-ai', 'en')
  assert.match(en['switch.limits'][0], /^One AI answers at a time\./)
  assert.match(en['faq.items'][0][1], /one AI answers at a time/)
})

test('it says the homepage’s, the comparison hub’s and the pricing page’s words where it says the same', async () => {
  const html = main((await site())['all-ai.html'])
  const [home, hub, pricing] = await Promise.all([words('home', 'en'), words('compare', 'en'), words('pricing', 'en')])
  for (const line of home['any.catch']) assert.ok(html.includes(`<li>${said(line)}</li>`), line)
  for (const way of [home['any.ways'][2], home['any.ways'][0], hub['choose.cards'][3][0], hub['choose.cards'][2][0]]) assert.ok(html.includes(`</svg>${said(way)}</span><span class="allai-which">`), way)
  for (const head of pricing['ways.heads']) assert.ok(html.includes(`<th scope="col">${said(head)}</th>`), head)
  for (const [pay, need] of pricing['ways.rows'].slice(0, 3)) assert.ok(html.includes(`<td class="allai-pay" data-label="You pay">${said(pay)}</td><td class="allai-need" data-label="You need">${said(need)}</td>`), need)
  assert.ok(html.includes(`<p class="allai-said">${said(hub['try.ask'])}</p>`), 'the hub’s holiday request')
  assert.ok(html.includes(`<li>${said(hub['catch.items'][3])}</li>`), 'the hub’s catch on the browser’s data')
  assert.ok(html.includes(`<li>${said(pricing['ways.limit'])}</li>`), 'the pricing page’s daily limit')
  assert.ok(html.includes(`<h4><span class="felt is-strike">${said(pricing['sale.items'][2][0])}`) && html.includes(`<p>${said(pricing['sale.items'][2][1])}</p>`), 'the pricing page’s place in the list')
  assert.ok(html.includes(`<span>${said(home['keep.history.text'])}</span>`), 'the homepage’s history')
})

test('under each answer of its thread is the app’s own line, naming who answered as the app does, and the bars are to scale', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = main(files[`${address}.html`])
    const app = await appWords(lang)
    for (const brain of [app['provider.device'], `${app['provider.claudecode']} · ${PROVIDERS.claudecode.defaultModel}`]) {
      assert.ok(html.includes(`</svg>${xml(fill(app['activity.answeredWith'], { brain }))}</p>`), `${lang}: ${brain}`)
    }
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    assert.deepEqual([...html.matchAll(/<rect height="100%" width="([\d.]+%)"/g)].map(([, width]) => width), ['100.0%', '25.0%', '16.7%', '8.0%'], lang)
    assert.ok(html.includes(`<b>${xml(money.format(1200))}</b>`) && html.includes(`<b>${xml(money.format(96))}</b>`), `${lang}: the sums, in its own numbers`)
  }
})
