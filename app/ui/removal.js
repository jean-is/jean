// Records leaving for good (D412), Jean's one protocol for it: a task deleted, alone or with its project, records
// going back to a request leaves out, a profile removed. Beside its one user, ui/send.js, and pure, so node --test runs it.
import { fire } from '../core/hooks.js'

/**
 * Records leaving for good (D412): each removal is asked on `remove` in turn, with its records (`read` when it holds none), and
 * the first refusal stops them all. Once none refused, `act` removes them, and only then is each told on `record`, as `removed`,
 * to hooks that only watch it (D299), so none hears of what stayed. Nothing listening, nothing is read.
 * @param {import('../core/hooks.js').Hook[]} hooks @param {{ task?: string, records?: import('../core/types.js').Envelope[], all?: boolean, profile?: string }[]} removals
 * @param {() => Promise<unknown>} act @param {(task: string) => Promise<import('../core/types.js').Envelope[]>} read
 * @returns {Promise<string | undefined>} why, when one was refused
 */
export async function removal(hooks, removals, act, read) {
  const asked = []
  for (const e of hooks.some((hook) => hook.on === 'remove' || hook.on === 'record') ? removals : []) {
    const records = e.records ?? (e.task ? await read(e.task) : [])
    const refuse = (await fire(hooks, 'remove', { ...e, records }, () => ({})))?.refuse
    if (refuse) return refuse
    asked.push({ ...e, records })
  }
  await act()
  for (const e of asked) fire(hooks, 'record', { ...e, type: 'removed' }, () => {})
}
