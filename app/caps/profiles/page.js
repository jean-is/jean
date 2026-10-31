// Settings › Profiles (D228): a concern not yet seen, then every profile on this device, each saying how it opens,
// a child's of this one its age and today's minutes. This one's row opens its page, profiles/<ULID>: its name, its lock,
// and Remove, held while a child's under 13 opens only with it. A child's opens theirs: concerns, the week, what it is
// set to in three baskets, Change, which asks this profile's way in once and changes it here, and Remove. Another's
// only opens. Loaded the first time Settings shows Profiles.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { app } from '../../ui/state.js'
import { openSettings, pageOpen } from '../../ui/dialogs.js'
import { here, switchTo } from '../../ui/opfs.js'
import { VAULT, vaultKey, unseal, slotKey, deviceKey } from '../../ui/seal.js'
import { readJSON, writeJSON } from '../../core/fs.js'
import { t, intlLocales } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { TIER, age, thirteen } from './tier.js'
import { reseal } from './family.js'
import { all, child, nameOf, initial, keep, remove, add, needing, concerns, minutes, sets, kept, unseen, told, hear, tell, forChild, give, into } from './profiles.js'
import { baskets, facts, week, editor, years, span, changer } from './view.js'

/** @typedef {import('./profiles.js').Profile} Profile @typedef {import('./tier.js').Tier} Tier @typedef {import('../../ui/seal.js').Slot} Slot */

/** A profile's page, by its folder's ULID. @param {string} dir */
const idOf = (dir) => dir.slice(9, 35)
// The page open (pageOpen()): a profile's ULID, or '' for the list.

/** Opens the list ('') or a page, the keyboard on its title, or back on the list on the profile's row. @param {string} to */
function go(to) {
  const from = pageOpen()
  app.section.value = to ? `profiles/${to}` : 'profiles'
  changing.value = null
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '.profile-head h2' : `[data-profile="${from}"]`))?.focus())
}

/** Settings › Profiles: the list, or the page open. */
export function section() {
  void [concerns.value, kept.value]
  const profile = all.value.find((one) => idOf(one.dir) === pageOpen())
  return !profile ? list() : profile.dir === here() && !child ? own(profile) : profile.parent === here() ? kid(profile) : list()
}

/** What a row says under a profile's name: this one and its lock; a child's of this one, their age and today's minutes. @param {Profile} profile */
function line(profile) {
  const [set, today] = [sets.value[profile.dir], t('profiles.today', { time: span(minutes.value[profile.dir]?.[new Date().toLocaleDateString('sv')] ?? 0) })]
  if (profile.parent === here()) return set ? `${years(set.born)} · ${today}` : today
  return [profile.dir === here() && t('profiles.this'), profile.locked && t('profiles.locked'), profile.parent && profile.dir !== here() && t('profiles.aChild')].filter(Boolean).join(' · ')
}

/** The concerns not yet seen, every profile, and the way to add one. */
function list() {
  const fresh = unseen()
  return html`<header class="profile-head"><h2>${t('profiles.title')}</h2>${child ? nothing : html`<button class="button" @click=${add}>${icons.plus} ${t('profiles.add')}</button>`}</header>
    ${fresh.length ? told(fresh) : nothing}
    <section><ul class="list profiles">${all.value.map((profile) => {
      // This one's and a child's of this one open their page; another's only opens.
      const body = html`<span class="avatar" aria-hidden="true">${initial(profile)}</span><span class="item-text"><strong dir="auto">${nameOf(profile)}</strong><small>${line(profile)}</small></span>`
      return (profile.dir === here() && !child) || profile.parent === here() ? html`<li><button class="item" data-profile=${idOf(profile.dir)} @click=${() => go(idOf(profile.dir))}>${body}
        ${fresh.some((item) => item.from === profile.dir) ? html`<span class="profile-state">${t('profiles.worry')}</span>` : nothing}${icons.chevron}</button></li>`
        : html`<li><span class="item">${body}</span>${profile.dir === here() ? nothing : html`<button class="button subtle" @click=${() => switchTo(profile.dir)}>${t('profiles.open')}</button>`}</li>`
    })}</ul></section>
    <p class="hint">${t('profiles.what')}</p>`
}

/** Back to the list, the page's face, its name and a line, then what is at its end. @param {Profile} profile @param {unknown} said @param {unknown} [end] */
const head = (profile, said, end = nothing) => html`<button class="back button subtle" @click=${() => go('')}>${icons.back} ${t('profiles.title')}</button>
  <header class="profile-head"><span class="avatar" aria-hidden="true">${initial(profile)}</span><div><h2 dir="auto" tabindex="-1">${nameOf(profile)}</h2><p class="lede">${said}</p></div>${end}</header>`

/** This profile's page: its name, how it opens, what its children's tell it, and Remove, held while one of theirs needs it. @param {Profile} profile */
function own(profile) {
  const held = needing()
  return html`${head(profile, t('profiles.this'))}
    <section class="stack">
      <label>${t('profiles.yours')}<input .value=${profile.name} maxlength="40" dir="auto" @change=${(/** @type {Event} */ e) => keep({ name: /** @type {HTMLInputElement} */ (e.target).value.trim() })}></label>
      <ul class="list profiles"><li><button class="item" @click=${() => openSettings('data/lock')}><span class="item-icon">${icons.lock}</span>
        <span class="item-text"><strong>${t(profile.locked ? 'profiles.locked' : 'profiles.unlocked')}</strong><small>${t('settings.storage')}</small></span>${icons.chevron}</button></li>
        ${all.value.some((other) => other.parent === here()) ? html`<li><span class="item"><span class="item-icon">${icons.person}</span><span class="item-text"><small>${t('profiles.hears')}</small></span></span></li>` : nothing}</ul>
    </section>
    <div class="row"><button class="button subtle danger" ?disabled=${held.length > 0} aria-describedby="profile-held" @click=${() => remove(profile)}>${icons.trash} ${t('profiles.remove')}</button></div>
    ${held.length ? html`<p class="hint" id="profile-held">${t('profiles.needed', { names: new Intl.ListFormat(intlLocales()).format(held.map(nameOf)) })}</p>` : nothing}`
}

// ─── Changing what a child's profile is set to, from here ────────────────────

/**
 * A child's settings being changed here: asking this profile's way in, what stops it, or open: what is set as it
 * changes, the brains it was given, a storage worker on the child's vault, and both vault keys, which seal its slots again for their age.
 * @typedef {{ dir: string, said?: string, tier?: Tier, given?: import('../../core/types.js').BrainConfig[], worker?: Worker, fs?: import('../../core/types.js').FS, raw?: Uint8Array, parent?: Uint8Array }} Changing
 */
const changing = signal(/** @type {Changing | null} */ (null))
/** The lock's ways in, and what can be turned off, loaded once a parent first asks. @type {[typeof import('../lock/lock.js'), string[]] | null} */
let loaded = null

/** @param {Profile} profile */
const ask = async (profile) => { loaded ??= await changer(); changing.value = { dir: profile.dir } }

/**
 * This profile's way in given: the child's vault key from the slot their parent's opens, under 13, or from this device's;
 * a teenager's own lock is theirs, and changes are made with them, in their profile. @param {Profile} profile @param {Uint8Array} parent
 */
async function enter(profile, parent) {
  const slots = /** @type {Slot[]} */ (JSON.parse(await app.whole?.read(`${profile.dir}/${VAULT}`) ?? '{}').slots ?? [])
  const [byParent, device] = [slots.find((slot) => slot.kind === 'parent'), slots.find((slot) => slot.kind === 'device')]
  const key = !byParent && device ? await deviceKey('get', profile.dir) : null
  if (!byParent && !key) { parent.fill(0); changing.value = { dir: profile.dir, said: t('profiles.ownLock', { name: nameOf(profile) }) }; return }
  const raw = byParent ? await unseal(byParent, await slotKey(byParent, parent)) : await unseal(/** @type {Slot} */ (device), /** @type {CryptoKey} */ (key))
  const { worker, fs } = await into(profile.dir, await vaultKey(raw))
  const tier = await readJSON(fs, TIER, sets.peek()[profile.dir])
  changing.value = { dir: profile.dir, tier, given: tier?.brains, worker, fs, raw, parent }
}

/** Kept as the parent leaves it, with the keys of the brains it is given, its slots sealed again for the child's age, and told here; or left as it was. @param {boolean} keepIt */
async function leave(keepIt) {
  const { dir, tier, given, fs, worker, raw, parent } = /** @type {Changing} */ (changing.peek())
  if (keepIt && tier && fs && raw && parent) {
    await Promise.all([writeJSON(fs, TIER, { ...tier, by: app.deviceId, updatedAt: new Date().toISOString() }), give(fs, tier.brains ?? [], given)])
    const vault = JSON.parse(await app.whole?.read(`${dir}/${VAULT}`) ?? '{}')
    await app.whole?.write(`${dir}/${VAULT}`, JSON.stringify({ ...vault, slots: await reseal(vault.slots, raw, parent, tier.born, dir, here()) }, null, 2) + '\n')
    await tell(dir, tier)
  }
  worker?.terminate()
  for (const bytes of [raw, parent]) bytes?.fill(0)
  changing.value = null
  await hear()
}

/** A child's page: concerns, the week, what it is set to and the way to change it, when it opens on its own, and Remove. @param {Profile} profile */
function kid(profile) {
  const [set, now] = [sets.value[profile.dir], changing.value?.dir === profile.dir ? changing.value : null]
  const theirs = concerns.value.filter((item) => item.from === profile.dir).slice(0, 5)
  const change = (/** @type {Partial<Tier>} */ patch) => { changing.value = { .../** @type {Changing} */ (changing.peek()), tier: { .../** @type {Tier} */ (changing.peek()?.tier), ...patch } } }
  return html`${head(profile, set ? `${years(set.born)} · ${t('profiles.byYou')}` : t('profiles.aChild'), html`<button class="button" @click=${() => switchTo(profile.dir)}>${t('profiles.open')}</button>`)}
    ${theirs.length ? told(theirs) : nothing}
    <section><h3>${t('profiles.week')}</h3>${week(minutes.value[profile.dir] ?? {})}</section>
    <section><div class="profile-split"><h3>${t('profiles.tier')}</h3>${now ? nothing : html`<button class="button subtle" @click=${() => ask(profile)}>${icons.key} ${t('profiles.edit')}</button>`}</div>
      ${now?.tier && loaded ? html`${editor(now.tier, change, loaded[1], forChild(now.given))}<div class="row"><button class="button primary" @click=${() => leave(true)}>${t('profiles.done')}</button>
        <button class="button subtle" @click=${() => leave(false)}>${t('profiles.cancel')}</button></div>`
      : now && loaded ? html`<p class="lede">${now.said ?? t('profiles.toChange')}</p>${now.said ? nothing : loaded[0].ways((raw) => enter(profile, raw))}
        <div class="row"><button class="button subtle" @click=${() => leave(false)}>${t('profiles.cancel')}</button></div>`
      : set ? html`${baskets(set)}${facts(set)}` : nothing}
      <p class="hint">${t('profiles.there', { name: nameOf(profile) })}</p></section>
    ${set && age(set.born) < 13 ? html`<p class="hint">${t('profiles.from13', { name: nameOf(profile), date: new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'long' }).format(thirteen(set.born)) })}</p>` : nothing}
    <div class="row"><button class="button subtle danger" @click=${() => remove(profile)}>${icons.trash} ${t('profiles.remove')}</button></div>`
}
