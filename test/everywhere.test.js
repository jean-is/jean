// SPDX-License-Identifier: MIT
// /everywhere, composition's job page (site/everywhere): its pane frames the document that shows a creation
// (site/creation.js) with a project's map. What that map holds is held to what Jean itself reads: its links are those
// Jean's graph reads from the creations' files (caps/compose/refs.js), and they lay out and say how each creation stands
// as the app's own map does. test/everywhere.spec.js holds the map itself, in a browser.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BRAND } from '../app/brand.js'
import { DOCUMENT, layered, standing } from '../app/caps/compose/refs.js'
import { PLACE } from '../app/caps/tables/table.js'
import { PLACES } from '../site/everywhere/page.js'
import { buildSite } from '../site/site.js'

const site = await buildSite({ brand: BRAND, base: 'https://jean.is/', now: new Date('2026-11-03T10:00:00') })
/** A place by what the page calls it. @param {string} place */
const key = (place) => Object.entries(PLACES).find(([, one]) => one === place)?.[0] ?? place

test('/everywhere frames the document that shows a creation, with a project’s map beside it in each of its languages', () => {
  const pages = site.pages.filter((page) => page.name === 'everywhere')
  assert.deepEqual(pages.map((page) => page.lang), ['en', 'fr'])
  for (const page of pages) {
    const html = site.files[page.path], frames = [...html.matchAll(/<iframe class="site-creation is-map" src="([^"]+)" title="[^"]+" loading="lazy"><\/iframe>/g)]
    assert.equal(frames.length, 1, page.path)
    const [at, hash] = frames[0][1].replaceAll('&amp;', '&').split('#'), params = new URLSearchParams(hash)
    assert.equal(at, `${'../'.repeat(page.address.split('/').length - 1)}creation.html`, page.path)
    assert.deepEqual([params.get('src'), params.get('lang'), params.has('bare')], [`creations/everywhere.${page.lang}.json`, page.lang, true], page.path)
    // Over it, the request that made the project; under it, what to try there.
    assert.match(html, /<p class="job-sent" dir="ltr"><span class="visually-hidden">[^<]+<\/span><span>[^<]+<\/span><\/p>\s*<iframe class="site-creation is-map/, page.path)
    assert.match(html, /<\/iframe>\s*<p class="job-try"><svg class="felt-point"[^>]*>.*?<\/svg><span>[^<]+<\/span><\/p>/, page.path)
  }
  assert.ok(site.files['creation.html'] && site.files['creations/creation.js'])
})

test('its map’s links are those Jean’s graph reads from its creations’ files, laid out and said as Creations draws them', () => {
  for (const place of Object.values(PLACES)) assert.ok(PLACE.test(place) || DOCUMENT.test(place) || /^decks\/[0-9A-HJKMNP-TV-Z]{26}-[^/]+\.deck\.html$/.test(place) || /^sites\/[0-9A-HJKMNP-TV-Z]{26}-[^/]+$/.test(place), place)
  for (const lang of ['en', 'fr']) {
    const one = JSON.parse(site.files[`creations/everywhere.${lang}.json`]), words = /** @type {Record<string, string>} */ (site.words.get('everywhere')?.[lang])
    const names = new Map(one.creations.map((/** @type {{ place: string, name: string }} */ { place, name }) => [place, name]))
    assert.equal(one.kind, 'map', lang)
    assert.equal(names.get(PLACES.prices), words['made.prices'], lang)
    // The price list reads the published version, the slides version 2, the newsletter an instruction run as the collection changes,
    // the shop the prices and the price list's Delivery section; the orders relate to the prices by a column; the flyer's collection is gone.
    assert.deepEqual(one.edges.map((/** @type {import('../app/caps/compose/refs.js').Edge} */ edge) => [key(edge.from), key(edge.to), edge.at, edge.kind ?? '', Object.keys(edge.recipe).join(' ')]), [
      ['list', 'prices', 'published', '', ''], ['slides', 'prices', 2, '', ''], ['letter', 'prices', 'live', '', 'ask refresh brain'], ['shop', 'prices', 'live', '', ''],
      ['shop', 'list', 'live', '', 'section'], ['flyer', 'gone', 'live', '', ''], ['orders', 'prices', 'live', 'relation', 'relation'],
    ], lang)
    // Sources at the start, the flyer with them as it reads nothing that is there, the shop a column further.
    const edges = one.edges.filter((/** @type {import('../app/caps/compose/refs.js').Edge} */ edge) => names.has(edge.from) && names.has(edge.to))
    assert.deepEqual(layered(edges, [...names.keys()].sort()).map((column) => column.map(key)), [['prices', 'orders', 'flyer'], ['slides', 'list', 'letter'], ['shop']], lang)
    // How each stands: the slides behind version 3, the newsletter's instruction and its brain, the flyer showing nothing, the orders used by nothing.
    const stands = Object.fromEntries([...names.keys()].map((place) => [key(place), standing(place, one.edges, (other) => names.has(other), (other) => one.latest[other] ?? 0)]))
    assert.deepEqual(stands, { prices: [], orders: [['unused', {}]], flyer: [['missing', {}]], list: [], slides: [['out', { n: 3 }]], letter: [['auto', {}], ['brain', { name: words['made.brain'] }]], shop: [] }, lang)
  }
})
