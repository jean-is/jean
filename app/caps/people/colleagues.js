// Colleagues (D731): where the organisation's own relay lists the people its sign-in names (relay/colleagues.js), this person listed there
// under their profile's key and person mailbox, proved by the ID token the organisation's sign-in keeps, after each start at most daily and
// whenever the mailbox changes; and colleagues found there, by a few words, an account or a mailbox, kept as people met are, with no
// meeting: a record for each of their devices, its key pinned. Someone who writes first is looked up by the mailbox their letter gives;
// a new device of someone kept is held until the person trusts it. Pure, no DOM and no app state: node --test runs it against the relay.
import { ask, open } from '../../ui/relay.js'
import { fingerprintOf } from '../../ui/seal.js'
import { metId, nameId, peopleOf } from './flow.js'

/** @typedef {import('./flow.js').Person} Person */
/** @typedef {import('./flow.js').Context} Context */
/** Someone listed, as a colleague sees them: each device, the newest first. @typedef {{ name: string, account: string, devices: { mailbox: string, key: JsonWebKey, chain?: string[] }[], groups?: string[], guest?: true }} Listed */

/** Whether the relay lists the people of the organisation's sign-in. @param {string} base @param {string} issuer */
export const lists = (base, issuer) => fetch(base).then((response) => response.json()).then(({ issuers }) => Array.isArray(issuers) && issuers.includes(issuer), () => false)

/**
 * This person listed, under their key and person mailbox, opened first: what the list says of them.
 * @param {string} base @param {Person} person @param {string} proof the ID token @returns {Promise<{ name: string, account: string }>}
 */
export async function listed(base, person, proof) {
  await open(base, person.token)
  const { kty, crv, x, y } = person.public
  return (await ask(`${base}v1/people/${person.mailbox}`, { method: 'PUT', headers: { authorization: `Bearer ${person.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ proof, key: { kty, crv, x, y } }) })).json()
}

/** Colleagues the list names, by a URL query: `q=` a few words, `account=` or `mailbox=`. @param {string} base @param {Person} person @param {string} query @returns {Promise<Listed[]>} */
export const find = async (base, person, query) => (await (await ask(`${base}v1/people?${query}`, { headers: { authorization: `Bearer ${person.token}` } })).json()).people

/** A device of a colleague's as People keeps someone met. @param {Listed} one @param {Listed['devices'][number]} device @param {number} at @param {object} [more] */
const metOf = (one, { mailbox, key }, at, more = {}) => JSON.stringify({ format: 1, key, said: one.name.slice(0, 80), met: 'organisation', account: one.account, mailbox, at, ...more })

/** A colleague kept, each device listed under its key, pinned, and those no longer listed forgotten: the person's own choice. @param {Context} ctx @param {Listed} one */
export async function keep(ctx, one) {
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
  if (!known) await keep(ctx, one)
  else await ctx.set({ [metId(sent.from)]: metOf({ ...one, name: known.said }, device, ctx.now(), { asking: true }), [nameId(sent.from)]: known.name })
  return true
}

/** Each held device of a colleague's trusted. @param {Context} ctx @param {string} account */
export const trust = async (ctx, account) => ctx.set(Object.fromEntries((await peopleOf(ctx)).filter((one) => one.account === account && one.asking)
  .map(({ fp, name, asking, ...met }) => [metId(fp), JSON.stringify(met)])))
