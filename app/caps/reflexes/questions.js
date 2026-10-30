// The reflex questions Jean asks, in English (D41). One definition serves Jean and the
// multilingual test set (scripts/reflexes.js), so what is measured is what runs.

/** @typedef {import('../../core/decide.js').Question} Question */

/** What a child's message may tell of, asked of Kev and, where Kev isn't on, of the brain (D228, D661). */
const DANGERS = { harm: 'self-harm or suicide', abuse: 'abuse or violence done to them', secrecy: 'an adult asking them for secrecy, pictures or a meeting',
  bullying: 'bullying or threats', none: 'no danger: schoolwork, a quarrel, a story, a small injury' }

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
  /** Asked of each message in a child's profile (D228), with `home` in the same pass: a danger is told to their parent, but abuse at home. @type {Question} */
  danger: { type: 'choice', instructions: 'Does this message from a child tell of a danger to them?', criteria: DANGERS },
  /** @type {Question} */
  home: { type: 'noul', instructions: 'Is the person hurting this child a parent or someone they live with?' },
}

/**
 * The danger a child's message tells of, if any. One from someone they live with is 'home', which their parent
 * isn't told, since it may be them: whatever its kind but self-harm, as Kev often names abuse at home another (D228).
 * @param {Record<string, import('../../core/decide.js').Answer>} answers
 */
export function dangerOf({ danger, home }) {
  if (danger?.type !== 'choice' || danger.choice === 'none' || danger.probabilities[danger.choice] < YES) return undefined
  return danger.choice !== 'harm' && home?.type === 'noul' && home.noul >= YES ? 'home' : danger.choice
}

/**
 * The same dangers as a brain is asked them: a danger at home a choice of its own, since a brain asked to add it seldom does,
 * and self-harm by a word a brain doesn't take for any harm.
 */
const ASKED = { selfharm: DANGERS.harm, home: "abuse, violence or threats from a parent, a parent's partner or someone they live with", abuse: 'abuse or violence done to them by someone outside their home',
  secrecy: DANGERS.secrecy, bullying: DANGERS.bullying, none: DANGERS.none }

/**
 * The same two questions as the brain answering a child is asked them where Kev isn't on, a phone or a tablet (D660) or
 * before its download: one request of its own, no tools, a word back (D661).
 * @param {string} message the child's
 */
export const dangerAsked = (message) => ({
  system: `A child sent the message below. Does it tell of a danger to them? Answer with one word, nothing else: ${Object.entries(ASKED).map(([kind, about]) => `${kind} (${about})`).join(', ')}.`,
  messages: [{ role: /** @type {const} */ ('user'), content: `<message>\n${message}\n</message>` }], tools: [], maxTokens: 400, effort: /** @type {const} */ ('low'),
})

/** What the brain's reply to `dangerAsked` tells, as `dangerOf` reads Kev's: its first word that names a danger, home or none. @param {string} reply */
export function dangerSaid(reply) {
  const kind = /** @type {string[]} */ (reply.toLowerCase().replace(/-/g, '').match(/[a-z]+/g) ?? []).find((word) => Object.hasOwn(ASKED, word))
  return kind === 'none' ? undefined : kind === 'selfharm' ? 'harm' : kind
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
