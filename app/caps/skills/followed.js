// How often each skill was followed, and when last, as Settings' Skills says it: read from the tasks' own records,
// so nothing is kept beside them. A skill is followed when its steps are read with `skill` (not a file beside them) or
// when the box names it (D199, the note D421 counts too). An answer marked Not right (D712) counts against the skills its turn
// followed. Host-agnostic: no DOM.
import { skillNamed } from '../../core/skills.js'

/** @typedef {Map<string, { count: number, at: string, missed?: number }>} Followed */

/**
 * Adds what these records followed to what earlier ones did. @param {{ at: string, update?: Record<string, any>, meta?: Record<string, any> }[]} records
 * @param {Followed} [seen] @returns {Followed}
 */
export function followed(records, seen = new Map()) {
  let recent = /** @type {string[]} */ ([])
  for (const { at, update, meta } of records) {
    if (update?.sessionUpdate === 'user_message_chunk') recent = []
    if (meta?.feedback?.value === 'bad') for (const name of recent) { const was = seen.get(name); if (was) was.missed = (was.missed ?? 0) + 1 }
    const read = update?.sessionUpdate === 'tool_call' && update.name === 'skill' ? skillNamed(String(update.rawInput?.name ?? '')) : ''
    const names = update?.sessionUpdate === '_system_note' && update.data?.kind === 'mentions' ? update.data.skills : read && !read.includes('/') ? [read] : []
    for (const name of names) {
      const was = seen.get(name)
      seen.set(name, { ...was, count: (was?.count ?? 0) + 1, at: was && was.at > at ? was.at : at })
      recent.push(name)
    }
  }
  return seen
}
