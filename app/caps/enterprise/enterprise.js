// The one module outside ee/ that loads it (D139): only when policy holds a key, or on localhost,
// where none is needed, and ee/ checks the key itself. A policy that asks for what ee/ does
// (`audit`, D386; `retention`, D412) with no key, a key that doesn't unlock this version, or ee/ gone, stops Jean
// with a message for IT before anything shows: its rules are never dropped silently, and taking
// those sections out of policy gives back the open version.
import { html, render } from 'lit-html'
import { BRAND } from '../../brand.js'
import { t, useStrings, locale, dir } from '../../core/i18n.js'
import { app } from '../../ui/state.js'
import { styleSheet } from '../../ui/sheet.js'

/** @returns {Promise<void>} never, once Jean stops */
export async function start() {
  const { policy } = app
  try {
    if (!policy.key && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) throw new Error('policy.json holds no key')
    await (await import('../../ee/ee.js')).start(policy)
    // Kept for offline use with ee/, as a capability's files are.
    try { navigator.serviceWorker?.controller?.postMessage({ type: 'CACHE_CAPABILITY', id: 'enterprise' }) } catch {}
  } catch (error) {
    console.error('Enterprise features', error)
    if (!policy.audit && policy.retention === undefined) return
    await Promise.all([useStrings('enterprise'), styleSheet(new URL('../lock/lock.css', import.meta.url))])
    Object.assign(document.documentElement, { lang: locale.value, dir: dir(locale.value) })
    render(html`<h1 class="wordmark">${BRAND.name}</h1><p class="muted">${t('enterprise.stopped')}</p>`, document.body.appendChild(Object.assign(document.createElement('main'), { className: 'lock' })))
    return new Promise(() => {})
  }
}
