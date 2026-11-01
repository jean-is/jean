// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Data-loss checks on the device (D674, detect.js): policy's `dlp` made hooks, in the room's words. A step refused opens the
// picker, as a brain may be chosen that the organisation allows; Settings › Your data says what is checked, and the audit
// export hears which detector found something, as a span of its own, never what it found.
import { html } from 'lit-html'
import { register } from '../ui/caps.js'
import { act } from '../ui/acts.js'
import { notify } from '../ui/state.js'
import { LLMError } from '../core/llm.js'
import { isLocal } from '../core/settings.js'
import { t, useStrings, intlLocales } from '../core/i18n.js'
import { checked, dlpHooks } from './detect.js'

/** @param {Record<string, any>} policy */
export async function start(policy) {
  const dlp = checked(policy.dlp, policy)
  await useStrings('enterprise')
  if (dlp.mask) await (await import('./masking.js')).start(dlp)
  const list = (/** @type {string[]} */ names) => new Intl.ListFormat(intlLocales()).format([...new Set(names)])
  /** A detector's name: Jean's, in the room's language, or as policy calls its own. @param {string} id */
  const nameOf = (id) => {
    const own = dlp.detect?.find((one) => typeof one === 'object' && one.id === id)
    if (typeof own === 'object') return own.name ?? own.id
    return id === 'card' || id === 'iban' ? t('dlp.bank') : id === 'nir' || id === 'ssn' ? t('dlp.social') : id === 'secret' ? t('dlp.secret') : t('dlp.label')
  }
  const brains = () => list((dlp.brains ?? []).map((id) => policy.brains?.find((/** @type {any} */ brain) => brain.id === id)?.label ?? id))
  register({
    id: 'dlp',
    hooks: dlpHooks(dlp, {
      isLocal,
      told: (found, where) => act('dlp.found', { detectors: found, where }),
      why: (found) => t('dlp.call', { what: list(found.map(nameOf)) }),
      reason: (found) => `The organisation's rules refuse sending this out: it holds ${found.join(', ')}.`,
      async* refused(found) {
        notify(t('dlp.brain', { what: list(found.map(nameOf)), brains: brains() }))
        ;(await import('../ui/picker.js')).openPicker()
        throw new LLMError(`This task holds ${found.join(', ')}, which the organisation lets only some brains read.`, { code: 'aborted' })
      },
    }),
    slots: {
      by: { at: 0, draw: (/** @type {{ by?: string }} */ { by }) => (by === 'dlp' ? t('activity.by.policy') : '') },
      organization: { at: 3, draw: () => html`<section><h3>${t('dlp.title')}</h3><p class="muted">${t('dlp.text', { what: list([...(dlp.detect ?? []).map((one) => nameOf(typeof one === 'string' ? one : one.id)), ...dlp.labels?.length ? [t('dlp.label')] : []]) })}</p></section>` },
    },
  })
}
