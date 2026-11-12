// jean.is's page under the app's first screen (D397): only the brand's own site has it, in each language
// with words, as static HTML that the policy runs as it is, and its words stay true to the app. What every page of
// the site must be, this one included, test/site.test.js holds it to (D438).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BRAND, PAGES } from '../app/brand.js'
import { inLanguage, sampleAnswer, withHome } from '../site/home/page.js'
import { REPOSITORY, buildSite, ownSite, sitePages } from '../site/site.js'
import { listedPages, siteFiles, titleOf, withSite } from '../scripts/seo.js'

const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
const description = /<meta name="description" content="([^"]*)">/.exec(index)?.[1] ?? ''
const BASE = 'https://jean.is/'
/** The homepage's languages, each but English's at its own address, and the files they are written to. */
const LANGS = ['ar', 'br', 'co', 'da', 'de', 'en', 'es', 'fi', 'fr', 'fr-CA', 'ha', 'hu', 'id', 'it', 'ja', 'ko', 'ms', 'nl', 'pl', 'pt', 'ro', 'tl', 'zh-Hans', 'zh-Hant']
const fileOf = (/** @type {string} */ lang) => (lang === 'en' ? 'index.html' : `${lang}.html`)
const FILES = LANGS.map(fileOf)
/** The site's files as build:web writes them for jean.is. */
const built = buildSite({ brand: BRAND, base: BASE, index: (said, address) => withSite(said ? inLanguage(index, said) : index, BASE, BRAND, said ?? description, LANGS, address) })
const site = async () => (await built).files
/** Each language's page, the part index.html ends with. */
const pages = async () => Object.entries(await site()).filter(([path]) => FILES.includes(path)).map(([path, html]) => [path === 'index.html' ? 'en' : path.slice(0, -'.html'.length), html.slice(html.indexOf('<div class="home"'), html.lastIndexOf('</body>'))])

test('only the brand’s own site has the page, never an organisation’s copy', () => {
  assert.equal(ownSite('https://jean.is/', BRAND), true)
  for (const base of ['https://jean.example/', 'https://intranet.example.org/jean/', 'https://www.jean.is/', 'http://127.0.0.1:4180/']) assert.equal(ownSite(base, BRAND), false, base)
})

test('the page never says agent, model, MCP or token, never promises a tutor, and runs as written under the policy', async () => {
  const all = await pages()
  assert.deepEqual(all.map(([lang]) => lang).sort(), LANGS)
  for (const [lang, page] of all) {
    const text = page.replace(/<[^>]+>/g, ' ')
    assert.doesNotMatch(text, /\b(agents?|models?|MCP|tokens?|tutors?)\b/i, lang)
    assert.doesNotMatch(page, /\sstyle=|<script|\son[a-z]+=/i, lang)
    assert.doesNotMatch(page, /\{\w+\}/, `${lang}: every {param} is filled`)
    assert.equal(page.match(/data-try="/g)?.length, 12, `${lang}: each of the twelve tiles tries an idea`)
    assert.equal(page.match(/class="button primary" data-try="/g)?.length, 1, `${lang}: the first tile's Try the primary one`)
    assert.ok(page.startsWith(/* html */ `<div class="home" lang="${lang}"`), lang)
    assert.equal(page.match(/<h1[ >]/g)?.length, 1, `${lang}: one heading of its own`)
    // The promise is its outline: an act for each part of it, in the order that language says them, each on its ground, with its catch.
    const acts = [...page.matchAll(/<section id="home-(\w+)" class="home-act is-(\w+)"/g)].map(([, act, ground]) => `${act} on ${ground}`)
    const order = ['ja', 'ko', 'zh-Hans', 'zh-Hant'].includes(lang) ? ['any', 'create', 'keep'] : ['create', 'any', 'keep']
    assert.deepEqual(acts, order.map((act) => `${act} on ${{ create: 'paper', any: 'fill', keep: 'wait' }[act]}`), `${lang}: the acts as its sentence says them, each on its ground`)
    assert.match(page, /<h1 class="visually-hidden">/, `${lang}: the promise itself is its heading, for whoever hears or searches the page`)
    assert.equal(page.match(/<p class="home-catch">/g)?.length, 3, `${lang}: every promise says its catch`)
    assert.equal(page.match(/<svg class="home-wave is-\w+"/g)?.length, 3, `${lang}: a wave after each act`)
    assert.ok(page.indexOf('<h1') < page.indexOf('class="home-act '), `${lang}: at the top`)
    assert.ok(page.indexOf('data-turn') > page.lastIndexOf('class="home-act ') && page.match(/data-turn/g)?.length === 1, `${lang}: Your turn after the acts, once`)
    assert.ok(page.includes('<footer class="site-foot">'), `${lang}: the site’s foot`)
  }
})

test('the app links the site’s pages where they are, and every page’s foot the homepage at its own address, in its language', async () => {
  const files = await site()
  const pages = await sitePages()
  for (const [name, addresses] of Object.entries(PAGES)) assert.deepEqual(addresses, pages.get(name)?.addresses, `app/brand.js’s PAGES.${name} is site/${name}/’s`)
  assert.equal(pages.has('about'), false, 'the homepage has no page of its own beside it')
  for (const [path, home] of [['index.html', './'], ['fr.html', 'fr'], ['fr/aide.html', '../fr'], ['ja.html', 'ja'], ['help.html', './']]) {
    assert.match(files[path], new RegExp(`<footer class="site-foot">[\\s\\S]*<a href="${home.replace(/\./g, '\\.')}"( aria-current="page")?>(Homepage|Page d’accueil|トップページ)</a>`), path)
  }
  assert.ok(files['enterprise.html'].includes(`<a href="./">See what ${BRAND.name} does for everyone</a>`))
  assert.ok(files['fr/entreprise.html'].includes(`<a href="../fr">Voir ce que ${BRAND.name} fait pour tous</a>`))
})

test('the sample’s tile says what the sample spreadsheet holds', async () => {
  const sample = await sampleAnswer()
  assert.deepEqual([sample.products, sample.months], [4, 12])
  assert.equal(sample.product, 'Juice')
  assert.ok(sample.growth > 1.6 && sample.growth < 1.7)
  const page = (await site())['index.html']
  assert.match(page, /<bdi lang="en" dir="ltr">Juice<\/bdi> grew the most: \+169%/)
  assert.match(page, /<q class="home-request">Which product grew the most over the year\? Show it as a chart\.<\/q>/)
})

test('jean.is’s index.html has the page after the app’s root, and each other language its own page at its own address', async () => {
  const files = await site()
  assert.deepEqual(Object.keys(files).filter((path) => FILES.includes(path) || /^(home|site)\.css$/.test(path)).sort(), [...FILES, 'home.css', 'site.css'].sort())
  const root = files['index.html']
  assert.match(root, /<html lang="en" dir="ltr"/)
  assert.doesNotMatch(root, /app-language/)
  assert.ok(root.indexOf('<div class="home" lang="en"') > root.indexOf('<body>') && root.indexOf('<div class="home"') < root.indexOf('</body>'))
  assert.ok(root.indexOf('href="ui/style.css"') < root.indexOf('href="site.css"') && root.indexOf('href="site.css"') < root.indexOf('href="home.css"'), 'the app’s style sheet, the site’s, then the page’s')
  for (const html of FILES.map((path) => files[path])) {
    for (const [lang, address] of [...LANGS.map((lang) => [lang, lang === 'en' ? BASE : BASE + lang]), ['x-default', BASE]]) assert.match(html, new RegExp(`<link rel="alternate" hreflang="${lang}" href="${address}">`))
    assert.equal(html.match(/class="home"/g)?.length, 1)
    // Its one heading before the app's greeting is drawn, the promise its title makes after the name.
    assert.deepEqual(html.match(/<h1[ >].*<\/h1>/g)?.map((h1) => h1.replace(/<[^>]+>/g, '')), [new RegExp(`<title>${BRAND.name} · (.*)</title>`).exec(html)?.[1]])
  }
  const ja = files['ja.html']
  assert.match(ja, /<html lang="ja" dir="ltr"/)
  assert.match(ja, /<meta name="app-language" content="ja">/)
  assert.match(ja, /<link rel="canonical" href="https:\/\/jean\.is\/ja">/)
  assert.match(ja, /<meta property="og:url" content="https:\/\/jean\.is\/ja">/)
  assert.match(ja, /<title>Jean · 好きな AI でつくって、ぜんぶ手元に<\/title>/)
  assert.match(ja, /<p class="noscript">このアシスタントはブラウザーの中だけで動き、JavaScript が必要です。<\/p>/, 'what it says without scripts, in its language')
  // Its menu links every language the app speaks, as Settings' lists them, the page's marked.
  assert.equal(ja.match(/<a href="[^"]*" data-language="[\w-]+"[^>]* lang="[\w-]+"/g)?.length, 46)
  assert.match(ja, /<a href="(\.\/)?ko" data-language="ko" hreflang="ko" lang="ko"><span dir="ltr">한국어<\/span>/, 'a language with its own page links there')
  assert.match(ja, /<a href="(\.\/)?zh-Hant" data-language="zh-Hant" hreflang="zh-Hant" lang="zh-Hant"><span dir="ltr">繁體中文<\/span>/, 'under its own code, a script’s too')
  assert.match(ja, /<a href="[^"]*" data-language="sv" lang="sv"><span dir="ltr">Svenska<\/span>/, 'and one without says no language of its address')
  assert.match(ja, /<a href="[^"]*" data-language="ja" hreflang="ja" aria-current="true" lang="ja"><span dir="ltr">日本語<\/span>/)
  assert.match(files['ar.html'], /<a href="[^"]*" data-language="ar" hreflang="ar" aria-current="true" lang="ar"><span dir="rtl">العربية<\/span>/, 'a name in its own direction, the row in the page’s')
  assert.match(files['fr.html'], /<title>Jean · Créez avec l’IA de votre choix, gardez tout<\/title>/)
  assert.match(files['ar.html'], /<html lang="ar" dir="rtl"/)
  assert.match(files['de.html'], /<title>Jean · Erstelle mit jeder KI, behalte alles<\/title>/)
  const zh = files['zh-Hans.html']
  assert.match(zh, /<html lang="zh-Hans" dir="ltr"/)
  assert.match(zh, /<meta name="app-language" content="zh-Hans">/)
  assert.match(zh, /<title>Jean · 用任何 AI 创作，一切都留在你手里<\/title>/)
  assert.match(zh, /不一定免费。完全不注册就能用？/, 'a language that writes no spaces joins a catch’s sentences without one')
  assert.throws(() => withHome(root, '', { lang: 'en', dir: 'ltr', own: false, languages: [], noscript: '' }), /already/)
})

test('jean.is’s sitemap lists every page of the site in each of its languages, whose language versions name each other', async () => {
  const pages = Object.fromEntries(Object.entries(await site()).filter(([path]) => path.endsWith('.html')))
  const listed = listedPages(BASE, pages)
  assert.deepEqual([...listed.keys()], ['', 'accessibility', 'ar', 'ar/watch', 'br', 'charter', 'co', 'compare', 'compare/chatgpt', 'compare/claude-cowork', 'compare/manus', 'compare/open-webui', 'compare/openclaw', 'da', 'de', 'diagrams', 'enterprise', 'enterprise/key', 'es', 'excel', 'family', 'fi', 'files', 'fr', 'fr-CA', 'fr/accessibilite', 'fr/aide', 'fr/aide/ajouter-fichiers-dossiers-et-images', 'fr/aide/ce-que-jean-sait-faire', 'fr/aide/ce-que-voit-l-ia', 'fr/aide/choisir-l-ia', 'fr/aide/cle-refusee', 'fr/aide/commencer-gratuitement-avec-openrouter', 'fr/aide/competences', 'fr/aide/envoyer-une-tache-a-quelqu-un', 'fr/aide/forfait-arrete', 'fr/aide/injoignable', 'fr/aide/jean-est-il-gratuit', 'fr/aide/l-ia-sur-cet-ordinateur', 'fr/aide/les-mots-de-jean', 'fr/aide/mes-taches-ont-disparu', 'fr/aide/ou-est-garde-votre-travail', 'fr/aide/qu-est-ce-que-jean', 'fr/aide/quand-jean-demande-d-abord', 'fr/aide/sauvegarder-et-restaurer', 'fr/aide/sur-tous-vos-appareils', 'fr/aide/travailler-ensemble', 'fr/aide/utiliser-une-cle', 'fr/aide/votre-premiere-tache', 'fr/associations', 'fr/charte-ia', 'fr/comparer',
    'fr/comparer/chatgpt', 'fr/comparer/claude-cowork', 'fr/comparer/manus', 'fr/comparer/open-webui', 'fr/comparer/openclaw', 'fr/diapos', 'fr/enseignants', 'fr/entreprise', 'fr/entreprise/cle', 'fr/excel', 'fr/famille', 'fr/files', 'fr/hors-ligne', 'fr/importer', 'fr/pdf', 'fr/plan-du-site', 'fr/privacy', 'fr/regarder', 'fr/schemas', 'fr/secteur-public', 'fr/terms', 'fr/travail', 'ha', 'help', 'help/add-files-folders-and-pictures', 'help/ai-on-this-computer', 'help/back-up-and-restore', 'help/choose-the-ai', 'help/couldnt-reach', 'help/is-jean-free', 'help/key-refused', 'help/my-tasks-are-gone', 'help/on-all-your-devices', 'help/plan-stopped', 'help/send-a-task-to-someone', 'help/skills', 'help/start-free-with-openrouter', 'help/use-a-key-you-have', 'help/what-jean-can-do', 'help/what-jean-is', 'help/what-the-ai-sees', 'help/when-jean-asks-first', 'help/where-your-work-is-kept', 'help/words-you-ll-see', 'help/work-on-something-together', 'help/your-first-task', 'hu', 'id', 'import', 'it', 'ja', 'ja/watch', 'ko', 'ko/charter', 'ko/compare', 'ko/compare/chatgpt', 'ko/compare/claude-cowork', 'ko/compare/manus', 'ko/compare/open-webui',
    'ko/compare/openclaw', 'ko/diagrams', 'ko/enterprise', 'ko/enterprise/key', 'ko/excel', 'ko/family', 'ko/import', 'ko/nonprofits', 'ko/offline', 'ko/pdf', 'ko/public-sector', 'ko/slides', 'ko/teachers', 'ko/work', 'ms', 'nl', 'nonprofits', 'offline', 'pdf', 'pl', 'privacy', 'pt', 'public-sector', 'ro', 'site-map', 'slides', 'teachers', 'terms', 'tl', 'watch', 'work', 'zh-Hans', 'zh-Hant'].map((path) => BASE + path))
  assert.match(siteFiles(BASE, listed)['sitemap.xml'], /<url><loc>https:\/\/jean\.is\/<\/loc><\/url>\n {2}<url><loc>https:\/\/jean\.is\/accessibility<\/loc><\/url>/)
})

test('every page of jean.is says Source code with a link to the public repository, never to a page of its own', async () => {
  assert.equal(REPOSITORY, 'https://github.com/jean-is/jean')
  // The reels' player is a document a page frames, as demo.html is, with no foot (site/watch, D687).
  for (const [path, html] of Object.entries(await site()).filter(([name]) => name.endsWith('.html') && name !== 'reel.html')) {
    assert.doesNotMatch(html, /href="(?:\.\.\/)*source"/, path)
    assert.match(html, new RegExp(`href="${REPOSITORY}"`), path)
  }
})

test('a title is the description’s first sentence, in any script', () => {
  assert.equal(titleOf(BRAND, 'みんなのAIを、ブラウザのタブで。言葉やファイルで頼むと…'), 'Jean · みんなのAIを、ブラウザのタブで')
  assert.equal(titleOf(BRAND, 'Runs on Node.js in a tab. Nothing to install.'), 'Jean · Runs on Node.js in a tab')
})
