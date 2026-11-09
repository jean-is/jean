// A circle (D733): the members of one shared thing, their roles and colours, and its key for each epoch, anchored on its
// owner's key. Membership lives in the journal itself (relay/journal.js), as signed changes, so that every copy works out the
// same list: `begin`, the owner's, which in a journal everyone moved to vouches for the members who came along; `join`, signed by the
// key it brings; `role`, `remove` and `block`, the owner's; `leave`; and `moved`, the owner's, carrying the next epoch sealed to each
// member left. Each change is signed by its member's profile key
// (ECDSA on its curve, as ee/ certifies it, D732) over the journal, the epoch, the device and its counter, then sealed under the
// epoch's key; a copy takes it only from a member who may make it, with a counter above any seen from that device, so nothing
// replays. Pure, so node --test runs it.
import { encode, decode, fingerprintOf, sealFor, openFrom } from '../../ui/seal.js'

const subtle = crypto.subtle
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' }
const SIGN = { name: 'ECDSA', hash: 'SHA-256' }
const MEMBERSHIP = new Set(['begin', 'join', 'role', 'remove', 'block', 'leave', 'moved'])
/** Colours, as the order people join gives them: the eight of profiles and projects but grey (ui/touches.js). */
export const COLOURS = 7

/** @param {string} text */
const bytes = (text) => new TextEncoder().encode(text)
/** @param {Uint8Array[]} parts */
const joined = (parts) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  parts.reduce((at, part) => (out.set(part, at), at + part.length), 0)
  return out
}

/**
 * A change as its member made it: who (their key's fingerprint), from which device, its counter there, what kind, and its body;
 * `as` says whether a person or their assistant made it (D734).
 * @typedef {{ member: string, device: string, n: number, kind: string, as?: 'person' | 'assistant', body: any }} Change
 * @typedef {{ epoch: number, text: string, change: Change, signature: Uint8Array }} Opened
 * @typedef {{ fp: string, key: JsonWebKey, name: string, role: 'owner' | 'editor' | 'viewer', colour: number, how: 'begin' | 'link' | 'invite',
 *   mailbox?: string, gone?: 'removed' | 'left', blocked?: true }} Member
 * @typedef {{ owner: string, members: Record<string, Member>, counters: Record<string, number>, links: boolean, joined: number }} State
 */

/** An epoch's key, bound to its journal and number. @param {Uint8Array} raw @param {string} id @param {number} epoch */
const epochKey = async (raw, id, epoch) => subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: bytes(`circle|${id}|${epoch}`) },
  await subtle.importKey('raw', /** @type {BufferSource} */ (raw), 'HKDF', false, ['deriveKey']), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
/** What a signature covers: the journal, the epoch, the change. @param {string} id @param {number} epoch @param {string} text */
const covered = (id, epoch, text) => bytes(`${id}|${epoch}|${text}`)
/** The profile key as it signs. @param {JsonWebKey} key */
const signer = ({ kty, crv, x, y, d }) => subtle.importKey('jwk', { kty, crv, x, y, d }, ECDSA, false, ['sign'])
/** @param {JsonWebKey} key @param {Uint8Array} signature @param {Uint8Array} data */
const verifies = async ({ kty, crv, x, y }, signature, data) => {
  try { return await subtle.verify(SIGN, await subtle.importKey('jwk', { kty, crv, x, y }, ECDSA, false, ['verify']), /** @type {BufferSource} */ (signature), /** @type {BufferSource} */ (data)) } catch { return false }
}

/**
 * A change sealed for its journal: 1, the epoch in four bytes, an IV, then AES-256-GCM over the change and its signature.
 * @param {{ id: string, epoch: number, key: Uint8Array }} where @param {JsonWebKey} me the profile's private key @param {Change} change
 */
export async function sealChange({ id, epoch, key }, me, change) {
  const text = JSON.stringify(change)
  const signature = new Uint8Array(await subtle.sign(SIGN, await signer(me), covered(id, epoch, text)))
  const [head, iv] = [new Uint8Array(5), crypto.getRandomValues(new Uint8Array(12))]
  head[0] = 1
  new DataView(head.buffer).setUint32(1, epoch)
  const plain = bytes(JSON.stringify({ c: text, s: encode(signature) }))
  return joined([head, iv, new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: bytes(`${id}|${epoch}`) }, await epochKey(key, id, epoch), plain))])
}

/** A change opened with the key of its epoch, its signature still to check; null for anything else. @param {string} id @param {Record<number, Uint8Array>} keys @param {Uint8Array} sealed @returns {Promise<Opened | null>} */
export async function openChange(id, keys, sealed) {
  try {
    const epoch = new DataView(sealed.buffer, sealed.byteOffset, sealed.length).getUint32(1)
    if (sealed[0] !== 1 || !keys[epoch]) return null
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: sealed.slice(5, 17), additionalData: bytes(`${id}|${epoch}`) }, await epochKey(keys[epoch], id, epoch), sealed.slice(17))
    const { c, s } = JSON.parse(new TextDecoder().decode(plain))
    return { epoch, text: c, change: JSON.parse(c), signature: decode(s) }
  } catch {
    return null
  }
}

/** An invitation good for one person's key alone: its inviter's signature over the journal and the invitee's fingerprint. @param {string} id @param {JsonWebKey} me @param {string} fp */
export const invitation = async (id, me, fp) => ({ by: await fingerprintOf(me), sig: encode(new Uint8Array(await subtle.sign(SIGN, await signer(me), bytes(`${id}|invite|${fp}`)))) })

/** A circle as nobody has joined it yet, anchored on its owner's fingerprint, which the link and the invitation carry. @param {string} owner @returns {State} */
export const begun = (owner) => ({ owner, members: {}, counters: {}, links: false, joined: 0 })

/**
 * The next change of the journal, taken or dropped, as every copy decides it: membership changes the state; the change is returned
 * when a member who may make it made it, and null otherwise. @param {State} state @param {string} id @param {Opened | null} opened
 * @returns {Promise<Change | null>}
 */
export async function take(state, id, opened) {
  if (!opened) return null
  const { change } = opened
  const { member, kind, body } = change
  const by = state.members[member]
  // `begin` and `join` bring their own key; anything else is checked with the key its member joined with.
  const key = kind === 'begin' || kind === 'join' ? body?.key : by?.key
  if (!key || (await fingerprintOf(key)) !== member || !(await verifies(key, opened.signature, covered(id, opened.epoch, opened.text)))) return null
  const device = `${member} ${change.device}`
  if (!Number.isInteger(change.n) || change.n <= (state.counters[device] ?? 0)) return null
  const owner = member === state.owner && by?.role === 'owner'
  const target = state.members[body?.fp]
  const allowed = {
    begin: () => !state.joined && member === state.owner,
    join: () => (!by || by.gone === 'left') && !by?.blocked && (body.how === 'link' ? state.links : body.how === 'invite' && invited(state, id, member, body.invite)),
    role: () => owner && Boolean(target) && body.fp !== member && ['editor', 'viewer'].includes(body.role),
    remove: () => owner && Boolean(target) && body.fp !== member,
    block: () => owner && Boolean(target) && body.fp !== member,
    leave: () => Boolean(by) && !by.gone && !owner,
    moved: () => owner,
  }[kind] ?? (() => Boolean(by) && !by.gone && !by.blocked && by.role !== 'viewer')
  if (!(await allowed())) return null
  state.counters[device] = change.n
  // Those a moved circle's owner brings along, as they were in the journal before, the owner first.
  if (kind === 'begin' && Array.isArray(body.members)) for (const one of body.members) {
    if (one?.fp && one.fp !== member && one.key && (await fingerprintOf(one.key)) === one.fp) state.members[one.fp] = { fp: one.fp, key: one.key, name: String(one.name ?? '').slice(0, 80), role: one.role === 'viewer' ? 'viewer' : 'editor', colour: Number(one.colour) % COLOURS || 0, how: one.how === 'invite' ? 'invite' : 'link', ...(typeof one.mailbox === 'string' && { mailbox: one.mailbox }) }
  }
  if (kind === 'begin' || kind === 'join') {
    state.members[member] = { fp: member, key: { kty: key.kty, crv: key.crv, x: key.x, y: key.y }, name: String(body.name ?? '').slice(0, 80), role: kind === 'begin' ? 'owner' : 'editor',
      colour: by?.colour ?? state.joined % COLOURS, how: kind === 'begin' ? 'begin' : body.how, ...(typeof body.mailbox === 'string' && { mailbox: body.mailbox }) }
    if (kind === 'begin') state.links = body.links === true
    state.joined = Math.max(state.joined + (by ? 0 : 1), ...Object.values(state.members).map((one) => one.colour + 1))
  }
  if (kind === 'role' && target) target.role = body.role
  if (kind === 'remove' && target) target.gone = 'removed'
  if (kind === 'block' && target) target.blocked = true
  if (kind === 'leave' && by) by.gone = 'left'
  return change
}

/** Whether an invitation names this key and was signed by a member who can invite. @param {State} state @param {string} id @param {string} fp @param {any} invite */
async function invited(state, id, fp, invite) {
  const by = state.members[invite?.by]
  return Boolean(by) && !by.gone && !by.blocked && by.role !== 'viewer' && verifies(by.key, decode(String(invite.sig)), bytes(`${id}|invite|${fp}`))
}

/** A fleeting message, believed when a member still in signed it; nothing is counted, since nothing is kept. @param {State} state @param {string} id @param {Opened | null} opened */
export async function heard(state, id, opened) {
  const by = opened && state.members[opened.change.member]
  return by && !by.gone && !by.blocked && (await verifies(by.key, opened.signature, covered(id, opened.epoch, opened.text))) ? opened.change : null
}

/** A part's bytes sealed under the epoch's key, for its journal. @param {{ id: string, epoch: number, key: Uint8Array }} where @param {Uint8Array} plain */
export async function sealPart({ id, epoch, key }, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  return joined([iv, new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: bytes(`${id}|${epoch}|part`) }, await epochKey(key, id, epoch), /** @type {BufferSource} */ (plain)))])
}
/** @param {string} id @param {number} epoch @param {Uint8Array} key @param {Uint8Array} sealed */
export const openPart = async (id, epoch, key, sealed) => new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: sealed.slice(0, 12), additionalData: bytes(`${id}|${epoch}|part`) }, await epochKey(key, id, epoch), sealed.slice(12)))

/** Whether a change is about who is in, rather than the thing itself. @param {Change} change */
export const isMembership = (change) => MEMBERSHIP.has(change.kind)

/** The members still in, in the order they came. @param {State} state */
export const membersOf = (state) => Object.values(state.members).filter((one) => !one.gone).sort((a, b) => a.colour - b.colour)

/**
 * What `moved` carries: the next epoch, sealed to each member left, as removing a device seals the store's (caps/devices/epochs.js).
 * @param {State} state @param {string[]} leaving the fingerprints removed @param {object} next what a member needs to follow: the next journal's tokens and key
 */
export const envelopes = async (state, leaving, next) => Object.fromEntries(await Promise.all(membersOf(state).filter((one) => !leaving.includes(one.fp)).map(async (one) => [one.fp, await sealFor(one.key, next)])))

/** This member's part of a `moved`, opened with their profile's private key; null when there is none for them. @param {any} body @param {string} fp @param {JsonWebKey} me */
export const followed = async (body, fp, me) => (body?.envelopes?.[fp] ? openFrom(me, body.envelopes[fp]).catch(() => null) : null)

/**
 * A link to join, after `#/join/`: the owner's fingerprint, the epoch, the read token, the epoch's key and, for a link to edit,
 * the write token. Its secret stays in the address's `#`, which no server sees (D361).
 * @param {{ owner: string, epoch: number, read: string, key: Uint8Array, write?: string }} link
 */
export const linkOf = ({ owner, epoch, read, key, write }) => [owner, epoch, read, encode(key).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), ...(write ? [write] : [])].join('.')

/** A link's parts, or null for anything else. @param {string} text */
export function fromLink(text) {
  const [owner, epoch, read, key, write] = text.split('.')
  if (!/^[\w-]{22}$/.test(owner) || !/^\d{1,9}$/.test(epoch) || !/^[\w-]{43}$/.test(read) || !/^[\w-]{43}$/.test(key) || (write !== undefined && !/^[\w-]{43}$/.test(write))) return null
  return { owner, epoch: Number(epoch), read, key: decode(key.replace(/-/g, '+').replace(/_/g, '/') + '='), ...(write && { write }) }
}
