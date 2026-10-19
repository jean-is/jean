// SPDX-FileCopyrightText: 2026 WAREHOUSE SAS
// SPDX-License-Identifier: Elastic-2.0

// Data residency (D434): policy's `jurisdictions` lists where requests to brains may go, as ISO 3166 codes: a
// country (FR), a subdivision (US-CA), or EU for its member states. Jean then keeps the brains on this device or
// this computer, and those of policy's own whose `jurisdiction` is within one of them; it leaves out the others,
// before settings read policy, as it does a group's sections (D429). Policy's brains are the only ones, so none a
// person adds goes past it. Pure, so it is tested under node --test.
import { isLocal } from '../core/settings.js'

/** @import { BrainConfig } from '../core/types.js' */

/** The European Union's member states, which EU stands for. */
export const EU = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK']
const CODE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/

/** Whether a place is within one of those allowed: itself, its country, or the EU it is part of. @param {unknown} place @param {string[]} allowed */
export const within = (place, allowed) => typeof place === 'string' && CODE.test(place)
  && allowed.some((one) => place === one || place.startsWith(`${one}-`) || (one === 'EU' && EU.includes(place.slice(0, 2))))

/** The brains of a policy it leaves out: outside this device and this computer, and in none of its places. @param {{ brains?: BrainConfig[], jurisdictions: string[] }} policy */
export const outside = ({ brains = [], jurisdictions }) => brains.filter((brain) => !isLocal(brain) && !within(brain.jurisdiction, jurisdictions))

/** Policy with only the brains its places allow; one that names none is left so, for check() to say. @template {{ brains?: BrainConfig[], jurisdictions: string[] }} T @param {T} policy @returns {T} */
export const kept = (policy) => (policy.brains ? { ...policy, brains: policy.brains.filter((brain) => !outside(policy).includes(brain)) } : policy)

/**
 * Policy's places, read; throws, saying why, when they aren't codes, when policy names no brains of its own, or
 * when it names one they would leave out. @param {Record<string, any>} policy @returns {string[]}
 */
export function check(policy) {
  const { jurisdictions, brains } = policy
  if (!Array.isArray(jurisdictions) || !jurisdictions.length) throw new Error('policy.json’s jurisdictions is a list of ISO 3166 codes, such as ["FR", "DE"], or ["EU"] for its member states')
  const wrong = jurisdictions.find((one) => typeof one !== 'string' || !CODE.test(one))
  if (wrong !== undefined) throw new Error(`policy.json’s jurisdictions holds ${JSON.stringify(wrong)}, which isn’t an ISO 3166 code such as FR, US-CA or EU`)
  if (!Array.isArray(brains)) throw new Error('policy.json’s jurisdictions keep Jean to the brains policy names: list them in brains, each with its jurisdiction')
  const left = outside({ brains, jurisdictions }).map((brain) => `${brain.id} (${brain.jurisdiction ?? 'none'})`)
  if (left.length) throw new Error(`policy.json’s brains ${left.join(', ')} declare no jurisdiction within ${jurisdictions.join(', ')}, so Jean would leave them out`)
  return jurisdictions
}
