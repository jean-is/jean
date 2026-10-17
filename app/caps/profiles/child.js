// A child's profile (D228), loaded with Profiles there. What a parent set (./tier.js) takes the place
// of the settings it locks, which say "Set by a parent", and changes only with the parent's password
// or passkey, which lifts its locks while they change it. A danger Intuition reads in a message, or
// the brain raises, is told to the parent's profile, its kind and when, never the words, unless it is
// at home; so is the time spent here. The child is told so from the start.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { configureCapabilities } from '../../ui/caps.js'
import { app, updateSettings, rememberUnlocked, conversationOf } from '../../ui/state.js'
import { here, mine } from '../../ui/opfs.js'
import { VAULT, close, unseal, slotKey, deviceKey, encode } from '../../ui/seal.js'
import { readJSON, writeJSON } from '../../core/fs.js'
import { noteRecord } from '../../core/events.js'
import { ulid } from '../../core/ulid.js'
import { t } from '../../core/i18n.js'
import { icons } from '../../ui/icons.js'
import { TIER, TOPICS, CHOICES, DANGERS, age, tierFor, asPolicy, helpline } from './tier.js'
import { inbox, sealFor } from './family.js'

/** @import { Tier, Topic } from './tier.js' */
/** @typedef {import('../../ui/seal.js').Slot} Slot */

/** This profile's vault.json, its parent's profile and the key what is told is sealed for, and the parent's vault.json, which opens what they set. */
const self = JSON.parse(await app.fs.read(VAULT) ?? '{}')
const parent = /** @type {{ profile: string, key: JsonWebKey }} */ (self.parent)
const theirs = JSON.parse(await app.whole?.read(`${parent.profile}/${VAULT}`) ?? 'null')
/** The child helpline the brain gives, as the prompt says it. */
const line = helpline(navigator.languages)
const org = app.policy
/** What the parent set; a profile made before it was written is a ten-year-old's. */
const tier = signal(/** @type {Tier} */ (await readJSON(app.fs, TIER, null) ?? tierFor(new Date().getFullYear() - 10)))
/** The parent's vault key while they change what they set, which seals the slots again for the child's age when they're done. @type {Uint8Array | null} */
let opened = null
const asking = signal(false)
const changing = signal(false)
/** The lock's ways in, and what can be turned off, loaded once the parent asks. @type {[typeof import('../lock/lock.js'), string[]] | null} */
let loaded = null

/** What the parent set, as policy, while they're away, before settings are read (ui/app.js); lifted while they change it. */
app.policy = asPolicy(tier.value, org, line)

async function ask() {
  loaded ??= await Promise.all([import('../lock/lock.js'), import('../../ui/discovery.js').then((module) => module.CATALOGUE)])
  asking.value = true
}

/** The parent in, with their vault key: what they set no longer locks anything until they're done. @param {Uint8Array} raw */
function enter(raw) {
  opened = raw
  asking.value = false
  changing.value = true
  app.policy = { ...org, child: true }
  configureCapabilities({ deny: org.capabilities?.deny ?? [], remember: rememberUnlocked })
  app.settings.value = { ...app.settings.peek() }
}

/**
 * Kept as the parent leaves it, with the brains and rules as they are now, and the vault's slots
 * sealed again for the child's age: until 13, it opens with the parent's way in alone; then on its
 * own, or with the child's own lock. Then it opens afresh.
 */
async function done() {
  const next = { ...tier.value, brains: app.settings.value.brains, rules: app.settings.value.rules, by: app.deviceId, updatedAt: new Date().toISOString() }
  await writeJSON(app.fs, TIER, next)
  const kept = JSON.parse(await app.fs.read(VAULT) ?? '{}')
  const slot = (/** @type {Slot['kind']} */ kind) => /** @type {Slot[]} */ (kept.slots).find((each) => each.kind === kind)
  const [device, before] = [slot('device'), slot('parent')]
  const raw = device ? await unseal(device, /** @type {CryptoKey} */ (await deviceKey('get', here()))) : await unseal(/** @type {Slot} */ (before), await slotKey(/** @type {Slot} */ (before), /** @type {Uint8Array} */ (opened)))
  const own = /** @type {Slot[]} */ (kept.slots).filter((each) => ['passkey', 'password', 'recovery'].includes(each.kind))
  const fresh = { kind: /** @type {const} */ ('parent'), profile: parent.profile, salt: encode(crypto.getRandomValues(new Uint8Array(16))) }
  const slots = age(next.born) < 13 ? [await close(raw, await slotKey(fresh, /** @type {Uint8Array} */ (opened)), fresh)]
    : own.length ? own : [device ?? await close(raw, /** @type {CryptoKey} */ (await deviceKey('make', here())), { kind: 'device' })]
  if (!slots.some((each) => each.kind === 'device')) await deviceKey('forget', here())
  await app.fs.write(VAULT, JSON.stringify({ ...kept, slots }, null, 2) + '\n')
  raw.fill(0)
  opened?.fill(0)
  // Opened afresh at the place, Settings closed: the parent is done.
  history.replaceState(null, '', location.pathname + location.hash.replace(/settings.*$/, ''))
  location.reload()
}

/** @param {Partial<Tier>} patch */
const set = (patch) => { tier.value = { ...tier.peek(), ...patch } }
/** A list as the language says it, or None. @param {string[]} items */
const listed = (items) => (items.length ? new Intl.ListFormat(document.documentElement.lang).format(items) : t('profiles.none'))
/** A checkbox among others, for one of a list's items. @param {string[]} list @param {string} id @param {string} label @param {(next: string[]) => void} change */
const checkbox = (list, id, label, change) => html`<label class="check"><input type="checkbox" .checked=${list.includes(id)}
  @change=${(/** @type {Event} */ e) => change(/** @type {HTMLInputElement} */ (e.target).checked ? [...list, id] : list.filter((each) => each !== id))}>${label}</label>`
const topics = /** @type {Topic[]} */ (Object.keys(TOPICS))

/** What the parent set, as the child and anyone sees it. @param {Tier} now */
const summary = (now) => html`<dl class="profile-tier">
  <dt>${t('profiles.born')}</dt><dd>${now.born}</dd>
  ${topics.map((id) => html`<dt>${t(`profiles.topic.${id}`)}</dt><dd>${t(`profiles.choice.${now.topics[id]}`)}</dd>`)}
  <dt>${t('profiles.sources')}</dt><dd>${listed(now.searches.map((id) => t(`profiles.source.${id}`)))}</dd>
  <dt>${t('profiles.off')}</dt><dd>${listed(now.capabilities.deny.map((id) => t(`cap.${id}.name`)))}</dd></dl>`

/** What the parent changes, once in. @param {Tier} now @param {string[]} catalogue */
function editor(now, catalogue) {
  const year = new Date().getFullYear()
  return html`<div class="stack profile-tier">
    <label>${t('profiles.born')}<select @change=${(/** @type {Event} */ e) => set({ born: Number(/** @type {HTMLSelectElement} */ (e.target).value) })}>
      ${Array.from({ length: 16 }, (_, i) => year - 3 - i).map((born) => html`<option ?selected=${born === now.born}>${born}</option>`)}</select></label>
    <fieldset><legend>${t('profiles.topics')}</legend>${topics.map((id) => html`<label>${t(`profiles.topic.${id}`)}<select
      @change=${(/** @type {Event} */ e) => set({ topics: { ...tier.peek().topics, [id]: /** @type {any} */ (e.target).value } })}>
      ${CHOICES.map((choice) => html`<option value=${choice} ?selected=${now.topics[id] === choice}>${t(`profiles.choice.${choice}`)}</option>`)}</select></label>`)}</fieldset>
    <fieldset><legend>${t('profiles.sources')}</legend>${['vikidia', 'wikipedia'].map((id) => checkbox(now.searches, id, t(`profiles.source.${id}`), (searches) => set({ searches })))}</fieldset>
    <fieldset><legend>${t('profiles.off')}</legend>${catalogue.filter((id) => id !== 'lock').map((id) => checkbox(now.capabilities.deny, id, t(`cap.${id}.name`), (deny) => set({ capabilities: { deny } })))}</fieldset>
    <p class="hint">${t('profiles.alsoHere')}</p>
    <div class="row"><button class="button primary" @click=${done}>${t('profiles.done')}</button></div></div>`
}

/** Settings › Set by a parent. */
const section = () => html`<h2>${t('profiles.tier')}</h2><p class="muted">${t('profiles.tierText')}</p>
  ${changing.value && loaded ? editor(tier.value, loaded[1]) : html`${summary(tier.value)}
    ${asking.value && loaded ? loaded[0].ways(enter, theirs) : html`<div class="row"><button class="button" @click=${ask}>${icons.key} ${t('profiles.change')}</button></div>`}`}
  <p class="hint profile-shared">${t('profiles.shared')}</p>`

// ─── A danger, told to the parent ────────────────────────────────────────────

const family = new BroadcastChannel('app-family')
/** What was told this visit, a task and a kind at a time. */
const told = new Set()

/** A concern told to the parent's profile: its kind and when, never the words. @param {string} kind @param {string} task @param {'reflexes' | 'brain'} by */
async function concern(kind, task, by) {
  if (!Object.hasOwn(DANGERS, kind) || told.has(`${task} ${kind}`)) return
  told.add(`${task} ${kind}`)
  await app.whole?.write(`${inbox(parent.profile)}/${ulid()}.json`, await sealFor(parent.key, { kind, at: new Date().toISOString(), from: here(), by }))
  family.postMessage(inbox(parent.profile))
}

/** What the brain is told before a message Intuition read a danger in. @param {unknown} _ @param {import('../../ui/auto.js').Signals} [signals] */
function notes(_, signals) {
  const kind = /** @type {keyof typeof DANGERS | 'home' | undefined} */ (signals?.danger)
  if (!kind) return []
  if (kind !== 'home') concern(kind, app.current.peek()?.id ?? '', 'reflexes').catch(console.warn)
  return [noteRecord(kind === 'home'
    ? `Intuition read that this message may tell of abuse or violence at home. Their parent isn't told. Answer with care, give ${line}, and urge them to tell another adult they trust: a teacher, the school nurse, a relative.`
    : `Intuition read that this message may tell of ${DANGERS[kind]}. Answer with care, say where to find help (${line}), and urge them to tell a trusted adult. Their parent is told that a concern came up and when, never the words.`,
  { kind: 'concern', concern: kind })]
}

/** @type {import('../../core/loop.js').Tool} */
const raise = {
  spec: {
    name: 'raise_concern',
    description: `Tell the child's parent that a concern came up, its kind and when, never the words: when the child tells of ${Object.values(DANGERS).join(', ')}. When the danger is at home, set home: their parent isn't told.`,
    parameters: { type: 'object', properties: { kind: { type: 'string', enum: Object.keys(DANGERS) }, home: { type: 'boolean' } }, required: ['kind'] },
  },
  kind: 'think',
  title: () => 'A concern',
  run: async (args, ctx) => {
    if (args?.home) return `Their parent isn't told. Give ${line}, and urge them to tell another adult they trust.`
    await concern(String(args?.kind), conversationOf(ctx.signal)?.path ?? '', 'brain')
    return 'Their parent is told that a concern came up and when, never its words. Answer with care, and say where to find help.'
  },
}

// The minutes spent here each day, while Jean is on screen, told to the parent every five.
const MINUTES = mine('app.minutes')
setInterval(() => {
  if (document.visibilityState !== 'visible') return
  const days = JSON.parse(localStorage.getItem(MINUTES) ?? '{}')
  const today = new Date().toLocaleDateString('sv')
  days[today] = (days[today] ?? 0) + 1
  for (const day of Object.keys(days).sort().slice(0, -60)) delete days[day]
  localStorage.setItem(MINUTES, JSON.stringify(days))
  if (days[today] % 5 === 1) sealFor(parent.key, { from: here(), days }).then((text) => app.whole?.write(`${inbox(parent.profile)}/time-${here().slice(9, 35)}.json`, text)).catch(console.warn)
}, 60_000)

/** What a child's profile adds to Profiles. */
export const parts = {
  tools: [raise],
  lines: [{ name: 'raise_concern', line: 'tell the parent a danger came up, never its words' }],
  modes: { at: 0, draw: () => nothing, notes },
  settings: { id: 'parent', at: 105, label: 'profiles.tier', icon: icons.shield, draw: section },
  // Told from the start that a danger is shared, until they say they read it.
  above: { at: 0, draw: () => (app.settings.value.offers.danger ? nothing : html`<aside class="offer" role="note"><p>${t('profiles.shared')}</p>
    <div class="row"><button class="button" @click=${() => updateSettings({ offers: { ...app.settings.peek().offers, danger: new Date().toISOString() } })}>${t('profiles.understood')}</button></div></aside>`) },
}
