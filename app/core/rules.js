// Do it / Ask me first / Never — per kind of action.
/** @import { RuleValue, ToolKind } from './types.js' */

/** Kinds shown in settings, in display order. */
export const RULE_KINDS = /** @type {const} */ (['read', 'edit', 'search', 'execute', 'fetch', 'move', 'delete', 'other'])

/** @type {Record<string, RuleValue>} */
export const DEFAULT_RULES = {
  read: 'allow',
  edit: 'allow',
  search: 'allow',
  execute: 'allow',
  think: 'allow',
  fetch: 'ask',
  move: 'ask',
  delete: 'ask',
  switch_mode: 'ask',
  other: 'ask',
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

/**
 * The rule an approval answer writes, if any.
 * @param {'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'} option
 * @returns {RuleValue | null}
 */
export function ruleFromPermission(option) {
  if (option === 'allow_always') return 'allow'
  if (option === 'reject_always') return 'never'
  return null
}
