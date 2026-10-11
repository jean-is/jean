// A Kiwix server as web search's library or its Wikipedia (D254), against a stand-in that answers
// as libkiwix does; and web search's sources, searched at once (D271).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isKiwix, intro, library, searchKiwix } from '../app/caps/search/kiwix.js'
import { searchSources, onSite } from '../app/caps/search/sources.js'
import { kiwix, BOOKS } from './fixtures/kiwix.js'

const ADDRESS = 'http://kiwix.test/kiwix'

/** A fetch that answers as the stand-in, and the addresses it was asked. @param {typeof BOOKS} [books] */
function served(books) {
  /** @type {URL[]} */
  const asked = []
  const fetch = /** @type {typeof globalThis.fetch} */ (async (input) => {
    asked.push(new URL(String(input)))
    return kiwix(String(input), books)
  })
  return { fetch, asked }
}

test('MediaWiki’s API is always api.php: any other address is a Kiwix server’s', () => {
  assert.ok(!isKiwix('https://{lang}.wikipedia.org/w/api.php'))
  assert.ok(!isKiwix('https://wiki.corp.example/{lang}/w/api.php'))
  for (const address of ['http://localhost:8080', 'http://127.0.0.1:8080/', 'https://hotspot.example/kiwix/', 'http://localhost:8080/viewer#wikipedia_fr_all/Phare']) assert.ok(isKiwix(address), address)
})

test('a page’s first paragraphs, without its tables or its notes’ numbers', () => {
  const text = intro(BOOKS['wikipedia_en_100_2026-08'].pages.Lighthouse)
  assert.equal(text, 'A lighthouse is a tower designed to emit light from a system of lamps and lenses, to serve as a navigational aid for maritime pilots at sea.\nLighthouses mark dangerous coastlines & hazardous shoals.\nThe Pharos of Alexandria was among the first.')
  assert.equal(intro('<p>Lighthouses mark coastlines.</p>', 11), 'Lighthouses…')
  // A link or a pronunciation runs inside the sentence: no space where its tags were.
  assert.equal(intro('<p>Canberra (<span class="IPA"><span title="stress">ˈ</span><span>k</span>æn</span>) is the capital of <a href="Australia">Australia</a>, inland.<br>A line.</p>'),
    'Canberra (ˈkæn) is the capital of Australia, inland.\nA line.')
  assert.equal(intro('<div>No paragraph here.</div>'), '')
})

test('the books a library holds: their titles, languages and pages, from its catalogue', async () => {
  const { fetch, asked } = served()
  assert.deepEqual(await library(`${ADDRESS}/viewer#wikipedia_fr_all_mini_2025-10/Phare`, { fetch }), [
    { title: 'Wikipedia 100', languages: ['eng'], articles: 5056, category: 'wikipedia' },
    { title: 'Wikipédia', languages: ['fra'], articles: 2687612, category: 'wikipedia' },
    { title: 'Wikipédia & ses meilleurs articles', languages: ['fra'], articles: 52000, category: 'wikipedia' },
  ])
  // The address of its reader, or of a page in it, leads to the same catalogue.
  await library(`${ADDRESS}/content/wikipedia_fr_all_mini_2025-10/Phare`, { fetch })
  assert.deepEqual(asked.map((url) => url.href), [`${ADDRESS}/catalog/v2/entries?count=-1`, `${ADDRESS}/catalog/v2/entries?count=-1`])
})

test('a search in the user’s language: its books alone, each page read, its address under the server’s root', async () => {
  const { fetch, asked } = served()
  const { pages, languages } = await searchKiwix(ADDRESS, 'lighthouse', 'en', { fetch })
  assert.deepEqual(languages, ['en', 'fr'])
  assert.deepEqual(pages.map((page) => page.title), ['Lighthouse', 'Phare du Créac’h'])
  assert.equal(pages[0].url, `${ADDRESS}/content/wikipedia_en_100_2026-08/Lighthouse`)
  assert.match(pages[0].extract, /^A lighthouse is a tower/)
  const search = asked.find((url) => url.pathname === '/kiwix/search')
  assert.equal(search?.searchParams.get('books.filter.lang'), 'eng')
  assert.equal(search?.searchParams.get('format'), 'xml')
  assert.equal(search?.searchParams.get('pageLength'), '5')
})

test('a page two books hold is found once', async () => {
  const { pages } = await searchKiwix(`${ADDRESS}/`, 'phare', 'fr', served())
  assert.deepEqual(pages.map((page) => [page.title, page.url]), [['Phare', `${ADDRESS}/content/wikipedia_fr_all_mini_2025-10/Phare`]])
  assert.equal(pages[0].extract, 'Un phare est une tour munie d’une source lumineuse, qui guide les navires.')
})

test('a language the library lacks: nothing searched, and the languages it has', async () => {
  const { fetch, asked } = served()
  assert.deepEqual(await searchKiwix(ADDRESS, 'lighthouse', 'ja', { fetch }), { pages: [], languages: ['en', 'fr'] })
  assert.ok(!asked.some((url) => url.pathname.endsWith('/search')))
})

test('a library in one language is searched whatever the language asked', async () => {
  const { pages } = await searchKiwix(ADDRESS, 'phare', 'ja', served({ 'wikipedia_fr_all_mini_2025-10': BOOKS['wikipedia_fr_all_mini_2025-10'] }))
  assert.deepEqual(pages.map((page) => page.title), ['Phare'])
})

test('a page that can’t be read keeps the search’s snippet; a search refused says so', async () => {
  const fetch = /** @type {typeof globalThis.fetch} */ (async (input) => (String(input).includes('/content/') ? new Response('', { status: 404 }) : kiwix(String(input))))
  const { pages } = await searchKiwix(ADDRESS, 'phare', 'fr', { fetch })
  assert.equal(pages[0].extract, 'Phare Un phare est une tour munie d’une source lumineuse, qui guide les navires....')
  const refused = /** @type {typeof globalThis.fetch} */ (async (input) => (String(input).includes('/search') ? new Response('', { status: 400 }) : kiwix(String(input))))
  await assert.rejects(searchKiwix(ADDRESS, 'phare', 'fr', { fetch: refused }), /The library answered 400/)
})

const VIKIDIA = 'https://{lang}.vikidia.test/w/api.php'
/** The stand-in, Vikidia's search beside it, and the addresses asked. @param {typeof BOOKS} [books] */
function sourcesServed(books) {
  const { fetch: library, asked } = served(books)
  const fetch = /** @type {typeof globalThis.fetch} */ (async (input, init) => {
    const url = new URL(String(input))
    if (!url.hostname.endsWith('vikidia.test')) return library(input, init)
    asked.push(url)
    return Response.json({ query: { pages: [{ index: 1, title: 'Phare', fullurl: 'https://fr.vikidia.test/wiki/Phare', extract: 'Un phare est un bâtiment qui guide les marins.' }] } })
  })
  return { fetch, asked }
}

test('the sources on are searched at once, three pages from each; Wikipedia from a Kiwix server reads its Wikipedia books alone (D271)', async () => {
  const { fetch, asked } = sourcesServed({ ...BOOKS, 'vikidia_fr_all_maxi_2025-10': { title: 'Vikidia', lang: 'fra', articles: 40000, pages: { Phare: '<p>Un phare guide les marins.</p>' } } })
  const { pages, notes } = await searchSources([{ id: 'wikipedia', address: ADDRESS }, { id: 'vikidia', address: VIKIDIA }], 'phare', 'fr', { fetch })
  assert.deepEqual(pages.map((page) => page.url), [`${ADDRESS}/content/wikipedia_fr_all_mini_2025-10/Phare`, 'https://fr.vikidia.test/wiki/Phare'])
  assert.deepEqual(notes, [])
  const search = asked.find((url) => url.pathname === '/kiwix/search')
  assert.equal(search?.searchParams.get('books.filter.category'), 'wikipedia')
  assert.equal(search?.searchParams.get('pageLength'), '3')
  assert.equal(asked.find((url) => url.hostname === 'fr.vikidia.test')?.searchParams.get('gsrlimit'), '3')
  // The library itself reads every book: Vikidia's too.
  const library = await searchSources([{ id: 'kiwix', address: ADDRESS }], 'marins', 'fr', { fetch })
  assert.deepEqual(library.pages.map((page) => page.title), ['Phare'])
  assert.match(library.pages[0].url, /vikidia_fr_all_maxi/)
})

test('a source with nothing in the language says which it has; one that doesn’t answer is told of; none answering fails', async () => {
  const { fetch } = sourcesServed()
  assert.deepEqual(await searchSources([{ id: 'vikidia', address: VIKIDIA }, { id: 'kiwix', address: ADDRESS }], 'phare', 'ja', { fetch }), { pages: [], notes: [
    'Vikidia has no edition in "ja". Search again with one of its languages: fr, en, es, it, de, pt, ru, uk, ar, ca, eu, el, hy, oc, scn.',
    'The library has no books in "ja". Search again with one of its languages: en, fr.',
  ] })
  const down = /** @type {typeof globalThis.fetch} */ (async (input, init) => (String(input).includes('vikidia') ? Promise.reject(new TypeError('Failed to fetch')) : fetch(input, init)))
  const { pages, notes } = await searchSources([{ id: 'vikidia', address: VIKIDIA }, { id: 'kiwix', address: ADDRESS }], 'phare', 'fr', { fetch: down })
  assert.deepEqual([pages.length, notes], [1, ["Vikidia didn't answer."]])
  await assert.rejects(searchSources([{ id: 'vikidia', address: VIKIDIA }], 'phare', 'fr', { fetch: down }), /Failed to fetch/)
})

test('a page of Vikidia’s site, in any language, is known before it is tried; a Kiwix server standing for it is not (D271)', () => {
  const vikidia = 'https://{lang}.vikidia.org/w/api.php'
  assert.equal(onSite(vikidia, 'https://fr.vikidia.org/wiki/Phare'), true)
  assert.equal(onSite(vikidia, 'https://vikidia.org/'), true)
  assert.equal(onSite(vikidia, 'https://fr.wikipedia.org/wiki/Phare'), false)
  assert.equal(onSite(vikidia, 'https://notvikidia.org/'), false)
  assert.equal(onSite(`${ADDRESS}/`, `${ADDRESS}/content/vikidia_fr_all_maxi_2025-10/Phare`), false)
  assert.equal(onSite('', 'https://fr.vikidia.org/'), false)
})
