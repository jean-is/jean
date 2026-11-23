// SPDX-License-Identifier: MIT
// What Google's services bring in, for a brain whose provider's terms differ by plan (D440): whether the way it is reached never
// trains on it, checked when a task needs to know, and held for an hour. Claude Code's plan is read through This computer, a
// Gemini key's project found billed, unbilled or not known by asking for a model with no free tier (core/terms.js). It
// registers nothing: the box's choice of brain reads it as the connections do.

import { signal } from '@preact/signals-core'
import { checked } from '../../core/llm.js'
import { app } from '../../ui/state.js'
import { getSecret } from '../../ui/secrets.js'
import { loaded } from '../../ui/caps.js'

/** @import { BrainConfig } from '../../core/types.js' */

/** How long what a check found holds before it is asked again. */
const HOLDS_MS = 3_600_000
/** The checks under way, by brain id, so that one asked twice runs once. @type {Map<string, Promise<boolean>>} */
const asking = new Map()
/** One more each time a check ends, for what is drawn from them. */
export const rechecked = signal(0)
/** The brains whose last check told nothing, by id: Google out of reach, busy or refusing the key, which a refusal says. */
export const unsure = new Set()

/**
 * Whether a brain was found reached under terms that never train, checked now where none holds. Only Claude Code and Gemini's
 * keys are checked; any other brain is as its provider's terms or policy say. @param {BrainConfig} brain @returns {Promise<boolean>}
 */
export function checkTerms(brain) {
  if ((checked.get(brain.id) ?? 0) > Date.now()) return Promise.resolve(true)
  if (brain.provider !== 'claudecode' && brain.provider !== 'gemini') return Promise.resolve(false)
  const asked = asking.get(brain.id) ?? ask(brain).catch(() => null).then((found) => {
    asking.delete(brain.id)
    if (found) checked.set(brain.id, Date.now() + HOLDS_MS)
    unsure[found === null ? 'add' : 'delete'](brain.id)
    rechecked.value++
    return Boolean(found)
  })
  asking.set(brain.id, asked)
  return asked
}

/** Each brain the user has, checked, but one just found otherwise. @param {BrainConfig | false} [but] */
export const checkAll = (but) => Promise.all(app.settings.peek().brains.filter((brain) => !but || brain.id !== but.id).map(checkTerms))

/** What a check finds for one brain: Gemini's key asked, or Claude Code's sign-in read through This computer; null where nothing was. @param {BrainConfig} brain @returns {Promise<boolean | null>} */
async function ask(brain) {
  const { commercial, billed } = await import('../../core/terms.js')
  if (brain.provider === 'gemini') return billed({ baseURL: brain.baseURL, apiKey: (await getSecret(app.fs, brain.id)) ?? '', signal: AbortSignal.timeout(30_000) })
  const machine = loaded.peek().has('machine') ? await import('../machine/machine.js') : null
  return commercial((await machine?.plan('claudecode'))?.terms)
}
