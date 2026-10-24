// jean.is's page under the app's first screen (D397): only the brand's own site has it, in each language
// with words, as static HTML that the policy runs as it is, and its words stay true to the app. What every page of
// the site must be, this one included, test/site.test.js holds it to (D438).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BRAND, PAGES } from '../app/brand.js'
import { inLanguage, sampleAnswer, savingsAnswer, withHome } from '../site/home/page.js'
import { REPOSITORY, buildSite, ownSite, sitePages } from '../site/site.js'
import { listedPages, siteFiles, titleOf, withSite } from '../scripts/seo.js'

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
    assert.equal(page.match(/data-try="/g)?.length, 12, `${lang}: each of the twelve tiles tries an idea, its replay showing how`)
    assert.equal(page.match(/class="home-replay" data-replay="/g)?.length, 12, `${lang}: a replay for each tile`)
    assert.equal(page.match(/ inert>/g)?.length, 11, `${lang}: the first tile's replay shown, the others not`)
    for (const group of ['home', 'family', 'work']) assert.equal(page.match(new RegExp(`data-for="${group}"`, 'g'))?.length, 4, `${lang}: four tiles ${group}`)
    assert.ok(page.startsWith(/* html */ `<div class="home" lang="${lang}"`), lang)
    assert.equal(page.match(/<h1[ >]/g)?.length, 1, `${lang}: one heading of its own`)
    assert.ok(page.indexOf('<h1') < page.indexOf('class="home-strip"'), `${lang}: at the top`)
    assert.ok(page.includes('<footer class="site-foot">'), `${lang}: the site’s foot`)
  }
})

test('About Jean is the page’s sections on a page of their own in each of its languages, with the site’s top and foot, its script the tiles’ as the app has them, and the app links it and the pages to show Jean with where they are (D538)', async () => {
  const files = await site()
  const pages = await sitePages()
  for (const [name, addresses] of Object.entries(PAGES)) assert.deepEqual(addresses, pages.get(name)?.addresses, `app/brand.js’s PAGES.${name} is site/${name}/’s`)
  assert.deepEqual(Object.keys(PAGES.about).sort(), Object.keys(pages.get('home')?.addresses ?? {}).sort(), 'About Jean is in each of the homepage’s languages')
  const tiles = await readFile(new URL('../app/ui/tiles.js', import.meta.url), 'utf8')
  for (const [lang, address] of Object.entries(PAGES.about)) {
    const html = files[`${address}.html`]
    const home = html.slice(html.indexOf('<div class="home"'), html.indexOf('<p class="home-sent"'))
    assert.ok(html.indexOf('<header class="site-top">') < html.indexOf('<div class="home"') && html.indexOf('<p class="home-sent"') < html.indexOf('<footer class="site-foot">'), `${lang}: the site’s top, the sections, the site’s foot`)
    assert.equal(html.match(/<footer /g)?.length, 1, `${lang}: one foot, the site’s`)
    assert.equal(home.match(/data-try="/g)?.length, 12, `${lang}: the twelve tiles`)
    assert.equal(html.match(/<h1[ >]/g)?.length, 1, `${lang}: the promise its one heading`)
    assert.match(html, new RegExp(`<link rel="canonical" href="${BASE}${address}">`))
    assert.match(html, /<link rel="stylesheet" href="(\.\.\/)?home\.css">/, `${lang}: the homepage’s look`)
    assert.ok(html.includes(tiles.replace(/^export /gm, '')), `${lang}: the tiles work as the app has them`)
  }
  assert.match(files['fr/jean.html'], /<a class="button" href="\.\.\/fr">Ouvrir Jean<\/a>/, 'Open Jean is the app in that language')
  assert.match(files['fr/jean.html'], /<p class="home-sent" role="status" hidden>Votre demande vous attend dans Jean, dans l’onglet d’où vous venez\.<\/p>/)
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
  assert.match(ja, /<title>Jean · 好きなAIでつくって、ぜんぶ手元に<\/title>/)
  assert.match(ja, /<p class="noscript">このアシスタントはブラウザの中だけで動き、JavaScriptが必要です。<\/p>/, 'what it says without scripts, in its language')
  // Its menu lists every language the app speaks, as Settings' does, the page's chosen.
  assert.equal(ja.match(/<option value="[\w-]+" lang="[\w-]+"/g)?.length, 46)
  assert.match(ja, /<option value="ja" lang="ja" selected>日本語<\/option>/)
  assert.match(files['fr.html'], /<title>Jean · Créez avec l’IA de votre choix, gardez tout<\/title>/)
  assert.match(files['ar.html'], /<html lang="ar" dir="rtl"/)
  assert.throws(() => withHome(root, '', { lang: 'en', dir: 'ltr', own: false, languages: [], noscript: '' }), /already/)
})

test('jean.is’s sitemap lists every page of the site in each of its languages, whose language versions name each other (D431)', async () => {
  const pages = Object.fromEntries(Object.entries(await site()).filter(([path]) => path.endsWith('.html')))
  const listed = listedPages(BASE, pages)
  assert.deepEqual([...listed.keys()], ['', 'ar', 'ar/jean', 'charter', 'compare', 'compare/chatgpt', 'compare/claude-cowork', 'compare/open-webui', 'compare/openclaw', 'enterprise', 'enterprise/key', 'excel', 'family', 'files', 'fr', 'fr/associations', 'fr/charte-ia', 'fr/comparer',
    'fr/comparer/chatgpt', 'fr/comparer/claude-cowork', 'fr/comparer/open-webui', 'fr/comparer/openclaw', 'fr/diapos', 'fr/enseignants', 'fr/entreprise', 'fr/entreprise/cle', 'fr/excel', 'fr/famille', 'fr/files', 'fr/hors-ligne', 'fr/importer', 'fr/jean', 'fr/pdf', 'fr/privacy', 'fr/secteur-public', 'fr/terms', 'fr/travail', 'import', 'ja', 'ja/jean', 'jean', 'nonprofits', 'offline', 'pdf', 'privacy', 'public-sector', 'slides', 'teachers', 'terms', 'work'].map((path) => BASE + path))
  assert.match(siteFiles(BASE, listed)['sitemap.xml'], /<url><loc>https:\/\/jean\.is\/<\/loc><\/url>\n {2}<url><loc>https:\/\/jean\.is\/ar<\/loc><\/url>/)
})

test('every page of jean.is says Source code with a link to the public repository, never to a page of its own', async () => {
  assert.equal(REPOSITORY, 'https://github.com/jean-is/jean')
  for (const [path, html] of Object.entries(await site()).filter(([name]) => name.endsWith('.html'))) {
    assert.doesNotMatch(html, /href="(?:\.\.\/)*source"/, path)
    assert.match(html, new RegExp(`href="${REPOSITORY}"`), path)
  }
})

test('a title is the description’s first sentence, in any script', () => {
  assert.equal(titleOf(BRAND, 'みんなのAIを、ブラウザのタブで。言葉やファイルで頼むと…'), 'Jean · みんなのAIを、ブラウザのタブで')
  assert.equal(titleOf(BRAND, 'Runs on Node.js in a tab. Nothing to install.'), 'Jean · Runs on Node.js in a tab')
})
