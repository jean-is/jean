// Slides (D200): a ```marp block read as Marp writes a deck (Marpit's Markdown): slides between
// rules (`---`), settings in its front matter and in HTML comments, and colours as pictures
// (`![bg](navy)` for the background, `![](white)` for the text). A setting holds from its slide
// on, or on that slide only when it starts with `_`. Other comments are the speaker's notes, and
// pictures show as their words, as answers show them (ui/markdown.js): neither is drawn.
// Host-agnostic: marked's tokens, lexed by whoever reads the deck.

/** @typedef {{ tokens: any[], settings: Record<string, string> }} Slide */

const SETTING = /^\s*(_?)(\w+)\s*:\s*(.*?)\s*$/
/** Marp's settings: those drawn here, then those a deck may hold that the room's look stands for. */
const KNOWN = new Set(['class', 'paginate', 'header', 'footer', 'backgroundColor', 'color',
  'marp', 'theme', 'style', 'size', 'headingDivider', 'math', 'lang', 'title', 'description', 'author',
  'backgroundImage', 'backgroundPosition', 'backgroundRepeat', 'backgroundSize'])
const COLOUR = /^(?:#[\da-f]{3,8}|(?:rgb|hsl|hwb|lab|lch|oklab|oklch)a?\(.*\)|[a-z]+)$/i
/** The words of a picture that tell Marp how to lay it out, never shown. */
const LAYOUT = /^(?:bg|left|right|contain|cover|fit|auto|vertical|blur|grayscale|sepia|invert|[\d.]+%|[a-z-]+:\S+)$/i

/** @param {string} source @param {(source: string) => any[]} lex @returns {Slide[]} */
export function readDeck(source, lex) {
  /** @typedef {{ tokens: any[], own: Record<string, string>, only: Record<string, string> }} Read */
  /** @type {Read[]} */
  const slides = [{ tokens: [], own: {}, only: {} }]
  const front = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(source)
  const fronted = front !== null && settings(front[1], slides[0])
  for (const token of lex(fronted ? source.slice(front[0].length) : source)) {
    const slide = /** @type {Read} */ (slides.at(-1))
    if (token.type === 'hr') slides.push({ tokens: [], own: {}, only: {} })
    else if (token.type === 'html') {
      for (const [, comment] of token.raw.matchAll(/<!--([\s\S]*?)-->/g)) settings(comment, slide)
      const rest = token.raw.replace(/<!--[\s\S]*?(?:-->|$)/g, '').trim()
      if (rest) slide.tokens.push({ ...token, raw: rest })
    } else if (token.type === 'paragraph') {
      const kept = paragraph(token, slide)
      if (kept) slide.tokens.push(kept)
    } else if (token.type !== 'space') slide.tokens.push(token)
  }
  /** @type {Record<string, string>} */
  let held = {}
  return slides.map(({ tokens, own, only }) => ({ tokens, settings: { ...(held = { ...held, ...own }), ...only } }))
}

/**
 * A comment's settings, kept on its slide: false when it holds something else, the speaker's notes.
 * @param {string} text @param {{ own: Record<string, string>, only: Record<string, string> }} slide
 */
function settings(text, slide) {
  const lines = text.split('\n').filter((line) => line.trim())
  const found = lines.map((line) => SETTING.exec(line))
  if (!lines.length || !found.every((match) => match && KNOWN.has(match[2]))) return false
  for (const [, only, key, value] of /** @type {RegExpExecArray[]} */ (found)) (only ? slide.only : slide.own)[key] = value.replace(/^(['"])(.*)\1$/, '$2')
  return true
}

/**
 * A paragraph without its comments and colours, which go to its slide, and its pictures' layout
 * words; null when nothing of it is left to show. @param {any} token @param {{ own: Record<string, string>, only: Record<string, string> }} slide
 */
function paragraph(token, slide) {
  const tokens = token.tokens.filter((/** @type {any} */ part) => {
    if (part.type === 'html' && part.raw.startsWith('<!--')) return void settings(part.raw.slice(4, -3), slide)
    if (part.type !== 'image') return true
    const words = /** @type {string[]} */ (part.text.split(/\s+/))
    if (COLOUR.test(part.href)) slide.only[words.includes('bg') ? 'backgroundColor' : 'color'] = part.href
    else if (!words.includes('bg')) return Object.assign(part, { text: words.filter((word) => !LAYOUT.test(word)).join(' ') })
    return false
  })
  return tokens.some((/** @type {any} */ part) => part.type !== 'br' && (part.type !== 'text' || part.text.trim())) ? { ...token, tokens } : null
}
