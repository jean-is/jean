// SPDX-FileCopyrightText: 2026 WAREHOUSE SAS
// SPDX-License-Identifier: Elastic-2.0

// Policy by group (D429): policy's `groups` lists sections, each for a group or an app role of the organisation's
// directory, by the value the sign-in's ID token gives it (`groups` and `roles`: an Entra group's object id, an
// app role's value, a group's name in Okta or Keycloak). For each the person is in, in policy's order, its
// `policy` goes over the organisation's as a JSON Merge Patch (RFC 7386): objects merge, anything else takes the
// place of what was there, and null takes it away, so a section lifts a lock as well as setting one. What signs
// in, the key and the sections themselves are no group's. Host-agnostic, tested under node --test.

/** @typedef {{ id: string, name?: string, policy: Record<string, unknown> }} Section */

/** Policy's parts no section holds: they say who signs in, and so whose sections apply. */
export const OWN = ['signIn', 'key', 'groups']

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** `given` over `target`, as RFC 7386 has it, `target` left as it was. @param {unknown} target @param {unknown} given @returns {unknown} */
export function patch(target, given) {
  if (!isObject(given)) return given
  const out = isObject(target) ? { ...target } : {}
  for (const [name, value] of Object.entries(given)) {
    if (value === null) delete out[name]
    else out[name] = patch(out[name], value)
  }
  return out
}

/** Policy's sections, as forPerson() reads them; throws, saying why. @param {Record<string, any>} policy @returns {Section[]} */
export function check({ signIn, groups }) {
  if (!Array.isArray(groups)) throw new Error('policy.json’s groups is a list of sections, each with an id and a policy')
  if (!signIn) throw new Error('policy.json’s groups need signIn: the organisation’s sign-in says which groups the person is in')
  groups.forEach((section, i) => {
    if (typeof section?.id !== 'string' || !isObject(section.policy)) throw new Error(`policy.json’s groups[${i}] needs an id, the group’s or the role’s as the sign-in gives it, and a policy`)
    if (section.name !== undefined && typeof section.name !== 'string') throw new Error(`policy.json’s groups[${i}].name is text, what Settings calls the group`)
    const own = OWN.find((name) => Object.hasOwn(section.policy, name))
    if (own) throw new Error(`policy.json’s groups[${i}].policy holds ${own}, which only policy itself can`)
  })
  return groups
}

/**
 * The sections of the groups someone is in, in policy's order. @param {Record<string, any>} policy
 * @param {string[] | null} groups the sign-in's; null when it had more than its token holds @returns {Section[]}
 */
export function theirs(policy, groups) {
  const sections = check(policy)
  if (groups === null) throw new Error('The sign-in had more groups than its ID token holds, so Jean can’t tell which of policy’s sections are this person’s: have it name only the groups assigned to Jean’s app (in Entra, “Groups assigned to the application”)', { cause: 'many' })
  return sections.filter((section) => groups.includes(section.id))
}

/** Policy as it is for someone in these groups: each of their sections over it. @param {Record<string, any>} policy @param {string[] | null} groups */
export const forPerson = (policy, groups) => theirs(policy, groups).reduce((so, section) => /** @type {Record<string, any>} */ (patch(so, section.policy)), policy)
