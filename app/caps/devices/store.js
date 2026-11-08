// The person's store on their devices (D721, D227): their tasks and files sealed in the store the relay keeps (./store-fs.js), which
// Sync's round (caps/sync/mirror.js) keeps the same as each device's own, while the profile is open, a round at a time with Sync's
// (caps/sync/rounds.js). The device that adds another makes it where there is none, or the first of the person's devices; its keys
// go to the others by mailbox, each coming in with a token of its own, and two stores made apart meet in the one whose id comes first.
// Projects kept on this device stay out, and one switched to it leaves the store. Nothing a round sends begins while an answer is
// written, here or in another tab; a round ends after 20 seconds and the next goes on; a file that fails the same way again waits
// until it changes; a full store keeps new things here until it has room, and a full device stops its rounds. A device removed here is
// shut out by the store's next epoch (./epochs.js), begun by the next round, and an epoch begun elsewhere is taken at the round's start.
import { signal } from '@preact/signals-core'
import { app } from '../../ui/state.js'
import { mine } from '../../ui/opfs.js'
import { getSecret, setSecret, deleteSecret } from '../../ui/secrets.js'
import { readJSON, writeJSON, walk } from '../../core/fs.js'
import { rounds, later, answering } from '../sync/rounds.js'
import { syncRound } from '../sync/mirror.js'
import { base64url, bytesOf, hashOf, idOf, random } from '../share/seal.js'
import { openStore } from './store-fs.js'
import { newest, proofOf, call, enter, merged, owed, opened, next, rotate, behind } from './epochs.js'
import { STORE, STORED, shaped, carrying, tell, look, listOf, changeList, recordsOf } from './flow.js'

/** @typedef {import('../../core/types.js').FS} FS */
/** @typedef {import('./flow.js').Context} Context */
/** @typedef {import('./flow.js').Device} Device */
/** @typedef {import('./epochs.js').Held} Held */
/** @typedef {import('./epochs.js').Epoch} Epoch */

/** Where the round's base is kept, and the projects owed their leaving the store. */
const [CACHE, OWED] = ['.cache/store', '.devices/store.json']
/** How the store stands, for Your devices: what it holds of its room, full, gone (the relay no longer opens it), this device out of room, or a removed device not yet shut out. */
export const state = signal(/** @type {{ use?: number, quota?: number, full?: boolean, gone?: boolean, room?: boolean, owing?: boolean }} */ ({}))
let [context, relay, stop] = [/** @type {Context | null} */ (null), () => '', () => {}]
let [full, halted, asked] = [false, false, false]

/** @returns {Promise<Held | null>} */
const heldOf = async () => JSON.parse(await getSecret(app.fs, STORE) ?? 'null')
/** Whether the keys held open a store this device can use: not gone, on the relay named now. @param {Held | null} held @returns {held is Held} */
const usable = (held) => Boolean(held && !held.gone && held.relay === relay())
/** A request of a round, refused while an answer is written, here or in another tab, so that none begins during it. @type {typeof fetch} */
const gate = async (url, init) => (await answering() ? Promise.reject(new DOMException('An answer is being written.', 'AbortError')) : fetch(url, init))
/** The keys kept; of another store, what this device knew of the last dropped first, so that nothing of it reads as deleted. @param {Held} held @param {boolean} [anew] */
async function keep(held, anew = false) {
  if (anew) await Promise.all(STORED.map((path) => app.fs.remove(path)))
  await setSecret(app.fs, STORE, JSON.stringify(held))
  if (anew || held.gone) state.value = held.gone ? { gone: true } : {}
}
/** The keys another device takes, its token and what is this one's own left out. @param {Held} held */
const keysOf = (held) => ({ ...held, token: undefined, pending: undefined, gone: undefined })
/**
 * An epoch, or the same store's later keys from another device, taken in, and the devices it names as removed removed here too, for
 * good, as a list from them would. @param {Held} held @param {Omit<Epoch, 'epoch'>} epoch
 */
async function taken(held, epoch) {
  await keep(held = merged(held, epoch))
  const shut = (/** @type {Device} */ one) => !one.removedAt && one.id !== context?.me.id && Boolean(held.removed?.includes(one.id))
  await changeList(app.fs, (list) => (list.some(shut) ? list.map((one) => (shut(one) ? { ...one, removedAt: new Date().toISOString(), erase: false } : one)) : null), context?.lock)
  return held
}

/**
 * The store this device holds, or, where the relay keeps stores, a new one, this device its first, whose keys go to the other devices
 * but `but`; null on a relay that keeps none. @param {Context} ctx @param {string[]} [but] @param {boolean} [anew] where the store is gone
 */
const made = (ctx, but = [], anew = false) => navigator.locks.request(mine('app-store'), async () => {
  const held = await heldOf()
  if (held && !(anew && !usable(held))) return held
  if (!(await (await fetch(relay())).json()).store) return null
  const fresh = { relay: relay(), sid: base64url(random(16)), token: base64url(random(32)), N: base64url(random(32)), epochs: { 0: base64url(random(32)) },
    removed: (await listOf(app.fs)).filter((one) => one.removedAt).map((one) => one.id) }
  await call(fresh, '', { method: 'PUT', body: JSON.stringify({ id: await idOf(ctx.me.id), proof: await hashOf(await proofOf(fresh.epochs)) }) })
  await keep(fresh, true)
  await tell(ctx, { kind: 'store', ...keysOf(fresh) }, but)
  return fresh
})

/**
 * Adding a device, on the one that has the Jean: the new one's token let into the store, made first where there is none; the keys
 * *kept* takes it, or null on a relay that keeps no stores, the new device then joining without one. @param {Context} ctx
 * @param {string} id the new device's @param {unknown} hash its token's SHA-256 @param {() => string} relayOf
 */
export async function admit(ctx, id, hash, relayOf) {
  relay = relayOf
  if (typeof hash !== 'string' || !/^[\w-]{43}$/.test(hash)) return null
  const held = await made(ctx, [id])
  if (!usable(held)) return null
  await enter(held, id, hash)
  await start(ctx, relayOf)
  return keysOf(held)
}

/**
 * Another device's message about stores: its keys (`store`), taken where this device holds none, one the relay no longer opens, or one
 * whose id comes after, coming in with a token of its own, or, of the same store, its later epochs; or its settings, saying which it
 * holds and at which epoch, sent this one's keys when it is behind (./epochs.js). @param {Context} ctx @param {Device} from @param {any} value
 */
export async function heard(ctx, from, value) {
  const held = await heldOf()
  if (value.kind === 'settings' && usable(held) && behind(held, from, value.store)) return ctx.send(from, { kind: 'store', ...keysOf(held) })
  if (value.kind !== 'store' || !shaped(value) || value.relay !== relay()) return
  await navigator.locks.request(mine('app-store'), async () => {
    const now = await heldOf()
    if (now && now.sid === value.sid) return newest(value.epochs) > newest(now.epochs) && taken(now, value)
    if (usable(now) && now.sid < value.sid && await call(now).then(() => true, (error) => ![403, 404].includes(error?.status))) return
    const fresh = { ...value, kind: undefined, token: base64url(random(32)) }
    await enter(fresh, ctx.me.id, await hashOf(fresh.token))
    await keep(fresh, true)
  })
  later()
}

/** Start again, where the store is gone: a new one, this device its first, its keys sent to the others. */
export const again = async () => { if (context) { await made(context, [], true); later() } }

/** A project switched to kept on this device leaves the store: owed, so that a round offline or held back by an answer does it later. @param {string} dir */
export const withdraw = (dir) => owe((owed) => [...new Set([...owed, dir])]).then(later)
/** @param {(owed: string[]) => string[]} edit */
const owe = (edit) => navigator.locks.request(mine('app-owed'), async () => writeJSON(app.fs, OWED, { format: 1, owed: edit((await readJSON(app.fs, OWED, {})).owed ?? []) }))

/** Paths that failed the way trying again won't change (a part not what its name says, a file too large), by both sides' versions then. */
const skip = new Map()
/** @param {FS} fs @param {string} path */
const versionOf = async (fs, path) => JSON.stringify(await Promise.all([app.fs, fs].map((one) => one.stat?.(path))))
/** @param {FS} fs @param {string} path @param {any} error @returns {Promise<never>} */
async function failing(fs, path, error) {
  if (error?.name === 'QuotaExceededError') full = true
  if (['DataError', 'NotSupportedError'].includes(error?.name)) skip.set(path, await versionOf(fs, path))
  throw error
}
/** The store's FS with what this device remembers of it: full, nothing new goes up; a path that failed waits. @param {FS} fs @returns {FS} */
const guarded = (fs) => ({ ...fs, readBytes: (path) => fs.readBytes(path).catch((error) => failing(fs, path, error)),
  writeBytes: (path, bytes) => (full ? Promise.reject(new DOMException('The store is full.', 'QuotaExceededError')) : fs.writeBytes(path, bytes)).catch((error) => failing(fs, path, error)) })

/**
 * A round with the store, under rounds.js's lock: its room read, the feed, the projects owed their leaving, then Sync's round with the
 * store's base, again while a write was refused, up to three times. Gives the paths that came in.
 */
async function run() {
  const first = await heldOf()
  if (!first || halted || !context) return []
  if (!usable(first)) { state.value = { gone: true }; return [] }
  let held = first
  // Its room, and whether the relay still opens it to this device: gone after months unused, or this device let out, it is said so and
  // kept until another store's keys come or the person starts again; never a file deleted on the relay's word.
  const info = await call(held, '', {}, gate).catch((/** @type {any} */ error) => ({ error }))
  if ([403, 404].includes(info.error?.status)) await navigator.locks.request(mine('app-store'), async () => (await heldOf())?.sid === first.sid && keep({ ...first, gone: true }))
  if (info.error) return []
  full &&= info.use + 4_194_304 > info.quota
  const [me, list, came] = [context.me, await listOf(app.fs), /** @type {string[]} */ ([])]
  try {
    // A later epoch: its keys from this device's envelope, opened only from a device it has, or the one this device was starting, where
    // the store's proof is its; otherwise asked for, by mailbox, from the devices that have it.
    if (info.epoch > newest(held.epochs)) {
      const { pending } = held
      const epoch = await opened(me, list.filter((one) => !one.removedAt), info) ?? (pending && pending.epoch === info.epoch ? await enter({ ...held, epochs: pending.epochs }, me.id, undefined, gate).then(() => pending, () => null) : null)
      if (epoch) held = await taken(held, epoch)
      else if (!asked) asked = Boolean(await tell(context, (await look(context)).value))
    }
    // A device this one's list removed and no epoch shut out yet: the next epoch, its key kept first, so a crash on the way loses nothing.
    state.value = { use: info.use, quota: info.quota, full, owing: owed(held, list) }
    if (state.peek().owing && info.epoch === newest(held.epochs)) {
      // The last other device removed, no device needs the copy any more: it goes from the relay, and this device keeps its files alone.
      if (list.every((one) => one.removedAt || one.id === me.id)) {
        await call(held, '', { method: 'DELETE', proof: await proofOf(held.epochs) }, gate)
        await Promise.all([deleteSecret(app.fs, STORE), ...STORED.map((path) => app.fs.remove(path))])
        state.value = {}
        return came
      }
      const epoch = next(held, list, info)
      await keep({ ...held, pending: epoch })
      await keep(held = await rotate(held, me, list, epoch, gate))
      state.value = { ...state.peek(), owing: false }
    }
    // Opened at each round, its manifest read again, so that a tab never works from what another changed since.
    const store = openStore({ base: held.relay, sid: held.sid, token: held.token, names: bytesOf(held.N), here: app.fs, fetch: gate, starts: held.starts,
      epochs: Object.fromEntries(Object.entries(held.epochs).map(([epoch, raw]) => [epoch, bytesOf(raw)])) })
    // Read again from the start, what the round knew goes, so that nothing the feed hasn't brought yet reads as deleted.
    if ((await store.pull()).reset) await app.fs.remove(STORED[0])
    for (const [path, was] of skip) if (await versionOf(store.fs, path) !== was) skip.delete(path)
    const carry = carrying(app.projects.peek())
    for (const dir of (await readJSON(app.fs, OWED, {})).owed ?? []) {
      for (const path of await walk(store.fs, dir)) if (!carry(path)) await store.fs.remove(path)
      await owe((owed) => owed.filter((one) => one !== dir))
    }
    const until = Date.now() + 20_000
    for (let tries = 0, refused = -1; tries < 3 && refused !== store.refused(); tries++) {
      refused = store.refused()
      came.push(...await syncRound(app.fs, guarded(store.fs), { cache: CACHE, carry, busy: (path) => app.running.peek().length > 0 || Date.now() > until || skip.has(path),
        removing: async (removals, act) => (await import('../../ui/send.js')).removing(removals, act) }))
    }
    if (Date.now() > until) later()
  } catch (error) {
    const { name, came: some = [] } = /** @type {any} */ (error)
    came.push(...some)
    state.value = { ...state.peek(), full, room: name === 'QuotaExceededError' && !full }
    if (state.peek().room) halted = true
    else if (!['AbortError', 'QuotaExceededError'].includes(name)) console.warn('Store', error)
  }
  return came
}

/**
 * Rounds while the profile is open and paired, the store's keys read at each; where there is none yet, the first of the person's
 * devices makes one. @param {Context} ctx @param {() => string} relayOf
 */
export async function start(ctx, relayOf) {
  [context, relay] = [ctx, relayOf]
  stop()
  stop = rounds({ carry: (path) => carrying(app.projects.peek())(path), outside: true, run })
  const live = (await recordsOf(app.fs)).map((one) => one.id).sort()
  if (live.length > 1 && live[0] === ctx.me.id && !(await heldOf())) made(ctx).catch((error) => console.warn('Store', error))
}
