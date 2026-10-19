// jean.is's page under the app's first screen (D397): only the brand's own site has it, in each language
// with words, as static HTML that the policy runs as it is, and its words stay true to the app. What every page of
// the site must be, this one included, test/site.test.js holds it to (D438).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BRAND } from '../app/brand.js'
import { inLanguage, sampleAnswer, savingsAnswer, withHome } from '../site/home/page.js'
import { buildSite, ownSite } from '../site/site.js'
import { siteFiles, titleOf, withSite } from '../scripts/seo.js'

const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
const description = /<meta name="description" content="([^"]*)">/.exec(index)?.[1] ?? ''
const BASE = 'https://jean.is/'
/** The site's files as build:web writes them for jean.is. */
const site = async () => (await buildSite({ brand: BRAND, base: BASE, index: (said, address) => withSite(said ? inLanguage(index, said) : index, BASE, BRAND, said ?? description, ['ar', 'en', 'fr', 'ja'], address) })).files
/** Each language's page, the part index.html ends with. */
const pages = async () => Object.entries(await site()).filter(([path]) => /^(index|ar|fr|ja)\.html$/.test(path)).map(([path, html]) => [path === 'index.html' ? 'en' : path.slice(0, -'.html'.length), html.slice(html.indexOf('<div class="home"'), html.lastIndexOf('</body>'))])

test('only the brand’s own site has the page, never an organisation’s copy', () => {
  assert.equal(ownSite('https://jean.is/', BRAND), true)
  for (const base of ['https://jean.example/', 'https://intranet.example.org/jean/', 'https://www.jean.is/', 'http://127.0.0.1:4180/']) assert.equal(ownSite(base, BRAND), false, base)
})

test('the page never says agent, model, MCP or token, never promises a tutor, and runs as written under the policy', async () => {
  const all = await pages()
  assert.deepEqual(all.map(([lang]) => lang).sort(), ['ar', 'en', 'fr', 'ja'])
  for (const [lang, page] of all) {
    const text = page.replace(/<[^>]+>/g, ' ')
    assert.doesNotMatch(text, /\b(agents?|models?|MCP|tokens?|tutors?)\b/i, lang)
    assert.doesNotMatch(page, /\sstyle=|<script|\son[a-z]+=/i, lang)
    assert.doesNotMatch(page, /\{\w+\}/, `${lang}: every {param} is filled`)
    assert.equal(page.match(/data-try="/g)?.length, 24, `${lang}: twelve tiles and their replays try an idea`)
    assert.equal(page.match(/class="home-replay" data-replay="/g)?.length, 12, `${lang}: a replay for each tile`)
    assert.equal(page.match(/ inert>/g)?.length, 11, `${lang}: the first tile's replay shown, the others not`)
    for (const group of ['home', 'family', 'work']) assert.equal(page.match(new RegExp(`data-for="${group}"`, 'g'))?.length, 4, `${lang}: four tiles ${group}`)
    assert.ok(page.startsWith(`<div class="home" lang="${lang}"`), lang)
    assert.equal(page.match(/<h1[ >]/g)?.length, 1, `${lang}: one heading of its own`)
    assert.ok(page.indexOf('<h1') < page.indexOf('class="home-strip"'), `${lang}: at the top`)
    assert.ok(page.includes('<footer class="site-foot">'), `${lang}: the site’s foot`)
  }
})

test('the sample’s tile and replay say what the sample spreadsheet holds', async () => {
  const sample = await sampleAnswer()
  assert.deepEqual([sample.products, sample.months], [4, 12], 'replay.sample says 4 products over 12 months, in every language')
  assert.deepEqual(savingsAnswer(), { total: 29450, put: 24000 }, 'replay.savings says what 200 a month at 4% comes to in ten years')
  assert.equal(sample.product, 'Juice')
  assert.ok(sample.growth > 1.6 && sample.growth < 1.7)
  const page = (await site())['index.html']
  assert.match(page, /<bdi>Juice<\/bdi> grew the most: \+169%/)
  assert.match(page, /About 29,450 after ten years, 24,000 of it put in/)
  assert.match(page, /“<span class="home-request">Which product grew the most over the year\? Show it as a chart\.<\/span>”/)
})

test('jean.is’s index.html has the page after the app’s root, and each other language its own page at its own address', async () => {
  const files = await site()
  assert.deepEqual(Object.keys(files).filter((path) => /^(index|ar|fr|ja)\.html$|^(home|site)\.css$/.test(path)).sort(), ['ar.html', 'fr.html', 'home.css', 'index.html', 'ja.html', 'site.css'])
  const root = files['index.html']
  assert.match(root, /<html lang="en" dir="ltr"/)
  assert.doesNotMatch(root, /app-language/)
  assert.ok(root.indexOf('<div class="home" lang="en"') > root.indexOf('<body>') && root.indexOf('<div class="home"') < root.indexOf('</body>'))
  assert.ok(root.indexOf('href="ui/style.css"') < root.indexOf('href="site.css"') && root.indexOf('href="site.css"') < root.indexOf('href="home.css"'), 'the app’s style sheet, the site’s, then the page’s')
  for (const html of ['index.html', 'ar.html', 'fr.html', 'ja.html'].map((path) => files[path])) {
    for (const [lang, address] of [['en', BASE], ['ar', `${BASE}ar`], ['fr', `${BASE}fr`], ['ja', `${BASE}ja`], ['x-default', BASE]]) assert.match(html, new RegExp(`<link rel="alternate" hreflang="${lang}" href="${address}">`))
    assert.equal(html.match(/class="home"/g)?.length, 1)
    // Its one heading before the app's greeting is drawn, the promise its title makes after the name.
    assert.deepEqual(html.match(/<h1[ >].*<\/h1>/g)?.map((h1) => h1.replace(/<[^>]+>/g, '')), [new RegExp(`<title>${BRAND.name} · (.*)</title>`).exec(html)?.[1]])
  }
  const ja = files['ja.html']
  assert.match(ja, /<html lang="ja" dir="ltr"/)
  assert.match(ja, /<meta name="app-language" content="ja">/)
  assert.match(ja, /<link rel="canonical" href="https:\/\/jean\.is\/ja">/)
  assert.match(ja, /<meta property="og:url" content="https:\/\/jean\.is\/ja">/)
  assert.match(ja, /<title>Jean · みんなのAIを、ブラウザのタブで<\/title>/)
  assert.match(ja, /<p class="noscript">このアシスタントはブラウザの中だけで動き、JavaScriptが必要です。<\/p>/, 'what it says without scripts, in its language')
  // Its menu lists every language the app speaks, as Settings' does, the page's chosen.
  assert.equal(ja.match(/<option value="[\w-]+" lang="[\w-]+"/g)?.length, 33)
  assert.match(ja, /<option value="ja" lang="ja" selected>日本語<\/option>/)
  assert.match(files['fr.html'], /<title>Jean · L’IA pour tous, dans un onglet du navigateur<\/title>/)
  assert.match(files['ar.html'], /<html lang="ar" dir="rtl"/)
  assert.throws(() => withHome(root, '', { lang: 'en', dir: 'ltr', own: false, languages: [], noscript: '' }), /already/)
  assert.match(siteFiles(BASE, [`${BASE}ar`, `${BASE}ja`])['sitemap.xml'], /<loc>https:\/\/jean\.is\/<\/loc><\/url>\n {2}<url><loc>https:\/\/jean\.is\/ar<\/loc><\/url>\n {2}<url><loc>https:\/\/jean\.is\/ja<\/loc>/)
})

test('a title is the description’s first sentence, in any script', () => {
  assert.equal(titleOf(BRAND, 'みんなのAIを、ブラウザのタブで。言葉やファイルで頼むと…'), 'Jean · みんなのAIを、ブラウザのタブで')
  assert.equal(titleOf(BRAND, 'Runs on Node.js in a tab. Nothing to install.'), 'Jean · Runs on Node.js in a tab')
})
