// Diagrams (D291, D592): a ```mermaid block, of any kind Mermaid draws, drawn by Pele in its worker (./diagram-worker.js), or
// beside the page where no worker of Jean's starts (a share's viewer, its files from another site). A flowchart Pele refuses is
// tried again with its boxes written as Mermaid reads them: brains close a box's brackets swapped (A([Start)]), or put brackets
// and quotes in its words (Call f(x)). Its SVG is shown as a picture, as it holds style attributes that Jean's policy refuses,
// in the room's colours (or a deck's) as Pele's own properties inside it, its words the picture's text. <app-diagram> draws
// one in an answer or a file, one Pele can't read once whole saying so (`unread`); a page holds its own (./page-diagram.js),
// which asks Jean for the picture. Mermaid itself is a 1.6 MB library that needs a DOM.
import { pictureOf } from '../../ui/save.js'
import { scriptURL } from '../../ui/trusted.js'

/** @typedef {{ svg: string, width: number, height: number }} Drawn */

// A box's brackets, the longest first.
const SHAPES = [['(((', ')))'], ['([', '])'], ['[[', ']]'], ['[(', ')]'], ['((', '))'], ['{{', '}}'], ['[/', '/]'], ['[\\', '\\]'], ['[/', '\\]'], ['[\\', '/]'],
  ['[', ']'], ['(', ')'], ['{', '}'], ['>', ']']]
const ID = /^[\p{L}\p{N}_]+/u
// An arrow, with its words written in it (-- yes -->) or after it (-->|yes|).
const ARROW = /^\s*(?:(--|==|-\.)\s+([^|>]*?)\s+)?(<?(?:-{2,}|={2,}|-?\.+-?)(?:>|x|o)?)\s*(?:\|([^|]*)\|)?\s*/

/** Words as Mermaid reads them in quotes: Markdown's bold and code marks gone, line breaks and quotes as it writes them. @param {string} text */
const quoted = (text) => `"${text.trim().replace(/^"(.*)"$/s, '$1').replace(/\*\*|__|`/g, '').replace(/"/g, '#quot;').trim()}"`

/** A box at the start of `rest`, written as Mermaid reads it, and what follows it. @param {string} rest @returns {[string, string] | null} */
function box(rest) {
  const id = ID.exec(rest)?.[0]
  if (!id) return null
  const after = rest.slice(id.length)
  for (const [open, close] of SHAPES) {
    if (!after.startsWith(open)) continue
    const from = Math.max(open.length, after[open.length] === '"' ? after.indexOf('"', open.length + 1) : -1)
    // Closed where the same brackets, or the same swapped, leave the statement going on as one does: to its end, an &, a class
    // or an arrow (so that words hold brackets of their own); else where Mermaid would.
    const ends = []
    for (const ending of new Set([close, [...close].reverse().join('')])) for (let at = after.indexOf(ending, from); at >= 0; at = after.indexOf(ending, at + 1)) ends.push(at)
    const end = ends.sort((a, b) => a - b).find((at) => /^\s*(&|$)|^:::/.test(after.slice(at + close.length)) || ARROW.test(after.slice(at + close.length))) ?? after.indexOf(close, from)
    return end < 0 ? null : [`${id}${open}${quoted(after.slice(open.length, end))}${close}`, after.slice(end + close.length)]
  }
  return [id, after]
}

/** Boxes joined by &, at the start of `rest`. @param {string} rest @returns {[string, string] | null} */
function group(rest) {
  const found = []
  for (let left = rest.trimStart(); ;) {
    const next = box(left)
    if (!next) return null
    const named = /^:::\w+/.exec(next[1])?.[0] ?? '', rest = next[1].slice(named.length), more = /^\s*&\s*/.exec(rest)
    found.push(next[0] + named)
    if (!more) return [found.join(' & '), rest]
    left = rest.slice(more[0].length)
  }
}

/**
 * A flowchart with its boxes and the words on its arrows written as Mermaid reads them; a statement this can't read, and any
 * other kind of diagram, as it was.
 * @param {string} source
 */
export function mended(source) {
  const [first, ...lines] = source.split('\n')
  const head = /^\s*(flowchart|graph)\b[^;]*/i.exec(first ?? '')?.[0]
  if (!head) return source
  const statement = (/** @type {string} */ text) => {
    const titled = /^(\s*subgraph\s+[\p{L}\p{N}_]+\s*)\[(.*)\]\s*$/u.exec(text)
    if (titled) return `${titled[1]}[${quoted(titled[2])}]`
    if (!text.trim() || /^\s*(%%|(classDef|class|style|linkStyle|click|subgraph|end|direction)\b)/.test(text)) return text
    let read = group(text)
    if (!read) return text
    let out = `${/^\s*/.exec(text)?.[0]}${read[0]}`
    for (let rest = read[1]; rest.trim();) {
      const arrow = ARROW.exec(rest)
      const to = arrow && /[-=.]/.test(arrow[3]) ? group(rest.slice(arrow[0].length)) : null
      if (!arrow || !to) return text
      const words = arrow[4] ?? arrow[2]
      out += ` ${arrow[1] === '-.' ? `-${arrow[3]}` : arrow[3]}${words ? `|${quoted(words)}|` : ''} ${to[0]}`
      read = to
      rest = to[1]
    }
    return out
  }
  // What follows its first word and direction, on its first line too (graph LR; A --> B).
  const mend = (/** @type {string} */ line) => line.split(';').map(statement).join(';')
  return [head + mend(first.slice(head.length)), ...lines.map(mend)].join('\n')
}

/** The words a diagram shows, for those who can't see it. @param {string} svg */
export const wordsOf = (svg) => [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(([, inner]) => inner.replace(/<[^>]+>/g, ' ')
  .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[/** @type {'amp'} */ (name)] ?? "'").replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ')

/** Pele's SVG in the colours given as its own properties (`fg`, `accent`, `series-1`…). @param {string} svg @param {Record<string, string>} props */
export const coloured = (svg, props) => svg.replace(/^(<svg\b[^>]*>)/, `$1<style>svg{${Object.entries(props).map(([name, value]) => `--pele-${name}:${value.replace(/[<>;{}"]/g, '')}`).join(';')}}</style>`)

/** The room's colours, as Pele names them: its ink and lines, and each of a chart's or a mind map's series a hue of its accent. @param {CSSStyleDeclaration} style */
function tones(style) {
  const own = (/** @type {string} */ name) => style.getPropertyValue(`--${name}`).trim()
  return { bg: 'transparent', fg: own('ink'), muted: own('ink-soft'), line: own('ink-soft'), surface: own('glass'), 'surface-alt': own('line'), border: own('line-strong'), accent: own('flame'),
    font: style.fontFamily, ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((n) => [`series-${n + 1}`, `oklch(from ${own('flame')} l max(c, 0.12) calc(h + ${n * 57}))`])) }
}

/** Pele in its worker, once a diagram shows; null where it can't start. @type {Worker | null | undefined} */
let worker
let count = 0
const asked = /** @type {Map<number, { source: string, options: object, resolve: (drawn: Drawn) => void, reject: (error: Error) => void }>} */ (new Map())
/** Pele beside the page. @type {Promise<any> | undefined} */
let here

/** Mermaid as Pele draws it. @param {string} source @param {object} options @returns {Promise<Drawn>} */
function pele(source, options) {
  if (worker === undefined) {
    try {
      worker = new Worker(scriptURL(new URL('diagram-worker.js', import.meta.url)), { type: 'module' })
      worker.onmessage = ({ data }) => { const one = asked.get(data.id); asked.delete(data.id); if (data.svg) one?.resolve(data); else one?.reject(new Error(data.error)) }
      // One a host's policy refuses once started: what it was asked is drawn beside the page, and the rest.
      worker.onerror = () => { worker = null; for (const { source, options, resolve, reject } of asked.values()) pele(source, options).then(resolve, reject); asked.clear() }
    } catch {
      worker = null
    }
  }
  if (!worker) return (here ??= import(new URL('../../vendor/pele/lazy.js', import.meta.url).href)).then(({ renderAsync }) => renderAsync(source, options))
  const to = worker
  return new Promise((resolve, reject) => { asked.set(++count, { source, options, resolve, reject }); to.postMessage({ id: count, source, options }) })
}

/**
 * A diagram drawn as written, else, for a flowchart, mended; one that reads across reads from the right where the room does.
 * @param {string} source @param {object} options @param {boolean} [rtl] @returns {Promise<Drawn>}
 */
export const drawing = (source, options, rtl = false) => {
  const turned = rtl ? source.replace(/^(\s*(?:flowchart|graph)\s+)LR\b/i, '$1RL') : source
  return pele(turned, options).catch((error) => {
    const mend = mended(turned)
    if (mend === turned) throw error
    return pele(mend, options)
  })
}

/**
 * A diagram as a picture in an element's colours, at most as wide as given: its SVG and size, its address and its words.
 * @param {string} source @param {Element} element @param {number} width
 */
export async function picture(source, element, width) {
  const style = getComputedStyle(element)
  const drawn = await drawing(source, { fontFamily: style.fontFamily, links: false, images: false, autoDirection: true, maxWidth: Math.max(320, width) }, style.direction === 'rtl')
  const svg = coloured(drawn.svg, tones(style))
  return { ...drawn, svg, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, words: wordsOf(drawn.svg) }
}

const AppDiagram = typeof HTMLElement === 'undefined' ? null : class extends HTMLElement {
  /** `open` while its block's closing fence isn't written yet. */
  static observedAttributes = ['source', 'open']
  /** What was drawn last, so that the same isn't drawn again; and whether one is being drawn. */
  drawn = ''
  busy = false
  /** @type {Drawn | null} what it shows */
  shown = null
  changed = new MutationObserver(() => this.draw())

  connectedCallback() {
    // The room's light or dark, or its look, draws it again.
    this.changed.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-look'] })
    this.draw()
  }

  disconnectedCallback() {
    this.changed.disconnect()
  }

  attributeChangedCallback() {
    if (this.isConnected) this.draw()
  }

  async draw() {
    const [source, open, root] = [this.getAttribute('source') ?? '', this.hasAttribute('open'), document.documentElement]
    const key = [source, open, root.dataset.theme, root.dataset.look].join('\n')
    if (this.busy || key === this.drawn) return
    this.busy = true
    this.drawn = key
    try {
      const drawn = (this.shown = await picture(source, this, this.clientWidth))
      this.replaceChildren(Object.assign(document.createElement('img'), { src: drawn.url, alt: drawn.words }))
    } catch {
      // While it is written, a last line not whole yet can't be read: what was drawn stays.
      if (!open) this.dispatchEvent(new Event('unread'))
    }
    this.busy = false
    this.draw()
  }

  /** The diagram as a picture to put in a document, a PNG on white, twice as fine. @returns {Promise<Blob>} */
  picture() {
    return this.shown ? pictureOf(this.shown.svg, this.shown.width, this.shown.height) : Promise.reject(new Error('No diagram'))
  }
}

if (AppDiagram && !customElements.get('app-diagram')) customElements.define('app-diagram', AppDiagram)
