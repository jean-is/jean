// What follows a person from one of their devices to another (D700): settings field by field, brains and connections item
// by item, each with the time it last changed, the newest winning, a removal kept as a tombstone. State, not a stream of
// changes, since messages expire and devices sleep. What belongs to one device stays: its voice, its counters, the brains it
// alone runs, addresses on this computer. A field cleared travels as null, with its time. The keys that cross are chosen by
// crossing() in ui/secrets.js. Pure.
import { DEFAULT_SETTINGS, isLocal } from '../../core/settings.js'
import { DEFAULT_RULES, STRICT } from '../../core/rules.js'

/** @typedef {import('../../core/settings.js').Settings} Settings */
/** When each field, brain and connection last changed, in ms by the relay's clock; a removed item's, gone, with where it pointed. @typedef {{ fields: Record<string, number>, brains: Record<string, Stamp>, connections: Record<string, Stamp> }} Times */
/** @typedef {{ at: number, gone?: true, address?: string }} Stamp */
/** What one device sends another, a field cleared there as null. @typedef {{ fields: Record<string, { value: any, at: number }>, brains: Record<string, { value: any, at: number }>, connections: Record<string, { value: any, at: number }> }} Snapshot */

/** The fields that follow the person, each with the kind of value it holds (core/types.d.ts), which another device's must be. @type {Record<string, string>} */
const KINDS = { locale: 'string', name: 'string', brains: 'array', activeBrain: 'string', guards: 'array', unlocked: 'array', off: 'array', auto: 'boolean', offers: 'object',
  memory: 'boolean', connections: 'array', urls: 'object', mapStyles: 'object', sources: 'array', searches: 'array', search: 'boolean', maskWords: 'array', services: 'object', rules: 'object' }
export const FOLLOWS = /** @type {(keyof Settings)[]} */ (Object.keys(KINDS))
/**
 * Those of this device. `cloud` keeps messages on this device, chosen against the brains it runs, which stay; `pages`, `meet`, `films`,
 * the approvals' Always allow, of a kind of action's (`rules`) and of a service's (`services`), both of which follow with their Ask first
 * and Never alone, let things happen without asking, never spread unasked; `forget` deletes this device's
 * tasks for good and `certificates` holds its seal, both "on this device" in Your data; `grouped` is offered from this device's tasks;
 * `limit` is against what this device's answers cost, which its page counts; a look is sized for its screen. @type {(keyof Settings)[]}
 */
export const STAYS = ['format', 'voice', 'cloud', 'notifications', 'dock', 'terminal', 'windowed', 'computer', 'pictures', 'backedUp', 'restored', 'hurried',
  'dictated', 'cited', 'browsed', 'photos', 'readAloud', 'naturalVoice', 'stepped', 'look', 'pages', 'meet', 'films', 'extensions', 'forgotAt', 'groupedAt', 'retried',
  'forget', 'certificates', 'grouped', 'limit', 'wasAuto']
/** Followed item by item. */
const ITEMS = /** @type {const} */ (['brains', 'connections'])
/** Capabilities of this device alone. */
const OWN = ['machine', 'brain-local', 'folders', 'sync']
/** Capabilities turned off on this device alone: its own, those whose weights each device downloads, and Your devices, which, turned off, would never hear it turned on again. */
const LOCAL_OFF = ['devices', 'reflexes', 'meaning', 'natural-voice', ...OWN]
/** Offers whose answer is a consent to download on this device: dictation's writers, live conversation's. */
const OWN_OFFERS = ['voice.download', 'voice.whistle', 'live']
/** An id Jean gives a brain or a connection: a ULID, never one a secret that stays has (computer-bridge, signin, share:…). */
export const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
/** Those the catalogue (ui/discovery.js) holds only where a device can: unlocked where it can't, they would load there (D660). */
export const CONDITIONAL = ['reflexes', 'meaning', 'notifications', 'camera', 'screen', 'share', 'sync', 'devices']

/** An address, or one of several, on this computer. @param {unknown} url */
const here = (url) => String(url).split(/\s+/).some((one) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(one))
/**
 * Of settings' `urls`, one of this device alone: all but where web search's sources read, which follow unless on this computer, since
 * keys and tokens go to some (a search service's, a registry's, the gateway's) and the rest are each device's (who dates certificates).
 * @param {[string, unknown]} entry
 */
const ownURL = ([name, url]) => here(url) || !['wikipedia', 'vikidia', 'kiwix', 'searchPage'].includes(name)
/** Those of settings' `urls` that stay on this device, or, `theirs`, those that follow. @param {Record<string, string>} [urls] @param {boolean} [theirs] */
const ownURLs = (urls, theirs = false) => Object.fromEntries(Object.entries(urls ?? {}).filter((one) => ownURL(one) !== theirs))
/** Where an item's key or sign-in goes, and how (a brain's headers), which Jean never changes once it is made, but a connection's key for a sign-in or back. @param {'brains' | 'connections'} kind @param {any} item */
const addressOf = (kind, item) => canon((kind === 'brains' ? ['baseURL', 'provider', 'api', 'headers'] : ['url', 'servers', 'gateway', 'auth']).map((name) => (name === 'auth' && /^(key|oauth)$/.test(item.auth) ? 'key' : item[name])))
/** A brain another device can use: no plan through the bridge, no organisation's sign-in, nothing local. @param {import('../../core/types.js').BrainConfig} brain */
const goes = (brain) => !/^(claudecode|copilot|chatgpt)$/.test(brain.provider) && brain.auth !== 'oidc' && !isLocal(brain)
/** JSON with keys in order, so that equal values compare equal; a field cleared, absent or null, is null. @param {unknown} value */
const canon = (value) => JSON.stringify(value ?? null, (_, one) => (one && typeof one === 'object' && !Array.isArray(one) ? Object.fromEntries(Object.keys(one).sort().map((key) => [key, one[key]])) : one))
/** Whether theirs wins over mine: newer, or as new and the greater, so that both sides settle on one. @param {number} at @param {unknown} value @param {number} mine @param {unknown} held */
export const wins = (at, value, mine, held) => at > mine || (at === mine && canon(value) > canon(held))
/** @param {Partial<Times>} [times] @returns {Times} */
const copy = (times) => ({ fields: { ...times?.fields }, brains: { ...times?.brains }, connections: { ...times?.connections } })

/**
 * The part of settings that goes to another device: what follows, without what this device alone has, and, given the
 * receiving device's catalogue, without the capabilities it lacks (a phone has no reflexes, D660).
 * @param {Settings} settings @param {{ catalogue?: string[] }} [to] @returns {Partial<Settings>}
 */
export function following(settings, { catalogue } = {}) {
  const out = /** @type {Record<string, any>} */ (Object.fromEntries(FOLLOWS.filter((name) => Object.hasOwn(settings, name)).map((name) => [name, settings[name]])))
  out.brains = settings.brains.filter(goes)
  if (!out.brains.some((/** @type {{ id: string }} */ brain) => brain.id === settings.activeBrain)) delete out.activeBrain
  if (settings.connections) out.connections = settings.connections.filter((connection) => !here(connection.url))
  if (settings.urls) out.urls = ownURLs(settings.urls, true)
  out.unlocked = settings.unlocked.filter((id) => !OWN.includes(id) && !(catalogue && CONDITIONAL.includes(id) && !catalogue.includes(id)))
  if (settings.off) out.off = settings.off.filter((id) => !LOCAL_OFF.includes(id))
  // A kind of action's Ask first and Never stricter than its usual rule go, and a service's with its connection, never an Always allow.
  if (settings.rules) out.rules = tighter(undefined, { all: settings.rules }, ruleOf())?.all
  if (settings.services) out.services = tighter(undefined, Object.fromEntries((out.connections ?? []).map((/** @type {{ id: string }} */ one) => [one.id, settings.services?.[one.id]])))
  return out
}

/**
 * Choices for services, each kind of each the stricter of this device's and another's, never an Always allow from elsewhere; this
 * device's as they are when none is. Against `floor` where this device has none for a kind.
 * @param {Record<string, Record<string, any>> | undefined} mine @param {unknown} theirs @param {(kind: string) => number} [floor]
 */
function tighter(mine, theirs, floor = () => 0) {
  const strict = /** @type {Record<string, number>} */ (STRICT)
  let out = mine
  for (const [id, kinds] of Object.entries(theirs ?? {})) for (const [kind, rule] of Object.entries(kinds ?? {})) if (strict[rule] > (strict[out?.[id]?.[kind]] ?? floor(kind))) out = { ...out, [id]: { ...out?.[id], [kind]: rule } }
  return out
}
/** How strict a kind of action's rule is, by these approvals, else the usual one (core/rules.js). @param {Record<string, any>} [rules] */
const ruleOf = (rules) => (/** @type {string} */ kind) => /** @type {Record<string, number>} */ (STRICT)[rules?.[kind] ?? DEFAULT_RULES[kind] ?? 'ask']

/**
 * What of a device's settings stays on it when another device's profile comes (adopt() in ./flow.js): every field that doesn't
 * follow, and of those that do, the brains it alone runs, its connections and addresses on this computer, its own capabilities,
 * the brain chosen when it is one of those, what it turned off of its own, its approvals and choices for services, its consents to
 * download, and, kept on this device, its own Auto.
 * @param {Settings} settings @returns {Partial<Settings>}
 */
export function ownOf(settings) {
  const out = /** @type {Record<string, any>} */ (Object.fromEntries(Object.entries(settings).filter(([name]) => !FOLLOWS.includes(/** @type {any} */ (name)))))
  const [connections, urls] = [(settings.connections ?? []).filter((connection) => here(connection.url)), ownURLs(settings.urls)]
  Object.assign(out, { brains: settings.brains.filter((brain) => !goes(brain)), unlocked: settings.unlocked.filter((id) => OWN.includes(id)) },
    connections.length > 0 && { connections }, Object.keys(urls).length > 0 && { urls })
  out.activeBrain = out.brains.some((/** @type {{ id: string }} */ brain) => brain.id === settings.activeBrain) ? settings.activeBrain : null
  const off = settings.off?.filter((id) => LOCAL_OFF.includes(id)) ?? []
  const offers = Object.fromEntries(Object.entries(settings.offers ?? {}).filter(([id]) => OWN_OFFERS.includes(id)))
  Object.assign(out, off.length > 0 && { off }, settings.cloud === false && { auto: settings.auto }, settings.services && { services: settings.services }, { rules: settings.rules }, Object.keys(offers).length > 0 && { offers })
  return out
}

/**
 * The times again after a change of settings: now for each field, brain and connection that changed, a tombstone for one
 * removed. A patch merged() gave is saved with its times, never stamped. @param {Partial<Settings>} before @param {Partial<Settings>} after
 * @param {Partial<Times>} times @param {number} now @returns {Times}
 */
export function stamp(before, after, times, now) {
  const next = copy(times)
  const [was, is] = /** @type {Record<string, any>[]} */ ([before, after])
  // A change made here is newer than what it replaced, whatever this device's clock says, behind as it may be.
  const later = (/** @type {number | undefined} */ held) => Math.max(now, (held ?? 0) + 1)
  for (const name of FOLLOWS) if (!ITEMS.includes(/** @type {any} */ (name)) && canon(was[name]) !== canon(is[name])) next.fields[name] = later(next.fields[name])
  for (const kind of ITEMS) {
    const old = new Map((was[kind] ?? []).map((/** @type {{ id: string }} */ item) => [item.id, item]))
    for (const item of is[kind] ?? []) if (canon(item) !== canon(old.get(item.id))) next[kind][item.id] = { at: later(next[kind][item.id]?.at) }
    for (const id of old.keys()) if (!(is[kind] ?? []).some((/** @type {{ id: string }} */ item) => item.id === id)) next[kind][id] = { at: later(next[kind][id]?.at), gone: true, address: addressOf(kind, old.get(id)) }
  }
  return next
}

/**
 * What goes, as state: each field with its time, one cleared as null, each brain and connection too, and the tombstones.
 * @param {Partial<Settings>} settings what following() gave @param {Partial<Times>} times @returns {Snapshot}
 */
export function snapshotOf(settings, times) {
  const all = /** @type {Record<string, any>} */ (settings)
  const fields = Object.fromEntries(FOLLOWS.filter((name) => !ITEMS.includes(/** @type {any} */ (name)) && (Object.hasOwn(all, name) || times.fields?.[name]))
    .map((name) => [name, { value: all[name] ?? null, at: times.fields?.[name] ?? 0 }]))
  const items = (/** @type {typeof ITEMS[number]} */ kind) => ({
    ...Object.fromEntries(Object.entries(times[kind] ?? {}).filter(([, one]) => one.gone).map(([id, one]) => [id, { value: null, at: one.at }])),
    ...Object.fromEntries((all[kind] ?? []).map((/** @type {{ id: string }} */ item) => [item.id, { value: item, at: times[kind]?.[item.id]?.at ?? 0 }])),
  })
  return { fields, brains: items('brains'), connections: items('connections') }
}

/** A time another device sent, a number no later than `now`, or null. @param {unknown} at @param {number} now */
export const timeOf = (at, now) => (typeof at === 'number' && Number.isFinite(at) ? Math.min(at, now) : null)
/** Whether an entry another device sent is whole: an object, its time a number, as a field of its kind or an item with its own id, or cleared. @param {string} name @param {any} entry @param {string} [id] */
const whole = (name, entry, id) => entry !== null && typeof entry === 'object' && Number.isFinite(entry.at) && (entry.value === null
  || (id === undefined ? (Array.isArray(entry.value) ? 'array' : typeof entry.value) === KINDS[name] : typeof entry.value === 'object' && entry.value?.id === id && ULID.test(id)))

/**
 * Another device's snapshot over this one's settings, each time no later than `now`, anything malformed left out: for each field and
 * item the newest wins and a tombstone removes, but what this device keeps for itself (ownOf()) stays as it is; a field
 * cleared there is cleared here, back to its default where it has one; `unlocked`, `maskWords`, `guards`, `off`, `offers`, `services` and
 * `rules` take both, the last two the stricter; this device keeps its own addresses, and where its items' keys go. Only what changed is in the patch, a field cleared in it as undefined.
 * @param {Settings} settings @param {Partial<Times>} times @param {Snapshot} snapshot @param {number} [now] @returns {{ patch: Partial<Settings>, times: Times }}
 */
export function merged(settings, times, snapshot, now = Infinity) {
  const next = copy(times)
  const mine = /** @type {Record<string, any>} */ (settings)
  /** @type {Record<string, any>} */
  const patch = {}
  for (const [name, entry] of Object.entries(snapshot?.fields ?? {})) {
    if (!Object.hasOwn(KINDS, name) || ITEMS.includes(/** @type {any} */ (name)) || !whole(name, entry) || (mine.cloud === false && (name === 'auto' || name === 'activeBrain'))) continue
    const [value, at] = [entry.value, /** @type {number} */ (timeOf(entry.at, now))]
    // What only grows takes both: capabilities found, words to mask, "more to hide, never less" (ee/masking.js), guards, which only
    // make Jean more careful (core/rules.js), by id, capabilities turned off, but this device's own, offers answered, key by key, but those
    // whose answer is a consent to download on this device, and the approvals' and services' Ask first and Never, the stricter.
    if (['unlocked', 'maskWords', 'offers', 'guards', 'off', 'services', 'rules'].includes(name)) {
      const valid = (/** @type {any} */ one) => (name === 'guards' ? ULID.test(one?.id) : typeof one === 'string' && !(name === 'off' && LOCAL_OFF.includes(one)))
      const both = name === 'offers' ? { ...Object.fromEntries(Object.entries(value ?? {}).filter(([id]) => !OWN_OFFERS.includes(id))), ...mine.offers }
        : name === 'services' ? tighter(mine.services, value) : name === 'rules' ? tighter({ all: mine.rules }, { all: value }, ruleOf())?.all : [...mine[name] ?? [], ...(value ?? []).filter(valid)].filter((one, i, all) => all.findIndex((other) => (other?.id ?? other) === (one?.id ?? one)) === i)
      if (canon(both) !== canon(mine[name])) patch[name] = both
      next.fields[name] = Math.max(at, next.fields[name] ?? 0)
    // Against what this device sends: a brain chosen that doesn't go is none, so that this device's own choice wins every tie.
    } else if (wins(at, value, next.fields[name] ?? 0, name === 'activeBrain' && !mine.brains?.some((/** @type {any} */ one) => one.id === mine.activeBrain && goes(one)) ? null : mine[name])) {
      const urls = name === 'urls' ? { ...ownURLs(value, true), ...ownURLs(mine.urls) } : {}
      const taken = name === 'urls' ? (Object.keys(urls).length ? urls : undefined) : value ?? /** @type {Record<string, any>} */ (DEFAULT_SETTINGS)[name]
      next.fields[name] = at
      if (canon(taken) !== canon(mine[name])) patch[name] = taken
    }
  }
  for (const kind of ITEMS) {
    /** What follows the person, the rest this device's own, which another device never adds, changes or removes here. @type {(item: any) => boolean} */
    const follows = kind === 'brains' ? goes : (item) => !here(item.url)
    /** @type {{ id: string }[]} */
    let list = mine[kind] ?? []
    for (const [id, entry] of Object.entries(snapshot?.[kind] ?? {})) {
      if (!whole(kind, entry, id)) continue
      const [value, at, held] = [entry.value, /** @type {number} */ (timeOf(entry.at, now)), list.find((item) => item.id === id) ?? null]
      // Where its key or sign-in goes, for an item this device has or had: never changed from elsewhere, which only a stolen device does.
      const where = held ? addressOf(kind, held) : next[kind][id]?.address
      if ((held && !follows(held)) || (value && !follows(value)) || (value && where && where !== addressOf(kind, value)) || !wins(at, value, next[kind][id]?.at ?? 0, held)) continue
      next[kind][id] = value ? { at } : { at, gone: true, address: where }
      list = !value ? list.filter((item) => item.id !== id) : held ? list.map((item) => (item.id === id ? value : item)) : [...list, value]
    }
    if (canon(list) !== canon(mine[kind] ?? [])) patch[kind] = list
  }
  // The brain chosen is one this device has: as chosen there, else as it was here, else its first, as removing one leaves it.
  if (patch.brains || 'activeBrain' in patch) {
    const brains = /** @type {{ id: string }[]} */ (patch.brains ?? settings.brains)
    const active = [patch.activeBrain, settings.activeBrain].find((id) => brains.some((brain) => brain.id === id)) ?? brains[0]?.id ?? null
    if (active === settings.activeBrain) delete patch.activeBrain
    else patch.activeBrain = active
  }
  return { patch, times: next }
}
