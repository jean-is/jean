// jean.is's page for IT (D428): it tells an organisation that any provider and any model do, that each request goes
// to the least costly of them, how it deploys Jean, answers each role in the group that decides with a status, and
// prices per organisation. What every page of the site must be, test/site.test.js holds it to (D438).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BRAND } from '../app/brand.js'
import { SIZES } from '../app/ui/caps.js'
import page, { CONTACT, PRICE, ROLES, SMALL, STATUSES } from '../site/enterprise/page.js'
import { buildSite, wordsOf } from '../site/site.js'

const BASE = 'https://jean.is/'
/** The site's files as build:web writes them for jean.is, with its homepage. */
const built = buildSite({ brand: BRAND, base: BASE, index: () => '<!doctype html><html lang="en" dir="ltr"><head></head><body><noscript><p class="noscript">No scripts.</p></noscript></body></html>' })
const site = async () => (await built).files
const style = () => readFile(new URL('../site/enterprise/enterprise.css', import.meta.url), 'utf8')

test('it is at /enterprise in English, /fr/entreprise in French and /ko/enterprise in Korean', async () => {
  assert.deepEqual(page.addresses, { en: 'enterprise', fr: 'fr/entreprise', ko: 'ko/enterprise' })
  const files = await site()
  for (const path of ['enterprise.html', 'fr/entreprise.html', 'ko/enterprise.html', 'enterprise.css']) assert.ok(files[path], path)
})

test('its promise is said part by part, every limit once under the part it is about, then Your turn, and the questions last', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const words = /** @type {Record<string, string[][]>} */ (await wordsOf('enterprise', lang))
    const html = files[`${address}.html`]
    assert.deepEqual([...html.matchAll(/<section id="ent-(\w+)" class="site-act /g)].map(([, name]) => name), words.acts.map(([name]) => name), `${lang}: an act for each part, in the order it says them`)
    const limits = [...html.matchAll(/<(p|div) class="site-catch">([\s\S]*?)<\/\1>/g)].flatMap(([, tag, inside]) => (tag === 'p' ? [inside] : inside.match(/<li>/g) ?? []))
    assert.equal(limits.length, words['limits.approved'].length + words['limits.used'].length, `${lang}: every limit, once`)
    const [act, turn, questions] = [html.lastIndexOf('class="site-act '), html.indexOf('<section id="ent-share" class="site-section site-end site-yours"'), html.indexOf('<h2 id="ent-faq"')]
    assert.ok(act > 0 && act < turn && turn < questions && !html.includes('<section', questions), `${lang}: the acts, Your turn, then the questions`)
  }
})

test('it names Auto’s three levels as the app does, the least costly first, and says why each request got its own', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const app = Object.assign({}, ...await Promise.all(['', 'dialogs/'].map(async (part) => JSON.parse(await readFile(new URL(`../app/locales/${part}${lang}.json`, import.meta.url), 'utf8')))))
    const words = /** @type {Record<string, string[]>} */ (await wordsOf('enterprise', lang))
    const html = files[`${address}.html`]
    const [any, cost] = ['ent-any', 'ent-cost'].map((id) => html.slice(html.indexOf(`aria-labelledby="${id}`), html.indexOf('</section>', html.indexOf(`aria-labelledby="${id}`))))
    const levels = ['fast', 'smart', 'best'].map((level) => app[`picker.${level}`])
    for (const part of [any, cost]) assert.deepEqual([...part.matchAll(/<\/span><\/span>([^<]+)</g)].map(([, name]) => name), levels, `${lang}: Fast, Smart, Best, in the app's words`)
    assert.deepEqual([...cost.matchAll(/class="is-on"/g)].length, 1 + 2 + 3, `${lang}: one coin, two, then three`)
    words['cost.asks'].forEach((ask, i) => assert.ok(cost.indexOf(ask) < cost.indexOf(app[`auto.demand.${i}`]) && cost.includes(app[`auto.demand.${i}`]), `${lang}: “${ask}”, then why its level was chosen`))
    assert.ok(/** @type {string} */ (/** @type {unknown} */ (words['cost.why'])).includes(app['cap.reflexes.name']), `${lang}: what weighs a request is named as Settings names it`)
    assert.ok(any.includes(app['policy.locked']), `${lang}: the levels are the organisation's to set`)
    assert.ok(html.includes(new Intl.NumberFormat(lang, { style: 'unit', unit: 'megabyte' }).format(SIZES.reflexes / 1e6)), `${lang}: its download, the size the app says`)
  }
})

test('every role has its answers, each with a status the style sheet draws, and a panel the style sheet shows', async () => {
  const css = await style()
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const words = /** @type {Record<string, string[][]>} */ (await wordsOf('enterprise', lang))
    const html = files[`${address}.html`]
    for (const [id] of words.roles) {
      assert.ok(ROLES.includes(id), `${lang}: ${id}`)
      assert.ok(css.includes(`#ent-role-${id}:checked ~ .ent-panels #ent-panel-${id}`), `${id}: the style sheet shows its panel`)
      assert.match(html, new RegExp(`<input type="radio" name="ent-role" id="ent-role-${id}"`))
      const answers = words[`answers.${id}`]
      assert.ok(answers.length >= 3, `${lang}: ${id} has answers`)
      for (const [, , status] of answers) assert.ok(STATUSES.includes(status) && css.includes(`.ent-status.is-${status}`), `${lang}: ${id}: ${status}`)
    }
    assert.equal(html.match(/<input type="radio" name="ent-role"[^>]* checked>/g)?.length, 1, 'one role shown at first')
  }
})

test('it prices per organisation in each language’s own numbers, never per seat, and says where to write', async () => {
  const files = await site()
  for (const [lang, address] of Object.entries(page.addresses)) {
    const html = files[`${address}.html`]
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    assert.ok(html.includes(money.format(PRICE)), `${lang}: ${PRICE} a year`)
    assert.ok(html.includes(new Intl.NumberFormat(lang).format(SMALL)), `${lang}: free under ${SMALL} people`)
    assert.ok(html.includes(`href="mailto:${CONTACT}"`), `${lang}: the contact`)
  }
  assert.ok(PRICE * 4 < 60_000, 'four years of the price stay under France’s threshold for buying without a tender')
})

test('the homepage’s way to the IT page leads to it, in each language', async () => {
  const files = await site()
  for (const [path, html] of Object.entries(files)) {
    if (!/^(index|ar|br|co|da|de|es|fi|fr|fr-CA|ha|hu|id|it|ja|ko|ms|nl|pl|pt|ro|tl|zh-Hans|zh-Hant)\.html$/.test(path)) continue
    const lang = path === 'index.html' ? 'en' : path.slice(0, -'.html'.length)
    const address = page.addresses[lang] ?? page.addresses.en
    assert.ok(html.includes(`href="${address}"`), `${path}: links ${address}`)
  }
})
