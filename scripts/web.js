// The site a web deploy serves (D318): app/ as `npm run build` leaves it, in dist/web/, with Jean's
// own modules, workers and style sheets minified, and each file that compresses beside itself in
// brotli (.br) and gzip (.gz), which the server sends as they are rather than compressing on the fly.
// capabilities.json lists the minified files' hashes and the version they make, which sw.js carries,
// so the service worker checks what is served; the render package keeps its own (D305).
// POLICY, a JSON object as the gateway's GATEWAY_CONFIG is, becomes the site's policy.json, which
// index.html names, as an organisation would do by hand (docs/enterprise.md, D344). ADDRESS, the address
// the site is served from, adds opensearch.xml, which index.html names, so browsers offer the site as
// a search engine (D353), and what search engines and shared links read: index.html's title, canonical
// address, cards and schema.org data, robots.txt and sitemap.xml, the site's pages every copy has (the privacy
// policy, the terms, where files go) written for that address, every other page of app/ unindexed (D355). An
// ADDRESS on the brand's own domain, jean.is's, adds the site's other pages: the one under the app's first screen,
// in index.html and in one page per language beside it (D397), the family page (D424) and the page for IT (D428).
// Every page of the site is held to what site/checks.js asks of it, and a problem stops the build (D438).
// Usage: [POLICY='{…}'] [ADDRESS=https://…/] npm run build:web     (runs npm run build first); deploying copies dist/web/
import { availableParallelism } from 'node:os'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { brotliCompress, constants, gzip } from 'node:zlib'
import { transform } from 'esbuild'
import { shippedFiles, xml } from './desktop.js'
import { buildCapabilities, computeVersion, integrityOf, sha256, stampVersion } from './manifest.js'
import { buildSite, ownSite } from '../site/site.js'
import { checkSite } from '../site/checks.js'
import { inLanguage } from '../site/home/page.js'
import { siteBase, siteFiles, unindexed, withSite } from './seo.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP = join(ROOT, 'app')
const OUT = join(ROOT, 'dist', 'web')

/** The start of the user's own CSS, read and shown as it is, comments and all (D111). */
const SHOWN = ['ui/touches.css']

/**
 * Whether a file is minified: Jean's own code, but the service worker, whose version line is stamped
 * here, the bridge, which people read before Node runs it, and third-party code, which its authors
 * already make as small as it gets.
 * @param {string} path  posix path relative to app/
 */
export const minifies = (path) => (/^(core|ui|caps|ee)\/.+\.(js|css)$/.test(path) || path === 'brand.js') && !SHOWN.includes(path)

/** Formats that are compressed already, which brotli and gzip only make bigger. */
const PACKED = /\.(woff2|png|jpe?g|webp|zip|sf3)$/

/**
 * A file of Jean's as it ships: no comments, whitespace or long local names, and nothing else changed.
 * A module stays a module and a classic script keeps its global names (esbuild tells them apart);
 * no syntax is lowered and no prefix added, so what runs is what was written; text stays UTF-8; an
 * SPDX notice at the top stays (ee/). A style sheet only loses its whitespace and comments: esbuild's
 * other rewrites turn oklch() colours into sRGB ones, rounded, for a few bytes.
 * @param {string} path
 * @param {string} source
 */
export async function minify (path, source) {
  const notice = /^(?:\/\/ SPDX-.*\n)+/.exec(source)?.[0] ?? ''
  const how = path.endsWith('.css') ? { loader: /** @type {const} */ ('css'), minifyWhitespace: true } : { loader: /** @type {const} */ ('js'), minify: true }
  const { code } = await transform(source, { ...how, charset: 'utf8', legalComments: 'none' })
  return notice + code
}

/**
 * index.html, or check.html, naming the policy beside it, once. @param {string} html
 */
export function withPolicy (html) {
  if (html.includes('name="app-policy"') || !html.includes('</head>')) throw new Error('The page already names a policy, or has no </head>')
  return html.replace('</head>', '<meta name="app-policy" content="policy.json">\n</head>')
}

/**
 * The site as a search engine for browsers' address bars (OpenSearch, D353): a search opens it with
 * `?q=`, which Jean puts in the box. Its addresses are whole, as Chromium and Firefox refuse relative
 * ones, so it is written for one address. Safari adds no search engines.
 * @param {string} site  the address the site is served from
 * @param {{ name: string }} brand
 * @param {string} description  index.html's, as the install's is
 */
export function openSearch (site, brand, description) {
  const base = xml(siteBase(site))
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${xml(brand.name)}</ShortName>
  <Description>${xml(description)}</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="192" height="192" type="image/png">${base}icons/icon-192.png</Image>
  <Url type="text/html" method="get" template="${base}?q={searchTerms}"/>
</OpenSearchDescription>
`
}

/**
 * index.html naming the site's OpenSearch description, once. @param {string} html @param {{ name: string }} brand
 */
export function withSearch (html, brand) {
  if (html.includes('rel="search"') || !html.includes('</head>')) throw new Error('index.html already names a search, or has no </head>')
  return html.replace('</head>', `<link rel="search" type="application/opensearchdescription+xml" title="${xml(brand.name)}" href="opensearch.xml">\n</head>`)
}

/**
 * capabilities.json and sw.js for the files as they are now: each path's hash, and the version their
 * hashes make. The render package's listing is the one `npm run manifest` wrote, from app/, since it
 * names the package made from there.
 * @param {string} listing  capabilities.json
 * @param {string} worker  sw.js
 * @param {(path: string) => Promise<Uint8Array>} read
 */
export async function restamp (listing, worker, read) {
  const { shell, locales, integrity, capabilities, render } = JSON.parse(listing)
  /** @type {Array<[string, string]>} */
  const hashes = await Promise.all(Object.keys(integrity).map(async (path) => /** @type {[string, string]} */ ([path, sha256(await read(path))])))
  const version = computeVersion(hashes)
  const stamped = stampVersion(worker, version)
  if (!stamped) throw new Error("sw.js has no `const VERSION = '…'` line")
  return {
    version,
    listing: buildCapabilities(version, shell, locales, Object.fromEntries(hashes.map(([path, hash]) => [path, integrityOf(hash)])), capabilities, render),
    worker: stamped,
  }
}

/**
 * The file in brotli at its best and in gzip at its best, each only when smaller than the file.
 * @param {string} path
 * @param {Buffer} data
 * @returns {Promise<Array<[string, Buffer]>>} [ending, bytes]
 */
export async function precompress (path, data) {
  if (PACKED.test(path)) return []
  const [br, gz] = await Promise.all([
    promisify(brotliCompress)(data, { params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }),
    promisify(gzip)(data, { level: constants.Z_BEST_COMPRESSION }),
  ])
  return /** @type {Array<[string, Buffer]>} */ ([['.br', br], ['.gz', gz]]).filter(([, bytes]) => bytes.length < data.length)
}

/**
 * Runs `work` on every item, `width` at a time, the first ones first.
 * @template T
 * @param {T[]} items @param {number} width @param {(item: T) => Promise<void>} work
 */
async function inTurn (items, width, work) {
  const queue = [...items]
  await Promise.all(Array.from({ length: width }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item)
  }))
}

async function main () {
  const files = await shippedFiles(APP)
  const policy = process.env.POLICY ? `${JSON.stringify(JSON.parse(process.env.POLICY), null, 2)}\n` : null
  const { BRAND } = await import(pathToFileURL(join(APP, 'brand.js')).href)
  const index = await readFile(join(APP, 'index.html'), 'utf8')
  const description = /<meta name="description" content="([^"]*)">/.exec(index)?.[1] ?? ''
  const search = process.env.ADDRESS ? openSearch(process.env.ADDRESS, BRAND, description) : null
  const base = process.env.ADDRESS ? siteBase(process.env.ADDRESS) : null
  const languages = (await readdir(join(APP, 'locales'))).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length)).sort()
  /**
   * index.html naming the policy and the search the site has, and as search engines read it: at the
   * site's address, or in another language at its own (D397).
   * @param {string} html @param {string | null} [said]  its description in that language @param {string | null} [address]
   */
  const page = (html, said = null, address = base) => {
    const named = policy ? withPolicy(html) : html
    const searched = search ? withSearch(named, BRAND) : named
    const described = said ? inLanguage(searched, said) : searched
    return base ? withSite(described, base, BRAND, said ?? description, languages, address ?? base) : described
  }
  // The site's pages at ADDRESS (site/, D438): those every copy has, written for it, and on the brand's own domain the
  // others too, the homepage in index.html and in its languages' pages; each held to what the site's pages must be.
  const own = base !== null && ownSite(base, BRAND)
  const site = base ? await buildSite({ brand: BRAND, base, ships: !own, index: own ? (said, address) => page(index, said, address) : undefined }) : null
  const problems = site ? checkSite(site, { base, served: files }) : []
  if (problems.length) throw new Error(`the site's pages: ${problems.join('; ')}`)
  /**
   * A page as the site serves it: index.html as above, check.html naming the policy too, for its weights host (D410),
   * and with ADDRESS, the site's own as it wrote them and any other unindexed. @param {string} path @param {string} html
   */
  const served = (path, html, named = policy && path === 'check.html' ? withPolicy(html) : html) => site?.files[path] ?? (path === 'index.html' ? page(html) : !base ? named : unindexed(named))
  await rm(OUT, { recursive: true, force: true })
  let before = 0
  let after = 0
  for (const path of files) {
    const data = await readFile(join(APP, path))
    const out = minifies(path) ? Buffer.from(await minify(path, data.toString('utf8'))) : path.endsWith('.html') ? Buffer.from(served(path, data.toString('utf8'))) : data
    if (minifies(path)) [before, after] = [before + data.length, after + out.length]
    await mkdir(dirname(join(OUT, path)), { recursive: true })
    await writeFile(join(OUT, path), out)
  }
  /** The files a deploy adds beside app/'s, or writes over them (index.html, the site's pages). @type {Record<string, string>} */
  const added = { ...policy && { 'policy.json': policy }, ...search && { 'opensearch.xml': search }, ...base && siteFiles(base, site?.pages.map((at) => base + at.address)), ...site?.files }
  for (const [path, text] of Object.entries(added)) {
    await mkdir(dirname(join(OUT, path)), { recursive: true })
    await writeFile(join(OUT, path), text)
    if (!files.includes(path)) files.push(path)
  }
  const read = (/** @type {string} */ path) => readFile(join(OUT, path))
  const { version, listing, worker } = await restamp((await read('capabilities.json')).toString('utf8'), (await read('sw.js')).toString('utf8'), read)
  await writeFile(join(OUT, 'capabilities.json'), listing)
  await writeFile(join(OUT, 'sw.js'), worker)
  // The biggest first, so the last to finish isn't one of them.
  const sizes = new Map(await Promise.all(files.map(async (path) => /** @type {[string, number]} */ ([path, (await read(path)).length]))))
  let packed = 0
  await inTurn([...files].sort((a, b) => (sizes.get(b) ?? 0) - (sizes.get(a) ?? 0)), availableParallelism(), async (path) => {
    for (const [ending, bytes] of await precompress(path, await read(path))) {
      await writeFile(join(OUT, path + ending), bytes)
      packed++
    }
  })
  const kb = (/** @type {number} */ bytes) => `${Math.round(bytes / 1024)} KB`
  console.log(`web: version ${version}, ${files.length} files in dist/web${Object.keys(added).length ? `, ${new Intl.ListFormat('en').format(Object.keys(added))} among them` : ''}, Jean's own code minified from ${kb(before)} to ${kb(after)}, ${packed} compressed copies beside them`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`web: ${error.message}`)
    process.exit(1)
  })
}
