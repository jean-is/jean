// What each app decided lately, as its page in Settings says it (D535): read from the tasks' own records, a call an
// app's hook refused, asked about or let go ahead keeping whose answer it was (_meta.by, _meta.decision, D299), so
// nothing is kept beside them. Host-agnostic: no DOM.

/** @typedef {Map<string, Map<string, { count: number, at: string }>>} Decided by an app's name, its decisions: how many, and the last when */

/**
 * Adds what apps decided in these records, from a time on, to what earlier ones did; a call kept twice counts once.
 * @param {{ at: string, update?: Record<string, any> }[]} records @param {string} since @param {Decided} [seen] @returns {Decided}
 */
export function decided(records, since, seen = new Map()) {
  const calls = new Set()
  for (const { at, update } of records) {
    const { by, decision } = update?._meta ?? {}
    if (!by || !decision || at < since || calls.has(update?.toolCallId)) continue
    calls.add(update?.toolCallId)
    const its = seen.get(by) ?? new Map()
    const was = its.get(decision)
    seen.set(by, its.set(decision, { count: (was?.count ?? 0) + 1, at: was && was.at > at ? was.at : at }))
  }
  return seen
}
