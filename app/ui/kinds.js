// SPDX-License-Identifier: MIT
// What kinds of work a stretch did (ui/steps.js, test/flow.test.js), for the glyphs on its line.
/** @import { ToolCallInfo } from '../core/types.js' */

/** How many calls of each kind a stretch made, a move or a deletion being a change, the brain's own searches counted, and whether one failed. @param {ToolCallInfo[]} work */
export function counts(work) {
  const found = new Map(['read', 'execute', 'search', 'fetch', 'edit'].map((kind) => [kind, { kind, count: 0, failed: false }]))
  for (const entry of work) {
    const own = entry.name ? 0 : (entry._meta?.raw ?? []).filter((/** @type {any} */ block) => block.type === 'server_tool_use' && block.name === 'web_search').length
    const one = entry.name || own ? found.get(own ? 'search' : entry.kind === 'delete' || entry.kind === 'move' ? 'edit' : entry.kind ?? '') : undefined
    if (!one) continue
    one.count += own || 1
    one.failed ||= entry.status === 'failed'
  }
  return [...found.values()].filter((one) => one.count)
}
