// Profiles (D228): one device, several Jeans, each a whole one in profiles/<ulid>-<slug>/, which the FS
// is rooted in (ui/opfs.js), so that nothing crosses between them. Loaded once there is a second, or
// to make one: the person's menu lists them and adds one, switching opens the other afresh, and
// Settings › Profiles names and removes them. A child's is set by a parent (./child.js), who sees in
// theirs the time it spends and any concern that came up there, never the words. Each lists the
// others from their vault.json, the one file of theirs it can read.
import { html, nothing } from 'lit-html'
import { signal, computed } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, effective, notify } from '../../ui/state.js'
import { here, switchTo, rpc, files } from '../../ui/opfs.js'
import { scriptURL } from '../../ui/trusted.js'
import { VAULT, vaultKey, vaultId, close, slotKey, deviceKey, encode } from '../../ui/seal.js'
import { readJSON, writeJSON, rootedFS } from '../../core/fs.js'
import { slug } from '../../core/settings.js'
import { ulid } from '../../core/ulid.js'
import { t, useStrings, locale } from '../../core/i18n.js'
import { icons } from '../../ui/icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { TIER, DANGERS, age, tierFor } from './tier.js'
import { inbox, pair, openFrom } from './family.js'

await Promise.all([useStrings('profiles'), styleSheet(new URL('profiles.css', import.meta.url))])

/** A profile as the others see it: its folder and name, its parent's profile if a child's, and whether it opens with a lock. @typedef {{ dir: string, name: string, parent?: string, locked: boolean }} Profile */
/** @param {string} dir @returns {Promise<import('../lock/lock.js').Vault | null>} */
const vaultOf = async (dir) => JSON.parse(await app.whole?.read(`${dir}/${VAULT}`) ?? 'null')
const all = signal(/** @type {Profile[]} */ ([]))
export async function refresh() {
  const dirs = (await app.whole?.list('profiles') ?? []).map(({ name }) => `profiles/${name}`)
  all.value = await Promise.all(dirs.map(async (dir) => {
    const vault = await vaultOf(dir)
    return { dir, name: vault?.name ?? '', parent: vault?.parent?.profile, locked: !vault?.slots.some((slot) => slot.kind === 'device') }
  }))
}
await refresh()
export const self = computed(() => all.value.find((profile) => profile.dir === here()))
/** Whether this is a child's profile, which a parent set. */
const child = Boolean(self.peek()?.parent)
const parts = child ? (await import('./child.js')).parts : null
/** A profile's name as the menu says it: this one's may still be the person's name alone. @param {Profile} profile */
const nameOf = (profile) => profile.name || (profile.dir === here() ? effective.value.settings.name : '') || t('profile.you')
/** Its first letter, as the person's is drawn. @param {Profile} profile */
const initial = (profile) => ([...new Intl.Segmenter(locale.value).segment(nameOf(profile))][0]?.segment ?? '').toLocaleUpperCase(locale.value)

/** This profile's vault.json changed: its name, read again just before, since the lock writes it too. @param {Record<string, unknown>} patch */
async function keep(patch) {
  await app.fs.write(VAULT, JSON.stringify({ ...JSON.parse(await app.fs.read(VAULT) ?? '{}'), ...patch }, null, 2) + '\n')
  await refresh()
}

// ─── A parent's: their children's time and concerns ──────────────────────────

/** This profile's own pair, made with its first child's, and when it last saw what they told. @typedef {{ key: JsonWebKey, public: JsonWebKey, seen?: string }} Family */
const FAMILY = '.secrets/family.json'
const kept = signal(/** @type {Family | null} */ (await readJSON(app.fs, FAMILY, null)))
/** What its children's profiles told it: concerns, and the minutes spent each day, by profile. */
const concerns = signal(/** @type {{ kind: keyof typeof DANGERS, at: string, from: string }[]} */ ([]))
const minutes = signal(/** @type {Record<string, Record<string, number>>} */ ({}))
async function hear() {
  const family = kept.peek()
  if (!family || !app.whole) return
  const told = (await Promise.all((await app.whole.list(inbox(here()))).map(async ({ name }) => openFrom(family.key, String(await app.whole?.read(`${inbox(here())}/${name}`))).catch(() => null)))).filter(Boolean)
  const before = unseen().length
  concerns.value = told.filter((item) => item.kind).sort((a, b) => (a.at < b.at ? 1 : -1))
  minutes.value = Object.fromEntries(told.filter((item) => item.days).map((item) => [item.from, item.days]))
  // A new one is told on this device too, once its notifications are allowed.
  const fresh = unseen()
  if (fresh.length > before && globalThis.Notification?.permission === 'granted') {
    const options = { body: t('profiles.never'), tag: 'family', lang: locale.peek(), icon: 'icons/icon-192.png' }
    const title = said(fresh[0])
    try { new Notification(title, options) } catch { navigator.serviceWorker?.ready.then((registration) => registration.showNotification(title, options)).catch(console.warn) }
  }
}
const unseen = () => concerns.peek().filter((item) => item.at > (kept.peek()?.seen ?? ''))
new BroadcastChannel('app-family').onmessage = ({ data }) => { if (data === inbox(here())) hear() }
await hear()

/** A concern as a parent reads it: whose profile, its kind and when. @param {{ kind: keyof typeof DANGERS, at: string, from: string }} item */
const said = (item) => t('profiles.concern', { name: nameOf(all.peek().find((profile) => profile.dir === item.from) ?? { dir: item.from, name: '', locked: false }),
  kind: t(`profiles.kind.${item.kind}`), when: new Date(item.at).toLocaleString(locale.peek(), { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) })

/** Concerns, each with what a parent can do. @param {{ kind: keyof typeof DANGERS, at: string, from: string }[]} items */
const listed = (items) => html`<ul class="profile-concerns">${items.map((item) => html`<li><p>${said(item)}</p>
  <details><summary>${t('profiles.whatToDo')}</summary><p>${t(`profiles.help.${item.kind}`)}</p></details></li>`)}</ul>`

/** Above the box, until seen: the concerns told since. */
function banner() {
  void [concerns.value, kept.value]
  const fresh = unseen()
  return fresh.length ? html`<aside class="offer profile-told" role="alert">${listed(fresh)}<p class="hint">${t('profiles.never')}</p>
    <div class="row"><button class="button" @click=${async () => { await writeJSON(app.fs, FAMILY, (kept.value = { .../** @type {Family} */ (kept.peek()), seen: new Date().toISOString() })) }}>${t('profiles.seen')}</button></div></aside>` : nothing
}

/** A child's minutes, today and over the last seven days. @param {string} dir */
function time(dir) {
  const days = minutes.value[dir] ?? {}
  const week = Array.from({ length: 7 }, (_, i) => days[new Date(Date.now() - i * 86_400_000).toLocaleDateString('sv')] ?? 0)
  const span = (/** @type {number} */ n) => new Intl.DurationFormat(locale.value, { style: 'short', minutesDisplay: 'always' }).format({ hours: Math.floor(n / 60), minutes: n % 60 })
  return t('profiles.time', { today: span(week[0]), week: span(week.reduce((sum, n) => sum + n, 0)) })
}

// ─── Adding one ──────────────────────────────────────────────────────────────

/** Opens the dialog that adds one. */
export const add = () => import('./dialog.js').then((dialog) => dialog.open())

/**
 * A profile made, then opened: its vault, and the slot that opens it, this device's, or for a child
 * under 13 their parent's vault key; for a child, what the parent set, sealed under it by a storage
 * worker of its own. This profile gets its name if it had none.
 * @param {{ name: string, mine: string, born?: number }} chosen @param {Uint8Array} [parentRaw]
 */
export async function make({ name, mine, born }, parentRaw) {
  const dir = `profiles/${ulid()}-${slug(name) || 'profile'}`
  const raw = crypto.getRandomValues(new Uint8Array(32))
  const key = await vaultKey(raw)
  const slot = { kind: /** @type {const} */ ('parent'), profile: here(), salt: encode(crypto.getRandomValues(new Uint8Array(16))) }
  const slots = [born !== undefined && age(born) < 13 && parentRaw ? await close(raw, await slotKey(slot, parentRaw), slot)
    : await close(raw, /** @type {CryptoKey} */ (await deviceKey('make', dir)), { kind: 'device' })]
  if (born !== undefined && !kept.peek()) await writeJSON(app.fs, FAMILY, (kept.value = await pair()))
  const parent = born !== undefined && { profile: here(), key: kept.peek()?.public }
  await app.whole?.write(`${dir}/${VAULT}`, JSON.stringify({ format: 1, id: encode(await vaultId(key)), slots, name, ...(parent && { parent }) }, null, 2) + '\n')
  if (born !== undefined) {
    // A storage worker on the child's vault, handed its key.
    const worker = new Worker(scriptURL(new URL('../../ui/storage-worker.js', import.meta.url)), { type: 'module' })
    const call = rpc(worker, crypto.randomUUID())
    if (await call('ping', dir) !== 'open') await call('key', '', /** @type {any} */ (key))
    await writeJSON(rootedFS(files(call), dir), TIER, tierFor(born))
    worker.terminate()
  }
  raw.fill(0)
  parentRaw?.fill(0)
  if (!self.peek()?.name) await keep({ name: mine })
  switchTo(dir)
}

/** A profile gone, with what it told this one, once the person confirms; this one's opens another. @param {Profile} profile */
async function remove(profile) {
  if (!confirm(t('profiles.removeConfirm', { name: nameOf(profile) }))) return
  for (const path of [profile.dir, inbox(profile.dir), `${inbox(here())}/time-${profile.dir.slice(9, 35)}.json`]) await app.whole?.remove(path)
  await deviceKey('forget', profile.dir)
  if (profile.dir === here()) return switchTo(all.peek().find((other) => other.dir !== here())?.dir ?? '')
  notify(t('profiles.removed', { name: nameOf(profile) }))
  await refresh()
}

// ─── The menu and Settings › Profiles ────────────────────────────────────────

/** At the top of the person's menu: every profile, once there are two, to switch to, then Add a profile. @param {string} id the menu's */
const menu = (id) => html`${all.value.length > 1 ? all.value.map((profile) => html`<button type="button" class="profile-switch" aria-current=${profile.dir === here() ? 'true' : 'false'}
    popovertarget=${id} popovertargetaction="hide" @click=${() => { if (profile.dir !== here()) switchTo(profile.dir) }}>
    <span class="avatar" aria-hidden="true">${initial(profile)}</span><span dir="auto">${nameOf(profile)}</span>${profile.dir === here() ? icons.check : profile.locked ? icons.lock : nothing}</button>`) : nothing}
  ${child ? nothing : html`<button type="button" popovertarget=${id} popovertargetaction="hide" @click=${add}>${icons.plus}${t('profiles.add')}</button>`}<hr>`

/** Every profile: this one, named here, the others to open, a child's of this one with its time, and the concerns told here. */
function section() {
  const mine = self.value
  return html`<h2>${t('profiles.title')}</h2><p class="muted">${t('profiles.what')}</p>
    <ul class="list profile-list">${all.value.map((profile) => html`<li class="item"><span class="avatar" aria-hidden="true">${initial(profile)}</span>
      <span class="item-text"><strong dir="auto">${nameOf(profile)}</strong><small>${profile.dir === here() ? t('profiles.this')
        : profile.parent === here() ? time(profile.dir) : profile.parent ? t('profiles.aChild') : profile.locked ? t('profiles.locked') : ''}</small></span>
      ${profile.dir === here() ? nothing : html`<button class="button subtle" @click=${() => switchTo(profile.dir)}>${t('profiles.open')}</button>`}
      ${profile.parent === here() || (profile.dir === here() && !child) ? html`<button class="button subtle danger" @click=${() => remove(profile)}>${t('profiles.remove')}</button>` : nothing}</li>`)}</ul>
    ${child || !mine ? nothing : html`<div class="row"><button class="button" @click=${add}>${icons.plus} ${t('profiles.add')}</button></div>
      <label>${t('profiles.yours')}<input .value=${mine.name} maxlength="40" dir="auto" @change=${(/** @type {Event} */ e) => keep({ name: /** @type {HTMLInputElement} */ (e.target).value.trim() })}></label>`}
    ${concerns.value.length ? html`<h3>${t('profiles.concerns')}</h3>${listed(concerns.value)}<p class="hint">${t('profiles.never')}</p>` : nothing}`
}

register({
  id: 'profiles',
  ...(parts && { tools: parts.tools, lines: parts.lines }),
  slots: {
    profiles: { at: 0, draw: menu },
    dialog: { at: 2, draw: () => html`<app-profile-dialog></app-profile-dialog>` },
    settings: [{ id: 'profiles', at: 15, label: 'profiles.title', icon: icons.person, draw: section, when: () => all.value.length > 1 }, ...(parts ? [parts.settings] : [])],
    above: [{ at: 0, draw: banner }, ...(parts ? [parts.above] : [])],
    ...(parts && { modes: parts.modes }),
  },
})
