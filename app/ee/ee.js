// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// ee/'s one door (D139): caps/enterprise loads it when policy holds a key, or on localhost. Before a profile or
// settings read policy, groups() checks the key and gives policy as it is for the person signed in (D429), its
// brains those its places allow (D434); then start() checks the key, and turns on what policy asks for: the audit
// export (D386), retention (D412), and the organisation's seal (D434). trust() gives the check page and
// check_certificate what the organisation's anchors say of a certificate (D434), the EU's trusted lists' too (D439).
import { checkKey } from './key.js'

/** @param {Record<string, any>} policy @returns {Promise<Record<string, any>>} throws when the key doesn't unlock this version here, or the groups' sections can't be applied */
export async function groups(policy) {
  await checkKey(policy.key, { origin: location.origin })
  const theirs = policy.groups ? await (await import('./groups.js')).resolve(policy) : policy
  return theirs.jurisdictions ? (await import('./places.js')).kept(/** @type {any} */ (theirs)) : theirs
}

/** @param {Record<string, any>} policy @returns {Promise<void>} throws when the key doesn't unlock this version here, or a section is wrong */
export async function start(policy) {
  await checkKey(policy.key, { origin: location.origin })
  if (policy.groups) await (await import('./groups.js')).start()
  if (policy.jurisdictions !== undefined) await (await import('./residency.js')).start(policy)
  if (policy.trust !== undefined) (await import('./trust.js')).anchorsOf(policy.trust)
  if (policy.seal !== undefined) await (await import('./authority.js')).start((await import('./est.js')).checked(policy))
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
  if (policy.jurisdictions !== undefined) (await import('./places.js')).check(policy)
  if (policy.trust !== undefined) (await import('./trust.js')).anchorsOf(policy.trust)
  if (policy.seal !== undefined) (await import('./est.js')).checked(policy)
  if (policy.audit?.otlpEndpoint) await (await import('./person.js')).check(policy.audit)
  if (policy.retention !== undefined) (await import('./kept.js')).period(policy.retention)
  return key
}

/**
 * What the organisation's anchors say of a sealed certificate (D434): whether one of its authorities vouches for
 * the key that sealed it, shown unrevoked then. Its trusted lists (D439) come through the gateway policy names, kept
 * in Jean's files when given; where one that may hold the seal's authority couldn't be read, nothing is said rather
 * than that none vouches. Throws when the key doesn't unlock this version here, or the anchors aren't certificates.
 * @param {Record<string, any>} policy @param {import('../core/types.js').FS} [fs]
 * @returns {Promise<(sealed: import('./trust.js').Sealed, at: Date) => Promise<import('./trust.js').Verdict | undefined>>}
 */
export async function trust(policy, fs) {
  await checkKey(policy.key, { origin: location.origin })
  const { anchorsOf, listsOf, territoriesOf, verdict } = await import('./trust.js')
  const anchors = anchorsOf(policy.trust)
  const lists = listsOf(policy.trust)
  return async (sealed, at) => {
    const listed = lists.length ? await (await import('./listed.js')).anchorsFor(lists, territoriesOf(sealed), at, { fs, gateway: policy.urls?.gateway }) : { anchors: [], unread: false }
    const said = await verdict(sealed, [...anchors, ...listed.anchors], at)
    return said.status === 'untrusted' && listed.unread ? undefined : said
  }
}
