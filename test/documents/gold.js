// Where each question's evidence is in the text Jean extracted, file by file and page by page,
// and the checks that make the gold trustworthy: unique anchors, answers the evidence holds.
import { normalise, norm, count } from './text.js'

/** @typedef {import('./corpus.js').Question} Question */
/** @typedef {import('./corpus.js').Evidence} Evidence */
/** @typedef {{ name: string, pages: string[] }} Extracted */
/** @typedef {{ file: string, page: number, start: number, end: number }} Place  page: 1-based; start and end in that page's text */

/** A file's pages joined, with where each page starts. @param {string[]} pages */
export function joined(pages) {
  /** @type {number[]} */
  const starts = []
  let text = ''
  for (const page of pages) {
    starts.push(text.length)
    text += `${page}\n\n`
  }
  return { text, starts }
}

/** @type {WeakMap<Extracted, { text: string, starts: number[], normal: ReturnType<typeof normalise> }>} */
const cache = new WeakMap()
/** @param {Extracted} file */
function view(file) {
  let seen = cache.get(file)
  if (!seen) {
    const { text, starts } = joined(file.pages)
    seen = { text, starts, normal: normalise(text) }
    cache.set(file, seen)
  }
  return seen
}

/** How many times a text is in the files, normalised. @param {Extracted[]} files @param {string} text */
export const occurrences = (files, text) => files.reduce((n, file) => n + count(view(file).normal.text, text), 0)

/**
 * Where a piece of evidence is: the file holding its anchor, its quote first after it.
 * @param {Extracted[]} files @param {Evidence} evidence @returns {Place | null}
 */
export function place(files, { anchor, quote, within = 12000 }) {
  const a = norm(anchor)
  const q = norm(quote)
  for (const file of files) {
    const { starts, normal } = view(file)
    const at = normal.text.indexOf(a)
    if (at < 0) continue
    const i = normal.text.indexOf(q, at)
    if (i < 0 || i - at > within) return null
    const start = normal.at[i]
    const end = normal.at[i + q.length - 1] + 1
    let page = starts.length - 1
    while (page > 0 && starts[page] > start) page--
    return { file: file.name, page: page + 1, start: start - starts[page], end: end - starts[page] }
  }
  return null
}

/** Each question's evidence, placed (null where it wasn't found). @param {Question[]} questions @param {Extracted[]} files */
export const placeAll = (questions, files) => new Map(questions.map((q) => [q.id, q.evidence.map((e) => place(files, e))]))

/** The numbers a text holds, in any digits, commas as thousands. @param {string} text */
export const numbers = (text) => [...norm(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, '')))

/**
 * Whether the evidence suffices for the answer, by the question's kind: the value is in the
 * evidence, the rows add up to the total, there is one piece of evidence per thing counted.
 * Returns what is wrong, or ''.
 * @param {Question} q
 */
export function sufficient(q) {
  const quotes = q.evidence.map((e) => e.quote)
  // A table row's evidence is its anchor (the row's code and name) and its quote together.
  const all = q.evidence.map((e) => `${e.anchor} ${e.quote}`).join(' \n ')
  if (q.answer.kind === 'none') return q.evidence.length ? 'a question without an answer has evidence' : ''
  if (q.type === 'aggregate') {
    const total = quotes.reduce((sum, quote) => sum + numbers(quote)[0], 0)
    return q.answer.kind === 'number' && Math.abs(total - q.answer.value) <= (q.answer.tolerance ?? 0) + 1e-6 ? '' : `rows add up to ${total}, not ${q.answer.kind === 'number' && q.answer.value}`
  }
  if (q.type === 'global') return q.answer.kind === 'number' && q.evidence.length === q.answer.value ? '' : `${q.evidence.length} pieces of evidence for a count of ${q.answer.kind === 'number' && q.answer.value}`
  if (q.answer.kind === 'number') {
    const value = q.answer.value
    return numbers(all).some((n) => Math.abs(n - value) <= (q.answer.kind === 'number' && q.answer.tolerance || 0) + 1e-6) ? '' : `${value} is not in the evidence`
  }
  const text = norm(all)
  return q.answer.accept.some((word) => text.includes(norm(word))) ? '' : `none of ${q.answer.accept.join(', ')} is in the evidence`
}
