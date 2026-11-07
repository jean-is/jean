// Diagrams (D291, D592): a ```mermaid block, of any kind Mermaid draws, drawn by Pele in its worker (./diagram-worker.js), or
// beside the page where no worker of Jean's starts (a share's viewer, its files from another site). A flowchart Pele refuses is
// tried again with its boxes written as Mermaid reads them: brains close a box's brackets swapped (A([Start)]), or put brackets
// and quotes in its words (Call f(x)). Its SVG is shown as a picture, as it holds style attributes that Jean's policy refuses,
// in the room's colours (or a deck's) as Pele's own properties inside it, its words the picture's text. <app-diagram> draws
// one in an answer or a file, one Pele can't read once whole saying so (`unread`); a page holds its own (./page-diagram.js),
// which asks Jean for the picture. Mermaid itself is a 1.6 MB library that needs a DOM.
import { t } from '../../core/i18n.js'
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

/** Boxes joined by &, at the start of `rest`, and what follows them. @param {string} rest @returns {[string[], string] | null} */
function group(rest) {
  const found = []
  for (let left = rest.trimStart(); ;) {
    const next = box(left)
    if (!next) return null
    const named = /^:::\w+/.exec(next[1])?.[0] ?? '', rest = next[1].slice(named.length), more = /^\s*&\s*/.exec(rest)
    found.push(next[0] + named)
    if (!more) return [found, rest]
    left = rest.slice(more[0].length)
  }
}

/** A flowchart's statement as boxes and the arrows between them; null for what this can't read, and what holds no box. @param {string} text */
function chain(text) {
  if (!text.trim() || /^\s*(%%|(classDef|class|style|linkStyle|click|subgraph|end|direction)\b)/.test(text)) return null
  let read = group(text)
  if (!read) return null
  const groups = [read[0]], arrows = []
  for (let rest = read[1]; rest.trim();) {
    const arrow = ARROW.exec(rest)
    read = arrow && /[-=.]/.test(arrow[3]) ? group(rest.slice(arrow[0].length)) : null
    if (!arrow || !read) return null
    groups.push(read[0])
    arrows.push(arrow)
    rest = read[1]
  }
  return { groups, arrows, indent: /^\s*/.exec(text)?.[0] ?? '' }
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
    const read = chain(text)
    if (!read) return text
    return read.indent + read.groups.map((boxes, i) => {
      const arrow = read.arrows[i - 1], words = arrow && (arrow[4] ?? arrow[2])
      return `${arrow ? ` ${arrow[1] === '-.' ? `-${arrow[3]}` : arrow[3]}${words ? `|${quoted(words)}|` : ''} ` : ''}${boxes.join(' & ')}`
    }).join('')
  }
  // What follows its first word and direction, on its first line too (graph LR; A --> B).
  const mend = (/** @type {string} */ line) => line.split(';').map(statement).join(';')
  return [head + mend(first.slice(head.length)), ...lines.map(mend)].join('\n')
}

/** The words a diagram shows, each on its own, in the order drawn. @param {string} svg */
const textsOf = (svg) => [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(([, inner]) => inner.replace(/<[^>]+>/g, ' ')
  .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[/** @type {'amp'} */ (name)] ?? "'").replace(/\s+/g, ' ').trim()).filter(Boolean)
/** @param {string} svg */
export const wordsOf = (svg) => textsOf(svg).join(', ')

// An arrow of a sequence or a state diagram (Alice->>Bob: Hello, Idle --> Busy: start); a sequence's note; a name it gives one of them.
const ACROSS = /^\s*([^\s:<>-][^:<>]*?)\s*<*-{1,2}(?:>>?|\)|x)\s*[+-]?\s*([^:]+?)\s*(?::\s*(.*))?$/
const NOTE = /^\s*note\b[^:]*:\s*(.+)$/i
const ALIAS = /^\s*(?:participant|actor)\s+(\S+)\s+as\s+(.+)$/

/**
 * What a diagram's arrows say, for those who can't see them: its boxes in the order written, each with what it leads to, an arrow's
 * words first ("Yes: Take an umbrella"); a sequence's in turn, as a box may speak more than once. None for another kind of diagram.
 * @param {string} source @returns {{ box: string, next: string[] }[]}
 */
export function stepsOf(source) {
  const [first = '', ...lines] = source.split('\n'), steps = /** @type {{ box: string, next: string[] }[]} */ ([])
  /** The step of a box: in a flowchart its one, in a sequence the last said if it is its. @param {string} box @param {boolean} [any] */
  const step = (box, any) => (any ? steps.find((one) => one.box === box) : steps.at(-1)?.box === box && steps.at(-1)) || steps[steps.push({ box, next: [] }) - 1]
  const head = /^\s*(flowchart|graph)\b[^;]*/i.exec(first)?.[0]
  if (head) {
    const chains = [first.slice(head.length), ...lines].flatMap((line) => line.split(';')).map(chain).filter((one) => one !== null), names = new Map()
    for (const entry of chains.flatMap(({ groups }) => groups.flat())) {
      const id = ID.exec(entry)?.[0], words = /"(.*)"/s.exec(entry)?.[1]
      if (words || !names.has(id)) names.set(id, words?.replace(/#quot;/g, '"').replace(/<br\s*\/?>|\\n/gi, ' ') ?? id)
    }
    const name = (/** @type {string} */ entry) => names.get(ID.exec(entry)?.[0])
    for (const { groups, arrows } of chains) {
      for (const entry of groups.flat()) step(name(entry), true)
      arrows.forEach((arrow, i) => { for (const from of groups[i]) for (const to of groups[i + 1]) step(name(from), true).next.push(`${(arrow[4] ?? arrow[2]) ? `${(arrow[4] ?? arrow[2]).trim().replace(/^"(.*)"$/, '$1')}: ` : ''}${name(to)}`) })
    }
  } else if (/^\s*(sequenceDiagram|stateDiagram)/.test(first)) {
    const names = new Map(lines.map((line) => ALIAS.exec(line)).filter((one) => one !== null).map(([, id, name]) => [id, name.trim()]))
    for (const line of lines) {
      const note = NOTE.exec(line)?.[1], [, from, to, words] = ACROSS.exec(line) ?? []
      if (note) steps.push({ box: note, next: [] })
      else if (from && !`${from}${to}`.includes('[*]')) step(names.get(from) ?? from).next.push(`${words ? `${words}: ` : ''}${names.get(to) ?? to}`)
    }
  }
  return steps
}

/**
 * A diagram told in words: its picture's short text, which says that the words follow; what opens them; and them, its steps or, for a
 * kind whose arrows this can't read, what it shows. @param {string} source @param {string} svg
 */
export function told(source, svg) {
  const steps = stepsOf(source), first = steps[0]?.box
  return steps.length ? { alt: t('interactive.diagramFrom', { first: first.length > 40 ? `${first.slice(0, 39)}…` : first }), summary: t('interactive.diagramSteps'), steps }
    : { alt: t('interactive.diagramWords'), summary: t('interactive.inWords'), steps: textsOf(svg).map((box) => ({ box, next: [] })) }
}

/**
 * Those words under the picture, folded, the opening in the person's language though the diagram's are its own.
 * @param {ReturnType<typeof told>} words @param {boolean} [open]
 */
export function wordsBelow({ summary, steps }, open = false) {
  const made = (/** @type {string} */ tag, /** @type {string} */ text = '') => Object.assign(document.createElement(tag), { textContent: text })
  const list = (/** @type {{ box: string, next?: string[] }[]} */ items) => { const all = made('ul'); all.append(...items.map(({ box, next = [] }) => { const item = made('li', box); if (next.length) item.append(list(next.map((one) => ({ box: one })))); return item })); return all }
  const held = /** @type {HTMLDetailsElement} */ (made('details')), head = made('summary', summary)
  Object.assign(head, { lang: document.documentElement.lang, dir: document.documentElement.dir || 'ltr' })
  Object.assign(held, { className: 'drawn-words', open })
  held.append(head, list(steps))
  return held
}

/** Pele's SVG in the colours given as its own properties (`fg`, `accent`, `series-1`…). @param {string} svg @param {Record<string, string>} props */
export const coloured = (svg, props) => svg.replace(/^(<svg\b[^>]*>)/, `$1<style>svg{${Object.entries(props).map(([name, value]) => `--pele-${name}:${value.replace(/[<>;{}"]/g, '')}`).join(';')}}</style>`)

/** The room's colours, as Pele names them: its ink and lines, and each of a chart's or a mind map's series a hue of its accent. @param {CSSStyleDeclaration} style */
function tones(style) {
  const own = (/** @type {string} */ name) => style.getPropertyValue(`--${name}`).trim()
  return { bg: 'transparent', fg: own('ink'), muted: own('ink-soft'), line: own('ink-soft'), surface: own('glass'), 'surface-alt': own('line'), border: own('ink-soft'), accent: own('flame'),
    font: style.fontFamily, ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((n) => [`series-${n + 1}`, `oklch(from ${own('flame')} l max(c, 0.12) calc(h + ${n * 57}))`])) }
}

/** Pele in its worker, once a diagram shows; null where it can't start. @type {Worker | null | undefined} */
let worker
let count = 0
const asked = /** @type {Map<number, { source: string, options: object, resolve: (drawn: Drawn) => void, reject: (error: Error) => void }>} */ (new Map())
/** Pele beside the page. @type {Promise<typeof import('pele/lazy')> | undefined} */
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
 * A diagram as a picture in an element's colours, at most as wide as given: its SVG and size, its address, and it told in words.
 * @param {string} source @param {Element} element @param {number} width
 */
export async function picture(source, element, width) {
  const style = getComputedStyle(element)
  const drawn = await drawing(source, { fontFamily: style.fontFamily, links: false, images: false, autoDirection: true, maxWidth: Math.max(320, width) }, style.direction === 'rtl')
  const svg = coloured(drawn.svg, tones(style))
  return { ...drawn, svg, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, words: told(source, drawn.svg) }
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
      // Its words once it is whole, folded as they were if the room drew it again.
      this.replaceChildren(Object.assign(document.createElement('img'), { src: drawn.url, alt: drawn.words.alt, lang: document.documentElement.lang }), ...(open ? [] : [wordsBelow(drawn.words, this.querySelector('details')?.open)]))
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
