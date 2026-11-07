// Search services on the user's key (D671), against stand-ins that answer as each does: Brave's,
// Tavily's, Google's and Kagi's answers, and the refusals they gave a key they didn't know.
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { SERVICES, Refused, isService, relayed, searchService } from '../app/caps/web-search/services.js'
import { searchSources } from '../app/caps/web-search/sources.js'
import { gateway, covers, SERVICES as RELAYED } from '../gateway/gateway.js'

const SECRET = { key: 'k-1' }
/** @typedef {{ url: URL, method: string, headers: Headers, body: any }} Asked */

/** A fetch that answers with this, and what it was asked. @param {unknown} answer @param {number} [status] */
function answering(answer, status = 200) {
  /** @type {Asked[]} */
  const asked = []
  const fetch = /** @type {typeof globalThis.fetch} */ (async (input, init = {}) => {
    asked.push({ url: new URL(String(input)), method: init.method ?? 'GET', headers: new Headers(init.headers), body: init.body ? JSON.parse(String(init.body)) : null })
    return Response.json(answer, { status })
  })
  return { fetch, asked }
}

const BRAVE = { web: { results: [{ title: 'The <strong>Lighthouse</strong> &amp; its keeper', url: 'https://example.test/a', description: 'A <strong>lighthouse</strong> guides ships.', thumbnail: { src: 'https://imgs.example.test/x' } }] } }
const TAVILY = { query: 'lighthouse', results: [{ title: 'Lighthouse', url: 'https://example.test/a', content: 'A lighthouse guides ships, 1 < 2.', score: 0.9 }], images: [], response_time: 1, answer: null }
const GOOGLE = { items: [{ title: 'Lighthouse', link: 'https://example.test/a', snippet: 'A lighthouse guides ships.', htmlSnippet: 'A <b>lighthouse</b> guides ships.', pagemap: {} }] }
const KAGI = { meta: { trace: 't' }, data: { search: [{ url: 'https://example.test/a', title: 'Lighthouse', snippet: 'A <b>lighthouse</b> guides ships.', time: '2026-01-01' }], image: [] } }
const GATEWAY = 'https://gateway.test/'

test('Brave: a GET through the gateway, its key in its own header, in the language asked, the tags of its text dropped', async () => {
  const { fetch, asked } = answering(BRAVE)
  assert.deepEqual(await searchService('brave', SERVICES.brave.address, SECRET, 'lighthouse', 'fr', { fetch, gateway: GATEWAY, count: 3 }),
    [{ title: 'The Lighthouse & its keeper', url: 'https://example.test/a', extract: 'A lighthouse guides ships.' }])
  const [{ url, method, headers }] = asked
  assert.equal(url.origin, new URL(GATEWAY).origin)
  const target = new URL(String(url.searchParams.get('url')))
  assert.equal(`${target.origin}${target.pathname}`, 'https://api.search.brave.com/res/v1/web/search')
  assert.deepEqual(['q', 'count', 'search_lang'].map((name) => target.searchParams.get(name)), ['lighthouse', '3', 'fr'])
  assert.equal(method, 'GET')
  assert.equal(headers.get('x-subscription-token'), 'k-1')
  assert.equal(headers.get('accept'), 'application/json')
})

test('Brave refuses a language it doesn’t name: its own names for some, none for the rest', async () => {
  const { fetch, asked } = answering(BRAVE)
  for (const lang of ['zh', 'pt', 'no', 'ja', 'sw']) await searchService('brave', SERVICES.brave.address, SECRET, 'q', lang, { fetch, gateway: GATEWAY })
  assert.deepEqual(asked.map(({ url }) => new URL(String(url.searchParams.get('url'))).searchParams.get('search_lang')), ['zh-hans', 'pt-br', 'nb', 'ja', null])
})

test('Tavily: a POST straight from the browser, its key as a bearer, its text as it is', async () => {
  const { fetch, asked } = answering(TAVILY)
  assert.deepEqual(await searchService('tavily', SERVICES.tavily.address, SECRET, 'lighthouse', 'ja', { fetch }),
    [{ title: 'Lighthouse', url: 'https://example.test/a', extract: 'A lighthouse guides ships, 1 < 2.' }])
  const [{ url, method, headers, body }] = asked
  assert.equal(url.href, 'https://api.tavily.com/search')
  assert.equal(method, 'POST')
  assert.equal(headers.get('authorization'), 'Bearer k-1')
  assert.equal(headers.get('content-type'), 'application/json')
  assert.deepEqual(body, { query: 'lighthouse', max_results: 5, language: 'ja' })
})

test('Google: straight from the browser, its search engine asked for, and its key in a header, never the address', async () => {
  const { fetch, asked } = answering(GOOGLE)
  assert.deepEqual(await searchService('google', SERVICES.google.address, { key: 'k-1', engine: 'cx-1' }, 'lighthouse', 'ar', { fetch, count: 3 }),
    [{ title: 'Lighthouse', url: 'https://example.test/a', extract: 'A lighthouse guides ships.' }])
  const [{ url, headers }] = asked
  assert.equal(`${url.origin}${url.pathname}`, 'https://www.googleapis.com/customsearch/v1')
  assert.deepEqual(['q', 'cx', 'num', 'hl'].map((name) => url.searchParams.get(name)), ['lighthouse', 'cx-1', '3', 'ar'])
  assert.equal(headers.get('x-goog-api-key'), 'k-1')
  assert.ok(!url.href.includes('k-1'))
})

test('Kagi: a POST through the gateway, its web pages alone, without their tags', async () => {
  const { fetch, asked } = answering(KAGI)
  assert.deepEqual(await searchService('kagi', SERVICES.kagi.address, SECRET, 'lighthouse', 'fr', { fetch, gateway: GATEWAY, count: 3 }),
    [{ title: 'Lighthouse', url: 'https://example.test/a', extract: 'A lighthouse guides ships.' }])
  const [{ url, method, headers, body }] = asked
  assert.equal(url.searchParams.get('url'), 'https://kagi.com/api/v1/search')
  assert.equal(method, 'POST')
  assert.equal(headers.get('authorization'), 'Bearer k-1')
  assert.deepEqual(body, { query: 'lighthouse', limit: 3 })
})

test('nothing found is no page, whatever shape each gives it', async () => {
  for (const [id, answer] of /** @type {const} */ ([['brave', {}], ['tavily', { results: [] }], ['google', { searchInformation: {} }], ['kagi', { data: {} }]])) {
    assert.deepEqual(await searchService(id, SERVICES[id].address, SECRET, 'q', 'en', { ...answering(answer), gateway: GATEWAY }), [], id)
  }
})

test('pages keep to the count asked and to http(s), their text as long as Wikipedia’s', async () => {
  const results = [{ title: 'Bad', url: 'javascript:alert(1)', content: '' }, ...Array.from({ length: 8 }, (_, i) => ({ title: `P${i}`, url: `https://example.test/${i}`, content: 'x'.repeat(5000) }))]
  const pages = await searchService('tavily', SERVICES.tavily.address, SECRET, 'q', 'en', { ...answering({ results }), count: 3 })
  assert.deepEqual(pages.map((page) => page.title), ['P0', 'P1', 'P2'])
  assert.equal(pages[0].extract.length, 1200)
})

test('a key refused, as each refuses one, or none left, says so; a service down isn’t refusing', async () => {
  // Brave's 422, Tavily's 401, Google's and Kagi's 400: what they answered a key they didn't know, on 2026-11-01.
  for (const [id, status] of /** @type {const} */ ([['brave', 422], ['tavily', 401], ['google', 400], ['kagi', 400], ['tavily', 429], ['kagi', 402]])) {
    await assert.rejects(searchService(id, SERVICES[id].address, SECRET, 'q', 'en', { ...answering({}, status), gateway: GATEWAY }),
      (/** @type {Error} */ error) => error instanceof Refused && error.message.includes(SERVICES[id].name) && !error.message.includes('k-1'), `${id} ${status}`)
  }
  await assert.rejects(searchService('tavily', SERVICES.tavily.address, SECRET, 'q', 'en', answering({}, 503)),
    (/** @type {Error} */ error) => !(error instanceof Refused) && /Tavily answered 503/.test(error.message))
})

test('no key, or no gateway for one that refuses browsers: nothing is asked, and the brain is told what the user can do', async () => {
  const { fetch, asked } = answering(TAVILY)
  await assert.rejects(searchService('tavily', SERVICES.tavily.address, null, 'q', 'en', { fetch }), /Tavily has no key on this device\. The user can add one in Settings › Web search\./)
  await assert.rejects(searchService('kagi', SERVICES.kagi.address, SECRET, 'q', 'en', { fetch }), /Kagi needs a gateway to be reached from here\./)
  assert.equal(asked.length, 0)
})

test('an address put in a service’s place is reached as it is: an organisation’s own needs no gateway', async () => {
  assert.equal(relayed('brave', SERVICES.brave.address), true)
  assert.equal(relayed('brave', 'https://search.corp.example/brave'), false)
  assert.equal(relayed('tavily', SERVICES.tavily.address), false)
  const { fetch, asked } = answering(BRAVE)
  await searchService('brave', 'https://search.corp.example/brave', SECRET, 'q', 'en', { fetch })
  assert.equal(asked[0].url.origin, 'https://search.corp.example')
})

test('what a browser can’t read, as Tavily’s refusal of a key, is asked again through the gateway when one is named; a request stopped is not', async () => {
  /** @type {string[]} */
  const asked = []
  const fetch = /** @type {typeof globalThis.fetch} */ (async (input) => {
    asked.push(String(input))
    if (new URL(String(input)).hostname === 'api.tavily.com') throw new TypeError('Failed to fetch')
    return Response.json({}, { status: 401 })
  })
  await assert.rejects(searchService('tavily', SERVICES.tavily.address, SECRET, 'q', 'en', { fetch, gateway: GATEWAY }), Refused)
  assert.deepEqual(asked, [SERVICES.tavily.address, `${GATEWAY}?url=${encodeURIComponent(SERVICES.tavily.address)}`])
  // With none named, it is no refusal: it may be the key, or the service, and the page says both.
  await assert.rejects(searchService('tavily', SERVICES.tavily.address, SECRET, 'q', 'en', { fetch }), (/** @type {Error} */ error) => error instanceof TypeError)
  asked.length = 0
  const stopped = /** @type {typeof globalThis.fetch} */ (async (input) => {
    asked.push(String(input))
    throw new DOMException('Stopped', 'AbortError')
  })
  await assert.rejects(searchService('tavily', SERVICES.tavily.address, SECRET, 'q', 'en', { fetch: stopped, gateway: GATEWAY }), /Stopped/)
  assert.equal(asked.length, 1)
})

test('each source from the web has its brand’s logo, a plain drawing that scales, among connections’ own (D159)', async () => {
  for (const [id, logo] of [...Object.entries(SERVICES).map(([id, { logo }]) => [id, logo]), ['wikipedia', 'wikipedia.svg'], ['vikidia', 'vikidia.svg']]) {
    const file = String(await readFile(new URL(`../app/caps/connections/logos/${logo}`, import.meta.url)))
    assert.match(file, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*viewBox=/, id)
    assert.doesNotMatch(file, /<script|<foreignObject|<image|href=|url\((?!#)/i, id)
  }
})

test('a source is a service only by its own name', () => {
  assert.ok(isService('kagi'))
  for (const id of ['wikipedia', 'kiwix', 'constructor', 'toString', '']) assert.ok(!isService(id), id)
})

test('searched beside the others, three pages each; one refused is told of in its own words, another down by its name (D271, D671)', async () => {
  const WIKI = 'https://{lang}.wiki.test/w/api.php'
  /** @type {string[]} */
  const keys = []
  const fetch = /** @type {typeof globalThis.fetch} */ (async (input, init = {}) => {
    const url = new URL(String(input))
    keys.push(new Headers(init.headers).get('authorization') ?? '')
    if (url.hostname === 'api.tavily.com') return Response.json(TAVILY)
    if (url.hostname === 'kagi.com' || url.searchParams.get('url')?.includes('kagi.com')) return Response.json({}, { status: 400 })
    if (url.searchParams.has('url')) return Response.json({}, { status: 503 })
    return Response.json({ query: { pages: [{ index: 1, title: 'Phare', fullurl: 'https://fr.wiki.test/wiki/Phare', extract: 'Un phare.' }] } })
  })
  const keyOf = async (/** @type {string} */ id) => ({ key: `key-of-${id}` })
  const { pages, notes } = await searchSources([{ id: 'wikipedia', address: WIKI }, { id: 'tavily', address: SERVICES.tavily.address }, { id: 'kagi', address: SERVICES.kagi.address }, { id: 'brave', address: SERVICES.brave.address }],
    'phare', 'fr', { fetch, gateway: GATEWAY, keyOf })
  assert.deepEqual(pages.map((page) => page.title), ['Phare', 'Lighthouse'])
  assert.deepEqual(notes, ['Kagi refused its key, or has no searches left on it. The user can change the key in Settings › Web search.', 'Brave Search didn\'t answer.'])
  assert.ok(keys.includes('Bearer key-of-tavily') && keys.includes('Bearer key-of-kagi'), 'each its own key')
  // Alone and refused, the error is the brain's to read.
  await assert.rejects(searchSources([{ id: 'kagi', address: SERVICES.kagi.address }], 'phare', 'fr', { fetch, gateway: GATEWAY, keyOf }), /Kagi refused its key/)
})

test('the gateway relays to the services that refuse browsers, with Brave’s key header kept and what shows where a request comes from dropped', async (t) => {
  for (const id of /** @type {const} */ (['brave', 'kagi', 'tavily'])) assert.ok(covers([...RELAYED], new URL(SERVICES[id].address)), id)
  for (const id of /** @type {const} */ (['tavily', 'google'])) assert.ok(!SERVICES[id].relayed, `${id} is tried from the browser`)
  const upstream = mock.fn(async () => Response.json(BRAVE))
  t.mock.method(globalThis, 'fetch', upstream)
  const JEAN = 'https://jean.test'
  const handle = gateway({ origins: [JEAN] })
  const relay = /** @type {typeof globalThis.fetch} */ ((input, init = {}) => handle(new Request(input instanceof URL ? input.href : String(input), { ...init, headers: { ...init.headers, origin: JEAN, cookie: 'a=b' } })))
  const pages = await searchService('brave', SERVICES.brave.address, SECRET, 'lighthouse', 'en', { fetch: relay, gateway: GATEWAY })
  assert.equal(pages[0].title, 'The Lighthouse & its keeper')
  const call = /** @type {any} */ (upstream.mock.calls[0]).arguments
  assert.equal(new URL(call[0]).hostname, 'api.search.brave.com')
  assert.equal(call[1].headers.get('x-subscription-token'), 'k-1')
  assert.equal(call[1].headers.get('origin'), null)
  assert.equal(call[1].headers.get('cookie'), null)
})
