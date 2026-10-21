// Hooks: what Jean does passes through named events that code can watch, change or answer in Jean's
// place, as Claude Code's hooks and mods do. The hooks on an event make a chain, the outermost tier
// first: each calls next(e), with the event or a changed copy of it (never the event changed), and the
// last next reaches Jean's own behaviour; one that returns without calling it answers the event. A
// hook that fails is passed over, unless it is a guard that fails closed. Standard APIs only, so it
// runs wherever core does (docs/architecture.md, "Events and slots").

/** Outermost first: the organisation's, then the person's apps, then Jean's own capabilities. */
export const TIERS = /** @type {const} */ (['policy', 'user', 'jean'])

/**
 * @typedef {Object} Hook
 * @property {string} on                          the event, such as 'tool.check'
 * @property {(e: any, next: (e?: any) => Promise<any>) => any} run
 * @property {Record<string, unknown>} [match]    what the event must hold: a value, one of a list, or a pattern its text matches
 * @property {typeof TIERS[number]} [tier]        'jean' unless said
 * @property {string} [by]                        whose it is
 * @property {string} [refuse]                    a guard that fails closed: what it answers when it fails before going on
 */

/** @param {Record<string, unknown> | undefined} match @param {any} e */
const matches = (match, e) => Object.entries(match ?? {}).every(([key, want]) => (Array.isArray(want) ? want.includes(e?.[key])
  : want instanceof RegExp ? want.test(String(e?.[key] ?? '')) : e?.[key] === want))

/**
 * Runs an event through its hooks, then through Jean's behaviour, and gives back what came of it.
 * @param {Hook[]} hooks @param {string} name @param {any} input @param {(e: any) => any} behaviour @returns {Promise<any>}
 */
export async function fire(hooks, name, input, behaviour) {
  const chain = hooks.filter((hook) => hook.on === name && matches(hook.match, input))
    .sort((a, b) => TIERS.indexOf(a.tier ?? 'jean') - TIERS.indexOf(b.tier ?? 'jean'))
  /** @param {number} i @param {any} e @returns {Promise<any>} */
  const step = async (i, e) => {
    const hook = chain[i]
    if (!hook) return behaviour(e)
    /** @type {Promise<any> | undefined} */
    let went
    /** @type {any} what the rest of the chain gave it */
    let gave
    try {
      const result = await hook.run(e, (changed = e) => (went = step(i + 1, changed).then((value) => (gave = value))))
      // An answer of its own, not the one the chain gave it, says whose it is (D299).
      return hook.by && result?.constructor === Object && result !== gave ? { ...result, by: hook.by } : result
    } catch (error) {
      const failed = () => console.warn(`${hook.by ?? 'A hook'} on ${name}`, error)
      // Once it went on, what came back stands, and what failed further in is that failure, not this hook's.
      if (went) return went.then((result) => (failed(), result))
      failed()
      return hook.refuse ? { refuse: hook.refuse } : step(i + 1, e)
    }
  }
  return step(0, input)
}
