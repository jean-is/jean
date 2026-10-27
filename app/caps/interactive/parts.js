// Pages of parts (D631): a ```html block holding only the parts the visual skill names is data, as Markdown is, read here and
// drawn in the answer itself (./view-parts.js) rather than in a frame: key figures, cards, a table, a chart and a form, nested as
// the skill shows them, and an <aside> with a map or a diagram. Each part's lines become what it draws. Anything else (a script,
// a style, another tag, words outside a part) makes it a page for a frame. Pure, so Node's tests run it.

/** @typedef {{ tag: string, attrs: Record<string, string>, text: string, kids: Part[] }} Part */

/** What each holds: the page, a row of cards, a card and an aside; the others hold their lines alone. */
const LEAVES = ['app-figures', 'app-table', 'app-chart', 'app-form', 'app-map', 'app-diagram']
const HOLDS = /** @type {Record<string, string[]>} */ ({ '': [...LEAVES, 'app-cards', 'app-card', 'aside'], 'app-cards': ['app-card'], 'app-card': LEAVES, aside: LEAVES })
const TOKEN = /<!--[\s\S]*?(?:-->|$)|<\/([a-z][\w-]*)\s*>|<([a-z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|</giy
const ATTRIBUTE = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
const ENTITIES = /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })
/** @param {string} text */
const decode = (text) => text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name) => ENTITIES[name])

/**
 * A page's parts, or null when it holds anything else. While the answer writes it, whole lines alone, and what is still open
 * closes at their end. @param {string} source @param {boolean} [open] @returns {Part[] | null}
 */
export function parse(source, open = false) {
  const text = open ? source.slice(0, source.lastIndexOf('\n') + 1) : source
  const root = /** @type {Part} */ ({ tag: '', attrs: {}, text: '', kids: [] }), path = [root]
  TOKEN.lastIndex = 0
  for (let match; (match = TOKEN.exec(text));) {
    const [all, closing, opening, attrs = '', alone, words] = match, top = /** @type {Part} */ (path.at(-1)), leaf = !Object.hasOwn(HOLDS, top.tag)
    if (all.startsWith('<!--')) continue
    if (words !== undefined || (all === '<' && leaf && !/[a-z/!]/i.test(text[TOKEN.lastIndex] ?? ''))) {
      if (leaf) top.text += decode(words ?? all)
      // A card's own words, as brains write a line about what it holds: its paragraphs.
      else if (top.tag === 'app-card' && all.trim()) ((last) => (last?.tag === '#text' ? (last.text += decode(all)) : top.kids.push({ tag: '#text', attrs: {}, text: decode(all), kids: [] })))(top.kids.at(-1))
      else if (all.trim()) return null
    } else if (closing) {
      const at = path.findLastIndex((part) => part.tag === closing.toLowerCase())
      if (at < 1) return null
      path.length = at
    } else if (opening && HOLDS[top.tag]?.includes(opening.toLowerCase())) {
      const part = { tag: opening.toLowerCase(), attrs: Object.fromEntries([...attrs.matchAll(ATTRIBUTE)].map(([, name, a, b, c]) => [name.toLowerCase(), decode(a ?? b ?? c ?? '')])), text: '', kids: [] }
      top.kids.push(part)
      if (!alone) path.push(part)
    } else return open && all === '<' ? root.kids : null
  }
  return root.kids.length ? root.kids : null
}

/** Every part a page holds, those inside others too. @param {Part[]} parts @returns {Part[]} */
export const all = (parts) => parts.flatMap((part) => [part, ...all(part.kids)])
/**
 * The collection a part shows or adds a row to (D633): its `from`; a form's `to` when it names no table of the page, or one that
 * shows a collection. @param {Part} part @param {Part[]} tables the page's @returns {string | undefined}
 */
export const bound = (part, tables) => part.attrs.from ?? (part.tag === 'app-form' && part.attrs.to ? ((table) => (table ? table.attrs.from : part.attrs.to))(tables.find((one) => one.attrs.id === part.attrs.to)) : undefined)
/** What a part is, as what it showed is kept under (D633). @param {Part} part */
export const key = (part) => JSON.stringify([part.tag, part.attrs.from ?? part.attrs.to ?? '', part.attrs.by ?? '', part.attrs.sum ?? '', 'count' in part.attrs, part.text.trim()])
/** @param {string} text */
const escaped = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
/**
 * A page's source with what each part showed of a collection written in as its lines and what binds it taken out (D633), for a page
 * that leaves Jean: copied, downloaded. @param {string} source @param {Record<string, string>} fills by each part's key
 */
export function frozen(source, fills) {
  const parts = parse(source), tables = all(parts ?? []).filter((part) => part.tag === 'app-table')
  /** @param {Part[]} list @returns {string} */
  const write = (list) => list.map((part) => {
    if (part.tag === '#text') return escaped(part.text.trim())
    const filled = bound(part, tables) !== undefined && Object.hasOwn(fills, key(part)), attrs = Object.entries(part.attrs).filter(([name]) => !filled || !['from', 'to', 'by', 'sum', 'count'].includes(name))
    return `<${part.tag}${attrs.map(([name, value]) => (value ? ` ${name}="${escaped(value)}"` : ` ${name}`)).join('')}>\n${part.kids.length ? write(part.kids) : escaped((filled ? fills[key(part)] : part.text).trim())}\n</${part.tag}>`
  }).join('\n')
  return parts ? write(parts) : source
}

/** A part's lines, trimmed, the empty ones left out. @param {Part} part */
const lines = (part) => part.text.split('\n').map((line) => line.trim()).filter(Boolean)
/** @param {string} line */
const cells = (line) => line.split('|').map((cell) => cell.trim())
/** What comes before a line's first `mark` and after it; all of it before when there is none. @param {string} line @param {string} mark */
const split = (line, mark) => ((at) => (at < 0 ? [line, ''] : [line.slice(0, at).trim(), line.slice(at + 1).trim()]))(line.indexOf(mark))

/** Key figures: a value and its few words on each line. @param {Part} part */
export const figures = (part) => lines(part).map((line) => split(line, '|'))
/** A table: its heads, then its rows, each as long as its heads. @param {Part} part */
export const table = (part) => (([heads = [], ...rows]) => ({ heads, rows: rows.map((row) => heads.map((_, i) => row[i] ?? '')) }))(lines(part).map(cells))
/** A chart: its kind, its labels, then each series by its name, its values by commas, in the language's digits or not. @param {Part} part @param {string} [lang] */
export const chart = (part, lang) => (([labels = '', ...series]) => ({ kind: part.attrs.kind || 'bar', labels: cells(labels),
  series: series.map((line) => split(line, ':')).map(([name, values]) => ({ name, data: values.split(/[,;،、]/).map((value) => number(value, lang, true)) })) }))(lines(part))

const KINDS = ['number', 'date', 'month', 'time', 'long', 'yes', 'no', 'email', 'tel', 'url']
/**
 * A form's fields: each line a label, then its kind (a number, a date, a month, a time, long words, a box ticked or not) or its
 * choices by commas, words when it has none, and `= value` to start with. @param {Part} part
 * @returns {{ label: string, kind: string, choices?: string[], start: string }[]}
 */
export const form = (part) => lines(part).map((line) => split(line, '=')).map(([head, start]) => {
  const [label, kind] = split(head, ':'), choices = kind.split(/\s*[,،、]\s*/).filter(Boolean)
  return { label, start, ...(choices.length > 1 ? { kind: 'choice', choices } : { kind: KINDS.includes(kind.toLowerCase()) ? kind.toLowerCase() : 'text' }) }
})

/** The digits the languages write, each by its value: Latin, Arabic, Persian, Devanagari, Bengali, Tamil, Telugu, Thai and full-width ones; and Arabic's marks. */
const DIGITS = new Map([['٫', '.'], ['٬', ''], ...['latn', 'arab', 'arabext', 'deva', 'beng', 'tamldec', 'telu', 'thai', 'fullwide']
  .flatMap((system) => [...new Intl.NumberFormat('en', { numberingSystem: system, useGrouping: false }).format(9876543210)].map((digit, i) => /** @type {[string, string]} */ ([digit, String(9 - i)])))])
/** Each language's marks between thousands and before decimals, as Intl writes them. @type {Map<string, string[]>} */
const marks = new Map()
/**
 * A number as the language writes it, in any of those digits, or `plain`, as a part's lines write one (a point before its
 * decimals, no marks between thousands); NaN for none. @param {string} text @param {string} [lang] @param {boolean} [plain]
 */
export function number(text, lang = 'en', plain = false) {
  const [group, decimal] = marks.get(lang) ?? /** @type {string[]} */ (marks.set(lang, ((parts) => ['group', 'decimal'].map((type) => parts.find((part) => part.type === type)?.value ?? ''))(new Intl.NumberFormat(lang).formatToParts(12345.6))).get(lang))
  const [point, thousands] = plain ? ['.', ''] : [decimal, group]
  const ascii = [...text].map((c) => DIGITS.get(c) ?? (c === point ? '.' : c === thousands || /\s/.test(c) ? '' : /[−–]/.test(c) ? '-' : c)).join('')
  return Number.parseFloat(ascii.replace(/[^\d.-]/g, '').replace(/(?!^)-/g, ''))
}
