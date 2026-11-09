// Your devices (D700, D726, D728), a section of Settings: cards, this device first, then the others, each with when it was last seen, or
// added, and Remove, asked in a dialog that also erases Jean there; what they keep in common, what each keeps; Add a device, its steps
// shown in its place under the three both devices name (the link and its QR code, the wait; the lock, the six digits the new device shows,
// sent at the sixth; done, on the map). A new device joins from its own page, devices/join, which its welcome opens: a link from the other
// device, pasted there, in the box or opened, joined in the same place once the person chooses Bring it here, its six digits shown to type
// there, then the profile that came and the device it came from, as a card, opened only on Yes, it's mine. Loaded the first time it shows.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app, notify } from '../../ui/state.js'
import { sectionOpen, pageOpen, goPage } from '../../ui/dialogs.js'
import { handheld } from '../../ui/model.js'
import { codeOf } from '../../ui/qr.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { rail } from '../../ui/rail.js'
import { map } from '../../ui/map.js'
import { initialOf } from '../../ui/curtain.js'
import { t, tParts, intlLocales, formatBytes, relativeTime } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { adding, joining, devices, own, stored, start, passed, confirm, cancel, join, trusted, removeDevice, kindOf, joinIcon, lastSeen, quietOf, places } from './devices.js'
import { state as store, again } from './store.js'

// The head and the back button Your data's pages have.
await styleSheet(new URL('../../ui/data-pages.css', import.meta.url))

/** @typedef {import('./flow.js').Device} Device */
/** Which of the three steps it is, what it shows, its buttons, and what it says as it comes, or what went wrong. @typedef {{ at?: number, body?: unknown, buttons?: unknown, said?: string, wrong?: string }} Step */

/**
 * The device Remove was pressed on, whether Jean is erased from it, while it goes, once gone the keys it may hold, by where each was made,
 * and the devices that took nothing yet, or that the removal failed.
 */
const removing = signal(/** @type {{ device: Device, erase: boolean, busy?: boolean, left?: string[], sites?: string[], unreached?: string[], people?: string[], refused?: boolean } | null} */ (null))
/** The lock's ways in, loaded when adding asks for them. */
const lock = signal(/** @type {typeof import('../lock/lock.js') | null} */ (null))

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

/** Only digits, six at most, sent at the sixth unless an IME composes. @param {InputEvent} e */
const digitsIn = (e) => { const box = /** @type {HTMLInputElement} */ (e.target); box.value = box.value.replace(/\D/g, '').slice(0, 6); if (box.value.length === 6 && !e.isComposing) box.form?.requestSubmit() }
/** The six digits typed on this device: wrong, selected to type again. @param {SubmitEvent} event */
async function typed(event) {
  event.preventDefault()
  const input = /** @type {HTMLInputElement} */ (/** @type {HTMLFormElement} */ (event.target).elements.namedItem('code'))
  if (!(await confirm(input.value))) input.select()
}

/** The step under way, adding on this device or joining another, or none. @returns {Step | null} */
function step() {
  const [a, b, name] = [adding.value, joining.value, BRAND.name]
  if (b.step === 'home') return { at: 0, body: html`<h3 tabindex="-1">${t('devices.homeTitle', { name })}</h3><p>${t('devices.homeText', { name })}</p><p>${t('devices.homePaste')}</p>${field(b.link)}`,
    buttons: row(html`<button class="button" @click=${() => { joining.value = { step: 'ask', link: b.link } }}>${t('devices.inSafari')}</button>`, quit()) }
  const asked = html`<h3 tabindex="-1">${t('devices.askTitle', { name })}</h3><p>${t('devices.coming', { name })}</p>`
  if (b.step === 'ask') return { at: 0, body: asked, buttons: row(html`<button class="button primary" @click=${() => join(b.link)}>${t('welcome.bring')}</button>`, quit()) }
  if (b.step === 'waiting') return { at: 0, body: asked, said: t('devices.joining'), buttons: row(quit()) }
  if (b.step === 'code') return { at: 1, body: html`<h3 tabindex="-1">${t('devices.typeThere')}</h3><p class="devices-digits" dir="ltr">${b.code.slice(0, 3)} ${b.code.slice(3)}</p>`, buttons: row(quit()) }
  // The profile that came as a card, its initial and its name, and the device it came from; Yes, it's mine opens it.
  if (b.step === 'trust') return { at: 1, body: html`<h3 tabindex="-1">${t('devices.yours')}</h3><div class="devices-who"><span class="avatar" aria-hidden="true">${initialOf(b.profile)}</span>
      <strong dir="auto">${b.profile}</strong><small>${tParts('devices.fromDevice', { device: named(b.device) })}</small></div><p class="hint">${t('devices.trustHint')}</p>`,
    buttons: row(html`<button class="button primary" @click=${trusted}>${t('devices.mine')}</button>`, quit('devices.stop')) }
  if (b.step === 'adopting' || b.step === 'done') return { at: 2, said: t(b.step === 'done' ? 'devices.joined' : 'devices.adopting', { name }) }
  if (b.step === 'failed') return { wrong: t(`devices.why.${b.reason}`, { name }), buttons: row(quit('devices.close')) }
  if (a.step === 'waiting') {
    const code = a.address ? codeOf(a.link) : null
    return { at: 0, body: html`<h3 tabindex="-1">${t('devices.open')}</h3>
      ${code ? html`<svg class="devices-qr" role="img" aria-label=${t('devices.qr')} viewBox="-4 -4 ${code.size + 8} ${code.size + 8}"><path d=${code.d}/></svg>` : nothing}
      <p>${a.address ? t('devices.point') : t('devices.pasteThere', { name })}</p>${field(a.link)}`, said: t('devices.waiting'),
    buttons: row(handheld() && 'share' in navigator ? html`<button class="button" @click=${() => navigator.share({ url: a.link }).catch(() => {})}>${icons.share} ${t('devices.share')}</button>` : nothing, quit()) }
  }
  if (a.step === 'lock') return { at: 1, body: html`<h3 tabindex="-1">${t('devices.unlock', { device: a.name })}</h3>${lock.value?.ways(passed) ?? (import('../lock/lock.js').then((module) => { lock.value = module }), nothing)}`, buttons: row(quit()) }
  if (a.step === 'code') return { at: 1, body: html`<form class="stack" @submit=${typed}><label for="devices-code">${t('devices.typeCode', { device: a.name })}</label>
      <input id="devices-code" class="devices-type" name="code" inputmode="numeric" autocomplete="one-time-code" spellcheck="false" dir="ltr" required aria-describedby="devices-wrong devices-hint" @keydown=${composing} @input=${digitsIn}>
      <p class="hint" id="devices-hint">${t('devices.codeHint')}</p><div class="row"><button class="button primary">${t('devices.confirm')}</button></div></form>`,
    wrong: a.left < 3 ? t('devices.wrong', { count: a.left }) : '', buttons: row(quit()) }
  // Until the new device says it opened what came, which waits on the person there.
  if (a.step === 'sending') return { at: 1, said: t('devices.sending', { device: a.name }), buttons: row(quit()) }
  // Done, on the map the device just added joins.
  if (a.step === 'done') return { at: 2, body: ((mine) => mine && map(t('cap.devices.name'), { icon: kindOf(mine.name), name: mine.name }, [places() ?? []].flat()))(devices.value.find((one) => one.id === own.value)),
    said: t('devices.done', { device: a.name }), buttons: row(quit('devices.ok')) }
  if (a.step === 'failed') return { wrong: t(`devices.why.${a.reason}`, { name }), buttons: row(html`<button class="button" @click=${start}>${t('devices.again')}</button>`, quit('devices.close')) }
  return null
}

/**
 * At rest: the devices as cards, this one first, a device two weeks unheard as a state that waits; what they keep in common and what each
 * keeps; Add a device, and beside it, while this one is alone, Join another device, which leads to its page for joining.
 */
function rest() {
  const list = [...devices.value].sort((x, y) => Number(y.id === own.value) - Number(x.id === own.value))
  return html`${list.length ? html`<ul class="devices-cards">${list.map((one) => html`<li class=${one.id === own.value ? 'is-here' : ''}>${kindOf(one.name)}<strong dir="auto">${one.name}</strong>
      ${one.id === own.value ? html`<small>${t('devices.here', { date: new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'medium' }).format(new Date(one.createdAt)) })}</small>`
        : html`<small class=${quietOf(one) ? 'data-state is-wait' : ''}>${lastSeen(one)}</small><button class="button subtle danger" @click=${() => ask(one)}>${t('action.remove')}</button>`}</li>`)}</ul>` : nothing}
    ${common()}<p class="hint">${t('devices.own')}</p><div class="row"><button id="devices-add" class="button primary" @click=${start}>${icons.plus} ${t('devices.add')}</button>
      ${list.length > 1 ? nothing : html`<button class="button" data-page="join" @click=${() => goPage('devices', 'join')}>${joinIcon} ${t('devices.joinOther')}</button>`}</div>`
}

/** devices/join, on the new device: the field the other device's link is pasted in, its title and its line saying where that link comes from. */
const pasting = () => html`<form class="stack" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); app.section.value = 'devices'; join(String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get('link'))) }}><label for="devices-link">${t('devices.paste')}</label>
  <div class="devices-field"><input id="devices-link" name="link" required autocomplete="off" spellcheck="false" dir="ltr" aria-describedby="devices-line" @keydown=${composing}><button class="button">${t('devices.join')}</button></div></form>`

/**
 * Under the list, what the devices keep in common in the store: its room used, full, a removed device still being shut out, the relay out
 * of reach, or no longer reaching this device, with Start again where it is gone; and when a round last reached it.
 */
function common() {
  const { use = 0, quota, full, gone, room, owing, unreached, at } = store.value
  const said = gone ? 'devices.store.gone' : room ? 'devices.store.room' : unreached ? 'devices.store.unreached' : owing ? 'devices.store.owed' : full ? 'devices.store.full' : quota ? 'devices.store.use' : ''
  return said ? html`<p class="hint" id="devices-use">${t(said, { used: formatBytes(use), quota: formatBytes(quota ?? 0) })}</p>${quota ? html`<meter value=${use} max=${quota} aria-labelledby="devices-use"></meter>` : nothing}${at && !gone ? html`<p class="hint devices-synced">${t('devices.store.synced', { when: relativeTime(at) })}</p>` : nothing}
    ${gone ? html`<div class="row"><button class="button" @click=${again}>${t('devices.store.again')}</button></div>` : nothing}` : nothing
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
  const { device, erase, busy, left, sites = [], unreached = [], people = [], refused } = one
  return html`<dialog class="sheet devices-remove" aria-labelledby="devices-remove" @close=${closed} @keydown=${(/** @type {KeyboardEvent} */ e) => e.key === 'Escape' && e.stopPropagation()}>
    <header class="dialog-head"><h2 id="devices-remove">${tParts('devices.remove', { device: named(device.name) })}</h2>
      <button class="icon-button" aria-label=${t('action.close')} @click=${() => dialog()?.close()}>${icons.close}</button></header>
    <div class="stack" role="status">${left ? html`<p>${tParts('devices.removed', { device: named(device.name) })}</p>${erase && !unreached.includes(device.name) ? html`<p>${t('devices.erasing', { name: BRAND.name })}</p>` : nothing}
      ${left.length ? html`<p>${t('devices.revoke')}</p><ul>${left.map((label) => html`<li dir="auto">${label}</li>`)}</ul>` : nothing}
      ${people.length ? html`<p>${t('devices.people')}</p><ul>${people.map((name) => html`<li dir="auto">${name}</li>`)}</ul>` : nothing}
      ${sites.length ? html`<p>${t('devices.sites')}</p><ul>${sites.map((name) => html`<li dir="ltr">${name}</li>`)}</ul>` : nothing}` : nothing}</div>
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
  if (was && now !== was) requestAnimationFrame(() => sectionOpen() === 'devices' && /** @type {HTMLElement | null} */ (document.querySelector('.devices-type')
    ?? document.querySelector('.devices-flow h3') ?? document.querySelector('.devices-actions .button') ?? document.getElementById('devices-add'))?.focus())
  was = now
})

/** Your devices: its head, then the step under way, its page for joining, or the devices at rest; what a step says, then its buttons. */
export function section() {
  const [now, name] = [step(), BRAND.name], joins = !now && pageOpen() === 'join'
  return html`${joins ? html`<button class="back button subtle" @click=${() => goPage('devices', '')}>${icons.back} ${t('cap.devices.name')}</button>` : nothing}<header class="data-head"><div><h2 tabindex="-1">${t(joins ? 'devices.joinTitle' : 'cap.devices.name', { name })}</h2>
      <p class="lede" id="devices-line">${t(joins ? 'devices.joinText' : stored.value ? 'devices.lineStore' : 'devices.line', { name, place: `${t('settings.title')} › ${t('cap.devices.name')}`, case: `${t('settings.title')} › ${t('settings.capabilities')}` })}</p></div></header>
    <div class="devices-flow">${now?.at === undefined ? nothing : rail(t('devices.adding'), [t('devices.step.show'), t('devices.step.match'), t('devices.step.done')], now.at, now.at === 2)}${now ? now.body : joins ? pasting() : rest()}
    <p class="devices-said" role="status">${now?.said ?? ''}</p><p class="devices-wrong" id="devices-wrong" role="alert">${now?.wrong ?? ''}</p>${now?.buttons ?? nothing}</div>${asking()}`
}
