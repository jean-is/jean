// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Policy's `session` (D676), for shared and unattended computers. `idle` ("PT15M") locks every tab once nobody has done
// anything for that long, or signs out where there is no lock, never while Jean is at work. `signOut: "wipe"` erases this profile
// from the device as the person signs out, once they confirm: its files, keys and sign-ins, so that the next person starts afresh.
import { html } from 'lit-html'
import { register, loaded } from '../ui/caps.js'
import { app, notify, removing } from '../ui/state.js'
import { here, mine, PROFILE } from '../ui/opfs.js'
import { deviceKey } from '../ui/seal.js'
import { getSecret } from '../ui/secrets.js'
import { working } from '../ui/curtain.js'
import { t, useStrings, intlLocales } from '../core/i18n.js'
import { clock, session } from './idle.js'

/** Stops this tab writing, whatever a page leaving would still keep, which would bring back a folder without its vault. @returns {() => void} what starts it again */
function hush() {
  const whole = app.whole
  // Where nothing is kept, a private window's memory, nothing would write.
  if (!whole) return () => {}
  const writers = { write: whole.write, writeBytes: whole.writeBytes, append: whole.append }
  Object.assign(whole, { write: async () => {}, writeBytes: async () => {}, append: async () => {} })
  return () => Object.assign(whole, writers)
}

/**
 * Everything this profile keeps on the device: every tab stops writing first, and the others start again once it is gone.
 * @param {BroadcastChannel} tabs @returns {Promise<{ refuse: string } | void>}
 */
async function wipe(tabs) {
  const dir = here()
  const kept = JSON.parse(await getSecret(app.fs, 'signin') ?? 'null')
  const speak = hush()
  tabs.postMessage('wiping')
  // Another tab's worker may hold a file a moment longer, until it hears.
  const erase = async (/** @type {number} */ tries = 8) => {
    try {
      await app.whole?.remove(dir)
      await app.whole?.remove(`family/${dir.slice(9, 35)}`)
    } catch (error) {
      if (tries <= 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 300))
      await erase(tries - 1)
    }
  }
  try {
    if (!(await removing([{ profile: dir }], () => erase()))) throw new Error('Refused')
    await deviceKey('forget', dir)
    await forgetKeys(dir)
    for (const store of [localStorage, sessionStorage]) {
      for (const key of Object.keys(store)) if (key.endsWith(`:${dir}`)) store.removeItem(key)
      store.removeItem(PROFILE)
    }
    // What was on its way as the others stopped.
    await new Promise((resolve) => setTimeout(resolve, 300))
    await erase()
  } catch (error) {
    speak()
    tabs.postMessage('failed')
    throw error
  }
  tabs.postMessage('wiped')
  if (kept?.end) location.assign(`${kept.end}?${new URLSearchParams({ client_id: kept.clientId, post_logout_redirect_uri: location.origin + location.pathname })}`)
  else location.replace(location.pathname)
  await new Promise(() => {})
}

/** This profile's keys the browser holds for it (ui/secrets.js), its seal's and its audit's among them, and the databases of its own, its folders' handles and Sync's, once nothing holds them. @param {string} dir */
const forgetKeys = (dir) => new Promise((resolve) => {
  for (const name of ['app-folders', 'app-sync']) indexedDB.deleteDatabase(`${name}:${dir}`)
  const request = indexedDB.open('app-keys', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('keys')
  request.onerror = () => resolve(undefined)
  request.onsuccess = () => {
    const store = request.result.transaction('keys', 'readwrite').objectStore('keys')
    const keys = store.getAllKeys()
    keys.onerror = () => resolve(undefined)
    keys.onsuccess = () => {
      for (const key of keys.result) if (String(key).endsWith(`:${dir}`)) store.delete(key)
      store.transaction.oncomplete = () => resolve(undefined)
    }
  }
})

/** Locks every tab, or signs out where nothing locks; a wipe never follows a moment away, session() says. @param {{ wipe: boolean }} read */
async function away({ wipe: wiping }) {
  if (loaded.value.has('lock')) {
    const lock = await import('../caps/lock/lock.js')
    if (lock.isOn()) return lock.lockNow()
  }
  if (!wiping && loaded.value.has('signin')) (await import('../caps/signin/signin.js')).signOut()
}

/** @param {Record<string, unknown>} policy */
export async function start(policy) {
  const read = session(policy)
  await useStrings('enterprise')
  const tabs = new BroadcastChannel(mine('app-wipe'))
  // Another tab erasing this profile: nothing more from here, then a new start; what was started goes on if it couldn't.
  /** @type {(() => void) | undefined} */
  let speak
  tabs.onmessage = ({ data }) => {
    if (data === 'wiping') speak = hush()
    if (data === 'failed') speak?.()
    if (data === 'wiped') location.replace(location.pathname)
  }
  // What a page leaving wrote after a wipe, of a profile no longer here.
  if (read.wipe) {
    const dirs = (await app.whole?.list('profiles') ?? []).map(({ name }) => `profiles/${name}`)
    for (const key of Object.keys(localStorage)) if (/:profiles\//.test(key) && !dirs.includes(key.slice(key.indexOf(':') + 1))) localStorage.removeItem(key)
  }
  const duration = () => {
    const minutes = /** @type {number} */ (read.idle) / 60_000
    return new Intl.DurationFormat(intlLocales(), { style: 'long' }).format({ hours: Math.floor(minutes / 60), minutes: minutes % 60 })
  }
  register({
    id: 'session',
    hooks: read.wipe ? [{ on: 'signout', tier: 'policy', run: async () => {
      if (!confirm(t('session.wipeConfirm'))) return { refuse: 'kept' }
      // Never a sign-out that leaves everything behind.
      return wipe(tabs).catch((error) => { console.warn('Session', error); notify(t('session.wipeFailed')); return { refuse: 'failed' } })
    } }] : [],
    slots: { organization: { at: 3, draw: () => html`<section><h3>${t('session.title')}</h3>${read.idle ? html`<p class="muted">${t('session.idle', { duration: duration() })}</p>` : ''}${read.wipe ? html`<p class="muted">${t('session.wipe')}</p>` : ''}</section>` } },
  })
  if (!read.idle) return
  const watch = clock({ after: read.idle, busy: working, done: () => { away(read).catch((error) => console.warn('Session', error)) } })
  const others = new BroadcastChannel(mine('app-idle'))
  others.onmessage = () => watch.touch()
  let told = 0
  const did = () => {
    watch.touch()
    // Other tabs hear of it, not at each key.
    if (Date.now() - told > 10_000) { told = Date.now(); others.postMessage('did') }
  }
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(type, did, { passive: true, capture: true })
  setInterval(() => watch.tick(), 15_000)
  document.addEventListener('visibilitychange', () => watch.tick())
}
