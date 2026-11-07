// Search services the user has an account with, on their own key (D671): sources like Wikipedia,
// searched through web_search by every brain. Brave and Kagi refuse browsers, so they go through the gateway
// (D191). Google answers them. Tavily's refusal of a key carries no CORS, so a browser can't read it: what a
// browser can't reach is tried again through the gateway, when one is named, as a connection is.
// Each is an address, replaceable by `urls` in settings or policy, what it is asked and how its answer reads.
// Host-agnostic: fetch, no DOM.
import { words } from './kiwix.js'

/** @import { Page, Reach } from './kiwix.js' */
/** @typedef {'brave' | 'tavily' | 'google' | 'kagi'} ServiceId */
/** @typedef {{ key: string, engine?: string }} Secret  engine: Google's search engine, which its key alone doesn't name */
/** @typedef {{ query: string, lang: string, count: number, key: string, engine?: string }} Asked */
/** @typedef {{ params?: Record<string, string>, headers: Record<string, string>, body?: object }} Request  a body makes it a POST */
/**
 * @typedef {object} Service
 * @property {string} name  the same in every language
 * @property {string} address
 * @property {string} logo  its brand's, a file of connections' logos (D159)
 * @property {string} [keys]  where a key is got: Google gives no new ones
 * @property {boolean} [relayed]  it refuses browsers, so the gateway reaches it
 * @property {boolean} [engine]  it asks for a search engine too
 * @property {(asked: Asked) => Request} ask
 * @property {(answer: Answer) => Page[]} read
 */

/** @typedef {{ title: string, url: string }} Hit */
/** @typedef {{ web?: { results?: (Hit & { description?: string })[] }, results?: (Hit & { content?: string })[], items?: { title: string, link: string, snippet?: string }[], data?: { search?: (Hit & { snippet?: string })[] } }} Answer  what the four services send, each its own part */

/** A language as Brave's search_lang names it, or nothing: it refuses any other, and its default is English. @param {string} lang two-letter */
const braveLang = (lang) => ({ zh: 'zh-hans', pt: 'pt-br', no: 'nb' })[lang] ?? (/^(ar|eu|bn|bg|ca|hr|cs|da|nl|en|et|fi|fr|gl|de|el|gu|he|hi|hu|is|it|ja|kn|ko|lv|lt|ms|ml|mr|nb|pl|pa|ro|ru|sr|sk|sl|es|sv|ta|te|th|tr|uk|vi)$/.test(lang) ? lang : '')

/** @type {Record<ServiceId, Service>} */
export const SERVICES = {
  brave: {
    name: 'Brave Search', logo: 'brave.svg', address: 'https://api.search.brave.com/res/v1/web/search', keys: 'https://api-dashboard.search.brave.com/app/keys', relayed: true,
    ask: ({ query, lang, count, key }) => ({ params: { q: query, count: String(count), ...(braveLang(lang) && { search_lang: braveLang(lang) }) }, headers: { 'x-subscription-token': key } }),
    // Its titles and descriptions come as HTML, the words searched for in <strong>.
    read: (answer) => (answer.web?.results ?? []).map((page) => ({ title: words(page.title), url: page.url, extract: words(page.description) })),
  },
  tavily: {
    name: 'Tavily', logo: 'tavily.svg', address: 'https://api.tavily.com/search', keys: 'https://app.tavily.com/home',
    ask: ({ query, lang, count, key }) => ({ body: { query, max_results: count, language: lang }, headers: { authorization: `Bearer ${key}` } }),
    read: (answer) => (answer.results ?? []).map((page) => ({ title: page.title, url: page.url, extract: page.content ?? '' })),
  },
  google: {
    name: 'Google Custom Search', logo: 'google.svg', address: 'https://www.googleapis.com/customsearch/v1', engine: true,
    // In a header, so that it stays out of the address.
    ask: ({ query, lang, count, key, engine = '' }) => ({ params: { q: query, cx: engine, num: String(count), hl: lang }, headers: { 'x-goog-api-key': key } }),
    read: (answer) => (answer.items ?? []).map((page) => ({ title: page.title, url: page.link, extract: page.snippet ?? '' })),
  },
  kagi: {
    name: 'Kagi', logo: 'kagi.svg', address: 'https://kagi.com/api/v1/search', keys: 'https://kagi.com/api/keys', relayed: true,
    ask: ({ query, count, key }) => ({ body: { query, limit: count }, headers: { authorization: `Bearer ${key}` } }),
    read: (answer) => (answer.data?.search ?? []).map((page) => ({ title: words(page.title), url: page.url, extract: words(page.snippet) })),
  },
}

/** Whether a source is one of these. @param {string} id @returns {id is ServiceId} */
export const isService = (id) => Object.hasOwn(SERVICES, id)
/** The day Google ends its service: it takes no new customers already. */
export const GOOGLE_ENDS = new Date(2027, 0, 1)
/** A service's keys in the secrets file. @param {ServiceId} id */
export const secretOf = (id) => `search:${id}`
/** Whether an address reaches a service only through the gateway: one put in its place is whoever's it is, reached as it is. @param {ServiceId} id @param {string} address */
export const relayed = (id, address) => Boolean(SERVICES[id].relayed) && address === SERVICES[id].address

/** A service told Jean no: a key it refuses, or none left to spend. What it says is for the brain. */
export class Refused extends Error {}

/**
 * The pages a service finds, in http(s) alone, each extract as long as Wikipedia's.
 * @param {ServiceId} id @param {string} address @param {Secret | null} secret @param {string} query @param {string} lang two-letter
 * @param {Reach & { count?: number, gateway?: string }} [options] @returns {Promise<Page[]>}
 */
export async function searchService(id, address, secret, query, lang, { fetch = globalThis.fetch, signal, gateway = '', count = 5 } = {}) {
  const { name, ask, read } = SERVICES[id]
  if (!secret?.key) throw new Refused(`${name} has no key on this device. The user can add one in Settings › Web search.`)
  if (relayed(id, address) && !gateway) throw new Refused(`${name} needs a gateway to be reached from here. The user can name one in Settings › Connections.`)
  const { params = {}, headers, body } = ask({ query, lang, count, ...secret })
  const url = new URL(address)
  for (const [param, value] of Object.entries(params)) url.searchParams.set(param, value)
  const init = { signal, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), headers: { accept: 'application/json', ...(body && { 'content-type': 'application/json' }), ...headers } }
  const relay = () => {
    const through = new URL(gateway)
    through.searchParams.set('url', url.href)
    return fetch(through, init)
  }
  const response = await (relayed(id, address) ? relay() : fetch(url, init).catch((error) => {
    if (error instanceof TypeError && gateway) return relay()
    throw error
  }))
  // Each says so its own way: Brave's 422, Google's and Kagi's 400, Tavily's 401; 429 or 402 once none are left.
  if (response.status >= 400 && response.status < 500) throw new Refused(`${name} refused its key, or has no searches left on it. The user can change the key in Settings › Web search.`)
  if (!response.ok) throw new Error(`${name} answered ${response.status}.`)
  return read(await response.json()).filter((page) => /^https?:\/\//.test(page.url)).slice(0, count).map((page) => ({ ...page, extract: page.extract.slice(0, 1200) }))
}
