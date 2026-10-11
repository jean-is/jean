// Text as the evals compare it: the same in every format, whatever its extractor did to spaces,
// table bars, tabs, line wraps and case. A place found in the normalised text maps back to the
// extracted text, so evidence is located as a span of the very text the strategies read.
import { fold } from '../../app/core/search.js'

const CJK = /[぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ]/
const SPACE = /[\s|  ]/
// Arabic-Indic and extended digits, as Western ones.
const DIGIT = /[٠-٩۰-۹]/g
// A lam-alef ligature that pdf.js gives back reversed: both orders read the same here.
const LAM_ALEF = /ل([اأإآ])/g

/**
 * The normalised text and, for each of its characters, where it is in the original.
 * @param {string} text @returns {{ text: string, at: number[] }}
 */
export function normalise(text) {
  // Every step keeps the length, so an index here is an index in the original (composed, NFC) text.
  const source = fold(text).replace(DIGIT, (d) => String((d.charCodeAt(0) & 0xf) % 10)).replace(LAM_ALEF, '$1ل')
  let out = ''
  /** @type {number[]} */
  const at = []
  let pending = -1
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (SPACE.test(c)) {
      if (out && pending < 0) pending = i
      continue
    }
    // A wrap between two Chinese or Japanese characters is no space at all.
    if (pending >= 0 && !(CJK.test(c) && CJK.test(out.at(-1) ?? ''))) {
      out += ' '
      at.push(pending)
    }
    pending = -1
    out += c
    at.push(i)
  }
  return { text: out, at }
}

/** @param {string} text */
export const norm = (text) => normalise(text.normalize('NFC')).text

/** How many times a quote is in a text, both normalised. @param {string} haystack normalised @param {string} quote */
export function count(haystack, quote) {
  const needle = norm(quote)
  let n = 0
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length)) n++
  return n
}

/**
 * Where a piece of evidence is in an extracted text: its quote, first after its anchor (unique in
 * the corpus) and within `within` normalised characters of it, as [start, end) in the original.
 * @param {{ text: string, at: number[] }} normalised @param {{ anchor: string, quote: string }} evidence
 * @returns {[number, number] | null}
 */
export function locate(normalised, { anchor, quote }, within = 12000) {
  const a = normalised.text.indexOf(norm(anchor))
  if (a < 0) return null
  const q = norm(quote)
  const i = normalised.text.indexOf(q, a)
  if (i < 0 || i - a > within) return null
  return [normalised.at[i], normalised.at[i + q.length - 1] + 1]
}

/** Content words of a text, folded, without the commonest ones in the languages the corpus uses. @param {string} text */
export function contentTerms(text) {
  const words = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(norm(text))].filter((s) => s.isWordLike).map((s) => s.segment)
  return new Set(words.filter((word) => word.length > 1 && !STOP.has(word) && !/^\d+$/.test(word)))
}

/** The share of a question's content words its evidence holds too. @param {string} question @param {string} evidence */
export function overlap(question, evidence) {
  const q = contentTerms(question)
  const e = contentTerms(evidence)
  if (!q.size) return 0
  let shared = 0
  for (const word of q) if (e.has(word)) shared++
  return shared / q.size
}

/** @param {string} question @param {string} evidence */
export function sharedTerms(question, evidence) {
  const e = contentTerms(evidence)
  return [...contentTerms(question)].filter((word) => e.has(word))
}

const STOP = new Set(`a an the of to in on at by for from with and or but is are was were be been being it its this that these those
which who whom whose what when where why how do does did done have has had having i me my we our you your he she they them their
there here not no yes if then than so as any all each every some such into over under about after before between during up down out
may can could would should will shall must might per via vs also only more most less least very much many other same own just
le la les un une des du de d l et ou en au aux a est sont etait ce cet cette ces qui que quoi dont ou pour par sur dans avec sans
il elle ils elles nous vous on se sa son ses leur leurs ne pas plus moins tres
の に は を が で と も へ や か な た て し から まで より こと する ます です
في من على إلى عن مع هذا هذه ذلك التي الذي أن إن كان قد لا ما هو هي و أو`.split(/\s+/).map((word) => norm(word)))
