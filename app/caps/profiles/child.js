// A child's profile (D228), loaded with Profiles there. What a parent set (./tier.js) takes the place
// of the settings it locks, which say "Set by a parent", and changes only with the parent's password
// or passkey, which lifts its locks while they change it. A danger Intuition reads in a message, or
// the brain raises, is told to the parent's profile, its kind and when, never the words, unless it is
// at home; so is the time spent here. The child is told so from the start. Each message comes with
// Learn it's steps, read from Jean's own directory whether or not the profile has the skill (D394).
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { configureCapabilities } from '../../ui/caps.js'
import { app, updateSettings, rememberUnlocked, conversationOf } from '../../ui/state.js'
import { here, mine } from '../../ui/opfs.js'
import { VAULT, unseal, slotKey, deviceKey } from '../../ui/seal.js'
import { readJSON, writeJSON } from '../../core/fs.js'
import { noteRecord } from '../../core/events.js'
import { parseSkill } from '../../core/skills.js'
import { ulid } from '../../core/ulid.js'
import { t, intlLocales } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { TIER, DANGERS, age, tierFor, asPolicy, helpline, helplineOf, thirteen, learning } from './tier.js'
import { inbox, sealFor, reseal } from './family.js'
import { baskets, facts, editor } from './view.js'

/** @import { Tier } from './tier.js' */
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
/** Whether the parent's way in is asked for, or they are in. */
const stage = signal(/** @type {'' | 'asking' | 'changing'} */ (''))
/** The lock's ways in, and what can be turned off, loaded once the parent asks. @type {[typeof import('../lock/lock.js'), string[]] | null} */
let loaded = null

/** What the parent set, as policy, while they're away, before settings are read (ui/app.js); lifted while they change it. */
app.policy = asPolicy(tier.value, org, line)
// And told to their profile as this one opens, where this child's page shows it (D513).
sealFor(parent.key, { from: here(), set: tier.value }).then((text) => app.whole?.write(`${inbox(parent.profile)}/set-${here().slice(9, 35)}.json`, text)).catch(console.warn)

async function ask() {
  loaded ??= await Promise.all([import('../lock/lock.js'), import('../../ui/discovery.js').then((module) => module.CATALOGUE)])
  stage.value = 'asking'
}

/** The parent in, with their vault key: what they set no longer locks anything until they're done. @param {Uint8Array} raw */
function enter(raw) {
  opened = raw
  stage.value = 'changing'
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
  await app.fs.write(VAULT, JSON.stringify({ ...kept, slots: await reseal(kept.slots, raw, /** @type {Uint8Array} */ (opened), next.born, here(), parent.profile) }, null, 2) + '\n')
  for (const bytes of [raw, opened]) bytes?.fill(0)
  // Opened afresh at the place, Settings closed: the parent is done.
  history.replaceState(null, '', location.pathname + location.hash.replace(/settings.*$/, ''))
  location.reload()
}

/** @param {Partial<Tier>} patch */
const set = (patch) => { tier.value = { ...tier.peek(), ...patch } }
/** What the parent set, as the child reads it: by their parent's name, in three baskets, with the danger rule and their helpline kept in view, and when the profile opens on its own (D513). */
const number = helplineOf(navigator.languages)
const section = () => html`<h2 dir="auto">${theirs?.name ? t('profiles.setBy', { name: theirs.name }) : t('profiles.tier')}</h2><p class="muted">${t('profiles.tierText')}</p>
  ${stage.value === 'changing' && loaded ? html`${editor(tier.value, set, loaded[1])}<p class="hint">${t('profiles.alsoHere')}</p>
    <div class="row"><button class="button primary" @click=${done}>${t('profiles.done')}</button></div>`
  : html`${baskets(tier.value, (choice) => (choice === 'later' || !theirs?.name ? t(`profiles.choice.${choice}`) : t(`profiles.forYou.${choice}`, { name: theirs.name })))}${facts(tier.value)}
    ${stage.value === 'asking' && loaded ? loaded[0].ways(enter, theirs) : html`<div class="row"><button class="button" @click=${ask}>${icons.key} ${t('profiles.change')}</button></div>`}`}
  <section class="profile-tell">${icons.shield}<div><p>${t('profiles.shared')}</p>${number ? html`<p>${t('profiles.helpline', { number })}</p>` : nothing}</div></section>
  ${age(tier.value.born) < 13 ? html`<p class="hint">${t('profiles.from13', { name: self.name ?? '', date: new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'long' }).format(thirteen(tier.value.born)) })}</p>` : nothing}`

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

let learn = ''
fetch(new URL('../skills/directory/learn-it/SKILL.md', import.meta.url)).then(async (response) => { learn = response.ok ? parseSkill(await response.text(), response.url)?.body ?? '' : '' }).catch(console.warn)

/** What the brain is told before each message: Learn it's steps, then a danger Intuition read in it. @param {unknown} _ @param {import('../../ui/auto.js').Signals} [signals] */
function notes(_, signals) {
  const kind = /** @type {keyof typeof DANGERS | 'home' | undefined} */ (signals?.danger)
  const steps = learn ? [noteRecord(learning(learn), { kind: 'mode', mode: 'learn-it' })] : []
  if (!kind) return steps
  if (kind !== 'home') concern(kind, app.current.peek()?.id ?? '', 'reflexes').catch(console.warn)
  return [...steps, noteRecord(kind === 'home'
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
