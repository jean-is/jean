// Where web search reads, built into Jean (D271): Wikipedia, on unless the user turns it off;
// Vikidia, the encyclopedia for 8 to 13 year olds, off until turned on; and a Kiwix server's
// books, the offline library. Wikipedia and Vikidia are MediaWiki's API, or a Kiwix server whose
// books of theirs stand for them. Each is searched at once, a few pages from each.
// Host-agnostic: fetch, no DOM.
import { isKiwix, searchKiwix } from './kiwix.js'

/** @import { Page, Reach } from './kiwix.js' */
/** @typedef {'wikipedia' | 'vikidia' | 'kiwix'} SourceId */
/** @typedef {{ id: SourceId, address: string }} Source */

/** In the order Settings shows them. @type {readonly SourceId[]} */
export const SOURCES = ['wikipedia', 'vikidia', 'kiwix']
/** Vikidia's editions, as its own list of them names them. */
export const VIKIDIA = ['fr', 'en', 'es', 'it', 'de', 'pt', 'ru', 'uk', 'ar', 'ca', 'eu', 'el', 'hy', 'oc', 'scn']
/** Those whose site refuses to show inside another page (X-Frame-Options): their pages open in a tab of their own. @type {readonly SourceId[]} */
export const OWN_TAB = ['vikidia']
/** How the brain hears of each, and of the library when a page is missing there. */
const NAMES = { wikipedia: 'Wikipedia', vikidia: 'Vikidia', kiwix: 'The library' }

/**
 * Whether a page is on the site of a source read from the web, in any language: fr.vikidia.org's
 * for Vikidia's address. A Kiwix server standing for it is never so. @param {string} address @param {string} url
 */
export function onSite(address, url) {
  const site = address && !isKiwix(address) && URL.canParse(address.replace('{lang}.', '')) && new URL(address.replace('{lang}.', '')).hostname
  const host = URL.canParse(url) && new URL(url).hostname
  return Boolean(site && host && (host === site || host.endsWith(`.${site}`)))
}

/** MediaWiki's search, its pages' introductions with them. @param {string} address @param {string} query @param {string} lang @param {Reach & { count?: number }} [options] @returns {Promise<Page[]>} */
export async function searchWiki(address, query, lang, { fetch = globalThis.fetch, signal, count = 5 } = {}) {
  const url = new URL(address.replace('{lang}', lang))
  const params = { action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search', gsrsearch: query, gsrlimit: String(count), prop: 'extracts|info', exintro: '1', explaintext: '1', exlimit: String(count), exchars: '1200', inprop: 'url' }
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`The search answered ${response.status}.`)
  /** @type {{ index: number, title: string, fullurl: string, extract?: string }[]} */
  const pages = ((await response.json())?.query?.pages ?? []).sort((/** @type {any} */ a, /** @type {any} */ b) => a.index - b.index)
  return pages.map((page) => ({ title: page.title, url: page.fullurl, extract: page.extract ?? '' }))
}

/**
 * One source's pages, or why it has none: a language it lacks says which it has.
 * @param {Source} source @param {string} query @param {string} lang two-letter @param {Reach & { count?: number }} reach
 * @returns {Promise<{ pages: Page[], note?: string }>}
 */
async function searchOne({ id, address }, query, lang, reach) {
  if (isKiwix(address)) {
    const { pages, languages } = await searchKiwix(address, query, lang, { ...reach, ...(id !== 'kiwix' && { category: id }) })
    return pages.length || languages.length < 2 || languages.includes(lang) ? { pages }
      : { pages, note: `${NAMES[id]} has no books in "${lang}". Search again with one of its languages: ${languages.join(', ')}.` }
  }
  if (id === 'vikidia' && !VIKIDIA.includes(lang)) return { pages: [], note: `Vikidia has no edition in "${lang}". Search again with one of its languages: ${VIKIDIA.join(', ')}.` }
  return { pages: await searchWiki(address, query, lang, reach) }
}

/**
 * Every source on, searched at once: five pages from one, three from each of several. One that
 * doesn't answer is told of; when none does, the first one's error is thrown.
 * @param {Source[]} sources @param {string} query @param {string} lang two-letter @param {Reach} [reach]
 * @returns {Promise<{ pages: Page[], notes: string[] }>}
 */
export async function searchSources(sources, query, lang, reach = {}) {
  const count = sources.length > 1 ? 3 : 5
  const results = await Promise.allSettled(sources.map((source) => searchOne(source, query, lang, { ...reach, count })))
  const failed = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []))
  if (failed.length && failed.length === results.length) throw failed[0]
  return {
    pages: results.flatMap((result) => (result.status === 'fulfilled' ? result.value.pages : [])),
    notes: results.flatMap((result, i) => (result.status === 'fulfilled' ? result.value.note ?? [] : `${NAMES[sources[i].id]} didn't answer.`)),
  }
}
