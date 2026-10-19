// What search engines, and the sites a link is shared on, read of a web deploy that names its address,
// ADDRESS (D353, D355): index.html's title, its canonical address, Open Graph's and X's cards with the
// picture of the welcome screen, and JSON-LD naming the site and the app, and on the brand's own site its
// publisher; robots.txt and sitemap.xml beside it, which lists every page served without noindex, dated by
// its last change on the live site (D431); the privacy policy and the terms listed at their addresses without
// .html (D356); and every other page kept out of search results. Their addresses are whole, as Open Graph and
// canonical links need, so they are written for one address. The words are brand.js's name and index.html's
// description, so a search result says what the page and the install say.
import { xml } from './desktop.js'
import { SHARE } from './manifest.js'

/**
 * The address a site is served from, whole and ending in /.
 * @param {string} address  ADDRESS
 */
export function siteBase (address) {
  const url = URL.parse(address)
  if (!url || !/^https?:$/.test(url.protocol) || url.href !== url.origin + url.pathname) throw new Error(`ADDRESS is the address the site is served from, as https://example.org/, not ${address}`)
  return url.href.replace(/\/?$/, '/')
}

/** Whether the site at `base` is the brand's own, the one with the page under the app (D397) and a publisher. @param {string} base @param {{ domain: string }} brand */
export const ownSite = (base, brand) => new URL(base).host === brand.domain

/**
 * Who publishes the brand's own site, as its terms' legal notice names it, and the public profiles that are
 * its own (schema.org's sameAs): said by that site alone, never by an organisation's copy.
 */
export const PUBLISHER = Object.freeze({ name: 'Warehouse SAS', sameAs: ['https://github.com/jean-is', 'https://huggingface.co/jean-is', 'https://www.npmjs.com/org/jean-is'] })

/**
 * The home page's title: the name, then the description's first sentence, in any script.
 * @param {{ name: string }} brand @param {string} description
 */
export const titleOf = (brand, description) => `${brand.name} · ${description.split(/(?<=[.!?؟])\s+|(?<=[。！？])/u)[0].replace(/[.。]$/u, '')}`

/**
 * index.html as search engines and shared links read it, once: its empty title filled, then before
 * </head> its canonical address, Open Graph's card, X's large one (which reads Open Graph's), and the
 * site and the app as schema.org has them, the site's name being what Google shows beside a result; on
 * the brand's own site, its domain as another name, which tells the site apart from the first name, and
 * its publisher.
 * @param {string} html  index.html
 * @param {string} base  siteBase()'s
 * @param {{ name: string, domain: string }} brand
 * @param {string} description  index.html's
 * @param {string[]} languages  the catalogues' languages
 * @param {string} [address]  the page's own, if not the site's: a language's (D397)
 */
export function withSite (html, base, brand, description, languages, address = base) {
  if (!html.includes('<title></title>') || html.includes('rel="canonical"') || !html.includes('</head>')) throw new Error('index.html has a title or a canonical address already, or no </head>')
  const title = titleOf(brand, description)
  const picture = base + SHARE.src
  const card = {
    'og:type': 'website',
    'og:site_name': brand.name,
    'og:title': title,
    'og:description': description,
    'og:url': address,
    'og:image': picture,
    'og:image:width': String(SHARE.width),
    'og:image:height': String(SHARE.height),
    'og:image:alt': SHARE.alt,
  }
  const own = ownSite(base, brand)
  const icon = `${base}icons/icon-512.png`
  const publisher = { '@id': `${base}#publisher` }
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${base}#website`, url: base, name: brand.name, ...own && { alternateName: [brand.domain], publisher }, description },
      {
        '@type': 'WebApplication', '@id': `${base}#app`, url: base, name: brand.name, description,
        applicationCategory: 'BusinessApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript',
        isAccessibleForFree: true, inLanguage: languages, image: icon, screenshot: picture, ...own && { publisher },
      },
      ...own ? [{ '@type': 'Organization', ...publisher, name: PUBLISHER.name, url: base, logo: icon, sameAs: PUBLISHER.sameAs }] : [],
    ],
  }
  const head = [
    `<link rel="canonical" href="${xml(address)}">`,
    ...Object.entries(card).map(([property, content]) => `<meta property="${property}" content="${xml(content)}">`),
    '<meta name="twitter:card" content="summary_large_image">',
    // A data block, which no policy runs; `<` escaped so nothing in it closes the script.
    `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`,
  ]
  return html.replace('<title></title>', () => `<title>${xml(title)}</title>`).replace('</head>', () => `${head.join('\n')}\n</head>`)
}

/**
 * The pages besides the home page that search engines list: the privacy policy and the terms (D356),
 * which Google's check of an app that signs in to it reads too, and where files go (D381).
 */
export const LISTED = ['privacy.html', 'terms.html', 'files.html']

/**
 * A listed page's address: whole, and without .html, which every server of a web deploy answers (D356).
 * @param {string} base  siteBase()'s @param {string} path  one of LISTED
 */
export const addressOf = (base, path) => base + path.replace(/\.html$/, '')

/**
 * A listed page as search engines read it, once: its canonical address, so that the address with
 * .html and the one without aren't taken for two pages. @param {string} html @param {string} address  addressOf()'s
 */
export function withCanonical (html, address) {
  if (html.includes('rel="canonical"') || html.split('</head>').length !== 2) throw new Error('the page has a canonical address already, or no one </head>')
  return html.replace('</head>', () => `<link rel="canonical" href="${xml(address)}">\n</head>`)
}

/**
 * A page other than the home page and the listed ones, kept out of search results: a frame's, or the
 * check page, which shows only what its link carries. @param {string} html
 */
export function unindexed (html) {
  if (html.includes('name="robots"') || html.split('<meta charset="utf-8">').length !== 2) throw new Error('the page says what robots may do already, or has no one <meta charset="utf-8">')
  return html.replace('<meta charset="utf-8">', (charset) => `${charset}\n<meta name="robots" content="noindex">`)
}

/** An attribute's or an element's text as xml() wrote it, read back. @param {string} text */
const unxml = (text) => text.replace(/&(amp|lt|gt|quot);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[/** @type {'amp'} */ (name)])

/** A page's language versions (hreflang), each as `lang address`, sorted. @param {string} html */
const versionsOf = (html) => [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(([, lang, href]) => `${lang} ${unxml(href)}`).sort()

/**
 * The pages search engines list, from every page the site serves, so that a page added, moved or
 * unindexed is in the sitemap as it is served (D431): each page without `noindex`, at its canonical
 * address. One without either stops the build, since /x and /x.html would be two pages; so do two
 * pages with one address, and language versions (hreflang) that don't each name the same set,
 * themselves among them, which search engines would drop.
 * @param {string} base  siteBase()'s
 * @param {Record<string, string>} pages  each served page's path and HTML
 * @returns {Map<string, string>} each listed page's address and HTML, sorted by address
 */
export function listedPages (base, pages) {
  /** @type {Map<string, string>} */
  const listed = new Map()
  for (const [path, html] of Object.entries(pages)) {
    if (/<meta name="robots" content="[^"]*noindex/.test(html)) continue
    const canonical = /<link rel="canonical" href="([^"]+)">/.exec(html)?.[1]
    if (!canonical) throw new Error(`${path} has neither a canonical address nor noindex`)
    const address = unxml(canonical)
    if (!address.startsWith(base)) throw new Error(`${path}'s canonical address, ${address}, is outside ${base}`)
    if (listed.has(address)) throw new Error(`${path} has the canonical address of another page, ${address}`)
    listed.set(address, html)
  }
  for (const [address, html] of listed) {
    const versions = versionsOf(html)
    if (versions.length && !versions.some((version) => version.endsWith(` ${address}`))) throw new Error(`${address} names its other languages but not itself`)
    for (const version of versions) {
      const other = version.slice(version.indexOf(' ') + 1)
      if (!listed.has(other)) throw new Error(`${address} names ${other} as a language version, which the site doesn't list`)
      if (versionsOf(listed.get(other) ?? '').join() !== versions.join()) throw new Error(`${other} and ${address} don't name the same language versions`)
    }
  }
  return new Map([...listed].sort(([a], [b]) => (a < b ? -1 : 1)))
}

/**
 * What a page says to a reader and a search engine, whose change moves its date in the sitemap: its
 * title, description, robots and language links, schema.org data, the links in it and its text, but
 * not its style, scripts or the app's files it names. @param {string} html
 */
export function wordsOf (html) {
  const [head, body = ''] = html.split('</head>')
  return [
    /<title>([^<]*)<\/title>/.exec(head)?.[1] ?? '',
    ...[...head.matchAll(/<meta name="(?:description|robots)" content="[^"]*">|<link rel="(?:canonical|alternate)"[^>]*>/g)].map(([tag]) => tag),
    ...[...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(([, data]) => data),
    ...[...body.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map(([, href]) => href),
    body.replace(/<!--[\s\S]*?-->|<(script|style|template)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]*>/g, ' '),
  ].join('\n').replace(/\s+/g, ' ').trim()
}

/** How long a page of the live site may take to answer. */
const PATIENCE = 15_000

/**
 * When each listed page last changed (D431): the live site's date for it while it says the same as
 * the live page does (wordsOf()), and `now` for one that says something else or is new, the live
 * site, which a deploy replaces after building, being where the pages were last changed. Null when
 * the live site can't be reached, so a sitemap never dates a page by a guess.
 * @param {string} base  siteBase()'s
 * @param {Map<string, string>} listed  listedPages()'s
 * @param {Date} now
 * @param {(url: string, init: RequestInit) => Promise<Response>} [get]
 * @returns {Promise<Map<string, string> | null>} each address's W3C date and time
 */
export async function datesOf (base, listed, now, get = fetch) {
  const today = now.toISOString().replace(/\.\d+Z$/, 'Z')
  // A page the live site doesn't have is null; one it can't serve now leaves every date out.
  const read = async (/** @type {string} */ url) => {
    const response = await get(url, { signal: AbortSignal.timeout(PATIENCE) })
    if (response.ok) return response.text()
    if (response.status === 404 || response.status === 410) return null
    throw new Error(`${url}: ${response.status}`)
  }
  try {
    const sitemap = await read(`${base}sitemap.xml`) ?? ''
    const before = new Map([...sitemap.matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)].map(([, loc, date]) => [unxml(loc), date]))
    return new Map(await Promise.all([...listed].map(async ([address, html]) => {
      const date = before.get(address)
      const live = date && await read(address)
      return /** @type {[string, string]} */ ([address, date && live !== null && wordsOf(live) === wordsOf(html) ? date : today])
    })))
  } catch {
    return null
  }
}

/**
 * The files beside the site that crawlers read: sitemap.xml, every listed page with the date it last
 * changed, when known; and robots.txt, letting them read everything and naming the sitemap, only at
 * the host's root, the one place they look.
 * @param {string} base  siteBase()'s
 * @param {Map<string, string>} listed  listedPages()'s
 * @param {Map<string, string> | null} [dates]  datesOf()'s
 * @returns {Record<string, string>}
 */
export function siteFiles (base, listed, dates = null) {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...listed.keys()].map((address) => `  <url><loc>${xml(address)}</loc>${dates?.has(address) ? `<lastmod>${dates.get(address)}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${base}sitemap.xml\n`
  return new URL(base).pathname === '/' ? { 'robots.txt': robots, 'sitemap.xml': sitemap } : { 'sitemap.xml': sitemap }
}
