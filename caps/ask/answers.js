// Questions for the user (D143), as text: what the brain asked, read the way small brains write
// it, how each question starts on its card, and the answers it gets back, as JSON. No DOM, so it
// runs under `node --test`.

/** @typedef {{ label: string, description: string, recommended: boolean }} Option */
/** @typedef {{ question: string, options: Option[], multiple: boolean }} Question */
/**
 * Where the user is on one question: the answers picked (by their place), their own words and
 * whether they count, and whether the question was skipped.
 * @typedef {{ chosen: number[], own: string, writing: boolean, skipped: boolean }} Answer
 */

// At most this many questions at once, and this many answers to pick from in each.
export const MAX_QUESTIONS = 5
export const MAX_OPTIONS = 6

/** @param {unknown} value */
const text = (value) => (typeof value === 'string' ? value.trim() : '')

/** A list, or the JSON of one, as small brains sometimes send it. @param {unknown} value @returns {unknown[]} */
function list(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return [] }
  }
  return Array.isArray(value) ? value : []
}

/**
 * The questions asked, without what can't be shown: empty ones, answers without words, and more
 * than the card holds. A lone `{ question }`, as helpers asked before D143, is one question.
 * A single choice recommends one answer at most.
 * @param {any} args @returns {Question[]}
 */
export function questionsOf(args) {
  const asked = args?.questions === undefined && args?.question !== undefined ? [args] : list(args?.questions)
  return asked.flatMap((item) => {
    const question = text(typeof item === 'string' ? item : /** @type {any} */ (item)?.question)
    if (!question) return []
    const multiple = /** @type {any} */ (item)?.multiple === true
    let recommended = false
    const options = list(/** @type {any} */ (item)?.options).flatMap((option) => {
      const label = text(typeof option === 'string' ? option : /** @type {any} */ (option)?.label)
      if (!label) return []
      const wanted = /** @type {any} */ (option)?.recommended === true && (multiple || !recommended)
      recommended ||= wanted
      return [{ label, description: text(/** @type {any} */ (option)?.description), recommended: wanted }]
    }).slice(0, MAX_OPTIONS)
    return [{ question, options, multiple }]
  }).slice(0, MAX_QUESTIONS)
}

/** How a question starts: what the brain recommends is picked; without answers to pick, the user's words are the answer. @param {Question} question @returns {Answer} */
export const start = (question) => ({
  chosen: question.options.flatMap((option, i) => (option.recommended ? [i] : [])),
  own: '',
  writing: !question.options.length,
  skipped: false,
})

/** Whether there is an answer to send: something picked, or words written. @param {Answer} answer */
export const answered = (answer) => answer.chosen.length > 0 || (answer.writing && answer.own.trim() !== '')

/**
 * The answers, as the brain reads them: for each question, what the user chose (one answer, or
 * a list when several can be), the words they wrote, or that they skipped it.
 * @param {Question[]} questions @param {Answer[]} answers
 */
export function reply(questions, answers) {
  return JSON.stringify({
    answers: questions.map((question, i) => {
      const answer = answers[i] ?? start(question)
      const chose = question.options.filter((_, j) => answer.chosen.includes(j)).map((option) => option.label)
      const wrote = answer.writing ? answer.own.trim() : ''
      if (answer.skipped || (!chose.length && !wrote)) return { question: question.question, skipped: true }
      return { question: question.question, ...(chose.length && { chose: question.multiple ? chose : chose[0] }), ...(wrote && { wrote }) }
    }),
  })
}
