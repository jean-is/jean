// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// ee/'s one door (D139): caps/enterprise loads it when policy holds a key, or on localhost. Before a profile or
// settings read policy, groups() checks the key and gives policy as it is for the person signed in (D429); then
// start() checks the key, and turns on what policy asks for: the audit export (D386) and retention (D412).
import { checkKey } from './key.js'

/** @param {Record<string, any>} policy @returns {Promise<Record<string, any>>} throws when the key doesn't unlock this version here, or the groups' sections can't be applied */
export async function groups(policy) {
  await checkKey(policy.key, { origin: location.origin })
  return (await import('./groups.js')).resolve(policy)
}

/** @param {Record<string, any>} policy @returns {Promise<void>} throws when the key doesn't unlock this version here, or a section is wrong */
export async function start(policy) {
  await checkKey(policy.key, { origin: location.origin })
  if (policy.groups) await (await import('./groups.js')).start()
  if (policy.audit?.otlpEndpoint) await (await import('./audit.js')).start(policy.audit)
  if (policy.retention !== undefined) await (await import('./retention.js')).start(policy.retention)
}

/**
 * What policy.html shows of a policy's part here (D415): the key's verdict, and each section read as start()
 * reads it, nothing started; throws, saying why, at the first that fails. @param {Record<string, any>} policy
 */
export async function check(policy) {
  const key = await checkKey(policy.key, { origin: location.origin })
  if (policy.groups) (await import('./sections.js')).check(policy)
  if (policy.audit?.otlpEndpoint) await (await import('./person.js')).check(policy.audit)
  if (policy.retention !== undefined) (await import('./kept.js')).period(policy.retention)
  return key
}
