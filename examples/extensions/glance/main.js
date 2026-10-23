// At a glance, an example of an extension for Jean (D296) that adds to how a conversation looks. Under each
// long answer it draws one line: how long the answer takes to read, a small map of its parts in order
// (each paragraph a bar as tall as it is long beside the others, a sign for a list, a table, code, a
// formula or a quote, a space where a heading starts a section), and how many links it holds. It reads
// the answer it draws under, as Jean shows it, and keeps only whether to draw under every answer; like
// every extension, it runs in a sandbox with no network.
//
// Rights it asks for: draw (under answers, and in its row of Settings › Extensions). It hooks no event.
// What it draws is text standing for a picture, so each piece has a label too: what a screen reader says
// in its place.

/** Words read in a minute, roughly, whatever the language. */
const PER_MINUTE = 200
/** An answer this many words long or more is drawn under; a shorter one is taken in at a glance already. */
const LONG = 80
/** The most parts a map shows. */
const SHOWN = 16
/** A paragraph's bar, from the shortest to the longest. */
const BARS = '▁▂▃▄▅▆▇█'
/** The other parts' signs, and every part's name in a label, for one and for more. */
const PARTS = /** @type {Record<string, { sign?: string, names: [string, string] }>} */ ({
  paragraph: { names: ['paragraph', 'paragraphs'] },
  list: { sign: '☰', names: ['list', 'lists'] },
  table: { sign: '▦', names: ['table', 'tables'] },
  code: { sign: '⌗', names: ['piece of code', 'pieces of code'] },
  formula: { sign: '∑', names: ['formula', 'formulas'] },
  quote: { sign: '❝', names: ['quote', 'quotes'] },
})
// Numbers and minutes in the browser's language; the labels are in English, as the rest of the extension.
const minutes = new Intl.NumberFormat(undefined, { style: 'unit', unit: 'minute', unitDisplay: 'short' })
const number = new Intl.NumberFormat()
const words = new Intl.Segmenter(undefined, { granularity: 'word' })
const plural = new Intl.PluralRules('en')
const list = new Intl.ListFormat('en')

/** What each sign stands for, in its row of Settings › Extensions. */
const LEGEND = [
  '| Sign | Stands for |',
  '|---|---|',
  '| ◷ | How long the answer takes to read |',
  `| ${BARS[1]}${BARS[3]}${BARS[5]}${BARS[7]} | A paragraph: the longer it is, the taller its bar |`,
  ...Object.values(PARTS).flatMap(({ sign, names }) => (sign ? [`| ${sign} | A ${names[0]} |`] : [])),
  '| ↗ | How many links it holds |',
].join('\n')

/** @param {(event: string, match: object | Function, run?: Function) => void} _on @param {any} $ */
export async function register(_on, $) {
  /** Whether to draw under every answer, however short. */
  let every = (await $.store.get('every')) === true

  $.slot('answer', (/** @type {{ text: string }} */ { text }) => {
    const length = count(text)
    if (!length || (length < LONG && !every)) return null
    const parts = partsOf(text)
    const reading = Math.max(1, Math.round(length / PER_MINUTE))
    // Each address once, the stop or comma after it left out.
    const links = new Set(text.match(/https?:\/\/[^\s<>()[\]"'`]+/g)?.map((url) => url.replace(/[.,;:!?]+$/, ''))).size
    return { row: [
      { text: `◷ ${minutes.format(reading)}`, label: `${amount(reading, ['minute', 'minutes'])} to read` },
      ...(parts.length ? [{ text: `${mark(text)}${map(parts)}`, label: said(parts) }] : []),
      ...(links ? [{ text: `↗ ${number.format(links)}`, label: amount(links, ['link', 'links']) }] : []),
    ] }
  })

  // Its row in Settings › Extensions: what each sign stands for, and which answers it draws under.
  $.slot('settings', () => [
    { markdown: LEGEND },
    { row: [
      { text: every ? 'It draws under every answer.' : `It draws under answers of ${LONG} words or more.`, muted: true },
      { button: every ? 'Only long answers' : 'Every answer', action: every ? 'long' : 'every' },
    ] },
  ])

  $.press(async (/** @type {string} */ action) => {
    every = action === 'every'
    await $.store.set('every', every)
    $.redraw()
  })
}

/**
 * The parts of an answer, in order, as its Markdown lays them out, each with its length in characters.
 * A line goes on the part it follows until a blank line, a heading, a rule or a line that starts another
 * kind of part; a fenced block of code is one part, blank lines and all.
 * @param {string} text @returns {{ kind: string, size: number }[]}
 */
function partsOf(text) {
  /** @type {{ kind: string, size: number }[]} */
  const parts = []
  /** @type {{ kind: string, size: number } | null} the part under way */
  let part = null
  /** @type {RegExp | null} the line that closes the code under way */
  let closing = null
  for (const line of text.split('\n')) {
    if (closing && part) {
      if (closing.test(line)) [closing, part] = [null, null]
      else part.size += line.length
      continue
    }
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      parts.push(part = { kind: 'code', size: 0 })
      closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`)
      continue
    }
    const kind = kindOf(line)
    if (kind === 'heading') parts.push({ kind, size: 0 })
    if (['blank', 'heading', 'rule'].includes(kind)) {
      part = null
      continue
    }
    if (!part || (kind !== 'paragraph' && kind !== part.kind)) parts.push(part = { kind, size: 0 })
    part.size += line.trim().length
  }
  return parts
}

/** What a line starts, or goes on with: a paragraph's line may go on a list, a quote or a formula. @param {string} line */
const kindOf = (line) => (!line.trim() ? 'blank'
  : /^ {0,3}#{1,6}(\s|$)/.test(line) ? 'heading'
  : /^ {0,3}([-*_])( *\1){2,} *$/.test(line) ? 'rule'
  : /^\s*([-*+]|\d{1,9}[.)])\s/.test(line) ? 'list'
  : /^\s*\|/.test(line) ? 'table'
  : /^ {0,3}>/.test(line) ? 'quote'
  : /^\s*(\$\$|\\\[)/.test(line) ? 'formula'
  : 'paragraph')

/**
 * The map of an answer's parts: a bar for each paragraph, as tall as it is long beside the longest, a
 * sign for each other part, and a space where a heading starts a section.
 * @param {{ kind: string, size: number }[]} parts
 */
function map(parts) {
  const longest = Math.max(1, ...parts.filter(({ kind }) => kind === 'paragraph').map(({ size }) => size))
  const signs = parts.slice(0, SHOWN).map(({ kind, size }) => (kind === 'heading' ? ' '
    : kind === 'paragraph' ? BARS[Math.max(1, Math.ceil((size / longest) * BARS.length)) - 1] : PARTS[kind].sign))
  return `${signs.join('').trim().replace(/ +/g, ' ')}${parts.length > SHOWN ? '…' : ''}`
}

/** The map in words: "Its parts, under 2 headings: 3 paragraphs, 1 table and 1 list". @param {{ kind: string }[]} parts */
function said(parts) {
  const counts = new Map()
  for (const { kind } of parts) counts.set(kind, (counts.get(kind) ?? 0) + 1)
  const headings = counts.get('heading') ?? 0
  counts.delete('heading')
  const listed = list.format([...counts].map(([kind, n]) => amount(n, PARTS[kind].names)))
  return headings ? `Its parts, under ${amount(headings, ['heading', 'headings'])}: ${listed}` : `Its parts: ${listed}`
}

/**
 * The answer's direction, as a mark the map begins with: the map's signs have none of their own, so
 * without it an answer in Arabic or Hebrew, read from the right, would have its map read from the left.
 * @param {string} text
 */
const mark = (text) => (/[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u.test(/\p{L}/u.exec(text)?.[0] ?? '') ? '\u200F' : '\u200E')

/** How many words, in any language: Intl.Segmenter knows where words end in Japanese or Thai too. @param {string} text */
function count(text) {
  let found = 0
  for (const { isWordLike } of words.segment(text)) if (isWordLike) found++
  return found
}

/** @param {number} n @param {[string, string]} names for one, and for more */
const amount = (n, [one, more]) => `${n} ${plural.select(n) === 'one' ? one : more}`
