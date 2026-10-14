// The first brain (D329): what the first message, or the chip, opens while there is none, in place of Settings ›
// Brains. One way first, free, and beside it the device's brain where it can run, downloaded while
// the cloud's answers; then two doors, to the plan or key the user already has and to a choice of
// what matters. Never offered: its strings and look come with it, once, before any brain (D97).
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { unlock } from '../../ui/caps.js'
import { app, effective, updateSettings, notify } from '../../ui/state.js'
import { startOpenRouter } from '../../ui/brains.js'
import { syncDialog, closed, backdrop, head, openSettings, ways, fit, progressOf, checkDevice, useDevice } from '../../ui/dialogs.js'
import { ulid } from '../../core/ulid.js'
import { BRAND } from '../../brand.js'
import { t, formatBytes, useStrings } from '../../core/i18n.js'
import { icons } from '../../ui/icons.js'
import { styleSheet } from '../../ui/sheet.js'

await Promise.all([useStrings('first'), styleSheet(new URL('first.css', import.meta.url))])

/** The screen shown: the first, the choice of what matters, or the plans and keys. */
const screen = signal(/** @type {'start' | 'choose' | 'plans'} */ ('start'))
/** Whether the device's brain comes too, and what matters, as chosen. */
const also = signal(false)
const choice = signal(/** @type {'private' | 'now' | 'best'} */ ('now'))

/** Before any brain, this; with brains kept to other projects, or set by policy, Settings › Brains. */
export function open() {
  if (effective.value.settings.brains.length || effective.value.locked.has('brains')) return openSettings('brains')
  screen.value = 'start'
  checkDevice()
  app.dialog.value = 'first'
}

/** Back from OpenRouter's sign-in with the device's brain asked for: it comes while the cloud's answers, and Auto has both. */
export async function alsoPrivate() {
  sessionStorage.removeItem('app.private')
  const module = await unlock('brain-local') && await import('../brain-local/brain-local.js')
  if (!module || !(await module.checkDevice()).ok) return
  notify(t('first.downloading', { size: formatBytes(module.GEMMA.bytes) }))
  await module.prepare().then(() => updateSettings({ brains: [...app.settings.value.brains, { id: ulid(), provider: 'device', api: 'device', baseURL: '', model: module.GEMMA.model }] }))
    .then(() => notify(t('brain.device.ready')), (error) => console.warn('On-device brain', error))
}

/** @param {'start' | 'choose' | 'plans'} to */
const go = (to) => () => { screen.value = to }
/** A door to another screen. @param {'choose' | 'plans'} to */
const door = (to) => html`<li><button class="item" @click=${go(to)}><span class="item-text"><strong>${t(`first.${to}`)}</strong><small>${t(`first.${to}Text`)}</small></span>${icons.arrow}</button></li>`
const back = () => html`<button class="button subtle first-back" @click=${go('start')}>${icons.arrow}${t('first.back')}</button>`

function start() {
  const device = fit()
  return html`${head(t('first.title'))}<p class="lede">${t('first.text', { name: BRAND.name })}</p>
    <button class="button primary first-free" @click=${() => { if (also.value) sessionStorage.setItem('app.private', '1'); startOpenRouter() }}>${t('first.free')} ${icons.arrow}</button>
    <p class="hint first-where">${t('first.freeText')}</p>
    ${device ? html`<label class="first-also"><input type="checkbox" .checked=${also.value} @change=${(/** @type {Event} */ e) => { also.value = /** @type {HTMLInputElement} */ (e.target).checked }}>
      <span class="item-text"><strong>${t('first.also')}</strong><small>${t('first.alsoText', { size: formatBytes(device.GEMMA.bytes) })}</small></span></label>` : nothing}
    <ul class="list first-doors">${door('plans')}${door('choose')}</ul>
    <p class="hint">${t('first.neutral', { name: BRAND.name })}</p>`
}

/** What matters: private, where the device can, at once, or the best; the button says what each does. */
function choose() {
  const device = fit(), size = device ? formatBytes(device.GEMMA.bytes) : ''
  const act = () => (choice.value === 'private' ? useDevice() : choice.value === 'now' ? startOpenRouter() : go('plans')())
  return html`${back()}${head(t('first.matters'))}
    <div class="list brains" role="radiogroup" aria-label=${t('first.matters')}>${(/** @type {const} */ (['private', 'now', 'best'])).map((id) => html`<div class=${choice.value === id ? 'is-selected' : ''}><label class="item">
      <input type="radio" name="first" .checked=${choice.value === id} ?disabled=${id === 'private' && !device} @change=${() => { choice.value = id }}>
      <span class="item-text"><strong>${t(`first.${id}`)}</strong><small>${id === 'private' && !device ? t('first.privateNo') : t(`first.${id}Text`, { size })}</small></span></label></div>`)}</div>
    ${device?.download.value.state === 'failed' ? html`<p class="status is-error" role="alert">${t('brain.device.failed')}</p>` : nothing}
    ${(choice.value === 'private' && device && progressOf(device)) || html`<div class="row"><button class="button primary" @click=${act}>
      ${t(choice.value === 'private' ? 'brain.device.action' : choice.value === 'now' ? 'first.free' : 'first.next', { size })}</button></div>`}`
}

/** The plans and keys the user already has, and a brain of their own computer's, as Settings › Brains offers them. */
const plans = () => html`${back()}${head(t('first.plansTitle'))}${ways(false, false)}<p class="hint">${t('first.names', { name: BRAND.name })}</p>`

define('app-first', class extends Element {
  render() {
    return html`<dialog class="sheet first" aria-label=${t('first.title')} @close=${closed('first')} @click=${backdrop}>
      ${screen.value === 'start' ? start() : screen.value === 'choose' ? choose() : plans()}</dialog>`
  }

  updated() { syncDialog(this, 'first') }
})
