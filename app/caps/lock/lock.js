// The lock (docs/encryption.md, D371): what Jean keeps on this device opens only with the person's
// passkey or password, or their recovery code, rather than with this device's key alone. Every file
// is sealed either way, by the storage worker (ui/seal.js); a lock changes only the slots of
// vault.json, which open the vault key, so nothing is sealed again. Locked, Jean shows this before
// anything it keeps is read, and another tab that has the key hands it over; once found, it is set,
// changed or turned off in Settings › Your data, and Lock now is in the person's menu. Each profile
// has a vault and a lock of its own (D228); a child's under 13 opens with their parent's.
import { html, nothing, render } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { register, loaded } from '../../ui/caps.js'
import { app, notify, sitePage, LOCALES } from '../../ui/state.js'
import { slotKey, close, unseal, vaultKey, vaultId, deviceKey, encode, decode, VAULT, ITERATIONS } from '../../ui/seal.js'
import { save } from '../../ui/save.js'
import { mine, here } from '../../ui/opfs.js'
import { switchTo, whoOf, curtainFor, otherBadges, unhold } from '../../ui/curtain.js'
import { freeColour } from '../../ui/touches.js'
import { ulid } from '../../core/ulid.js'
import { BRAND } from '../../brand.js'
import { t, useStrings, useLocale, pickLocale, locale, dir } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet, still } from '../../ui/sheet.js'

/** @typedef {import('../../ui/seal.js').Slot} Slot */

// The lock screen speaks the language chosen, which settings, sealed, can't tell before it opens.
const LOCALE = mine('app.locale')
const chosen = localStorage.getItem(LOCALE)
await Promise.all([useStrings('lock'), styleSheet(new URL('lock.css', import.meta.url))])
effect(() => localStorage.setItem(LOCALE, locale.value))

/** Passkeys that give a secret (WebAuthn's PRF), where the address is a name: never the desktop app's 127.0.0.1. */
const passkeys = !!globalThis.PublicKeyCredential && !/^[\d.]+$|:/.test(location.hostname)
  && /** @type {any} */ (await /** @type {any} */ (PublicKeyCredential).getClientCapabilities?.().catch(() => null))?.['extension:prf'] !== false

/** vault.json: its id, the slots that open the vault key, and the profile's name, colour and parent (D228). @typedef {{ id: string, slots: Slot[], name?: string, colour?: string, parent?: { profile: string, key: JsonWebKey } }} Vault */
const vault = signal(/** @type {Vault | null} */ (app.fs && JSON.parse(await app.fs.read(VAULT) ?? 'null')))
/** @param {Slot['kind']} kind @param {Vault | null} [of] */
const slotOf = (kind, of = vault.value) => of?.slots.find((slot) => slot.kind === kind)
/** Whether a lock replaced this device's key. */
export const isOn = () => !!vault.value && !slotOf('device')
/** New slots, with the rest of vault.json as it is now, since Profiles writes its name there. @param {Slot[]} slots */
async function keep(slots) {
  const kept = { ...JSON.parse(await app.fs.read(VAULT) ?? '{}'), slots }
  await app.fs.write(VAULT, JSON.stringify({ format: 1, ...kept }, null, 2) + '\n')
  vault.value = kept
}

/** What went wrong, said under the ways in; whether the recovery code is asked for. */
const said = signal('')
const coding = signal(false)
/** @param {number} length */
const random = (length) => crypto.getRandomValues(new Uint8Array(length))
/** A recovery code as it is written, hexadecimal in fours, and read back whatever its case, spaces and dashes. @param {Uint8Array} bytes */
const toCode = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase().replace(/.{4}(?=.)/g, '$&-')
/** @param {string} code */
const hex = (code) => code.replace(/[^0-9a-f]/gi, '').toUpperCase()

// ─── Tabs ────────────────────────────────────────────────────────────────────

const channel = new BroadcastChannel(mine('app-vault'))
/** The vault key, once a lock gave it here: another tab opening locked is handed it. @type {CryptoKey | null} */
let held = null
/** @type {((key: CryptoKey) => void) | null} */
let waiting = null
/** Set as this tab locks, for the lock to show at once: no tab is left to hand the key over. */
const LOCKING = 'app.locking'
/** This tab starts again, at the lock, its curtain grown from what was touched. @param {Element | null} [from] */
const relock = (from) => { held = null; sessionStorage.setItem(LOCKING, '1'); switchTo(here(), whoOf(vault.peek()), from) }
channel.onmessage = ({ data }) => {
  if (data === 'ask' && held) channel.postMessage({ key: held })
  if (data?.key) waiting?.(data.key)
  if (data === 'lock') relock()
}
/** Every other tab locks, and this one, as it goes on to leave. */
export const lockAll = () => { channel.postMessage('lock'); held = null; sessionStorage.setItem(LOCKING, '1') }
/** Every tab locks. */
export const lockNow = () => { channel.postMessage('lock'); relock(document.querySelector('.sidebar-settings.profile .avatar')) }

// ─── The ways in ─────────────────────────────────────────────────────────────

/** A passkey's secret for its slot (PRF), and which slot it opens. @param {Slot[]} slots */
async function evaluate(slots) {
  const url = (/** @type {string} */ id) => id.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') // base64url, as evalByCredential names them
  const found = /** @type {any} */ (await navigator.credentials.get({ publicKey: { challenge: random(32), userVerification: 'required',
    allowCredentials: slots.map((slot) => ({ type: 'public-key', id: decode(slot.credential ?? '') })),
    extensions: /** @type {AuthenticationExtensionsClientInputs} */ ({ prf: { evalByCredential: Object.fromEntries(slots.map((slot) => [url(slot.credential ?? ''), { first: decode(slot.salt ?? '') }])) } }) } }))
  const slot = slots.find((each) => each.credential === encode(new Uint8Array(found.rawId)))
  const output = found.getClientExtensionResults().prf?.results?.first
  if (!slot || !output) throw new Error('No secret from this passkey')
  return { slot, output: new Uint8Array(output) }
}

/** The vault key from what the person gives: the passkey, the password or the recovery code. @param {Slot['kind']} kind @param {string} given @param {Vault | null} of */
async function rawFrom(kind, given, of) {
  const { slot, output } = kind === 'passkey' ? await evaluate(of?.slots.filter((each) => each.kind === kind) ?? [])
    : { slot: slotOf(kind, of), output: kind === 'password' ? given : new Uint8Array((hex(given).match(/../g) ?? []).map((pair) => parseInt(pair, 16))) }
  if (!slot) throw new Error(`No ${kind}`)
  return unseal(slot, await slotKey(slot, output))
}

/** What a recovery code looks like, said under its field (RGAA 11.11). @param {string} [kind] */
const shape = (kind = 'hint') => html`<p class=${kind} id="code-form">${t('lock.codeForm')}</p>`

/** A form of fields, each [name, label, attributes], and its button; the recovery code's, its shape under it. @param {(form: FormData) => unknown} submit @param {[string, string, string?][]} fields @param {unknown} button */
const form = (submit, fields, button) => html`<form class="stack lock-way" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); submit(new FormData(/** @type {HTMLFormElement} */ (e.target))) }}>
  ${fields.length > 1 ? html`<p class="hint" id="lock-required">${t('lock.required')}</p>` : nothing}${fields.map(([name, label, type = 'text']) => html`<label for=${`lock-${name}`}>${t(label)}<input id=${`lock-${name}`} name=${name} type=${type === 'text' ? 'text' : 'password'} autocomplete=${type === 'text' ? 'off' : type}
    spellcheck="false" dir="ltr" aria-describedby=${fields.length > 1 ? 'lock-required' : label === 'lock.codeLabel' ? 'code-form' : nothing} required></label>${label === 'lock.codeLabel' ? shape() : nothing}`)}
  <div class="row"><button class="button primary">${button}</button></div></form>`

/** Tries a way into a vault: its key goes to `then`, and what went wrong is said. @param {(raw: Uint8Array) => unknown} then @param {Vault | null} of */
const trying = (then, of) => /** @param {Slot['kind']} kind @param {FormData} [given] */ async (kind, given) => {
  said.value = ''
  try {
    await then(await rawFrom(kind, String(given?.get('secret') ?? ''), of))
    coding.value = false
  } catch (error) {
    console.warn('Lock', error)
    said.value = t('lock.wrong')
  }
}

/** The ways into a vault, this profile's or a parent's, where a part of Settings or a dialog asks, each giving its key to `then`. @param {(raw: Uint8Array) => unknown} then @param {Vault | null} [of] */
export function ways(then, of = vault.value) {
  const go = trying(then, of)
  return html`${coding.value ? form((data) => go('recovery', data), [['secret', 'lock.codeLabel']], t('lock.unlock')) : html`
    ${slotOf('passkey', of) ? html`<div class="row"><button class="button primary" @click=${() => go('passkey')}>${icons.lock} ${t('lock.unlock')}</button></div>` : nothing}
    ${slotOf('password', of) ? form((data) => go('password', data), [['secret', 'lock.passwordLabel', 'current-password']], t('lock.unlock')) : nothing}
    <div class="row"><button class="link-button" @click=${() => { coding.value = true }}>${t('lock.useCode')}</button></div>`}
    <p class="lock-said" role="alert">${said.value}</p>`
}

// ─── Locked ──────────────────────────────────────────────────────────────────

/**
 * The lock screen's field, shaped as the box is, its button inside: a wrong word shakes it and is selected, its reason
 * shown in a line already kept for it, and typing again clears that. @param {(kind: Slot['kind'], given?: FormData) => Promise<void>} go
 * @param {Slot['kind']} kind @param {string} label @param {string} autocomplete
 */
const field = (go, kind, label, autocomplete) => html`<form class="lock-box" @submit=${async (/** @type {SubmitEvent} */ e) => {
  e.preventDefault()
  const box = /** @type {HTMLFormElement} */ (e.currentTarget)
  const [input, button] = /** @type {[HTMLInputElement, HTMLButtonElement]} */ ([box.elements[0], box.elements[1]])
  button.ariaBusy = 'true'
  await go(kind, new FormData(box))
  button.ariaBusy = null
  if (!said.peek()) return
  input.select()
  if (!still()) box.animate({ translate: ['0', '-6px', '5px', '-3px', '1px', '0'] }, 260)
}}><label for=${`lock-${kind}`}>${t(label)}<input id=${`lock-${kind}`} name="secret" type=${kind === 'password' ? 'password' : 'text'} autocomplete=${autocomplete} spellcheck="false" required
    aria-describedby=${kind === 'recovery' ? 'code-form' : nothing} @input=${() => { said.value = '' }} @keydown=${(/** @type {KeyboardEvent} */ e) => { if (e.isComposing && e.key === 'Enter') e.preventDefault() }}></label>
  <button class="lock-go" aria-label=${t('lock.unlock')}>${icons.send}</button></form>${kind === 'recovery' ? shape('muted') : nothing}`

/**
 * Before anything Jean keeps is read (ui/opfs.js): the key from another tab, else the lock screen,
 * which hands the worker the key the person opened it with, or their parent opened its parent's
 * with (D228). A way in lost deletes nothing (D371): Can't open it? adds a profile beside this one, and only another
 * profile removes it. Only what nothing can open any more starts afresh here. A child's offers neither: their parent sees to it.
 * @param {import('../../ui/opfs.js').Call} call @param {'locked' | 'sealed'} state @param {string} root the profile's folder
 */
export async function locked(call, state, root) {
  await useLocale(chosen ?? pickLocale(LOCALES, navigator.languages))
  Object.assign(document.documentElement, { lang: locale.value, dir: dir(locale.value) })
  vault.value = JSON.parse(await call('read', `${root}/${VAULT}`) ?? 'null')
  const parent = slotOf('parent')
  /** @param {string} dir @returns {Promise<Vault | null>} */
  const read = async (dir) => JSON.parse(await call('read', `${dir}/${VAULT}`) ?? 'null')
  const opener = parent ? await read(String(parent.profile)) : vault.value
  // The other profiles, to go to instead.
  const others = await Promise.all((await call('list', 'profiles')).map((/** @type {{ name: string }} */ { name }) => `profiles/${name}`)
    .filter((/** @type {string} */ dir) => dir !== root).map(async (/** @type {string} */ dir) => /** @type {const} */ ([dir, await read(dir)])))
  // Whether nothing can open it, its key gone or the profile whose key opens this child's, and whether this is a child's with their parent here.
  const [dead, parented] = [state === 'sealed' || !opener, others.some(([dir]) => dir === vault.value?.parent?.profile)]
  // On the curtain that brought the person here, or one of its own for a page opened locked.
  const risen = document.getElementById('curtain')
  const screen = curtainFor(whoOf(vault.value)).appendChild(Object.assign(document.createElement('main'), { className: 'lock' }))
  let stop = () => {}
  const title = document.title
  document.title = `${whoOf(vault.value).name} · ${t('lock.locked')}`
  await new Promise((resolve) => {
    waiting = (key) => call('key', '', /** @type {any} */ (key)).then(() => { held = key; resolve(undefined) }, () => {})
    channel.postMessage('ask')
    // The profile goes, and a first run makes another, or another profile opens. No hook hears: nothing it holds could be read.
    async function afresh() {
      if (!confirm(t('lock.afreshConfirm', { name: whoOf(vault.value).name }))) return
      await call('remove', root)
      await deviceKey('forget', root)
      location.reload()
    }
    // A profile beside this one, opened by this device's key as after a first run, this page leaving at once with its vault key's bytes; this one stays as it is, for the day its way in turns up.
    async function another() {
      const [dir, raw, colour] = [`profiles/${ulid()}-profile`, random(32), freeColour([vault.value, ...others.map(([, of]) => of)])]
      await call('write', `${dir}/${VAULT}`, JSON.stringify({ format: 1, id: encode(await vaultId(await vaultKey(raw))), slots: [await close(raw, /** @type {CryptoKey} */ (await deviceKey('make', dir)), { kind: 'device' })], colour }, null, 2) + '\n')
      switchTo(dir, whoOf({ colour }))
    }
    // Drawn once no tab has answered, so a key handed over shows nothing, or at once after Lock now.
    const alone = sessionStorage.getItem(LOCKING)
    sessionStorage.removeItem(LOCKING)
    /** @param {Uint8Array} raw */
    const open = async (raw) => {
      const own = parent ? await unseal(parent, await slotKey(parent, raw)) : raw
      const key = await vaultKey(own)
      for (const bytes of [raw, own]) bytes.fill(0)
      await waiting?.(key)
    }
    const go = trying(open, opener)
    setTimeout(() => {
      if (held) return
      // A new version that came in held the page it replaced until it was drawn (ui/update.js): here, it won't be yet.
      if (!risen) unhold()
      stop = effect(() => {
        render(html`<p class=${dead || parent ? 'muted' : 'visually-hidden'}>${t(dead ? 'lock.unreadable' : parent ? 'lock.parent' : 'lock.locked')}</p>
        ${!dead ? html`${slotOf('passkey', opener) ? html`<button class="button primary lock-key" @click=${() => go('passkey')}>${icons.lock} ${t('lock.unlock')}</button>` : nothing}
          ${slotOf('password', opener) ? field(go, 'password', 'lock.passwordLabel', 'current-password') : nothing}
          <p class="lock-said" role="alert">${said.value}</p>` : nothing}
        ${dead && parented ? nothing : html`<details class="lock-cant" ?open=${dead} @toggle=${(/** @type {Event} */ e) => { if (/** @type {HTMLDetailsElement} */ (e.currentTarget).open) /** @type {HTMLElement | null} */ (screen.querySelector('.lock-cant input'))?.focus() }}><summary>${t('lock.cant')}</summary>
          ${dead ? nothing : field(go, 'recovery', 'lock.codeLabel', 'off')}
          <p class="muted">${t(dead ? 'lock.afreshText' : 'lock.cantText')}</p>
          ${dead ? html`<button class="button danger" @click=${afresh}>${t('lock.afresh')}</button>` : parented ? nothing : html`<button class="button" @click=${another}>${t('profiles.add')}</button>`}</details>`}
        ${otherBadges(others)}
        <p class="lock-pages">${[['learn.map', sitePage('site-map')], ['learn.help', sitePage('help')]].map(([word, url]) => url && html`<a href=${url} target="_blank" rel="noopener">${t(/** @type {string} */ (word))}</a> `)}</p>`, screen)
      })
      // The way in has the keyboard, but not on a touchscreen, where it would cover the screen.
      if (matchMedia('(pointer: fine)').matches) /** @type {HTMLElement | null} */ (screen.querySelector('.lock-box input, .lock-key'))?.focus()
      // A passkey asks by itself, but not just after Lock now, nor where a parent opens it; a refusal leaves its button.
      if (state === 'locked' && !alone && !parent && slotOf('passkey', opener) && !slotOf('password', opener)) rawFrom('passkey', '', opener).then(open).catch((error) => console.warn('Lock', error))
    }, alone ? 0 : 60)
  })
  waiting = null
  stop()
  document.title = title
  // The room is drawn on behind the curtain, which is left with the badge and the name.
  screen.animate({ opacity: [1, 0] }, 100).finished.then(() => screen.remove())
}

// ─── Settings › Your data ────────────────────────────────────────────────────

/**
 * Where the part is: at rest; asking the lock first, to change it or turn it off; a new password
 * being typed; the recovery code shown, the lock on once it is typed back.
 * @typedef {{ at: 'rest', raw?: Uint8Array } | { at: 'ask', then: 'change' | 'off' } | { at: 'password', raw: Uint8Array } | { at: 'code', raw: Uint8Array, slot: Slot, bytes: Uint8Array }} Step
 */
const step = signal(/** @type {Step} */ ({ at: 'rest' }))

/** A passkey made now, its secret sealing the vault key in a slot of its own. @param {Uint8Array} raw */
async function newPasskey(raw) {
  const salt = random(32)
  const made = /** @type {any} */ (await navigator.credentials.create({ publicKey: { rp: { name: BRAND.name }, challenge: random(32),
    user: { id: random(16), name: BRAND.name, displayName: BRAND.name }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' }, extensions: /** @type {AuthenticationExtensionsClientInputs} */ ({ prf: { eval: { first: salt } } }) } }))
  /** @type {Slot} */
  const slot = { kind: 'passkey', salt: encode(salt), credential: encode(new Uint8Array(made.rawId)), iv: '', data: '' }
  const first = made.getClientExtensionResults().prf?.results?.first
  return close(raw, await slotKey(slot, first ? new Uint8Array(first) : (await evaluate([slot])).output), slot)
}

/** A way in chosen, the vault key read through this device's slot while there is no lock: a passkey made, or a password to type; then the recovery code. @param {'passkey' | 'password'} kind @param {Uint8Array} [raw] */
async function setUp(kind, raw) {
  said.value = ''
  try {
    raw ??= await unseal(/** @type {Slot} */ (slotOf('device')), /** @type {CryptoKey} */ (await deviceKey('get', here())))
    step.value = kind === 'password' ? { at: 'password', raw } : { at: 'code', raw, slot: await newPasskey(raw), bytes: random(16) }
  } catch (error) {
    console.warn('Lock', error)
    said.value = t('lock.noPasskey')
  }
}

/** @param {FormData} typed @param {Uint8Array} raw */
async function withPassword(typed, raw) {
  const password = String(typed.get('password'))
  if (password !== typed.get('again')) return void (said.value = t('lock.mismatch'))
  /** @type {Slot} */
  const slot = { kind: 'password', salt: encode(random(16)), iterations: ITERATIONS, iv: '', data: '' }
  step.value = { at: 'code', raw, slot: await close(raw, await slotKey(slot, password), slot), bytes: random(16) }
}

/** The code typed back: the lock is on, this device's key forgotten. @param {FormData} typed @param {Extract<Step, { at: 'code' }>} shown */
async function lockWith(typed, shown) {
  if (hex(String(typed.get('end'))) !== hex(toCode(shown.bytes)).slice(-4)) return void (said.value = t('lock.wrong'))
  /** @type {Slot} */
  const recovery = { kind: 'recovery', salt: encode(random(16)), iv: '', data: '' }
  await keep([shown.slot, await close(shown.raw, await slotKey(recovery, shown.bytes), recovery)])
  await deviceKey('forget', here())
  held = await vaultKey(shown.raw)
  done(shown.raw)
  notify(t('lock.locked'))
}

/** The lock off: this device's key opens the vault again. @param {Uint8Array} raw */
async function turnOff(raw) {
  await keep([await close(raw, /** @type {CryptoKey} */ (await deviceKey('make', here())), { kind: 'device' })])
  done(raw)
}

/** Back at rest, the vault key's bytes wiped. @param {Uint8Array} [raw] */
function done(raw) { raw?.fill(0); said.value = ''; coding.value = false; step.value = { at: 'rest' } }

export function panel() {
  // A child's under 13 opens with their parent's way in alone (D228).
  if (slotOf('parent')) return html`<section class="lock-part"><h3>${t('cap.lock.name')}</h3><p class="muted">${t('lock.parent')}</p></section>`
  const [now, on] = [step.value, isOn()]
  const code = now.at === 'code' && toCode(now.bytes)
  return html`<section class="lock-part">
    <h3>${t('cap.lock.name')}</h3>
    <p class="muted">${t(!on ? 'lock.sealed' : slotOf('passkey') ? 'lock.withPasskey' : 'lock.withPassword')}</p>
    ${on && loaded.value.has('sync') ? html`<p class="hint">${t('lock.synced')}</p>` : nothing}
    ${now.at === 'ask' ? ways((raw) => (now.then === 'off' ? turnOff(raw) : (step.value = { at: 'rest', raw })))
      : now.at === 'password' ? html`${form((typed) => withPassword(typed, now.raw), [['password', 'lock.passwordLabel', 'new-password'], ['again', 'lock.again', 'new-password']], t('lock.next'))}
        <p class="hint">${t('lock.stronger')}</p>`
      : now.at === 'code' ? html`<p>${t('lock.code')}</p>
        <p class="lock-code" dir="ltr">${code}</p>
        <div class="row"><button class="button subtle" @click=${() => navigator.clipboard.writeText(String(code))}>${icons.copy} ${t('action.copy')}</button>
          <button class="button subtle" @click=${() => save(new Blob([`${code}\n`], { type: 'text/plain' }), `${t('lock.codeLabel')}.txt`)}>${icons.download} ${t('lock.saveCode')}</button></div>
        ${form((typed) => lockWith(typed, now), [['end', 'lock.typeBack']], html`${icons.lock} ${t('cap.lock.yes')}`)}`
      : on && !now.raw ? html`<div class="row">
        <button class="button" @click=${lockNow}>${icons.lock} ${t('lock.now')}</button>
        <button class="button subtle" @click=${() => { step.value = { at: 'ask', then: 'change' } }}>${t('lock.change')}</button>
        ${app.policy.lock === 'required' ? nothing : html`<button class="button subtle" @click=${() => { step.value = { at: 'ask', then: 'off' } }}>${t('lock.off')}</button>`}</div>`
      : html`<div class="row">
        ${passkeys ? html`<button class="button" @click=${() => setUp('passkey', now.raw)}>${icons.lock} ${t('lock.passkey')}</button>` : nothing}
        <button class="button ${passkeys ? 'subtle' : ''}" @click=${() => setUp('password', now.raw)}>${t('lock.password')}</button></div>`}
    ${now.at === 'ask' ? nothing : html`<p class="lock-said" role="alert">${said.value}</p>`}
    ${now.at === 'rest' && !now.raw ? nothing : html`<button class="link-button" @click=${() => done('raw' in now ? now.raw : undefined)}>${t('lock.cancel')}</button>`}
  </section>`
}

register({
  id: 'lock',
  // Found, but not set up by the user yet, Settings' Capabilities says.
  waiting: () => !isOn(),
  slots: {
    // Its row in Your data, on this device, and its page, data/lock: how it opens, On once it is set.
    data: { id: 'lock', at: 0, group: 'here', icon: icons.lock, label: 'cap.lock.name', draw: panel, state: () => (isOn() ? html`<span class="data-state">${icons.check}${t('lock.on')}</span>` : nothing),
      text: () => t(slotOf('parent') ? 'lock.parent' : !isOn() ? 'lock.opens.anyone' : slotOf('passkey') ? 'lock.opens.passkey' : 'lock.opens.password') },
    // Lock now, in the person's menu, while there is a lock.
    profile: { at: 1, draw: (/** @type {string} */ menu) => (isOn() ? html`<button type="button" popovertarget=${menu} popovertargetaction="hide" @click=${lockNow}>${icons.lock}${t('lock.now')}</button>` : nothing) },
  },
})

// An organisation's policy can ask for a lock (`lock: "required"` in policy.json): Settings opens on it until there is one.
if (app.policy?.lock === 'required' && vault.value && !isOn()) import('../../ui/dialogs.js').then((dialogs) => dialogs.openSettings('data/lock'))
