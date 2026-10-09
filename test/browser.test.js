// The browser (D140), the parts with no browser in them: what a typed address leads to, which
// pages can show beside the conversation, where Back and Forward go, a page's text for the
// brain, and how this browser installs a site as an app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addressOf, showable, siteOf, pageText, installer, Trail } from '../caps/browser/pages.js'

const SEARCH = 'https://{lang}.wikipedia.org/w/index.php?search={query}'

test('an address, a site or words: where the address field leads', () => {
  assert.equal(addressOf('https://example.com/a?b=1', SEARCH), 'https://example.com/a?b=1')
  assert.equal(addressOf('  example.com  ', SEARCH), 'https://example.com/')
  assert.equal(addressOf('bakery.example.org/menu#bread', SEARCH), 'https://bakery.example.org/menu#bread')
  assert.equal(addressOf('bücher.de', SEARCH), 'https://xn--bcher-kva.de/')
  assert.equal(addressOf('localhost:3000/app', SEARCH), 'http://localhost:3000/app')
  assert.equal(addressOf('127.0.0.1:8080', SEARCH), 'http://127.0.0.1:8080/')
  assert.equal(addressOf('example.com:8443/x', SEARCH), 'https://example.com:8443/x')
  // Words are looked up, in the user's language; so is anything that only looks like a number.
  assert.equal(addressOf('sourdough bread', SEARCH, 'fr'), 'https://fr.wikipedia.org/w/index.php?search=sourdough%20bread')
  assert.equal(addressOf('3.14', SEARCH), 'https://en.wikipedia.org/w/index.php?search=3.14')
  assert.equal(addressOf('パン 作り方', SEARCH, 'ja'), 'https://ja.wikipedia.org/w/index.php?search=%E3%83%91%E3%83%B3%20%E4%BD%9C%E3%82%8A%E6%96%B9')
  // Any other scheme leads nowhere: scripts, files, data.
  for (const typed of ['javascript:alert(1)', 'JavaScript:alert(1)', 'file:///etc/passwd', 'data:text/html,<b>x</b>', 'blob:https://a/b', 'about:blank', 'mailto:a@b.c', '']) {
    assert.equal(addressOf(typed, SEARCH), null, typed)
  }
})

test('a page shows beside the conversation only from another site, and over https unless it is on this computer', () => {
  const jean = 'https://jean.is/'
  assert.ok(showable('https://example.com/', jean))
  assert.ok(showable('http://localhost:3000/', jean))
  assert.ok(showable('http://127.0.0.1:4181/site/', jean))
  assert.ok(!showable('http://example.com/', jean), 'a secure page can\'t frame an insecure one')
  assert.ok(showable('http://example.com/', 'http://127.0.0.1:4173/'), 'Jean itself over http (development)')
  assert.ok(!showable('https://jean.is/index.html', jean), 'never Jean itself')
  assert.ok(!showable('javascript:alert(1)', jean))
  assert.ok(!showable('not an address', jean))
  assert.equal(siteOf('https://www.Example.com:8443/a'), 'www.example.com:8443')
  assert.equal(siteOf('nope'), '')
})

test('a page’s words, title and whether it installs as an app', () => {
  const page = pageText(`<!doctype html><html><head><title>Bakery &amp; Caf&eacute;</title>
    <link rel="manifest" href="/app.webmanifest"><style>p { color: red }</style><script>var secret = 1</script></head>
    <body><nav>Home</nav><h1>Fresh bread</h1><p>Open from <b>7</b>&nbsp;am.</p><!-- hidden -->
    <ul><li>Croissants &#8212; 2&#8364;</li><li>Baguette &#x2013; 1&#8364;</li></ul><noscript>Turn on scripts</noscript><svg><text>logo</text></svg></body></html>`)
  assert.equal(page.title, 'Bakery & Café')
  assert.ok(page.manifest)
  assert.equal(page.text, 'Home\nFresh bread\nOpen from 7 am.\nCroissants — 2€\nBaguette – 1€')
  assert.ok(!pageText('<p>x</p>').manifest)
  assert.equal(pageText('<p>' + 'a'.repeat(50) + '</p>', 20).text, 'a'.repeat(20) + '…')
})

test('how this browser installs a site as an app', () => {
  const ua = (/** @type {string} */ text) => ({ userAgent: text })
  assert.equal(installer({ userAgent: '', userAgentData: { brands: [{ brand: 'Microsoft Edge' }, { brand: 'Chromium' }], mobile: false } }), 'edge')
  assert.equal(installer({ userAgent: '', userAgentData: { brands: [{ brand: 'Google Chrome' }, { brand: 'Chromium' }], mobile: false } }), 'chrome')
  assert.equal(installer({ userAgent: '', userAgentData: { brands: [{ brand: 'Brave' }, { brand: 'Chromium' }], mobile: false } }), 'other')
  assert.equal(installer({ userAgent: '', userAgentData: { brands: [{ brand: 'Google Chrome' }], mobile: true } }), 'phone')
  assert.equal(installer(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')), 'safari')
  assert.equal(installer({ ...ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'), maxTouchPoints: 5 }), 'phone', 'an iPad says it is a Mac')
  assert.equal(installer(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')), 'phone')
  assert.equal(installer(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0')), 'none')
  assert.equal(installer(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0')), 'edge')
})

test('Back and Forward: the addresses Jean opened, and the pages a site went to in its own history', () => {
  const trail = new Trail()
  assert.ok(!trail.canBack && !trail.canForward)
  trail.open('https://a.example/')
  assert.equal(trail.loaded(10, 0), false, 'the page it was asked for')
  trail.open('https://b.example/')
  trail.loaded(10, 0)
  assert.ok(trail.canBack && !trail.canForward)
  // A link followed in the page adds to the tab's history: Back walks it.
  assert.ok(!trail.moved)
  assert.equal(trail.loaded(11, 100), true, 'moved on by itself')
  assert.ok(trail.moved, 'its address can\'t be read now')
  assert.equal(trail.loaded(12, 200), true)
  assert.equal(trail.back(300), 'history')
  assert.equal(trail.loaded(12, 400), false, 'the page Back went to')
  assert.ok(trail.canForward)
  assert.equal(trail.forward(500), 'history')
  assert.equal(trail.back(600), 'history')
  assert.equal(trail.back(700), 'history')
  assert.ok(!trail.moved, 'back on the address Jean opened')
  // Back past the site's own pages: the address Jean opened before, in a fresh frame.
  assert.equal(trail.back(800), 'https://a.example/')
  trail.loaded(10, 900)
  assert.equal(trail.forward(1000), 'https://b.example/')
  trail.loaded(10, 1100)
  assert.ok(!trail.canForward)
  // Opening another address drops what was ahead.
  trail.back(1200)
  trail.loaded(10, 1300)
  trail.open('https://c.example/')
  trail.loaded(10, 1400)
  assert.ok(!trail.canForward)
  assert.equal(trail.reload(), 'https://c.example/')
})

test('Back never walks history that may not be the site’s own', () => {
  const trail = new Trail()
  trail.open('https://a.example/')
  trail.loaded(10, 0)
  trail.loaded(11, 100)
  // The page replaced itself, or the browser's own buttons moved it: nothing to walk back safely.
  trail.loaded(11, 9000)
  assert.ok(trail.moved)
  assert.equal(trail.back(9100), null, 'nothing before the first address')
  trail.loaded(12, 9200)
  assert.ok(trail.canBack)
  // Jean changed the tab's history too (another conversation): its own pages first.
  trail.elsewhere()
  assert.equal(trail.back(9300), null)
  assert.ok(trail.moved, 'still not the address opened')
  // A site that changes its address by script adds to the history without loading a page.
  trail.open('https://b.example/')
  trail.loaded(20, 10000)
  trail.sync(22)
  assert.equal(trail.back(10100), 'history')
  assert.equal(trail.back(10200), 'history')
  assert.equal(trail.back(10300), 'https://a.example/')
})

test('a page that takes the place of entries ahead is never walked back to', () => {
  const trail = new Trail()
  trail.open('https://a.example/')
  trail.loaded(10, 0)
  // After Back, a link takes the place of what was ahead: the length stays, and WebKit would walk
  // back to it by reloading Jean. Back goes to the addresses Jean opened instead.
  trail.loaded(11, 100)
  assert.equal(trail.back(200), 'history')
  trail.loaded(11, 300)
  assert.equal(trail.loaded(11, 9000), true)
  assert.ok(trail.moved)
  assert.equal(trail.back(9100), null)
  // A page after it that grows the history is walked back, to that one.
  trail.loaded(12, 9200)
  assert.equal(trail.back(9300), 'history')
  assert.equal(trail.back(9400), null)
})
