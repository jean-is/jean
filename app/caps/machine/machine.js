// This computer (D198): the user's own machine, for the Computer's commands, through the bridge they
// run in a terminal (bridge/bridge.js) with the line its part of Settings › Computer gives. A task
// whose folder is the one the bridge runs in has its commands run there, with the machine's own
// programs and ports, so `npm run dev` serves and the browser shows it; JavaScript and Python stay in
// the sandbox. Offered when a server is refused in the sandbox. Jean reaches the bridge over MCP on
// 127.0.0.1 with the key in the line, kept in .secrets/ with the folders where the user said
// "always". A command the brain runs there is asked first; what the user types in the terminal is theirs.
// The desktop app starts the bridge itself, in a folder the system's dialog picks, as Jean opens.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { register, loaded, unlock } from '../../ui/caps.js'
import { app, conversationOf, notify, updateSettings } from '../../ui/state.js'
import { getSecret, setSecret, deleteSecret } from '../../ui/secrets.js'
import { host, call, pickFolder } from '../../ui/host.js'
import { icons } from '../../ui/menu-icons.js'
import { BRAND } from '../../brand.js'
import { t, useStrings } from '../../core/i18n.js'
import { PROVIDERS } from '../../core/llm.js'
import { mcpClient } from '../connections/mcp.js'

/** @typedef {import('../../core/loop.js').ToolContext} ToolContext */
/** @typedef {{ port: number, key: string, always: string[], path?: string }} Pairing path: the folder the desktop app starts it in */
/** @typedef {{ on: false } | { on: true, folder: string, path: string, os: string }} Found */

// Its commands are the Computer's, in a task's folder.
await Promise.all([useStrings('machine'), unlock('computer'), unlock('folders')])

const SECRET = 'computer-bridge'
const BRIDGE = new URL('../../bridge/bridge.js', import.meta.url).href
// The desktop app starts the bridge itself where the system has bash; the process it started, for the visit.
const inApp = signal(false)
const desktop = host.then((known) => (inApp.value = Boolean(known) && known?.os !== 'Windows'))
const RUNNING = 'app.bridge'
// How long what Jean found of the bridge holds before a command asks again.
const FRESH_MS = 5000
/** The plans' brains (D235, D262): where each answers on the bridge, and what its `about` is asked for it. */
const PLANS = /** @type {Record<string, [string, string]>} */ ({ claudecode: ['/v1', 'claude'], copilot: ['/copilot/v1', 'copilot'], chatgpt: ['/chatgpt/v1', 'chatgpt'] })
// Where ChatGPT signs in for open-source apps (D262): an identity of the provider's, like its API's address.
const ISSUER = 'https://auth.openai.com'

/** The bridge as Jean last found it. */
export const bridge = signal(/** @type {Found} */ ({ on: false }))
let foundAt = 0
/** @type {{ key: string, mcp: ReturnType<typeof mcpClient> } | null} */
let client = null
/** @type {Promise<Pairing> | null} */
let paired = null
/** The pairing as last read or saved, for Settings: the line, and the folders always allowed. */
const known = signal(/** @type {Pairing | null} */ (null))

/** The line's port and key, made once and kept in .secrets/, with the folders always allowed; one at a time, so two renders make one key. */
const pairing = () => (paired ??= (async () => {
  const kept = await getSecret(app.fs, SECRET)
  if (kept) return (known.value = /** @type {Pairing} */ (JSON.parse(kept)))
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  const pair = /** @type {Pairing} */ ({ port: 41_000 + ((bytes[0] << 8) | bytes[1]) % 1000, key: btoa(String.fromCharCode(...bytes.slice(2))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c] ?? ''), always: [] })
  await setSecret(app.fs, SECRET, JSON.stringify(pair))
  // The plans' brains answer through the bridge: they follow the new port and key (D235, D262).
  const brains = app.settings.peek().brains.map((brain) => (PLANS[brain.provider] ? { ...brain, baseURL: `http://127.0.0.1:${pair.port}${PLANS[brain.provider][0]}` } : brain))
  for (const brain of brains) if (PLANS[brain.provider]) await setSecret(app.fs, brain.id, pair.key)
  if (brains.some((brain) => PLANS[brain.provider])) await updateSettings({ brains })
  return (known.value = pair)
})())

/**
 * A plan's brain on this computer (D235, D262): where Jean reaches it through the bridge, and whether it is
 * ready (Claude Code or Copilot there and signed in, the bridge signed in to ChatGPT with the plan's use), or
 * the bridge, started before it knew that plan, needs starting again; null while the bridge isn't running.
 * @param {string} provider claudecode, copilot or chatgpt
 * @returns {Promise<{ baseURL: string, apiKey: string, ready: boolean, old: boolean } | null>}
 */
export async function plan(provider) {
  if (!(await find(true)).on) return null
  const pair = await pairing()
  const [path, asked] = PLANS[provider]
  const about = await clientOf(pair).callTool({ name: 'about' }, { [asked]: true }, AbortSignal.timeout(40_000)).catch(() => null)
  const found = about?.structuredContent?.[asked]
  return { baseURL: `http://127.0.0.1:${pair.port}${path}`, apiKey: pair.key, ready: found === true, old: Boolean(about) && found === undefined }
}

/** Where the page goes to sign in to ChatGPT, as Jean, through the bridge, which keeps the tokens; it comes back with ?chatgpt=… (D262). */
export async function chatgptSignIn() {
  const asked = { name: BRAND.name, issuer: ISSUER, api: PROVIDERS.chatgpt.baseURL, back: location.origin + location.pathname }
  const result = await clientOf(await pairing()).callTool({ name: 'chatgpt' }, asked, AbortSignal.timeout(20_000))
  if (!result.structuredContent?.url) throw new Error(result.content?.[0]?.text ?? 'The bridge gave no address.')
  return String(result.structuredContent.url)
}

/** Signs the bridge out of ChatGPT, once its brain is removed: its tokens revoked and gone (D262). */
export async function chatgptSignOut() {
  if ((await find(true)).on) await clientOf(await pairing()).callTool({ name: 'chatgpt' }, { out: true }, AbortSignal.timeout(20_000))
}

/** @param {Pairing} next */
async function save(next) {
  await setSecret(app.fs, SECRET, JSON.stringify(next))
  paired = Promise.resolve(next)
  known.value = next
}

/** What the user pastes in a terminal, in their folder: the bridge from where Jean is served, for this origin, with the key. @param {Pairing} pair */
const line = ({ port, key }) => `curl -fsSL ${BRIDGE} | node --input-type=module - --port ${port} --origin ${location.origin} --key=${key}`
/** A text as one word for the shell. @param {string} text */
const word = (text) => `'${text.replaceAll("'", `'\\''`)}'`
/** The desktop app's bridge ended without answering (no node, say). */
const failed = signal(false)

/**
 * Starts the bridge in a folder, in the desktop app, unless it answers already: through the user's
 * login shell, so it finds the node their terminal finds, and `--attached`, so it ends with the app.
 * The folder is kept for the next launch. @param {string} path
 */
async function start(path) {
  const pair = await pairing()
  if (pair.path !== path) await save({ ...pair, path })
  if ((await find(true)).on) return
  const load = "await import('data:text/javascript,' + encodeURIComponent(await (await fetch(process.argv[1])).text()))"
  const node = `exec node --input-type=module -e ${word(load)} -- ${word(BRIDGE)} --port ${pair.port} --origin ${word(location.origin)} --key=${pair.key} --folder ${word(path)} --attached`
  const { id } = await call('os.spawnProcess', { command: `exec "\${SHELL:-/bin/sh}" -lic ${word(node)}` })
  sessionStorage.setItem(RUNNING, String(id))
  failed.value = false
  for (let tries = 0; tries < 60 && !(await find(true)).on; tries++) {
    if (!(await call('os.getSpawnedProcesses', {})).some((/** @type {{ id: number }} */ each) => each.id === id)) return void (failed.value = true)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

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
  if (!pair.always.includes(folder)) await save({ ...pair, always: [...pair.always, folder] })
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

/** @type {ReturnType<typeof setInterval> | undefined} */
let watching

/** Until the bridge answers, while its page shows: looked for every two seconds. */
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
  // The desktop app's bridge ends as its input closes.
  const id = sessionStorage.getItem(RUNNING)
  if (id) await call('os.updateSpawnedProcess', { id: Number(id), event: 'stdInEnd' }).catch(() => {})
  sessionStorage.removeItem(RUNNING)
  await deleteSecret(app.fs, SECRET)
  ;[client, paired, known.value, failed.value] = [null, null, null, false]
  await find(true)
}

/** The folder the desktop app starts the bridge in, picked with the system's dialog. */
const choose = () => pickFolder(t('machine.choose')).then((path) => start(path).catch(() => { failed.value = true }), () => {})

/** "Always" taken back for a folder: its commands are asked first again. @param {Event} event @param {string} folder */
async function untrust(event, folder) {
  /** @type {HTMLElement} */ (event.currentTarget).closest('.machine')?.querySelector('button')?.focus()
  const pair = await pairing()
  await save({ ...pair, always: pair.always.filter((other) => other !== folder) })
}

/**
 * This computer's page in Settings › Computer: on, in which folder, with Stop using it and the folders where its
 * commands run unasked; or three steps, the line to paste in a terminal, its key hidden and Copy taking it whole, then a
 * light that waits for it; in the desktop app, Choose a folder. Its line and what it does most go at the page's head.
 */
export function page() {
  const found = bridge.value
  const own = inApp.value
  const pair = known.value
  if (!pair && (!own || found.on)) pairing()
  if (!found.on) watch()
  return {
    lede: found.on ? t(own ? 'machine.on.app' : 'machine.on', { folder: found.folder }) : own ? t(failed.value ? 'machine.failed' : 'machine.app') : t('machine.text'),
    end: found.on ? html`<button class="button subtle" @click=${forget}>${t('machine.forget')}</button>`
      : own ? html`<button class="button subtle" @click=${choose}>${icons.folder} ${t('machine.choose')}</button>` : nothing,
    draw: () => html`<section class="machine">
      ${found.on || own || !pair ? nothing : html`<ol class="machine-steps">
        <li>${t('machine.step.open')}</li>
        <li>${t('machine.step.paste')}<div class="machine-line">
          <code dir="ltr">${line(pair).replace(/--key=\S+/, '--key=••••••••')}</code>
          <button class="button subtle" @click=${() => navigator.clipboard.writeText(line(pair)).then(() => notify(t('toast.copied')))}>${icons.copy} ${t('action.copy')}</button>
        </div><p class="hint">${t('machine.secret')}</p></li>
        <li><span class="ember" data-state="waking" aria-hidden="true"></span>${t('machine.step.wait')}</li>
      </ol>`}
      ${found.on && pair?.always.length ? html`<div class="sites">
        <span class="muted">${t('machine.trusted')}</span>
        <ul>${pair.always.map((folder) => html`<li><bdi>${folder}</bdi><button class="icon-button subtle" aria-label=${t('machine.untrust', { folder })}
          @click=${(/** @type {Event} */ e) => untrust(e, folder)}>${icons.close}</button></li>`)}</ul>
      </div>` : nothing}
    </section>`,
  }
}

/** Settings › Computer on This computer's page: from its offer, Brains' Connect and its trophy. */
export function show() {
  app.section.value = 'computer/machine'
  app.dialog.value = 'settings'
}

/** This computer's row, under the Sandbox's: its light, its state, the folder it runs in. @param {string} ready the Computer's word for available */
export function about(ready) {
  const found = bridge.value
  return { light: found.on ? 'ready' : 'asleep', state: found.on ? ready : t('machine.off'), line: found.on ? t('machine.row', { folder: found.folder }) : '' }
}

/** What decides which computer a task uses (D248), the Computer's line once this one is found. */
export const lede = () => t('machine.lede')

/**
 * This computer's picture (D250): a laptop in the same view, open where the sandbox is closed, a folder of the user's on
 * its screen, and the link to it, through the bridge: its screen lights up and its link fills once the bridge answers.
 */
export const LAPTOP = html`<svg class="art" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <path d="M24 22.5 43 32V13L24 3.5Z" fill="currentColor" fill-opacity=".14"/><path class="screen" d="M25.5 21 41.5 29V14L25.5 6Z" fill="currentColor" fill-opacity=".12"/>
  <path d="M30 18.8V13.3l2.4 1.2 1.1 1.6 3.5 1.75V22.5Z" fill="currentColor" fill-opacity=".55"/>
  <path d="M5 32 24 41.5V44L5 34.5Z" fill="currentColor" fill-opacity=".22"/><path d="M24 41.5 43 32V34.5L24 44Z" fill="currentColor" fill-opacity=".36"/>
  <path d="M5 32 24 22.5 43 32 24 41.5Z" fill="currentColor" fill-opacity=".1"/><path d="M24.4 24.6 38.8 31.8 31.2 35.6 16.8 28.4Z" fill="currentColor" fill-opacity=".24"/>
  <path d="M21.9 25.8 36.4 33M19.3 27.2 33.7 34.4M19.8 32.2 23.6 34.1 19.1 36.4 15.3 34.5Z"/>
  <path d="M24 22.5V3.5L43 13V32M5 32 24 22.5 43 32V34.5L24 44 5 34.5ZM5 32 24 41.5 43 32M24 41.5V44M25.5 21V6L41.5 14V29ZM30 18.8V13.3l2.4 1.2 1.1 1.6 3.5 1.75V22.5Z"/>
  <circle class="badge link" cx="38" cy="38.5" r="5.2" fill="currentColor" fill-opacity=".18"/>
  <path class="on link" d="M37 40.6 36.3 41.3A1.5 1.5 0 0 1 34.2 39.2L35.6 37.8A1.5 1.5 0 0 1 37.7 37.8M39 36.4 39.7 35.7A1.5 1.5 0 0 1 41.8 37.8L40.4 39.2A1.5 1.5 0 0 1 38.3 39.2" stroke-width="1.2"/>
</svg>`

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

// Its row and page in Settings are the Computer's to place: `about()`, `page()`.
register({ id: 'machine' })
// Looked for once on, so Settings and the first command know at once whether it runs; in the desktop
// app, started again in the folder it was started in.
desktop.then(async (yes) => {
  const kept = yes && (await getSecret(app.fs, SECRET))
  const path = kept && /** @type {Pairing} */ (JSON.parse(kept)).path
  return path ? start(path) : find(true)
}).catch(() => {})
