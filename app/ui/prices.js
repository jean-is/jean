// Prices per token of brains whose provider lists none with its models, from models.dev's catalogue
// (D255), for the picker's "about 1¢ per answer" and what an answer cost (D252). Read the first time
// a price is wanted, never before, and kept a week in .cache/, only what a price needs of the providers
// Jean knows: about 30 KB of its 5 MB. Its address comes from settings or policy; none when ''.
import { signal } from '@preact/signals-core'
import { app } from './state.js'
import { readJSON, writeJSON } from '../core/fs.js'
import { serviceURL } from '../core/settings.js'

/** @typedef {import('../core/types.js').FS} FS */
/** @typedef {NonNullable<import('../core/types.js').ModelInfo['pricing']>} Pricing */
/** Dollars per million tokens read, written and read again from the cache, by provider and model. @typedef {Record<string, Record<string, number[]>>} Prices */

/** models.dev's names for the providers Jean knows whose catalogue has no prices (OpenRouter's has). */
const NAMES = { anthropic: 'anthropic', openai: 'openai', gemini: 'google', vertex: 'google-vertex', mistral: 'mistral', groq: 'groq', cerebras: 'cerebras', together: 'togetherai', fireworks: 'fireworks-ai', xai: 'xai', huggingface: 'huggingface', vercel: 'vercel' }
const FILE = '.cache/prices.json'
const FRESH_MS = 7 * 86_400_000

/** What a price needs of models.dev's catalogue. @param {any} catalogue @returns {Prices} */
export const pricesFrom = (catalogue) => Object.fromEntries(Object.entries(NAMES).map(([provider, name]) => [provider, Object.fromEntries(
  Object.entries(catalogue?.[name]?.models ?? {}).flatMap(([id, { cost } = {}]) => (typeof cost?.input === 'number' && typeof cost.output === 'number'
    ? [[id, [cost.input, cost.output, ...(typeof cost.cache_read === 'number' ? [cost.cache_read] : [])]]] : [])))]))

/**
 * A model's prices per token: by its id, or its name without its maker's, a variant or a date.
 * @param {Prices | null} prices @param {string} provider @param {string} model @returns {Pricing | undefined}
 */
export function priceIn(prices, provider, model) {
  const models = prices?.[provider] ?? {}
  const name = model.slice(model.lastIndexOf('/') + 1).replace(/[:@].*$/, '')
  const [input, output, again = input] = models[model] ?? models[name] ?? models[name.replace(/-\d{8}$/, '')] ?? []
  return input === undefined ? undefined : { prompt: input / 1e6, completion: output / 1e6, cacheRead: again / 1e6 }
}

/**
 * The prices as last read: from .cache/ when read from the same address less than a week ago, else
 * from it again; when it can't be, what was read before.
 * @param {FS} fs @param {string} url @param {{ fetch?: typeof globalThis.fetch, now?: Date }} [options] @returns {Promise<Prices>}
 */
export async function readPrices(fs, url, { fetch = globalThis.fetch, now = new Date() } = {}) {
  const kept = await readJSON(fs, FILE, null)
  if (!url || (kept?.url === url && now.getTime() < Date.parse(kept.at) + FRESH_MS)) return url ? kept.prices : {}
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`)
    const prices = pricesFrom(await response.json())
    await writeJSON(fs, FILE, { format: 1, url, at: now.toISOString(), prices })
    return prices
  } catch (error) {
    console.warn('Prices', error)
    return kept?.prices ?? {}
  }
}

const read = signal(/** @type {Prices | null} */ (null))
/** @type {Promise<void> | null} */
let reading = null

/**
 * A model's prices per token: those its provider lists, or models.dev's, read once a session the first
 * time one is wanted; a render that asks draws again once they are in. @param {string} provider @param {string} model @param {Pricing} [listed]
 */
export function priceOf(provider, model, listed) {
  if (listed && !Number.isNaN(Number(listed.prompt) + Number(listed.completion))) return listed
  reading ??= readPrices(app.fs, serviceURL('prices', app.settings.value, app.policy)).then((prices) => { read.value = prices })
  return priceIn(read.value, provider, model)
}
