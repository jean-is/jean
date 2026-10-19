// What every page of the site must be (D438), read from the HTML the builds write, so that a page added is held to
// it as it is served, with nothing to register. buildSite()'s pages, each in each of its languages:
// - for people who can't see or can't use a mouse: its language and direction said, one h1 and headings that never
//   skip a level, one top, one main and one foot, each of several navigations named, every link, button and field
//   named, every id once and every reference to one found, pictures named or hidden, no tip repeating a name (D233),
//   no tab order of its own, and the app's style sheet, whose rules honour reduced motion, more contrast and forced
//   colours; contrast itself is checked in browsers (test/site.spec.js);
// - for search engines and shared links, once the site's address is known: a title and a description of a length
//   a result shows whole, each the site's only one, the canonical address, every language's version named, the
//   default's English, the cards, and nothing that keeps it out of results;
// - in every language: English's and French's at least, each with English's words, of the same kinds, with the same
//   {params}, its headings as English's are, nothing left as English's says it, French's spacing before ? ! : ;
// - and every link to the site's own pages and files reaching one it serves, and style sheets in logical properties.
import { dir } from '../app/core/i18n.js'
import { LANGUAGES } from './site.js'

/** How long a title and a description may be for a search result to show them whole, and how short a description. */
export const TITLE = 70
export const DESCRIPTION = { min: 50, max: 160 }

/** @typedef {{ name: string, attrs: Record<string, string>, children: Array<Element | string>, parent: Element | null }} Element */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const TOKEN = /<!--[\s\S]*?-->|<!doctype[^>]*>|<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>|[^<]+|</gi
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

/** Text as HTML writes it, read back. @param {string} text */
const unescape = (text) => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, name) => {
  const lower = name.toLowerCase()
  if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16))
  if (lower.startsWith('#')) return String.fromCodePoint(Number(lower.slice(1)))
  return /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[lower] ?? whole
})

/** @param {string} source */
const attributes = (source) => Object.fromEntries([...source.matchAll(ATTRIBUTE)].map(([, name, a, b, c]) => [name.toLowerCase(), unescape(a ?? b ?? c ?? '')]))

/**
 * A page as a tree of elements, enough to read what the site writes: each element its name, attributes, children
 * (elements or text) and parent; a closing tag closes what it matches, and what it left open.
 * @param {string} html @returns {Element}
 */
export function parse (html) {
  /** @type {Element} */
  const root = { name: '#document', attrs: {}, children: [], parent: null }
  let at = root
  for (const [token, raw, rawAttrs, rawText, close, open, attrs] of html.matchAll(TOKEN)) {
    if (token.startsWith('<!')) continue
    if (raw) at.children.push({ name: raw.toLowerCase(), attrs: attributes(rawAttrs), children: [rawText], parent: at })
    else if (close) {
      let node = /** @type {Element | null} */ (at)
      while (node && node.name !== close.toLowerCase()) node = node.parent
      if (node?.parent) at = node.parent
    } else if (open) {
      /** @type {Element} */
      const element = { name: open.toLowerCase(), attrs: attributes(attrs), children: [], parent: at }
      at.children.push(element)
      if (!VOID.has(element.name) && !token.endsWith('/>')) at = element
    } else at.children.push(unescape(token))
  }
  return root
}

/** Every element under `node`, in document order. @param {Element} node @returns {Element[]} */
export const elements = (node) => node.children.flatMap((child) => (typeof child === 'string' ? [] : [child, ...elements(child)]))

/** Whether an element or one around it is hidden from assistive technologies. @param {Element | null} node */
const hidden = (node) => {
  for (let at = node; at; at = at.parent) if (at.attrs['aria-hidden'] === 'true' || 'hidden' in at.attrs || 'inert' in at.attrs) return true
  return false
}

/** What an element says, as a screen reader reads it: its text, the names of pictures, nothing hidden. @param {Element | string} node @returns {string} */
const textOf = (node) => {
  if (typeof node === 'string') return node
  if (node.attrs['aria-hidden'] === 'true' || ['script', 'style', 'template'].includes(node.name)) return ''
  if (node.name === 'img') return node.attrs.alt ?? ''
  return node.children.map(textOf).join('')
}

/** Its accessible name. @param {Element} node @param {Map<string, Element>} ids */
const nameOf = (node, ids) => (node.attrs['aria-label'] ?? (node.attrs['aria-labelledby'] ? node.attrs['aria-labelledby'].split(/\s+/).map((id) => textOf(ids.get(id) ?? '')).join(' ') : textOf(node))).trim()

/**
 * Whether a text is words a language would say its own way: three words or more, one of them not a name (an
 * address, a source or a list of products reads the same in every language). @param {string} text
 */
const sentence = (text) => / /.test(text) && (text.match(/\p{L}{2,}/gu)?.length ?? 0) >= 3 && /(^|[^\p{L}])\p{Ll}/u.test(text)

/**
 * The texts of a page a reader reads in its language: none in code, a name kept as it is (bdi), or a part in
 * another language. @param {Element} root @param {string} lang @returns {string[]}
 */
function textsOf (root, lang) {
  /** @type {string[]} */
  const texts = []
  /** @param {Element} node */
  const walk = (node) => {
    if (['script', 'style', 'code', 'pre', 'bdi', 'template', 'svg', 'head'].includes(node.name) || node.attrs.translate === 'no' || (node.attrs.lang && node.attrs.lang !== lang && node.name !== 'html')) return
    for (const child of node.children) {
      if (typeof child === 'string') { if (child.trim()) texts.push(child.trim().replace(/[ \t\r\n]+/g, ' ')) } else walk(child)
    }
  }
  walk(root)
  return texts
}

/**
 * What a page must be, in one language.
 * @param {string} html
 * @param {{ path: string, lang: string, address: string, fragment: boolean, addresses: Record<string, string>, base: string | null, served: Set<string> }} at
 * @returns {string[]} what's wrong, each said whole
 */
export function checkPage (html, { path, lang, address, fragment, addresses, base, served }) {
  const problems = /** @type {string[]} */ ([])
  const say = (/** @type {string} */ what) => problems.push(`${path}: ${what}`)
  const root = parse(html)
  const all = elements(root)
  const ids = new Map()
  for (const element of all) {
    const id = element.attrs.id
    if (id === undefined) continue
    if (ids.has(id)) say(`the id ${id} is there twice`)
    ids.set(id, element)
  }
  const named = (/** @type {string} */ name) => all.filter((element) => element.name === name)
  const shown = all.filter((element) => !hidden(element))

  // Its language and direction.
  const page = named('html')[0]
  if (page?.attrs.lang !== lang) say(`<html> says lang="${page?.attrs.lang}", not ${lang}`)
  if (page?.attrs.dir !== dir(lang)) say(`<html> says dir="${page?.attrs.dir}", not ${dir(lang)}`)
  if (!named('link').some((link) => /(^|\/)ui\/style\.css$/.test(link.attrs.href ?? ''))) say('it doesn’t load the app’s style sheet, whose rules honour reduced motion, more contrast and forced colours')

  // Headings: one h1, and never a level skipped.
  const headings = all.filter((element) => /^h[1-6]$/.test(element.name))
  if (headings.filter((heading) => heading.name === 'h1').length !== 1) say(`it has ${headings.filter((heading) => heading.name === 'h1').length} h1 headings, not one`)
  headings.reduce((before, heading) => {
    const level = Number(heading.name[1])
    if (level > before + 1) say(`its h${level} “${textOf(heading).trim()}” follows an h${before}`)
    if (!textOf(heading).trim()) say(`an h${level} says nothing`)
    return level
  }, 0)

  // Landmarks: one top, one main and one foot, the page's own, and each of several navigations named.
  const sectioning = (/** @type {Element} */ element) => {
    for (let at = element.parent; at; at = at.parent) if (['article', 'aside', 'main', 'nav', 'section'].includes(at.name)) return true
    return false
  }
  const banners = named('header').filter((header) => !sectioning(header))
  const feet = named('footer').filter((footer) => !sectioning(footer))
  const mains = named('main')
  if (fragment ? banners.length > 1 : banners.length !== 1) say(`it has ${banners.length} tops (header), not one`)
  if (fragment ? mains.length > 1 : mains.length !== 1) say(`it has ${mains.length} main parts, not one`)
  if (feet.length !== 1) say(`it has ${feet.length} feet (footer), not one`)
  const navs = named('nav')
  if (navs.length > 1) for (const nav of navs) if (!nameOf({ ...nav, children: [] }, ids)) say('one of its navigations has no name (aria-label or aria-labelledby)')

  // References to ids: labels, names, descriptions, and links within the page.
  for (const element of all) {
    for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for']) {
      for (const id of (element.attrs[attribute] ?? '').split(/\s+/).filter(Boolean)) if (!ids.has(id)) say(`${attribute}="${id}" names no element`)
    }
    const href = element.name === 'a' ? element.attrs.href ?? '' : ''
    if (href.startsWith('#') && href.length > 1 && !ids.has(decodeURIComponent(href.slice(1)))) say(`the link to ${href} leads nowhere on the page`)
  }

  // Names: links, buttons, fields and pictures; no tip repeating a name; no tab order of its own.
  for (const element of shown) {
    if ((element.name === 'a' && 'href' in element.attrs) || element.name === 'button') {
      if (!nameOf(element, ids)) say(`a ${element.name === 'a' ? `link to ${element.attrs.href}` : 'button'} has no name`)
    }
    if (['input', 'select', 'textarea'].includes(element.name) && element.attrs.type !== 'hidden') {
      const labelled = element.attrs['aria-label'] || element.attrs['aria-labelledby'] || (element.attrs.id && named('label').some((label) => label.attrs.for === element.attrs.id))
      let inLabel = false
      for (let at = element.parent; at; at = at.parent) if (at.name === 'label') inLabel = true
      if (!labelled && !inLabel) say(`a field (${element.name}) has no label`)
    }
    if (element.name === 'img' && element.attrs.alt === undefined) say(`a picture (${element.attrs.src}) has no alt`)
    if (element.name === 'svg' && !(element.attrs.role === 'img' && (element.attrs['aria-label'] || element.children.some((child) => typeof child !== 'string' && child.name === 'title')))) {
      let inSvg = false
      for (let at = element.parent; at; at = at.parent) if (at.name === 'svg') inSvg = true
      if (!inSvg) say('a drawing is neither hidden (aria-hidden="true") nor named (role="img" with a name)')
    }
    const tip = element.attrs.title
    if (tip !== undefined && element.name !== 'link' && (tip === element.attrs['aria-label'] || tip.trim() === textOf(element).trim())) say(`the tip “${tip}” repeats its name (D233)`)
    if (Number(element.attrs.tabindex) > 0) say(`tabindex="${element.attrs.tabindex}" makes a tab order of its own`)
  }

  // What search engines and shared links read, at the site's address.
  const meta = (/** @type {string} */ key) => named('meta').find((element) => element.attrs.name === key || element.attrs.property === key)?.attrs.content
  const title = textOf(named('title')[0] ?? '').trim()
  const description = meta('description') ?? ''
  if (!title || [...title].length > TITLE) say(`its title is ${[...title].length} characters, not between 1 and ${TITLE}: “${title}”`)
  if ([...description].length < DESCRIPTION.min || [...description].length > DESCRIPTION.max) say(`its description is ${[...description].length} characters, not between ${DESCRIPTION.min} and ${DESCRIPTION.max}`)
  if (/noindex/.test(meta('robots') ?? '')) say('it is kept out of search results (noindex)')
  if (base !== null) {
    const own = base + address
    const links = named('link')
    const canonical = links.filter((link) => link.attrs.rel === 'canonical').map((link) => link.attrs.href)
    if (canonical.join() !== own) say(`its canonical address is ${canonical.join(', ') || 'missing'}, not ${own}`)
    const versions = links.filter((link) => link.attrs.rel === 'alternate' && link.attrs.hreflang).map((link) => `${link.attrs.hreflang} ${link.attrs.href}`).sort()
    const expected = [...Object.entries(addresses).map(([code, at]) => `${code} ${base}${at}`), `x-default ${base}${addresses.en}`].sort()
    if (versions.join() !== expected.join()) say(`its language versions are ${versions.join(', ') || 'missing'}, not ${expected.join(', ')}: each language's once, itself among them, English's the default`)
    for (const key of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:image']) if (!meta(key)) say(`its card has no ${key}`)
    if (meta('og:url') !== own) say(`its card's og:url is ${meta('og:url')}, not ${own}`)
    if (meta('twitter:card') !== 'summary_large_image') say('it names no large card for X (twitter:card)')
  }

  // Links to the site's own pages and files reach one it serves.
  const here = new URL(address, base ?? 'https://site.invalid/')
  for (const element of all) {
    const href = element.name === 'a' || element.name === 'link' ? element.attrs.href : undefined
    if (href === undefined || href.startsWith('#') || /^(mailto|tel):/.test(href)) continue
    const url = new URL(href, here)
    if (url.origin !== here.origin) continue
    const target = decodeURIComponent(url.pathname.slice(new URL(base ?? 'https://site.invalid/').pathname.length))
    const found = served.has(target) || served.has(`${target}.html`) || ((target === '' || target.endsWith('/')) && served.has(`${target}index.html`))
    if (!found) say(`its link to ${href} reaches nothing the site serves`)
  }
  return problems
}

/**
 * The words a page has in each language against English's: the same keys, each of the same kind and with the same
 * {params}, but the name and the domain, which a language may say otherwise (لأجلك, 使う場面).
 * @param {string} name @param {Record<string, Record<string, unknown>>} words  each language's
 */
export function checkWords (name, words) {
  const problems = /** @type {string[]} */ ([])
  const english = words.en ?? {}
  const shape = (/** @type {unknown} */ value) => (Array.isArray(value) ? `a list of ${value.length}` : typeof value)
  const params = (/** @type {unknown} */ value) => [...new Set(JSON.stringify(value).match(/\{\w+\}/g) ?? [])].filter((param) => param !== '{name}' && param !== '{domain}').sort().join()
  for (const [lang, theirs] of Object.entries(words)) {
    if (lang === 'en') continue
    const where = `site/${name}/${lang}.json`
    for (const key of Object.keys(english)) if (!(key in theirs)) problems.push(`${where}: ${key} is missing`)
    for (const key of Object.keys(theirs)) if (!(key in english)) problems.push(`${where}: ${key} isn't English's`)
    for (const [key, value] of Object.entries(english)) {
      if (!(key in theirs)) continue
      if (shape(theirs[key]) !== shape(value)) problems.push(`${where}: ${key} is ${shape(theirs[key])}, English's ${shape(value)}`)
      else if (params(theirs[key]) !== params(value)) problems.push(`${where}: ${key} has {${params(theirs[key])}}, English's {${params(value)}}`)
      if (lang === 'fr' && / [?!:;]/.test(JSON.stringify(theirs[key]))) problems.push(`${where}: ${key} sets ? ! : ; apart with a plain space, not a narrow no-break one`)
    }
  }
  return problems
}

/** A style sheet in logical properties only, so a right-to-left language needs nothing more. @param {string} path @param {string} css */
export function checkStyle (path, css) {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '{')
  const found = /(?<![-\w])(left|right|top|bottom|width|height|min-width|max-width|min-height|max-height)\s*:|(margin|padding|border)-(left|right|top|bottom)\b|(text-align|float|clear)\s*:\s*(left|right)/.exec(rules)
  return found ? [`${path}: ${found[0]} is a physical property; use its logical one`] : []
}

/**
 * Everything buildSite() wrote, held to what the site's pages must be.
 * @param {Awaited<ReturnType<typeof import('./site.js').buildSite>>} site
 * @param {{ base?: string | null, served?: Iterable<string> }} [at]  the site's address, if known, and the other files it serves (app/'s)
 * @returns {string[]}
 */
export function checkSite ({ files, pages, words }, { base = null, served = [] } = {}) {
  const problems = /** @type {string[]} */ ([])
  const all = new Set([...served, ...Object.keys(files)])
  /** @type {Map<string, typeof pages>} */
  const byName = new Map()
  for (const page of pages) byName.set(page.name, [...byName.get(page.name) ?? [], page])
  for (const [name, versions] of byName) {
    const addresses = Object.fromEntries(versions.map((page) => [page.lang, page.address]))
    for (const lang of LANGUAGES) if (!(lang in addresses)) problems.push(`site/${name}: it has no page in ${lang}`)
    for (const page of versions) problems.push(...checkPage(files[page.path], { ...page, addresses, base, served: all }))
    // Each language's page says what English's does: its headings as English's are, and nothing left as English's says it.
    const english = versions.find((page) => page.lang === 'en')
    if (!english) continue
    const root = parse(files[english.path])
    const outline = (/** @type {Element} */ tree) => elements(tree).filter((element) => /^h[1-6]$/.test(element.name)).map((element) => element.name).join(' ')
    const said = new Set(textsOf(root, 'en').filter(sentence))
    for (const page of versions.filter((version) => version !== english)) {
      const tree = parse(files[page.path])
      if (outline(tree) !== outline(root)) problems.push(`${page.path}: its headings are ${outline(tree)}, English's ${outline(root)}`)
      for (const text of textsOf(tree, page.lang)) if (said.has(text)) problems.push(`${page.path}: “${text}” is English's, not ${page.lang}'s`)
      if (page.lang === 'fr') for (const text of textsOf(tree, 'fr')) if (/ [?!:;]/.test(text)) problems.push(`${page.path}: “${text}” sets ? ! : ; apart with a plain space, not a narrow no-break one`)
    }
  }
  // Each page is the site's only one with its title, its description and its address.
  for (const key of ['title', 'description']) {
    const seen = new Map()
    for (const page of pages) {
      const root = parse(files[page.path])
      const value = key === 'title' ? textOf(elements(root).find((element) => element.name === 'title') ?? '') : elements(root).find((element) => element.name === 'meta' && element.attrs.name === 'description')?.attrs.content
      if (value && seen.has(value)) problems.push(`${page.path}: its ${key} is ${seen.get(value)}'s too`)
      seen.set(value, page.path)
    }
  }
  for (const [name, languages] of words) problems.push(...checkWords(name, languages))
  for (const [path, css] of Object.entries(files)) if (path.endsWith('.css')) problems.push(...checkStyle(path, css))
  return problems
}
