// Do it / Ask me first / Never — per kind of action.
/** @import { RuleValue, ToolKind } from './types.js' */

/** Kinds shown in settings, in display order. */
export const RULE_KINDS = /** @type {const} */ (['read', 'edit', 'search', 'execute', 'fetch', 'move', 'delete', 'other'])

/** @type {Record<string, RuleValue>} */
export const DEFAULT_RULES = {
  read: 'allow', edit: 'allow', search: 'allow', execute: 'allow', think: 'allow',
  fetch: 'ask', move: 'ask', delete: 'ask', switch_mode: 'ask', other: 'ask', plan: 'ask',
}

/**
 * Policy (locked) wins, then reserved actions (passwords, payments) are never
 * done by Jean, then project, then user, then defaults.
 * @param {ToolKind | string} kind
 * @param {{ user?: Record<string, RuleValue>, project?: Record<string, RuleValue>, policy?: Record<string, RuleValue>, reserved?: boolean }} [layers]
 * @returns {RuleValue}
 */
export function resolveRule(kind, { user = {}, project = {}, policy = {}, reserved = false } = {}) {
  if (policy[kind]) return policy[kind]
  if (reserved) return 'never'
  return project[kind] ?? user[kind] ?? DEFAULT_RULES[kind] ?? 'ask'
}

/** The rule an approval answer writes, if any. @param {'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'} option @returns {RuleValue | null} */
export const ruleFromPermission = (option) => (option === 'allow_always' ? 'allow' : option === 'reject_always' ? 'never' : null)

/** How careful each decision is: a hook makes Jean more careful freely, never less for a reserved action (D293). */
export const STRICT = /** @type {Record<RuleValue, number>} */ ({ allow: 0, ask: 1, never: 2 })

/**
 * Guards (D295): the person's or the organisation's rules for one kind of action or one service (a
 * connection's id), made tool.check hooks. Each only ever makes Jean more careful, asking first or
 * never doing it, and, with a question, only when the answer about the call is yes; a question that
 * can't be answered counts as yes. Asked, a guarded call keeps the guard ("Always allow" sets no rule).
 * @typedef {{ id: string, kind?: string, service?: string, if?: string, then: 'ask' | 'never', reason?: string }} Guard
 * @param {Guard[]} guards @param {'policy' | 'user'} tier
 * @param {(question: string, text: string, task?: string) => Promise<boolean>} yes asks a question about a text, in a task: its call's (D440)
 * @returns {import('./hooks.js').Hook[]}
 */
export const guardHooks = (guards, tier, yes) => guards.filter((guard) => (guard.kind || guard.service) && STRICT[guard.then] > 0).map((guard) => ({
  on: 'tool.check', tier, by: guard.id,
  match: { ...(guard.kind && { kind: guard.kind }), ...(guard.service && { service: guard.service }) },
  run: async (/** @type {any} */ e, /** @type {(e: any) => Promise<any>} */ next) => {
    const said = await next(e)
    if (said?.refuse || STRICT[/** @type {RuleValue} */ (said?.decision)] >= STRICT[guard.then]) return said
    if (guard.if && !(await yes(guard.if, `${e.title}\n${JSON.stringify(e.args ?? {}).slice(0, 2000)}`, e.task).catch(() => true))) return said
    return guard.then === 'ask' ? { decision: 'ask', meta: { guard: guard.id } }
      : { decision: 'never', reason: guard.reason ?? (tier === 'policy' ? "The organisation's rules refuse this action." : "The user's rules refuse this action.") }
  },
}))
