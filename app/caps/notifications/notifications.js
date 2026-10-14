// Notifications (D334): a task done, or waiting on an approval or questions, while the user is in another
// tab or app, the browser says so, with the task's title and never its answer; a click brings Jean back
// on it, and coming back takes away those still shown. Offered the first time a task is done while the
// user was away, as they return: accepting is the click the browser needs before it asks. Its switch is
// in Settings › General.
import { html } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal, effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, updateSettings, turnPage, openConversation } from '../../ui/state.js'
import { away } from '../../ui/discovery.js'
import { hashFor } from '../../ui/router.js'
import { BRAND } from '../../brand.js'
import { t, useStrings, locale, dir } from '../../core/i18n.js'

await useStrings('notifications')

/** What the browser allows this site, drawn again once the user answers it. */
const allowed = signal(Notification.permission)
const ask = () => Notification.requestPermission().then((answer) => { allowed.value = answer })
// Turned on by a click, the offer's or its trophy's: the browser asks while the click still counts.
if (allowed.value === 'default' && navigator.userActivation?.isActive) ask()

/** Whether a task done out of sight is told: the browser allows it, and the user didn't turn it off. */
const on = () => allowed.value === 'granted' && app.settings.value.notifications !== false

/** @type {Set<Notification>} */
const shown = new Set()
addEventListener('focus', () => { for (const item of shown) item.close() })

/** @param {string} task @param {string} body what it is at */
function tell(task, body) {
  const summary = app.conversations.peek().find((item) => item.path === task)
  const title = summary?.title || BRAND.name
  const options = { body, tag: task, lang: locale.peek(), dir: dir(), icon: 'icons/icon-192.png', data: { hash: hashFor(app.project.peek(), summary?.id ?? null) } }
  try {
    const item = new Notification(title, options)
    shown.add(item)
    item.onclose = () => shown.delete(item)
    item.onclick = () => { focus(); item.close(); turnPage(() => openConversation(task)) }
  } catch {
    // Android's browsers show one only through the service worker, which brings Jean back on a tap (sw.js).
    navigator.serviceWorker?.ready.then((registration) => registration.showNotification(title, options)).catch(console.warn)
  }
}

// A task that stops for the user, on an approval or questions in the inbox, is told once, as it starts
// waiting: tagged by the task as well, so what comes next there replaces it. Their ids only grow.
let last = 0
effect(() => app.decisions.value.filter(({ id }) => id > last).forEach(({ id, conversation }) => {
  last = id
  if (conversation && on() && away()) tell(conversation, t('notifications.waiting'))
}))

/** Its switch, among Settings' General ones. @param {{ setting: typeof import('../../ui/dialogs.js').setting }} props */
const draw = ({ setting }) => setting(t('cap.notifications.name'), t(allowed.value === 'denied' ? 'notifications.blocked' : 'notifications.text'),
  html`<input type="checkbox" class="switch" role="switch" aria-label=${t('cap.notifications.name')} .checked=${live(on())} ?disabled=${allowed.value === 'denied'}
    @change=${(/** @type {Event} */ e) => switched(/** @type {HTMLInputElement} */ (e.target).checked)}>`)

/** On, the browser asks first if it hasn't yet, in the click's own time. @param {boolean} checked */
function switched(checked) {
  if (checked && allowed.value !== 'granted') ask()
  updateSettings({ notifications: checked })
}

register({
  id: 'notifications',
  hooks: [{ on: 'turn.end', match: { aborted: false }, run: (e, next) => { if (e.answer && on() && away()) tell(e.task, t('notifications.done')); return next(e) } }],
  slots: { general: { at: 10, draw } },
})
