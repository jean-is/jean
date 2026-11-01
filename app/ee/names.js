// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Reading people's names with a token classifier (D681, mask-worker.js does the running): what was measured in
// `npm run masks`, which any new model, export or Transformers.js moves. Windows of 128 tokens, as longer ones lose names; a
// low threshold on the chance of a person, as the most likely label misses far more; whole words, then names, then the
// words of a name, as the engine looks for each. Host-agnostic.

export const WINDOW = 128
export const OVERLAP = 16
// What a reading keeps of each token, to choose among later: what's below it can't matter.
export const FLOOR = 0.001
export const THRESHOLD = 0.005
// A word with no capital: a name only where the model is sure, as its low threshold would otherwise take `save` or `le` for one.
export const UNCAPITALISED = 0.5
// What a word needs to be looked for beyond where it was found: what's taken for a name at the low threshold is hidden there, and spreads no further.
export const SPREAD = 0.5

const WORDS = /[\p{L}\p{M}\p{N}'’-]+/gu
// A word has a capital at its start or after an apostrophe or a hyphen, as `d’Émile` and `dell’Acqua` do.
const CAPITAL = /(?:^|['’-])\p{Lu}/u
// What is attached to a name and no part of it.
const CLITIC = /^\p{Ll}{1,5}['’](?=\p{Lu})/u
const POSSESSIVE = /['’]s$/
// What joins two parts of a name.
const JOINS = /[  '’.-]/
// Titles beside a name: part of what's hidden there, but no name to look for everywhere.
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sir', 'madam', 'm', 'mme', 'mlle', 'me', 'pr', 'herr', 'frau', 'sr', 'sra', 'srta', 'don', 'doña', 'lic', 'ing', 'le', 'la', 'de', 'du', 'des', 'del', 'della', 'di', 'da', 'dos', 'das', 'van', 'von', 'der', 'den', 'ter', 'ten', 'al', 'el', 'bin', 'ibn', 'saint', 'sainte', 'san', 'santa'])

/** Where each window of a text's tokens starts and ends. @param {number} tokens @returns {[number, number][]} */
export function windowsOf(tokens) {
  /** @type {[number, number][]} */
  const windows = []
  for (let start = 0; ; start += WINDOW - OVERLAP) {
    const end = Math.min(tokens, start + WINDOW)
    windows.push([start, end])
    if (end === tokens) return windows
  }
}

/**
 * A text normalised as the tokenizer does, each unit keeping where it came from: NFKC over a base and its marks, so that a
 * decomposed `ö` is the one it tokenizes as, and without what it drops, or what follows would be looked for behind it.
 * @param {string} text
 */
function normalised(text) {
  let out = ''
  /** @type {number[]} */
  const from = []
  /** @type {number[]} */
  const to = []
  for (const { 0: cluster, index } of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const form = /^[\f\v\u2028\u2029]/.test(cluster) ? ' ' : /^[\p{Cc}\p{Cf}\ufffd▁]/u.test(cluster) && !/^[\t\n\r]/.test(cluster) ? '' : cluster.normalize('NFKC')
    for (let i = 0; i < form.length; i++) {
      from.push(index)
      to.push(index + cluster.length)
    }
    out += form
  }
  return { out, from, to }
}

const BYTE = /^<0x[0-9A-F]{2}$|^<0x[0-9A-F]{2}>$/
const SPECIAL = /^<[^>]*>$/
const blank = (/** @type {string} */ char) => char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === ' ' || char === '　' || char === ' ' || char === ' '

/**
 * Where a tokenizer's tokens are in a text, as Transformers.js gives none: Metaspace's ▁, a character given as its bytes, an
 * unknown token. A token that can't be placed still covers where it should be.
 * @param {string} text @param {string[]} tokens @returns {[number, number][]}
 */
export function align(text, tokens) {
  const { out, from, to } = normalised(text)
  /** @type {[number, number][]} */
  const offsets = []
  let cursor = 0
  let [bytesLeft, byteAt, byteEnd] = [0, 0, 0]
  /** @type {number[]} */
  let unknown = []
  /** @type {number | null} */
  let unknownFrom = null
  tokens.forEach((token, i) => {
    if (BYTE.test(token)) {
      if (!bytesLeft) {
        while (cursor < out.length && (out[cursor] === '▁' || blank(out[cursor])) && out[cursor] !== '\n' && out[cursor] !== '\r') cursor++
        const code = out.codePointAt(cursor) ?? 0
        const units = code > 0xffff ? 2 : 1
        ;[byteAt, byteEnd] = [cursor, cursor + units]
        bytesLeft = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
        cursor += units
      }
      offsets[i] = [from[byteAt] ?? text.length, to[byteEnd - 1] ?? text.length]
      bytesLeft--
      return
    }
    bytesLeft = 0
    const piece = token.replaceAll('▁', '')
    if (token === '<unk>') {
      if (unknownFrom === null) {
        let at = cursor
        while (at < out.length && blank(out[at])) at++
        unknownFrom = from[at] ?? text.length
      }
      unknown.push(i)
      return
    }
    if (!piece) {
      offsets[i] = [0, 0]
      return
    }
    let at = cursor
    while (at < out.length && blank(out[at]) && !out.startsWith(piece, at)) at++
    if (!out.startsWith(piece, at)) {
      // Normalisers beyond NFKC (a dash, a quote, what they drop): further on, or where it should be.
      const near = out.indexOf(piece, at)
      if (near >= 0 && near - at <= 2048 && !SPECIAL.test(token)) at = near
      else {
        offsets[i] = [from[Math.min(at, from.length - 1)] ?? 0, to[Math.min(at, to.length - 1)] ?? 0]
        cursor = Math.min(at + piece.length, out.length)
        return
      }
    }
    if (unknown.length) {
      for (const one of unknown) offsets[one] = [/** @type {number} */ (unknownFrom), from[at] ?? text.length]
      unknown = []
      unknownFrom = null
    }
    offsets[i] = [from[at], to[at + piece.length - 1]]
    cursor = at + piece.length
  })
  for (const one of unknown) offsets[one] = [unknownFrom ?? text.length, text.length]
  return offsets
}

/**
 * The names a reading finds: whatever is flagged hides its whole word, as half a word helps nobody, and words next to each
 * other are one name, its chance its surest word's. What is attached to a name stays out of it: `d’Anne` is Anne.
 * @param {string} text @param {[number, number, number][]} flagged each token flagged: its start, its end and its chance
 * @param {number} [threshold] @param {number} [uncapitalised] @returns {{ start: number, end: number, kind: string, chance: number }[]}
 */
export function namesIn(text, flagged, threshold = THRESHOLD, uncapitalised = UNCAPITALISED) {
  const chances = new Float32Array(text.length)
  for (const [start, end, chance] of flagged) for (let i = start; i < end; i++) chances[i] = Math.max(chances[i], chance)
  const cover = new Uint8Array(text.length)
  for (const { 0: word, index } of text.matchAll(WORDS)) {
    let most = 0
    for (let i = index; i < index + word.length; i++) most = Math.max(most, chances[i])
    if (most < (CAPITAL.test(word) ? threshold : uncapitalised)) continue
    const lead = CLITIC.exec(word)?.[0].length ?? 0
    const tail = POSSESSIVE.test(word) ? 2 : 0
    cover.fill(1, index + lead, index + word.length - tail)
  }
  const names = []
  for (let i = 0; i < text.length;) {
    if (!cover[i]) { i++; continue }
    let end = i
    let chance = 0
    while (end < text.length && (cover[end] || (JOINS.test(text[end]) && cover[end + 1]))) {
      chance = Math.max(chance, chances[end])
      end++
    }
    // What it ends with is no part of a word: a stray mark isn't a name's.
    const length = text.slice(i, end).replace(/[^\p{L}\p{N}\p{M}]+$/u, '').length
    if (length) names.push({ start: i, end: i + length, kind: 'person', chance })
    i = end
  }
  return names
}

/** The words of a name to look for on their own: `Mme Marie de Fontenay` is Marie and Fontenay, never a title or a particle. @param {string} name @returns {string[]} */
export function partsOf(name) {
  const parts = name.split(/[\s,]+/).filter(Boolean)
  if (parts.length < 2) return []
  return parts.filter((part) => {
    const plain = part.replace(/[.'’-]/g, '')
    return plain.length >= 2 && /^\p{Lu}/u.test(plain) && !TITLES.has(plain.toLowerCase())
  })
}
