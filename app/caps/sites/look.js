// A site's look (D739): its colours by day and by night and its type, as CSS custom properties in look.css, which Jean writes and
// links from every page, and which the brain's style sheets use, never writing a colour of their own. Three looks are dealt for a
// site with no brain, its project's first (ui/kit.js), else the brain's for the subject or the user's colours, then Designs'
// palettes (caps/designs/layouts.json) in voices its language has; each is made readable on its papers by day and by night. Where
// the brain wrote a colour anyway, Jean puts the property nearest its role in its place, or says what it can't read. Pure.
import { contrast, mix, readable } from '../../ui/colour.js'
import { voicesFor } from '../designs/layout.js'

export const LOOK = `look.css`
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif'
/** Each voice's faces as system fonts, nothing downloaded: its headings' stack and weight. */
export const FACES = /** @type {Record<string, [string, number]>} */ ({ calm: [SANS, 700], friendly: [`ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Nunito, Quicksand, ${SANS}`, 700],
  elegant: ['ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Noto Serif", "Hiragino Mincho ProN", "Yu Mincho", serif', 600],
  bold: [`"Avenir Next", "Helvetica Neue", Inter, ${SANS}`, 800], handwritten: ['"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Neue", cursive', 400] })

/** @typedef {{ paper: string, ink: string, accent: string, accent2: string, tint?: string, quiet?: string }} Base */
/** @typedef {{ paper: string, tint: string, ink: string, quiet: string, accent: string, 'accent-2': string, 'on-accent': string }} Colours */
/** @typedef {{ id: string, voice: string, day: Colours, night: Colours, fonts?: { heading?: string[], body?: string[] } }} Look */
/** The brain's colours and type, or the user's, as `site` takes them. @typedef {{ accent: string, paper?: string, ink?: string, second?: string, type?: string }} Own */

/** #rgb or #rrggbb as #rrggbb, else ''. @param {unknown} value */
const hex = (value) => (typeof value === 'string' && /^#([\da-f]{3}|[\da-f]{6})$/i.test(value.trim()) ? value.trim().toLowerCase().replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : '')
const dark = (/** @type {string} */ colour) => contrast(colour, '#000000') < contrast(colour, '#ffffff')

/** Every colour a site wears from its base: words, quiet words, accents and a tint each read at AA on its paper and its tint. @param {Base} base @returns {Colours} */
function coloursOf({ paper, ink, accent, accent2, tint = mix(paper, accent, 0.07), quiet = mix(ink, paper, 0.3) }) {
  const on = (/** @type {string} */ colour) => readable(readable(colour, paper), tint)
  return { paper, tint, ink: on(ink), quiet: on(quiet), accent: on(accent), 'accent-2': on(accent2), 'on-accent': paper }
}
/** A look from its day's base, its night's given or made: a dark paper from its ink, its paper for words, its accents lightened. @param {string} id @param {string} voice @param {Base} day @param {Partial<Base>} [night] */
export function lookOf(id, voice, day, night = {}) {
  const paper = night.paper ?? (dark(day.paper) ? day.paper : mix(day.ink, '#000000', 0.45))
  const base = dark(day.paper) && !night.paper ? day : { paper, ink: readable(night.ink ?? day.paper, paper), accent: readable(night.accent ?? day.accent, paper), accent2: readable(day.accent2, paper) }
  return { id, voice, day: coloursOf(day), night: coloursOf(base) }
}

/** The brain's colours or the user's, as a look of the voice given, else of `voice`; null when its accent is no colour. @param {Own | undefined} own @param {string[]} voices @param {string} voice */
export function ownLook(own, voices, voice) {
  const accent = hex(own?.accent), paper = hex(own?.paper) || mix('#ffffff', accent || '#ffffff', 0.03), ink = hex(own?.ink) || mix('#1b1b1b', accent || '#1b1b1b', 0.12)
  return accent ? lookOf('own', voices.includes(String(own?.type)) ? String(own?.type) : voice, { paper, ink, accent, accent2: hex(own?.second) || mix(accent, ink, 0.45) }) : null
}
/**
 * The project's look (ui/kit.js's lookHere()), its tokens' colours as #rrggbb by `toHex`, by day and by night, its voice where the
 * language has it and its own fonts first; null without its colour. @param {Record<string, any> | null} tokens @param {string[]} voices @param {(colour: string) => string} toHex
 */
export function projectLook(tokens, voices, toHex) {
  const of = (/** @type {Record<string, any> | undefined} */ from, /** @type {string} */ name) => (typeof from?.[name] === 'string' && hex(toHex(from[name]))) || undefined, own = tokens ?? {}
  const accent = of(own, 'primary'), paper = of(own, 'paper') ?? '#ffffff', ink = of(own, 'ink') ?? readable('#1c1b1f', paper), night = { paper: of(own.dark, 'paper'), ink: of(own.dark, 'ink'), accent: of(own.dark, 'primary') }
  return accent ? { ...lookOf('project', voices.includes(own.voice) ? own.voice : 'calm', { paper, ink, accent, accent2: mix(accent, ink, 0.45), tint: of(own, 'soft'), quiet: of(own, 'muted') },
    Object.fromEntries(Object.entries(night).filter(([, value]) => value))), ...(own.fonts && { fonts: own.fonts }) } : null
}

/**
 * A site's three looks, the same each time for its place: its project's, the brain's or the user's, then Designs' palettes apart from
 * each other, each in a voice its first page's language has; and the one it wears, the colours given, else the one kept, else its
 * first, as its record keeps it. @param {{ files: Map<string, Uint8Array>, seed: string, palettes: { id: string, ground: string, ink: string, accent: string, accent2: string }[],
 *   kept?: { id: string, voice: string, own?: Own }, given?: Own, project?: (voices: string[]) => Look | null }} site
 */
export function dealt({ files, seed, palettes, kept, given, project }) {
  const voices = voicesFor(/<html[^>]*?\slang=["']?([a-z]{2,3}(?:-[a-z\d]+)*)/i.exec(new TextDecoder().decode(files.get('index.html') ?? new Uint8Array()))?.[1] ?? 'en')
  const own = ownLook(given ?? kept?.own, voices, kept?.voice ?? 'calm'), fresh = given && own, at = [...seed].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 9973, 7), list = palettes.filter((one) => one.id !== 'project')
  const more = [0, 1, 2].map((i) => ((one) => lookOf(one.id, voices[(at + i) % voices.length], { paper: one.ground, ink: one.ink, accent: one.accent, accent2: one.accent2 }))(list[(at + i * 3) % list.length]))
  const looks = [project?.(voices), own, ...more].filter((one) => !!one).slice(0, 3), look = fresh || looks.find((one) => one.id === kept?.id && one.voice === kept?.voice) || looks[0]
  return { looks, look, kept: { id: look.id, voice: look.voice, ...((fresh ? given : kept?.own) && { own: fresh ? given : kept?.own }) } }
}

/** look.css: the look's properties, its night's under a dark preference, unless its day is dark already. @param {Look} look */
export function cssOf({ day, night, voice, fonts }) {
  const list = (/** @type {string[] | undefined} */ names) => (names ?? []).map((name) => `"${name.replace(/["\\;{}]/g, '')}", `).join('')
  const props = (/** @type {Colours} */ colours) => Object.entries(colours).map(([name, value]) => `--${name}: ${value};`).join(' ')
  return `/* The site's colours and type, by day and by night. Its other style sheets use these properties. */
:root { color-scheme: ${dark(day.paper) ? 'dark' : 'light dark'}; ${props(day)} --font: ${list(fonts?.body)}${SANS}; --display: ${list(fonts?.heading)}${FACES[voice]?.[0] ?? SANS}; --display-weight: ${FACES[voice]?.[1] ?? 700}; }
${dark(day.paper) ? '' : `@media (prefers-color-scheme: dark) { :root { ${props(night)} } }\n`}`
}

/** The colours CSS names that brains write most, as #rrggbb. */
const NAMED = /** @type {Record<string, string>} */ ({ white: '#ffffff', black: '#000000', gray: '#808080', grey: '#808080', silver: '#c0c0c0', red: '#ff0000', green: '#008000', blue: '#0000ff', navy: '#000080',
  teal: '#008080', orange: '#ffa500', gold: '#ffd700', yellow: '#ffff00', purple: '#800080', pink: '#ffc0cb', brown: '#a52a2a', beige: '#f5f5dc', ivory: '#fffff0', whitesmoke: '#f5f5f5' })
const COLOUR = new RegExp(`#[\\da-f]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\([^()]*\\)|(?<![-\\w])(?:${Object.keys(NAMED).join('|')})(?![-\\w])`, 'gi')
const NAMES = ['paper', 'tint', 'ink', 'quiet', 'accent', 'accent-2', 'on-accent', 'font', 'display', 'display-weight']
/** A look's property set in another style sheet, and a colour given in case one is missing. */
const [OURS, FALLBACK] = [new RegExp(`--(?:${NAMES.join('|')})\\s*:[^;}]*;?`, 'g'), new RegExp(`var\\(\\s*(--(?:${NAMES.join('|')}))\\s*,[^()]*(?:\\([^()]*\\)[^()]*)?\\)`, 'g')]
/** A colour as #rrggbb and its opacity, or null for one Jean can't read. @param {string} text */
function read(text) {
  const lower = text.toLowerCase(), digits = /^#([\da-f]+)$/.exec(lower)?.[1], [, kind, inside] = /^(rgb|hsl)a?\(([^)]*)\)$/.exec(lower) ?? []
  const numbers = (inside ?? '').split(/[\s,/]+/).filter(Boolean).map((n, i) => parseFloat(n) / (n.endsWith('%') && (i === 3 || kind === 'rgb') ? (i === 3 ? 100 : 100 / 255) : 1))
  const [h, s, l] = [numbers[0], numbers[1] / 100, numbers[2] / 100], k = (/** @type {number} */ n) => (n + h / 30) % 12
  const rgb = kind === 'hsl' ? [0, 8, 4].map((n) => 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))) : numbers
  if (NAMED[lower]) return { colour: NAMED[lower], alpha: 1 }
  if (digits && [3, 4, 6, 8].includes(digits.length)) return ((full) => ({ colour: `#${full.slice(0, 6)}`, alpha: full.length > 6 ? parseInt(full.slice(6), 16) / 255 : 1 }))(digits.length < 5 ? [...digits].map((d) => d + d).join('') : digits)
  return kind && numbers.length >= 3 && numbers.every(Number.isFinite) ? { colour: `#${rgb.slice(0, 3).map((n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')).join('')}`, alpha: Math.min(1, numbers[3] ?? 1) } : null
}
/**
 * The property a colour takes, by what it colours and how light and colourful it is, as a page for the day's paper is written: a
 * ground is the paper, the tint or an accent; words are the ink, quiet, an accent, or on an accent when nearly white; a drawing, any. Of the
 * two accents, the one nearer its hue. @param {string} colour #rrggbb @param {'ground' | 'words' | 'any'} role @param {Look} look
 */
function nearest(colour, role, look) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16)), light = Math.cbrt(contrast(colour, '#000000') * 0.05 - 0.05), strong = (Math.max(r, g, b) - Math.min(r, g, b)) / 255 > 0.2
  const hue = (/** @type {string} */ one) => ((rgb) => Math.atan2(Math.sqrt(3) * (rgb[1] - rgb[2]), 2 * rgb[0] - rgb[1] - rgb[2]))([1, 3, 5].map((at) => parseInt(one.slice(at, at + 2), 16)))
  const apart = (/** @type {string} */ one) => Math.abs(Math.atan2(Math.sin(hue(one) - hue(colour)), Math.cos(hue(one) - hue(colour))))
  const accent = apart(look.day['accent-2']) < apart(look.day.accent) ? 'accent-2' : 'accent'
  if (role === 'words') return light >= 0.93 ? 'on-accent' : strong ? accent : light < 0.4 ? 'ink' : 'quiet'
  if (strong && light > 0.25 && light < 0.9) return accent
  return light >= 0.97 ? 'paper' : light >= 0.6 ? 'tint' : role === 'ground' ? accent : light < 0.4 ? 'ink' : 'quiet'
}

/**
 * A site as it wears its look: look.css written, linked from each page that lacks it, the look's properties taken out of its other
 * style sheets, and each colour written in its style sheets, its pages' styles and its drawings' paint put as the nearest property, a
 * colour given in case one of the look's is missing taken out; a black or a white seen through left as a shadow is. What was put, and
 * what Jean can't read or finds set nowhere, said for the brain.
 * @param {Map<string, Uint8Array>} files @param {Look} look @returns {{ files: Map<string, Uint8Array>, put: string[], left: string[] }}
 */
export function worn(files, look) {
  const put = /** @type {string[]} */ ([]), left = /** @type {string[]} */ ([]), out = new Map(files), encode = (/** @type {string} */ text) => new TextEncoder().encode(text)
  const colours = (/** @type {string} */ path, /** @type {string} */ text, /** @type {'ground' | 'words' | 'any'} */ role) => (/url\(|^\s*["']/.test(text) ? text : text.replace(FALLBACK, 'var($1)').replace(COLOUR, (found) => {
    const seen = read(found)
    if (!seen) return (left.push(`${path}: ${found}`), found)
    if (seen.alpha < 1 && ['#000000', '#ffffff'].includes(seen.colour)) return found
    const name = nearest(seen.colour, role, look), to = seen.alpha < 1 ? `color-mix(in srgb, var(--${name}) ${Math.round(seen.alpha * 100)}%, transparent)` : `var(--${name})`
    return (put.push(`${path}: ${found} → ${to}`), to)
  }))
  const declared = (/** @type {string} */ path, /** @type {string} */ css) => css.replace(OURS, '').replace(/([-\w]+)(\s*:\s*)([^;{}]+)/g, (whole, name, colon, value) => name + colon
    + colours(path, value, /^background/i.test(name) ? 'ground' : /^(color|border|outline|text-decoration|caret|column-rule)/i.test(name) ? 'words' : 'any'))
  const styles = (/** @type {string} */ path, /** @type {string} */ css) => css.replace(/\{([^{}]*)\}/g, (whole, body) => `{${declared(path, body)}}`)
  for (const [path, bytes] of files) {
    const text = new TextDecoder().decode(bytes), ext = path.toLowerCase().split('.').pop()
    if (path === LOOK || !['css', 'html'].includes(ext ?? '')) continue
    out.set(path, encode(ext === 'css' ? styles(path, text) : ((/[\s"'/]look\.css\b/i.test(text) ? text : text.replace(/<\/head\s*>|$/i, (end) => `<link rel="stylesheet" href="${'../'.repeat(path.split('/').length - 1)}look.css">${end}`))
      .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (whole, open, css, close) => open + styles(path, css) + close)
      .replace(/(\sstyle\s*=\s*)(["'])(.*?)\2/gi, (whole, attr, quote, css) => attr + quote + declared(path, css) + quote)
      .replace(/(\s(?:fill|stroke|stop-color|flood-color)\s*=\s*)(["'])(.*?)\2/gi, (whole, attr, quote, value) => attr + quote + colours(path, value, 'any') + quote))))
  }
  // A property none of its style sheets, nor look.css, sets.
  const texts = [...out].filter(([path]) => /\.(css|html)$/i.test(path)).map(([path, bytes]) => [path, new TextDecoder().decode(bytes)])
  const set = new Set([...NAMES.map((name) => `--${name}`), ...texts.flatMap(([, text]) => [...text.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name))])
  for (const [path, text] of texts) for (const [, name] of text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) if (!set.has(name)) left.push(`${path}: var(${name})`)
  return { files: out.set(LOOK, encode(cssOf(look))), put, left: [...new Set(left)] }
}

/** What wearing a look says to the brain: the colours it couldn't read, as problems, and those it put, in a line. @param {{ put: string[], left: string[] }} worn */
export const saidOf = ({ put, left }) => ({ problems: left.map((where) => `${where}: write one of look.css's properties in place of this colour, var(--accent) or another`),
  line: put.length ? `look.css's properties were put in place of ${put.length} ${put.length === 1 ? 'colour' : 'colours'} written in the site (${put.slice(0, 4).join('; ')}${put.length > 4 ? '; …' : ''}): colour only through them, and give look to change the colours.` : '' })
