// SPDX-License-Identifier: MIT
// Reading HTML as a tree, enough for what a site's check and jean.is's own pages ask of a page (D720, D438): each element its
// name, attributes, children (elements or text) and parent; a closing tag closes what it matches, and what it left open.
// No DOM: node tests run it, and site/checks.js reads Jean's pages with it.

/** @typedef {{ name: string, attrs: Record<string, string>, children: Array<Element | string>, parent: Element | null }} Element */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const TOKEN = /<!--[\s\S]*?-->|<!doctype[^>]*>|<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>|[^<]+|</gi
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

/** Text as HTML writes it, read back. @param {string} text */
export const unescape = (text) => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, name) => {
  const lower = name.toLowerCase()
  if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16))
  if (lower.startsWith('#')) return String.fromCodePoint(Number(lower.slice(1)))
  return /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[lower] ?? whole
})

/** @param {string} source */
const attributes = (source) => Object.fromEntries([...source.matchAll(ATTRIBUTE)].map(([, name, a, b, c]) => [name.toLowerCase(), unescape(a ?? b ?? c ?? '')]))

/** A page as a tree of elements. @param {string} html @returns {Element} */
export function parse(html) {
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
