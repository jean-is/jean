// The check of a site, for npm run sites (Sites' phase 0): what a visitor with a phone, a screen reader or a search
// engine meets on each page, said so that a brain can fix it. From the files, in Node: each page's language and
// direction, title, description and card, one h1 and headings in order, one top, main and foot, names for links,
// buttons, fields and pictures, links and pictures that lead somewhere, every page reached from index.html, each
// language with every page and naming the others, nothing loaded from another site, no script inside a page (the host
// runs a site's own files only), forms the host can receive, and no field for a password or a card. In Chromium, each
// page at 320 and 1280 pixels: a sideways scroll, pictures that don't load, a script's errors, what it tried to reach
// elsewhere, and the contrast of its words (axe-core). It also lists the [placeholders] left to fill in.
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dir as directionOf } from '../../app/core/i18n.js'

// ─── Reading HTML ────────────────────────────────────────────────────────────
// As site/checks.js reads Jean's own pages. Not imported from there: it brings site/site.js, and through it room modules
// (app/ui/) that test/longtasks/jean.js stands in for, which must not load before it.

/** @typedef {{ name: string, attrs: Record<string, string>, children: Array<Element | string>, parent: Element | null }} Element */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const TOKEN = /<!--[\s\S]*?-->|<!doctype[^>]*>|<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>|[^<]+|</gi
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

/** Text as HTML writes it, read back. @param {string} text */
const unescape = (text) => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, name) => {
  const lower = name.toLowerCase()
  if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16))
  if (lower.startsWith('#')) return String.fromCodePoint(Number(lower.slice(1)))
  return /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[lower] ?? whole
})

/** @param {string} source */
const attributes = (source) => Object.fromEntries([...source.matchAll(ATTRIBUTE)].map(([, name, a, b, c]) => [name.toLowerCase(), unescape(a ?? b ?? c ?? '')]))

/** A page as a tree of elements; a closing tag closes what it matches, and what it left open. @param {string} html @returns {Element} */
function parse(html) {
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
const elements = (node) => node.children.flatMap((child) => (typeof child === 'string' ? [] : [child, ...elements(child)]))

// ─── The check ───────────────────────────────────────────────────────────────

/** @typedef {Map<string, Uint8Array>} Files  a site's files, by their path in it */
/**
 * @typedef {Object} Report
 * @property {string[]} problems   each said whole, its page first
 * @property {string[]} fill       the placeholders left, each with its pages
 * @property {string[]} pages      its pages
 * @property {string[]} languages  their languages, the first page's first
 * @property {number} weight       what the first page loads, in bytes
 * @property {string[]} outline    each page in a line: its title, headings and forms, for a judge who sees only the first
 * @property {{ wide: Buffer, narrow: Buffer }} [shots]  the first page, whole, at 1280 and 320 pixels
 */

const AXE = fileURLToPath(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url))
export const WIDTHS = [320, 1280]
const TITLE = 60, DESCRIPTION = { min: 50, max: 160 }
const LANGUAGE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i
export const TYPES = /** @type {Record<string, string>} */ ({ html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', svg: 'image/svg+xml',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', ico: 'image/x-icon', txt: 'text/plain; charset=utf-8', xml: 'application/xml', webmanifest: 'application/manifest+json' })

const decode = (/** @type {Uint8Array} */ bytes) => new TextDecoder().decode(bytes)
const extension = (/** @type {string} */ path) => path.toLowerCase().split('.').pop() ?? ''

/** Whether an element or one around it is hidden from assistive technologies. @param {Element | null} node */
const hidden = (node) => {
  for (let at = node; at; at = at.parent) if (at.attrs['aria-hidden'] === 'true' || 'hidden' in at.attrs || at.name === 'template') return true
  return false
}
/** What an element says to a screen reader. @param {Element | string} node @returns {string} */
const textOf = (node) => {
  if (typeof node === 'string') return node
  if (node.attrs['aria-hidden'] === 'true' || ['script', 'style', 'template'].includes(node.name)) return ''
  if (node.name === 'img') return node.attrs.alt ?? ''
  if (node.name === 'svg') return node.attrs['aria-label'] ?? ''
  return node.children.map(textOf).join('')
}
/** Its accessible name. @param {Element} node @param {Map<string, Element>} ids */
const nameOf = (node, ids) => (node.attrs['aria-label'] ?? (node.attrs['aria-labelledby'] ? node.attrs['aria-labelledby'].split(/\s+/).map((id) => textOf(ids.get(id) ?? '')).join(' ') : textOf(node) || node.attrs.title || '')).trim()
/** The words a visitor reads, without code. @param {Element} root @returns {string[]} */
const wordsOf = (root) => {
  /** @type {string[]} */
  const words = []
  const walk = (/** @type {Element} */ node) => {
    if (['script', 'style', 'template', 'head'].includes(node.name)) return
    for (const child of node.children) typeof child === 'string' ? child.trim() && words.push(child.trim()) : walk(child)
  }
  walk(root)
  return words
}

/** An address on another site. @param {string} url */
const elsewhere = (url) => /^(https?:)?\/\//i.test(url.trim())
/**
 * Where a link from a page leads in the site: its path there, or null for another site, an email, a phone or the page
 * itself. @param {string} from @param {string} href
 */
const target = (from, href) => {
  if (!href || href.startsWith('#') || /^(mailto|tel|sms|data|javascript):/i.test(href) || elsewhere(href)) return null
  const url = new URL(href, `https://site.invalid/${from}`)
  return url.origin === 'https://site.invalid' ? decodeURIComponent(url.pathname.slice(1)) : null
}
/** The file a path reaches, as a host serves it, or null. @param {Files} files @param {string} path */
export const reach = (files, path) => [path, `${path}.html`, `${path}${path === '' || path.endsWith('/') ? '' : '/'}index.html`].find((one) => files.has(one)) ?? null

/** The CSS's physical properties that a right-to-left language reads backwards. @param {string} css */
const physical = (css) => /(margin|padding|border)-(left|right)\b|(?<![-\w])(left|right)\s*:|(text-align|float|clear)\s*:\s*(left|right)\b/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[0]

/**
 * The check from the files alone.
 * @param {Files} files
 * @returns {Omit<Report, 'shots'>}
 */
export function checkFiles(files) {
  const problems = /** @type {string[]} */ ([])
  /** @type {Map<string, Set<string>>} */
  const fill = new Map()
  const pages = [...files.keys()].filter((path) => extension(path) === 'html').sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)))
  /** @type {Map<string, { lang: string, links: string[], title: string, description: string, versions: Set<string>, loads: string[] }>} */
  const read = new Map()
  const outline = /** @type {string[]} */ ([])
  if (!files.has('index.html')) problems.push('it has no index.html, the page a visitor lands on')

  for (const path of pages) {
    const say = (/** @type {string} */ what) => problems.push(`${path}: ${what}`)
    const root = parse(decode(/** @type {Uint8Array} */ (files.get(path))))
    const all = elements(root)
    const named = (/** @type {string} */ name) => all.filter((element) => element.name === name)
    const shown = all.filter((element) => !hidden(element))
    const ids = new Map()
    for (const element of all) {
      const id = element.attrs.id
      if (id === undefined) continue
      if (ids.has(id)) say(`the id ${id} is there twice`)
      ids.set(id, element)
    }

    // Its language, direction, title, description and card.
    const page = named('html')[0]
    const lang = (page?.attrs.lang ?? '').trim()
    if (!LANGUAGE.test(lang)) say(lang ? `<html lang="${lang}"> names no language` : '<html> says no lang')
    else if ((page?.attrs.dir ?? 'ltr') !== directionOf(lang)) say(`<html> says dir="${page?.attrs.dir ?? 'ltr'}", not ${directionOf(lang)}, for ${lang}`)
    if (!named('meta').some((meta) => 'charset' in meta.attrs)) say('it has no <meta charset="utf-8">')
    if (!named('meta').some((meta) => meta.attrs.name === 'viewport')) say('it has no viewport line, so a phone shows it shrunk')
    const meta = (/** @type {string} */ key) => named('meta').find((element) => element.attrs.name === key || element.attrs.property === key)?.attrs.content?.trim() ?? ''
    const title = textOf(named('title')[0] ?? '').trim(), description = meta('description')
    if (!title || [...title].length > TITLE) say(`its title is ${[...title].length} characters, not 1 to ${TITLE}${title ? `: “${title}”` : ''}`)
    if ([...description].length < DESCRIPTION.min || [...description].length > DESCRIPTION.max) say(`its description is ${[...description].length} characters, not ${DESCRIPTION.min} to ${DESCRIPTION.max}`)
    for (const key of ['og:title', 'og:description', 'og:type']) if (!meta(key)) say(`its card for shared links has no ${key}`)

    // Headings, and one top, main and foot.
    const headings = all.filter((element) => /^h[1-6]$/.test(element.name))
    const h1 = headings.filter((heading) => heading.name === 'h1').length
    if (h1 !== 1) say(`it has ${h1} h1 headings, not one`)
    headings.reduce((before, heading) => {
      const level = Number(heading.name[1])
      if (level > before + 1) say(`its h${level} “${textOf(heading).trim().slice(0, 40)}” follows an h${before}`)
      if (!textOf(heading).trim()) say(`an h${level} says nothing`)
      return level
    }, 0)
    const sectioning = (/** @type {Element} */ element) => {
      for (let at = element.parent; at; at = at.parent) if (['article', 'aside', 'main', 'nav', 'section'].includes(at.name)) return true
      return false
    }
    for (const [name, label] of [['header', 'top (header)'], ['main', 'main part (main)'], ['footer', 'foot (footer)']]) {
      const count = named(name).filter((element) => name === 'main' || !sectioning(element)).length
      if (count !== 1) say(`it has ${count} ${label}, not one`)
    }
    const navs = named('nav')
    if (navs.length > 1) for (const nav of navs) if (!nameOf({ ...nav, children: [] }, ids)) say('one of its navigations has no name (aria-label)')

    // References, names, labels and pictures.
    for (const element of all) {
      for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for']) {
        for (const id of (element.attrs[attribute] ?? '').split(/\s+/).filter(Boolean)) if (!ids.has(id)) say(`${attribute}="${id}" names no element`)
      }
      const href = element.name === 'a' ? element.attrs.href ?? '' : ''
      if (href.startsWith('#') && href.length > 1 && !ids.has(decodeURIComponent(href.slice(1)))) say(`the link to ${href} leads nowhere on the page`)
    }
    for (const element of shown) {
      if ((element.name === 'a' && 'href' in element.attrs) || element.name === 'button') {
        if (!nameOf(element, ids)) say(`a ${element.name === 'a' ? `link to ${element.attrs.href}` : 'button'} has no name`)
      }
      if (['input', 'select', 'textarea'].includes(element.name) && !['hidden', 'submit', 'button', 'reset'].includes(element.attrs.type ?? '')) {
        let inLabel = false
        for (let at = element.parent; at; at = at.parent) if (at.name === 'label') inLabel = true
        const labelled = element.attrs['aria-label'] || element.attrs['aria-labelledby'] || (element.attrs.id && named('label').some((label) => label.attrs.for === element.attrs.id))
        if (!labelled && !inLabel) say(`a field (${element.attrs.name ?? element.name}) has no label`)
      }
      if (element.name === 'img' && element.attrs.alt === undefined) say(`the picture ${element.attrs.src ?? ''} has no alt`)
      if (element.name === 'svg' && !(element.attrs.role === 'img' && element.attrs['aria-label']) && !element.children.some((child) => typeof child !== 'string' && child.name === 'title')) {
        let inSvg = false
        for (let at = element.parent; at; at = at.parent) if (at.name === 'svg') inSvg = true
        if (!inSvg) say('a drawing (svg) is neither hidden (aria-hidden="true") nor named (role="img" and aria-label)')
      }
      if (Number(element.attrs.tabindex) > 0) say(`tabindex="${element.attrs.tabindex}" makes a tab order of its own`)
    }

    // What it loads: only the site's own files, none of them missing, and no script inside the page.
    const loads = /** @type {string[]} */ ([])
    for (const element of all) {
      const rel = (element.attrs.rel ?? '').toLowerCase()
      const sources = element.name === 'script' ? [element.attrs.src] : element.name === 'link' && /stylesheet|icon|preload|manifest/.test(rel) ? [element.attrs.href]
        : ['img', 'source', 'video', 'audio', 'track', 'input'].includes(element.name) ? [element.attrs.src, element.attrs.poster, ...(element.attrs.srcset ?? '').split(',').map((part) => part.trim().split(/\s+/)[0])] : []
      for (const source of sources.filter(Boolean)) {
        const url = /** @type {string} */ (source)
        if (elsewhere(url)) { say(`it loads ${url} from another site; a site holds all its files`); continue }
        const to = target(path, url)
        if (to === null) continue
        if (!reach(files, to)) say(`${element.name === 'img' || element.name === 'source' ? 'the picture' : `its ${element.name}`} ${url} is nothing the site has`)
        else loads.push(to)
      }
      if (['iframe', 'object', 'embed'].includes(element.name)) say(`it holds a frame of ${element.attrs.src ?? element.attrs.data ?? 'something'}; a site holds no frames`)
      if (element.name === 'script' && !element.attrs.src && element.children.join('').trim() && element.attrs.type !== 'application/ld+json') say('it has a script inside the page; move it to site.js, since the host runs only the site’s own files')
      for (const name of Object.keys(element.attrs)) if (/^on[a-z]+$/i.test(name)) say(`its ${name}="…" runs a script inside the page; do it in site.js`)
      if (/^\s*javascript:/i.test(element.attrs.href ?? '')) say('a link runs a script (javascript:); do it in site.js')
      if (/url\(\s*['"]?(https?:)?\/\//i.test(element.attrs.style ?? '')) say('a style loads a picture from another site')
    }
    const styles = named('style').map((style) => style.children.join('')).join('\n')
    if (/url\(\s*['"]?(https?:)?\/\/|@import\s+(url\()?\s*['"]?(https?:)?\/\//i.test(styles)) say('its style loads something from another site')

    // Forms the host receives, asking for nothing a site mustn't.
    for (const form of named('form')) {
      if (form.attrs.action !== undefined) say(`a form sends to ${form.attrs.action || 'its action'}; leave action out, since the host receives what it sends`)
      if ((form.attrs.method ?? 'get').toLowerCase() !== 'post') say('a form doesn’t send with method="post"')
      if (!form.attrs['data-form']) say('a form has no data-form name')
    }
    for (const field of all.filter((element) => ['input', 'select', 'textarea'].includes(element.name))) {
      const words = `${field.attrs.name ?? ''} ${field.attrs.id ?? ''} ${field.attrs.autocomplete ?? ''}`
      if (field.attrs.type === 'password' || /pass(word|wd)?\b|current-password|new-password/i.test(words)) say('a field asks for a password; a site never does')
      else if (/\bcc-|card|cvc|cvv|iban/i.test(words)) say('a field asks for a card or bank number; a site never takes payments')
    }

    // Links, its versions in other languages, and placeholders.
    const links = named('a').map((a) => target(path, a.attrs.href ?? '')).filter((one) => one !== null)
    for (const a of named('a')) {
      const to = target(path, a.attrs.href ?? '')
      if (to !== null && !reach(files, to)) say(`its link to ${a.attrs.href} reaches nothing the site has`)
    }
    const versions = new Set(named('link').filter((link) => (link.attrs.rel ?? '').toLowerCase() === 'alternate' && link.attrs.hreflang).map((link) => (link.attrs.hreflang ?? '').toLowerCase()))
    for (const words of wordsOf(root)) for (const [placeholder] of words.matchAll(/\[[^\][\n]{2,60}\]/g)) fill.set(placeholder, new Set([...fill.get(placeholder) ?? [], path]))
    const forms = named('form').map((form) => `a form of ${elements(form).filter((element) => ['input', 'select', 'textarea'].includes(element.name) && !['hidden', 'submit'].includes(element.attrs.type ?? '')).length} fields`)
    outline.push(`${path}: “${title}”; ${[...headings.filter((heading) => /^h[1-3]$/.test(heading.name)).map((heading) => `${heading.name} “${textOf(heading).trim().slice(0, 60)}”`), ...forms].join(', ')}`)
    read.set(path, { lang: lang.toLowerCase(), links: /** @type {string[]} */ (links), title, description, versions, loads })
  }

  // Every page reached from the first.
  const reached = new Set(['index.html'])
  for (const queue = ['index.html']; queue.length;) {
    for (const link of read.get(/** @type {string} */ (queue.shift()))?.links ?? []) {
      const page = reach(files, link)
      if (page && extension(page) === 'html' && !reached.has(page)) { reached.add(page); queue.push(page) }
    }
  }
  if (files.has('index.html')) for (const path of pages) if (!reached.has(path)) problems.push(`${path}: nothing leads to it from index.html`)

  // Languages: the first's pages at the top, each other's in a folder of its code, with the same pages, naming each other.
  const first = read.get('index.html')?.lang.split('-')[0] ?? ''
  const folderOf = (/** @type {string} */ path) => (/^([a-z]{2,3}(?:-[a-z0-9]+)*)\//i.exec(path)?.[1] ?? '').toLowerCase()
  const top = pages.filter((path) => !folderOf(path) || !LANGUAGE.test(folderOf(path)))
  const others = [...new Set(pages.map(folderOf).filter((code) => code && LANGUAGE.test(code)))]
  const languages = [...new Set([first, ...others])].filter(Boolean)
  for (const code of others) {
    const theirs = new Set(pages.filter((path) => folderOf(path) === code).map((path) => path.slice(code.length + 1)))
    for (const path of top) if (!theirs.has(path)) problems.push(`${code}/${path} is missing: each language has every page`)
    for (const path of pages.filter((one) => folderOf(one) === code)) if (read.get(path)?.lang.split('-')[0] !== code.split('-')[0]) problems.push(`${path}: its <html lang> isn’t ${code}, its folder’s`)
  }
  for (const path of top) if (read.get(path)?.lang && read.get(path)?.lang.split('-')[0] !== first) problems.push(`${path}: its <html lang> isn’t ${first}, the first page’s`)
  if (languages.length > 1) {
    for (const path of pages) {
      const missing = languages.filter((code) => ![...read.get(path)?.versions ?? []].some((one) => one.split('-')[0] === code.split('-')[0]))
      if (missing.length) problems.push(`${path}: it names no version in ${missing.join(', ')} (<link rel="alternate" hreflang>)`)
    }
  }

  // Each page's title and description are the site's only ones, in its language.
  for (const key of /** @type {const} */ (['title', 'description'])) {
    const seen = new Map()
    for (const path of pages) {
      const one = read.get(path), value = one && `${one.lang} ${one[key]}`
      if (one?.[key] && seen.has(value)) problems.push(`${path}: its ${key} is ${seen.get(value)}’s too`)
      seen.set(value, path)
    }
  }

  // Style sheets: nothing from elsewhere, and logical properties where a language reads right to left.
  const rtl = languages.some((code) => directionOf(code) === 'rtl')
  for (const [path, bytes] of files) {
    if (extension(path) !== 'css') continue
    const css = decode(bytes)
    if (/url\(\s*['"]?(https?:)?\/\/|@import\s+(url\()?\s*['"]?(https?:)?\/\//i.test(css)) problems.push(`${path}: it loads something from another site`)
    const found = rtl && physical(css)
    if (found) problems.push(`${path}: ${found} is a physical property, backwards in right-to-left pages; use its logical one (inline, block, start, end)`)
  }

  const weight = ['index.html', ...read.get('index.html')?.loads ?? []].reduce((sum, path) => sum + (files.get(reach(files, path) ?? '')?.length ?? 0), 0)
  return { problems: [...new Set(problems)], fill: [...fill].map(([placeholder, where]) => `${placeholder} (${[...where].join(', ')})`), pages, languages, weight, outline }
}

/**
 * Serves a site's files on 127.0.0.1, as a host would: a folder's index.html, a page without its .html.
 * @param {Files} files @returns {Promise<{ origin: string, close: () => void }>}
 */
export async function serve(files) {
  const server = createServer((req, res) => {
    const path = reach(files, decodeURIComponent(new URL(String(req.url), 'http://site').pathname.slice(1)))
    const bytes = path && files.get(path)
    if (!path || !bytes) return void res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
    res.writeHead(200, { 'content-type': TYPES[extension(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(bytes)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  return { origin: `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`, close: () => server.close() }
}

/**
 * The check in Chromium: each page at each width, what overflows, what doesn't load, its script's errors, what it
 * reached elsewhere, and its words' contrast at the widest; then the first page's pictures.
 * @param {import('@playwright/test').Browser} browser @param {Files} files @param {string[]} pages
 * @returns {Promise<{ problems: string[], shots?: Report['shots'] }>}
 */
export async function checkInBrowser(browser, files, pages) {
  const problems = /** @type {string[]} */ ([])
  const { origin, close } = await serve(files)
  /** @type {Partial<NonNullable<Report['shots']>>} */
  const shots = {}
  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: width < 600 ? 640 : 800 } })
      const reached = new Set()
      await context.route('**/*', (route) => {
        const url = route.request().url()
        if (url.startsWith(origin)) return route.continue()
        reached.add(new URL(url).host || url.slice(0, 40))
        return route.abort()
      })
      try {
        for (const path of pages.slice(0, 16)) {
          const page = await context.newPage()
          const errors = /** @type {string[]} */ ([])
          page.on('pageerror', (error) => errors.push(error.message.split('\n')[0]))
          page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(message.text())) errors.push(message.text().split('\n')[0]) })
          try {
            await page.goto(`${origin}/${path}`, { waitUntil: 'load', timeout: 15_000 })
            await page.waitForTimeout(150)
            const seen = await page.evaluate(() => {
              const wide = document.documentElement.scrollWidth
              let widest = ''
              if (wide > innerWidth + 1) {
                const over = [...document.body.querySelectorAll('*')].filter((element) => { const box = element.getBoundingClientRect(); return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1) })
                const leaf = over.find((element) => !over.some((other) => other !== element && element.contains(other))) ?? over[0]
                if (leaf) widest = `<${leaf.tagName.toLowerCase()}${leaf.id ? ` id="${leaf.id}"` : ''}${leaf.className && typeof leaf.className === 'string' ? ` class="${leaf.className.trim().split(/\s+/).slice(0, 2).join(' ')}"` : ''}> ${Math.round(leaf.getBoundingClientRect().width)} px wide`
              }
              const broken = [...document.images].filter((image) => image.complete && image.naturalWidth === 0 && image.getAttribute('src')).map((image) => image.getAttribute('src'))
              // The page's foot, and what shows below it: a short page's foot floats mid-screen, a long one's may leave a band.
              const foot = document.querySelector('body > footer') ?? [...document.querySelectorAll('footer')].pop()
              const below = foot ? Math.round(Math.max(document.documentElement.scrollHeight, innerHeight) - (foot.getBoundingClientRect().bottom + scrollY)) : 0
              return { wide, widest, broken, below }
            })
            if (seen.wide > width + 1) problems.push(`${path}: at ${width} px it scrolls sideways to ${seen.wide} px${seen.widest ? `; ${seen.widest}` : ''}`)
            if (seen.below > 8) problems.push(`${path}: at ${width} px, ${seen.below} px of empty page show below the footer; keep the foot at the bottom (a body in a column, main growing)`)
            // A picture the site lacks, or from elsewhere, is said from the files already: here, one it has that doesn't show.
            for (const src of seen.broken) { const to = target(path, String(src)); if (to !== null && reach(files, to)) problems.push(`${path}: the picture ${src} doesn't load`) }
            if (width === Math.max(...WIDTHS)) {
              await page.addScriptTag({ path: AXE })
              const found = await page.evaluate(async () => {
                // @ts-ignore axe, added just before
                const result = await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations'] })
                return result.violations.flatMap((/** @type {any} */ violation) => violation.nodes.map((/** @type {any} */ node) => ({ where: String(node.target[0]), words: String(node.html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40), data: node.any[0]?.data ?? {} })))
              })
              for (const { where, words, data } of found.slice(0, 4)) problems.push(`${path}: ${words ? `“${words}” (${where})` : where} has a contrast of ${data.contrastRatio}:1 (${data.fgColor} on ${data.bgColor}), not ${String(data.expectedContrastRatio ?? '4.5').replace(':1', '')}:1`)
              if (found.length > 4) problems.push(`${path}: ${found.length - 4} more places have too little contrast`)
            }
            // The whole page, as a window as tall as it shows it: made taller until its height holds, since the scrollbar that
            // goes then lays the words out wider (a full-page picture keeps the height from before, a band below the foot).
            if (path === 'index.html') {
              let height = 0
              for (let tries = 0; tries < 4; tries++) {
                const next = Math.min(2400, await page.evaluate(() => document.documentElement.scrollHeight))
                if (next === height) break
                await page.setViewportSize({ width, height: (height = next) })
                await page.waitForTimeout(100)
              }
              shots[width < 600 ? 'narrow' : 'wide'] = await page.screenshot()
            }
          } catch (error) {
            problems.push(`${path}: it didn’t load at ${width} px (${error instanceof Error ? error.message.split('\n')[0] : error})`)
          }
          for (const error of new Set(errors)) problems.push(`${path}: its script failed: ${error}`)
          await page.close()
        }
      } finally {
        await context.close()
      }
      for (const host of reached) problems.push(`it reached ${host}; a site loads nothing from another site`)
    }
  } finally {
    close()
  }
  return { problems: [...new Set(problems)], ...(shots.wide && shots.narrow && { shots: /** @type {NonNullable<Report['shots']>} */ (shots) }) }
}

/** The whole check. @param {Files} files @param {import('@playwright/test').Browser} browser @returns {Promise<Report>} */
export async function check(files, browser) {
  const found = checkFiles(files)
  const seen = await checkInBrowser(browser, files, found.pages)
  // What a page reached elsewhere is said once, from its files, when they show it.
  const more = seen.problems.filter((problem) => { const host = /^it reached ([^;]+);/.exec(problem)?.[1]; return !host || !found.problems.some((one) => one.includes(host)) })
  return { ...found, problems: [...new Set([...found.problems, ...more])], ...(seen.shots && { shots: seen.shots }) }
}

/** The report as the brain reads it. @param {Report} report @param {{ name: string, place: string }} site */
export function told(report, { name, place }) {
  const shown = report.problems.slice(0, 30)
  return [
    `Site "${name}" is at ${place}: ${report.pages.length} ${report.pages.length === 1 ? 'page' : 'pages'}${report.languages.length ? ` in ${report.languages.join(', ')}` : ''}.`,
    report.problems.length ? `Checked at ${WIDTHS.join(' and ')} pixels, for screen readers and search engines: ${report.problems.length} to fix.` : `Checked at ${WIDTHS.join(' and ')} pixels, for screen readers and search engines: nothing to fix.`,
    ...shown.map((problem) => `- ${problem}`),
    ...(report.problems.length > shown.length ? [`- and ${report.problems.length - shown.length} more`] : []),
    ...(report.fill.length ? [`Left to fill in: ${report.fill.join('; ')}.`] : []),
  ].join('\n')
}
