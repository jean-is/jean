// Colleagues (D731): where the organisation's own relay lists the people its sign-in names (relay/colleagues.js), this person listed there
// under their profile's key and person mailbox, proved by the ID token the organisation's sign-in keeps, after each start at most daily and
// whenever the mailbox changes; and colleagues found there, by a few words, an account or a mailbox, kept as people met are, with no
// meeting: a record for each of their devices, its key pinned. Someone who writes first is looked up by the mailbox their letter gives;
// a new device of someone kept is held until the person trusts it. Where the organisation's controls say (ee/, D732), someone is found and
// kept only with the devices they vouch for, and the listing carries the certificate they give the profile's key. Pure, no DOM and no app
// state: node --test runs it against the relay.
import { ask, open } from '../../ui/relay.js'
import { fingerprintOf } from '../../ui/seal.js'
import { checked, metId, nameId, peopleOf } from './flow.js'

/** @typedef {import('./flow.js').Person} Person */
/** @typedef {import('./flow.js').Context} Context */
/** @type {() => never} */
const refused = () => { throw Object.assign(new Error('The organisation keeps this person from this one.'), { reason: 'refused' }) }
/** Someone listed, as a colleague sees them: each device, the newest first. @typedef {{ name: string, account: string, devices: { mailbox: string, key: JsonWebKey, chain?: string[] }[], groups?: string[] | null, guest?: true }} Listed */

/** Whether the relay lists the people of the organisation's sign-in. @param {string} base @param {string} issuer */
export const lists = (base, issuer) => fetch(base).then((response) => response.json()).then(({ issuers }) => Array.isArray(issuers) && issuers.includes(issuer), () => false)

/**
 * This person listed, under their key and person mailbox, opened first, with the certificate of that key the organisation's controls give:
 * what the list says of them. @param {Context} ctx @param {Person} person @param {string} proof the ID token @returns {Promise<{ name: string, account: string }>}
 */
export async function listed(ctx, person, proof) {
  await open(ctx.base, person.token)
  const [{ kty, crv, x, y, d }, ecdsa] = [person.key, { name: 'ECDSA', namedCurve: 'P-256' }]
  // The profile key as it signs (ECDSA, on its curve): a certificate's request, its one signature.
  const keys = { privateKey: await crypto.subtle.importKey('jwk', { kty, crv, x, y, d }, ecdsa, false, ['sign']), publicKey: await crypto.subtle.importKey('jwk', { kty, crv, x, y }, ecdsa, true, ['verify']) }
  const { chain } = await checked(ctx, { action: 'list', keys, proof })
  return (await ask(`${ctx.base}v1/people/${person.mailbox}`, { method: 'PUT', headers: { authorization: `Bearer ${person.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ proof, key: { kty, crv, x, y }, ...(chain && { chain }) }) })).json()
}

/** Colleagues the list names, by a URL query: `q=` a few words, `account=` or `mailbox=`. @param {string} base @param {Person} person @param {string} query @returns {Promise<Listed[]>} */
export const find = async (base, person, query) => (await (await ask(`${base}v1/people?${query}`, { headers: { authorization: `Bearer ${person.token}` } })).json()).people

/** A device of a colleague's as People keeps someone met, with what the list gives of them. @param {Listed} one @param {Listed['devices'][number]} device @param {number} at @param {object} [more] */
const metOf = ({ name, account, groups, guest }, { mailbox, key, chain }, at, more = {}) => JSON.stringify({ format: 1, key, said: name.slice(0, 80), met: 'organisation', account, mailbox, at,
  ...(groups !== undefined && { groups }), ...(guest && { guest }), ...(chain && { chain }), ...more })

/**
 * Someone the list gives, as the organisation's controls let them through, to be found or kept: with the devices they vouch for, or null.
 * @param {Context} ctx @param {'find' | 'add'} action @param {Listed} one @returns {Promise<Listed | null>}
 */
export async function vetted(ctx, action, one) {
  const passed = await checked(ctx, { action, person: { ...one, met: 'organisation' } })
  return passed.refuse ? null : { ...one, devices: /** @type {Listed['devices']} */ (passed.person?.devices ?? one.devices) }
}

/**
 * A colleague kept, each device listed under its key that the organisation's controls let through, pinned, and those no longer listed
 * forgotten: the person's own choice. Refused, saying so, where the controls refuse them. @param {Context} ctx @param {Listed} found
 */
export async function keep(ctx, found) {
  const one = await vetted(ctx, 'add', found) ?? refused()
  const [all, fps] = [await peopleOf(ctx), await Promise.all(one.devices.map((device) => fingerprintOf(device.key)))]
  const name = all.find((other) => other.account === one.account)?.name ?? one.name.slice(0, 80)
  await ctx.set(Object.fromEntries([...all.filter((other) => other.account === one.account && !fps.includes(other.fp)).flatMap((other) => [[metId(other.fp), null], [nameId(other.fp), null]]),
    ...one.devices.flatMap((device, i) => [[metId(fps[i]), metOf(one, device, ctx.now())], [nameId(fps[i]), name]])]))
}

/**
 * A letter from a key no one here met, from a colleague's device the list names with that key at the mailbox it gives: someone new, kept
 * with all their devices, as if found; a new device of someone kept, held until the person trusts it. Whether it was either.
 * @param {Context} ctx @param {Person} person @param {Uint8Array} bytes
 */
export async function introduced(ctx, person, bytes) {
  /** @type {any} */
  let sent = {}
  try { sent = JSON.parse(new TextDecoder().decode(bytes)) } catch {}
  if (typeof sent?.from !== 'string' || typeof sent.mailbox !== 'string' || await ctx.get(metId(sent.from))) return false
  const [one] = await find(ctx.base, person, `mailbox=${encodeURIComponent(sent.mailbox)}`)
  const device = one?.devices.find((each) => each.mailbox === sent.mailbox)
  if (!device || await fingerprintOf(device.key) !== sent.from) return false
  const known = (await peopleOf(ctx)).find((other) => other.account === one.account)
  if (!known) return keep(ctx, one).then(() => true, () => false)
  if (!(await vetted(ctx, 'add', { ...one, devices: [device] }))) return false
  await ctx.set({ [metId(sent.from)]: metOf({ ...one, name: known.said }, device, ctx.now(), { asking: true }), [nameId(sent.from)]: known.name })
  return true
}

/** Each held device of a colleague's trusted. @param {Context} ctx @param {string} account */
export const trust = async (ctx, account) => ctx.set(Object.fromEntries((await peopleOf(ctx)).filter((one) => one.account === account && one.asking)
  .map(({ fp, name, asking, ...met }) => [metId(fp), JSON.stringify(met)])))
