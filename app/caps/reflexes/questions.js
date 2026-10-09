// The reflex questions Jean asks, in English (D41). One definition serves Jean and the
// multilingual test set (scripts/reflexes.js), so what is measured is what runs.

/** @typedef {import('../../core/decide.js').Question} Question */

export const REFLEXES = {
  /** @param {Record<string, string>} candidates capability id → what it helps with @returns {Question} */
  capability: (candidates) => ({ type: 'choice', instructions: 'Which of these would help with this message, if any?', criteria: { ...candidates, none: 'nothing new is needed' } }),
  /** @type {Question} */
  demand: { type: 'score', instructions: 'How demanding is this request?', criteria: ['a quick chat or a simple fact', 'reading, writing or summarising', 'several steps of work or analysis', 'expert reasoning'] },
  /** @type {Question} */
  personal: { type: 'noul', instructions: 'Does the message share personal, health, financial or confidential information?' },
  /** @type {Question} */
  unhappy: { type: 'noul', instructions: 'Is the user unhappy with the previous answer?' },
  /** Memory is offered on a yes. @type {Question} */
  lasting: { type: 'noul', instructions: 'Does the message state a lasting fact about the user, a preference or a correction?' },
}

/**
 * Follow-ups the reflexes can judge from an answer, one yes/no question each. Kev-0.6B can
 * tell these; it can't tell whether a text is wordy or full of jargon (test/reflexes).
 * @type {Record<string, Question>}
 */
export const FOLLOW_UPS = {
  table: { type: 'noul', instructions: 'Does this text compare numbers across several items?' },
  email: { type: 'noul', instructions: 'Is this a decision or announcement that needs to be passed on to other people?' },
}
/** How sure a reflex must be to count as a yes, or to offer a capability. */
export const YES = 0.6

/** A score's most likely level (Kev hedges toward the middle, so not the expected value). @param {Record<string, number>} probabilities */
export const likeliest = (probabilities) => {
  const p = Object.values(probabilities)
  return p.indexOf(Math.max(...p))
}

/** What "is the user unhappy?" reads: the answer before, then the new message. @param {string} previous @param {string} message */
export const exchange = (previous, message) => ({ 'previous answer': previous, 'new message': message })

export const CAPABILITIES = { files: 'reading a document or file the user mentions', compute: 'exact numbers, maths, or analysing a table of data' }
/** The capability each choice offers: exact numbers are the computer's (D162). */
export const OFFERED = /** @type {Record<string, string>} */ ({ files: 'files', compute: 'computer' })
