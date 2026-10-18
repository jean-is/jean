// A yes-or-no question about a text, a file or an action: answered on the device by Intuition when
// it is on (a yes at 0.6, D67), else by the room's brain in a word, a step of its own outside any
// conversation. What sets a routine off asks it (D294), and so do guards (D295).
import { loaded, contributions } from './caps.js'
import { app, activeBrain } from './state.js'
import { getSecret } from './secrets.js'
import { fire } from '../core/hooks.js'

/** @param {string} question @param {string} text @returns {Promise<boolean>} rejects when there is no one to ask */
export async function yes(question, text) {
  const decide = loaded.peek().get('reflexes')?.decide
  if (decide) {
    const { answer } = await decide(text, { answer: { type: 'noul', instructions: question } })
    return answer?.type === 'noul' && answer.noul >= 0.6
  }
  const brain = activeBrain.peek()
  if (!brain) throw new Error('No brain to ask')
  const [{ streamChat }, apiKey] = await Promise.all([import('../core/llm.js'), getSecret(app.fs, brain.id)])
  const asked = { brain, system: 'Answer the question about what follows with yes or no, in English, and nothing else.', messages: [{ role: 'user', content: `${question}\n\n<about>\n${text}\n</about>` }], tools: [], maxTokens: 400, effort: /** @type {const} */ ('low') }
  let reply = ''
  for await (const event of await fire(contributions().hooks, 'turn.step', asked, (e) => streamChat({ ...e, apiKey: apiKey ?? undefined }))) if (event.type === 'text') reply += event.delta
  return /^\W*yes\b/i.test(reply)
}
