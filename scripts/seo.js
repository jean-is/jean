// What search engines, and the sites a link is shared on, read of a web deploy that names its address,
// ADDRESS (D353, D355): index.html's title, its canonical address, Open Graph's and X's cards with the
// picture of the welcome screen, and JSON-LD naming the site and the app; robots.txt and sitemap.xml
// beside it; the privacy policy and the terms listed at their addresses without .html (D356); and every
// other page kept out of search results. Their addresses are whole, as Open Graph and canonical links
// need, so they are written for one address. The words are brand.js's name and
// index.html's description, so a search result says what the page and the install say.
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

/**
 * The home page's title: the name, then the description's first sentence.
 * @param {{ name: string }} brand @param {string} description
 */
export const titleOf = (brand, description) => `${brand.name} · ${description.split(/(?<=\.)\s/)[0].replace(/\.$/, '')}`

/**
 * index.html as search engines and shared links read it, once: its empty title filled, then before
 * </head> its canonical address, Open Graph's card, X's large one (which reads Open Graph's), and the
 * site and the app as schema.org has them, the site's name being what Google shows beside a result.
 * @param {string} html  index.html
 * @param {string} base  siteBase()'s
 * @param {{ name: string }} brand
 * @param {string} description  index.html's
 * @param {string[]} languages  the catalogues' languages
 */
export function withSite (html, base, brand, description, languages) {
  if (!html.includes('<title></title>') || html.includes('rel="canonical"') || !html.includes('</head>')) throw new Error('index.html has a title or a canonical address already, or no </head>')
  const title = titleOf(brand, description)
  const picture = base + SHARE.src
  const card = {
    'og:type': 'website',
    'og:site_name': brand.name,
    'og:title': title,
    'og:description': description,
    'og:url': base,
    'og:image': picture,
    'og:image:width': String(SHARE.width),
    'og:image:height': String(SHARE.height),
    'og:image:alt': SHARE.alt,
  }
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${base}#website`, url: base, name: brand.name, description },
      {
        '@type': 'WebApplication', '@id': `${base}#app`, url: base, name: brand.name, description,
        applicationCategory: 'BusinessApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript',
        isAccessibleForFree: true, inLanguage: languages, image: `${base}icons/icon-512.png`, screenshot: picture,
      },
    ],
  }
  const head = [
    `<link rel="canonical" href="${xml(base)}">`,
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

/**
 * The files beside the site that crawlers read: sitemap.xml, its home page and the listed ones; and
 * robots.txt, letting them read everything and naming the sitemap, only at the host's root, the one
 * place they look.
 * @param {string} base  siteBase()'s
 * @returns {Record<string, string>}
 */
export function siteFiles (base) {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[base, ...LISTED.map((path) => addressOf(base, path))].map((address) => `  <url><loc>${xml(address)}</loc></url>`).join('\n')}
</urlset>
`
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${base}sitemap.xml\n`
  return new URL(base).pathname === '/' ? { 'robots.txt': robots, 'sitemap.xml': sitemap } : { 'sitemap.xml': sitemap }
}
