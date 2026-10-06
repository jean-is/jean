// Questions for the user (D146): when Jean, or one of its helpers, needs the user's choices to go
// on, it asks them all at once with `ask_user`, and the card waits in the decision inbox, under
// the answer being written (D99). One question at a time: the answers to pick from, the one Jean
// recommends picked already, and room for the user's own words. Skip leaves a question
// unanswered, Back returns to the one before, and the last one sends every answer back to the
// brain as JSON. Always there, like the inbox (product.md), and loaded with the first message, so
// the brain can ask from the start without weighing on the first screen.
import { html, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { register, isDenied } from '../../ui/caps.js'
import { askUser } from '../../ui/send.js'
import { icons } from '../../ui/icons.js'
import { t, useStrings } from '../../core/i18n.js'
import { MAX_QUESTIONS, MAX_OPTIONS, questionsOf, start, answered, reply } from './answers.js'
import { styleSheet } from '../../ui/sheet.js'

/** @typedef {import('./answers.js').Answer} Answer */
/** @typedef {Extract<import('../../ui/state.js').Decision, { questions: unknown }>} Questions */

await Promise.all([useStrings('ask'), styleSheet(new URL('ask.css', import.meta.url))])

/**
 * The questions, in the inbox, answered one after the other. Where the user is stays with the
 * card, so it survives the answer being redrawn around it.
 */
class Ask extends Element {
  /** @type {Questions} */
  decision = /** @type {any} */ (null)
  #step = signal(0)
  #answers = signal(/** @type {Answer[]} */ ([]))
  /** Moved to another question: its first answer gets the focus, so the keyboard carries on there. */
  #moved = false

  connectedCallback() {
    if (!this.#answers.peek().length) this.#answers.value = this.decision.questions.map(start)
    super.connectedCallback()
  }

  render() {
    const { questions, from, resolve } = this.decision
    const step = this.#step.value
    const answers = this.#answers.value
    const question = questions[step]
    const answer = answers[step]
    const last = step === questions.length - 1
    const input = question.multiple ? 'checkbox' : 'radio'
    /** @param {Partial<Answer>} patch */
    const set = (patch) => answers.map((other, i) => (i === step ? { ...other, ...patch } : other))
    // Changing an answer un-skips its question.
    const change = (/** @type {Partial<Answer>} */ patch) => { this.#answers.value = set({ ...patch, skipped: false }) }
    /** Next, or Skip: the last question sends every answer. @param {boolean} skipped */
    const go = (skipped) => {
      if (last) return resolve(set({ skipped }))
      this.#answers.value = set({ skipped })
      this.#moved = true
      this.#step.value = step + 1
    }
    const back = () => {
      this.#moved = true
      this.#step.value = step - 1
    }
    /** @param {number} i */
    const pick = (i) => change({ chosen: question.multiple ? (answer.chosen.includes(i) ? answer.chosen.filter((j) => j !== i) : [...answer.chosen, i]) : [i], ...(!question.multiple && { writing: false }) })
    const write = () => change(question.multiple ? { writing: !answer.writing } : { chosen: [], writing: true })
    /** Typing picks "something else": alone when one answer is chosen, beside the others when several can be. @param {Event} event */
    const typed = (event) => {
      const own = /** @type {HTMLInputElement} */ (event.target).value
      change({ own, ...(own.trim() && { writing: true, ...(!question.multiple && { chosen: [] }) }) })
    }
    /** @param {SubmitEvent} event */
    const submit = (event) => {
      event.preventDefault()
      if (answered(answer)) go(false)
    }
    // Enter never sends while an IME is composing.
    const composing = (/** @type {KeyboardEvent} */ event) => event.key === 'Enter' && (event.isComposing || event.keyCode === 229) && event.preventDefault()
    return html`<form class="approval ask" aria-label=${t('tool.ask_user', { count: questions.length })} @submit=${submit}>
      ${from ? html`<p class="approval-from">${icons.helpers}<span dir="auto">${from}</span></p>` : nothing}
      ${questions.length > 1 ? html`<p class="ask-progress">
        <span class="ask-pips" aria-hidden="true">${answers.map((other, i) => html`<i data-state=${i === step ? 'current' : i > step ? 'ahead' : other.skipped ? 'skipped' : 'answered'}></i>`)}</span>
        <span>${t('ask.step', { n: step + 1, count: questions.length })}</span>
      </p>` : nothing}
      ${repeat([step], (i) => i, () => html`<fieldset class="ask-field">
        <legend class="ask-question" dir="auto">${question.question}</legend>
        ${question.options.length ? html`<ul class="ask-options">
          ${question.options.map((option, i) => html`<li><label class="choice-option">
            <input type=${input} name="answer" .checked=${live(answer.chosen.includes(i))} @change=${() => pick(i)}>
            <span><span dir="auto">${option.label}</span>${option.description ? html`<small dir="auto">${option.description}</small>` : nothing}</span>
            ${option.recommended ? html`<em class="ask-recommended">${t('ask.recommended')}</em>` : nothing}
          </label></li>`)}
          <li class="choice-option ask-own">
            <input type=${input} name="answer" aria-label=${t('ask.own')} .checked=${live(answer.writing)} @change=${write}>
            <input class="ask-own-text" dir="auto" autocomplete="off" placeholder=${t('ask.own')} aria-label=${t('ask.own')}
              .value=${live(answer.own)} @input=${typed} @keydown=${composing}>
          </li>
        </ul>` : html`<input class="ask-own-text" name="answer" dir="auto" autocomplete="off" aria-label=${t('inbox.answer')}
          .value=${live(answer.own)} @input=${typed} @keydown=${composing}>`}
      </fieldset>`)}
      <div class="approval-actions">
        <button class="button primary" ?disabled=${!answered(answer)}>${t(last ? 'action.send' : 'ask.next')}</button>
        <button class="button" type="button" @click=${() => go(true)}>${t('ask.skip')}</button>
        ${step ? html`<button class="button subtle" type="button" @click=${back}>${t('ask.back')}</button>` : nothing}
      </div>
    </form>`
  }

  updated() {
    if (!this.#moved) return
    this.#moved = false
    const field = this.querySelector('.ask-field')
    const first = /** @type {HTMLInputElement | null | undefined} */ (field?.querySelector('input:checked') ?? field?.querySelector('input'))
    first?.focus()
  }
}
define('app-ask', Ask)

/**
 * The tool: Jean's own, declared in every conversation, or a helper's, which says which part it
 * works on (D98).
 * @param {string} [from] @returns {import('../../core/loop.js').Tool}
 */
export const askTool = (from) => ({
  spec: {
    name: 'ask_user',
    description: "Ask the user questions and wait for their answers, when you can't do the task well without them. Ask everything you need at once, in their language, each question short. Give a few likely answers to pick from, and mark the one you recommend; the user can always answer in their own words, or skip. Returns JSON: for each question, what the user chose, what they wrote, or that they skipped it (then do your best, and say what you assumed).",
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'array', minItems: 1, maxItems: MAX_QUESTIONS,
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              options: {
                type: 'array', maxItems: MAX_OPTIONS,
                items: {
                  type: 'object',
                  properties: { label: { type: 'string', description: 'A few words' }, description: { type: 'string', description: 'What it means, if that isn’t obvious' }, recommended: { type: 'boolean' } },
                  required: ['label'],
                },
              },
              multiple: { type: 'boolean', description: 'Whether several answers can be chosen' },
            },
            required: ['question'],
          },
        },
      },
      required: ['questions'],
    },
  },
  kind: 'think',
  // A helper's is added to its own turn, never declared in the conversation.
  ...(from !== undefined && { hidden: true }),
  title: (args) => questionsOf(args).map((item) => item.question).join(' · '),
  run: async (args, ctx) => {
    const questions = questionsOf(args)
    if (!questions.length) throw new Error('Give at least one question, with its text.')
    const answers = await askUser(questions, from, ctx.signal)
    return answers ? reply(questions, answers) : 'The user did not answer. Do your best, and say what you assumed.'
  },
})

// Helpers import the tool too: an organisation that turned questions off still gets none from Jean.
if (!isDenied('ask')) {
  register({
    id: 'ask',
    tools: [askTool()],
    lines: [{ name: 'ask_user', line: 'ask the user questions, with answers to pick from' }],
    rules: ['Ask with ask_user only what you need, all at once, recommending an answer to each.'],
  })
}
