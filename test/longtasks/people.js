// The people around a task in npm run longtasks, each played by a brain: the person who asked, as τ-bench's simulated
// user (Yao et al. 2024), who answers Jean's questions and approvals from what they want, and changes their mind on cue;
// and the brain's plain answer to one request, which the judge and the translator use.
import { streamChat, LLMError } from '../../app/core/llm.js'
import { languageName } from '../../app/core/i18n.js'
import { start } from '../../app/caps/ask/answers.js'
import { jsonIn } from './score.js'

/** @import { Brain, User } from './jean.js' */
/** @import { Question, Answer } from '../../app/caps/ask/answers.js' */

/** Waits before asking again a brain that is busy or limited, as free ones often are. */
const WAITS = [5_000, 15_000, 30_000, 60_000, 120_000]

/**
 * A brain's answer to one request, no tools, asked again while it is busy or limited.
 * @param {Brain} chosen @param {string} system @param {string} text @param {{ maxTokens?: number }} [options]
 */
export async function say({ brain, apiKey, body, stream = streamChat }, system, text, { maxTokens = 4096 } = {}) {
  /** @type {typeof fetch} */
  const send = (url, init) => globalThis.fetch(url, body && typeof init?.body === 'string' ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...body }) } : init)
  for (let attempt = 0; ; attempt++) {
    try {
      let out = ''
      for await (const event of stream({ brain, apiKey, system, messages: [{ role: 'user', content: text }], tools: [], maxTokens, fetch: send })) if (event.type === 'text') out += event.delta
      return out.trim()
    } catch (error) {
      if (!(error instanceof LLMError && error.retryable) || attempt >= WAITS.length) throw error
      await new Promise((resolve) => setTimeout(resolve, Math.max(WAITS[attempt], error.retryAfter ?? 0)))
    }
  }
}

/**
 * Someone who asked for a task, played by a brain: they answer from what they want, which changes once `change.after`
 * brain steps are done; they send their change of mind while Jean works (`steer`) or, when they can't, once it answered.
 * @param {Brain} chosen @param {{ lang: string, request: string, goal: string, changed?: string, change?: string, after?: number, steer: boolean }} who
 * @returns {User & { done: number, said: { asked: number, approvals: number, declined: number } }}
 */
export function simulated(chosen, { lang, request, goal, changed, change, after = 2, steer }) {
  const language = languageName(lang, 'en')
  const said = { asked: 0, approvals: 0, declined: 0 }
  const person = /** @type {User & { done: number, said: typeof said }} */ ({
    done: 0,
    said,
    steer: change && steer ? { after, text: change } : null,
    then: change && !steer ? change : null,
    ask: async (questions) => {
      said.asked++
      const text = await say(chosen, mind(), `The assistant asks you:\n${JSON.stringify(questions.map(({ question, options, multiple }) => ({ question, options: options.map((option) => option.label), multiple })), null, 1)}\n\nAnswer each question as this person would. Reply with JSON only: {"answers": [{"choose": ["an option, word for word"]} or {"write": "your own words, in ${language}"}]}, one per question, in order.`)
      const answers = jsonIn(text)?.answers
      if (!Array.isArray(answers)) return questions.map(start)
      return questions.map((question, i) => {
        const answer = answers[i] ?? {}
        const chosen = [answer.choose ?? []].flat().map((label) => question.options.findIndex((option) => option.label === label)).filter((at) => at >= 0)
        return /** @type {Answer} */ ({ chosen, own: chosen.length ? '' : String(answer.write ?? ''), writing: !chosen.length, skipped: !chosen.length && !answer.write })
      })
    },
    approve: async (toolCall) => {
      said.approvals++
      const shown = (toolCall.content ?? []).map((part) => (part.type === 'diff' ? `Change to ${part.path}:\n--- before\n${String(part.oldText ?? '(a new file)').slice(0, 3000)}\n+++ after\n${part.newText.slice(0, 3000)}` : '')).join('\n')
      const text = await say(chosen, mind(), `The assistant asks your permission before it does this: ${toolCall.title}\n${shown || JSON.stringify(toolCall.rawInput ?? {}).slice(0, 3000)}\n\nShould it? Answer with one word, yes or no. Say no only if it goes against what you want now.`, { maxTokens: 512 })
      const no = /^\W*(no|non)\b/i.test(text)
      if (no) said.declined++
      return no ? 'reject_once' : 'allow_once'
    },
  })
  /** Who they are, and what they want at this point. */
  const mind = () => [
    `You play a person who asked an assistant on their computer for some work. You are not technical. You write in ${language}, briefly.`,
    `What you asked: ${request}`,
    `What you want: ${goal}`,
    ...(changed && person.done >= after ? [`You changed your mind since: ${changed}`] : []),
  ].join('\n')
  return person
}
