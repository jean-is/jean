// SPDX-FileCopyrightText: 2026 WAREHOUSE SAS
// SPDX-License-Identifier: Elastic-2.0

// The organisation's seal (D434): with policy's `seal`, its EST service certifies the key this device seals with
// (est.js), at a start when no certificate from it is kept for that key, or the one kept ends within a month. The
// certificate and its chain are kept in .secrets/, which no backup, export, sync or share holds, since they name a
// key that never leaves this device. Each seal (the `seal` event) then goes with them, in a certificate's x5c and in
// a picture's Content Credentials; and a certificate, once its witnesses dated it, gets what keeps it checkable once
// the authority's answers are gone (lasting.js). Where the service can't be reached, the device's own certificate
// seals, and a toast says so, once. Settings › Your data names the authority, and until when.
import { html, nothing } from 'lit-html'
import { register } from '../ui/caps.js'
import { app, notify } from '../ui/state.js'
import { getSecret, setSecret } from '../ui/secrets.js'
import { t, useStrings, locale } from '../core/i18n.js'
import { thumbprint } from '../caps/receipt/certificate.js'
import { enroll } from './est.js'
import { revocation, lasting } from './lasting.js'
import { parts, base64, unbase64, nameOf } from './pkix.js'

/** @import { Seal } from '../caps/receipt/certificate.js' */
/** @typedef {{ est: string, auth?: 'oidc' | 'tls' }} Policy  policy's `seal` */

const KEPT = 'seal-authority'
/** Asked for again this long before it ends. */
const AHEAD = 30 * 86_400_000

/** The certificate and its chain kept, leaf first, once read or given for this key. @type {Uint8Array[] | null} */
let chain = null
/** A certification under way. @type {Promise<Uint8Array[]> | null} */
let asking = null
let told = false

/** @param {Policy} seal */
export async function start(seal) {
  await useStrings('enterprise')
  const receipt = () => import('../caps/receipt/receipt.js')
  /** From the browser, else through the gateway, as witnesses are reached. @param {string} address @param {RequestInit} init */
  const send = async (address, init) => (await receipt()).reach(address, init)
  /** What the service is asked with: the organisation's sign-in, or what the browser holds for it (a TLS client certificate). */
  const asked = async () => (seal.auth === 'oidc' ? { headers: { authorization: `Bearer ${await (await import('../caps/signin/signin.js')).token()}` } } : seal.auth === 'tls' ? { credentials: /** @type {const} */ ('include') } : {})

  /** The chain kept for this key from this service, unless it ends soon; else a new one, or the kept one while it lasts. @param {CryptoKeyPair} keys */
  async function certified(keys) {
    const print = await thumbprint(keys.publicKey)
    const kept = JSON.parse((await getSecret(app.fs, KEPT)) ?? 'null')
    chain = kept?.est === seal.est && kept.thumbprint === print ? kept.chain.map(unbase64) : null
    const until = chain ? parts(chain[0]).until.getTime() : 0
    if (chain && until - Date.now() > AHEAD) return chain
    try {
      const { headers = {}, ...rest } = await asked()
      const fresh = await enroll({ est: seal.est, keys, thumbprint: print, headers, send: (address, init) => send(address, { ...init, ...rest }) })
      await setSecret(app.fs, KEPT, JSON.stringify({ est: seal.est, thumbprint: print, chain: fresh.map(base64) }))
      return (chain = fresh)
    } catch (error) {
      if (chain && until > Date.now()) return (console.warn('Seal', error), chain)
      throw error
    }
  }
  /** @param {CryptoKeyPair} keys */
  const certify = (keys) => (asking ??= certified(keys).finally(() => { asking = null }))

  register({
    id: 'authority',
    hooks: [{ on: 'seal', tier: 'policy', run: async (/** @type {{ kind: 'certificate' | 'picture', seal: Seal }} */ e, next) => {
      const given = await certify(e.seal.keys).catch((error) => {
        console.warn('Seal', error)
        if (!told) notify(t('authority.failed'))
        told = true
        return null
      })
      if (!given) return next(e)
      const [certificate, ...above] = given
      const made = await next({ ...e, seal: { ...e.seal, certificate, chain: above.filter((one) => !parts(one).selfIssued) } })
      return e.kind === 'certificate' ? lasting(made, given, await revocation(given, send)) : made
    } }],
    slots: { data: { at: 3, draw: () => {
      if (!chain) return nothing
      const { issuer, until } = parts(chain[0])
      return html`<section><h3>${t('authority.title')}</h3><p class="muted">${t('authority.text', { authority: nameOf(issuer), date: new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(until) })}</p></section>`
    } } },
  })
  // At once, so that Settings names it and the first picture is certified too.
  receipt().then(({ sealOf }) => sealOf()).then((own) => certify(own.keys)).catch((error) => console.warn('Seal', error))
}
