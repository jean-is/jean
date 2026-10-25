// What Slides changes in a deck's Markdown (D591), as text, so that the rest of it stays byte for byte: a slide's layout, in
// its settings; the kit the deck was drawn with, kept in its headmatter as one line, so that the file looks the same wherever it
// goes; where its pictures are, a picture of the task named by its name kept at its place in the project (D599); and Jean's
// version of a deck set against the user's slide by slide, each run of slides it changes, adds or takes away a change to accept
// or reject (D505). Pure, on deck's own reading of the Markdown (parseDeck).
import { parseDeck } from '@codename/deck'

/** A deck's Markdown as pieces that join back into it, a slide each, each but the first from the rule before its slide. @param {string} source */
export function piecesOf(source) {
  const { slides } = parseDeck(source)
  const ends = slides.map((slide, i) => (i === slides.length - 1 ? source.length : slide.end))
  return ends.map((end, i) => source.slice(i ? ends[i - 1] : 0, end))
}

/** The headmatter, `---`, its settings and `---`, or null. @param {string} source */
const headOf = (source) => ((head) => (head && /^\s*[\w-]+\s*:/.test(head[1]) ? head[0] : null))(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?=\n|$)/.exec(source))
/** A rule a deck starts with and the empty lines after it, which hold nothing. */
const BARE = /^---[ \t]*\n(?:[ \t]*\n)*/

/** The deck with one of its own settings, its headmatter's, on one line: one there kept unless `over`. @param {string} source @param {string} key @param {string} value @param {boolean} [over] */
function withSetting(source, key, value, over = false) {
  const head = headOf(source), line = `${key}: ${value}`, own = new RegExp(`^${key}[ \\t]*:.*(?:\\n[ \\t]+.*)*$`, 'm')
  if (!head) return `---\n${line}\n---\n\n${source.replace(BARE, '')}`
  if (own.test(head)) return over ? head.replace(own, line) + source.slice(head.length) : source
  const close = head.lastIndexOf('\n---')
  return `${source.slice(0, close)}\n${line}${source.slice(close)}`
}

/**
 * The deck with the kit it is drawn with in its headmatter, as one line, unless it holds one of its own, or `over` it: the
 * project's new look (D601). @param {string} source @param {object} kit @param {boolean} [over]
 */
export const withKit = (source, kit, over = false) => withSetting(source, 'kit', JSON.stringify(kit), over)
/** The deck named, in its headmatter's title. @param {string} source @param {string} title */
export const withTitle = (source, title) => withSetting(source, 'title', JSON.stringify(title), true)

/** A picture's place in a deck, as deck reads one: `![words](place)` or `(<place>)`, or a slide's `image:` or `background:`, quoted or not. */
const PICTURE = /(!\[[^\]\n]*\]\(<?)([^<>)\n]+?)(>?(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\))|^([ \t]*(?:image|background|backgroundImage)[ \t]*:[ \t]*)(.+?)([ \t]*)$/gm
/** The deck with each picture at the place `to` gives it, else where it was (D599). @param {string} source @param {(place: string) => string | undefined | void} to */
export const withPictures = (source, to) => source.replace(PICTURE, (all, open, place, close, key, set, rest) => ((there) => (there ? `${open ?? key}${there}${close ?? rest}` : all))(to(place?.trim() ?? set.replace(/^(['"])(.*)\1$/, '$2'))))
/** The latest of the task's pictures that goes by the name a deck gives it, as the brain writes one: its case, %20 and its extension aside. @template {{ name: string }} T @param {T[]} pictures @param {string} place */
export const namedIn = (pictures, place) => ((bare) => pictures.findLast((one) => bare(one.name) === bare(place)))((/** @type {string} */ name) => name.trim().toLowerCase().replace(/%20/g, ' ').replace(/\.\w+$/, ''))
/** A place from the deck's folder, in the project, unless it is the web's, held inside or the page's own. @param {string} place */
export const placeIn = (place) => (/^([a-z][\w+.-]*:|\/)/i.test(place) ? undefined : new URL(place, 'file:///decks/').pathname.slice(1))

/** The deck without the kit in its headmatter, for the brain, which needn't write it again. @param {string} source */
export function withoutKit(source) {
  const head = headOf(source)
  if (!head) return source
  const kept = head.replace(/^kit[ \t]*:.*\n(?:[ \t]+.*\n)*/m, '')
  return /^---[ \t]*\n---/.test(kept) ? source.slice(head.length).replace(/^\n+/, '') : kept + source.slice(head.length)
}

/** The deck with this slide laid out by the layout named, in its settings, the rest of them as they were. @param {string} source @param {number} index @param {string} layout */
export function withLayout(source, index, layout) {
  const pieces = piecesOf(source), piece = pieces[index], line = `layout: ${layout}`
  if (piece === undefined) return source
  // Its settings between its rule and the next, the headmatter's for the first slide; else, settings of its own after its rule.
  const settings = /^(\n?---[ \t]*\n)((?:(?!---)[^\n]*\n)*?)(---[ \t]*(?:\n|$))/.exec(piece)
  const laid = settings && /^\s*[\w-]+\s*:/.test(settings[2])
    ? settings[1] + (/^layout[ \t]*:.*$/m.test(settings[2]) ? settings[2].replace(/^layout[ \t]*:.*$/m, line) : `${settings[2]}${line}\n`) + piece.slice(settings[1].length + settings[2].length)
    : index ? piece.replace(/^\n?---[ \t]*\n/, (rule) => `${rule}${line}\n---\n`) : `---\n${line}\n---\n\n${piece.replace(BARE, '')}`
  return pieces.map((one, i) => (i === index ? laid : one)).join('')
}

/**
 * Jean's changes, a slide each: one of the user's slides that Jean's version puts another in place of, adds or takes away, by
 * where it is in each (the slides from and to), found from the longest run of slides the two have alike.
 * @param {string} mine @param {string} theirs @returns {{ mine: [number, number], theirs: [number, number] }[]}
 */
export function changesOf(mine, theirs) {
  const a = piecesOf(mine).map((one) => one.trim()), b = piecesOf(theirs).map((one) => one.trim())
  const alike = [...a.map(() => b.map(() => 0)), b.map(() => 0)]
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) alike[i][j] = a[i] === b[j] ? 1 + (alike[i + 1][j + 1] ?? 0) : Math.max(alike[i + 1][j], alike[i][j + 1] ?? 0)
  /** @type {{ mine: [number, number], theirs: [number, number] }[]} */
  const changes = []
  let i = 0, j = 0, from = [0, 0]
  // A run that differs, slide by slide: each of the user's against Jean's in its place, then what is left of either alone.
  const close = () => {
    for (let k = 0; from[0] + k < i || from[1] + k < j; k++) {
      const [x, y] = [Math.min(from[0] + k, i), Math.min(from[1] + k, j)]
      changes.push({ mine: [x, Math.min(x + 1, i)], theirs: [y, Math.min(y + 1, j)] })
    }
  }
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { close(); from = [++i, ++j] }
    else if (j < b.length && (i === a.length || (alike[i][j + 1] ?? 0) >= alike[i + 1][j])) j++
    else i++
  }
  close()
  return changes
}

/**
 * A deck with the slides from..to of another in place of its own at..: the user's with one of Jean's changes taken, or Jean's
 * with one given up. A slide that no longer comes first gets a rule before it. @param {string} into @param {[number, number]} at
 * @param {string} other @param {[number, number]} taken
 */
export function swapped(into, at, other, taken) {
  const others = piecesOf(other).slice(...taken).map((piece, k) => (at[0] + k === 0 || /^\n---/.test(piece) ? piece : `\n${/^---/.test(piece) ? '' : '---\n\n'}${piece}`))
  return [...piecesOf(into).slice(0, at[0]), ...others, ...piecesOf(into).slice(at[1])].join('').replace(/^\n+---/, '---')
}
