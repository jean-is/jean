// Reflexes: a state and typed questions in, probabilities out, in the shape of the
// Decisions API (Jev, TypeSafe System One, Kev): `noul` (yes/no), `choice`, `score`.
// Kev reads the state and every question in one pass: a branch per question, and the
// score of each option's end token, softmaxed within its question (D41).

/**
 * @typedef {{ type: 'noul', instructions: string }
 *   | { type: 'choice', instructions: string, criteria: Record<string, string | null> }
 *   | { type: 'score', instructions: string, criteria: string[] }} Question
 * @typedef {{ type: 'noul', noul: number }
 *   | { type: 'choice', choice: string, probabilities: Record<string, number> }
 *   | { type: 'score', score: number, probabilities: Record<string, number> }} Answer
 * @typedef {(state: unknown, questions: Record<string, Question>) => Promise<Record<string, Answer>>} Decide
 */

/** Kev's delimiter ids, from its config.json (`kev.delimiter_ids`). */
export const KEV = Object.freeze({ state: 151659, question: 151660, start: 151648, end: 151649, decide: 151661 })

/** @param {Question} question */
const options = (question) => question.type === 'noul' ? ['no', 'yes']
  : question.type === 'score' ? question.criteria
  : Object.entries(question.criteria).map(([name, about]) => (about ? `${name}: ${about}` : name))

/** Caller text can never produce a delimiter. @param {string} text */
const escape = (text) => text.replace(/<\|([A-Za-z0-9_]+)\|>/g, '<¦$1¦>')

/** Structured state as indented `key: value` lines. @param {unknown} value @returns {string} */
export function render(value, indent = '') {
  if (typeof value !== 'object' || value === null) return String(value ?? '')
  return Object.entries(value).map(([key, item]) => (typeof item === 'object' && item !== null
    ? `${indent}${key}:\n${render(item, `${indent}  `)}` : `${indent}${key}: ${item}`)).join('\n')
}

/**
 * Kev's input sequence, and for each question the position of each option's end.
 * @param {unknown} state @param {Record<string, Question>} questions
 * @param {(text: string) => number[]} encode token ids, no special tokens
 */
export function pack(state, questions, encode, maxState = 1024) {
  const ids = [KEV.state, ...encode(escape(render(state))).slice(0, maxState)]
  const ends = Object.values(questions).map((question) => {
    ids.push(KEV.question, ...encode(escape(question.instructions)))
    const positions = options(question).map((option) => ids.push(KEV.start, ...encode(escape(option)), KEV.end) - 1)
    ids.push(KEV.decide)
    return positions
  })
  return { ids, ends }
}

/**
 * Answers in the Decisions API shape, from Kev's per-token scores.
 * @param {Record<string, Question>} questions @param {number[][]} ends @param {ArrayLike<number>} logits
 * @returns {Record<string, Answer>}
 */
export function answers(questions, ends, logits) {
  return Object.fromEntries(Object.entries(questions).map(([name, question], i) => {
    const scores = ends[i].map((at) => Number(logits[at]))
    const top = Math.max(...scores)
    const exp = scores.map((score) => Math.exp(score - top))
    const p = exp.map((value) => value / exp.reduce((sum, x) => sum + x, 0))
    if (question.type === 'noul') return [name, { type: 'noul', noul: p[1] }]
    if (question.type === 'score') return [name, { type: 'score', score: p.reduce((sum, x, level) => sum + level * x, 0), probabilities: { ...p } }]
    const keys = Object.keys(question.criteria)
    return [name, { type: 'choice', choice: keys[p.indexOf(Math.max(...p))], probabilities: Object.fromEntries(keys.map((key, j) => [key, p[j]])) }]
  }))
}
