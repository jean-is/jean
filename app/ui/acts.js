// What the person did, or Jean did for them, outside a task's records, told once it is done (D421): a skill,
// a connection, a routine or a link added or removed, an answer or a task taken away. Hooks only watch `act`,
// as they do `record` (D299), and nothing waits on them; the audit export makes a span of each (ee/, D386).
import { fire } from '../core/hooks.js'
import { contributions } from './caps.js'

/**
 * @param {string} type what was done to what, `skill.add`
 * @param {{ task?: string, path?: string, address?: string, title?: string } & Record<string, unknown>} e what it was about: the task
 *   it was done in, the file of what it was done to, the host it reached (never a whole address, which may hold a key), its title
 */
export const act = (type, e) => void fire(contributions().hooks, 'act', { ...e, type }, () => {})
