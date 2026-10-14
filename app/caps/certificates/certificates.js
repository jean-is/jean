// Checking certificates (D274): a certificate of an answer, or its proof, shared in a conversation
// brings this capability, whose check_certificate reads them with the files to match and shows what
// it found in the answer (`_meta.checked`), as the check page does: Jean's words never decide it.
// A picture or a film that carries Content Credentials brings it too, and is read the same way, its
// invisible watermark looked for when the user asks (D324).
import { Element, define } from '../../ui/base.js'
import { register } from '../../ui/caps.js'
import { app, currentFiles } from '../../ui/state.js'
import { join } from '../../core/fs.js'
import { serviceURL } from '../../core/settings.js'
import { t, useStrings } from '../../core/i18n.js'
import { styleSheet } from '../../ui/sheet.js'
import { html } from 'lit-html'
import { checkGiven, card, credentialsGiven, credentialsCard } from './card.js'
import { NONE } from '../receipt/c2pa.js'
import { dataOf } from '../pictures/watermark.js'

/** @import { Checked, Credentials } from './card.js' */

await Promise.all([useStrings('certificates'), styleSheet(new URL('../receipt/receipt.css', import.meta.url))])

/** What the brain is told: what the card shows, in words. @param {Checked} checked */
function told(checked) {
  const said = checked.says?.credentialSubject ?? {}
  const sealer = checked.own ? 'this device' : checked.selfIssued ? `a device's own key (fingerprint ${checked.fingerprint})` : `a key certified by ${checked.issuer['2.5.4.3'] ?? 'an authority'}`
  const who = (/** @type {{ provider: string, model: string, host?: string }[]} */ all = []) => all.map(({ provider, model, host }) => `${provider} ${model}${host ? ` at ${host}` : ''}`).join(', ') || 'none'
  return [
    checked.intact ? `Intact: sealed by ${sealer} on ${checked.at}.` : `Not intact: changed since it was sealed, or not sealed by the key it names (${sealer}).`,
    `It says the answer was done: ${said.where}; answered by ${who(said.brains)}; made by ${who(said.made)}.`,
    ...checked.timestamps.map(({ at, authority, intact }) => (intact ? `Dated ${at} by ${authority['2.5.4.3'] ?? 'a witness'}.` : 'One of its dates doesn\'t hold.')),
    ...(checked.log ? [checked.log.intact ? `Recorded in a public log, entry ${checked.log.index}, on ${checked.log.at.toISOString?.() ?? checked.log.at}${checked.log.checked ? '' : ' (its promise not checked)'}.` : 'Not in the public log it names.'] : []),
    ...(checked.proven === undefined ? [] : [checked.proven ? `Its proof shows the request: "${checked.words?.request}", and the answer: "${checked.words?.answer}".` : 'The proof is not this certificate\'s.']),
    ...checked.files.map(({ name, named }) => `${name} is ${named ? '' : 'not '}a file it names.`),
  ].join('\n')
}

/** What the brain is told of a picture's or a film's Content Credentials (D324). @param {Credentials} one */
const toldOf = (one) => [one.absent ? `${one.name}: no Content Credentials` : `${one.name}: its Content Credentials ${one.intact ? 'hold' : 'don\'t hold: it changed since they were signed, or they weren\'t signed by the key they name'}; signed by ${one.own ? 'this device' : one.selfIssued ? 'a device\'s own key' : `${one.subject['2.5.4.10'] ?? one.subject['2.5.4.3']}, certified by ${one.issuer['2.5.4.3'] ?? 'an authority'}`}${one.at ? `, dated ${one.at}` : ''}; they ${one.generated ? `say AI made it${one.maker ? ` (${one.maker})` : ''}` : 'don\'t say AI made it'}${one.generator ? `, with ${one.generator}` : ''}`,
  ...(one.found ? [`its invisible watermark: ${{ match: 'TrustMark\'s, the one its credentials name', other: 'TrustMark\'s, not the one its credentials name', found: 'TrustMark\'s', none: 'none found' }[one.found]}`] : [])].join('; ') + '.'

/** The public log's key, from the address settings or policy name (D276), to check its promise. */
async function logKey() {
  const pem = await (await fetch(`${serviceURL('transparencyLog', app.settings.value, app.policy)}/api/v1/log/publicKey`)).text()
  return crypto.subtle.importKey('spki', Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (char) => char.charCodeAt(0)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
}

/** @type {import('../../core/loop.js').Tool} */
const checkTool = {
  spec: {
    name: 'check_certificate',
    description: 'Check a certificate of an answer, or its proof, that the user shared: whether its seal holds, who sealed it and when, what it says, and with its proof the words and which of the other files given it names. Also reads a picture\'s or film\'s Content Credentials: whether they hold, who signed them, and whether they say AI made it. The user sees the result in your answer.',
    parameters: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' }, description: 'Names of shared files: the certificate, its proof, files to match, pictures and films' },
      watermark: { type: 'boolean', description: 'Also look for an invisible watermark in the pictures, as when asked; the first time downloads 47 MB' } }, required: ['files'] },
  },
  kind: 'read',
  title: (args) => t('certificates.checking', { name: [args?.files ?? []].flat().join(', ') }),
  run: async (args, ctx) => {
    const shared = currentFiles(ctx.signal)
    const given = await Promise.all([args?.files ?? []].flat().map(async (/** @type {string} */ name) => {
      const link = shared.findLast((one) => one.name.toLowerCase() === String(name).trim().toLowerCase())
      if (!link) throw new Error(`No file named "${name}". Files: ${shared.map((one) => one.name).join(', ') || 'none'}.`)
      return { name: link.name, bytes: (await app.fs.readBytes(join(app.projectDir, link.uri))) ?? new Uint8Array() }
    }))
    const [checked, credentials] = await Promise.all([checkGiven(given, { logKey: await logKey().catch(() => null) }), credentialsGiven(given)])
    // Each picture's watermark, when asked (D324): TrustMark's 61 bits, set beside those its credentials name.
    for (const { name, bytes } of args?.watermark ? given.filter(({ name }) => /\.(png|jpe?g|webp|gif|avif)$/i.test(name)) : []) {
      const data = dataOf(await (await import('../pictures/device.js')).watermarkOf(bytes))
      const one = credentials.find((entry) => entry.name === name) ?? credentials[credentials.push({ ...NONE, name, absent: true }) - 1]
      one.found = !data ? 'none' : !one.watermark ? 'found' : one.watermark === data ? 'match' : 'other'
    }
    if (!checked && !credentials.length) return 'None of these files is a certificate of an answer, its proof, or a picture or film with Content Credentials.'
    // Both in `_meta.checked`, which places the card in the answer: the certificate's reading, and the credentials.
    const fingerprint = await (await import('../receipt/receipt.js')).fingerprint()
    const read = credentials.map((one) => ({ ...one, own: one.selfIssued && one.subject['2.5.4.3'] === fingerprint }))
    ctx.meta.checked = { ...(checked && { ...checked, own: checked.fingerprint === fingerprint }), credentials: read }
    return [checked && told(ctx.meta.checked), ...read.map(toldOf)].filter(Boolean).join('\n')
  },
}

/** In an answer: what check_certificate found. */
class Certificate extends Element {
  render() {
    const checked = /** @type {{ call?: { _meta?: { checked?: Partial<Checked> & { credentials?: Credentials[] } } } }} */ (/** @type {unknown} */ (this)).call?._meta?.checked
    return html`${checked?.fingerprint || !checked?.credentials?.length ? card(checked?.fingerprint ? /** @type {Checked} */ (checked) : null) : ''}${(checked?.credentials ?? []).map(credentialsCard)}`
  }
}

define('app-certificate', Certificate)
register({
  id: 'certificates',
  tools: [checkTool],
  lines: [{ name: 'check_certificate', line: 'check a certificate of an answer, its proof, or a picture\'s or film\'s Content Credentials, the user shared' }],
})
