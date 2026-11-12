// SPDX-License-Identifier: MIT
// What a paired device keeps and does with what comes (D700): its name, the devices its profile knows (in .secrets/, removed ones kept
// as removed), the bundle A sends B and B's new profile filled from it, settings and keys that follow with their times in
// .devices/follows.json, a task handed over, and a device removed. Its context gives it the profile's files, the relay's clock and the
// way to send, so it touches no DOM and node --test runs it.
import { DEFAULT_SETTINGS, loadSettings, saveSettings, parseFrontMatter, stringifyFrontMatter } from '../../core/settings.js'
import { memoryFS, readJSON, writeJSON, walk } from '../../core/fs.js'
import { ulid } from '../../core/ulid.js'
import { crossing, getSecret, setSecret, setSecrets, deleteSecret, dropSecrets } from '../../ui/secrets.js'
import { VAULT, encode, decode } from '../../ui/seal.js'
import { DEFAULT_RULES } from '../../core/rules.js'
import { filesIn } from '../../ui/export.js'
import { SERVICES, isService } from '../web-search/services.js'
import { carried } from '../sync/mirror.js'
import { CONDITIONAL, FOLLOWS, ULID, following, merged, ownOf, snapshotOf, stamp, timeOf, wins } from './bundle.js'
import { MANIFEST } from './store-fs.js'
import { PERSON, madePerson } from '../people/flow.js'

/** @typedef {import('../../core/types.js').FS} FS */
/** @typedef {import('../../core/settings.js').Settings} Settings */
/** @typedef {import('./bundle.js').Snapshot} Snapshot */
/** This device's identity in a profile, the secret `device`: its record's id, its keys (JWK), its mailbox's token and id. @typedef {{ id: string, key: JsonWebKey, public: JsonWebKey, token: string, mailbox: string }} Identity */
/**
 * A device the profile knows, this one among them, as the secret `devices` lists it; one removed stays listed, with when, so that it is
 * never heard from, sent to or brought back, and whether Jean is to be erased there; and the device that added it, which alone lists it to the
 * others. @typedef {{ format: 1, kind: 'device', id: string, name: string, key: JsonWebKey, mailbox: string,
 *   createdAt: string, author: 'user', addedBy?: string, removedAt?: string, erase?: boolean }} Device
 */
/** When a key that crosses last changed here, in ms by the relay's clock, and its SHA-256, never the key; a forgotten one's, gone. @typedef {{ at: number, hash?: string, gone?: true }} KeyStamp */
/** Keys as they go to another device, each with its time, a forgotten one as a tombstone. @typedef {Record<string, { value?: string, at: number, gone?: true }>} Keys */
/**
 * follows.json: the times of what follows (bundle.js) and of the keys that cross, what settings were when last stamped, when another device
 * was last heard, by the relay's time of its message, and each one, by its id, kept on this device alone, when it last asked them, a mark while something waits to reach every device, the
 * devices the last share didn't reach and the mark it was for, those removed and not yet told (whether to erase Jean there) and of those
 * the ones the relay took, the projects it had, which refill() won't bring back, and, removed, the devices it had then, with the identity
 * it was removed as.
 * @typedef {Partial<import('./bundle.js').Times> & { keys?: Record<string, KeyStamp>, seen?: Partial<Settings>, heard?: number, from?: Record<string, number>, asked?: number, pending?: number, unreached?: string[], sentFor?: number, posted?: string[], owe?: Record<string, boolean>, had?: string[], left?: string[], leftAs?: string }} Follows
 */
/**
 * What handling needs: the profile's files, this device, its catalogue (ui/discovery.js), now by the relay's clock, settings.json as it
 * is and the way to change it, the way to send another device a value, locks by name, across tabs, and the organisation's brains.
 * @typedef {{ fs: FS, me: Identity, catalogue: string[], now: () => number, settings: () => Promise<Settings>, change: (patch: Partial<Settings>) => Promise<unknown>,
 *   send: (to: Device, value: object) => Promise<unknown>, lock?: (name: string, run: () => Promise<any>) => Promise<any>, policy?: Policy }} Context
 */

/** What policy names that crossing() leaves out: the organisation's brains, which hold its tokens. @typedef {{ brains?: { id: string }[] }} Policy */

/**
 * The secret that holds this device's identity, which never crosses, and the one that holds the devices this profile knows: in .secrets/,
 * which neither Sync nor a backup carries, so nobody writes a device in.
 */
export const [SECRET, DEVICES] = ['device', 'devices']
/** The times of what follows, this device's own: in a folder Sync and backups leave out (caps/sync/mirror.js, caps/backup/archive.js). */
export const TIMES = '.devices/follows.json'
/** The secret that holds the store's keys (./store.js, D721), and what this device knows of a store, dropped with them: the round's base and the manifest. */
export const [STORE, STORED] = ['store', ['.cache/store.json', MANIFEST]]
/** The most a message holds, as the relay takes them. */
export const LIMIT = 25_000_000
export { ULID } from './bundle.js'
/** A profile's folder, as another device names it. */
export const PROFILE = /^profiles\/[0-9A-HJKMNP-TV-Z]{26}-[a-z0-9-]{1,64}$/
const PROJECT = /^projects\/[0-9A-HJKMNP-TV-Z]{26}-[a-z0-9-]{1,64}\/project\.md$/
/** A week; how far ahead of this device's clock another's time may be, a minute, and no more, so that no time from the future wins for good. */
const [WEEK, SOON] = [7 * 86_400_000, 60_000]

/** @param {string} line */
const parsed = (line) => { try { return JSON.parse(line) } catch { return null } }
/** @template T @param {{ lock?: Context['lock'] }} ctx @param {string} name @param {() => Promise<T>} run @returns {Promise<T>} */
const locked = (ctx, name, run) => (ctx.lock ? ctx.lock(name, run) : run())
/** Over follows.json; over the list of devices; over a task arriving, which two tabs reading at once would keep twice. */
const [FOLLOWING, LISTING, ARRIVING] = ['app-follows', 'app-device-list', 'app-task-arrive']
/** Whether two public keys are one. @param {JsonWebKey} a @param {JsonWebKey} b */
export const sameKey = (a, b) => a.x === b.x && a.y === b.y
/** Whether a capability may be unlocked on a device of this catalogue (D660). @param {string} id @param {string[]} catalogue */
const fits = (id, catalogue) => !CONDITIONAL.includes(id) || catalogue.includes(id)

// ─── This device ─────────────────────────────────────────────────────────────

const SYSTEMS = /** @type {[RegExp, string][]} */ ([[/iPhone/, 'iPhone'], [/iPad/, 'iPad'], [/Android/, 'Android'], [/CrOS|Chrome ?OS/, 'ChromeOS'], [/Mac|macOS|Darwin/, 'Mac'], [/Win/, 'Windows'], [/Linux/, 'Linux']])
const BROWSERS = /** @type {[RegExp, string][]} */ ([[/Edg(?:A|iOS)?\//, 'Edge'], [/OPR\/|Opera/, 'Opera'], [/SamsungBrowser/, 'Samsung Internet'], [/Firefox\/|FxiOS/, 'Firefox'], [/CriOS|Chrome\//, 'Chrome'], [/Safari\//, 'Safari']])
/** @param {[RegExp, string][]} list @param {string} text */
const named = (list, text) => list.find(([pattern]) => pattern.test(text))?.[1] ?? ''

/**
 * A device's name as its browser tells it, its system then its browser, "iPhone · Safari", "Mac · Chrome"; in the desktop app, its system
 * and the app's name. Proper names, the same in every language. An iPad's Safari says Macintosh, with a touch screen.
 * @param {{ userAgent?: string, platform?: string, brands?: { brand: string }[], touch?: number, os?: string, app?: string }} told
 */
export function deviceName({ userAgent = '', platform = '', brands = [], touch = 0, os = '', app = '' }) {
  const system = named(SYSTEMS, os || platform || userAgent)
  const brand = brands.map((one) => one.brand).find((one) => !/Not.?A.?Brand|^Chromium$/i.test(one))?.replace(/^(Google|Microsoft) /, '')
  return [system === 'Mac' && touch > 1 && !os ? 'iPad' : system, os ? app : brand || named(BROWSERS, userAgent)].filter(Boolean).join(' · ')
}

// ─── The devices a profile knows ─────────────────────────────────────────────

/** A device's record, its fields checked and nothing else kept; null for anything else. @param {any} one @returns {Device | null} */
export function recordOf(one) {
  const [key, removed, by, erase] = [one?.key, one?.removedAt, one?.addedBy, one?.erase === true]
  return ULID.test(one?.id) && typeof one.name === 'string' && one.name.length <= 100 && /^[\w-]{22}$/.test(one.mailbox) && typeof one.createdAt === 'string' && one.createdAt.length <= 40
    && key?.kty === 'EC' && key.crv === 'P-256' && /^[\w-]{43}$/.test(key.x) && /^[\w-]{43}$/.test(key.y) && !('d' in key) && (removed === undefined || (typeof removed === 'string' && removed.length <= 40)) && (by === undefined || ULID.test(by))
    ? { format: 1, kind: 'device', id: one.id, name: one.name, key: { kty: 'EC', crv: 'P-256', x: key.x, y: key.y }, mailbox: one.mailbox, createdAt: one.createdAt, author: 'user',
      ...(by && { addedBy: by }), ...(removed && { removedAt: removed, erase }) } : null
}

/** A device's record made, this one's or one being added, by the device adding it. @param {{ id: string, public: JsonWebKey, mailbox: string }} device @param {string} name @param {number} now @param {string} [addedBy] */
export const recordFor = ({ id, public: key, mailbox }, name, now, addedBy) => /** @type {Device} */ (recordOf({ id, name, key, mailbox, createdAt: new Date(now).toISOString(), addedBy }))

/** Every device the profile knows, removed ones too, one record each. @param {FS} fs @returns {Promise<Device[]>} */
export async function listOf(fs) {
  const list = await getSecret(fs, DEVICES).then((text) => JSON.parse(text ?? '[]')).catch(() => [])
  const records = Array.isArray(list) ? list.map(recordOf).filter((one) => one !== null) : []
  return records.filter((one, i) => records.findIndex((other) => other.id === one.id) === i)
}

/** The devices the profile has, this one among them: those not removed. @param {FS} fs */
export const recordsOf = async (fs) => (await listOf(fs)).filter((one) => !one.removedAt)

/**
 * The list of devices changed, one change at a time across tabs where there are locks: `edit` gives the new list, or null for none.
 * Whether it changed. @param {FS} fs @param {(list: Device[]) => Device[] | null} edit @param {Context['lock']} [lock] @returns {Promise<boolean>}
 */
export const changeList = (fs, edit, lock) => locked({ lock }, LISTING, async () => {
  const next = edit(await listOf(fs))
  if (next) await setSecret(fs, DEVICES, JSON.stringify(next))
  return Boolean(next)
})

/** A device added. @param {FS} fs @param {Device} record @param {Context['lock']} [lock] */
export const writeRecord = (fs, record, lock) => changeList(fs, (list) => [...list.filter((one) => one.id !== record.id), record], lock)

/**
 * This device's own record, as it first has an identity in a profile: the devices of a pairing that removed it since, which it kept to
 * be added again in place (alone()), kept only as removed. @param {FS} fs @param {Device} record @param {Context['lock']} [lock]
 */
export const writeOwn = (fs, record, lock) => changeList(fs, (list) => [...list.filter((one) => one.id !== record.id).map((one) => ({ removedAt: record.createdAt, ...one })), record], lock)

/**
 * Another device's list over this one's: one removed there is removed here for good, since an id is never given twice, nor a removed
 * device's key taken again under another; a device new here comes only from the device that added it, itself removed nowhere, or with a
 * pairing's bundle (`from` null); this device's own record never changes from elsewhere. Null when nothing changed.
 * @param {Device[]} mine @param {unknown} theirs @param {string} own @param {string | null} from the sender's id
 * @returns {Device[] | null}
 */
export function mergeLists(mine, theirs, own, from) {
  if (!Array.isArray(theirs)) return null
  const [records, out] = [theirs.map(recordOf), [...mine]]
  const removed = (/** @type {string | undefined} */ id) => [...out, ...records].some((one) => one?.id === id && one?.removedAt)
  for (const one of records) {
    if (!one || one.id === own) continue
    const at = out.findIndex((held) => held.id === one.id)
    if (at < 0 && (from === null || (one.addedBy === from && !removed(from))) && !out.some((held) => held.removedAt && sameKey(held.key, one.key))) out.push(one)
    else if (at >= 0 && one.removedAt && !out[at].removedAt) out[at] = { ...out[at], removedAt: one.removedAt, erase: one.erase }
  }
  return JSON.stringify(out) === JSON.stringify(mine) ? null : out
}

/**
 * Whether the profile open here may be filled again in place from this key: only where this device was removed and kept Jean on its own
 * (alone(): no identity left), and only from a device it had and never saw removed, so that a device removed since can't take back, in
 * place, the device that removed it. @param {FS} fs @param {JsonWebKey} key
 */
export const inPlace = async (fs, key) => !(await getSecret(fs, SECRET)) && (await recordsOf(fs)).some((one) => sameKey(one.key, key))

/** The other devices, none removed. @param {Context} ctx */
const othersOf = async (ctx) => (await recordsOf(ctx.fs)).filter((one) => one.id !== ctx.me.id)

/**
 * A value to every other device but those named, each on its own, one failing leaving the rest. Those that didn't take it: none when
 * every one did, or has no mailbox left to take it, as a device away longer than the relay keeps one, which asks the others when it is
 * back (quiet()). A device its own list marks removed (alone()) sends nothing: what it keeps is its own.
 * @param {Context} ctx @param {object} value @param {string[]} [but] @returns {Promise<Device[]>}
 */
export async function tell(ctx, value, but = []) {
  const others = (await othersOf(ctx)).filter((one) => !but.includes(one.id))
  if ((await listOf(ctx.fs)).find((one) => one.id === ctx.me.id)?.removedAt) return others
  const taken = await Promise.all(others.map((one) => ctx.send(one, value).then(() => true, (/** @type {any} */ error) => { console.warn('Devices', error); return error?.status === 404 })))
  return others.filter((_, i) => !taken[i])
}

// ─── The store ───────────────────────────────────────────────────────────────

/** Whether the store's keys are whole: its id, the naming key and an epoch's key at least, base64url. @param {any} one */
export const shaped = (one) => /^[\w-]{22}$/.test(one?.sid) && /^[\w-]{43}$/.test(one.N) && Object.keys(one.epochs ?? {}).length > 0
  && Object.entries(one.epochs).every(([epoch, key]) => /^\d{1,9}$/.test(epoch) && /^[\w-]{43}$/.test(String(key)))
/** The store this device holds, by its id, and its newest epoch, as its settings tell the others: none where it has none, or where the relay no longer opens it. @param {FS} fs */
const storeOf = async (fs) => ((held) => (shaped(held) && !held.gone ? { sid: held.sid, epoch: Math.max(...Object.keys(held.epochs).map(Number)) } : null))(JSON.parse(await getSecret(fs, STORE) ?? 'null'))
/**
 * What the store carries from this device (D721): what Sync's mirror carries, but projects kept on this device (`cloud: false`), their
 * project.md aside where it is Home's, so that every device keeps one Home. @param {{ dir: string, data: Record<string, unknown> }[]} projects
 */
export const carrying = (projects) => ((kept) => (/** @type {string} */ path) => carried(path)
  && !kept.some(({ dir, data }) => path.startsWith(`${dir}/`) && !(data.default === true && path === `${dir}/project.md`)))(projects.filter((one) => one.data.cloud === false))

// ─── Keys that cross, and their times ────────────────────────────────────────

/** A key's SHA-256, all that follows.json keeps of it. @param {string} value */
const hashOf = async (value) => encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
/** The keys that cross, as they are here (crossing()). @param {FS} fs @param {Settings} settings @param {Policy} [policy] */
const keysOf = async (fs, settings, policy) => crossing(fs, /** @type {Settings} */ (following(settings)), policy)
/** Those of these keys, by id, that cross on a device of these settings, by their kind and what they hold. @param {Settings} settings @param {Record<string, string>} keys @param {Policy} [policy] */
const crossingIds = async (settings, keys, policy) => Object.keys(await keysOf(memoryFS({ '.secrets/keys.json': JSON.stringify(keys) }), settings, policy))
/**
 * Settings changed from elsewhere: the keys kept here that cross now and didn't before are deleted, made for another kind of brain or
 * connection under the same id (a plan's bridge key, a sign-in's tokens, an organisation's token), which no merge makes go; but not one
 * that crossed here under that id already, as its hash in follows.json says, its record gone a while: that one goes out again. Whether
 * one did. @param {FS} fs @param {Settings} before @param {Settings} after @param {Policy} [policy] @param {Record<string, KeyStamp>} [stamps]
 */
async function unkinded(fs, before, after, policy, stamps = {}) {
  const was = await keysOf(fs, before, policy)
  let again = false
  for (const [id, value] of Object.entries(await keysOf(fs, after, policy)).filter(([id]) => !Object.hasOwn(was, id))) {
    if (stamps[id]?.hash === await hashOf(value)) again = true
    else await deleteSecret(fs, id)
  }
  return again
}

/**
 * The keys' times again: now, and never before what it replaces, for a key new or changed here, a tombstone for one deleted or replaced here by what doesn't cross (a
 * sign-in's tokens); one kept as it was, that no longer crosses as a merge took its brain or connection, keeps its time, since this
 * device forgot nothing. On a first look, as they are, untimed, so that any other device's win.
 * @param {FS} fs @param {Record<string, string>} values @param {Record<string, KeyStamp> | undefined} times @param {number} now @param {boolean} first
 * @returns {Promise<Record<string, KeyStamp>>}
 */
async function stampKeys(fs, values, times, now, first) {
  const next = { ...times }
  for (const [id, value] of Object.entries(values)) {
    const hash = await hashOf(value)
    if (next[id]?.hash !== hash) next[id] = { at: first ? 0 : Math.max(now, (next[id]?.at ?? 0) + 1), hash }
  }
  for (const [id, one] of Object.entries(next)) {
    const held = one.gone || Object.hasOwn(values, id) ? null : await getSecret(fs, id)
    if (!one.gone && !Object.hasOwn(values, id) && (held === null || await hashOf(held) !== one.hash)) next[id] = { at: Math.max(now, one.at + 1), gone: true }
  }
  return next
}

/** The keys as they go, each with its time: the value of each held here, a tombstone for each forgotten. @param {Record<string, string>} values @param {Record<string, KeyStamp>} [times] @returns {Keys} */
const keysOut = (values, times = {}) => Object.fromEntries(Object.entries(times).flatMap(([id, one]) => /** @type {[string, Keys[string]][]} */ (one.gone ? [[id, { at: one.at, gone: true }]]
  : Object.hasOwn(values, id) ? [[id, { value: values[id], at: one.at }]] : [])))

/**
 * Keys another device sent, over this device's: for each the newest wins, a tombstone deleting it, and only those that cross here by
 * their kind and what they hold (never a sign-in's tokens), under the settings before what came with them or after (a brain removed
 * there takes its key with it). A tombstone older than the brain or connection that holds its id here, which takes this key, loses to
 * it: the key is stamped as that record, to go. `times` is changed in place; whether a key was stamped so.
 * Each time no later than `limit`.
 * @param {FS} fs @param {unknown} keys @param {Settings[]} settings @param {Record<string, KeyStamp>} times
 * @param {number} limit @param {Policy} [policy] @param {Record<string, { at: number }>} [records] when each brain and connection here last changed
 */
async function takeKeys(fs, keys, settings, times, limit, policy, records = {}) {
  if (!keys || typeof keys !== 'object') return false
  let stamped = false
  const all = /** @type {[string, { value?: unknown, at: number, gone?: unknown }][]} */ (Object.entries(keys).flatMap(([id, one]) => (timeOf(one?.at, limit) !== null
    && (one.gone === true || typeof one.value === 'string') ? [[id, { ...one, at: timeOf(one.at, limit) }]] : [])))
  const held = Object.fromEntries(all.map(([id, one]) => [id, one.gone === true ? '' : /** @type {string} */ (one.value)]))
  const [here, now] = [new Set((await Promise.all(settings.map((one) => crossingIds(one, held, policy)))).flat()), await keysOf(fs, /** @type {Settings} */ (settings.at(-1)), policy)]
  for (const [id, one] of all) {
    const [at, value] = [/** @type {number} */ (one.at), one.gone === true ? null : /** @type {string} */ (one.value)]
    const hash = value === null ? null : await hashOf(value)
    // Enough to beat the tombstone, never lower than the key's own time.
    if (value === null && Object.hasOwn(now, id) && (records[id]?.at ?? 0) > at) [times[id], stamped] = [{ at: Math.max(times[id]?.at ?? 0, at + 1), hash: await hashOf(now[id]) }, true]
    const mine = times[id]
    if (!here.has(id) || (mine && !wins(at, hash, mine.at, mine.gone ? null : mine.hash))) continue
    if (value === null) await deleteSecret(fs, id)
    else if (await getSecret(fs, id) !== value) await setSecret(fs, id, value)
    times[id] = value === null ? { at, gone: true } : { at, hash: /** @type {string} */ (hash) }
  }
  return stamped
}

// ─── Settings that follow, and their times ───────────────────────────────────

/** @param {FS} fs @returns {Promise<Follows>} */
export const followsOf = (fs) => readJSON(fs, TIMES, {})
/** follows.json written again over itself with what changed, a value undefined dropped. @param {FS} fs @param {Follows} next */
const keep = async (fs, next) => writeJSON(fs, TIMES, { format: 1, ...await followsOf(fs), ...next })
/** follows.json as it is, handed to `run`, one tab at a time. @template T @param {Pick<Context, 'fs' | 'lock'>} ctx @param {(kept: Follows) => Promise<T>} run @returns {Promise<T>} */
const follows = (ctx, run) => locked(ctx, FOLLOWING, async () => run(await followsOf(ctx.fs)))
/**
 * The times this device kept, none later than its clock and a minute, so that one stamped while its clock ran ahead wins no longer
 * than that, here or elsewhere. @param {Follows} kept @param {number} limit @returns {Follows}
 */
const capped = (kept, limit) => ({ ...kept, fields: Object.fromEntries(Object.entries(kept.fields ?? {}).map(([id, at]) => [id, Math.min(at, limit)])),
  ...Object.fromEntries(/** @type {const} */ (['brains', 'connections', 'keys']).map((part) => [part, kept[part] && Object.fromEntries(Object.entries(kept[part] ?? {}).map(([id, one]) => [id, { ...one, at: Math.min(one.at, limit) }]))])) })
/** A removal no longer owed. @param {Context} ctx @param {string} id */
const forgive = (ctx, id) => follows(ctx, async (kept) => { const { [id]: _, ...owe } = kept.owe ?? {}; await keep(ctx.fs, { owe }) })
/** Projects this device had, by folder, which refill() won't bring back once deleted. @param {Pick<Context, 'fs' | 'lock'>} ctx @param {string[]} names */
const hadToo = (ctx, names) => follows(ctx, (kept) => keep(ctx.fs, { had: [...new Set([...kept.had ?? [], ...names])] }))
/** A mark never made before: later than the last, waiting or sent, whatever the clock says. @param {Context} ctx @param {Follows} kept */
const fresh = (ctx, kept) => Math.max(ctx.now(), Math.max(kept.pending ?? 0, kept.sentFor ?? 0) + 1)
/**
 * Something waits to reach every device: marked before anything goes, anew each time, so that only the share that took it clears it;
 * with the removals a list about to be written owes, so that a tab closed between leaves both to go. @param {Context} ctx @param {Record<string, boolean>} [owed]
 */
export const mark = (ctx, owed = {}) => follows(ctx, async (kept) => {
  const pending = fresh(ctx, kept)
  await keep(ctx.fs, { pending, owe: { ...kept.owe, ...owed } })
  return pending
})
/** Whether two times say the same. @param {Follows} a @param {Follows} b */
const same = (a, b) => /** @type {const} */ (['fields', 'brains', 'connections', 'keys']).every((part) => JSON.stringify(a[part] ?? {}) === JSON.stringify(b[part] ?? {}))
/** Whether stamping changed the times kept: never the first time, settings or keys taken then as they are. @param {Follows} times @param {Follows} kept */
const changedFrom = (times, kept) => Boolean(kept.seen) && !same(times, { ...kept, keys: kept.keys ?? times.keys })

/** What changed here since follows.json was last written, stamped now: settings by field and item, keys by id. @param {Context} ctx @param {Follows} kept */
async function stamped(ctx, kept) {
  // No later than this device's clock and a minute, nor than when it last heard another device, which its clock, behind, doesn't lower.
  const [settings, own] = [await ctx.settings(), capped(kept, Math.max(ctx.now(), kept.heard ?? 0) + SOON)]
  const [state, values] = [following(settings), await keysOf(ctx.fs, settings, ctx.policy)]
  // Kept on this device, who answers is its own: as it was last seen, never stamped, so that nothing chosen meanwhile goes later.
  if (settings.cloud === false) Object.assign(state, { auto: own.seen?.auto, activeBrain: own.seen?.activeBrain })
  return { settings, state, values, times: { ...stamp(own.seen ?? state, state, own, ctx.now()), keys: await stampKeys(ctx.fs, values, own.keys, ctx.now(), !own.seen || !own.keys) } }
}

/**
 * What changed here since this device last looked, settings and keys, stamped now and saved: the message that sends this device's state
 * (settings as a snapshot, the keys with their times, and the devices it knows; kept on this device, `cloud` false, never its own Auto or
 * brain chosen, which would turn the others' choice back), whether anything had changed, and when the newest change not yet sent was
 * stamped, or, `marking`, a fresh mark, in the same turn, so that nothing stamped meanwhile is cleared unsent. Run as soon as settings or
 * keys change, by the tabs that notice, over settings.json and the keys as they are. @param {Context} ctx @param {boolean} [marking]
 */
export const look = (ctx, marking = false) => follows(ctx, async (kept) => {
  const { settings, state, values, times } = await stamped(ctx, kept)
  const changed = changedFrom(times, kept)
  const pending = marking || changed ? fresh(ctx, kept) : kept.pending
  if (changed || marking || !kept.seen || !kept.keys) await keep(ctx.fs, { ...times, seen: state, pending })
  const snapshot = snapshotOf(state, times)
  if (settings.cloud === false) for (const name of ['auto', 'activeBrain']) delete snapshot.fields[name]
  return { value: { kind: 'settings', snapshot, keys: keysOut(values, times.keys), devices: await listOf(ctx.fs), store: await storeOf(ctx.fs) }, changed, pending }
})

/**
 * What waits to go: this device's state to every other, the devices it knows among it, what changed stamped first and marked as waiting
 * before anything goes (not `all`: only if something waits); then, once every one took it, its removal, with that list, to each device
 * removed here and owed it when this began, so that the list that removes it went first: a mailbox is read in order, and a list the
 * removed device sends the others once it hears, naming a key of its own, comes after. A removed device is told once its mailbox is gone,
 * which it removes as it acts on its removal: what the relay took, it may never read, or open. A send that fails, or never ends as the
 * tab closes, leaves it to go again (unreached(), listening() in ./devices.js); once every one took the state, nothing newer waits.
 * A removal the relay took already goes again only with `notices`, so that a retry on every sight of the page, return online or
 * message from that device never posts it more than hourly (again() in ./devices.js). The devices that took nothing yet, or not their removal.
 * @param {Context} ctx @param {boolean} [all] @param {boolean} [notices] @returns {Promise<Device[]>}
 */
export async function share(ctx, all = true, notices = true) {
  const { owe = {}, unreached = [], sentFor, posted = [] } = await followsOf(ctx.fs)
  const { value, pending } = await look(ctx, all)
  // The same mark again: only to those that didn't take it, so that a device refusing never fills the others' mailboxes.
  const took = pending !== undefined && pending === sentFor ? (await othersOf(ctx)).map((one) => one.id).filter((id) => !unreached.includes(id)) : []
  const failed = all || pending ? await tell(ctx, value, took) : []
  const [told, now] = [failed.length === 0, /** @type {string[]} */ ([])]
  for (const [id, erase] of Object.entries(owe)) {
    const to = (await listOf(ctx.fs)).find((one) => one.id === id)
    // Owed as a list removing it came, not yet written: it goes once it is.
    if (to && !to.removedAt) continue
    // One the relay took already, waiting for the device to act, goes again only with `notices`, the retry timer's, at most hourly.
    if (to && !(told && (notices || !posted.includes(id)) && await ctx.send(to, { kind: 'removed', erase, devices: value.devices }).then(() => { now.push(id); return false }, (/** @type {any} */ error) => error?.status === 404))) failed.push(to)
    else await forgive(ctx, id)
  }
  await follows(ctx, (kept) => keep(ctx.fs, { unreached: failed.map((one) => one.id), sentFor: pending, posted: [...new Set([...posted, ...now])].filter((id) => Object.hasOwn(kept.owe ?? {}, id)),
    pending: told && kept.pending === pending ? undefined : kept.pending }))
  return failed
}

/** Whether what the last share didn't take to every device goes again: as `from`, one of those, writes, or, unnamed, a while after. @param {FS} fs @param {string} [from] */
export const unreached = async (fs, from) => ((await followsOf(fs)).unreached ?? []).some((id) => !from || id === from)

/**
 * Another device's settings and keys over this one's, once what changed here is stamped: what this device's catalogue lacks stays out,
 * and what came is saved with its times, never stamped or sent again. Whether something had changed here, which then goes on to the others.
 * @param {Context} ctx @param {Snapshot} snapshot @param {unknown} keys
 */
export const settle = (ctx, snapshot, keys) => follows(ctx, async (kept) => {
  const limit = ctx.now() + SOON
  const round = async () => ((now) => ({ ...now, before: now.times, ...merged(now.settings, now.times, snapshot, limit) }))(await stamped(ctx, kept))
  let next = await round()
  // Settings changed meanwhile, in this tab or another: merged again over them, stamped, rather than written over.
  while (JSON.stringify(await ctx.settings()) !== JSON.stringify(next.settings)) next = await round()
  const { settings, state, before, patch, times } = next
  if (patch.unlocked) patch.unlocked = patch.unlocked.filter((id) => settings.unlocked.includes(id) || fits(id, ctx.catalogue))
  if (patch.unlocked?.length === settings.unlocked.length) delete patch.unlocked
  if (Object.keys(patch).length) await ctx.change(patch)
  const after = /** @type {Settings} */ ({ ...settings, ...patch })
  const [again, stamps] = [await unkinded(ctx.fs, settings, after, ctx.policy, before.keys), { ...before.keys }]
  const ours = await takeKeys(ctx.fs, keys, [settings, after], stamps, limit, ctx.policy, { ...times.brains, ...times.connections }) || again || changedFrom(before, kept)
  // Kept on this device, who answers is seen as stamped() holds it, so that letting messages go again stamps nothing kept meanwhile.
  const seen = { ...following(after), ...(after.cloud === false && { auto: state.auto, activeBrain: state.activeBrain }) }
  await keep(ctx.fs, { ...times, keys: stamps, seen, pending: ours ? ctx.now() : kept.pending })
  return ours
})

/**
 * Device `id` heard from at `at`, the relay's time of its message, never this device's clock, so that nothing it took is capped below it;
 * kept for it too, for Your devices to say when each was last seen. @param {Context} ctx @param {number} at @param {string} id
 */
const hear = (ctx, at, id) => follows(ctx, async (kept) => { if (at > (kept.from?.[id] ?? 0)) await keep(ctx.fs, { heard: Math.max(at, kept.heard ?? 0), from: { ...kept.from, [id]: at } }) })

/** Whether one of the others went a week unheard since it was added, which asking them answers; asked, it waits another week. @param {Context} ctx */
export const quiet = (ctx) => follows(ctx, async (kept) => ((await recordsOf(ctx.fs)).some((one) => one.id !== ctx.me.id && ctx.now() - Math.max(kept.from?.[one.id] ?? 0, Date.parse(one.createdAt), kept.asked ?? 0) > WEEK)
  && keep(ctx.fs, { asked: ctx.now() }).then(() => true)))

// ─── Pairing: the bundle, and B's new profile ────────────────────────────────

/**
 * What A sends B once the code matched: this profile as it is named, the id A gave B, its settings and keys as it would send them, each
 * with the time it changed, nothing stamped anew (B may leave it unopened), every project's project.md, Home's too, but those kept on
 * this device (Home's front matter alone), and the devices it knows, B's among them. @param {Context} ctx @param {{ dir: string, name: string, colour?: string }} profile @param {Device} you B's record
 */
export async function bundleOf(ctx, profile, you) {
  // This profile as a person (caps/people), made here where it has none, so that the device added is the same person (D727).
  if (!(await getSecret(ctx.fs, PERSON))) await setSecret(ctx.fs, PERSON, JSON.stringify(await madePerson()))
  const { value } = await look(ctx)
  // One kept on this device stays, but Home, its front matter alone, so that no second Home is made there; those that go, this device had.
  const projects = (await Promise.all((await ctx.fs.list('projects')).map(async ({ name }) => ({ path: `projects/${name}/project.md`, text: await ctx.fs.read(`projects/${name}/project.md`) }))))
    .flatMap(({ path, text }) => ((data) => (text === null || (data.cloud === false && !data.default) ? [] : [{ path, text: data.cloud === false
      ? stringifyFrontMatter(Object.fromEntries(Object.entries(data).filter(([key]) => [...HOME, 'colour', 'cloud'].includes(key))), '') : text }]))(parseFrontMatter(text ?? '').data))
  await known(ctx, ...projects.map((one) => one.path))
  return { kind: 'bundle', profile, you: you.id, settings: value.snapshot, keys: value.keys, projects, devices: [...value.devices, you] }
}

/** Projects another device has, a task of one handed over either way, or a bundle: those this device had (hadToo()). @param {Pick<Context, 'fs' | 'lock'>} ctx @param {string[]} paths in them */
export const known = (ctx, ...paths) => hadToo(ctx, paths.map((path) => path.split('/')[1]))
/** The projects a bundle holds, by folder: those the device it fills has had, and may delete. @param {any} bundle @returns {string[]} */
const projectsOf = (bundle) => (Array.isArray(bundle.projects) ? bundle.projects : []).map((/** @type {any} */ one) => String(one?.path).split('/')[1]).filter(Boolean)
/** Every time 1 at least, so that all a bundle holds, untimed too, comes into a profile that holds nothing yet. @param {Record<string, any>} [part] */
const timed = (part = {}) => Object.fromEntries(Object.entries(part).map(([id, one]) => [id, one && typeof one === 'object' ? { ...one, at: one.at || 1 } : one]))

/**
 * B's new profile filled from A's bundle, before it opens: B's settings for all that doesn't follow, and of what does, the brains,
 * connections, addresses and capabilities of B alone beside A's, leaving out what B's catalogue lacks, saved with their times; the keys of
 * what B keeps of its own, from its profile until now (`secretOf`); A's keys, chosen again by crossing(); every project.md, Home's too, so
 * that no second Home is made; the devices; B's own identity; and the store's keys, if any. @param {FS} fs the new profile's @param {any} bundle
 * @param {{ settings: Settings, catalogue: string[], me: Identity, now: number, secretOf?: (id: string) => Promise<string | null>, policy?: Policy, lock?: boolean, store?: unknown }} here
 *   B's settings until now, its catalogue and identity, the relay's clock, the keys of the profile it was in, the organisation's brains,
 *   whether the profile left beside it has a lock, and the store's keys A sent with *kept*, with B's own token
 */
export async function adopt(fs, bundle, { settings, catalogue, me, now, secretOf = async () => null, policy, lock, store }) {
  const base = /** @type {Settings} */ ({ ...DEFAULT_SETTINGS, ...ownOf(settings) })
  const { fields, brains, connections } = bundle.settings ?? {}
  const { patch, times } = merged(base, {}, { fields: timed(fields), brains: timed(brains), connections: timed(connections) }, now + SOON)
  // Your devices, and the Lock where the profile left beside it has one, so that the new one opens on it (adoptHere() in ./devices.js).
  const next = /** @type {Settings} */ ({ ...base, ...patch, unlocked: [...new Set([...(patch.unlocked ?? base.unlocked).filter((id) => base.unlocked.includes(id) || fits(id, catalogue)), 'devices', ...(lock ? ['lock'] : [])])] })
  await saveSettings(fs, next)
  // With the one secret the Computer's machine keeps for its bridge (caps/machine/machine.js).
  for (const id of [...base.brains.map((brain) => brain.id), ...(base.connections ?? []).map((connection) => connection.id), ...(base.unlocked.includes('machine') ? ['computer-bridge'] : [])]) {
    const value = await secretOf(id)
    if (typeof value === 'string' && await getSecret(fs, id) !== value) await setSecret(fs, id, value)
  }
  await unkinded(fs, settings, next, policy)
  const keys = /** @type {Record<string, KeyStamp>} */ ({})
  await takeKeys(fs, bundle.keys, [next], keys, now + SOON, policy)
  await keep(fs, { ...times, keys, seen: following(next), heard: now, had: projectsOf(bundle) })
  for (const { path, text } of bundle.projects ?? []) if (PROJECT.test(path) && typeof text === 'string') await fs.write(path, text)
  await setSecrets(fs, { [DEVICES]: JSON.stringify(mergeLists([], bundle.devices, '', null) ?? []), [SECRET]: JSON.stringify(me), ...(shaped(store) && { [STORE]: JSON.stringify(store) }) })
}

/**
 * The profile open here filled again from A's bundle, on a device removed that kept Jean on its own (inPlace()): what it did on its own
 * since, stamped now, wins over what came, as with any other device's settings and keys (settle()); a project.md only where none is; then
 * the devices, its identity and the store's keys, with nothing it knew of a store before. @param {Context} ctx its new identity's @param {any} bundle @param {unknown} [store]
 */
export async function refill(ctx, bundle, store) {
  const { had, left = [] } = await followsOf(ctx.fs)
  await settle(ctx, bundle.settings ?? {}, bundle.keys)
  // A project it deleted on its own, paired or since, stays deleted: only those it never had come.
  for (const { path, text } of bundle.projects ?? []) if (PROJECT.test(path) && typeof text === 'string' && !had?.includes(path.split('/')[1]) && !(await ctx.fs.exists(path))) await ctx.fs.write(path, text)
  await hadToo(ctx, projectsOf(bundle))
  // The devices it removed itself stay removed, which the device that removed it may never have heard of; those alone() set aside are
  // forgotten only once the new list is written, so that a refill failing on the way and tried again still knows them.
  const removed = (await listOf(ctx.fs)).filter((one) => one.removedAt && !left.includes(one.id))
  await Promise.all(STORED.map((path) => ctx.fs.remove(path)))
  await setSecrets(ctx.fs, { [DEVICES]: JSON.stringify(mergeLists(removed, bundle.devices, '', null) ?? removed), [SECRET]: JSON.stringify(ctx.me), [STORE]: shaped(store) ? JSON.stringify(store) : null })
  await locked(ctx, FOLLOWING, () => keep(ctx.fs, { left: undefined }))
}

/** What first run makes in a profile, beside Home's project.md, and what this capability keeps there: settings, keys, caches, times. */
const FIRST = /^(settings\.json|\.secrets\/(keys|vault)\.json|\.(cache|devices)\/.+)$/
/** What first run's Home says of itself (createProject() in core/settings.js). */
const HOME = ['format', 'default', 'name', 'createdAt', 'by']
/** A setting's value, none and empty alike. @param {unknown} value */
const set = (value) => JSON.stringify(value && typeof value === 'object' && !Object.keys(value).length ? null : value ?? null)
/**
 * Whether nothing was ever done in a profile, which joining another device's then removes: it holds nothing but what first run makes,
 * settings that follow as first run has them (but what Jean finds out as it goes: capabilities, offers answered, the language), none of
 * those that stay set, no key but this device's own, no device but this one, no lock, and Home as first run writes it, empty. @param {FS} fs
 */
export async function untouched(fs) {
  const all = /** @type {Record<string, any>} */ (await loadSettings(fs))
  const [settings, first] = [following(/** @type {Settings} */ (all)), following(DEFAULT_SETTINGS)]
  if (FOLLOWS.some((name) => !['unlocked', 'offers', 'locale', 'rules'].includes(name) && set(settings[name]) !== set(first[name]))) return false
  // No approval but as it is anyway, nothing else set to happen without asking, nor old tasks deleted or a limit, no brain but the one first run offers (this device's), no
  // connection, and no lock: its vault holds first run's device slot alone.
  if (Object.entries(all.rules ?? {}).some(([kind, rule]) => rule !== (DEFAULT_RULES[kind] ?? 'ask')) || all.brains.some((/** @type {{ api: string }} */ one) => one.api !== 'device') || all.connections?.length
    || ['services', 'pages', 'meet', 'films', 'computer', 'forget', 'limit'].some((name) => set(all[name]) !== set(/** @type {Record<string, any>} */ (DEFAULT_SETTINGS)[name]))) return false
  if ((await readJSON(fs, VAULT, {})).slots?.some((/** @type {{ kind: string }} */ slot) => slot.kind !== 'device')
    || Object.keys(await readJSON(fs, '.secrets/keys.json', {})).some((id) => id !== SECRET && id !== DEVICES)) return false
  // Paired, or once was: its devices still list it, and it may owe one its removal.
  const me = JSON.parse(await getSecret(fs, SECRET) ?? 'null')?.id
  if ((await listOf(fs)).some((one) => one.id !== me)) return false
  let home = false
  for (const path of await walk(fs)) {
    if (FIRST.test(path)) continue
    const { data, body } = parseFrontMatter(PROJECT.test(path) ? await fs.read(path) ?? '' : 'x')
    if (home || data.default !== true || body.trim() || Object.keys(data).some((key) => !HOME.includes(key))) return false
    home = true
  }
  return true
}

// ─── A task handed over ──────────────────────────────────────────────────────

/** A place in a project another device names: relative, inside it, never hidden, nor a task or project.md. @param {unknown} uri */
const inside = (uri) => typeof uri === 'string' && uri.length < 512 && !uri.includes('\\') && uri.split('/').every((part) => part && !part.startsWith('.')) && !/^(conversations\/|project\.md$)/.test(uri)
/** A task's title, its last given. @param {string} text */
const titleOf = (text) => text.split('\n').reduce((title, line) => ((meta) => (typeof meta?.title === 'string' ? meta.title : title))(parsed(line)?.meta), '')

/**
 * What goes when a task is handed to another device: its project's project.md, its conversation, and the files it names with the text and
 * what Files keeps of each, base64; 'kept' for a project kept on this device (cloud: false), 'gone' for a task not here.
 * @param {FS} fs @param {string} path the conversation's
 */
export async function taskOf(fs, path) {
  const dir = path.slice(0, path.lastIndexOf('/conversations/'))
  const [text, project] = path.includes('/conversations/') ? await Promise.all([fs.read(path), fs.read(`${dir}/project.md`)]) : [null, null]
  if (text === null || project === null) return 'gone'
  if (parseFrontMatter(project).data.cloud === false) return 'kept'
  /** @type {Record<string, string>} */
  const files = {}
  for (const one of filesIn(text.split('\n').map(parsed).filter(Boolean)).flatMap(({ uri }) => [uri, ...(/^files\/sha256-/.test(uri) ? ['.md', '.meta.json'].map((end) => uri.replace(/\.[^./]+$/, end)) : [])]).filter(inside)) {
    const bytes = await fs.readBytes(`${dir}/${one}`)
    if (bytes) files[one] = encode(bytes)
  }
  return { kind: 'task', project: { path: `${dir}/project.md`, text: project }, task: { path, text }, files }
}

/** A task's first line without its id, which a copy kept as a new task changes. @param {string} line */
const unnamed = (line) => JSON.stringify({ ...parsed(line), id: '' })
/** Of a project's tasks but `path`, one that holds what came under its own id, and maybe more since: what came, kept as a new task once already. @param {FS} fs @param {string} dir @param {string} path @param {string[]} lines */
async function copyOf(fs, dir, path, [head, ...rest]) {
  for (const { name } of await fs.list(`${dir}/conversations`)) {
    const [first = '', ...others] = (await fs.read(`${dir}/conversations/${name}`) ?? '').split('\n')
    if (`${dir}/conversations/${name}` !== path && unnamed(first) === unnamed(head) && others.join('\n').startsWith(rest.join('\n'))) return `${dir}/conversations/${name}`
  }
  return null
}

/**
 * A task another device handed over, written here: its project's project.md where missing, each file where missing, and the conversation
 * under the same path when this device's copy is missing or a prefix of it, kept when it holds more, else as a new task with a new ULID,
 * as Sync keeps one (caps/sync/mirror.js), once: the same message again finds that copy. Gives where it is and its title; null for
 * anything malformed. @param {FS} fs @param {any} value
 */
export async function arrive(fs, { project, task, files } = {}) {
  const dir = String(project?.path).replace(/\/project\.md$/, '')
  const [head = '', ...rest] = typeof task?.text === 'string' ? task.text.split('\n') : []
  if (!PROJECT.test(project?.path) || typeof project.text !== 'string' || typeof task?.path !== 'string' || !task.path.startsWith(`${dir}/conversations/`)
    || !/^[0-9A-HJKMNP-TV-Z]{26}\.jsonl$/.test(task.path.slice(dir.length + 15)) || parsed(head)?.kind !== 'conversation') return null
  if (!(await fs.exists(project.path))) await fs.write(project.path, project.text)
  for (const [uri, data] of Object.entries(files ?? {})) if (inside(uri) && typeof data === 'string' && !(await fs.exists(`${dir}/${uri}`))) await fs.writeBytes(`${dir}/${uri}`, decode(data))
  const mine = await fs.read(task.path)
  let path = task.path
  if (mine === null || task.text.startsWith(mine)) { if (mine !== task.text) await fs.write(path, task.text) }
  else if (!mine.startsWith(task.text)) {
    const id = ulid()
    path = await copyOf(fs, dir, task.path, [head, ...rest]) ?? `${dir}/conversations/${id}.jsonl`
    if (path.endsWith(`/${id}.jsonl`)) await fs.write(path, [JSON.stringify({ ...parsed(head), id }), ...rest].join('\n'))
  }
  return { path, title: titleOf(task.text) }
}

// ─── What comes in, and a device removed ─────────────────────────────────────

/**
 * What another device of this profile sent, done here: the devices it lists, alone or with its settings and keys, a request for this
 * one's, a task handed over, or this device removed. Gives what the screens show or do next: a task that arrived, or the removal, with
 * whether to erase Jean here. @param {Context} ctx @param {Device} from @param {any} value @param {number} [at] the relay's time of its message
 * @returns {Promise<{ arrived: { path: string, title: string } } | { removed: { erase: boolean } } | null>}
 */
export async function receive(ctx, from, value, at = ctx.now()) {
  // Only from a device this one has at this moment: one removed, here or as a list just told, is heard no more. Its own removal comes
  // with the remover's list, whose removals it then owes too, before it erases.
  if (!(await recordsOf(ctx.fs)).some((one) => one.id === from.id && one.id !== ctx.me.id)) return null
  await hear(ctx, at, from.id)
  const kind = value?.kind
  // A list that changed this one goes on to the others with this device's state, as what changed here does, until every one has it; a
  // device it newly lists as removed is owed the removal by this one too, since that device may not know the one that removed it,
  // owed before the list is written, so that a tab closed between leaves it owed; then the list it sent merged into this one's.
  const [records, list, lists] = [kind === 'devices' ? value.records : value?.devices, await listOf(ctx.fs), ['devices', 'settings', 'removed'].includes(kind)]
  const next = lists && mergeLists(list, records, ctx.me.id, from.id)
  if (next) await mark(ctx, Object.fromEntries(next.filter((one) => one.removedAt && !list.find((held) => held.id === one.id)?.removedAt).map((one) => [one.id, Boolean(one.erase)])))
  const changed = lists && await changeList(ctx.fs, (held) => mergeLists(held, records, ctx.me.id, from.id), ctx.lock)
  if (await (kind === 'settings' && settle(ctx, value.snapshot ?? {}, value.keys)) || changed) await share(ctx)
  if (kind === 'ask') await look(ctx).then(({ value: mine, changed, pending }) => (changed || pending ? share(ctx) : ctx.send(from, mine)))
  if (kind === 'task') return ((arrived) => arrived && known(ctx, arrived.path).then(() => ({ arrived })))(await locked(ctx, ARRIVING, () => arrive(ctx.fs, value)))
  return kind === 'removed' ? { removed: { erase: value.erase === true } } : null
}

/**
 * What a removed device may still hold of the keys that crossed, to revoke where each was made: the brains, the services by their own
 * names (connections, search services), and the sites published with one, by their names online, which a new recovery code in Publish
 * takes back (D720); never a key. @param {FS} fs @param {Settings} settings @param {string[]} ids those crossing() gives
 */
export async function revoking(fs, settings, ids) {
  const nameOf = (/** @type {string} */ id) => settings.connections?.find((one) => one.id === id)?.name
    ?? (id.startsWith('search:') && isService(id.slice(7)) ? SERVICES[/** @type {import('../web-search/services.js').ServiceId} */ (id.slice(7))].name : '')
  const sites = await Promise.all((await fs.list('projects')).map(async ({ name: dir }) => Promise.all((await fs.list(`projects/${dir}/sites`)).filter(({ name }) => ids.includes(`site:${name.split('-')[0]}`))
    .map(async ({ name }) => (await readJSON(fs, `projects/${dir}/sites/${name}/site.json`, {}))?.published?.name))))
  // And the services it signed in to itself, whose sign-in there stays until it is ended at the service.
  return { brains: settings.brains.filter((brain) => ids.includes(brain.id)), services: [...ids.map(nameOf), ...(following(settings).connections ?? []).filter((one) => one.auth === 'oauth').map((one) => one.name)].filter(Boolean), sites: sites.flat().filter(Boolean) }
}

/**
 * A device removed from this profile's: marked as waiting, then kept as removed here at once, so nothing goes to it or is taken from it
 * again, and owed its removal, and whether to erase Jean there (share()). Gives the keys it may hold (revoking()) and the devices that
 * took nothing yet, by name; null for this device or one unknown. @param {Context} ctx @param {string} id @param {boolean} erase
 */
export async function removal(ctx, id, erase) {
  const gone = (await listOf(ctx.fs)).find((one) => one.id === id && one.id !== ctx.me.id)
  if (!gone) return null
  const removedAt = new Date(ctx.now()).toISOString()
  await mark(ctx, { [id]: erase })
  // The devices it added are this one's to vouch for now, so that one that hears of the removal first still takes them.
  await changeList(ctx.fs, (list) => (gone.removedAt ? null : list.map((one) => (one.id === id ? { ...one, removedAt, erase } : one.addedBy === id && !one.removedAt ? { ...one, addedBy: ctx.me.id } : one))), ctx.lock)
  const settings = await ctx.settings()
  return { ...await revoking(ctx.fs, settings, Object.keys(await keysOf(ctx.fs, settings, ctx.policy))), unreached: (await share(ctx)).map((one) => one.name) }
}

/**
 * A device removed here that writes again: back with its mailbox gone meanwhile (unread for months, the relay let it go), owed its removal
 * again; with its own notice that it removed this one, owed nothing, since it never acts on this one's either. Whether it is owed.
 * @param {Context} ctx @param {Device} from @param {any} value
 */
export async function back(ctx, from, value) {
  if (value?.kind === 'removed') return forgive(ctx, from.id).then(() => false)
  // Owed again; marked only while what waits, the list removing it among it, hasn't reached every device it has, so it goes first.
  const [{ pending, unreached = [] }, had] = [await followsOf(ctx.fs), (await recordsOf(ctx.fs)).map((one) => one.id)]
  const owed = { [from.id]: Boolean(from.erase) }
  await (pending || unreached.some((id) => had.includes(id)) ? mark(ctx, owed) : follows(ctx, (kept) => keep(ctx.fs, { owe: { ...kept.owe, ...owed } })))
  return true
}

/** The settings this device brings of its own to a profile it joins (adopt()): the first run's profile's, which holds nothing and goes; none from one with work, maybe another person's. @param {FS} fs the profile open @param {Settings} settings its */
export const broughtFrom = async (fs, settings) => (await untouched(fs) ? settings : null)

/** Of this device's removals a batch brought, the one to act on: the first from a device still had once the batch's lists are taken, which may add it again in place; else the first. @param {FS} fs @param {{ erase: boolean, by: string }[]} removals */
export const firstOf = async (fs, removals) => ((live) => removals.find((one) => live.some((held) => held.id === one.by)) ?? removals[0])(await recordsOf(fs))

/**
 * This device removed by another, Jean kept here on its own: its identity gone, so it neither hears nor sends, and every device kept as
 * removed but the one that removed it, the only one that may add it again in place (inPlace()): a device removed after it, which it never
 * hears of, can't. The times stay, with the projects it has now, so that what it does on its own since wins then, a project it deletes
 * included (refill()). One tab at a time, the devices it set aside written down before any is marked removed, so that a tab closed
 * on the way, or another running it again for the same removal, keeps them. @param {FS} fs @param {string} by @param {number} now
 * @param {string} as this device's id as it was removed @param {Context['lock']} [lock]
 */
export const alone = (fs, by, now, as, lock) => locked({ lock }, LISTING, async () => {
  const [live, projects] = [(await recordsOf(fs)).filter((one) => one.id !== by).map((one) => one.id), (await fs.list('projects')).map(({ name }) => name)]
  // Those it has now, and, run again for the same removal, those it had then; removed as another identity since, only those it has
  // now. Under the times' own lock too, so that a share meanwhile never writes over them.
  await follows({ fs, lock }, (kept) => keep(fs, { left: [...new Set([...(kept.leftAs === as ? kept.left ?? [] : []), ...live])], leftAs: as,
    had: [...new Set([...kept.had ?? [], ...projects])] }))
  // Its identity gone, the store's keys with it, and the others marked removed in one write, never one without the other. What it
  // knew of the store goes, but the versions Markdown merges from, so that joined again its words meet the others' (D721).
  const removedAt = new Date(now).toISOString()
  await setSecrets(fs, { [SECRET]: null, [STORE]: null, [DEVICES]: JSON.stringify((await listOf(fs)).map((one) => (one.id === by ? one : { removedAt, ...one }))) })
  // Nor is it the person any more, nor does it know whom the person met: the others' key turns (caps/people, D727).
  await dropSecrets(fs, (id) => /^(person$|people:|invite:|accept:)/.test(id))
  await Promise.all(STORED.map((path) => fs.remove(path)))
})
