// BM25 over short texts, with words split by Intl.Segmenter, so it works in every
// script (CJK and Thai have no spaces). One engine for tools, past conversations and requests.

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
