// SPDX-License-Identifier: MIT
// The check of a site (D720), from its files: what a visitor with a phone, a screen reader or a search engine meets on each
// page, said so that the brain can fix it: its language and direction, title, description and card, one h1 and headings in
// order, one top, main and foot, names for links, buttons, fields and pictures, links and pictures that lead somewhere, every page
// reached from index.html, each language with every page and naming the others, nothing loaded from another site, no script
// inside a page (a host runs a site's own files only), forms the host can receive, no field for a password or a card, and the
// [placeholders] left to fill in. What only a page shows (a sideways scroll, a picture that won't load, a script's error,
// contrast) is ./frame.js's. Pure: node tests run it, and npm run sites measures brains with it.
import { parse, elements } from './html.js'
import { reach } from './file.js'
import { dir as directionOf } from '../../core/i18n.js'

/** @typedef {import('./html.js').Element} Element */
/** @typedef {Map<string, Uint8Array>} Files  a site's files, by their path in it */
/**
 * @typedef {Object} Report
 * @property {string[]} problems   each said whole, its page first
 * @property {string[]} fill       the placeholders left, each with its pages
 * @property {string[]} pages      its pages
 * @property {string[]} languages  their languages, the first page's first
 * @property {number} weight       what the first page loads, in bytes
 * @property {string[]} outline    each page in a line: its title, headings and forms
 */

/** The widths each page is seen at, a phone's and a computer's. */
export const WIDTHS = [320, 1280]
const TITLE = 60, DESCRIPTION = { min: 50, max: 160 }
const LANGUAGE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i

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
/** The CSS's physical properties that a right-to-left language reads backwards. @param {string} css */
const physical = (css) => /(margin|padding|border)-(left|right)\b|(?<![-\w])(left|right)\s*:|(text-align|float|clear)\s*:\s*(left|right)\b/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[0]

/**
 * The check from the files alone.
 * @param {Files} files
 * @returns {Report}
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

/** The report as the brain reads it. @param {{ problems: string[], fill: string[], pages: string[], languages: string[] }} report @param {{ name: string, place: string }} site */
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
