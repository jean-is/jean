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
import { icons } from '../../ui/icons.js'
import { BRAND } from '../../brand.js'
import { t, useStrings } from '../../core/i18n.js'
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
  // Claude Code's brain answers through the bridge: it follows the new port and key (D235).
  const brains = app.settings.peek().brains.map((brain) => (brain.provider === 'claudecode' ? { ...brain, baseURL: `http://127.0.0.1:${pair.port}/v1` } : brain))
  for (const brain of brains) if (brain.provider === 'claudecode') await setSecret(app.fs, brain.id, pair.key)
  if (brains.some((brain) => brain.provider === 'claudecode')) await updateSettings({ brains })
  return (known.value = pair)
})())

/**
 * Claude Code on this computer, with the user's Claude plan (D235): where Jean reaches it through the bridge, and
 * whether it is there and signed in, or the bridge, started before it knew Claude Code, needs starting again; null
 * while the bridge isn't running.
 * @returns {Promise<{ baseURL: string, apiKey: string, ready: boolean, old: boolean } | null>}
 */
export async function claudeCode() {
  if (!(await find(true)).on) return null
  const pair = await pairing()
  const about = await clientOf(pair).callTool({ name: 'about' }, { claude: true }, AbortSignal.timeout(20_000)).catch(() => null)
  const claude = about?.structuredContent?.claude
  return { baseURL: `http://127.0.0.1:${pair.port}/v1`, apiKey: pair.key, ready: claude === true, old: Boolean(about) && claude === undefined }
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

/** Until the bridge answers, while Settings › Computer shows the computers: looked for every two seconds. */
function watch() {
  if (watching) return
  watching = setInterval(async () => {
    if (!document.querySelector('.computers') || (await find(true)).on) {
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
 * This computer's card in Settings › Computer: on, in which folder, with Stop using it and the folders
 * where its commands run unasked; or three steps, the line to paste in a terminal with Copy, then a light
 * that waits for it; in the desktop app, Choose a folder. The light is the Computer's (D176), here the bridge's.
 */
function panel() {
  const found = bridge.value
  const own = inApp.value
  const pair = known.value
  if (!pair && (!own || found.on)) pairing()
  const text = found.on ? t(own ? 'machine.on.app' : 'machine.on', { folder: found.folder }) : own ? t(failed.value ? 'machine.failed' : 'machine.app') : t('machine.text')
  return html`<section class="machine">
    <div class="setting">
      <div>
        <h3><span class="ember" data-state=${found.on ? 'ready' : 'asleep'} aria-hidden="true"></span>${t('cap.machine.name')}<span class="muted" role="status">${state(found)}</span></h3>
        <p class="muted">${text}</p>
      </div>
      ${found.on ? html`<button class="button subtle" @click=${forget}>${t('machine.forget')}</button>`
        : own ? html`<button class="button subtle" @click=${choose}>${icons.folder} ${t('machine.choose')}</button>` : nothing}
    </div>
    ${found.on || own || !pair ? nothing : html`<ol class="machine-steps">
      <li>${t('machine.step.open')}</li>
      <li>${t('machine.step.paste')}<div class="machine-line">
        <code dir="ltr">${line(pair)}</code>
        <button class="button subtle" @click=${() => navigator.clipboard.writeText(line(pair)).then(() => notify(t('toast.copied')))}>${icons.copy} ${t('action.copy')}</button>
      </div></li>
      <li><span class="ember" data-state="waking" aria-hidden="true"></span>${t('machine.step.wait')}</li>
    </ol>`}
    ${found.on && pair?.always.length ? html`<div class="sites">
      <span class="muted">${t('machine.trusted')}</span>
      <ul>${pair.always.map((folder) => html`<li><bdi>${folder}</bdi><button class="icon-button subtle" aria-label=${t('machine.untrust', { folder })}
        @click=${(/** @type {Event} */ e) => untrust(e, folder)}>${icons.close}</button></li>`)}</ul>
    </div>` : nothing}
  </section>`
}

// ─── Two computers ───────────────────────────────────────────────────────────

/** Which computer Settings › Computer shows (D248): the sandbox, the default, or this one; kept for the visit. */
const viewing = signal(/** @type {'sandbox' | 'machine'} */ ('sandbox'))

/** Settings › Computer, on this computer's card: from its offer, Brains' Connect and its trophy. */
export function show() {
  viewing.value = 'machine'
  app.section.value = 'computer'
  app.dialog.value = 'settings'
}

/** This computer's state, beside its name: in which folder, or not connected. @param {Found} found */
const state = (found) => (found.on ? t('machine.in', { folder: found.folder }) : t('machine.off'))

/**
 * The sandbox's picture (D250): a glass box, its hidden edges dashed, with the computer that runs inside it, a block
 * with a prompt on its screen and its lights, and a shield on the box: it is kept apart, and safe. Its screen lights up
 * once the sandbox is awake, and its cursor blinks while it works.
 */
const SANDBOX = html`<svg class="art" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <path d="M8 15 24 7 40 15V35L24 27 8 35Z" fill="currentColor" fill-opacity=".05" stroke="none"/><path d="M8 35 24 27 40 35 24 43Z" fill="currentColor" fill-opacity=".1" stroke="none"/>
  <path d="M24 7V27M8 35 24 27 40 35" stroke-dasharray="1.6 2.2" stroke-opacity=".55"/>
  <path d="M15.5 26 24 30.25V39.25L15.5 35Z" fill="currentColor" fill-opacity=".32"/><path d="M24 30.25 32.5 26V35L24 39.25Z" fill="currentColor" fill-opacity=".5"/>
  <path d="M15.5 26 24 21.75 32.5 26 24 30.25Z" fill="currentColor" fill-opacity=".18"/><path class="screen" d="M16.8 28.4 22.7 31.4V35.9L16.8 32.9Z" fill="currentColor" fill-opacity=".12"/>
  <path d="M17.6 30.2 18.8 31.7 17.6 32" stroke-width="1"/><path class="cursor" d="M19.6 33 21.1 33.75" stroke-width="1"/>
  <g class="leds" fill="currentColor" stroke="none"><circle cx="26.1" cy="31.9" r=".6"/><circle cx="27.8" cy="31" r=".6"/><circle cx="29.5" cy="30.2" r=".6"/></g>
  <path d="M25.7 34.8 30.8 32.3M25.7 36.2 30.8 33.6" stroke-width="1" stroke-opacity=".7"/>
  <path d="M8 15 24 23V43L8 35Z" fill="currentColor" fill-opacity=".07"/><path d="M24 23 40 15V35L24 43Z" fill="currentColor" fill-opacity=".11"/>
  <path d="M8 15 24 7 40 15 24 23Z" fill="currentColor" fill-opacity=".06"/><path d="M11 20.5V24.5M11 27V28.5" stroke-opacity=".6"/>
  <path d="M8 15 24 7 40 15V35L24 43 8 35ZM8 15 24 23 40 15M24 23V43"/>
  <path d="M38 30.4 42.8 32.1V35.9C42.8 39.2 40.8 41.5 38 42.7 35.2 41.5 33.2 39.2 33.2 35.9V32.1Z" fill="currentColor"/><path class="on" d="M35.9 36.4 37.5 38 40.3 35" stroke-width="1.4"/>
</svg>`

/**
 * This computer's picture (D250): a laptop in the same view, open where the sandbox is closed, a folder of the user's on
 * its screen, and the link to it, through the bridge: its screen lights up and its link fills once the bridge answers.
 */
const LAPTOP = html`<svg class="art" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <path d="M24 22.5 43 32V13L24 3.5Z" fill="currentColor" fill-opacity=".14"/><path class="screen" d="M25.5 21 41.5 29V14L25.5 6Z" fill="currentColor" fill-opacity=".12"/>
  <path d="M30 18.8V13.3l2.4 1.2 1.1 1.6 3.5 1.75V22.5Z" fill="currentColor" fill-opacity=".55"/>
  <path d="M5 32 24 41.5V44L5 34.5Z" fill="currentColor" fill-opacity=".22"/><path d="M24 41.5 43 32V34.5L24 44Z" fill="currentColor" fill-opacity=".36"/>
  <path d="M5 32 24 22.5 43 32 24 41.5Z" fill="currentColor" fill-opacity=".1"/><path d="M24.4 24.6 38.8 31.8 31.2 35.6 16.8 28.4Z" fill="currentColor" fill-opacity=".24"/>
  <path d="M21.9 25.8 36.4 33M19.3 27.2 33.7 34.4M19.8 32.2 23.6 34.1 19.1 36.4 15.3 34.5Z"/>
  <path d="M24 22.5V3.5L43 13V32M5 32 24 22.5 43 32V34.5L24 44 5 34.5ZM5 32 24 41.5 43 32M24 41.5V44M25.5 21V6L41.5 14V29ZM30 18.8V13.3l2.4 1.2 1.1 1.6 3.5 1.75V22.5Z"/>
  <circle class="badge link" cx="38" cy="38.5" r="5.2" fill="currentColor" fill-opacity=".18"/>
  <path class="on link" d="M37 40.6 36.3 41.3A1.5 1.5 0 0 1 34.2 39.2L35.6 37.8A1.5 1.5 0 0 1 37.7 37.8M39 36.4 39.7 35.7A1.5 1.5 0 0 1 41.8 37.8L40.4 39.2A1.5 1.5 0 0 1 38.3 39.2" stroke-width="1.2"/>
</svg>`

/** A computer's card, a tab: its picture, its name, its light and its state. @param {'sandbox' | 'machine'} id @param {unknown} picture @param {unknown} name @param {string} light @param {string} text */
const card = (id, picture, name, light, text) => html`<button role="tab" id=${`computer-${id}`} aria-selected=${String(viewing.value === id)}
  aria-controls="computer-shown" tabindex=${viewing.value === id ? 0 : -1} @click=${() => { viewing.value = id }}>
  <span class="item-icon" aria-hidden="true" data-state=${light}>${picture}</span>
  <span class="item-text"><span>${name}</span><small><span class="ember" data-state=${light} aria-hidden="true"></span>${text}</small></span>
</button>`

/** Between the two cards, any arrow goes to the other, whichever way the language reads; Home and End to the first and the last. @param {KeyboardEvent} event */
function move(event) {
  const to = event.key.startsWith('Arrow') ? (viewing.value === 'sandbox' ? 'machine' : 'sandbox') : event.key === 'Home' ? 'sandbox' : event.key === 'End' ? 'machine' : null
  if (!to) return
  event.preventDefault()
  viewing.value = to
  document.getElementById(`computer-${to}`)?.focus()
}

/**
 * Settings › Computer once this computer is on (D248): what decides which computer a task uses, then the
 * two, a card each as tabs, each with its picture, the sandbox first; under them, the one chosen, then what both use.
 * @param {{ sandbox: unknown, shared: unknown, name: string, light: string, text: string }} parts the sandbox's, from the Computer
 */
export function computers({ sandbox, shared, name, light, text }) {
  const found = bridge.value
  if (!found.on) watch()
  return html`<p class="lede">${t('machine.lede')}</p>
    <div class="computers" role="tablist" aria-label=${t('machine.computers')} @keydown=${move}>
      ${card('sandbox', SANDBOX, name, light, text)}
      ${card('machine', LAPTOP, t('cap.machine.name'), found.on ? 'ready' : 'asleep', state(found))}
    </div>
    <div role="tabpanel" id="computer-shown" aria-labelledby=${`computer-${viewing.value}`}>${viewing.value === 'sandbox' ? sandbox : panel()}${shared}</div>`
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

// Its part of Settings is the Computer's to place: `computers()`.
register({ id: 'machine' })
// Looked for once on, so Settings and the first command know at once whether it runs; in the desktop
// app, started again in the folder it was started in.
desktop.then(async (yes) => {
  const kept = yes && (await getSecret(app.fs, SECRET))
  const path = kept && /** @type {Pairing} */ (JSON.parse(kept)).path
  return path ? start(path) : find(true)
}).catch(() => {})
