// SPDX-FileCopyrightText: 2026 WAREHOUSE SAS
// SPDX-License-Identifier: Elastic-2.0

// Data residency (D434): with policy's `jurisdictions`, its brains are those its places allow (places.js), left so
// before settings read policy. At the start, a policy that wasn't, or whose places Jean can't read, stops Jean with
// a message for IT; otherwise Settings › Brains says where requests to brains stay.
import { html } from 'lit-html'
import { register } from '../ui/caps.js'
import { t, useStrings, locale } from '../core/i18n.js'
import { check } from './places.js'

/** A place's name in the room's language, a country's or the EU's, else its code (a subdivision's). @param {string} code */
function placeName(code) {
  try {
    return new Intl.DisplayNames(locale.value, { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** @param {Record<string, any>} policy as it is here, its brains those its places allow */
export async function start(policy) {
  const places = check(policy)
  await useStrings('enterprise')
  register({ id: 'residency', slots: { brains: { at: 2, draw: () => html`<p class="muted">${t('residency.text', { places: new Intl.ListFormat(locale.value).format(places.map(placeName)) })}</p>` } } })
}
