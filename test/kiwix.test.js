// A Kiwix server as web search's Wikipedia (D254), against a stand-in that answers as libkiwix does.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isKiwix, intro, library, searchKiwix } from '../app/caps/search/kiwix.js'
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
  assert.equal(intro('<div>No paragraph here.</div>'), '')
})

test('the books a library holds: their titles, languages and pages, from its catalogue', async () => {
  const { fetch, asked } = served()
  assert.deepEqual(await library(`${ADDRESS}/viewer#wikipedia_fr_all_mini_2025-10/Phare`, { fetch }), [
    { title: 'Wikipedia 100', languages: ['eng'], articles: 5056 },
    { title: 'Wikipédia', languages: ['fra'], articles: 2687612 },
    { title: 'Wikipédia & ses meilleurs articles', languages: ['fra'], articles: 52000 },
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
