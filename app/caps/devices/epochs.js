// SPDX-License-Identifier: MIT
// Who is in a person's store, and the keys a removal changes (D721). Removing a device starts the store's next epoch: its key, made on
// the device that removes, goes sealed from that device's key to each device its own list still has, itself too, never by the relay's
// list, with every device removed so far and the rev the epoch begins after, all in one write the relay takes under the last epoch's
// proof. The key is kept as pending first, so a crash on the way leaves it to try again. Each device opens its envelope only from a
// key it has, takes those removals as its own, and refuses a version sealed under an older epoch after a newer one began. A device
// that missed an epoch gets it by mailbox from one that has it, never one an epoch removed. Web-standard: node --test runs it against
// the relay itself.
import { base64url, bytesOf, hashOf, idOf, random } from '../share/seal.js'
import { envelope, openEnvelope } from './pair.js'

/** @typedef {import('./flow.js').Device} Device */
/** @typedef {import('./flow.js').Identity} Identity */
/** What an epoch's envelope holds: its number, every epoch's key, every device removed so far by its record, and the rev each epoch began after. @typedef {{ epoch: number, epochs: Record<string, string>, removed?: string[], starts?: Record<string, number> }} Epoch */
/**
 * The store's keys as a device holds them, the secret `store`: its relay, its id, this device's token, the naming key, the epochs, the next
 * one while it is being started, and whether the relay stopped opening it. @typedef {Omit<Epoch, 'epoch'> & { relay: string, sid: string, token: string, N: string, pending?: Epoch, gone?: true }} Held
 */

/** @param {Record<string, string>} epochs */
export const newest = (epochs) => Math.max(...Object.keys(epochs).map(Number))
/** What changes who is in the store, drawn from its newest epoch's key. @param {Record<string, string>} epochs */
export async function proofOf(epochs) {
  const key = await crypto.subtle.importKey('raw', bytesOf(epochs[newest(epochs)]), 'HKDF', false, ['deriveBits'])
  return base64url(new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: new TextEncoder().encode('admin') }, key, 256)))
}
/** What the store answers, or an Error with its status. @param {Held} held @param {string} [path] @param {RequestInit & { proof?: string }} [init] */
export async function call({ relay, sid, token }, path = '', { proof, ...init } = {}, go = fetch) {
  const response = await go(`${relay}v1/s/${sid}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(proof && { 'store-proof': proof }) } })
  if (!response.ok) throw Object.assign(new Error(`The store answered ${response.status}.`), { status: response.status })
  return response.json()
}
/**
 * A device let into the store by its token's SHA-256, by another or by itself; with no token, only whether the proof of the newest
 * epoch held is the store's. @param {Held} held @param {string} id its record's @param {string} [hash] @param {typeof fetch} [go]
 */
export const enter = async (held, id, hash, go) => call(held, '/devices', { method: 'POST', proof: await proofOf(held.epochs), body: JSON.stringify({ id: await idOf(id), token: hash, epoch: newest(held.epochs) }) }, go)

/** The keys held, with an epoch or another device's keys of the same store taken in: keys and starts add up, and removed stays removed. @param {Held} held @param {Omit<Epoch, 'epoch'>} epoch @returns {Held} */
export const merged = (held, { epochs, removed = [], starts = {} }) => ({ ...held, epochs: { ...held.epochs, ...epochs }, removed: [...new Set([...held.removed ?? [], ...removed])], starts: { ...held.starts, ...starts }, pending: undefined })
/** Whether this device's list removed a device no epoch has shut out of the store yet. @param {Held} held @param {Device[]} list */
export const owed = (held, list) => list.some((one) => one.removedAt && !held.removed?.includes(one.id))
/** The epoch the relay is at, from this device's envelope, opened only from the key of a device it has; null where none opens. @param {Identity} me @param {Device[]} live @param {{ epoch: number, envelope: string | null }} info @returns {Promise<Epoch | null>} */
export const opened = (me, live, info) => openEnvelope(me, live.map((one) => one.key), new TextEncoder().encode(String(info.envelope))).then(({ value }) => (value?.epoch === info.epoch ? value : null), () => null)

/** The next epoch, or the one left pending at this one, tried again: a key, every device removed so far, and the rev it begins after. @param {Held} held @param {Device[]} list @param {{ last: number }} info @returns {Epoch} */
export const next = (held, list, info, epoch = newest(held.epochs) + 1) => (held.pending?.epoch === epoch ? held.pending : { epoch, epochs: { ...held.epochs, [epoch]: base64url(random(32)) },
  removed: [...new Set([...held.removed ?? [], ...list.filter((one) => one.removedAt).map((one) => one.id)])], starts: { ...held.starts, [epoch]: info.last } })

/**
 * The next epoch begun: sealed to each device the list still has and the epoch doesn't name, this one among them, those it names let out,
 * under the last epoch's proof; the keys held with it, or the relay's refusal when another went first (403, its proof gone, or 409). @param {Held} held @param {Identity} me
 * @param {Device[]} list @param {Epoch} epoch @param {typeof fetch} [go]
 */
export async function rotate(held, me, list, epoch, go) {
  const to = list.filter((one) => !one.removedAt && !epoch.removed?.includes(one.id))
  const envelopes = Object.fromEntries(await Promise.all(to.map(async (one) => [await idOf(one.id), new TextDecoder().decode(await envelope(me, one.key, epoch))])))
  await call(held, '/epoch', { method: 'POST', proof: await proofOf(held.epochs), body: JSON.stringify({ epoch: epoch.epoch, remove: await Promise.all((epoch.removed ?? []).map(idOf)), proof: await hashOf(await proofOf(epoch.epochs)), envelopes }) }, go)
  return merged(held, epoch)
}

/**
 * Whether another device's settings say it holds no store, one whose id comes after, or this one at an older epoch, and it is no device an
 * epoch removed: it is sent the keys. @param {Held} held @param {Device} from @param {{ sid?: string, epoch?: number } | null} [theirs]
 */
export const behind = (held, from, theirs) => !held.removed?.includes(from.id) && (theirs?.sid === held.sid ? Number(theirs.epoch) < newest(held.epochs) : !(String(theirs?.sid ?? '~') < held.sid))
