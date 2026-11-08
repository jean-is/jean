// Your devices (D700), a page of Settings › Your data: this device first, then the others, each with when it was added and Remove, asked
// in a dialog that also erases Jean there; Add a device, its steps shown in its place (the link and its QR code, the wait, the lock, the six
// digits the new device shows, done); and a link from another device, pasted here or opened, joined in the same place once the person
// chooses Join, its six digits shown to type there, then what came and from where, opened only on Join again. Loaded the first time it shows.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { notify } from '../../ui/state.js'
import { pageOpen } from '../../ui/dialogs.js'
import { handheld } from '../../ui/model.js'
import { codeOf } from '../../ui/qr.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { t, tParts, intlLocales } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { adding, joining, devices, own, start, passed, confirm, cancel, join, trusted, removeDevice } from './devices.js'

/** @typedef {import('./flow.js').Device} Device */
/** What a step shows, its buttons, and what it says as it comes, or what went wrong. @typedef {{ body?: unknown, buttons?: unknown, said?: string, wrong?: string }} Step */

await styleSheet(new URL('devices.css', import.meta.url))

/**
 * The device Remove was pressed on, whether Jean is erased from it, while it goes, once gone the keys it may hold, by where each was made,
 * and the devices that took nothing yet, or that the removal failed.
 */
const removing = signal(/** @type {{ device: Device, erase: boolean, busy?: boolean, left?: string[], unreached?: string[], refused?: boolean } | null} */ (null))
/** The lock's ways in, loaded when adding asks for them. */
const lock = signal(/** @type {typeof import('../lock/lock.js') | null} */ (null))

/** Where the other device has its own Your devices: Capabilities turns it on there first, or opens it. */
const place = () => [t('settings.title'), t('settings.capabilities'), t('cap.devices.name')].join(' › ')
/** A link for the other device, to copy. @param {string} link */
const field = (link) => html`<div class="devices-field"><input readonly dir="ltr" title=${t('devices.link')} .value=${link} @focus=${(/** @type {Event} */ e) => /** @type {HTMLInputElement} */ (e.target).select()}>
  <button class="button" @click=${() => navigator.clipboard.writeText(link).then(() => notify(t('toast.copied')))}>${icons.copy} ${t('devices.copy')}</button></div>`
/** @param {...unknown} buttons */
const row = (...buttons) => html`<div class="row devices-actions">${buttons}</div>`
const quit = (/** @type {string} */ label = 'devices.cancel') => html`<button class="button subtle" @click=${cancel}>${t(label)}</button>`
/** Enter while an IME composes ends the word, never sends. @param {KeyboardEvent} e */
const composing = (e) => { if (e.isComposing && e.key === 'Enter') e.preventDefault() }
/** A name a person or a device gave, set apart in a sentence of Jean's, whichever way it reads. @param {string} name */
const named = (name) => html`<bdi>${name}</bdi>`
/** @param {() => unknown} act */
const joinButton = (act) => html`<button class="button primary" @click=${act}>${t('devices.join')}</button>`

/** The six digits typed on this device: wrong, selected to type again. @param {SubmitEvent} event */
async function typed(event) {
  event.preventDefault()
  const input = /** @type {HTMLInputElement} */ (/** @type {HTMLFormElement} */ (event.target).elements.namedItem('code'))
  if (!(await confirm(input.value))) input.select()
}

/** The step under way, adding on this device or joining another, or none. @returns {Step | null} */
function step() {
  const [a, b, name] = [adding.value, joining.value, BRAND.name]
  if (b.step === 'home') return { body: html`<h3 tabindex="-1">${t('devices.homeTitle', { name })}</h3><p>${t('devices.homeText', { name })}</p><p>${t('devices.homePaste', { place: place() })}</p>${field(b.link)}`,
    buttons: row(html`<button class="button" @click=${() => { joining.value = { step: 'ask', link: b.link } }}>${t('devices.inSafari')}</button>`, quit()) }
  if (b.step === 'ask') return { body: html`<p>${t('devices.coming', { name })}</p>`, buttons: row(joinButton(() => join(b.link)), quit()) }
  if (b.step === 'waiting') return { body: html`<p>${t('devices.coming', { name })}</p>`, said: t('devices.joining'), buttons: row(quit()) }
  if (b.step === 'code') return { body: html`<h3 tabindex="-1">${t('devices.typeThere')}</h3><p class="devices-digits" dir="ltr">${b.code.slice(0, 3)} ${b.code.slice(3)}</p>`, buttons: row(quit()) }
  // One span in the heading, which lays out what it holds side by side, so the sentence wraps as one.
  if (b.step === 'trust') return { body: html`<h3 tabindex="-1"><span>${tParts('devices.trust', { profile: named(b.profile), device: named(b.device) })}</span></h3>`, buttons: row(joinButton(trusted), quit()) }
  if (b.step === 'adopting' || b.step === 'done') return { said: t(b.step === 'done' ? 'devices.joined' : 'devices.adopting', { name }) }
  if (b.step === 'failed') return { wrong: t(`devices.why.${b.reason}`, { name }), buttons: row(quit('devices.close')) }
  if (a.step === 'waiting') {
    const code = a.address ? codeOf(a.link) : null
    return { body: html`<h3 tabindex="-1">${t('devices.open')}</h3>
      ${code ? html`<svg class="devices-qr" role="img" aria-label=${t('devices.qr')} viewBox="-4 -4 ${code.size + 8} ${code.size + 8}"><path d=${code.d}/></svg>` : nothing}
      <p>${a.address ? t('devices.point') : t('devices.pasteThere', { name, place: place() })}</p>${field(a.link)}`, said: t('devices.waiting'),
    buttons: row(handheld() && 'share' in navigator ? html`<button class="button" @click=${() => navigator.share({ url: a.link }).catch(() => {})}>${icons.share} ${t('devices.share')}</button>` : nothing, quit()) }
  }
  if (a.step === 'lock') return { body: html`<h3 tabindex="-1">${t('devices.unlock', { device: a.name })}</h3>${lock.value?.ways(passed) ?? (import('../lock/lock.js').then((module) => { lock.value = module }), nothing)}`, buttons: row(quit()) }
  if (a.step === 'code') return { body: html`<form class="stack" @submit=${typed}><label for="devices-code">${t('devices.typeCode', { device: a.name })}</label>
      <input id="devices-code" class="devices-type" name="code" inputmode="numeric" autocomplete="one-time-code" spellcheck="false" dir="ltr" required aria-describedby="devices-wrong devices-hint" @keydown=${composing}>
      <p class="hint" id="devices-hint">${t('devices.codeHint')}</p><div class="row"><button class="button primary">${t('devices.confirm')}</button></div></form>`,
    wrong: a.left < 3 ? t('devices.wrong', { count: a.left }) : '', buttons: row(quit()) }
  // Until the new device says it opened what came, which waits on the person there.
  if (a.step === 'sending') return { said: t('devices.sending', { device: a.name }), buttons: row(quit()) }
  if (a.step === 'done') return { said: t('devices.done', { device: a.name }), buttons: row(quit('devices.ok')) }
  if (a.step === 'failed') return { wrong: t(`devices.why.${a.reason}`, { name }), buttons: row(html`<button class="button" @click=${start}>${t('devices.again')}</button>`, quit('devices.close')) }
  return null
}

/** At rest: the devices, this one first, Add a device, and the field a link from another is pasted in. */
function rest() {
  const date = new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'medium' })
  const list = [...devices.value].sort((x, y) => Number(y.id === own.value) - Number(x.id === own.value))
  return html`${list.length ? html`<ul class="list">${list.map((one) => html`<li><span class="item-text"><strong dir="auto">${one.name}</strong>
      <small>${t(one.id === own.value ? 'devices.here' : 'devices.added', { date: date.format(new Date(one.createdAt)) })}</small></span>
      ${one.id === own.value ? nothing : html`<button class="button subtle danger" @click=${() => ask(one)}>${t('action.remove')}</button>`}</li>`)}</ul>` : nothing}
    <div class="row"><button id="devices-add" class="button primary" @click=${start}>${icons.plus} ${t('devices.add')}</button></div>
    <section><form class="stack" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); join(String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get('link'))) }}>
      <label for="devices-link">${t('devices.paste')}</label>
      <div class="devices-field"><input id="devices-link" name="link" required autocomplete="off" spellcheck="false" dir="ltr" aria-describedby="devices-pasted" @keydown=${composing}><button class="button">${t('devices.join')}</button></div>
      <p class="hint" id="devices-pasted">${t('devices.pasteHint', { name: BRAND.name })}</p></form></section>`
}

// ─── Removing one ────────────────────────────────────────────────────────────

const dialog = () => /** @type {HTMLDialogElement | null} */ (document.querySelector('dialog.devices-remove'))
/** Remove, asked in a dialog over the page, erasing Jean there ticked. @param {Device} device */
function ask(device) {
  removing.value = { device, erase: true }
  requestAnimationFrame(() => dialog()?.showModal())
}
/**
 * Removed, then what it may still hold and the devices that took nothing yet, the keyboard on Done; or, when it failed, said so, and the
 * keyboard back on Remove, to try again.
 */
async function remove() {
  const one = removing.peek()
  if (!one || one.busy) return
  removing.value = { ...one, busy: true, refused: false }
  const done = await removeDevice(one.device.id, { erase: one.erase }).catch((error) => { console.warn('Devices', error); return null })
  const left = done?.left
  if (!removing.peek()) return
  removing.value = done ? { ...one, ...done, refused: false } : { ...one, refused: true }
  requestAnimationFrame(() => /** @type {HTMLElement | null | undefined} */ (dialog()?.querySelector(left ? '.dialog-foot .primary' : '.dialog-foot .danger'))?.focus())
}
/** The dialog closed: the keyboard back on Add a device when what opened it went with the device. */
function closed() {
  removing.value = null
  requestAnimationFrame(() => { if (document.activeElement === document.body) document.getElementById('devices-add')?.focus() })
}

function asking() {
  const one = removing.value
  if (!one) return nothing
  const { device, erase, busy, left, unreached = [], refused } = one
  return html`<dialog class="sheet devices-remove" aria-labelledby="devices-remove" @close=${closed} @keydown=${(/** @type {KeyboardEvent} */ e) => e.key === 'Escape' && e.stopPropagation()}>
    <header class="dialog-head"><h2 id="devices-remove">${tParts('devices.remove', { device: named(device.name) })}</h2>
      <button class="icon-button" aria-label=${t('action.close')} @click=${() => dialog()?.close()}>${icons.close}</button></header>
    <div class="stack" role="status">${left ? html`<p>${tParts('devices.removed', { device: named(device.name) })}</p>${erase && !unreached.includes(device.name) ? html`<p>${t('devices.erasing', { name: BRAND.name })}</p>` : nothing}
      ${left.length ? html`<p>${t('devices.revoke')}</p><ul>${left.map((label) => html`<li dir="auto">${label}</li>`)}</ul>` : nothing}` : nothing}</div>
    <p class="devices-wrong" role="alert">${refused ? t('devices.why.relay') : unreached.map((name) => html`${tParts('devices.notYet', { device: named(name) })} `)}</p>
    ${left ? nothing : html`<p>${t('devices.removeText')}</p><label class="row" for="devices-erase"><input id="devices-erase" type="checkbox" .checked=${erase}
      @change=${(/** @type {Event} */ e) => { removing.value = { ...one, erase: /** @type {HTMLInputElement} */ (e.target).checked } }}>${t('devices.erase', { name: BRAND.name })}</label>`}
    <footer class="dialog-foot">${left ? html`<button class="button primary" @click=${() => dialog()?.close()}>${t('devices.ok')}</button>`
      : html`<button class="button subtle" @click=${() => dialog()?.close()}>${t('devices.cancel')}</button><button class="button danger" ?disabled=${busy} @click=${remove}>${t('action.remove')}</button>`}</footer>
  </dialog>`
}

// A step that changes takes the keyboard to what it asks for now: the six digits' field, its title, its first button, or Add a device.
let was = ''
effect(() => {
  const now = `${adding.value.step} ${joining.value.step}`
  if (was && now !== was) requestAnimationFrame(() => pageOpen() === 'devices' && /** @type {HTMLElement | null} */ (document.querySelector('.devices-type')
    ?? document.querySelector('.devices-flow h3') ?? document.querySelector('.devices-actions .button') ?? document.getElementById('devices-add'))?.focus())
  was = now
})

/** Your devices' page: the step under way, or the devices at rest; what a step says, then its buttons. */
export function section() {
  const now = step()
  return html`<div class="devices-flow">${now ? now.body : rest()}
    <p class="devices-said" role="status">${now?.said ?? ''}</p><p class="devices-wrong" id="devices-wrong" role="alert">${now?.wrong ?? ''}</p>${now?.buttons ?? nothing}</div>${asking()}`
}
