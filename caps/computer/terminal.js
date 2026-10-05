// The terminal (D166): the conversation's computer, for the user to type on, in a pane of the dock
// (D144) beside the conversation, or over it on a narrow screen. A command runs where the brain's
// do, in turn with them, in the same shell with its directory and variables, over the same
// /workspace: what it changes there is kept at once, as the user's own, in their folder too; a new
// site is asked about under it, as Settings › Computer has it; and the brain is told what ran with
// the next message. Each conversation's terminal keeps what it showed for the visit. ↑ and ↓ go
// through what was typed, Ctrl+C stops what runs, Ctrl+L clears. Opened from Settings › Computer or
// with Ctrl+`, then from the bar too. Loaded the first time it opens, with its style sheet.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import * as dock from '../../ui/dock.js'
import { app, updateSettings } from '../../ui/state.js'
import { icons } from '../../ui/icons.js'
import { appendRecords } from '../../core/conversations.js'
import { noteRecord } from '../../core/events.js'
import { t, tParts, locale } from '../../core/i18n.js'
import { typed, clip, prompt, keys } from './computer.js'

/** @typedef {import('../../core/loop.js').PermissionOption} PermissionOption */
/**
 * A command and what came of it, as it shows: what it printed, its errors, its exit code once it has
 * ended, a site it waits to reach, and the files not kept as they changed meanwhile.
 * @typedef {{ command: string, cwd: string, out: string, err: string, exit?: number, running?: AbortController,
 *   site?: { site: string, resolve: (answer: PermissionOption) => void }, refused?: string[] }} Entry
 */

await new Promise((resolve) => {
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('terminal.css', import.meta.url).href })
  link.addEventListener('load', resolve, { once: true })
  link.addEventListener('error', resolve, { once: true })
  document.head.append(link)
})

// What an output shows, from its end: more only slows the page. What the brain is told of it.
const SHOWN = 100_000
const TOLD = 1500
// Colours and the cursor's moves, which the pane doesn't draw.
const ESCAPES = /\x1b\[[0-9;?]*[ -/]*[@-~]/g

const open = signal(false)
const moves = signal(0)
const bump = () => { moves.value++ }
/** Each conversation's terminal for the visit ('' before one exists): what it showed, and where its shell is. @type {Map<string, { entries: Entry[], cwd: string }>} */
const terminals = new Map()
/** What was typed, oldest first; where ↑ and ↓ are in it, and the line being typed before. @type {string[]} */
const typedBefore = []
let back = 0
let draft = ''
/** Whether the log follows what comes, as it does until the user scrolls up. */
let following = true

/** @param {string} [id] */
const terminalOf = (id = '') => terminals.get(id) ?? /** @type {{ entries: Entry[], cwd: string }} */ (terminals.set(id, { entries: [], cwd: '/workspace' }).get(id))
const current = () => terminalOf(app.current.peek()?.id)

/** Opens the pane; from then on, the bar has a button for it. */
export function show() {
  open.value = true
  if (!app.settings.peek().terminal) updateSettings({ terminal: true })
}
export const close = () => { open.value = false }
export const toggle = () => (open.peek() ? close() : show())

const stop = () => { for (const entry of current().entries) entry.running?.abort() }
const clear = () => {
  const terminal = current()
  terminal.entries = terminal.entries.filter((entry) => entry.running)
  bump()
}

class Terminal extends Element {
  render() {
    if (!open.value) return nothing
    void moves.value
    const terminal = terminalOf(app.current.value?.id)
    const button = (/** @type {string} */ label, /** @type {unknown} */ icon, /** @type {() => void} */ run) => html`<button class="icon-button" title=${label} aria-label=${label} @click=${run}>${icon}</button>`
    return html`<aside class="pane terminal" aria-label=${t('computer.terminal')} @keydown=${(/** @type {KeyboardEvent} */ event) => event.key === 'Escape' && !event.isComposing && close()}>
      <header class="pane-head">
        <h2>${t('computer.terminal')}</h2>
        ${terminal.entries.some((entry) => entry.running) ? button(t('action.stop'), icons.stop, stop) : nothing}
        ${button(t('computer.terminal.clear'), icons.trash, clear)}
        ${button(t('action.close'), icons.close, close)}
      </header>
      <div class="terminal-body" dir="ltr" @scroll=${scrolled} @click=${focusLine}>
        ${terminal.entries.length ? nothing : html`<p class="terminal-hint" dir="auto">${prompt}<span>${tParts('computer.terminal.text', { keys })}</span></p>`}
        <div role="log">${terminal.entries.map(entry)}</div>
        <form class="terminal-line" @submit=${(/** @type {Event} */ event) => event.preventDefault()}>
          <span aria-hidden="true">${terminal.cwd} $</span>
          <textarea rows="1" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" aria-label=${t('computer.terminal.command')} @keydown=${typing}></textarea>
        </form>
      </div>
    </aside>`
  }

  updated() {
    if (dock.place(this, open.value)) this.querySelector('textarea')?.focus()
    const body = this.querySelector('.terminal-body')
    if (body && following) body.scrollTop = body.scrollHeight
  }
}

/** @param {Entry} entry */
const entry = (entry) => html`<div class="terminal-entry ${entry.running ? 'is-running' : ''}">
  <p class="terminal-command"><span aria-hidden="true">${entry.cwd} $ </span>${entry.command}</p>
  ${entry.out ? html`<pre>${shown(entry.out)}</pre>` : nothing}
  ${entry.err ? html`<pre class="is-error">${shown(entry.err)}</pre>` : nothing}
  ${entry.site ? html`<app-site-approval .decision=${{ toolCall: { _meta: { site: entry.site.site }, rawInput: {} }, resolve: entry.site.resolve }}></app-site-approval>` : nothing}
  ${entry.refused?.length ? html`<p class="terminal-note" dir="auto">${t('computer.terminal.refused', { files: new Intl.ListFormat(locale.value).format(entry.refused) })}</p>` : nothing}
  ${entry.exit ? html`<p class="terminal-note" dir="auto">${t('computer.terminal.exit', { code: entry.exit })}</p>` : nothing}
</div>`

/** @param {string} text */
const shown = (text) => {
  const plain = text.replace(ESCAPES, '')
  return plain.length > SHOWN ? `…${plain.slice(-SHOWN)}` : plain
}

/** @param {Event} event */
function scrolled(event) {
  const body = /** @type {HTMLElement} */ (event.currentTarget)
  following = body.scrollHeight - body.scrollTop - body.clientHeight < 32
}

/** A click in the log, not a selection or on a button, is for the line. @param {Event} event */
function focusLine(event) {
  const body = /** @type {HTMLElement} */ (event.currentTarget)
  if (getSelection()?.isCollapsed && !/** @type {HTMLElement} */ (event.target).closest('button, textarea')) body.querySelector('textarea')?.focus()
}

/**
 * Enter runs (never while an IME is composing), Shift+Enter adds a line; ↑ and ↓ go through what was
 * typed; Ctrl+C stops what runs and drops the line, unless text is selected; Ctrl+L clears.
 * @param {KeyboardEvent} event
 */
function typing(event) {
  const area = /** @type {HTMLTextAreaElement} */ (event.target)
  if (event.isComposing || event.keyCode === 229) return
  // The key pressed, whatever the keyboard's alphabet.
  const letter = /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : event.code.replace(/^Key/, '').toLowerCase()
  const control = event.ctrlKey && !event.metaKey && !event.altKey
  const up = event.key === 'ArrowUp' && !area.value.slice(0, area.selectionStart).includes('\n')
  const down = event.key === 'ArrowDown' && !area.value.slice(area.selectionEnd).includes('\n')
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    const command = area.value
    area.value = ''
    if (command.trim()) run(command)
  } else if ((up && back > 0) || (down && back < typedBefore.length)) {
    event.preventDefault()
    if (back === typedBefore.length) draft = area.value
    back += up ? -1 : 1
    area.value = typedBefore[back] ?? draft
  } else if (control && letter === 'c' && area.selectionStart === area.selectionEnd) {
    event.preventDefault()
    stop()
    area.value = ''
  } else if (control && letter === 'l') {
    event.preventDefault()
    clear()
  }
}

/** Runs what the user typed on the conversation's computer, and tells the brain. @param {string} command */
async function run(command) {
  const conversation = app.current.peek()
  const terminal = terminalOf(conversation?.id)
  if (typedBefore.at(-1) !== command) typedBefore.push(command)
  back = typedBefore.length
  draft = ''
  following = true
  const running = new AbortController()
  /** @type {Entry} */
  const entry = { command, cwd: terminal.cwd, out: '', err: '', running }
  terminal.entries.push(entry)
  bump()
  /** A new site, asked about under the command; declined if it is stopped meanwhile. @param {string} site @returns {Promise<PermissionOption>} */
  const ask = (site) => new Promise((resolve) => {
    const answer = (/** @type {PermissionOption} */ option) => {
      entry.site = undefined
      bump()
      resolve(option)
    }
    entry.site = { site, resolve: answer }
    running.signal.addEventListener('abort', () => answer('reject_once'), { once: true })
    bump()
  })
  try {
    const done = await typed(command, { signal: running.signal, ask })
    Object.assign(entry, done.ok ? { out: done.stdout ?? '', err: done.stderr ?? '', exit: done.exit, refused: done.refused } : { err: String(done.error) })
    if (done.cwd) terminal.cwd = done.cwd
    if (conversation && done.ok) await tell(conversation, entry)
  } catch (error) {
    // Stopped, as terminals say it.
    entry.err = running.signal.aborted ? '^C' : error instanceof Error ? error.message : String(error)
  } finally {
    entry.running = undefined
    bump()
  }
}

/** The brain is told what the user ran, with their next message: a system note (D46). @param {{ path: string }} conversation @param {Entry} entry */
async function tell(conversation, entry) {
  const text = [`The user ran a command on your computer, in the terminal: ${entry.command}`, `Exit code: ${entry.exit}`,
    entry.out && clip(entry.out.replace(ESCAPES, ''), TOLD), entry.err && `stderr:\n${clip(entry.err.replace(ESCAPES, ''), TOLD)}`]
  const note = noteRecord(text.filter(Boolean).join('\n'), { kind: 'terminal', command: entry.command, exit: entry.exit ?? 0 })
  await appendRecords(app.fs, conversation.path, [note])
  const now = app.current.peek()
  if (now?.path === conversation.path) app.current.value = { ...now, records: [...now.records, note] }
}

define('app-terminal', Terminal)
dock.join(document.createElement('app-terminal'))
