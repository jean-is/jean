// SPDX-License-Identifier: MIT
// Allow for this task (D710): per task, by kind and scope (a folder, a site, a service), how often an approval was allowed
// once, or that it holds for the rest of the task, until the page reloads. Offered from the second card of a kind, never on
// a guard's card (D295, D673) nor in a child's profile. Loaded with the first approval card.
import { app } from './state.js'

/** @type {Map<string, Map<string, number | true>>} */
const granted = new Map()

/**
 * Where a card stands for its task: whether it is let through unasked, whether For this task is offered, and what keeps the answer.
 * @param {import('../core/types.js').ToolCallInfo} toolCall @param {string} conversation @param {string} scope
 */
export function standing(toolCall, conversation, scope) {
  const keyOf = (/** @type {import('../core/types.js').ToolCallInfo} */ call) => `${call.kind}|${scope}:${call._meta?.[scope] ?? ''}`
  const [mine, key] = [granted.get(conversation) ?? new Map(), keyOf(toolCall)]
  return {
    through: scope !== 'guard' && mine.get(key) === true,
    offered: scope !== 'guard' && !app.policy.child && Boolean(mine.get(key)),
    /** @param {string} answer */
    keep(answer) {
      if (answer === 'allow_task' || answer === 'allow_once') granted.set(conversation, mine.set(key, answer === 'allow_task' || Number(mine.get(key) ?? 0) + 1))
      if (answer === 'allow_task') for (const other of app.decisions.value) if ('toolCall' in other && other.conversation === conversation && keyOf(other.toolCall) === key) other.resolve('allow_once')
    },
  }
}
