// What a certificate of an answer shows once checked (D274), on the check page (check.html) and in
// an answer when Jean is asked: whether its seal holds, which key sealed it and when, what it says,
// and, with its proof, the words and which of the files given it names. A picture's or a film's
// Content Credentials too (D324): whether they hold, who signed them and when, and whether they
// say AI made it. Drawn with About this answer's card's look (caps/receipt/receipt.css).
import { html, nothing } from 'lit-html'
import { t, locale } from '../../core/i18n.js'
import { icons } from '../../ui/icons.js'
import { check } from '../receipt/certificate.js'
import { credentialsOf } from '../receipt/c2pa.js'

/**
 * A certificate as checked, kept as the call's `_meta.checked`: when it was sealed as text, and each
 * other file given by name, with whether the certificate names it.
 * @typedef {Omit<Reading, 'at'> & { at: string | Date, files: { name: string, named: boolean }[], own?: boolean }} Checked
 */

/**
 * A picture's or a film's Content Credentials as checked, kept as the call's `_meta.credentials`: its
 * name, and whether the device that checks them is the one that signed them.
 * @typedef {NonNullable<Awaited<ReturnType<typeof credentialsOf>>> & { name: string, at: string | Date | null, own?: boolean }} Credentials
 */

/** @import { Reading } from '../receipt/certificate.js' */

/** @param {Uint8Array} bytes */
const sri = async (bytes) => `sha256-${btoa(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes))), (byte) => String.fromCharCode(byte)).join(''))}`

/**
 * Checks what was given: a certificate (JSON), its proof (SD-JWT), and any other file, which only a
 * proof can say it names, its digests being salted; its log's promise checked with the log's key when
 * that is known. Null when none is a certificate or a proof.
 * @param {{ name: string, bytes: Uint8Array }[]} given @param {{ logKey?: CryptoKey | null }} [known] @returns {Promise<Checked | null>}
 */
export async function checkGiven(given, known) {
  /** @type {{ certificate?: any, proof?: string }} */
  const found = {}
  const others = []
  for (const { name, bytes } of given) {
    const text = new TextDecoder().decode(bytes).trim()
    if (/^[\w-]+\.[\w-]+\.[\w-]+~/.test(text)) found.proof = text
    else if (text.startsWith('{') && text.includes('"protected"')) found.certificate = JSON.parse(text)
    else others.push({ name, sri: await sri(bytes) })
  }
  if (!found.certificate && !found.proof) return null
  try {
    const checked = await check(found, known)
    const named = new Set([...(checked.words?.files ?? []), ...(checked.words?.made ?? [])])
    return { ...checked, at: checked.at.toISOString(), files: others.map(({ name, sri }) => ({ name, named: named.has(sri) })) }
  } catch {
    return null
  }
}

/** The Content Credentials of each picture or film given that has them (D324). @param {{ name: string, bytes: Uint8Array }[]} given @returns {Promise<Credentials[]>} */
export async function credentialsGiven(given) {
  const read = await Promise.all(given.map(async ({ name, bytes }) => {
    const found = await credentialsOf(bytes)
    return found ? [{ ...found, name, at: found.at?.toISOString() ?? null }] : []
  }))
  return read.flat()
}

/** Who answered or made, as the certificate names them. @param {{ provider: string, model: string, host?: string, jurisdiction?: string }[]} [all] */
const names = (all = []) => all.map(({ provider, model, host, jurisdiction }) => html`<dd class="receipt-brain"><bdi>${provider === 'device' ? model : `${provider} · ${model}`}</bdi>
  ${host ? html`<bdi class="receipt-host" dir="ltr">${host}${jurisdiction ? ` · ${jurisdiction}` : ''}</bdi>` : nothing}</dd>`)

/** A time, in the reader's words. @param {string | Date} at */
const when = (at) => new Intl.DateTimeFormat(locale.value, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(at))

/** Who signed: this device, a device's own key, or a key an authority certified; then the name it gives. @param {{ own?: boolean, selfIssued: boolean, subject: Record<string, string>, issuer: Record<string, string> }} signed */
const signer = ({ own, selfIssued, issuer }) => (own ? t('certificates.yours') : selfIssued ? t('certificates.self') : t('certificates.authority', { name: issuer['2.5.4.3'] ?? '' }))
/** A key's fingerprint, in fours. @param {string} fingerprint */
const grouped = (fingerprint) => html`<code class="receipt-host" dir="ltr">${fingerprint.match(/.{1,4}/g)?.join(' ')}</code>`

/** A picture's or a film's Content Credentials, checked (D324). @param {Credentials} one */
export function credentialsCard(one) {
  return html`<div class="receipt receipt-checked">
    <div class="receipt-head ${one.intact ? 'is-local' : ''}">
      <span class="receipt-mark">${one.intact ? icons.shield : icons.close}</span>
      <div><p class="receipt-verdict">${t(one.intact ? 'certificates.credentials' : 'certificates.credentialsBroken', { name: one.name })}</p>
        <p class="receipt-note">${t(one.generated ? 'certificates.ai' : 'certificates.notAi')}${one.bound === undefined && one.intact ? html`<br>${t('certificates.unbound')}` : nothing}</p></div>
    </div>
    <dl>
      <div class="receipt-list"><dt>${t('certificates.by')}</dt><dd>${signer(one)} ${one.selfIssued ? grouped(one.subject['2.5.4.3'] ?? '') : html`<bdi class="receipt-host">${one.subject['2.5.4.10'] ?? one.subject['2.5.4.3'] ?? ''}</bdi>`}</dd></div>
      ${one.maker || one.generator ? html`<div class="receipt-list"><dt>${t('certificates.made')}</dt><dd class="receipt-brain"><bdi>${one.maker || one.generator}</bdi>${one.maker && one.generator ? html`<bdi class="receipt-host">${one.generator}</bdi>` : nothing}</dd></div>` : nothing}
      ${one.at ? html`<div class="receipt-list"><dt>${t('certificates.dated', { name: [one.witness?.['2.5.4.3'], one.witness?.['2.5.4.6']].filter(Boolean).join(' · ') })}</dt><dd>${when(one.at)}</dd></div>` : nothing}
    </dl>
  </div>`
}

/** A certificate, checked; or that what was given isn't one. @param {Checked | null} [checked] */
export function card(checked) {
  if (!checked) return html`<div class="receipt receipt-checked"><p class="receipt-verdict">${t('certificates.unreadable')}</p></div>`
  const said = checked.says?.credentialSubject ?? {}
  const where = ['device', 'cloud', 'outside'].includes(said.where) ? said.where : 'unknown'
  const reached = [...new Set((checked.says?.evidence ?? []).flatMap((/** @type {any} */ record) => Object.keys(record.hosts ?? {})))]
  const by = signer(checked)
  return html`<div class="receipt receipt-checked">
    <div class="receipt-head ${checked.intact ? 'is-local' : ''}">
      <span class="receipt-mark">${checked.intact ? icons.shield : icons.close}</span>
      <div><p class="receipt-verdict">${t(checked.intact ? 'certificates.intact' : 'certificates.broken')}</p>
        <p class="receipt-note">${t(`certificates.where.${where}`)}</p></div>
    </div>
    <dl>
      <div class="receipt-list"><dt>${t('certificates.by')}</dt><dd>${by} ${grouped(checked.fingerprint)}</dd></div>
      <div class="receipt-list"><dt>${t('certificates.at')}</dt><dd>${when(checked.at)}</dd></div>
      ${checked.timestamps.map(({ at, authority, intact }) => html`<div class="receipt-list"><dt>${intact ? t('certificates.dated', { name: [authority['2.5.4.3'], authority['2.5.4.6']].filter(Boolean).join(' · ') }) : t('certificates.badDate')}</dt><dd>${at ? when(at) : nothing}</dd></div>`)}
      ${checked.log ? html`<div class="receipt-list"><dt>${t(checked.log.intact ? 'certificates.logged' : 'certificates.notLogged', { index: checked.log.index })}</dt><dd>${when(checked.log.at)}</dd></div>` : nothing}
      ${said.brains?.length ? html`<div class="receipt-list"><dt>${t('certificates.brains')}</dt>${names(said.brains)}</div>` : nothing}
      ${said.made?.length ? html`<div class="receipt-list"><dt>${t('certificates.made')}</dt>${names(said.made)}</div>` : nothing}
      ${reached.length ? html`<div class="receipt-list"><dt>${t('certificates.reached')}</dt><dd class="receipt-hosts">${reached.map((host) => html`<bdi dir="ltr">${host}</bdi>`)}</dd></div>` : nothing}
      ${checked.proven === undefined ? nothing : html`<div class="receipt-list"><dt>${t(checked.proven ? 'certificates.proven' : 'certificates.unproven')}</dt>
        ${checked.proven ? [['certificates.request', checked.words?.request], ['certificates.answer', checked.words?.answer]].map(([key, words]) => html`<dd><span class="receipt-host">${t(String(key))}</span> <q dir="auto">${words}</q></dd>`) : nothing}</div>`}
      ${checked.files.map(({ name, named }) => html`<div class="receipt-list"><dd>${t(named ? 'certificates.file' : 'certificates.notFile', { name })}</dd></div>`)}
    </dl>
  </div>`
}
