// The one module outside ee/ that loads it (D139): only when policy holds a key, or on localhost,
// where none is needed, and ee/ checks the key itself. A policy that asks for what ee/ does
// (`audit`, D386; `retention`, D412; `groups`, D429) with no key, a key that doesn't unlock this version, or ee/ gone, stops Jean
// with a message for IT before anything shows: its rules are never dropped silently, and taking
// those sections out of policy gives back the open version.
import { html, render } from 'lit-html'
import { BRAND } from '../../brand.js'
import { t, useStrings, locale, dir } from '../../core/i18n.js'
import { styleSheet } from '../../ui/sheet.js'

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/

/**
 * Policy as it is for the person signed in, the sections of the directory's groups they are in over it (D429), before a
 * profile or settings read it: back from the organisation's sign-in first, its tokens kept with the groups it gives.
 * What fails leaves policy as it was, and start() stops Jean, once the room's language is known.
 */
export async function groups() {
  const { app } = await import('../../ui/state.js')
  if (app.policy.signIn) await import('../signin/signin.js').then((signin) => signin.back()).catch(() => {})
  if (app.policy.key || LOCAL.test(location.hostname)) app.policy = await import('../../ee/ee.js').then((ee) => ee.groups(app.policy)).catch(() => app.policy)
}

/** @returns {Promise<void>} never, once Jean stops */
export async function start() {
  const { policy } = (await import('../../ui/state.js')).app
  try {
    if (!policy.key && !LOCAL.test(location.hostname)) throw new Error('policy.json holds no key')
    await (await import('../../ee/ee.js')).start(policy)
    // Kept for offline use with ee/, as a capability's files are.
    try { navigator.serviceWorker?.controller?.postMessage({ type: 'CACHE_CAPABILITY', id: 'enterprise' }) } catch {}
  } catch (error) {
    console.error('Enterprise features', error)
    if (!policy.audit && policy.retention === undefined && !policy.groups) return
    await Promise.all([useStrings('enterprise'), styleSheet(new URL('../lock/lock.css', import.meta.url))])
    Object.assign(document.documentElement, { lang: locale.value, dir: dir(locale.value) })
    render(html`<h1 class="wordmark">${BRAND.name}</h1><p class="muted">${t(/** @type {Error} */ (error).cause === 'many' ? 'groups.many' : 'enterprise.stopped')}</p>`, document.body.appendChild(Object.assign(document.createElement('main'), { className: 'lock' })))
    return new Promise(() => {})
  }
}

/**
 * What policy.html says of ee/'s part of a policy (D415): whom the key unlocks this version for here, and
 * until when; throws, saying why, when it doesn't, a section is wrong, or ee/ is gone.
 * @param {Record<string, any>} policy @returns {Promise<{ organisation: string, until: number, trial: boolean }>}
 */
export const check = async (policy) => (await import('../../ee/ee.js')).check(policy)
