// jean.is's page for IT (D428): a page of its own in each language with words, English's at the root and the
// others under their language's folder, which tells an organisation how it deploys Jean, answers each role in
// the group that decides with a status, prices per organisation, and runs nothing but the theme script.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { BRAND } from '../app/brand.js'
import { ADDRESSES, BANDS, CONTACT, SMALL, enterpriseAddress, enterpriseFiles, enterpriseLanguages, enterpriseStyle, enterpriseWords } from '../scripts/enterprise.js'
import { theme } from '../scripts/family.js'
import { homeFiles } from '../scripts/home.js'

const BASE = 'https://jean.is/'

test('each language with words has a page at its address, English first', async () => {
  assert.deepEqual(await enterpriseLanguages(), ['en', 'fr'])
  assert.deepEqual(Object.keys(await enterpriseFiles(BASE, BRAND)).sort(), ['enterprise.css', 'enterprise.html', 'fr/entreprise.html'])
  assert.equal(enterpriseAddress('fr'), 'fr/entreprise')
  assert.equal(enterpriseAddress('ja'), 'enterprise', 'a language without a page links English’s')
})

test('every language’s words have English’s, each of the same kind and with the same {params}', async () => {
  const english = await enterpriseWords('en')
  const shape = (/** @type {unknown} */ value) => Array.isArray(value) ? `list of ${value.length}${Array.isArray(value[0]) ? ` of ${value[0].length}` : ''}` : typeof value
  const params = (/** @type {unknown} */ value) => [...new Set(JSON.stringify(value).match(/\{\w+\}/g) ?? [])].sort().join()
  for (const lang of (await enterpriseLanguages()).slice(1)) {
    const words = await enterpriseWords(lang)
    assert.deepEqual(Object.keys(words).sort(), Object.keys(english).sort(), lang)
    for (const [key, value] of Object.entries(english)) {
      assert.equal(shape(words[key]), shape(value), `${lang}: ${key}`)
      assert.equal(params(words[key]), params(value), `${lang}: ${key}`)
    }
  }
})

test('the page says what a search engine and a shared link read, and names its other languages', async () => {
  const files = await enterpriseFiles(BASE, BRAND)
  for (const [lang, address] of Object.entries(ADDRESSES)) {
    const page = files[`${address}.html`]
    assert.match(page, new RegExp(`<html lang="${lang}" dir="ltr">`))
    assert.match(page, new RegExp(`<link rel="canonical" href="${BASE}${address}">`))
    assert.match(page, new RegExp(`<meta property="og:url" content="${BASE}${address}">`))
    for (const [other, there] of Object.entries(ADDRESSES)) assert.match(page, new RegExp(`<link rel="alternate" hreflang="${other}" href="${BASE}${there}">`))
    assert.match(page, new RegExp(`<link rel="alternate" hreflang="x-default" href="${BASE}enterprise">`))
    assert.match(page, /<meta name="description" content="[^"]{80,}">/)
    assert.doesNotMatch(page, /noindex/)
    assert.doesNotMatch(page.replace(/<script>[^<]*<\/script>/, ''), /\{\w+\}/, 'every {param} filled')
  }
})

test('its policy runs the theme script and nothing else, with no style but the site’s own sheets', async () => {
  const { script } = await theme()
  const files = await enterpriseFiles(BASE, BRAND)
  for (const address of Object.values(ADDRESSES)) {
    const page = files[`${address}.html`]
    const ran = /<script>([^<]*)<\/script>/.exec(page)?.[1] ?? ''
    const up = '../'.repeat(address.split('/').length - 1)
    assert.equal(ran, script.replace('href: `ui/looks/', `href: \`${up}ui/looks/`), `${address}: the app’s theme script, its looks named from the site’s root`)
    const hash = `'sha256-${createHash('sha256').update(ran).digest('base64')}'`
    assert.match(page, new RegExp(`script-src ${hash.replace(/[+/]/g, '\\$&')};`))
    assert.equal(page.match(/<script\b/g)?.length, 1, 'one script, the theme’s')
    assert.doesNotMatch(page, /\sstyle="|<style\b|\son\w+=/, 'no inline style or handler for the policy to refuse')
    assert.match(page, /style-src 'self';/)
  }
})

test('a page under a language’s folder reaches the site’s own files one folder up', async () => {
  const files = await enterpriseFiles(BASE, BRAND)
  const english = files['enterprise.html']
  const french = files['fr/entreprise.html']
  for (const sheet of ['ui/style.css', 'enterprise.css']) {
    assert.match(english, new RegExp(`<link rel="stylesheet" href="${sheet}">`))
    assert.match(french, new RegExp(`<link rel="stylesheet" href="\\.\\./${sheet}">`))
  }
  assert.match(english, /<a class="wordmark" href="\.\/">/)
  assert.match(french, /<a class="wordmark" href="\.\.\/fr">/, 'the app in French')
  assert.match(french, /<a href="\.\.\/enterprise" hreflang="en"/)
  assert.match(english, /<a href="fr\/entreprise" hreflang="fr"/)
  assert.doesNotMatch(french, /href="(?!\.\.\/|https?:|mailto:|#)[^"]+"/, 'every relative link climbs out of fr/')
})

test('every role has its answers, each with a status the style sheet draws, and a panel the style sheet shows', async () => {
  const css = await enterpriseStyle()
  const files = await enterpriseFiles(BASE, BRAND)
  for (const lang of await enterpriseLanguages()) {
    const words = await enterpriseWords(lang)
    const page = files[`${ADDRESSES[lang]}.html`]
    for (const [id] of /** @type {string[][]} */ (words.roles)) {
      assert.ok(css.includes(`#ent-role-${id}:checked ~ .ent-panels #ent-panel-${id}`), `${id}: the style sheet shows its panel`)
      assert.match(page, new RegExp(`<input type="radio" name="ent-role" id="ent-role-${id}"`))
      const answers = /** @type {string[][]} */ (words[`answers.${id}`])
      assert.ok(answers.length >= 3, `${lang}: ${id} has answers`)
      for (const [, , status] of answers) assert.ok(['built', 'key', 'design', 'not'].includes(status), `${lang}: ${id}: ${status}`)
    }
    assert.equal(page.match(/<input type="radio" name="ent-role"[^>]* checked>/g)?.length, 1, 'one role shown at first')
  }
})

test('it prices per organisation in each language’s own numbers, never per seat, and says where to write', async () => {
  const files = await enterpriseFiles(BASE, BRAND)
  for (const lang of await enterpriseLanguages()) {
    const page = files[`${ADDRESSES[lang]}.html`]
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    for (const band of BANDS) {
      assert.ok(page.includes(`<td>${money.format(band.price)}</td>`), `${lang}: ${band.price}`)
      assert.ok(page.includes(new Intl.NumberFormat(lang).format(band.people)), `${lang}: up to ${band.people}`)
    }
    assert.ok(page.includes(new Intl.NumberFormat(lang).format(SMALL)), `${lang}: free up to ${SMALL}`)
    assert.ok(page.includes(`href="mailto:${CONTACT}"`), `${lang}: the contact`)
  }
  assert.ok(BANDS.every((band) => band.price * 3 < 60_000), 'three years of any band stay under France’s threshold for buying without a tender')
})

test('the homepage’s way to the IT page leads to it, in each language', async () => {
  const shell = '<!doctype html><html lang="en" dir="ltr"><head></head><body><main></main></body></html>'
  const files = await homeFiles(BASE, BRAND, () => shell)
  for (const [path, page] of Object.entries(files)) {
    if (!path.endsWith('.html')) continue
    const lang = path === 'index.html' ? 'en' : path.slice(0, -'.html'.length)
    assert.ok(page.includes(`href="${enterpriseAddress(lang)}"`), `${path}: links ${enterpriseAddress(lang)}`)
    assert.doesNotMatch(page, /href="it"/, `${path}: no link to a page that doesn’t exist`)
  }
})
