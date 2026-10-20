// The site's pages (site/, D438): every page, in every language, is what site/checks.js asks of a page, as jean.is's
// deploy builds them and as npm run build writes into app/ those every copy has; each runs the app's theme line
// and nothing else but its own script, where it has one; the app links them in the reader's language; and the checks find what they say they find.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { BRAND } from '../app/brand.js'
import { PAGES } from '../app/caps/policy/checks.js'
import { shippedFiles } from '../scripts/desktop.js'
import { withSite } from '../scripts/seo.js'
import { checkPage, checkSite, checkStyle, checkWords } from '../site/checks.js'
import { inLanguage } from '../site/home/page.js'
import { LANGUAGES, buildSite, sitePages, theme, themeFor } from '../site/site.js'

const BASE = 'https://jean.is/'
const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
const description = /<meta name="description" content="([^"]*)">/.exec(index)?.[1] ?? ''
const served = await shippedFiles(fileURLToPath(new URL('../app/', import.meta.url)))
/** The site as build:web writes it for jean.is. */
const jean = () => buildSite({ brand: BRAND, base: BASE, index: (said, address) => withSite(said ? inLanguage(index, said) : index, BASE, BRAND, said ?? description, [], address), now: new Date('2026-10-19T10:00:00') })

test('every page, in every language, is what a page of the site must be, as jean.is has them', async () => {
  const site = await jean()
  assert.deepEqual(checkSite(site, { base: BASE, served }), [])
  assert.deepEqual([...new Set(site.pages.map((page) => page.name))], ['charter', 'compare', 'compare-chatgpt', 'compare-claude-cowork', 'compare-open-webui', 'compare-openclaw', 'enterprise', 'enterprise-key', 'family', 'files', 'home', 'privacy', 'public-sector', 'teachers', 'terms', 'work'])
})

test('every page of jean.is ends with the same foot: the same pages in each language, as many in every language, the one it is on marked (D445)', async () => {
  const site = await jean()
  /** @type {Map<string, string[]>} */
  const byLanguage = new Map()
  for (const page of site.pages) {
    const footer = /<footer class="site-foot">([\s\S]*?)<\/footer>/.exec(site.files[page.path])?.[1] ?? ''
    const here = new URL(page.address, BASE).href
    const links = [...footer.matchAll(/<a href="([^"]*)"( aria-current="page")?>/g)].map(([, href, current]) => [new URL(href, here).href, Boolean(current)])
    const targets = links.map(([href]) => String(href))
    assert.deepEqual(links.filter(([, current]) => current).map(([href]) => href), targets.includes(here) ? [here] : [], `${page.path}: the page it is on, and only it, is marked`)
    const first = byLanguage.get(page.lang)
    if (first) assert.deepEqual(targets, first, `${page.path}: the foot of its language's other pages`)
    else byLanguage.set(page.lang, targets)
  }
  const english = byLanguage.get('en') ?? []
  assert.ok(english.includes(`${BASE}compare`) && english.includes(`${BASE}compare/open-webui`), 'the comparison’s pages are in it')
  for (const [lang, targets] of byLanguage) assert.equal(targets.length, english.length, `${lang}: as many pages as English's foot`)
})

test('those every copy has are too, as npm run build writes them into app/, with no address of their own, and only they', async () => {
  const site = await buildSite({ brand: BRAND, ships: true })
  assert.deepEqual(checkSite(site, { served }), [])
  assert.deepEqual(Object.keys(site.files).sort(), ['files.css', 'files.html', 'fr/files.html', 'fr/privacy.html', 'fr/terms.html', 'privacy.html', 'site.css', 'terms.html'])
  for (const [path, html] of Object.entries(site.files)) assert.doesNotMatch(html, /rel="canonical"|rel="alternate"|og:url/, `${path}: an organisation's copy is served from an address no build knows`)
})

test('every page is in English and French at least, each language at an address no other page has', async () => {
  const addresses = new Set()
  for (const [name, page] of await sitePages()) {
    for (const lang of LANGUAGES) assert.ok(lang in page.addresses, `${name}: ${lang}`)
    for (const address of Object.values(page.addresses)) {
      assert.ok(!addresses.has(address), `${name}: ${address} is another page's`)
      addresses.add(address)
    }
  }
})

test('every page runs the app’s theme line and nothing else but its own script, with no style but the site’s own sheets', async () => {
  const root = await theme()
  assert.equal(root.script, /<script>([^<]*)<\/script>/.exec(index)?.[1], 'index.html’s first script, byte for byte')
  const site = await jean()
  const pages = await sitePages()
  for (const page of site.pages.filter((at) => !at.fragment)) {
    const html = site.files[page.path]
    const up = '../'.repeat(page.address.split('/').length - 1)
    const { script, hash } = themeFor(root, up)
    const { script: own, sends } = pages.get(page.name) ?? {}
    assert.deepEqual([...html.matchAll(/<script\b[^>]*>([^<]*)<\/script>/g)].map((match) => match[1]), [script, ...own ? [own] : []], `${page.path}: the theme’s script, its looks named from the site’s root, then the page’s own`)
    const hashes = [hash, ...own ? [`'sha256-${createHash('sha256').update(own).digest('base64')}'`] : []].join(' ')
    const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1]
    assert.equal(policy, `default-src 'none'; script-src ${hashes}; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action ${sends ? "'self'" : "'none'"}; require-trusted-types-for 'script'; trusted-types 'none'`, page.path)
    assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script>') && html.indexOf('<script>') < html.indexOf('<link rel="stylesheet"'), `${page.path}: the policy, then the theme, then the style sheets`)
    assert.doesNotMatch(html, /\sstyle="|<style\b|\son\w+=/, `${page.path}: no inline style or handler for the policy to refuse`)
    for (const href of [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((match) => match[1])) {
      if (up && !/^(#|\?|https?:|mailto:)/.test(href)) assert.ok(href.startsWith(up), `${page.path}: ${href} climbs out of its language’s folder`)
    }
  }
})

test('the app links each page every copy has in the reader’s language, and every deploy answers it without .html', async () => {
  // The box names the one language besides English these pages have: when another comes, both change together.
  const composer = await readFile(new URL('../app/ui/composer.js', import.meta.url), 'utf8')
  assert.match(composer, /href=\$\{url === name && locale\.value === 'fr' \? `fr\/\$\{url\}` : url\}/)
  for (const [name, page] of await sitePages()) {
    if (!page.ships) continue
    assert.deepEqual(Object.keys(page.addresses).sort(), ['en', 'fr'], name)
    assert.equal(page.addresses.fr, `fr/${page.addresses.en}`, name)
    for (const address of Object.values(page.addresses)) assert.ok(PAGES.includes(address), `${address}: policy.html and the deploy recipes answer it without .html`)
  }
})

/** A page that is all a page must be, at https://example.org/a, in English and French, with what's under its h1. */
const valid = ({ lang = 'en', head = '', main = '<h2>A part</h2><p>Some text.</p>', html = `lang="${lang}" dir="ltr"` } = {}) => /* html */ `<!doctype html>
<html ${html}><head><meta charset="utf-8">
<meta name="description" content="A description long enough for a result to show something, short enough to show it whole.">
<title>A page · Jean</title><link rel="stylesheet" href="ui/style.css">
<link rel="canonical" href="https://example.org/a">
<link rel="alternate" hreflang="en" href="https://example.org/a"><link rel="alternate" hreflang="fr" href="https://example.org/fr/a"><link rel="alternate" hreflang="x-default" href="https://example.org/a">
<meta property="og:type" content="website"><meta property="og:site_name" content="Jean"><meta property="og:title" content="A page"><meta property="og:description" content="It says.">
<meta property="og:url" content="https://example.org/a"><meta property="og:image" content="https://example.org/share.jpg"><meta name="twitter:card" content="summary_large_image">${head}
</head><body><a href="#main">Skip</a><header><a href="./">Jean</a></header><main id="main"><h1>A page</h1>${main}</main><footer><p>The foot.</p></footer></body></html>`
const at = { path: 'a.html', lang: 'en', address: 'a', fragment: false, addresses: { en: 'a', fr: 'fr/a' }, base: 'https://example.org/', served: new Set(['index.html', 'a.html', 'fr/a.html', 'ui/style.css']) }
const problemsOf = (/** @type {string} */ html, more = {}) => checkPage(html, { ...at, ...more })

test('the checks pass a page that is all a page must be, and find each thing it isn’t', () => {
  assert.deepEqual(problemsOf(valid()), [])
  const finds = (/** @type {Parameters<typeof valid>[0]} */ page, /** @type {RegExp} */ problem, more = {}) => assert.ok(problemsOf(valid(page), more).some((line) => problem.test(line)), `${problem}: ${problemsOf(valid(page), more).join('; ')}`)
  // For people who can't see or can't use a mouse.
  finds({ html: 'lang="fr" dir="ltr"' }, /<html> says lang="fr", not en/)
  finds({ html: 'lang="en" dir="rtl"' }, /dir="rtl", not ltr/)
  finds({ main: '<h1>Again</h1>' }, /2 h1 headings, not one/)
  finds({ main: '<h3>Too deep</h3>' }, /h3 “Too deep” follows an h1/)
  finds({ main: '<main></main>' }, /2 main parts, not one/)
  finds({ main: '<nav><a href="./">A</a></nav><nav><a href="./">B</a></nav>' }, /navigations has no name/)
  finds({ main: '<p id="main">Twice</p>' }, /the id main is there twice/)
  finds({ main: '<p aria-labelledby="nobody">Named</p>' }, /aria-labelledby="nobody" names no element/)
  finds({ main: '<a href="#nowhere">Go</a>' }, /#nowhere leads nowhere on the page/)
  finds({ main: '<a href="./"><svg aria-hidden="true"></svg></a>' }, /link to \.\/ has no name/)
  finds({ main: '<button type="button"></button>' }, /a button has no name/)
  finds({ main: '<input id="q">' }, /a field \(input\) has no label/)
  finds({ main: '<img src="ui/x.png">' }, /picture \(ui\/x\.png\) has no alt/)
  finds({ main: '<svg viewBox="0 0 1 1"></svg>' }, /drawing is neither hidden/)
  finds({ main: '<button type="button" aria-label="Close" title="Close"></button>' }, /tip “Close” repeats its name/)
  finds({ main: '<a href="./" tabindex="1">Go</a>' }, /tab order of its own/)
  assert.ok(problemsOf(valid().replace('href="ui/style.css"', 'href="other.css"'), { served: new Set([...at.served, 'other.css']) }).some((line) => /the app’s style sheet/.test(line)))
  // For search engines and shared links.
  assert.ok(problemsOf(valid().replace('<title>A page · Jean</title>', /* html */ `<title>${'A'.repeat(71)}</title>`)).some((line) => /title is 71 characters/.test(line)))
  assert.ok(problemsOf(valid().replace(/content="A description[^"]*"/, 'content="Too short."')).some((line) => /description is 10 characters/.test(line)))
  assert.ok(problemsOf(valid().replace('<link rel="canonical" href="https://example.org/a">', '')).some((line) => /canonical address is missing/.test(line)))
  assert.ok(problemsOf(valid().replace('<link rel="alternate" hreflang="fr" href="https://example.org/fr/a">', '')).some((line) => /language versions are/.test(line)))
  assert.ok(problemsOf(valid().replace('<link rel="alternate" hreflang="x-default" href="https://example.org/a">', '<link rel="alternate" hreflang="x-default" href="https://example.org/fr/a">')).some((line) => /English's the default/.test(line)))
  assert.ok(problemsOf(valid().replace('content="https://example.org/a"', 'content="https://example.org/b"')).some((line) => /og:url is https:\/\/example\.org\/b/.test(line)))
  finds({ head: '<meta name="robots" content="noindex">' }, /kept out of search results/)
  // Links to the site's own pages and files.
  finds({ main: '<a href="compare">Compare</a>' }, /link to compare reaches nothing the site serves/)
  assert.deepEqual(problemsOf(valid({ main: '<a href="a">Here</a><a href="https://example.com/">There</a><a href="mailto:a@example.org">Write</a>' })), [])
  // The homepage is a part of index.html: the app draws its top and main part.
  assert.deepEqual(problemsOf(valid().replace(/<header>.*<\/header>/, '').replace('<main id="main">', '<div>').replace('</main>', '</div>').replace('href="#main"', 'href="#a"').replace('<h1>', '<h1 id="a">'), { fragment: true }), [])
})

test('the checks find a language that isn’t English’s in shape, says what English says, or spaces French as English does', () => {
  assert.deepEqual(checkWords('a', { en: { title: 'A {name}', list: ['x', 'y'], go: 'Go to {domain}' }, fr: { title: 'Un', list: ['x', 'y'], go: 'Aller' } }), [], 'the name and the domain a language may say otherwise')
  assert.deepEqual(checkWords('a', { en: { a: 'A', b: ['x', 'y'], c: 'At {date}' }, fr: { b: ['x'], c: 'Le {day}', d: 'D' } }), [
    'site/a/fr.json: a is missing', 'site/a/fr.json: d isn\'t English\'s', 'site/a/fr.json: b is a list of 1, English\'s a list of 2', 'site/a/fr.json: c has {{day}}, English\'s {{date}}'])
  assert.deepEqual(checkWords('a', { en: { a: 'Which one?' }, fr: { a: 'Laquelle ?' } }), ['site/a/fr.json: a sets ? ! : ; apart with a plain space, not a narrow no-break one'])
  assert.deepEqual(checkWords('a', { en: { a: 'Which one?' }, fr: { a: 'Laquelle ?' } }), [])
  const english = valid({ main: '<h2>A part</h2><p>This sentence is said in English.</p><p>Pew Research Center, 2026</p><p>arnaud@jean.is</p>' })
  const french = (/** @type {string} */ main) => valid({ lang: 'fr', main }).replace('<title>A page · Jean</title>', '<title>Une page · Jean</title>').replace('href="ui/style.css"', 'href="../ui/style.css"').replace('href="./"', 'href="../"').replace(/content="A description[^"]*"/, 'content="Une description assez longue pour qu’un résultat en montre quelque chose, et le montre en entier."')
  const site = (/** @type {string} */ main) => ({ files: { 'a.html': english, 'fr/a.html': french(main) }, words: new Map(), pages: [
    { path: 'a.html', name: 'a', lang: 'en', address: 'a', fragment: false }, { path: 'fr/a.html', name: 'a', lang: 'fr', address: 'fr/a', fragment: false }] })
  const problems = (/** @type {string} */ main) => checkSite(site(main), { served: ['index.html', 'ui/style.css'] }).filter((line) => !/canonical|language versions|og:url|<html>/.test(line))
  assert.deepEqual(problems('<h2>Une partie</h2><p>Cette phrase est dite en français.</p><p>Pew Research Center, 2026</p><p>arnaud@jean.is</p>'), [], 'names, sources and addresses read the same in every language')
  assert.deepEqual(problems('<h2>Une partie</h2><p>This sentence is said in English.</p>'), ['fr/a.html: “This sentence is said in English.” is English\'s, not fr\'s'])
  assert.deepEqual(problems('<h2>Une partie</h2><h3>Plus</h3><p>Texte.</p>'), ['fr/a.html: its headings are h1 h2 h3, English\'s h1 h2'])
  assert.deepEqual(problems('<h2>Une partie</h2><p>Vraiment ?</p>'), ['fr/a.html: “Vraiment ?” sets ? ! : ; apart with a plain space, not a narrow no-break one'])
  assert.deepEqual(problems('<h2>Une partie</h2><p>Vraiment ?</p><code>a ? b : c</code>'), [], 'code keeps its own spaces')
})

test('the checks find a style sheet in physical properties, and nothing else', () => {
  assert.deepEqual(checkStyle('a.css', '.a { margin-inline-start: 1rem; inline-size: 2rem; text-align: start }\n@media (max-width: 30rem) { .a { padding-block: 0 } }'), [])
  assert.deepEqual(checkStyle('a.css', '.a { margin-left: 1rem }'), ['a.css: margin-left is a physical property; use its logical one'])
  assert.deepEqual(checkStyle('a.css', '.a { width: 1rem }'), ['a.css: width: is a physical property; use its logical one'])
  assert.deepEqual(checkStyle('a.css', '/* width: 1rem */ .a { text-align: right }'), ['a.css: text-align: right is a physical property; use its logical one'])
})
