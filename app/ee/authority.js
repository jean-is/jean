// SPDX-FileCopyrightText: 2026 WAREHOUSE SAS
// SPDX-License-Identifier: Elastic-2.0

// The organisation's seal (D434): with policy's `seal`, its EST service certifies the key this device seals with
// (est.js), at a start when no certificate from it is kept for that key, or the one kept ends within a month. The
// certificate and its chain are kept in .secrets/, which no backup, export, sync or share holds, since they name a
// key that never leaves this device. Or, with `seal.csc`, a qualified provider seals for the organisation (D436), by
// a credential whose chain is read at each start (csc.js), its key held there. Each seal (the `seal` event) then goes
// with them, in a certificate's x5c and in a picture's Content Credentials; and a certificate, once its witnesses
// dated it, gets what keeps it and their dates checkable once the authorities' answers are gone (lasting.js).
// Where the service can't be reached, the device's own certificate seals, and a toast says so, once. Settings › Your
// data names the authority, and until when.
import { html, nothing } from 'lit-html'
import { register } from '../ui/caps.js'
import { app, notify } from '../ui/state.js'
import { getSecret, setSecret } from '../ui/secrets.js'
import { t, useStrings, locale } from '../core/i18n.js'
import { thumbprint } from '../caps/receipt/certificate.js'
import { enroll } from './est.js'
import { credentialAt } from './csc.js'
import { revocation, lasting, witnessesOf } from './lasting.js'
import { parts, base64, unbase64, nameOf } from './pkix.js'

/** @import { Seal } from '../caps/receipt/certificate.js' */
/** @typedef {{ est?: string, csc?: string, credential?: string, auth?: 'oidc' | 'tls' }} Policy  policy's `seal` */
/** What seals: the chain, leaf first, and with a key elsewhere, that key and what signs with it. @typedef {{ chain: Uint8Array[], key?: CryptoKey, sign?: Seal['sign'] }} Sealer */

const KEPT = 'seal-authority'
/** Asked for again this long before it ends. */
const AHEAD = 30 * 86_400_000

/** The certificate and its chain kept, leaf first, once read or given for this key. @type {Uint8Array[] | null} */
let chain = null
/** A certification under way. @type {Promise<Uint8Array[]> | null} */
let asking = null
/** The provider's credential, once read. @type {Promise<Sealer> | null} */
let remote = null
let told = false

/** @param {Policy} seal */
export async function start(seal) {
  await useStrings('enterprise')
  const receipt = () => import('../caps/receipt/receipt.js')
  /** From the browser, else through the gateway, as witnesses are reached. @param {string} address @param {RequestInit} init */
  const send = async (address, init) => (await receipt()).reach(address, init)
  /** To the service: with the organisation's sign-in's token, fresh each time, or what the browser holds for it (a TLS client certificate). @param {string} address @param {RequestInit} init */
  const asked = async (address, init) => {
    const headers = new Headers(init.headers)
    if (seal.auth === 'oidc') headers.set('authorization', `Bearer ${await (await import('../caps/signin/signin.js')).token()}`)
    return send(address, { ...init, headers, ...(seal.auth === 'tls' && { credentials: /** @type {const} */ ('include') }) })
  }

  /** The chain kept for this key from this service, unless it ends soon; else a new one, or the kept one while it lasts. @param {CryptoKeyPair} keys */
  async function certified(keys) {
    const print = await thumbprint(keys.publicKey)
    const kept = JSON.parse((await getSecret(app.fs, KEPT)) ?? 'null')
    chain = kept?.est === seal.est && kept.thumbprint === print ? kept.chain.map(unbase64) : null
    const until = chain ? parts(chain[0]).until.getTime() : 0
    if (chain && until - Date.now() > AHEAD) return chain
    try {
      const fresh = await enroll({ est: String(seal.est), keys, thumbprint: print, send: asked })
      await setSecret(app.fs, KEPT, JSON.stringify({ est: seal.est, thumbprint: print, chain: fresh.map(base64) }))
      return (chain = fresh)
    } catch (error) {
      if (chain && until > Date.now()) return (console.warn('Seal', error), chain)
      throw error
    }
  }
  /** What seals: the provider's credential, read once and again after it couldn't be; else the authority's certificate for the device's key. @param {CryptoKeyPair} keys @returns {Promise<Sealer>} */
  const sealer = (keys) => (seal.csc
    ? (remote ??= credentialAt({ csc: seal.csc, credential: String(seal.credential), send: asked }).then((one) => ((chain = one.chain), one), (error) => { remote = null; throw error }))
    : (asking ??= certified(keys).finally(() => { asking = null })).then((one) => ({ chain: one })))
  /** Sealed by the device's own certificate, said once. @param {unknown} error */
  const unsealed = (error) => {
    console.warn('Seal', error)
    if (!told) notify(t('authority.failed'))
    told = true
    return null
  }

  register({
    id: 'authority',
    hooks: [{ on: 'seal', tier: 'policy', run: async (/** @type {{ kind: 'certificate' | 'picture', seal: Seal }} */ e, next) => {
      const by = await sealer(e.seal.keys).catch(unsealed)
      const [certificate, ...above] = by?.chain ?? []
      // A key elsewhere seals through its provider, which alone holds its private half.
      const made = by && await next({ ...e, seal: { keys: by.key ? /** @type {CryptoKeyPair} */ ({ publicKey: by.key }) : e.seal.keys, sign: by.sign, certificate, chain: above.filter((one) => !parts(one).selfIssued) } }).catch(unsealed)
      if (!by || !made) return next(e)
      // What checks the seal's chain later, and its witnesses' (JAdES B-LT).
      return e.kind === 'certificate' ? lasting(made, by.chain, await revocation([by.chain, ...await witnessesOf(made)], send)) : made
    } }],
    slots: { data: { at: 3, draw: () => {
      if (!chain) return nothing
      const { issuer, until } = parts(chain[0])
      return html`<section><h3>${t('authority.title')}</h3><p class="muted">${t(seal.csc ? 'authority.qualified' : 'authority.text', { authority: nameOf(issuer), date: new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(until) })}</p></section>`
    } } },
  })
  // At once, so that Settings names it and the first picture is certified too.
  receipt().then(({ sealOf }) => sealOf()).then((own) => sealer(own.keys)).catch((error) => console.warn('Seal', error))
}
