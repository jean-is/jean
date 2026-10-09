// Double-check, the parts with no browser in them (tested under node --test): the claims an
// answer makes with the sources they cite, the passage of each source that bears on a claim,
// the request that asks a brain about them, and the verdicts read from its reply.
import { bm25 } from '../../core/search.js'

/** @typedef {'supported' | 'contradicted' | 'missing' | 'unknown'} Verdict */
/** @typedef {{ text: string, sources: number[] }} Claim */

// Past this many claims, an answer is checked on its first ones only.
const MAX_CLAIMS = 12
const CITE = /\s*\[(\d+(?:\s*,\s*\d+)*)\]/g

/** Markdown down to its words: no emphasis, code marks, list bullets, headings or table bars. @param {string} text */
const plain = (text) => text.replace(/[*_`~]+/g, '').replace(/^\s*(?:[-+•]|\d+[.)]|#+|>)\s+/gm, '').replace(/[ \t]*\|[ \t]*/g, ' ').replace(/^[ \t:-]+$/gm, '')

/**
 * The sentences of an answer that cite a known source, with the numbers they cite, in order.
 * @param {string} text @param {(n: number) => boolean} known @param {string} [lang]
 * @returns {Claim[]}
 */
export function claimsIn(text, known, lang) {
  /** @type {Claim[]} */
  const found = []
  for (const { segment } of new Intl.Segmenter(lang, { granularity: 'sentence' }).segment(plain(text))) {
    const sources = [...new Set([...segment.matchAll(CITE)].flatMap((match) => match[1].split(',').map(Number)))].filter(known)
    const claim = segment.replace(CITE, '').replace(/\s+/g, ' ').trim()
    if (sources.length && claim) found.push({ text: claim, sources })
  }
  return found.slice(0, MAX_CLAIMS)
}

/**
 * What a source says about a claim: all of it when it is short, otherwise its paragraphs that
 * match the claim best, in their order, within about `max` characters.
 * @param {string} text @param {string} claim
 */
export function passage(text, claim, max = 1500) {
  if (text.length <= max) return text.trim()
  const chunks = text.split(/\n\s*\n/).flatMap((part) => part.match(/[\s\S]{1,600}/g) ?? [])
  const best = bm25(chunks, claim).slice(0, Math.max(1, Math.floor(max / 600))).map((hit) => hit.index).sort((a, b) => a - b)
  return (best.length ? best : [0]).map((i) => chunks[i].trim()).join('\n…\n')
}

/** The part of a tool's result that is source n: from its "Source [n]:" line to the next one. @param {string} output @param {number} n */
export function sourceIn(output, n) {
  return output.split(/(?=^Source \[\d+\]:)/m).find((part) => part.startsWith(`Source [${n}]:`))?.replace(/^Source \[\d+\]:\s*/, '').trim() ?? ''
}

/** What the brain is asked to do, in English like every prompt. */
export const CHECKER = `You check whether sources support claims. For each claim, write one line: its number, then one word.
supported: the sources say it.
contradicted: the sources say otherwise.
missing: the sources do not say it.
Nothing else.`

/** @param {{ text: string, passages: { n: number, text: string }[] }[]} items */
export const request = (items) => items.map((item, i) => [`Claim ${i + 1}: ${item.text}`, ...item.passages.map((p) => `Source [${p.n}]: ${p.text}`)].join('\n')).join('\n\n')

/** One verdict per claim, from lines like "2: supported"; a claim the reply skips stays unknown. @param {string} reply @param {number} count @returns {Verdict[]} */
export function verdicts(reply, count) {
  /** @type {Verdict[]} */
  const found = Array(count).fill('unknown')
  for (const match of reply.matchAll(/^\W*(?:claim\s*)?(\d+)\W+(supported|contradicted|missing)\b/gim)) {
    const i = Number(match[1]) - 1
    if (i >= 0 && i < count) found[i] = /** @type {Verdict} */ (match[2].toLowerCase())
  }
  return found
}
