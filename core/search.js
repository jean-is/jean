// BM25 over short texts, with words split by Intl.Segmenter, so it works in every
// script (CJK and Thai have no spaces). One engine for tools now, documents later.

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
