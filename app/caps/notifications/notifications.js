// Notifications (D334): a task done, or waiting on an approval or questions, while the user is in another
// tab or app, the browser says so, with the task's title and never its answer; a click brings Jean back
// on it, and coming back takes away those still shown. Offered the first time a task is done while the
// user was away, as they return: accepting is the click the browser needs before it asks. Its switch is
// in Settings › General.
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal, effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, updateSettings, turnPage, openConversation } from '../../ui/state.js'
import { away } from '../../ui/discovery.js'
import { hashFor } from '../../ui/router.js'
import { icons } from '../../ui/menu-icons.js'
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

/** @param {string} task '' for Settings' test @param {string} body what it is at */
function tell(task, body) {
  const summary = app.conversations.peek().find((item) => item.path === task)
  const title = summary?.title || BRAND.name
  const options = { body, tag: task || 'test', lang: locale.peek(), dir: dir(), icon: 'icons/icon-192.png', data: { hash: hashFor(app.project.peek(), summary?.id ?? null) } }
  try {
    const item = new Notification(title, options)
    shown.add(item)
    item.onclose = () => shown.delete(item)
    item.onclick = () => { focus(); item.close(); if (task) turnPage(() => openConversation(task)) }
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

/** Its row in Settings' General, under While you're away (D525): Send a test while on, a word when the browser blocks them, its switch. */
const draw = () => html`<li><span class="item-icon">${icons.bell}</span><span class="item-text"><strong>${t('cap.notifications.name')}</strong>
  <small>${t(allowed.value === 'denied' ? 'notifications.blocked' : 'notifications.text')}</small></span>
  ${allowed.value === 'denied' ? html`<span class="data-state is-wait">${t('notifications.denied')}</span>`
    : on() ? html`<button type="button" class="button subtle" @click=${() => tell('', t('notifications.tested'))}>${t('notifications.test')}</button>` : nothing}
  <input type="checkbox" class="switch" role="switch" aria-label=${t('cap.notifications.name')} .checked=${live(on())} ?disabled=${allowed.value === 'denied'}
    @change=${(/** @type {Event} */ e) => switched(/** @type {HTMLInputElement} */ (e.target).checked)}></li>`

/** On, the browser asks first if it hasn't yet, in the click's own time. @param {boolean} checked */
function switched(checked) {
  if (checked && allowed.value !== 'granted') ask()
  updateSettings({ notifications: checked })
}

register({
  id: 'notifications',
  hooks: [{ on: 'turn.end', match: { aborted: false }, run: (e, next) => { if ((e.answer || e.stopped) && on() && away()) tell(e.task, t(e.stopped ? 'notifications.waiting' : 'notifications.done')); return next(e) } }],
  slots: { general: { id: 'notifications', at: 10, group: 'away', draw } },
})
