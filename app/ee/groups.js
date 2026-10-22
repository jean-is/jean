// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Policy by group (D429): at each start, before a profile or settings read policy, the sections of the directory's
// groups and roles the person is in, as the organisation's sign-in last gave them (D385), go over it (sections.js).
// A renewal keeps the groups it is given, for the next start. What fails stops Jean once the room's language is
// known; otherwise Settings › Brains says whose sections apply, by the names policy gives them.
import { html, nothing } from 'lit-html'
import { register } from '../ui/caps.js'
import { app } from '../ui/state.js'
import { getSecret } from '../ui/secrets.js'
import { t, useStrings, intlLocales } from '../core/i18n.js'
import { theirs, forPerson } from './sections.js'

/** The names of the sections that apply. @type {string[]} */
let named = []
/** Why they weren't applied, for start() to stop Jean with: until resolve() has, that it hasn't. @type {unknown} */
let failed = new Error('The groups’ sections weren’t applied before policy was read')

/** Policy as it is for the person signed in here. @param {Record<string, any>} policy @returns {Promise<Record<string, any>>} */
export async function resolve(policy) {
  try {
    // None kept is none; null, more than the sign-in's token held.
    const { groups = [] } = JSON.parse(await getSecret(app.fs, 'signin') ?? '{}')
    named = theirs(policy, groups).flatMap((section) => section.name ?? [])
    const theirPolicy = forPerson(policy, groups)
    failed = null
    return theirPolicy
  } catch (error) {
    throw (failed = error)
  }
}

/** Once the room's language is known: Jean stops if the sections couldn't be applied, and Settings says whose apply. */
export async function start() {
  if (failed) throw failed
  await useStrings('enterprise')
  register({ id: 'groups', slots: { brains: { at: 1, draw: () => (named.length ? html`<p class="muted">${t('groups.text', { groups: new Intl.ListFormat(intlLocales()).format(named) })}</p>` : nothing) } } })
}
