// The site's pages (site/, D438): every page, in every language, is what site/checks.js asks of a page, as jean.is's
// deploy builds them and as npm run build writes into app/ those every copy has; each runs the app's theme line
// and nothing else but its own script, where it has one; the app links them in the reader's language; and the checks find what they say they find.
import { parseDeck } from '@codename/deck'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { BRAND } from '../app/brand.js'
import { shared } from '../app/caps/interactive/live.js'
import { all, chart, figures, form, parse, table } from '../app/caps/interactive/parts.js'
import { PAGES } from '../app/caps/policy/checks.js'
import { shippedFiles } from '../scripts/desktop.js'
import { SHARE } from '../scripts/manifest.js'
import { withSite } from '../scripts/seo.js'
import { checkPage, checkSite, checkStyle, checkWords } from '../site/checks.js'
import { inLanguage } from '../site/home/page.js'
import { LANGUAGES, MENU, buildSite, penned, sitePages, theme, themeFor, wordsOf, xml } from '../site/site.js'

const BASE = 'https://jean.is/'
const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
const description = /<meta name="description" content="([^"]*)">/.exec(index)?.[1] ?? ''
const served = await shippedFiles(fileURLToPath(new URL('../app/', import.meta.url)))
/** The site as build:web writes it for jean.is. */
const built = buildSite({ brand: BRAND, base: BASE, index: (said, address, shown) => withSite(said ? inLanguage(index, said) : index, BASE, BRAND, said ?? description, [], address, shown), now: new Date('2026-10-19T10:00:00') })
const jean = () => built

test('every page, in every language, is what a page of the site must be, as jean.is has them', async () => {
  const site = await jean()
  assert.deepEqual(checkSite(site, { base: BASE, served }), [])
  assert.deepEqual([...new Set(site.pages.map((page) => page.name))], ['accessibility', 'associations', 'charter', 'compare', 'compare-chatgpt', 'compare-claude-cowork', 'compare-manus', 'compare-open-webui', 'compare-openclaw', 'diagrams', 'enterprise', 'enterprise-key', 'excel', 'family', 'files', 'help', 'help/add-files', 'help/ai-sees', 'help/asks-first', 'help/back-up', 'help/choose-ai', 'help/couldnt-reach', 'help/first-task', 'help/is-free', 'help/key-refused', 'help/on-device', 'help/openrouter', 'help/plan-stopped', 'help/send-to-someone', 'help/skills', 'help/tasks-gone', 'help/together', 'help/use-a-key', 'help/what-jean-can-do', 'help/what-jean-is', 'help/where-kept', 'help/words', 'help/your-devices', 'home', 'import', 'offline', 'pdf', 'privacy', 'public-sector', 'site-map', 'slides', 'teachers', 'terms', 'watch', 'work'])
})

test('a link to jean.is shows the card of its page’s language, and one to an organisation’s copy the welcome screen', async () => {
  const shown = (/** @type {string} */ html) => ['og:image', 'og:image:alt'].map((property) => new RegExp(`<meta property="${property}" content="([^"]*)">`).exec(html)?.[1])
  const site = await jean()
  for (const { path, lang } of site.pages) {
    const { promise } = /** @type {{ promise: string }} */ (await wordsOf('home', lang))
    assert.deepEqual(shown(site.files[path]), [`${BASE}screenshots/${lang}/card.png`, xml(`${BRAND.name} · ${promise}`)], path)
  }
  const copy = await buildSite({ brand: BRAND, base: 'https://example.org/', ships: true })
  for (const { path } of copy.pages) assert.deepEqual(shown(copy.files[path]), [`https://example.org/${SHARE.src}`, xml(SHARE.alt)], path)
})

test('every page of jean.is ends with the same foot: the same pages in each language, as many in every language, the one it is on marked', async () => {
  const site = await jean()
  /** @type {Map<string, string[]>} */
  const byLanguage = new Map()
  for (const page of site.pages) {
    const footer = /<footer class="site-foot">([\s\S]*?)<\/footer>/.exec(site.files[page.path])?.[1] ?? ''
    const here = new URL(page.address, BASE).href
    // The homepage's link asks for it, ?index=1: it is the homepage's own address all the same.
    const links = [...footer.matchAll(/<a href="([^"]*)"( aria-current="page")?>/g)].map(([, href, current]) => [new URL(href, here).href.replace(/\?index=1$/, ''), Boolean(current)])
    const targets = links.map(([href]) => String(href))
    assert.deepEqual(links.filter(([, current]) => current).map(([href]) => href), targets.includes(here) ? [here] : [], `${page.path}: the page it is on, and only it, is marked`)
    const first = byLanguage.get(page.lang)
    if (first) assert.deepEqual(targets, first, `${page.path}: the foot of its language's other pages`)
    else byLanguage.set(page.lang, targets)
  }
  const english = byLanguage.get('en') ?? []
  assert.ok(english.includes(BASE) && byLanguage.get('fr')?.includes(`${BASE}fr`), 'the homepage is in it, in the page’s language')
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

test('every page runs the app’s theme line and nothing else but its menu of languages’ script and its own, with no style but the site’s own sheets', async () => {
  const root = await theme()
  assert.equal(root.script, /<script>([^<]*)<\/script>/.exec(index)?.[1], 'index.html’s first script, byte for byte')
  const site = await jean()
  const pages = await sitePages()
  for (const page of site.pages.filter((at) => !at.fragment)) {
    const html = site.files[page.path]
    const up = '../'.repeat(page.address.split('/').length - 1)
    const { script, hash } = themeFor(root, up)
    const { script: own, sends, frames } = pages.get(page.name) ?? {}
    const runs = own ? `${MENU}\n${own}` : MENU
    assert.deepEqual([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]), [script, runs], `${page.path}: the theme’s script, its looks named from the site’s root, then its menu of languages’ and its own`)
    const hashes = [hash, `'sha256-${createHash('sha256').update(runs).digest('base64')}'`].join(' ')
    const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1]
    assert.equal(policy, `default-src 'none'; script-src ${hashes}; style-src 'self'; img-src 'self'; font-src 'self';${frames ? " frame-src 'self';" : ''} base-uri 'none'; form-action ${sends ? "'self'" : "'none'"}; require-trusted-types-for 'script'; trusted-types 'none'`, page.path)
    assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script>') && html.indexOf('<script>') < html.indexOf('<link rel="stylesheet"'), `${page.path}: the policy, then the theme, then the style sheets`)
    assert.doesNotMatch(html, /\sstyle="|<style\b|\son\w+=/, `${page.path}: no inline style or handler for the policy to refuse`)
    for (const href of [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((match) => match[1])) {
      if (up && !/^(#|\?|https?:|mailto:)/.test(href)) assert.ok(href.startsWith(up), `${page.path}: ${href} climbs out of its language’s folder`)
    }
  }
})

test('the app links each page every copy has in the reader’s language, and every deploy answers it without .html', async () => {
  // The box and the Vous menu name the one language besides English these pages have: when another comes, both change together.
  const state = await readFile(new URL('../app/ui/state.js', import.meta.url), 'utf8')
  assert.match(state, /url === name && locale\.value === 'fr' \? `fr\/\$\{url\}` : url/)
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
const at = { path: 'a.html', lang: 'en', address: 'a', fragment: false, addresses: { en: 'a', fr: 'fr/a' }, base: 'https://example.org/', served: new Set(['index.html', 'a.html', 'fr/a.html', 'ui/style.css', 'share.jpg']) }
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
  finds({ main: '<iframe src="a"></iframe>' }, /a frame \(a\) has no name/)
  assert.ok(problemsOf(valid().replace('href="ui/style.css"', 'href="other.css"'), { served: new Set([...at.served, 'other.css']) }).some((line) => /the app’s style sheet/.test(line)))
  // For search engines and shared links.
  assert.ok(problemsOf(valid().replace('<title>A page · Jean</title>', /* html */ `<title>${'A'.repeat(71)}</title>`)).some((line) => /title is 71 characters/.test(line)))
  assert.ok(problemsOf(valid().replace(/content="A description[^"]*"/, 'content="Too short."')).some((line) => /description is 10 characters/.test(line)))
  assert.ok(problemsOf(valid().replace('<link rel="canonical" href="https://example.org/a">', '')).some((line) => /canonical address is missing/.test(line)))
  assert.ok(problemsOf(valid().replace('<link rel="alternate" hreflang="fr" href="https://example.org/fr/a">', '')).some((line) => /language versions are/.test(line)))
  assert.ok(problemsOf(valid().replace('<link rel="alternate" hreflang="x-default" href="https://example.org/a">', '<link rel="alternate" hreflang="x-default" href="https://example.org/fr/a">')).some((line) => /English's the default/.test(line)))
  finds({}, /picture, https:\/\/example\.org\/share\.jpg, is nothing the site serves/, { served: new Set(['index.html', 'a.html', 'fr/a.html', 'ui/style.css']) })
  assert.ok(problemsOf(valid().replace('content="https://example.org/a"', 'content="https://example.org/b"')).some((line) => /og:url is https:\/\/example\.org\/b/.test(line)))
  finds({ head: '<meta name="robots" content="noindex">' }, /kept out of search results/)
  // Links to the site's own pages and files.
  finds({ main: '<a href="compare">Compare</a>' }, /link to compare reaches nothing the site serves/)
  finds({ main: '<iframe src="demo.html#src=a" title="A demo"></iframe>' }, /frame of demo\.html#src=a reaches nothing the site serves/)
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

test('/diagrams’ loan is a page Jean’s own reader works out in each of its languages, each slider changing what it shows, its chart drawn from its table', async () => {
  const site = await jean()
  const tasks = (/** @type {string} */ name) => site.files[`demos/diagrams/${name}.jsonl`].trim().split('\n').map((line) => JSON.parse(line))
  for (const lang of ['en', 'fr', 'ko']) {
    const parts = /** @type {import('../app/caps/interactive/parts.js').Part[]} */ (parse(/```html\n([\s\S]*)\n```/.exec(tasks(`page.${lang}`).at(-1).update.content.text)?.[1] ?? ''))
    const part = (/** @type {string} */ tag) => /** @type {import('../app/caps/interactive/parts.js').Part} */ (all(parts).find((one) => one.tag === tag))
    const read = (/** @type {[string, string][]} */ given = []) => {
      const now = shared(parts, { given: new Map(given), added: new Map(), lang, locales: [lang] })
      return { live: now.live, figures: figures(now.filled(part('app-figures'))), rows: table(now.filled(part('app-table'))).rows, chart: chart(now.filled(part('app-chart')), lang) }
    }
    const first = read()
    assert.equal(first.live, true, lang)
    // €15,000 over five years at 4.9%, as a bank works it out: 60 equal months, and nothing left at the end.
    const monthly = 0.049 / 12, payment = 15_000 * monthly / (1 - (1 + monthly) ** -60)
    assert.ok(first.figures[0][0].includes(new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(payment)), `${lang}: ${first.figures[0][0]}`)
    assert.equal(first.rows.length, 6, lang)
    assert.ok(!/—/.test(first.rows.flat().join(' ')), lang)
    const drawn = first.chart.series[0].data
    assert.deepEqual([drawn.length, Math.round(drawn[0]), Math.round(drawn[5])], [6, 15_000, 0], lang)
    const [amount, rate, years] = form(part('app-form'))
    for (const [{ label }, value] of /** @type {[{ label: string }, string][]} */ ([[amount, '30000'], [rate, '9'], [years, '8']])) {
      assert.notDeepEqual(read([[label, value]]).figures, first.figures, `${lang}: ${label}`)
    }
    assert.equal(read([[years.label, '8']]).rows.length, 9, lang)
  }
})

test('a page whose pane draws a conversation Jean can play frames Jean’s demo of it, writes its task beside it from its words, and allows that frame alone; a help article’s figures frame other pages’', async () => {
  const site = await jean()
  const pages = await sitePages()
  const framing = [...pages].filter(([, page]) => page.frames).map(([name]) => name).sort()
  assert.deepEqual(framing, ['diagrams', 'enterprise', 'excel', 'help/add-files', 'help/asks-first', 'help/first-task', 'help/what-jean-is', 'offline', 'slides', 'watch', 'work'])
  const tasks = Object.fromEntries(Object.entries(site.files).filter(([path]) => /^demos\/.*\.jsonl$/.test(path)).map(([path, file]) => [path, file.trim().split('\n').map((line) => JSON.parse(line))]))
  // The homepage is a part of index.html, the app's own document, whose policy is the app's.
  for (const page of site.pages.filter((at) => !at.fragment)) {
    const html = site.files[page.path]
    const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? ''
    if (!framing.includes(page.name)) {
      assert.doesNotMatch(`${policy}${html}`, /frame-src|<iframe/, page.path)
      continue
    }
    assert.match(policy, / frame-src 'self';/, page.path)
    // /watch frames its reels' player, as test/watch.test.js holds it.
    if (page.name === 'watch') continue
    const words = { ...site.words.get(page.name)?.en, ...site.words.get(page.name)?.[page.lang] }
    const frames = [...html.matchAll(/<iframe class="site-demo" src="([^"]+)" title="[^"]+" loading="lazy"><\/iframe>/g)].map(([, src]) => src.replaceAll('&amp;', '&'))
    for (const src of frames) assert.equal(src.split('#')[0], `${'../'.repeat(page.address.split('/').length - 1)}demo.html`, page.path)
    const file = `demos/${page.name}.${page.lang}.jsonl`
    if (!(file in tasks)) {
      // Figures of another page's task, framed as it ended, bare, with that page's Play.
      assert.deepEqual(frames.map((src) => new URLSearchParams(src.split('#')[1]).get('src')), [`demos/excel.${page.lang}.jsonl`, `demos/help/asks-first.${page.lang}.jsonl`], page.path)
      for (const src of frames) {
        const params = new URLSearchParams(src.split('#')[1])
        const from = String(params.get('src')).replace(/^demos\/(.*)\.\w+\.jsonl$/, '$1')
        assert.ok(String(params.get('src')) in tasks, src)
        assert.deepEqual([params.get('lang'), params.get('play'), params.has('still'), params.has('bare')], [page.lang, site.words.get(from)?.[page.lang]?.['pane.play'], true, true], src)
      }
      continue
    }
    const params = new URLSearchParams(frames[0].split('#')[1])
    const tour = file.replace(/\.jsonl$/, '.tour.json')
    const toured = tour in site.files
    assert.deepEqual([params.get('src'), params.get('lang'), params.get('play'), params.has('still'), params.has('bare')], [file, page.lang, toured ? null : words['pane.play'], true, true], page.path)
    // With a tour, Play is the page's, and opens a modal dialog that frames the task with it, whole, then plays it again with pane.again.
    const popover = /<button class="button primary site-demo-play" type="button" commandfor="site-tour" command="show-modal">.*?<\/button>\s*<dialog id="site-tour" class="site-tour" aria-label="[^"]+" closedby="any">\s*<button class="icon-button site-tour-close" type="button" commandfor="site-tour" command="close" aria-label="[^"]+">.*?<\/button>\s*<iframe class="site-tour-frame" src="([^"]+)" title="[^"]+" loading="lazy"><\/iframe>/.exec(html)
    assert.equal(Boolean(popover), toured, page.path)
    if (popover) {
      const played = new URLSearchParams(popover[1].replaceAll('&amp;', '&').split('#')[1])
      assert.deepEqual([...played], [['src', file], ['lang', page.lang], ['tour', tour], ['play', words['pane.again']]], page.path)
    }
    // A conversation's file: the request, the AI as the page names it and never by brand, then its answer.
    const [header, ...records] = tasks[file]
    assert.deepEqual([header.kind, header.id], ['conversation', `demo-${page.name.replaceAll('/', '-')}`], file)
    const brains = records.map(({ update }) => update).filter((update) => update.sessionUpdate === 'tool_call' && update.kind === 'think')
    assert.ok(brains.length && brains.every((brain) => brain.title === words['demo.brain'] && !brain.rawInput), file)
    assert.equal(records.at(-1).update.sessionUpdate, 'agent_message_chunk', file)
  }
  assert.deepEqual(Object.keys(tasks).filter((path) => !/^demos\/(diagrams|reels)\//.test(path)).sort(), framing.filter((name) => name !== 'help/what-jean-is' && name !== 'watch').flatMap((name) => Object.keys(pages.get(name)?.addresses ?? {}).map((lang) => `demos/${name}.${lang}.jsonl`)).sort())
  // Excel's: the sample's question, the program that works out the growth from sales.csv, and its chart.
  const app = JSON.parse(await readFile(new URL('../app/locales/fr.json', import.meta.url), 'utf8'))
  const excel = tasks['demos/excel.fr.jsonl'].slice(1)
  assert.deepEqual(excel.filter((record) => record.step === undefined).map(({ update }) => update.content.name ?? update.content.text), ['sales.csv', app['starter.sample.prompt']])
  const program = excel.map(({ update }) => update).find((update) => update.name === 'javascript')
  assert.match(program.rawInput.code, /csv\(await file\("sales\.csv"\)\)/)
  assert.deepEqual(JSON.parse(program.rawOutput).map((/** @type {any} */ row) => row.product), ['Coffee', 'Tea', 'Hot chocolate', 'Juice'])
  assert.deepEqual(JSON.parse(/```echarts\n(.*)\n```/.exec(excel.at(-1).update.content.text)?.[1] ?? 'null').series[0].data, [24, -11, 9, 169])
  // Its guided tour beside it, alone among them: each stop at a line of the task, one of its calls or its end, in the page's words, filled.
  assert.deepEqual(Object.keys(site.files).filter((path) => path.endsWith('.tour.json')).sort(), ['demos/excel.en.tour.json', 'demos/excel.fr.tour.json', 'demos/excel.ko.tour.json'])
  for (const lang of ['en', 'fr', 'ko']) {
    const task = tasks[`demos/excel.${lang}.jsonl`]
    const moments = new Set(['end', ...task.map((_, i) => i + 1), ...task.map(({ update }) => update?.toolCallId).filter(Boolean)])
    const { stops } = JSON.parse(site.files[`demos/excel.${lang}.tour.json`])
    const words = Object.entries(site.words.get('excel')?.[lang] ?? {}).filter(([key]) => key.startsWith('tour.'))
    assert.equal(stops.length, words.length, lang)
    for (const { at, say } of stops) {
      assert.ok(moments.has(at), `${lang}: ${at}`)
      assert.ok(say && !/[{}]/.test(say), `${lang}: ${say}`)
    }
  }
  // Slides': a deck in the answer, a slide on its layout for each of the six titles its replay names, its figures the sample notes' and what they come to.
  for (const lang of ['en', 'fr', 'ko']) {
    const { slides } = parseDeck(/````deck\n([\s\S]*)\n````/.exec(tasks[`demos/slides.${lang}.jsonl`].at(-1).update.content.text)?.[1] ?? '')
    const growth = new Intl.NumberFormat(lang, { style: 'percent', signDisplay: 'exceptZero' }).format, money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format
    assert.deepEqual(slides.map(({ settings }) => settings.layout), ['cover', 'metrics', 'default', 'bento', 'timeline', 'process'], lang)
    assert.deepEqual(slides.map(({ title }) => title), site.words.get('slides')?.[lang]['replay.slides'].map((/** @type {string} */ title) => title.replace('{growth}', growth(0.122))), lang)
    const words = slides.map(({ slots }) => slots[0].text)
    assert.ok(words[1].includes(`**${growth(0.3)}**`), `${lang}: the growth since the first quarter`)
    for (const sold of [142_000, 164_000, 184_000]) assert.ok(words[2].includes(`"formatter":"${money(sold)}"`), `${lang}: ${sold}`)
    for (const sold of [18_000, 11_000, 7_000]) assert.ok(words[3].includes(money(sold)), `${lang}: ${sold}`)
  }
})

test('every heading with an id links to itself after its words, by a named link, its own name staying its words, and no other heading does, nor the homepage’s, whose address the app owns', async () => {
  const site = await jean()
  for (const page of site.pages) {
    for (const [, tag, attrs, words] of site.files[page.path].matchAll(/<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>/g)) {
      const id = /\sid="([^"]+)"/.exec(attrs)?.[1]
      const links = [...words.matchAll(/<a class="site-anchor" href="([^"]+)" aria-label="[^"]+"><svg [^>]+>.*?<\/svg><\/a>/g)]
      assert.deepEqual(links.map((link) => [link[1], words.endsWith(link[0])]), id && !page.fragment ? [[`#${id}`, true]] : [], `${page.path}: <${tag}${attrs}>`)
      if (links.length) assert.ok(attrs.includes(`aria-labelledby="${id}-words"`) && words.startsWith(`<span id="${id}-words">`), `${page.path}: <${tag}${attrs}> names itself by its words`)
    }
  }
})

test('prose marks a phrase with the felt-tip by its class alone, the pen drawing it as felt() does, and a mark the pen can’t draw stops the build', async () => {
  const drawn = penned('<p>Read <strong class="felt is-under">this</strong>, <em lang="en" class="felt is-circle">that</em> and <span class="felt-mark">those</span>.</p>')
  assert.match(drawn, /<strong class="felt is-under">this<svg class="felt-under" [^>]*aria-hidden="true"><path d="[^"]+"\/><\/svg><\/strong>/)
  assert.match(drawn, /<em lang="en" class="felt is-circle">that<svg class="felt-circle" [^>]*><path d="[^"]+"\/><\/svg><\/em>/)
  assert.ok(drawn.includes('<span class="felt-mark">those</span>'))
  assert.throws(() => penned('<b class="felt is-wave">no</b>'), /the pen has no “wave”/)
  assert.throws(() => penned('<span class="felt is-under">a <span>b</span> c</span>'), /holds another/)
  const site = await jean()
  for (const page of site.pages) {
    const marks = [...site.files[page.path].matchAll(/<([a-z]+)[^>]*\sclass="felt is-([a-z]+)"[^>]*>([\s\S]*?)<\/\1>/g)]
    for (const [whole, , how, words] of marks) assert.ok(words.includes(`<svg class="felt-${how}"`), `${page.path}: ${whole}`)
  }
})
