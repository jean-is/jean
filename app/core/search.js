// BM25 with words split by Intl.Segmenter, so it works in every script (CJK and Thai have no spaces),
// over an index made once: one engine for tools, past conversations, requests and documents.
// Every place a phrase is, for counting. And searching as people type (D133): part of a word is
// enough, case and accents aside.

/** @type {Map<string | undefined, Intl.Segmenter>} */
const segmenters = new Map()

/** Lower-cased words of a text. @param {string} text @param {string} [lang] */
export function words(text, lang) {
  let segmenter = segmenters.get(lang)
  if (!segmenter) segmenters.set(lang, (segmenter = new Intl.Segmenter(lang, { granularity: 'word' })))
  return [...segmenter.segment(text.toLowerCase())].filter((s) => s.isWordLike).map((s) => s.segment)
}

/** What a text is searched by: its folded words, and a code such as C-4471 whole as well as in parts. @param {string} text */
export function keys(text) {
  const folded = fold(text)
  return [...words(folded), ...(folded.match(/\p{L}+-\d+/gu) ?? [])]
}

/** @typedef {{ lengths: Uint32Array, total: number, postings: Map<string, Uint32Array> }} Lexicon  postings: [text, count, text, count, …] */

/** An index of texts for BM25. @param {string[]} texts @param {(text: string) => string[]} [split] @returns {Lexicon} */
export function lexicon(texts, split = keys) {
  const lengths = new Uint32Array(texts.length)
  /** @type {Map<string, number[]>} */
  const lists = new Map()
  texts.forEach((text, i) => {
    /** @type {Map<string, number>} */
    const counts = new Map()
    const all = split(text)
    lengths[i] = all.length
    for (const term of all) counts.set(term, (counts.get(term) ?? 0) + 1)
    for (const [term, n] of counts) lists.get(term)?.push(i, n) ?? lists.set(term, [i, n])
  })
  return { lengths, total: lengths.reduce((sum, n) => sum + n, 0), postings: new Map([...lists].map(([term, list]) => [term, Uint32Array.from(list)])) }
}

/**
 * The texts of several indexes that match a query, best first, scored as if they were one index.
 * @param {Lexicon[]} lexicons @param {string} query @returns {{ doc: number, passage: number, score: number }[]}
 */
export function lookup(lexicons, query, split = keys, k1 = 1.2, b = 0.75) {
  const n = lexicons.reduce((sum, l) => sum + l.lengths.length, 0)
  const average = lexicons.reduce((sum, l) => sum + l.total, 0) / (n || 1)
  const scores = lexicons.map((l) => new Float64Array(l.lengths.length))
  for (const term of new Set(split(query))) {
    const df = lexicons.reduce((sum, l) => sum + (l.postings.get(term)?.length ?? 0) / 2, 0)
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
    lexicons.forEach((l, d) => {
      const list = l.postings.get(term) ?? []
      for (let i = 0; i < list.length; i += 2) scores[d][list[i]] += idf * (list[i + 1] * (k1 + 1)) / (list[i + 1] + k1 * (1 - b + b * l.lengths[list[i]] / (average || 1)))
    })
  }
  return scores.flatMap((list, doc) => [...list].flatMap((score, passage) => (score > 0 ? [{ doc, passage, score }] : []))).sort((x, y) => y.score - x.score)
}

/** Documents that match a query, best first. @param {string[]} docs @param {string} query @returns {{ index: number, score: number }[]} */
export const bm25 = (docs, query) => lookup([lexicon(docs)], query).map(({ passage, score }) => ({ index: passage, score }))

/**
 * Every place a phrase is in some pages, in order: case, accents and line breaks aside, and never
 * inside a longer word or code where words have spaces between them.
 * @param {string[]} pages @param {string} phrase @returns {{ page: number, at: number }[]}
 */
export function every(pages, phrase) {
  const parts = fold(phrase.normalize('NFC')).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return []
  const pattern = new RegExp(`${/^[a-z0-9]/.test(parts[0]) ? '(?<![a-z0-9])' : ''}${parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}${/[a-z0-9]$/.test(parts[parts.length - 1]) ? '(?![a-z0-9])' : ''}`, 'g')
  return pages.flatMap((text, i) => [...fold(text).matchAll(pattern)].map((match) => ({ page: i + 1, at: match.index ?? 0 })))
}

/**
 * How alike a text is to each of several others, from 0 to 1: the cosine of their word
 * counts, where words most of them share (in any language: "the", "の") weigh less.
 * @param {string} text @param {string[]} others @returns {number[]}
 */
export function alike(text, others) {
  const docs = [text, ...others].map((doc) => words(doc))
  /** @type {Map<string, number>} */
  const df = new Map()
  for (const doc of docs) for (const word of new Set(doc)) df.set(word, (df.get(word) ?? 0) + 1)
  const vectors = docs.map((doc) => doc.reduce((v, word) => v.set(word, (v.get(word) ?? 0) + Math.log(1 + docs.length / (df.get(word) ?? 1))), new Map()))
  const norm = (/** @type {Map<string, number>} */ v) => Math.hypot(...v.values()) || 1
  const [first, ...rest] = vectors
  return rest.map((v) => [...first].reduce((dot, [word, weight]) => dot + weight * (v.get(word) ?? 0), 0) / (norm(first) * norm(v)))
}

/**
 * Whether a text says again what one of several others said (D286): a clause of it, between
 * punctuation of any script, of four words or more, as alike as `said` to one of theirs. Another
 * text as alike as `same` to this one as a whole is a request of the same kind, left out.
 * @param {string} text @param {string[]} others @param {number} same @param {number} [said]
 */
export function restated(text, others, same, said = 0.8) {
  const clauses = (/** @type {string} */ value) => value.split(/(?!['’-])\p{P}/u).filter((clause) => words(clause).length >= 4)
  const kinds = alike(text, others)
  const before = others.filter((_, i) => kinds[i] < same).flatMap(clauses)
  return before.length > 0 && clauses(text).some((clause) => alike(clause, before).some((score) => score >= said))
}

// Accents (Latin, Greek, Cyrillic, Vietnamese) and Arabic's vowel and hamza marks: a letter
// with one is found by the letter. Marks that make another letter (kana's voicing, Indic vowels) stay.
const ACCENT = /^[\u0300-\u036f\u064b-\u065f]+$/
// Persian and Arabic shapes of the same letter (ی ي, ى ي, ک ك, ھ ه), which PDFs mix up too.
const SAME = new Map([['\u06cc', '\u064a'], ['\u0649', '\u064a'], ['\u06a9', '\u0643'], ['\u06be', '\u0647']])
/** @type {Map<string, string>} */
const folded = new Map()

/**
 * A text in lower case and without accents ("Résumé" → "resume"), as long as the text itself:
 * a place found in one is the same place in the other. Compose the text first (NFC).
 * @param {string} text
 */
export function fold(text) {
  return text.replace(/[A-Z\x80-\uffff]/g, (c) => {
    let same = folded.get(c)
    if (same === undefined) {
      const [base, ...marks] = c.normalize('NFD')
      const lower = SAME.get(c) ?? (marks.length && ACCENT.test(marks.join('')) ? base : c).toLowerCase()
      folded.set(c, (same = lower.length === c.length ? lower : c))
    }
    return same
  })
}

/** What was typed, as the folded words to look for, once each. @param {string} query @param {string} [lang] */
export const terms = (query, lang) => [...new Set(words(fold(query.normalize('NFC')), lang))]

/**
 * Every place the terms are in a folded text, as [start, end), in order, joined where they touch.
 * @param {string} text @param {string[]} terms @returns {[number, number][]}
 */
export function ranges(text, terms) {
  /** @type {[number, number][]} */
  const found = []
  for (const term of terms.filter(Boolean)) {
    for (let at = text.indexOf(term); at >= 0; at = text.indexOf(term, at + term.length)) found.push([at, at + term.length])
  }
  /** @type {[number, number][]} */
  const joined = []
  for (const [start, end] of found.sort((a, b) => a[0] - b[0])) {
    const last = joined.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else joined.push([start, end])
  }
  return joined
}

/**
 * A passage of a text around a place in it, as [start, end): from a word's start where the
 * text has spaces, and never in the middle of a character.
 * @param {string} text @param {number} at @returns {[number, number]}
 */
export function passage(text, at, before = 40, length = 160) {
  let start = Math.max(0, at - before)
  const space = text.slice(start, at).search(/\s/)
  if (start > 0 && !/\s/.test(text[start - 1]) && space >= 0) start += space + 1
  if (/[\udc00-\udfff]/.test(text[start] ?? '')) start++
  let end = Math.min(text.length, start + length)
  if (/[\ud800-\udbff]/.test(text[end - 1] ?? '')) end++
  return [start, end]
}
