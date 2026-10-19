// What search engines and shared links read of a web deploy that names its address (D355).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { SHARE } from '../scripts/manifest.js'
import { BRAND } from '../app/brand.js'
import { LISTED, PUBLISHER, addressOf, datesOf, listedPages, siteBase, siteFiles, titleOf, unindexed, withCanonical, withSite, wordsOf } from '../scripts/seo.js'

const read = (/** @type {string} */ path) => readFile(new URL(`../app/${path}`, import.meta.url), 'utf8')

test('a site’s address is whole and ends in /, or names ADDRESS', () => {
  for (const address of ['https://example.org', 'https://example.org/']) assert.equal(siteBase(address), 'https://example.org/')
  assert.equal(siteBase('https://example.org/teams/jean'), 'https://example.org/teams/jean/')
  for (const address of ['ftp://example.org/', 'https://example.org/?q=1', 'https://example.org/#/', 'https://me@example.org/', 'example.org']) assert.throws(() => siteBase(address), /ADDRESS/, address)
})

test('the home page’s title, canonical address, cards and schema.org data, once, in whole addresses', async () => {
  const page = await read('index.html')
  const description = /<meta name="description" content="([^"]*)">/.exec(page)?.[1] ?? ''
  assert.equal(titleOf({ name: 'Jean' }, 'Runs in a tab. Nothing to install.'), 'Jean · Runs in a tab')
  const html = withSite(page, 'https://example.org/', BRAND, description, ['en', 'ja'])
  const content = (/** @type {string} */ property) => new RegExp(`<meta property="${property}" content="([^"]*)">`).exec(html)?.[1]
  assert.match(html, new RegExp(`<title>${titleOf({ name: 'Jean' }, description)}</title>`))
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.org\/">/)
  assert.equal(content('og:url'), 'https://example.org/')
  assert.equal(content('og:image'), `https://example.org/${SHARE.src}`)
  assert.equal(content('og:image:width'), String(SHARE.width))
  assert.equal(content('og:description'), description)
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/)
  assert.ok(html.indexOf('rel="canonical"') < html.indexOf('</head>'))
  const data = JSON.parse(/<script type="application\/ld\+json">(.*)<\/script>/.exec(html)?.[1] ?? '')
  assert.deepEqual(data['@graph'].map((/** @type {any} */ thing) => [thing['@type'], thing.name, thing.url]), [['WebSite', 'Jean', 'https://example.org/'], ['WebApplication', 'Jean', 'https://example.org/']])
  assert.deepEqual(data['@graph'][1].inLanguage, ['en', 'ja'])
  // An organisation's copy names neither the brand's domain nor its publisher.
  assert.ok(data['@graph'].every((/** @type {any} */ thing) => !('alternateName' in thing) && !('publisher' in thing)))
  assert.ok(!html.includes(PUBLISHER.name))
  assert.throws(() => withSite(html, 'https://example.org/', BRAND, description, []), /already/)

  const odd = withSite(page, 'https://example.org/', { name: 'J "&" $& </script>', domain: 'jean.is' }, 'A <b>bold</b> $1 claim.', [])
  assert.match(odd, /<meta property="og:site_name" content="J &quot;&amp;&quot; \$&amp; &lt;\/script&gt;">/)
  assert.match(odd, /<title>J &quot;&amp;&quot; \$&amp; &lt;\/script&gt; · A &lt;b&gt;bold&lt;\/b&gt; \$1 claim<\/title>/)
  const block = /<script type="application\/ld\+json">(.*)<\/script>/.exec(odd)?.[1] ?? ''
  assert.ok(!block.includes('<'), 'nothing in the data closes its script')
  assert.equal(JSON.parse(block)['@graph'][0].name, 'J "&" $& </script>')
})

test('the brand’s own site names its domain as another name, which tells it apart from the first name, and its publisher (D355)', async () => {
  const page = await read('index.html')
  const html = withSite(page, 'https://jean.is/', BRAND, 'Runs in a tab.', ['en'], 'https://jean.is/ja')
  const graph = JSON.parse(/<script type="application\/ld\+json">(.*)<\/script>/.exec(html)?.[1] ?? '')['@graph']
  const [site, app, publisher] = graph
  assert.deepEqual(graph.map((/** @type {any} */ thing) => thing['@type']), ['WebSite', 'WebApplication', 'Organization'])
  assert.deepEqual(site.alternateName, ['jean.is'])
  assert.deepEqual([site.publisher, app.publisher], [{ '@id': 'https://jean.is/#publisher' }, { '@id': 'https://jean.is/#publisher' }])
  assert.deepEqual(publisher, { '@type': 'Organization', '@id': 'https://jean.is/#publisher', name: PUBLISHER.name, url: 'https://jean.is/', logo: 'https://jean.is/icons/icon-512.png', sameAs: PUBLISHER.sameAs })
  // As the legal notice names it, with a logo that ships, and profiles that are whole addresses.
  assert.match(await read('terms.html'), new RegExp(`<strong>Publisher:</strong> ${PUBLISHER.name}, `))
  assert.ok((await readFile(new URL('../app/icons/icon-512.png', import.meta.url))).length > 0)
  assert.deepEqual(PUBLISHER.sameAs.map((address) => URL.parse(address)?.host), ['github.com', 'huggingface.co', 'www.npmjs.com'])
  for (const address of PUBLISHER.sameAs) assert.equal(URL.parse(address)?.protocol, 'https:', address)
})

test('every page but the home page, the privacy policy and the terms is kept out of search results, once', async () => {
  for (const path of ['sandbox.html', 'preview.html', 'check.html', 'caps/browser/browser.html']) {
    const html = unindexed(await read(path))
    assert.equal(html.match(/<meta name="robots" content="noindex">/g)?.length, 1, path)
    assert.ok(html.indexOf('name="robots"') < html.indexOf('<title>'), path)
    assert.throws(() => unindexed(html), /already/, path)
  }
})

test('the privacy policy, the terms and where files go stay listed, each at its one address without .html (D356, D381)', async () => {
  assert.deepEqual(LISTED, ['privacy.html', 'terms.html', 'files.html'])
  assert.equal(addressOf('https://example.org/teams/jean/', 'privacy.html'), 'https://example.org/teams/jean/privacy')
  for (const path of LISTED) {
    const page = await read(path)
    assert.doesNotMatch(page, /name="robots"/, path)
    const html = withCanonical(page, addressOf('https://example.org/', path))
    assert.equal(html.match(/<link rel="canonical"/g)?.length, 1, path)
    assert.match(html, new RegExp(`<link rel="canonical" href="https://example\\.org/${path.slice(0, -'.html'.length)}">\\n</head>`), path)
    assert.throws(() => withCanonical(html, 'https://example.org/'), /already/, path)
  }
  assert.match(withCanonical('<head></head>', 'https://example.org/a?b&c'), /href="https:\/\/example\.org\/a\?b&amp;c"/)
})

/** A page as build:web serves it: its canonical address, and its language versions, or noindex. @param {string} canonical @param {string[]} [versions] */
const pageAt = (canonical, versions = [], words = 'Hello') => `<!doctype html><html><head><meta charset="utf-8"><title>${words}</title>
${canonical ? `<link rel="canonical" href="${canonical}">` : '<meta name="robots" content="noindex">'}
${versions.map((version) => `<link rel="alternate" hreflang="${version.split(' ')[0]}" href="${version.split(' ')[1]}">`).join('\n')}
</head><body><p>${words}</p></body></html>`

test('robots.txt lets crawlers read everything and names the sitemap, at a host’s root alone', () => {
  const root = siteFiles('https://example.org/', new Map([['https://example.org/', ''], ['https://example.org/privacy', '']]))
  assert.equal(root['robots.txt'], 'User-agent: *\nAllow: /\n\nSitemap: https://example.org/sitemap.xml\n')
  assert.deepEqual([...root['sitemap.xml'].matchAll(/<url><loc>([^<]*)<\/loc><\/url>/g)].map(([, address]) => address), ['https://example.org/', 'https://example.org/privacy'])
  const nested = siteFiles('https://example.org/teams/jean/', new Map([['https://example.org/teams/jean/', '']]))
  assert.deepEqual(Object.keys(nested), ['sitemap.xml'])
  assert.match(nested['sitemap.xml'], /<loc>https:\/\/example\.org\/teams\/jean\/<\/loc>/)
  const dated = siteFiles('https://example.org/', new Map([['https://example.org/?a&b', '']]), new Map([['https://example.org/?a&b', '2026-10-19T08:00:00Z']]))
  assert.match(dated['sitemap.xml'], /<url><loc>https:\/\/example\.org\/\?a&amp;b<\/loc><lastmod>2026-10-19T08:00:00Z<\/lastmod><\/url>/)
})

test('the sitemap lists every page served without noindex, at its canonical address, sorted (D431)', async () => {
  const base = 'https://example.org/'
  const pages = {
    'terms.html': withCanonical(await read('terms.html'), addressOf(base, 'terms.html')),
    'index.html': pageAt(base),
    'check.html': unindexed(await read('check.html')),
    'odd.html': pageAt(`${base}a?b&amp;c`),
  }
  assert.deepEqual([...listedPages(base, pages).keys()], [base, `${base}a?b&c`, `${base}terms`])
  assert.throws(() => listedPages(base, { ...pages, 'new.html': '<html><head></head></html>' }), /new\.html has neither a canonical address nor noindex/)
  assert.throws(() => listedPages(base, { ...pages, 'index2.html': pageAt(base) }), /index2\.html has the canonical address of another page/)
  assert.throws(() => listedPages(base, { 'far.html': pageAt('https://elsewhere.example/') }), /outside/)
})

test('language versions in the sitemap each name the same set, themselves among them, or the build stops (D431)', () => {
  const base = 'https://example.org/'
  const both = [`en ${base}`, `fr ${base}fr`, `x-default ${base}`]
  assert.equal(listedPages(base, { 'index.html': pageAt(base, both), 'fr.html': pageAt(`${base}fr`, both) }).size, 2)
  assert.throws(() => listedPages(base, { 'index.html': pageAt(base, both) }), /names https:\/\/example\.org\/fr as a language version, which the site doesn’t list|which the site doesn't list/)
  assert.throws(() => listedPages(base, { 'index.html': pageAt(base, both), 'fr.html': pageAt(`${base}fr`, [`fr ${base}fr`]) }), /don't name the same language versions/)
  assert.throws(() => listedPages(base, { 'index.html': pageAt(base, [`fr ${base}fr`]), 'fr.html': pageAt(`${base}fr`, [`fr ${base}fr`]) }), /names its other languages but not itself/)
})

test('a page’s date moves only when what it says does: its words, title, links and language versions, not its style or scripts (D431)', () => {
  const page = pageAt('https://example.org/', ['en https://example.org/'])
  assert.equal(wordsOf(page.replace('</head>', '<style>p { color: red }</style><script type="module" src="ui/app.js"></script><link rel="modulepreload" href="ui/x.js"></head>')), wordsOf(page))
  assert.equal(wordsOf(page.replace('<p>Hello</p>', '<p class="lead">\n  Hello  </p><!-- a note -->')), wordsOf(page))
  for (const changed of [page.replace('<p>Hello</p>', '<p>Hello there</p>'), page.replace('<title>Hello', '<title>Hi'), page.replace('<p>Hello</p>', '<p><a href="family">Hello</a></p>'),
    page.replace('</head>', '<meta name="description" content="New"></head>'), page.replace('</head>', '<link rel="alternate" hreflang="fr" href="https://example.org/fr"></head>'),
    page.replace('</head>', '<script type="application/ld+json">{"name":"Jean"}</script></head>')]) assert.notEqual(wordsOf(changed), wordsOf(page))
})

test('each page keeps the live site’s date while it says the same, and takes the build’s when it changed or is new; the live site unread, no dates (D431)', async () => {
  const base = 'https://example.org/'
  const now = new Date('2026-10-19T18:30:00.123Z')
  const listed = new Map([[base, pageAt(base)], [`${base}fr`, pageAt(`${base}fr`, [], 'Bonjour')], [`${base}new`, pageAt(`${base}new`)], [`${base}gone`, pageAt(`${base}gone`)], [`${base}undated`, pageAt(`${base}undated`)]])
  /** @type {Record<string, string>} */
  const live = {
    [`${base}sitemap.xml`]: `<urlset>\n  <url><loc>${base}</loc><lastmod>2026-10-01T00:00:00Z</lastmod></url>\n  <url><loc>${base}fr</loc><lastmod>2026-10-02T00:00:00Z</lastmod></url>\n  <url><loc>${base}gone</loc><lastmod>2026-10-03T00:00:00Z</lastmod></url>\n  <url><loc>${base}undated</loc></url>\n</urlset>`,
    [base]: pageAt(base).replace('</head>', '<style>p { margin: 0 }</style></head>'),
    [`${base}fr`]: pageAt(`${base}fr`, [], 'Salut'),
    [`${base}undated`]: pageAt(`${base}undated`),
  }
  /** @type {string[]} */
  const asked = []
  const get = async (/** @type {string} */ url) => {
    asked.push(url)
    return url in live ? new Response(live[url]) : new Response('', { status: 404 })
  }
  const dates = await datesOf(base, listed, now, get)
  assert.deepEqual(Object.fromEntries(dates ?? []), {
    [base]: '2026-10-01T00:00:00Z',
    [`${base}fr`]: '2026-10-19T18:30:00Z',
    [`${base}new`]: '2026-10-19T18:30:00Z',
    [`${base}gone`]: '2026-10-19T18:30:00Z',
    [`${base}undated`]: '2026-10-19T18:30:00Z',
  })
  assert.deepEqual(asked.sort(), [base, `${base}fr`, `${base}gone`, `${base}sitemap.xml`], 'only the pages the live sitemap dates are read')
  const first = await datesOf(base, listed, now, async () => new Response('', { status: 404 }))
  assert.deepEqual([...first?.values() ?? []], Array(5).fill('2026-10-19T18:30:00Z'), 'a site’s first sitemap dates every page by its build')
  assert.equal(await datesOf(base, listed, now, async () => { throw new TypeError('fetch failed') }), null)
  assert.equal(await datesOf(base, listed, now, async (url) => url.endsWith('sitemap.xml') ? new Response(live[url]) : new Response('', { status: 503 })), null)
})
