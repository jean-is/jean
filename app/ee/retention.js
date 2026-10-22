// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Retention (D412): policy's `retention` ("P6M") keeps each task's records, and so their certificates, at
// least that long. Jean asks `remove` before anything leaves a task for good; this keeps a copy first
// (kept.js), refuses when none could be made, and refuses a profile's removal, whose tasks this profile
// can't read. Settings › Your data says so. Each start lets go of the copies kept their period.
import { html } from 'lit-html'
import { register } from '../ui/caps.js'
import { app } from '../ui/state.js'
import { t, useStrings, intlLocales } from '../core/i18n.js'
import { period, keep, purge } from './kept.js'

/** @param {unknown} retention policy's */
export async function start(retention) {
  const span = period(retention)
  await useStrings('enterprise')
  const duration = () => new Intl.DurationFormat(intlLocales(), { style: 'long' }).format(span)
  register({
    id: 'retention',
    hooks: [{ on: 'remove', tier: 'policy', run: async (e, next) => {
      if (e.profile) return { refuse: t('retention.profile', { duration: duration() }) }
      try {
        await keep(app.fs, e, { keep: span, by: app.deviceId })
      } catch (error) {
        console.warn('Retention', error)
        return { refuse: t('retention.failed') }
      }
      return next(e)
    } }],
    slots: { data: { at: 2, draw: () => html`<section><h3>${t('retention.title')}</h3><p class="muted">${t('retention.text', { duration: duration() })}</p></section>` } },
  })
  purge(app.fs, { keep: span }).catch((error) => console.warn('Retention', error))
}
