// This computer (D198): the user's own machine, for the Computer's commands, through the bridge they
// run in a terminal (bridge/bridge.js) with the line its part of Settings › Computer gives. A task
// whose folder is the one the bridge runs in has its commands run there, with the machine's own
// programs and ports, so `npm run dev` serves and the browser shows it; JavaScript and Python stay in
// the sandbox. Offered when a server is refused in the sandbox. Jean reaches the bridge over MCP on
// 127.0.0.1 with the key in the line, kept in .secrets/ with the folders where the user said
// "always". A command the brain runs there is asked first; what the user types in the terminal is theirs.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { register, loaded, unlock } from '../../ui/caps.js'
import { app, conversationOf, notify } from '../../ui/state.js'
import { getSecret, setSecret, deleteSecret } from '../../ui/secrets.js'
import { icons } from '../../ui/icons.js'
import { BRAND } from '../../brand.js'
import { t, useStrings } from '../../core/i18n.js'
import { mcpClient } from '../connections/mcp.js'

/** @typedef {import('../../core/loop.js').ToolContext} ToolContext */
/** @typedef {{ port: number, key: string, always: string[] }} Pairing */
/** @typedef {{ on: false } | { on: true, folder: string, path: string, os: string }} Found */

// Its commands are the Computer's, in a task's folder.
await Promise.all([useStrings('machine'), unlock('computer'), unlock('folders')])

const SECRET = 'computer-bridge'
// How long what Jean found of the bridge holds before a command asks again.
const FRESH_MS = 5000

/** The bridge as Jean last found it. */
export const bridge = signal(/** @type {Found} */ ({ on: false }))
let foundAt = 0
/** @type {{ key: string, mcp: ReturnType<typeof mcpClient> } | null} */
let client = null
/** @type {Promise<Pairing> | null} */
let paired = null

/** The line's port and key, made once and kept in .secrets/, with the folders always allowed; one at a time, so two renders make one key. */
const pairing = () => (paired ??= (async () => {
  const kept = await getSecret(app.fs, SECRET)
  if (kept) return /** @type {Pairing} */ (JSON.parse(kept))
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  const pair = { port: 41_000 + ((bytes[0] << 8) | bytes[1]) % 1000, key: btoa(String.fromCharCode(...bytes.slice(2))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c] ?? ''), always: [] }
  await setSecret(app.fs, SECRET, JSON.stringify(pair))
  return pair
})())

/** What the user pastes in a terminal, in their folder: the bridge from where Jean is served, for this origin, with the key. @param {Pairing} pair */
const line = ({ port, key }) => `curl -fsSL ${new URL('../../bridge/bridge.js', import.meta.url)} | node --input-type=module - --port ${port} --origin ${location.origin} --key ${key}`

/** @param {Pairing} pair */
function clientOf(pair) {
  if (client?.key !== pair.key) client = { key: pair.key, mcp: mcpClient({ url: `http://127.0.0.1:${pair.port}/`, client: { name: BRAND.name, version: '0.8' }, authorization: async () => `Bearer ${pair.key}` }) }
  return client.mcp
}

/** Whether the bridge runs, and in which folder: asked again once what was found is older than a few seconds. @param {boolean} [now] */
async function find(now = false) {
  if (!now && Date.now() - foundAt < FRESH_MS) return bridge.peek()
  /** @type {Found} */
  let found = { on: false }
  if (await getSecret(app.fs, SECRET)) {
    try {
      const about = (await clientOf(await pairing()).callTool({ name: 'about' }, {}, AbortSignal.timeout(2000))).structuredContent
      found = { on: true, folder: String(about.folder), path: String(about.path), os: about.os === 'darwin' ? 'macOS' : String(about.os) }
    } catch {}
  }
  foundAt = Date.now()
  if (JSON.stringify(found) !== JSON.stringify(bridge.peek())) bridge.value = found
  return found
}

/**
 * The folder a task's commands run in on this computer: its own, when the bridge runs in a folder of
 * that name; '' otherwise, and they run in the sandbox. @param {AbortSignal | undefined} signal
 */
export async function machineFolder(signal) {
  if (!loaded.peek().has('folders')) return ''
  const folder = (await import('../folders/folders.js')).folderOf(conversationOf(signal))
  if (!folder) return ''
  const found = await find()
  return found.on && found.folder === folder.name ? folder.name : ''
}

/** Before a command of the brain's on this computer: asked in the folder's card, unless the user said always for the folder (D141). @param {any} _ @param {ToolContext} ctx */
export async function asking(_, ctx) {
  const folder = await machineFolder(ctx.signal)
  if (!folder) return undefined
  return { ask: !(await pairing()).always.includes(folder), meta: { folder, machine: folder } }
}

/** "Always" for a folder, from the card. @param {string} folder */
export async function trust(folder) {
  const pair = await pairing()
  if (pair.always.includes(folder)) return
  const next = { ...pair, always: [...pair.always, folder] }
  await setSecret(app.fs, SECRET, JSON.stringify(next))
  paired = Promise.resolve(next)
}

/**
 * Runs a command on this computer, as the sandbox's shell would: what it printed, its exit code, where
 * its shell is now; one that serves goes on, and the browser shows it. The brain is told where it ran.
 * @param {Record<string, any>} message its command, or a line at an interpreter's prompt @param {ToolContext} ctx @param {string} computer @param {number} timeMs
 */
export async function runThere(message, ctx, computer, timeMs) {
  const found = bridge.peek()
  const where = found.on ? `Ran on the user's own computer (${found.os}), in their folder "${found.folder}", which is /workspace there: its files changed as they are, with nothing to keep.` : ''
  if (message.repl || message.start) return { done: { ok: false, error: "node's and python's prompts open only on Jean's own computer: on this one, run a script with them." }, left: [], kept: '' }
  const result = await clientOf(await pairing()).callTool({ name: 'bash' }, { command: String(message.command ?? ''), computer, timeMs }, ctx.signal)
  const ran = result.structuredContent
  if (result.isError || !ran) return { done: { ok: false, error: result.content?.[0]?.text ?? 'The bridge gave no answer.' }, left: [], kept: '' }
  const serving = ran.serving ? `\nStill running in the background, serving ${ran.serving.addresses.join(', ')} (stop it with kill -- -${ran.serving.group}). Its output goes on in ${ran.serving.log}.\n` : ''
  // A server started in the task on screen shows in the browser, once it is on.
  const address = ran.serving?.addresses[0]
  if (address && conversationOf(ctx.signal)?.id === app.current.peek()?.id && loaded.peek().has('browser')) (await import('../browser/browser.js')).visit(address)
  return { done: { ok: true, exit: ran.exit, stdout: ran.stdout + serving, stderr: ran.stderr, cwd: ran.cwd }, left: [], kept: where }
}

const shown = signal('')
/** @type {ReturnType<typeof setInterval> | undefined} */
let watching

/** Until the bridge answers, while its part of Settings shows: looked for every two seconds. */
function watch() {
  if (watching) return
  watching = setInterval(async () => {
    if (!document.querySelector('.machine') || (await find(true)).on) {
      clearInterval(watching)
      watching = undefined
    }
  }, 2000)
}

async function forget() {
  await deleteSecret(app.fs, SECRET)
  ;[client, paired, shown.value] = [null, null, '']
  await find(true)
}

/** This computer, in Settings › Computer: on, in which folder, with Stop using it; or the line to paste in a terminal, with Copy. The light is the Computer's (D176), here the bridge's. */
function panel() {
  const found = bridge.value
  if (!shown.value) pairing().then((pair) => { shown.value = line(pair) })
  if (!found.on) watch()
  return html`<section class="setting machine">
      <div>
        <h3><span class="ember" data-state=${found.on ? 'ready' : 'asleep'} aria-hidden="true"></span><span role="status">${t('cap.machine.name')}</span></h3>
        <p class="muted">${found.on ? t('machine.on', { folder: found.folder }) : t('machine.text')}</p>
      </div>
      ${found.on ? html`<button class="button subtle" @click=${forget}>${t('machine.forget')}</button>` : nothing}
    </section>
    ${found.on || !shown.value ? nothing : html`<div class="machine-line">
      <code dir="ltr">${shown.value}</code>
      <button class="button subtle" @click=${() => navigator.clipboard.writeText(shown.value).then(() => notify(t('toast.copied')))}>${icons.copy} ${t('action.copy')}</button>
    </div>`}`
}

/** The card for a command of the brain's on this computer: the command, then once, always in that folder, or no. */
class MachineApproval extends Element {
  #decision = signal(/** @type {any} */ (null))
  #helper = signal(/** @type {string | undefined} */ (undefined))
  /** @param {Extract<import('../../ui/state.js').Decision, { toolCall: any }>} value */
  set decision(value) { this.#decision.value = value }
  /** @param {string | undefined} value the helper asking, if one is */
  set helper(value) { this.#helper.value = value }

  render() {
    const decision = this.#decision.value
    if (!decision) return nothing
    const { toolCall, resolve } = decision
    const folder = String(toolCall._meta?.machine ?? '')
    const asked = t('machine.question', { folder })
    return html`<div class="approval" role="group" aria-label=${asked}>
      ${this.#helper.value ? html`<p class="approval-from">${icons.helpers}<span dir="auto">${this.#helper.value}</span></p>` : nothing}
      <p>${asked}</p>
      <pre class="approval-for" dir="ltr">${String(toolCall.rawInput?.command ?? '')}</pre>
      <div class="approval-actions">
        <button class="button primary" @click=${() => resolve('allow_once')}>${t('approval.allowOnce')}</button>
        <button class="button" @click=${() => resolve('allow_always')}>${t('machine.always', { folder })}</button>
        <button class="button subtle" @click=${() => resolve('reject_once')}>${t('approval.rejectOnce')}</button>
      </div>
    </div>`
  }
}
define('app-machine-approval', MachineApproval)

register({ id: 'machine', panel })
// Looked for once on: Settings and the first command know at once whether it runs.
find(true)
