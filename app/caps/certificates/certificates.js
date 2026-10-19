// Checking certificates (D274): a certificate of an answer, or its proof, shared in a conversation
// brings this capability, whose check_certificate reads them with the files to match and shows what
// it found in the answer (`_meta.checked`), as the check page does: Jean's words never decide it.
// A picture or a film that carries Content Credentials brings it too, and is read the same way, its
// invisible watermark looked for when the user asks (D324); a file Jean made by what it says of itself
// (D410); and words, for the watermark of the brain on this device, counted with its tokenizer alone in a
// worker of its own (D402). Where the organisation names authorities it trusts, whether one vouches for the seal (D434), and whether it is qualified (D437).
// A certificate saved undated, its card offers to have dated by the witnesses, and saves it again (D276).
import { Element, define } from '../../ui/base.js'
import { register } from '../../ui/caps.js'
import { app, currentFiles, weightsHost } from '../../ui/state.js'
import { save } from '../../ui/save.js'
import { modelWorker } from '../../ui/model.js'
import { BRAIN, REVISION, said } from '../brain-local/watermark.js'
import { join } from '../../core/fs.js'
import { serviceURL } from '../../core/settings.js'
import { t, useStrings, locale } from '../../core/i18n.js'
import { styleSheet } from '../../ui/sheet.js'
import { html } from 'lit-html'
import { signal } from '@preact/signals-core'
import { keyOf, check } from '../receipt/certificate.js'
import { vouchers, hostIn, dated } from '../receipt/receipt.js'
import { checkGiven, card, credentialsGiven, credentialsCard, watermarksOf, wordsCard } from './card.js'

/** @import { Checked, Credentials } from './card.js' */

await Promise.all([useStrings('certificates'), styleSheet(new URL('../receipt/receipt.css', import.meta.url))])

/** What the brain is told: what the card shows, in words. @param {Checked} checked */
function told(checked) {
  const said = checked.says?.credentialSubject ?? {}
  const sealer = checked.own ? 'this device' : checked.selfIssued ? `a device's own key (fingerprint ${checked.fingerprint})` : `a key certified by ${checked.issuer['2.5.4.3'] ?? 'an authority'}`
  const who = (/** @type {{ provider: string, model: string, host?: string }[]} */ all = []) => all.map(({ provider, model, host }) => `${provider} ${model}${host ? ` at ${host}` : ''}`).join(', ') || 'none'
  return [
    (checked.intact ? `Intact: sealed by ${sealer} on ${checked.at}.` : `Not intact: changed since it was sealed, or not sealed by the key it names (${sealer}).`) + (checked.trust ? ` ${{ trusted: `Certified by ${checked.trust.name}, an authority the organization trusts, and shown unrevoked when it was sealed.${checked.trust.qualified ? ' Its certificate says it is a qualified seal under EU law.' : ''}`, unchecked: `Certified by ${checked.trust.name}, an authority the organization trusts, but not shown unrevoked when it was sealed.`, untrusted: 'Not certified by an authority the organization trusts.', revoked: `Its certificate, under ${checked.trust.name}, was revoked before it was sealed.` }[checked.trust.status]}` : ''),
    `It says the answer was done: ${said.where}; answered by ${who(said.brains)}; made by ${who(said.made)}.`,
    ...checked.timestamps.map(({ at, authority, intact }) => (intact ? `Dated ${at} by ${authority['2.5.4.3'] ?? 'a witness'}.` : 'One of its dates doesn\'t hold.')),
    ...(checked.log ? [checked.log.intact ? `Recorded in a public log, entry ${checked.log.index}, on ${checked.log.at.toISOString?.() ?? checked.log.at}${checked.log.checked ? '' : ' (its promise not checked)'}.` : 'Not in the public log it names.'] : []),
    ...(checked.proven === undefined ? [] : [checked.proven ? `Its proof shows the request: "${checked.words?.request}", and the answer: "${checked.words?.answer}".` : 'The proof is not this certificate\'s.']),
    ...checked.files.map(({ name, named }) => `${name} is ${named ? '' : 'not '}a file it names.`),
  ].join('\n')
}

/** What the brain is told of a picture's or a film's Content Credentials (D324). @param {Credentials} one */
const toldOf = (one) => [one.absent ? `${one.name}: no Content Credentials` : one.unsigned ? `${one.name}: no Content Credentials, but its file says, unsigned, ${one.generated ? 'that AI made it' : 'how it was made, not that AI made it'}${one.maker ? `, with ${one.maker}` : ''}` : `${one.name}: its Content Credentials ${one.intact ? 'hold' : 'don\'t hold: it changed since they were signed, or they weren\'t signed by the key they name'}; signed by ${one.own ? 'this device' : one.selfIssued ? 'a device\'s own key' : `${one.subject['2.5.4.10'] ?? one.subject['2.5.4.3']}, certified by ${one.issuer['2.5.4.3'] ?? 'an authority'}`}${one.at ? `, dated ${one.at}` : ''}; they ${one.generated ? `say AI made it${one.maker ? ` (${one.maker})` : ''}` : 'don\'t say AI made it'}${one.generator ? `, with ${one.generator}` : ''}`,
  ...(one.found ? [`its invisible watermark: ${{ match: 'TrustMark\'s, the one its credentials name', other: 'TrustMark\'s, not the one its credentials name', found: 'TrustMark\'s', none: 'none found' }[one.found]}`] : [])].join('; ') + '.'

const counter = modelWorker(new URL('../brain-local/brain-worker.js', import.meta.url), 'The words could not be counted')
/** What the brain is told of words counted (D402). @param {{ counted: number, z: number }} words */
const toldWords = (words) => `The words: ${{ marked: 'they carry the watermark of the brain on a device (Gemma 4 E2B): it wrote them, or someone made them look so', short: 'too few to tell', none: 'no watermark of the brain on a device found, which doesn\'t prove it didn\'t write them: a short or predictable answer carries little of it, and rewritten words lose it' }[said(words)]} (${words.counted} tokens counted, ${words.z.toFixed(1)} standard deviations above chance).`

/** The public log's key, from the address settings or policy name (D276), to check that it vouches for an entry. */
const logKey = async () => keyOf(await (await fetch(`${serviceURL('transparencyLog', app.settings.value, app.policy)}/api/v1/log/publicKey`)).text())

/** @type {import('../../core/loop.js').Tool} */
const checkTool = {
  spec: {
    name: 'check_certificate',
    description: 'Check a certificate of an answer, or its proof, that the user shared: whether its seal holds, who sealed it and when, what it says, and with its proof the words and which of the other files given it names. Also reads a picture\'s or film\'s Content Credentials: whether they hold, who signed them, and whether they say AI made it; what a document, drawing, page or picture says of itself, as those made with Jean do; and whether words carry the watermark of the brain on a device. The user sees the result in your answer.',
    parameters: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' }, description: 'Names of shared files: the certificate, its proof, files to match, pictures, films and documents' },
      watermark: { type: 'boolean', description: 'Also look for an invisible watermark in the pictures, as when asked; the first time downloads 47 MB' },
      words: { type: 'string', description: 'Words, as the user gave them, to look for the watermark of the brain on a device in; the first time downloads 20 MB' } } },
  },
  kind: 'read',
  title: (args) => t('certificates.checking', { name: [args?.files ?? []].flat().join(', ') || String(args?.words ?? '').slice(0, 40) }),
  run: async (args, ctx) => {
    const shared = currentFiles(ctx.signal)
    const given = await Promise.all([args?.files ?? []].flat().map(async (/** @type {string} */ name) => {
      const link = shared.findLast((one) => one.name.toLowerCase() === String(name).trim().toLowerCase())
      if (!link) throw new Error(`No file named "${name}". Files: ${shared.map((one) => one.name).join(', ') || 'none'}.`)
      return { name: link.name, bytes: (await app.fs.readBytes(join(app.projectDir, link.uri))) ?? new Uint8Array() }
    }))
    const [checked, credentials] = await Promise.all([checkGiven(given, { logKey: await logKey().catch(() => null), trust: await (await import('../enterprise/enterprise.js')).trust(app.policy) }), credentialsGiven(given)])
    // Each picture's watermark, when asked (D324): TrustMark's 61 bits, set beside those its credentials name.
    if (args?.watermark) await watermarksOf(given, credentials, async (bytes) => (await import('../pictures/device.js')).watermarkOf(bytes))
    const lean = args?.words ? await counter.call({ type: 'lean', host: weightsHost(), model: BRAIN, revision: REVISION, text: String(args.words) }).then(({ counted, z }) => ({ counted, z })) : null
    if (!checked && !credentials.length && !lean) return 'None of these files is a certificate of an answer, its proof, or a file that says how it was made.'
    // Both in `_meta.checked`, which places the card in the answer: the certificate's reading, and the credentials.
    const fingerprint = await (await import('../receipt/receipt.js')).fingerprint()
    const read = credentials.map((one) => ({ ...one, own: one.selfIssued && one.subject['2.5.4.3'] === fingerprint }))
    ctx.meta.checked = { ...(checked && { ...checked, own: checked.fingerprint === fingerprint }), credentials: read, ...(lean && { lean }) }
    return [checked && told(ctx.meta.checked), ...read.map(toldOf), lean && toldWords(lean)].filter(Boolean).join('\n')
  },
}

/** In an answer: what check_certificate found; a certificate saved undated, with the witnesses who may date it (D276). */
class Certificate extends Element {
  /** Its dates once the witnesses gave them, and whether they are being asked. */
  #dated = signal(/** @type {Checked['timestamps'] | null} */ (null))
  #dating = signal(false)

  render() {
    const kept = /** @type {{ call?: { _meta?: { checked?: Partial<Checked> & { credentials?: Credentials[], lean?: { counted: number, z: number } } } } }} */ (/** @type {unknown} */ (this)).call?._meta?.checked
    const checked = kept?.fingerprint && /** @type {Checked} */ ({ ...kept, ...(this.#dated.value && { timestamps: this.#dated.value }) })
    const hosts = vouchers.value.timestamps.map(hostIn)
    return html`${checked || !(kept?.credentials?.length || kept?.lean) ? card(checked || null) : ''}${checked && checked.file && checked.intact && !checked.timestamps.length && hosts.length
      ? html`<button class="button" ?disabled=${this.#dating.value} @click=${() => this.#date(checked)}>${t('certificates.date', { hosts: new Intl.ListFormat(locale.value).format(hosts) })}</button>` : ''}${(kept?.credentials ?? []).map(credentialsCard)}${kept?.lean ? wordsCard(kept.lean) : ''}`
  }

  /** Has the witnesses date the certificate as it is in the conversation's files, then saves it again under its name, and shows its dates. @param {Checked} checked */
  async #date({ file = '' }) {
    this.#dating.value = true
    const link = currentFiles().findLast((one) => one.name === file)
    const bytes = link && await app.fs.readBytes(join(app.projectDir, link.uri))
    const made = bytes && await dated(JSON.parse(new TextDecoder().decode(bytes))).catch((error) => console.warn('Certificate', error))
    const { timestamps = [] } = made ? await check({ certificate: made }) : {}
    if (made && timestamps.length) save(new Blob([JSON.stringify(made, null, 2)], { type: 'application/jose+json' }), file)
    ;[this.#dated.value, this.#dating.value] = [timestamps.length ? timestamps : null, false]
  }
}

define('app-certificate', Certificate)
register({
  id: 'certificates',
  tools: [checkTool],
  lines: [{ name: 'check_certificate', line: 'check a certificate of an answer, its proof, or a picture\'s or film\'s Content Credentials, the user shared, or whether words carry the watermark of the brain on a device' }],
})
