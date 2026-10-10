// A Kiwix server as web search's Wikipedia (D254): kiwix-serve, Kiwix Desktop's own server or a
// hotspot's, whose answers any browser may read. Its catalogue (OPDS) lists its books and their
// languages, its search (OpenSearch, as RSS) finds pages in one language's books, and each
// page's first paragraphs come from the page itself, as Wikipedia's search gives them.
// Host-agnostic: fetch and a scanner, no DOM.
import { pageText } from '../browser/pages.js'

/** @typedef {{ title: string, url: string, extract: string }} Page */
/** @typedef {{ title: string, languages: string[], articles: number }} Book  languages: three-letter, as Kiwix names them */
/** @typedef {{ fetch?: typeof globalThis.fetch, signal?: AbortSignal }} Reach */

/** Whether web search's address is a Kiwix server's rather than MediaWiki's API, which is always api.php. @param {string} address */
export const isKiwix = (address) => !/\/api\.php(\?|$)/.test(address)

/** Every match of a pattern's first group. @param {string} xml @param {RegExp} pattern global */
const all = (xml, pattern) => [...xml.matchAll(pattern)].map((match) => match[1])
// Tags that run inside a sentence, a link's or a pronunciation's: dropped without a space, so
// "the <a>Moon</a>, including" stays "the Moon, including", where the scanner would part them.
const INLINE = /<\/?(a|abbr|b|bdi|bdo|big|cite|code|data|dfn|em|font|i|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr)\b[^>]*>/gi
/** The text of some HTML, tags and entities read, cut at `max` characters. @param {string} html @param {number} [max] */
const text = (html, max) => pageText(html.replace(INLINE, ''), max).text
/** The words of an element's text, on one line. @param {string} [source] */
const words = (source = '') => text(source).replace(/\s+/g, ' ').trim()
/** The server's root, which its addresses are under, from its home page or one it shows: its reader's, or a page's. @param {string} address */
export const rootOf = (address) => new URL(address.replace(/[?#].*/, '').replace(/\/(viewer|content\/.*)$/, '').replace(/\/?$/, '/'))

/** A two-letter code, as Intl reads Kiwix's three-letter ones ("fra" → "fr"). @param {string} code */
function short(code) {
  try { return Intl.getCanonicalLocales(code)[0].split('-')[0] } catch { return code }
}

/** @param {string | URL} url @param {Reach} [reach] */
async function read(url, { fetch = globalThis.fetch, signal } = {}) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`The library answered ${response.status}.`)
  return response.text()
}

/** The books a Kiwix server holds, from its catalogue. @param {string} address @param {Reach} [reach] @returns {Promise<Book[]>} */
export async function library(address, reach) {
  const feed = await read(new URL('catalog/v2/entries?count=-1', rootOf(address)), reach)
  return all(feed, /<entry>([\s\S]*?)<\/entry>/g).map((entry) => ({
    title: words(/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1]),
    languages: (/<language>([^<]*)<\/language>/.exec(entry)?.[1] ?? '').split(',').map((code) => code.trim()).filter(Boolean),
    articles: Number(/<articleCount>(\d+)<\/articleCount>/.exec(entry)?.[1] ?? 0),
  }))
}

/**
 * The page without its tables, those inside them included: an infobox holds paragraphs of its own,
 * a map's caption or a note, before the article's first. @param {string} html
 */
function withoutTables(html) {
  let kept = ''
  let depth = 0
  let from = 0
  for (const match of html.matchAll(/<(\/?)table\b[^>]*>/gi)) {
    const at = match.index ?? 0
    if (!match[1] && depth++ === 0) kept += html.slice(from, at)
    else if (match[1] && depth > 0 && --depth === 0) from = at + match[0].length
  }
  return depth ? kept : kept + html.slice(from)
}

/**
 * A page's first paragraphs, outside its tables and without their notes' numbers. @param {string} html @param {number} [max] characters
 */
export function intro(html, max = 1200) {
  const paragraphs = all(withoutTables(html.replace(/<sup\b[^>]*\breference\b[^>]*>[\s\S]*?<\/sup>/gi, '')), /<p\b[^>]*>([\s\S]*?)<\/p>/gi)
  return text(paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(''), max)
}

/**
 * The pages a Kiwix server finds for some words, in its books in one language; a library in a
 * single language is searched whatever the language asked. Each page's first paragraphs replace
 * the search's snippet once read. `languages`: those its books are in, by two-letter code.
 * @param {string} address the server's, as its home page has it
 * @param {string} query @param {string} lang two-letter
 * @param {Reach & { count?: number }} [options]
 * @returns {Promise<{ pages: Page[], languages: string[] }>}
 */
export async function searchKiwix(address, query, lang, { fetch, signal, count = 5 } = {}) {
  const reach = { fetch, signal }
  const codes = [...new Set((await library(address, reach)).flatMap((book) => book.languages))]
  const languages = [...new Set(codes.map(short))]
  const searched = codes.length === 1 ? codes : codes.filter((code) => short(code) === lang)
  if (!searched.length) return { pages: [], languages }
  const url = new URL('search', rootOf(address))
  for (const [name, value] of Object.entries({ pattern: query, 'books.filter.lang': searched.join(','), format: 'xml', pageLength: String(count) })) url.searchParams.set(name, value)
  // The same page in two books (a whole Wikipedia and one of its selections) is found once.
  /** @type {Map<string, Page>} */
  const found = new Map()
  for (const item of all(await read(url, reach), /<item>([\s\S]*?)<\/item>/g)) {
    const [title, link, snippet] = [/<title>([\s\S]*?)<\/title>/, /<link>([\s\S]*?)<\/link>/, /<description>([\s\S]*?)<\/description>/].map((pattern) => words(pattern.exec(item)?.[1]))
    if (title && link && !found.has(title)) found.set(title, { title, url: new URL(link, url).href, extract: snippet })
  }
  const pages = await Promise.all([...found.values()].map(async (page) => ({ ...page, extract: await read(page.url, reach).then((html) => intro(html), () => '') || page.extract })))
  return { pages, languages }
}
