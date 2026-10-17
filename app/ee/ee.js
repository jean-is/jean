// SPDX-FileCopyrightText: 2026 WAREHOUSE SAS
// SPDX-License-Identifier: Elastic-2.0

// ee/'s one door (D139): caps/enterprise loads it when policy holds a key, or on localhost, and
// start() checks the key, then turns on what policy asks for: today, the audit export (D386).
import { checkKey } from './key.js'

/** @param {Record<string, any>} policy @returns {Promise<void>} throws when the key doesn't unlock this version here */
export async function start(policy) {
  await checkKey(policy.key, { origin: location.origin })
  if (policy.audit?.otlpEndpoint) await (await import('./audit.js')).start(policy.audit)
}
