// Private · offline (D270): while the next message can only be answered by the brain in this browser
// tab, a legend in the box's bottom row (ui/composer.js has its element) says so and opens what that
// means, and the box is sealed. Offline, Auto answers here too (D70 · D269), and the legend says it still does.
import { html, svg, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { effective, activeBrain, brainsHere, cloudAllowed } from '../../ui/state.js'
import { icon, icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { isLocal } from '../../core/settings.js'
import { t, useStrings } from '../../core/i18n.js'

await Promise.all([useStrings('brain-local'), styleSheet(new URL('private.css', import.meta.url))])

const OFFLINE = icon(svg`<path d="M7.5 18.5h9.25a3.75 3.75 0 0 0 .5-7.47 5.25 5.25 0 0 0-10.1-1.03A4.25 4.25 0 0 0 7.5 18.5ZM4 4l16 16"/>`)

/** Whether the browser has a connection: false is sure, true only likely. */
const online = signal(navigator.onLine)
addEventListener('online', () => { online.value = true })
addEventListener('offline', () => { online.value = false })

/** Whether the next message can only be answered by the brain in this tab (ui/dialogs.js reads it too). */
export const onDevice = signal(false)

// Said only when true: the brain in this tab is here, and the next message can go nowhere else.
effect(() => {
  const brains = brainsHere.value
  onDevice.value = brains.some((brain) => brain.api === 'device') && (effective.value.settings.auto
    ? !online.value || !cloudAllowed() || brains.every(isLocal)
    : activeBrain.value?.api === 'device')
})

/** Opens the card by itself, once the brain in this tab is ready and Settings has closed (ui/dialogs.js). */
export const reveal = () => requestAnimationFrame(() => document.getElementById('private-card')?.showPopover())

/** Keeps a click in the card from reaching the box around it, which would take the keyboard. @param {Event} event */
const own = (event) => event.stopPropagation()

/** In the box's bottom row, beside its tools (ui/composer.js), while the box is sealed: private and offline, or still answering; a click opens the card. */
class Seal extends Element {
  render() {
    if (!onDevice.value) return nothing
    const away = !online.value
    return html`<button type="button" class="private-seal ${away ? 'is-away' : ''}" popovertarget="private-card">${icons.shield}<span>${t(away ? 'private.away' : 'private.name')}</span></button>
      <div id="private-card" class="private-card" popover @mousedown=${own} @click=${own}>
        <div class="private-head"><span class="private-mark">${icons.shield}</span><h2>${t('private.title')}</h2></div>
        <p>${t('private.text')}</p>
        <ul class="private-facts">
          <li>${icons['brain-device']}<span>${t('private.private')}</span></li>
          <li>${icons.key}<span>${t('private.free')}</span></li>
          <li>${OFFLINE}<span>${t('private.offline')}</span></li>
        </ul>
        <p class="private-now">${t(away ? 'private.still' : 'private.try')}</p>
        <p class="private-proof">${t('private.proof')}</p>
      </div>`
  }
}

define('app-seal', Seal)
