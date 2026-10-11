// Checking certificates (D274): a certificate of an answer, or its proof, shared in a conversation
// brings this capability, whose check_certificate reads them with the files to match and shows what
// it found in the answer (`_meta.checked`), as the check page does: Jean's words never decide it.
import { Element, define } from '../../ui/base.js'
import { register } from '../../ui/caps.js'
import { app, currentFiles } from '../../ui/state.js'
import { join } from '../../core/fs.js'
import { t, useStrings } from '../../core/i18n.js'
import { styleSheet } from '../../ui/sheet.js'
import { checkGiven, card } from './card.js'

/** @import { Checked } from './card.js' */

await Promise.all([useStrings('certificates'), styleSheet(new URL('../receipt/receipt.css', import.meta.url))])

/** What the brain is told: what the card shows, in words. @param {Checked} checked */
function told(checked) {
  const said = checked.says?.credentialSubject ?? {}
  const sealer = checked.own ? 'this device' : checked.selfIssued ? `a device's own key (fingerprint ${checked.fingerprint})` : `a key certified by ${checked.issuer['2.5.4.3'] ?? 'an authority'}`
  const who = (/** @type {{ provider: string, model: string, host?: string }[]} */ all = []) => all.map(({ provider, model, host }) => `${provider} ${model}${host ? ` at ${host}` : ''}`).join(', ') || 'none'
  return [
    checked.intact ? `Intact: sealed by ${sealer} on ${checked.at}.` : `Not intact: changed since it was sealed, or not sealed by the key it names (${sealer}).`,
    `It says the answer was done: ${said.where}; answered by ${who(said.brains)}; made by ${who(said.made)}.`,
    ...(checked.proven === undefined ? [] : [checked.proven ? `Its proof shows the request: "${checked.words?.request}", and the answer: "${checked.words?.answer}".` : 'The proof is not this certificate\'s.']),
    ...checked.files.map(({ name, named }) => `${name} is ${named ? '' : 'not '}a file it names.`),
  ].join('\n')
}

/** @type {import('../../core/loop.js').Tool} */
const checkTool = {
  spec: {
    name: 'check_certificate',
    description: 'Check a certificate of an answer, or its proof, that the user shared: whether its seal holds, who sealed it and when, what it says, and with its proof the words and which of the other files given it names. The user sees the result in your answer.',
    parameters: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' }, description: 'Names of shared files: the certificate, its proof, files to match' } }, required: ['files'] },
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
    const checked = await checkGiven(given)
    if (!checked) return 'None of these files is a certificate of an answer or its proof.'
    const own = checked.fingerprint === await (await import('../receipt/receipt.js')).fingerprint()
    ctx.meta.checked = { ...checked, own }
    return told({ ...checked, own })
  },
}

/** In an answer: what check_certificate found. */
class Certificate extends Element {
  render() {
    return card(/** @type {{ call?: { _meta?: { checked?: Checked } } }} */ (/** @type {unknown} */ (this)).call?._meta?.checked)
  }
}

define('app-certificate', Certificate)
register({
  id: 'certificates',
  tools: [checkTool],
  lines: [{ name: 'check_certificate', line: 'check a certificate of an answer, or its proof, the user shared' }],
})
