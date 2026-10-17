// What search engines and shared links read of a web deploy that names its address (D355).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { SHARE } from '../scripts/manifest.js'
import { LISTED, addressOf, siteBase, siteFiles, titleOf, unindexed, withCanonical, withSite } from '../scripts/seo.js'

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
  const html = withSite(page, 'https://example.org/', { name: 'Jean' }, description, ['en', 'ja'])
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
  assert.throws(() => withSite(html, 'https://example.org/', { name: 'Jean' }, description, []), /already/)

  const odd = withSite(page, 'https://example.org/', { name: 'J "&" $& </script>' }, 'A <b>bold</b> $1 claim.', [])
  assert.match(odd, /<meta property="og:site_name" content="J &quot;&amp;&quot; \$&amp; &lt;\/script&gt;">/)
  assert.match(odd, /<title>J &quot;&amp;&quot; \$&amp; &lt;\/script&gt; · A &lt;b&gt;bold&lt;\/b&gt; \$1 claim<\/title>/)
  const block = /<script type="application\/ld\+json">(.*)<\/script>/.exec(odd)?.[1] ?? ''
  assert.ok(!block.includes('<'), 'nothing in the data closes its script')
  assert.equal(JSON.parse(block)['@graph'][0].name, 'J "&" $& </script>')
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

test('robots.txt lets crawlers read everything and names the sitemap, at a host’s root alone', () => {
  const root = siteFiles('https://example.org/')
  assert.equal(root['robots.txt'], 'User-agent: *\nAllow: /\n\nSitemap: https://example.org/sitemap.xml\n')
  assert.deepEqual([...root['sitemap.xml'].matchAll(/<url><loc>([^<]*)<\/loc><\/url>/g)].map(([, address]) => address),
    ['https://example.org/', 'https://example.org/privacy', 'https://example.org/terms', 'https://example.org/files'])
  const nested = siteFiles('https://example.org/teams/jean/')
  assert.deepEqual(Object.keys(nested), ['sitemap.xml'])
  assert.match(nested['sitemap.xml'], /<loc>https:\/\/example\.org\/teams\/jean\/<\/loc>/)
})
