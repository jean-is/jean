// What Jean cost over time (D691): each request to a brain that a task's records keep, what it read and wrote, priced as each
// answer's card prices it (D252), at today's prices; by month, by brain, and the tasks that cost most. Pure, so node --test runs it.

/** @typedef {{ month: string, provider: string, model: string, local: boolean, input: number, output: number, cached: number }} Use */
/** @typedef {{ cost: number, unknown: boolean }} Sum a sum of prices, `unknown` once one of them wasn't known */

/**
 * Each request to a brain a task's records hold, once (out of steps, its entry is kept again), its helpers' and summaries' too,
 * by the month it was made in on this device's calendar; one that failed read and wrote nothing.
 * @param {import('../../core/types.js').Envelope[]} records @returns {Use[]}
 */
export function usesOf(records) {
  const by = /** @type {Map<string, Use>} */ (new Map())
  for (const { at, update } of records) {
    const usage = update?.sessionUpdate === 'tool_call' && update.kind === 'think' && update.rawInput?.provider ? /** @type {any} */ (update.rawOutput)?.usage : null
    if (!usage || update?.sessionUpdate !== 'tool_call') continue
    const when = new Date(at), input = /** @type {any} */ (update.rawInput)
    by.set(update.toolCallId, { month: `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`, provider: input.provider, model: input.model ?? '', local: input.local === true,
      input: usage.inputTokens ?? 0, output: usage.outputTokens ?? 0, cached: usage.cacheReadTokens ?? 0 })
  }
  return [...by.values()]
}

/**
 * What it cost: each month's, the latest first; each brain's, the costliest first; and the five tasks that cost most.
 * @param {{ path: string, title: string, dir?: string, uses: Use[] }[]} tasks @param {(use: Use) => number | null} cost a request's, null when its price isn't known
 */
export function tally(tasks, cost) {
  const months = /** @type {Map<string, Sum & { month: string }>} */ (new Map()), brains = /** @type {Map<string, Sum & { provider: string, model: string, local: boolean }>} */ (new Map())
  /** @template {Sum} T @param {Map<string, T>} map @param {string} key @param {number | null} price @param {Omit<T, keyof Sum>} what */
  const add = (map, key, price, what) => { const one = map.get(key) ?? /** @type {T} */ ({ ...what, cost: 0, unknown: false }); if (price === null) one.unknown = true; else one.cost += price; map.set(key, one) }
  const costly = /** @type {{ path: string, title: string, dir?: string, cost: number }[]} */ ([])
  for (const { path, title, dir, uses } of tasks) {
    let own = 0
    for (const use of uses) {
      const price = cost(use)
      add(months, use.month, price, { month: use.month })
      add(brains, `${use.provider} ${use.model}`, price, { provider: use.provider, model: use.model, local: use.local })
      own += price ?? 0
    }
    if (own > 0) costly.push({ path, title, dir, cost: own })
  }
  return { months: [...months.values()].sort((a, b) => (a.month < b.month ? 1 : -1)), brains: [...brains.values()].sort((a, b) => b.cost - a.cost), costly: costly.sort((a, b) => b.cost - a.cost).slice(0, 5) }
}
