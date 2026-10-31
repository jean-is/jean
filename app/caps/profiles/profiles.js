// Profiles (D228): one device, several Jeans, each a whole one in profiles/<ulid>-<slug>/, which the FS
// is rooted in (ui/opfs.js), so that nothing crosses between them. Loaded once there is a second, or
// to make one: the person's menu lists them and adds one, switching opens the other afresh, and
// Settings › Profiles (./page.js) names them, removes them and shows a child's. A child's is set by a parent (./child.js), who sees in
// theirs the time it spends, what it is set to and any concern that came up there, never the words. Each lists the
// others from their vault.json, the one file of theirs it can read.
import { html, nothing } from 'lit-html'
import { signal, computed } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, effective, notify, removing } from '../../ui/state.js'
import { here, switchTo, rpc, files } from '../../ui/opfs.js'
import { scriptURL } from '../../ui/trusted.js'
import { getSecret, setSecret, deleteSecret } from '../../ui/secrets.js'
import { VAULT, vaultKey, vaultId, close, slotKey, deviceKey, encode } from '../../ui/seal.js'
import { readJSON, writeJSON, rootedFS } from '../../core/fs.js'
import { slug } from '../../core/settings.js'
import { ulid } from '../../core/ulid.js'
import { t, useStrings, locale, intlLocales } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { TIER, DANGERS, age, tierFor } from './tier.js'
import { inbox, pair, openFrom, sealFor } from './family.js'

await Promise.all([useStrings('profiles'), styleSheet(new URL('profiles.css', import.meta.url))])

/**
 * A profile as the others see it: its folder and name, its parent's profile if a child's, whether it opens with a lock,
 * and whether it opens only with its parent's, under 13. @typedef {{ dir: string, name: string, parent?: string, locked: boolean, byParent: boolean }} Profile
 */
/** @param {string} dir @returns {Promise<import('../lock/lock.js').Vault | null>} */
const vaultOf = async (dir) => JSON.parse(await app.whole?.read(`${dir}/${VAULT}`) ?? 'null')
export const all = signal(/** @type {Profile[]} */ ([]))
export async function refresh() {
  const dirs = (await app.whole?.list('profiles') ?? []).map(({ name }) => `profiles/${name}`)
  all.value = await Promise.all(dirs.map(async (dir) => {
    const vault = await vaultOf(dir)
    const has = (/** @type {string} */ kind) => !!vault?.slots.some((slot) => slot.kind === kind)
    return { dir, name: vault?.name ?? '', parent: vault?.parent?.profile, locked: !has('device'), byParent: has('parent') }
  }))
}
await refresh()
export const self = computed(() => all.value.find((profile) => profile.dir === here()))
/** Whether this is a child's profile, which a parent set. */
export const child = Boolean(self.peek()?.parent)
const parts = child ? (await import('./child.js')).parts : null
/** A profile's name as the menu says it: this one's may still be the person's name alone. @param {Profile} profile */
export const nameOf = (profile) => profile.name || (profile.dir === here() ? effective.value.settings.name : '') || t('profile.you')
/** Its first letter, as the person's is drawn. @param {Profile} profile */
export const initial = (profile) => ([...new Intl.Segmenter(locale.value).segment(nameOf(profile))][0]?.segment ?? '').toLocaleUpperCase(locale.value)

/** This profile's vault.json changed: its name, read again just before, since the lock writes it too. @param {Record<string, unknown>} patch */
export async function keep(patch) {
  await app.fs.write(VAULT, JSON.stringify({ ...JSON.parse(await app.fs.read(VAULT) ?? '{}'), ...patch }, null, 2) + '\n')
  await refresh()
}

// ─── A parent's: their children's time, settings and concerns ───────────────

/** This profile's own pair, made with its first child's, and when it last saw what they told. @typedef {{ key: JsonWebKey, public: JsonWebKey, seen?: string }} Family */
const FAMILY = '.secrets/family.json'
export const kept = signal(/** @type {Family | null} */ (await readJSON(app.fs, FAMILY, null)))
/** What its children's profiles told it: concerns, the minutes spent each day and what each is set to, by profile. */
export const concerns = signal(/** @type {{ kind: keyof typeof DANGERS, at: string, from: string }[]} */ ([]))
export const minutes = signal(/** @type {Record<string, Record<string, number>>} */ ({}))
export const sets = signal(/** @type {Record<string, import('./tier.js').Tier>} */ ({}))
export async function hear() {
  const family = kept.peek()
  if (!family || !app.whole) return
  const told = (await Promise.all((await app.whole.list(inbox(here()))).map(async ({ name }) => openFrom(family.key, String(await app.whole?.read(`${inbox(here())}/${name}`))).catch(() => null)))).filter(Boolean)
  const before = unseen().length
  concerns.value = told.filter((item) => item.kind).sort((a, b) => (a.at < b.at ? 1 : -1))
  minutes.value = Object.fromEntries(told.filter((item) => item.days).map((item) => [item.from, item.days]))
  sets.value = Object.fromEntries(told.filter((item) => item.set).map((item) => [item.from, item.set]))
  // A new one is told on this device too, once its notifications are allowed.
  const fresh = unseen()
  if (fresh.length > before && globalThis.Notification?.permission === 'granted') {
    const [title, options] = [said(fresh[0]), { body: t('profiles.never'), tag: 'family', lang: locale.peek(), icon: 'icons/icon-192.png' }]
    try { new Notification(title, options) } catch { navigator.serviceWorker?.ready.then((registration) => registration.showNotification(title, options)).catch(console.warn) }
  }
}
export const unseen = () => concerns.peek().filter((item) => item.at > (kept.peek()?.seen ?? ''))
new BroadcastChannel('app-family').onmessage = ({ data }) => { if (data === inbox(here())) hear() }
await hear()

/** What a child's profile is set to, kept here as it would tell it, when this one made or changed it. @param {string} dir @param {import('./tier.js').Tier} set */
export async function tell(dir, set) {
  const family = kept.peek()
  if (family) await app.whole?.write(`${inbox(here())}/set-${dir.slice(9, 35)}.json`, await sealFor(family.public, { from: dir, set }))
}

/**
 * The brains a child's profile may be given (D389): those it was, then this profile's own, kept to none of its projects,
 * never through OpenRouter, whose terms are for adults, nor a plan through This computer, which is off there.
 * @param {import('../../core/types.js').BrainConfig[]} [given]
 */
export const forChild = (given = []) => [...new Map([...given, ...app.settings.value.brains.filter((brain) => !['openrouter', 'claudecode', 'copilot', 'chatgpt'].includes(brain.provider))
  .map(({ projects, ...brain }) => brain)].map((brain) => [brain.id, brain])).values()]

/**
 * Their keys, from this profile's secrets into a child's, whose files `fs` reads, and those of brains taken back, gone there.
 * @param {import('../../core/types.js').FS} fs @param {import('../../core/types.js').BrainConfig[]} brains @param {import('../../core/types.js').BrainConfig[]} [before]
 */
export const give = (fs, brains, before = []) => Promise.all([...brains.map(({ id }) => getSecret(app.fs, id).then((key) => (key ? setSecret(fs, id, key) : null))),
  ...before.filter(({ id }) => !brains.some((brain) => brain.id === id)).map(({ id }) => deleteSecret(fs, id))])

/** A concern as a parent reads it: whose profile, its kind and when. @param {{ kind: keyof typeof DANGERS, at: string, from: string }} item */
const said = (item) => t('profiles.concern', { name: nameOf(all.peek().find((profile) => profile.dir === item.from) ?? { dir: item.from, name: '', locked: false, byParent: false }),
  kind: t(`profiles.kind.${item.kind}`), when: new Date(item.at).toLocaleString(intlLocales(locale.peek()), { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) })

/** Concerns, each with what a parent can do, then Seen while one is new. @param {{ kind: keyof typeof DANGERS, at: string, from: string }[]} items */
export const told = (items) => html`<aside class="offer profile-told" role="alert"><ul class="profile-concerns">${items.map((item) => html`<li><p>${said(item)}</p>
  <details><summary>${t('profiles.whatToDo')}</summary><p>${t(`profiles.help.${item.kind}`)}</p></details></li>`)}</ul><p class="hint">${t('profiles.never')}</p>
  ${items.some((item) => unseen().includes(item)) ? html`<div class="row"><button class="button" @click=${async () => { await writeJSON(app.fs, FAMILY, (kept.value = { .../** @type {Family} */ (kept.peek()), seen: new Date().toISOString() })) }}>${t('profiles.seen')}</button></div>` : nothing}</aside>`

/** Above the box, until seen: the concerns told since. */
function banner() {
  void [concerns.value, kept.value]
  return unseen().length ? told(unseen()) : nothing
}

// ─── Adding one ──────────────────────────────────────────────────────────────

/** Opens the dialog that adds one. */
export const add = () => import('./dialog.js').then((dialog) => dialog.open())

/** A child's profile's files, read and written by a storage worker of its own, handed its vault key, and that worker, to end. @param {string} dir @param {CryptoKey} key */
export async function into(dir, key) {
  const worker = new Worker(scriptURL(new URL('../../ui/storage-worker.js', import.meta.url)), { type: 'module' })
  const call = rpc(worker, crypto.randomUUID())
  if (await call('ping', dir) !== 'open') await call('key', '', /** @type {any} */ (key))
  return { worker, fs: rootedFS(files(call), dir) }
}

/**
 * A profile made, then opened: its vault, and the slot that opens it, this device's, or for a child
 * under 13 their parent's vault key; for a child, what the parent set, with the brains this profile
 * gives it and their keys, sealed under it by a storage worker of its own, and kept here as it would
 * tell it. This profile gets its name if it had none.
 * @param {{ name: string, mine: string, born?: number }} chosen @param {Uint8Array} [parentRaw]
 */
export async function make({ name, mine, born }, parentRaw) {
  const [dir, raw] = [`profiles/${ulid()}-${slug(name) || 'profile'}`, crypto.getRandomValues(new Uint8Array(32))]
  const [key, slot] = [await vaultKey(raw), { kind: /** @type {const} */ ('parent'), profile: here(), salt: encode(crypto.getRandomValues(new Uint8Array(16))) }]
  const slots = [born !== undefined && age(born) < 13 && parentRaw ? await close(raw, await slotKey(slot, parentRaw), slot)
    : await close(raw, /** @type {CryptoKey} */ (await deviceKey('make', dir)), { kind: 'device' })]
  if (born !== undefined && !kept.peek()) await writeJSON(app.fs, FAMILY, (kept.value = await pair()))
  const parent = born !== undefined && { profile: here(), key: kept.peek()?.public }
  await app.whole?.write(`${dir}/${VAULT}`, JSON.stringify({ format: 1, id: encode(await vaultId(key)), slots, name, ...(parent && { parent }) }, null, 2) + '\n')
  if (born !== undefined) {
    const [{ worker, fs }, set] = [await into(dir, key), { ...tierFor(born), brains: forChild() }]
    await Promise.all([writeJSON(fs, TIER, set), give(fs, set.brains)])
    worker.terminate()
    await tell(dir, set)
  }
  for (const bytes of [raw, parentRaw]) bytes?.fill(0)
  if (!self.peek()?.name) await keep({ name: mine })
  switchTo(dir)
}

/** Children's profiles that open only with this one's key, under 13: removing it would leave them closed for good. */
export const needing = () => all.value.filter((profile) => profile.parent === here() && profile.byParent)

/**
 * A profile gone, with what it told this one, once the person confirms and nothing refuses (D412); this one's opens another.
 * Never this one while a child's profile opens only with it. @param {Profile} profile
 */
export async function remove(profile) {
  if (profile.dir === here() && needing().length) return notify(t('profiles.needed', { names: new Intl.ListFormat(intlLocales()).format(needing().map(nameOf)) }))
  if (!confirm(t('profiles.removeConfirm', { name: nameOf(profile) })) || !(await removing([{ profile: profile.dir }], async () => {
    for (const path of [profile.dir, inbox(profile.dir), ...['time', 'set'].map((what) => `${inbox(here())}/${what}-${profile.dir.slice(9, 35)}.json`)]) await app.whole?.remove(path)
    await deviceKey('forget', profile.dir)
  }))) return
  if (profile.dir === here()) return switchTo(all.peek().find((other) => other.dir !== here())?.dir ?? '')
  notify(t('profiles.removed', { name: nameOf(profile) }))
  await Promise.all([refresh(), hear()])
}

// ─── The menu and Settings › Profiles ────────────────────────────────────────

/** At the top of the person's menu: every profile, once there are two, to switch to, then Add a profile. @param {string} id the menu's */
const menu = (id) => html`${all.value.length > 1 ? all.value.map((profile) => html`<button type="button" class="profile-switch" aria-current=${profile.dir === here() ? 'true' : 'false'}
    popovertarget=${id} popovertargetaction="hide" @click=${() => { if (profile.dir !== here()) switchTo(profile.dir) }}>
    <span class="avatar" aria-hidden="true">${initial(profile)}</span><span dir="auto">${nameOf(profile)}</span>${profile.dir === here() ? icons.check : profile.locked ? icons.lock : nothing}</button>`) : nothing}
  ${child ? nothing : html`<button type="button" popovertarget=${id} popovertargetaction="hide" @click=${add}>${icons.plus}${t('profiles.add')}</button>`}<hr>`

/** Settings › Profiles, from ./page.js, loaded the first time it shows. */
const page = signal(/** @type {(() => unknown) | null} */ (null))
let paging = false

register({
  id: 'profiles',
  ...(parts && { tools: parts.tools, lines: parts.lines }),
  slots: {
    // The person at the drawer's foot is named by this profile, the first name they set coming first.
    profiles: { at: 0, draw: menu }, person: { at: 0, draw: () => self.value?.name },
    dialog: { at: 2, draw: () => html`<app-profile-dialog></app-profile-dialog>` },
    settings: [{ id: 'profiles', at: 15, label: 'profiles.title', icon: icons.person, when: () => all.value.length > 1, draw: () => {
      if (!paging) { paging = true; import('./page.js').then((module) => { page.value = module.section }) }
      return page.value?.() ?? nothing
    } }, ...(parts ? [parts.settings] : [])],
    above: [{ at: 0, draw: banner }, ...(parts ? [parts.above] : [])],
    ...(parts && { modes: parts.modes, brains: parts.brains }),
  },
})
