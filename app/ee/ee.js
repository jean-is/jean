// SPDX-FileCopyrightText: 2026 WAREHOUSE SAS
// SPDX-License-Identifier: Elastic-2.0

// ee/'s one door (D139): caps/enterprise loads it when policy holds a key, or on localhost, and
// start() checks the key, then turns on what policy asks for: the audit export (D386) and retention (D412).
import { checkKey } from './key.js'

/** @param {Record<string, any>} policy @returns {Promise<void>} throws when the key doesn't unlock this version here, or a section is wrong */
export async function start(policy) {
  await checkKey(policy.key, { origin: location.origin })
  if (policy.audit?.otlpEndpoint) await (await import('./audit.js')).start(policy.audit)
  if (policy.retention !== undefined) await (await import('./retention.js')).start(policy.retention)
}

/**
 * What policy.html shows of a policy's part here (D415): the key's verdict, and each section read as start()
 * reads it, nothing started; throws, saying why, at the first that fails. @param {Record<string, any>} policy
 */
export async function check(policy) {
  const key = await checkKey(policy.key, { origin: location.origin })
  if (policy.retention !== undefined) (await import('./kept.js')).period(policy.retention)
  return key
}
