// Brains' prices from models.dev (D255): only what a price needs of the providers Jean knows, found by
// a model's id or its bare name, and read again from the catalogue only once a week.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryFS } from '../app/core/fs.js'
import { pricesFrom, priceIn, readPrices } from '../app/ui/prices.js'

const URL = 'https://models.example/api.json'
/** A slice of models.dev's catalogue: dollars per million tokens. */
const CATALOGUE = {
  anthropic: { models: { 'claude-sonnet-5-5': { id: 'claude-sonnet-5-5', cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 }, limit: { context: 1e6 } } } },
  google: { models: { 'gemini-3.8-flash': { cost: { input: 0.5, output: 3 } }, 'gemini-embedding': { cost: { input: 0.15 } } } },
  vercel: { models: { 'anthropic/claude-sonnet-5.5': { cost: { input: 3, output: 15 } } } },
  'some-cloud': { models: { m: { cost: { input: 1, output: 1 } } } },
}

test('only what a price needs, of the providers Jean knows, under Jean’s names for them', () => {
  const prices = pricesFrom(CATALOGUE)
  assert.deepEqual(prices.anthropic, { 'claude-sonnet-5-5': [3, 15, 0.3] })
  // A model without a price for what it writes has none.
  assert.deepEqual(prices.gemini, { 'gemini-3.8-flash': [0.5, 3] })
  assert.equal(prices['some-cloud'], undefined)
  assert.deepEqual(pricesFrom(null).anthropic, {})
})

test('a model is found by its id, or by its name without its maker’s, a variant or a date', () => {
  const prices = pricesFrom(CATALOGUE)
  assert.deepEqual(priceIn(prices, 'anthropic', 'claude-sonnet-5-5'), { prompt: 3e-6, completion: 15e-6, cacheRead: 0.3e-6 })
  assert.equal(priceIn(prices, 'anthropic', 'claude-sonnet-5-5-20261001')?.prompt, 3e-6)
  // Vertex AI names Google's models as google/…; Vercel's gateway keeps the maker's in its ids.
  assert.equal(priceIn(prices, 'gemini', 'google/gemini-3.8-flash')?.completion, 3e-6)
  assert.equal(priceIn(prices, 'vercel', 'anthropic/claude-sonnet-5.5')?.prompt, 3e-6)
  // Without its own price, what is read again from the cache costs what is read.
  assert.equal(priceIn(prices, 'gemini', 'gemini-3.8-flash')?.cacheRead, 0.5e-6)
  assert.equal(priceIn(prices, 'anthropic', 'claude-unknown'), undefined)
  assert.equal(priceIn(null, 'anthropic', 'claude-sonnet-5-5'), undefined)
})

test('read from the catalogue once a week, kept in .cache/ meanwhile, and kept when it can’t be read', async () => {
  const fs = memoryFS()
  let asked = 0
  /** @param {unknown} body @param {number} [status] */
  const answering = (body, status = 200) => /** @type {typeof fetch} */ (async () => { asked++; return new Response(JSON.stringify(body), { status }) })
  const monday = new Date('2026-10-12T09:00:00Z')
  assert.deepEqual((await readPrices(fs, URL, { fetch: answering(CATALOGUE), now: monday })).anthropic, { 'claude-sonnet-5-5': [3, 15, 0.3] })
  assert.equal(asked, 1)
  assert.deepEqual(JSON.parse(await fs.read('.cache/prices.json') ?? '{}').at, monday.toISOString())
  // Six days on, from the cache.
  await readPrices(fs, URL, { fetch: answering({}), now: new Date('2026-10-18T09:00:00Z') })
  assert.equal(asked, 1)
  // A week on, from the catalogue; when it fails, what was read before.
  const later = await readPrices(fs, URL, { fetch: answering('busy', 503), now: new Date('2026-10-19T10:00:00Z') })
  assert.equal(asked, 2)
  assert.deepEqual(later.anthropic, { 'claude-sonnet-5-5': [3, 15, 0.3] })
  // Another address is read at once; none at all, nothing is.
  await readPrices(fs, 'https://prices.example/api.json', { fetch: answering(CATALOGUE), now: new Date('2026-10-13T09:00:00Z') })
  assert.equal(asked, 3)
  assert.deepEqual(await readPrices(fs, '', { fetch: answering(CATALOGUE) }), {})
  assert.equal(asked, 3)
})
