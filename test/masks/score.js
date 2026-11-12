// SPDX-License-Identifier: MIT
// What npm run masks marks: an annotated set's documents, and whether what goes on the wire still holds their names. A name
// counts only if every letter of it is hidden, so hiding "Durand" but not "S." in "S. Durand" is a miss; over-masked means
// ordinary words hidden, out of all words not marked as anything.

const MARK = /\[\[(PF|PS|O|L|E|T|I):([^[\]]*)\]\]/g
const MASKED = /⟦[A-Z][0-9a-f]{6,}⟧/

/** A set's file: `=== id=… type=…` headers, then text with [[KIND:value]] marks. @param {string} source @param {string} lang */
export function parse(source, lang) {
  return source.split(/^=== /m).slice(1).map((part) => {
    const line = part.indexOf('\n')
    const head = Object.fromEntries(part.slice(0, line).trim().split(/\s+/).map((pair) => pair.split('=')))
    const body = part.slice(line + 1).replace(/\s+$/, '')
    let [text, last] = ['', 0]
    const spans = []
    for (const match of body.matchAll(MARK)) {
      text += body.slice(last, match.index)
      spans.push({ start: text.length, end: text.length + match[2].length, kind: match[1], value: match[2] })
      text += match[2]
      last = match.index + match[0].length
    }
    text += body.slice(last)
    return { id: head.id, type: head.type, lang, text, spans }
  })
}

/** Which characters of a text a masked copy of it hid: what's left of it stands in order between the marks. @param {string} text @param {string} wire */
export function coverOf(text, wire) {
  const cover = new Uint8Array(text.length).fill(1)
  let at = 0
  for (const piece of wire.split(new RegExp(MASKED.source, 'g'))) {
    if (!piece) continue
    const found = text.indexOf(piece, at)
    if (found < 0) throw new Error(`What was left isn't in the text: ${piece.slice(0, 60)}`)
    cover.fill(0, found, found + piece.length)
    at = found + piece.length
  }
  return cover
}

const SIGNIFICANT = /[\p{L}\p{N}]/u

/** @param {{ text: string, lang: string, spans: { start: number, end: number, kind: string, value: string }[] }} doc @param {Uint8Array} cover */
export function tally(doc, cover) {
  const result = { names: 0, whole: 0, part: 0, words: 0, over: 0, misses: /** @type {string[]} */ ([]), overs: /** @type {string[]} */ ([]) }
  for (const span of doc.spans) {
    if (span.kind[0] !== 'P') continue
    let [total, got] = [0, 0]
    for (let i = span.start; i < span.end; i++) {
      if (!SIGNIFICANT.test(doc.text[i])) continue
      total++
      if (cover[i]) got++
    }
    result.names++
    if (got === total) result.whole++
    else result.misses.push(span.value)
    if (got) result.part++
  }
  const gold = new Uint8Array(doc.text.length)
  for (const span of doc.spans) gold.fill(1, span.start, span.end)
  for (const { index, segment, isWordLike } of new Intl.Segmenter(doc.lang, { granularity: 'word' }).segment(doc.text)) {
    if (!isWordLike) continue
    const range = [...segment].length && Array.from({ length: segment.length }, (_, i) => index + i)
    if (range.some((i) => gold[i])) continue
    result.words++
    if (range.some((i) => cover[i])) {
      result.over++
      result.overs.push(segment)
    }
  }
  return result
}

/** @param {number} got @param {number} of */
export function wilson(got, of) {
  if (!of) return [0, 0]
  const z = 1.96
  const p = got / of
  const scale = 1 + z * z / of
  const centre = p + z * z / (2 * of)
  const margin = z * Math.sqrt(p * (1 - p) / of + z * z / (4 * of * of))
  return [(centre - margin) / scale, (centre + margin) / scale]
}
