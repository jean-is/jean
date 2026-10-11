// BM25 over short texts, with words split by Intl.Segmenter, so it works in every
// script (CJK and Thai have no spaces). One engine for tools, past conversations and requests.
// And searching as people type (D133): part of a word is enough, case and accents aside.

/** Lower-cased words of a text. @param {string} text @param {string} [lang] */
export function words(text, lang) {
  const segmenter = new Intl.Segmenter(lang, { granularity: 'word' })
  return [...segmenter.segment(text.toLowerCase())].filter((s) => s.isWordLike).map((s) => s.segment)
}

/**
 * Ranks documents against a query. Returns indexes of the documents that match at all,
 * best first.
 * @param {string[]} docs @param {string} query
 * @returns {{ index: number, score: number }[]}
 */
export function bm25(docs, query, k1 = 1.2, b = 0.75) {
  const tokenized = docs.map((doc) => words(doc))
  const average = tokenized.reduce((sum, doc) => sum + doc.length, 0) / (docs.length || 1)
  const terms = [...new Set(words(query))]
  const idf = new Map(terms.map((term) => {
    const n = tokenized.filter((doc) => doc.includes(term)).length
    return [term, Math.log(1 + (docs.length - n + 0.5) / (n + 0.5))]
  }))
  return tokenized.map((doc, index) => {
    let score = 0
    for (const term of terms) {
      const f = doc.filter((word) => word === term).length
      if (f) score += (idf.get(term) ?? 0) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * doc.length / (average || 1)))
    }
    return { index, score }
  }).filter((hit) => hit.score > 0).sort((x, y) => y.score - x.score)
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
