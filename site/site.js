// Jean's pages beside the app (D438): each is a folder of site/, its page.js saying its address in each language
// and what it holds, its words in each language as <lang>.json, English's and French's at least, its text as
// <lang>.html where it is prose, and its own style sheet, <folder>.css, or another page's, over site.css and the app's. This module
// gives every page the same document, written once per language: the policy, which runs the app's theme line and,
// for a page with a script of its own, that script, and nothing else, what search engines and shared links read
// when the site's address is known (the canonical address, every language's, the cards), the top with the
// languages and the way into the app, and the foot. checks.js says what each page must be, and the builds stop on
// what it finds (test/site.test.js runs it in npm run check).
// A page that `ships` (the privacy policy, the terms, where files go) is written into app/ by npm run build, so every
// copy has it and links to it; the others only the brand's own site has: build:web writes them for an ADDRESS on its
// domain, and `node scripts/serve.js --home` (npm run dev:home) serves them as it does. The homepage is the one page
// that isn't a document of its own: it goes under the app's first screen, in index.html (site/home/page.js, D397).
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dir, languageName } from '../app/core/i18n.js'
import { xml } from '../scripts/desktop.js'
import { SHARE } from '../scripts/manifest.js'

export { xml }

export const SITE = fileURLToPath(new URL('.', import.meta.url))
const APP = join(SITE, '..', 'app')

/** The languages every page has, English first. */
export const LANGUAGES = ['en', 'fr']

/** Jean's public repository, its code with the pilot kit's documents and the trust pack, where the pages say Source code. */
export const REPOSITORY = 'https://github.com/jean-is/jean'

/** What people use Jean for, each a page: the jobs (D453), bringing one's history (D452), the AI offline (D454), as the foot lists them. */
export const USES = ['excel', 'pdf', 'slides', 'import', 'offline']

/** The comparison's pages (D445), the hub first, then a product's each, in the order the foot and the hub list them. */
export const COMPARED = ['compare', 'compare-chatgpt', 'compare-claude-cowork', 'compare-openclaw', 'compare-open-webui']

/** Whether the site at `base` is the brand's own, the one site with every page (scripts/seo.js). */
export { ownSite } from '../scripts/seo.js'

/**
 * @typedef {Record<string, string | string[] | string[][]>} Words
 * @typedef {Record<string, string>} Params
 *
 * A page of the site: its folder's page.js.
 * @typedef {object} Page
 * @property {Record<string, string>} addresses  each language's address from the site's root ('' is the root), one per <lang>.json
 * @property {boolean} [ships]  in every copy of Jean: npm run build writes it into app/
 * @property {(kit: Kit) => string} main  what its <main> holds, as HTML
 * @property {(kit: Kit) => string} [title]  its title, its words' `title` otherwise
 * @property {string} [style]  the page whose style sheet it shares, its own otherwise
 * @property {string} [script]  what it runs after the foot, the same in every language, which its policy allows by its hash
 * @property {boolean} [sends]  whether its form sends to the site's own address (the request service, D446)
 * @property {(kit: Kit) => string} [foot]  what the foot adds for it, as HTML
 * @property {(kit: Kit, main: string) => string} [document]  the whole file, for the page that isn't a document of its own
 *
 * What a page is written with, in one language.
 * @typedef {object} Kit
 * @property {string} name  the page's folder
 * @property {string} lang
 * @property {'ltr' | 'rtl'} dir
 * @property {string[]} languages  the page's, English first
 * @property {{ name: string, domain: string }} brand
 * @property {string | null} base  the site's whole address, null for app/'s copy, which names no address
 * @property {Date} now
 * @property {(key: string, params?: Params) => string} say  one of its strings (or the site's shared ones), filled and escaped
 * @property {(key: string, params?: Params) => string} text  the same, filled but not escaped, for what isn't HTML yet
 * @property {(key: string, params?: Params) => string[]} list
 * @property {(key: string, width?: number, params?: Params) => string[][]} table
 * @property {(key: string) => boolean} has
 * @property {(key: string) => Words[string]} raw  one of its words as written, for what the page fills itself
 * @property {(key: string, params?: Params) => string} app  one of the app's own strings, so the page says what the app says
 * @property {(key: string) => string} appText  the same, as written, to fill another string with
 * @property {(page: string) => { say: (key: string, params?: Params) => string, text: (key: string, params?: Params) => string }} from  another page's
 *   strings, in this language or English's
 * @property {(path: string) => string} site  a file at the site's root, from this page
 * @property {(page: string) => string | null} link  another page, from this one, in this language or English's; null where it isn't built
 * @property {string} start  the app, from this page: the homepage in this language, where there is one
 * @property {(lang: string) => string | null} address  this page's whole address in a language, with the site's
 * @property {string} prose  <lang>.html, the page's text as written, where it is prose
 * @property {(said: string | null, address: string) => string} [index]  index.html as the build leaves it, for the homepage
 */

/** A text with its {params} filled. @param {string} text @param {Params} params */
export const fill = (text, params) => text.replace(/\{(\w+)\}/g, (whole, key) => params[key] ?? whole)

const svg = (/** @type {string} */ body, extra = '') => /* html */ `<svg class="icon${extra}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`
export const ICONS = {
  lock: svg('<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  plus: svg('<path d="M12 6v12M6 12h12"/>'),
  bell: svg('<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  brain: svg('<circle cx="12" cy="12" r="8.5"/><path d="M7.5 12.5c1.5-2.4 3-2.4 4.5 0s3 2.4 4.5 0"/>'),
  computer: svg('<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M2.5 19.5h19"/>'),
  key: svg('<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5 19 4M16 7l2 2M14 9l2 2"/>'),
  never: svg('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>'),
  note: svg('<path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  app: svg('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9h17"/>'),
  tree: svg('<circle cx="12" cy="5" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M12 7v4M6 16v-3h12v3"/>'),
  file: svg('<path d="M7 3.5h6.5L18 8v12.5H7z"/><path d="M13.5 3.5V8H18"/>'),
  chart: svg('<path d="M5 19.5V11M10 19.5V6M15 19.5v-6M20 19.5V9"/>'),
  pin: svg('<path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11z"/><circle cx="12" cy="10" r="2"/>'),
  table: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>'),
  picture: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M20.5 16l-5-5-8 8.5"/>'),
  shield: svg('<path d="M12 3.5l7 2.5v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>'),
  down: svg('<path d="M7 10l5 5 5-5"/>'),
  globe: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.5 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.5-3.6-8.5s1.1-5.9 3.6-8.5z"/>'),
  closed: svg('<path d="M12 5v14M5 12h14"/>', ' is-closed'),
  open: svg('<path d="M5 12h14"/>', ' is-open'),
}
/** Jean's wave, as the app draws it still. */
export const WAVE = '<app-persona data-presence="idle" aria-hidden="true"><svg class="persona" viewBox="12 18 40 28" focusable="false"><g class="persona-wave"><path class="persona-line" d="M-28 32q6-11 12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0"/></g></svg></app-persona>'

/** Questions that open one at a time, the first open. @param {string} name  their group @param {string[][]} items  each a question and its answer, as HTML */
export const questions = (name, items) => /* html */ `<div class="site-questions">${items.map(([question, answer], i) => /* html */ `
    <details name="${name}"${i ? '' : ' open'}><summary>${question}${ICONS.closed}${ICONS.open}</summary><p>${answer}</p></details>`).join('')}
  </div>`

/** Items each with a tick. @param {string[]} items  HTML */
export const ticks = (items) => /* html */ `<ul class="site-ticks">${items.map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>`

/**
 * The felt-tip pen (D443): what a page most wants read, underlined, circled, struck through, ticked or pointed at by
 * hand, and a highlighter over a line. Every mark is a drawing without words, hidden from screen readers; site.css
 * colours them, turns them round right to left and leaves them out in forced colours.
 */
const pen = (/** @type {string} */ kind, /** @type {string} */ box, /** @type {string} */ d, stretch = false) => /* html */ `<svg class="felt-${kind}" viewBox="${box}"${stretch ? ' preserveAspectRatio="none"' : ''} aria-hidden="true"><path d="${d}"/></svg>`
const STROKES = {
  under: pen('under', '0 0 200 20', 'M2 12C50 7 120 6 198 8M14 16C76 12 146 12 192 13', true),
  circle: pen('circle', '0 0 200 100', 'M112 10C60 4 12 18 8 48C4 80 60 94 112 90C168 86 196 66 192 42C188 16 140 4 84 14', true),
  strike: pen('strike', '0 0 200 40', 'M2 23C60 19 130 22 198 17M6 28C70 24 140 26 194 22', true),
}
const TICKS = ['M3.5 12.5C5.5 14 7.5 16.5 9.5 19.5C12.5 13 16 7.5 21.5 3.5', 'M3 13C5 15 7.5 17 9 20C12 14 16 8 21 4', 'M4 12C6 14.5 7.5 16.5 9.5 19C13 12 16.5 8 21 3.5']
export const FELT = {
  /** A tick before an item, one of three hands. @param {number} i */
  tick: (i) => pen('tick', '0 0 24 24', TICKS[i % TICKS.length]),
  /** An arrow arching over a gap, down to what follows it. */
  arc: pen('arc', '0 0 120 70', 'M8 56C22 14 82 4 108 44M92 36C98 40 104 43 109 47C111 40 112 34 112 27'),
  /** An arrow from beside something, pointing at it. */
  point: pen('point', '0 0 90 60', 'M6 10C20 40 50 52 80 44M66 34C72 38 77 41 82 44C77 47 72 51 68 56'),
  /** An arrow across, from one box to the next. */
  across: pen('across', '0 0 64 40', 'M10 24C24 14 38 16 52 20M44 12C48 15 51 18 54 20C50 23 46 26 43 30'),
}

/** Words underlined, circled or struck through by hand. @param {string} html @param {keyof typeof STROKES} how */
export const felt = (html, how) => /* html */ `<span class="felt is-${how}">${html}${STROKES[how]}</span>`

/** Words under the highlighter. @param {string} html */
export const highlight = (html) => /* html */ `<span class="felt-mark">${html}</span>`

/** A heading with the phrase its words name underlined by hand; a phrase the heading lacks stops the build. @param {string} heading @param {string} phrase  both HTML */
export function underline (heading, phrase) {
  if (!heading.includes(phrase)) throw new Error(`“${phrase}” isn't in “${heading}”`)
  return heading.replace(phrase, () => felt(phrase, 'under'))
}

/**
 * A page of prose that every copy has: its text in each language as written, <lang>.html, whose links name the
 * site's pages ({privacy}, {terms}…) and its root ({root}check), filled from where it is.
 * @param {Record<string, string>} addresses @returns {Page}
 */
export const prose = (addresses) => ({ addresses, ships: true, main: (kit) => /* html */ `<article class="prose site-prose">\n${kit.prose}</article>` })

/**
 * The theme line the app's documents run first (app/index.html's first script), and the hash a page's policy allows it by.
 * @returns {Promise<{ script: string, hash: string }>}
 */
export async function theme () {
  const html = await readFile(join(APP, 'index.html'), 'utf8')
  const script = /<script>([^<]*)<\/script>/.exec(html)?.[1]
  if (!script) throw new Error('app/index.html has no theme line')
  return { script, hash: `'sha256-${createHash('sha256').update(script).digest('base64')}'` }
}

/**
 * The theme line for a page `up` folders below the site's root, the look's style sheet named from the root, and its hash.
 * @param {{ script: string, hash: string }} root  theme()'s @param {string} up  '' or '../', once a folder
 */
export function themeFor ({ script, hash }, up) {
  if (!up) return { script, hash }
  const below = script.replace('href: `ui/looks/', `href: \`${up}ui/looks/`)
  if (below === script) throw new Error('app/index.html’s theme line no longer names ui/looks/ as it did')
  return { script: below, hash: `'sha256-${createHash('sha256').update(below).digest('base64')}'` }
}

/** A JSON file, or null when there is none. @param {string} path */
const json = async (path) => JSON.parse(await readFile(path, 'utf8').catch(() => 'null'))

/** The site's pages, by folder: each folder of site/ with a page.js. @returns {Promise<Map<string, Page>>} */
export async function sitePages () {
  const folders = (await readdir(SITE, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  /** @type {Map<string, Page>} */
  const pages = new Map()
  for (const name of folders) {
    if ((await readdir(join(SITE, name))).includes('page.js')) pages.set(name, (await import(pathToFileURL(join(SITE, name, 'page.js')).href)).default)
  }
  return pages
}

/** A page's languages, English first: those it has words in. @param {string} name */
export async function languagesOf (name) {
  const langs = (await readdir(join(SITE, name))).filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -'.json'.length))
  return ['en', ...langs.filter((lang) => lang !== 'en').sort()]
}

/** A page's words in a language, or the site's shared ones (site/words/). @param {string} name @param {string} lang @returns {Promise<Words | null>} */
export const wordsOf = (name, lang) => json(join(SITE, name, `${lang}.json`))

/** The app's strings in a language over English's, every catalogue part of them. @param {string} lang @returns {Promise<Record<string, string>>} */
export async function appWords (lang) {
  const parts = ['', ...(await readdir(join(APP, 'locales'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)]
  const words = {}
  for (const code of ['en', lang]) for (const part of parts) Object.assign(words, await json(join(APP, 'locales', part, `${code}.json`)))
  return words
}

/** The file a page's address is served from. @param {string} address */
export const fileOf = (address) => `${address || 'index'}.html`

/**
 * One page, in one language: the site's document around what it holds, or its own (the homepage's).
 * @param {Page} page @param {Kit} kit @param {{ script: string, hash: string }} root  theme()'s @param {string | null} sheet  its style sheet, if it has one
 */
function written (page, kit, root, sheet) {
  const main = page.main(kit)
  if (page.document) return page.document(kit, main)
  const up = kit.site('')
  const { script, hash } = themeFor(root, up === './' ? '' : up)
  const own = page.script ? ` 'sha256-${createHash('sha256').update(page.script).digest('base64')}'` : ''
  const title = page.title ? page.title(kit) : kit.say('title')
  const description = kit.say('description')
  const seo = kit.base === null ? [] : [
    /* html */ `<link rel="canonical" href="${xml(kit.address(kit.lang) ?? '')}">`,
    ...[...kit.languages, 'x-default'].map((code) => /* html */ `<link rel="alternate" hreflang="${code}" href="${xml(kit.address(code === 'x-default' ? 'en' : code) ?? '')}">`),
    ...Object.entries({ 'og:type': 'website', 'og:site_name': xml(kit.brand.name), 'og:title': title, 'og:description': description, 'og:url': xml(kit.address(kit.lang) ?? ''),
      'og:image': xml(kit.base + SHARE.src), 'og:image:width': String(SHARE.width), 'og:image:height': String(SHARE.height), 'og:image:alt': xml(SHARE.alt) })
      .map(([property, content]) => /* html */ `<meta property="${property}" content="${content}">`),
    '<meta name="twitter:card" content="summary_large_image">',
  ]
  return /* html */ `<!doctype html>
<html lang="${kit.lang}" dir="${kit.dir}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${hash}${own}; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action ${page.sends ? "'self'" : "'none'"}; require-trusted-types-for 'script'; trusted-types 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<script>${script}</script>
<meta name="referrer" content="no-referrer">
<meta name="description" content="${description}">
<title>${title}</title>
<link rel="icon" href="${kit.site('icons/favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${kit.site('ui/style.css')}">
<link rel="stylesheet" href="${kit.site('site.css')}">
${sheet ? /* html */ `<link rel="stylesheet" href="${kit.site(sheet)}">\n` : ''}${seo.map((line) => `${line}\n`).join('')}</head>
<body class="site">
${top(kit, page)}
<main id="main">
${main}
</main>
${foot(kit, '', page.foot?.(kit))}
${page.script ? /* html */ `<script>${page.script}</script>\n` : ''}</body>
</html>
`
}

/** The top: a way past it, the name, whom the page is for, its languages, and the way into the app. @param {Kit} kit @param {Page} page */
function top (kit, page) {
  const languages = kit.languages.map((code) => code === kit.lang
    ? /* html */ `<span lang="${code}" aria-current="page">${xml(languageName(code))}</span>`
    : /* html */ `<a href="${kit.site(page.addresses[code])}" hreflang="${code}" lang="${code}">${xml(languageName(code))}</a>`)
  return /* html */ `<a class="site-skip" href="#main">${kit.say('skip')}</a>
<header class="site-top">
  <a class="wordmark" href="${kit.start}">${WAVE}${xml(kit.brand.name)}</a>${kit.has('for') ? /* html */ `<span class="site-for">${kit.say('for')}</span>` : ''}
  <nav class="site-langs" aria-label="${kit.say('languages')}">${ICONS.globe}${languages.join('')}</nav>
  <a class="button" href="${kit.start}">${kit.say('open')}</a>
</header>`
}

/**
 * The foot every page ends with, the same on each: what a page says of itself first, where it has something (the
 * comparison's pages, where their facts were read); then the name, what Jean is and where it's made; the pages every
 * copy has and the source; whom the site's other pages are for, where they're built, with the homepage's language
 * menu; what people use Jean for (USES); and the comparison's pages (D445). The page it is on is marked, not left out.
 * @param {Kit} kit @param {string} [languages]  HTML @param {string} [more]  HTML
 */
export function foot (kit, languages = '', more = '') {
  const item = (/** @type {string | null} */ href, /** @type {string} */ label, /** @type {string} */ name = '') => (href ? /* html */ `<li><a href="${href}"${name === kit.name ? ' aria-current="page"' : ''}>${label}</a></li>` : '')
  const audiences = item(kit.link('family'), kit.say('foot.families'), 'family') + item(kit.link('work'), kit.say('foot.work'), 'work')
    + item(kit.link('teachers'), kit.say('foot.teachers'), 'teachers') + item(kit.link('associations'), kit.say('foot.associations'), 'associations')
    + item(kit.link('public-sector'), kit.say('foot.public'), 'public-sector') + item(kit.link('enterprise'), kit.say('foot.it'), 'enterprise')
  const uses = USES.map((name) => item(kit.link(name), kit.say(`foot.${name}`), name)).join('')
  const compared = COMPARED.map((name, i) => item(kit.link(name), i ? kit.from(name).say('product') : kit.say('foot.all'), name)).join('')
  return /* html */ `<footer class="site-foot">${more}
  <div><p class="site-mark">${xml(kit.brand.name)}</p><p>${kit.say('foot.tagline')}</p><p>${kit.say('foot.made')}</p></div>
  <nav aria-labelledby="site-foot-site"><p id="site-foot-site" class="site-foot-head">${xml(kit.brand.name)}</p><ul>
    ${item(kit.link('files'), kit.app('welcome.files'), 'files')}${item(kit.link('privacy'), kit.app('welcome.privacy'), 'privacy')}${item(kit.link('terms'), kit.app('welcome.terms'), 'terms')}${item(REPOSITORY, kit.say('foot.source'))}
  </ul></nav>${audiences || languages ? /* html */ `
  <nav aria-labelledby="site-foot-for"><p id="site-foot-for" class="site-foot-head">${kit.say('foot.for')}</p>${audiences ? /* html */ `<ul>
    ${audiences}
  </ul>` : ''}${languages}</nav>` : ''}${uses ? /* html */ `
  <nav aria-labelledby="site-foot-uses"><p id="site-foot-uses" class="site-foot-head">${kit.say('foot.uses')}</p><ul>
    ${uses}
  </ul></nav>` : ''}${compared ? /* html */ `
  <nav aria-labelledby="site-foot-compared"><p id="site-foot-compared" class="site-foot-head">${kit.say('foot.compared')}</p><ul>
    ${compared}
  </ul></nav>` : ''}
</footer>`
}

/**
 * The site's pages as files, each language's at its address, with site.css and each page's style sheet; with
 * what checks.js reads of each.
 * @param {object} options
 * @param {{ name: string, domain: string }} options.brand
 * @param {string | null} [options.base]  the site's whole address (siteBase()'s): what search engines read is written for it
 * @param {boolean} [options.ships]  only the pages every copy has, for app/
 * @param {(said: string | null, address: string) => string} [options.index]  index.html as the build leaves it, in a
 *   language's description (null: its own) and for an address; without it, no homepage
 * @param {Date} [options.now]
 */
export async function buildSite ({ brand, base = null, ships = false, index, now = new Date() }) {
  const all = await sitePages()
  const built = new Map([...all].filter(([name, page]) => (ships ? page.ships : !page.document || index)))
  const root = await theme()
  /** @type {Record<string, string>} */
  const files = { 'site.css': await readFile(join(SITE, 'site.css'), 'utf8') }
  /** @type {Array<{ path: string, name: string, lang: string, address: string, fragment: boolean }>} */
  const pages = []
  // Every page's words, and the site's shared ones (site/words/), in each of its languages; a page may repeat another's.
  /** @type {Map<string, Record<string, Words>>} */
  const words = new Map()
  for (const name of [...all.keys(), 'words']) {
    words.set(name, Object.fromEntries(await Promise.all((await languagesOf(name)).map(async (lang) => [lang, /** @type {Words} */ (await wordsOf(name, lang))]))))
  }
  for (const [name, page] of built) {
    const languages = await languagesOf(name)
    if (languages.join() !== [...new Set(['en', ...Object.keys(page.addresses).sort()])].join()) throw new Error(`site/${name}: its words are in ${languages.join(', ')}, its addresses in ${Object.keys(page.addresses).join(', ')}`)
    const style = page.style ?? name
    const css = await readFile(join(SITE, style, `${style}.css`), 'utf8').catch(() => null)
    if (css !== null) files[`${style}.css`] = css
    for (const lang of languages) {
      const shared = words.get('words')?.[lang]
      if (!shared) throw new Error(`site/${name} is in ${lang}, site/words/ isn't`)
      const own = words.get(name)?.[lang] ?? {}
      const kit = await kitFor({ name, page, lang, languages, own, shared, others: words, brand, base, now, built, index })
      const path = fileOf(page.addresses[lang])
      files[path] = written(page, kit, root, css === null ? null : `${style}.css`)
      pages.push({ path, name, lang, address: page.addresses[lang], fragment: Boolean(page.document) })
    }
  }
  return { files, pages, words }
}

/**
 * The pages every copy has, as npm run build writes them into app/: each language's, with their style sheets, held to
 * what checks.js asks of every page; a problem stops the build. @param {string[]} served  app/'s other files
 */
export async function shippedPages (served) {
  const { checkSite } = await import('./checks.js')
  const site = await buildSite({ brand: (await import(pathToFileURL(join(APP, 'brand.js')).href)).BRAND, ships: true })
  const problems = checkSite(site, { served })
  if (problems.length) throw new Error(`site/: ${problems.join('; ')}`)
  return site.files
}

/**
 * @param {{ name: string, page: Page, lang: string, languages: string[], own: Words, shared: Words, others: Map<string, Record<string, Words>>,
 *   brand: { name: string, domain: string }, base: string | null, now: Date, built: Map<string, Page>, index?: (said: string | null, address: string) => string }} at
 * @returns {Promise<Kit>}
 */
async function kitFor ({ name, page, lang, languages, own, shared, others, brand, base, now, built, index }) {
  const [app, body] = await Promise.all([appWords(lang), readFile(join(SITE, name, `${lang}.html`), 'utf8').catch(() => '')])
  const params = { name: brand.name, domain: brand.domain }
  /** @param {Words} words @param {string} key @param {string} where */
  const lookup = (words, key, where) => {
    const value = words[key] ?? shared[key]
    if (value === undefined) throw new Error(`${where}: ${key} is missing`)
    return value
  }
  const where = `site/${name}/${lang}.json`
  /** @type {Kit['text']} */
  const text = (key, more = {}) => {
    const value = lookup(own, key, where)
    if (typeof value !== 'string') throw new Error(`${where}: ${key} is not a string`)
    return fill(value, { ...params, ...more })
  }
  const up = '../'.repeat(page.addresses[lang].split('/').length - 1)
  const site = (/** @type {string} */ path) => up + path || './'
  /** @type {Kit['link']} */
  const link = (other) => {
    const target = built.get(other)
    return target ? site(target.addresses[lang] ?? target.addresses.en) : null
  }
  const home = built.get('home')
  const links = { ...Object.fromEntries([...built.keys()].map((other) => [other, link(other) ?? ''])), root: site('') === './' ? '' : site('') }
  return {
    name, lang, dir: dir(lang), languages, brand, base, now, index, prose: fill(body, links),
    say: (key, more) => xml(text(key, more)),
    text,
    list: (key, more = {}) => {
      const items = lookup(own, key, where)
      if (!Array.isArray(items) || items.some((item) => typeof item !== 'string')) throw new Error(`${where}: ${key} is not a list`)
      return /** @type {string[]} */ (items).map((item) => xml(fill(item, { ...params, ...more })))
    },
    table: (key, width, more = {}) => {
      const items = lookup(own, key, where)
      if (!Array.isArray(items) || items.some((item) => !Array.isArray(item) || (width !== undefined && item.length !== width))) throw new Error(`${where}: ${key} is not a list of lists${width ? ` of ${width}` : ''}`)
      return /** @type {string[][]} */ (items).map((item) => item.map((cell) => xml(fill(cell, { ...params, ...more }))))
    },
    has: (key) => key in own || key in shared,
    raw: (key) => lookup(own, key, where),
    app: (key, more = {}) => xml(fill(app[key] ?? '', { ...params, ...more })),
    appText: (key) => app[key] ?? '',
    from: (other) => {
      const words = { ...others.get(other)?.en, ...others.get(other)?.[lang] }
      /** @param {string} key @param {Params} [more] */
      const theirs = (key, more = {}) => {
        if (typeof words[key] !== 'string') throw new Error(`site/${other}/en.json: ${key} is missing or not a string`)
        return fill(String(words[key]), { ...params, ...more })
      }
      return { say: (key, more) => xml(theirs(key, more)), text: theirs }
    },
    site,
    link,
    start: home?.addresses[lang] !== undefined && !page.ships ? site(home.addresses[lang]) : site(''),
    address: (code) => (base === null || page.addresses[code] === undefined ? null : base + page.addresses[code]),
  }
}
