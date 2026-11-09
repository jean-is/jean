// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Colleagues' controls (D732): with policy's `colleagues`, each `person.check` People makes (caps/people) passes through what it asks
// (vouch.js): before a meeting, before someone is found, kept, sent to or heard, and before this device is listed on the organisation's
// relay (D731). With `certify`, the organisation's EST service (est.js, policy's `seal`) certifies the profile's key for the account the
// sign-in names, as the device is listed, when no certificate for that key and account is kept or the one kept ends within a month: kept
// in .secrets/, which no backup, export, sync or share holds, and sent with each listing, for colleagues to check against policy's
// `trust`. Where the service can't be reached, the one kept goes while it lasts, else the device is listed without one, which colleagues
// refuse until a later listing has it. A control that fails refuses.
import { register } from '../ui/caps.js'
import { app } from '../ui/state.js'
import { getSecret, setSecret } from '../ui/secrets.js'
import { thumbprint } from '../caps/receipt/certificate.js'
import { enroll } from './est.js'
import { reaching } from './authority.js'
import { parts, base64, unbase64 } from './pkix.js'
import { anchorsOf } from './trust.js'
import { checked, judged } from './vouch.js'

const KEPT = 'colleague-certificate'
/** Asked for again this long before it ends. */
const AHEAD = 30 * 86_400_000

/** The account an ID token names as the relay lists it (relay/colleagues.js): its email, else its username. @param {string} token @returns {string} */
const accountOf = (token) => ((claims) => [claims.email, claims.preferred_username].find((one) => typeof one === 'string' && one.length))(JSON.parse(new TextDecoder().decode(unbase64(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))))

/** @param {Record<string, any>} policy */
export async function start(policy) {
  const section = checked(policy)
  const anchors = section.certify ? anchorsOf(policy.trust) : []
  const send = reaching(policy.seal ?? {})

  /** The chain of the profile key's certificate for this account, leaf first, in base64: kept, unless it ends soon; else asked for. @param {CryptoKeyPair} keys @param {string} account @returns {Promise<string[]>} */
  async function chainFor(keys, account) {
    if (!account) throw new Error('The sign-in’s ID token names no account to certify the profile’s key for')
    const [print, est] = [await thumbprint(keys.publicKey), String(policy.seal.est)], kept = JSON.parse((await getSecret(app.fs, KEPT)) ?? 'null')
    const until = kept?.est === est && kept.thumbprint === print && kept.account === account ? parts(unbase64(kept.chain[0])).until.getTime() : 0
    if (until - Date.now() > AHEAD) return kept.chain
    try {
      const chain = (await enroll({ est, keys, thumbprint: print, email: account, send })).map(base64)
      await setSecret(app.fs, KEPT, JSON.stringify({ est, thumbprint: print, account, chain }))
      return chain
    } catch (error) {
      if (until > Date.now()) return (console.warn('Colleagues', error), kept.chain)
      throw error
    }
  }

  register({
    id: 'colleagues',
    hooks: [{ on: 'person.check', tier: 'policy', refuse: 'The organisation’s controls couldn’t be read.', run: async (/** @type {any} */ e, next) => {
      if (e.action === 'list') return next(section.certify ? { ...e, chain: await chainFor(e.keys, accountOf(e.proof)).catch((error) => void console.warn('Colleagues', error)) } : e)
      // The sign-in's groups and roles: none kept is none; null, more than its token held.
      const { groups: mine = [] } = JSON.parse((await getSecret(app.fs, 'signin')) ?? '{}')
      const said = await judged({ ...section, anchors, mine, at: new Date() }, e)
      return 'refuse' in said ? said : next(said.person ? { ...e, person: said.person } : e)
    } }],
  })
}
