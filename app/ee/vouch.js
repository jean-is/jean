// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// What policy's `colleagues` asks of the people an organisation's relay lists (D731, D732). `certify`: a colleague's device is found,
// kept, sent to and heard only while the certificate of its profile key, for the account the list gives, leads to one of policy's
// anchors (`trust`), so that the relay can't give another key; the organisation's authority issues it (colleagues.js). `apart`: sets of
// the sign-in's groups and app roles whose people neither find nor reach each other, as policy's sections name them (D429); someone
// whose groups aren't known, or who is in more than their token holds, is kept apart from everyone. `guests: "refuse"`: no one the
// list calls a guest. `inside`: people from the list alone, no meeting by a code or a link, as `apart` and `certify` have it too, since
// a meeting gives no account, groups or certificate. Pure, so it is tested under node --test.
import { children, valueOf } from '../caps/receipt/der.js'
import { parts, same, unbase64 } from './pkix.js'
import { anchorsOf, vouching } from './trust.js'
import { checked as sealOf } from './est.js'

/** @typedef {import('./pkix.js').Parts} Parts */
/**
 * Someone as People's `person.check` gives them: a colleague as the list gives them, or someone met, with their device.
 * @typedef {{ name?: string, account?: string, met: string, groups?: string[] | null, guest?: true, devices: { key: JsonWebKey, mailbox?: string, chain?: string[] }[] }} Someone
 */
/** Policy's `colleagues`, read. @typedef {{ certify: boolean, apart: string[][], inside: boolean, guests?: 'refuse' }} Policy */
/** What judges: policy's `colleagues`, its anchors, the person's own groups and roles (null: more than their token held), and now. @typedef {Policy & { anchors: Parts[], mine: string[] | null, at: Date }} Controls */

/** Policy's `colleagues`, read; throws, saying why. @param {Record<string, any>} policy @returns {Policy} */
export function checked({ colleagues, signIn, seal, trust }) {
  if (!colleagues || typeof colleagues !== 'object' || Array.isArray(colleagues)) throw new Error('policy.json’s colleagues is an object: { "certify"?, "apart"?, "inside"?, "guests"? }')
  const { certify, apart = [], inside, guests } = colleagues
  if (!signIn) throw new Error('policy.json’s colleagues needs signIn, the organisation’s sign-in, whose relay lists its people')
  if (![undefined, true, false].includes(certify) || ![undefined, true, false].includes(inside)) throw new Error('policy.json’s colleagues.certify and colleagues.inside are true or false')
  if (!Array.isArray(apart) || !apart.every((set) => Array.isArray(set) && set.length > 1 && set.every((one) => typeof one === 'string' && one))) {
    throw new Error('policy.json’s colleagues.apart is a list of sets of two groups or more, each as the sign-in names it: [["<group>", "<group>"]]')
  }
  if (guests !== undefined && guests !== 'refuse') throw new Error('policy.json’s colleagues.guests is "refuse", or left out')
  if (certify) {
    if (typeof seal?.est !== 'string' || seal.csc !== undefined) throw new Error('policy.json’s colleagues.certify needs seal.est, the organisation’s EST service, which certifies each profile’s key')
    sealOf({ seal, signIn })
    if (!seal.auth) throw new Error('policy.json’s colleagues.certify needs seal.auth, how the EST service knows who asks, so that it certifies each key for its own account alone')
    if (trust === undefined) throw new Error('policy.json’s colleagues.certify needs trust, the authorities whose certificates colleagues’ keys must carry')
    anchorsOf(trust)
  }
  return { certify: certify === true, apart, inside: inside === true, ...(guests && { guests }) }
}

/** The rfc822Names a certificate gives (RFC 5280, 4.2.1.6), in lower case. @param {Parts} cert */
const emailsOf = (cert) => ((names) => (names ? children(names).filter((node) => node.tag === 0x81).map((node) => new TextDecoder().decode(valueOf(node)).toLowerCase()) : []))(cert.extensions.get('2.5.29.17'))
/** A P-256 key's point, as a certificate holds it. @param {JsonWebKey} key */
const pointOf = ({ x = '', y = '' }) => Uint8Array.from([4, ...[x, y].flatMap((half) => [...unbase64(half.replace(/-/g, '+').replace(/_/g, '/'))])])

/**
 * Whether the organisation's authority vouches for a colleague's device now: the first of its chain certifies its profile key for the
 * account the list gives, and leads, each valid now, to one of the anchors. @param {Someone['devices'][number]} device
 * @param {string | undefined} account @param {Parts[]} anchors @param {Date} at
 */
export async function certified({ key, chain }, account, anchors, at) {
  try {
    const [leaf, ...given] = (chain ?? []).map((one) => parts(unbase64(one)))
    return Boolean(leaf && account && emailsOf(leaf).includes(account.toLowerCase()) && same(leaf.keyBits, pointOf(key)) && await vouching(leaf, given, anchors, at))
  } catch {
    return false
  }
}

/**
 * Whether two people are kept apart: each in another group of one set; someone whose groups aren't known from everyone.
 * @param {string[][]} apart @param {string[] | null} mine @param {string[] | null} theirs
 */
export const apartFrom = (apart, mine, theirs) => apart.length > 0 && (!mine || !theirs || apart.some((set) => set.some((one) => mine.includes(one) && set.some((other) => other !== one && theirs.includes(other)))))

/**
 * What policy's `colleagues` says to a `person.check`: a meeting refused where people come from the list alone; someone refused, saying
 * why for IT, or let through with those of their devices the authority certified. @param {Controls} controls @param {{ action: string, person?: Someone }} e
 * @returns {Promise<{ refuse: string } | { person?: Someone }>}
 */
export async function judged({ certify, apart, inside, guests, anchors, mine, at }, { action, person }) {
  const alone = inside || certify || apart.length > 0
  if (action === 'meet') return alone ? { refuse: 'The organisation adds people from its list alone.' } : {}
  if (!person) return {}
  if (alone && person.met !== 'organisation') return { refuse: 'Not on the organisation’s list.' }
  if (guests === 'refuse' && person.guest) return { refuse: 'A guest, whom the organisation keeps out.' }
  if (apartFrom(apart, mine, person.groups === undefined ? [] : person.groups)) return { refuse: 'In a group the organisation keeps apart from the person’s.' }
  if (!certify) return { person }
  const devices = (await Promise.all(person.devices.map(async (one) => ((await certified(one, person.account, anchors, at)) ? [one] : [])))).flat()
  return devices.length ? { person: { ...person, devices } } : { refuse: 'No device of theirs that the organisation’s authority certified.' }
}
