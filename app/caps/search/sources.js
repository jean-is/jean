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

/**
 * MediaWiki's pages as a query of its API finds them, their text with them, and their lead pictures,
 * which an answer may show (D35), without the tracking words Wikipedia adds to their addresses.
 * @param {string} api @param {Record<string, string>} params @param {Reach} reach @returns {Promise<Page[]>}
 */
async function wikiPages(api, params, { fetch = globalThis.fetch, signal }) {
  const url = new URL(api)
  for (const [name, value] of Object.entries({ action: 'query', format: 'json', formatversion: '2', origin: '*', prop: 'extracts|info|pageimages', explaintext: '1', inprop: 'url', piprop: 'thumbnail', pithumbsize: '500', ...params })) url.searchParams.set(name, value)
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`The search answered ${response.status}.`)
  /** @type {{ index?: number, title: string, fullurl: string, extract?: string, missing?: boolean, invalid?: boolean, thumbnail?: { source: string } }[]} */
  const pages = ((await response.json())?.query?.pages ?? []).filter((/** @type {any} */ page) => !page.missing && !page.invalid).sort((/** @type {any} */ a, /** @type {any} */ b) => a.index - b.index)
  return pages.map((page) => ({ title: page.title, url: page.fullurl, extract: page.extract ?? '', ...(page.thumbnail && { picture: page.thumbnail.source.replace(/\?utm_.*/, '') }) }))
}

/** MediaWiki's search, its pages' introductions with them. @param {string} address @param {string} query @param {string} lang @param {Reach & { count?: number }} [options] */
export const searchWiki = (address, query, lang, { count = 5, ...reach } = {}) => wikiPages(address.replace('{lang}', lang), { generator: 'search', gsrsearch: query, gsrlimit: String(count), exintro: '1', exlimit: String(count), exchars: '1200' }, reach)

/**
 * An article of a source's site, at its address there (…/wiki/Title, or ?title=Title), read through
 * MediaWiki's API, since the site's pages refuse other sites' reads: its whole text and its picture.
 * Null when it isn't there, or the address names none. @param {string} address the source's
 * @param {string} url @param {Reach} [reach] @returns {Promise<Page | null>}
 */
export async function readWiki(address, url, reach = {}) {
  const { hostname, pathname, searchParams } = new URL(url)
  const title = searchParams.get('title') ?? (pathname.startsWith('/wiki/') ? decodeURIComponent(pathname.slice(6)) : '')
  return title ? (await wikiPages(address.replace('{lang}', hostname.split('.')[0]), { titles: title, redirects: '1' }, reach))[0] ?? null : null
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
