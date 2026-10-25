// Settings' Computer (D176, D534): its title with the terminal, one line on what the computer is, then rows that open
// pages at their own addresses (D509): the Sandbox, and This computer once found (D248), under Where commands run;
// what it may reach, the internet changed in place and its sites; what it keeps, the project's workspace; then its
// limits and where packages come from. Approvals' Using the internet is the most it may do (D533). Loaded the first
// time the section shows.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app, SHORTCUTS } from '../../ui/state.js'
import { loaded } from '../../ui/caps.js'
import { sectionOpen, pageOpen, lockedBy, siteList } from '../../ui/dialogs.js'
import { setSecret, deleteSecret } from '../../ui/secrets.js'
import { memoryTotal } from '../../ui/host.js'
import { styleSheet } from '../../ui/sheet.js'
import { icons } from '../../ui/menu-icons.js'
import { serviceURL } from '../../core/settings.js'
import { join, walk } from '../../core/fs.js'
import { t, tParts, intlLocales, formatBytes, relativeTime } from '../../core/i18n.js'
import { REGISTRIES } from './net.js'
import { box, rightsNow, setComputer, restart, terminal, open, workspace, light, keys, ENGINES } from './computer.js'

await Promise.all([styleSheet(new URL('../../ui/data-pages.css', import.meta.url)), styleSheet(new URL('page.css', import.meta.url))])

/** This computer, once found (D198): its row and page. */
const machine = signal(/** @type {typeof import('../machine/machine.js') | null} */ (null))
/** The project's workspace, file by file, newest first; null until measured. */
const files = signal(/** @type {Array<{ path: string, size: number, at: number }> | null} */ (null))
/** Empty it, asked in place. */
const emptying = signal(false)

// The page open (pageOpen()): sandbox, machine, sites, workspace or limits; '' for the list.

/** Opens the list ('') or a page, the keyboard on its title, or back on the list on the row it came from. @param {string} to */
function go(to) {
  const from = pageOpen()
  app.section.value = to ? `computer/${to}` : 'computer'
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '.data-head h2' : `[data-page="${from}"]`))?.focus())
}

/** The project's workspace, measured as the section opens and as the computer comes back from a run. */
async function measure() {
  const fs = workspace()
  const found = await Promise.all((await walk(fs)).map(async (path) => {
    const stat = await fs.stat?.(path)
    return { path, size: stat?.size ?? 0, at: stat?.lastModified ?? 0 }
  }))
  files.value = found.sort((a, b) => b.at - a.at)
}

async function empty() {
  await app.fs.remove(join(app.projectDir, 'workspace'))
  emptying.value = false
  restart()
  await measure()
}

// ─── The Sandbox ─────────────────────────────────────────────────────────────

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
 * This device's memory, in bytes (D176): exactly, as the system tells the desktop app; otherwise at
 * least what Chromium's `deviceMemory` says (GiB rounded down to a power of two, at most 32); or 0, unknown.
 */
const deviceMemory = signal({ bytes: (/** @type {any} */ (navigator).deviceMemory ?? 0) * 2 ** 30, exact: false })
memoryTotal().then((bytes) => { if (bytes) deviceMemory.value = { bytes, exact: true } }, () => {})

/** Memory as systems count it, by 1,024, never less than a megabyte. @param {number} bytes */
function amount(bytes) {
  const mb = bytes / 1024 / 1024
  const [unit, size] = mb >= 1024 ? ['gigabyte', mb / 1024] : ['megabyte', mb]
  return new Intl.NumberFormat(intlLocales(), { style: 'unit', unit, maximumFractionDigits: size && size < 1 ? 2 : 1 }).format(size)
}

/** A figure's amount, set off from the words around it. @param {string} text */
const strong = (text) => html`<strong>${text}</strong>`

/** What files take up: in bytes under a kilobyte, where formatBytes() says 0 kB. @param {number} bytes */
const sized = (bytes) => (bytes < 1e3 ? new Intl.NumberFormat(intlLocales(), { style: 'unit', unit: 'byte', unitDisplay: 'long' }).format(bytes) : formatBytes(bytes))

/** How the computer stands, in a word, with its light. @param {string} state */
const standing = (state) => html`<span class="data-state">${light(state)} ${t(`computer.state.${state}`)}</span>`

/**
 * The Sandbox's page (D176, D249): how it stands, and in one sentence the core it computes on and the memory it holds of
 * this device's, since neither limit is ever neared; then what it runs, each asleep or ready, with Try, which opens the terminal.
 */
function sandboxPage() {
  const { state, engines, computing, memory } = box.status.value
  const { bytes: total, exact } = deviceMemory.value
  const cores = tParts('computer.cores', { count: navigator.hardwareConcurrency || 1, used: strong(new Intl.NumberFormat(intlLocales()).format(computing ? 1 : 0)) })
  const held = total ? tParts(exact ? 'computer.of' : 'computer.of.least', { used: strong(amount(memory)), total: amount(total) }) : strong(amount(memory))
  return html`<p class="computer-now"><span role="status">${standing(state)}</span><span>${tParts('computer.using', { cores, memory: held })}</span></p>
    <section><h3>${t('computer.engines')}</h3>
      <ul class="list engines">${ENGINES.map(([id, mark, line]) => html`<li>
        <span class="item-icon" aria-hidden="true">${mark}</span>
        <span class="item-text"><span id=${`engine-${id}`}>${t(`computer.engine.${id}`)}</span><small>${t(`computer.engine.${id}.text`, { size: formatBytes(14e6) })}</small></span>
        ${standing(engines[id] ?? 'asleep')}
        <button class="button subtle" aria-describedby=${`engine-${id}`} @click=${() => terminal(line)}>${t('computer.try')}</button>
      </li>`)}</ul>
      <p class="hint">${tParts('computer.terminal.text', { keys })}</p></section>`
}

// ─── What it may reach ───────────────────────────────────────────────────────

/** Off, Ask first or Any site, one checked, those not to be had disabled. @param {string} current @param {string[]} out */
const choice = (current, out) => html`<span class="segmented" role="radiogroup" aria-labelledby="computer-internet">
  ${['off', 'ask', 'any'].map((option) => html`<label><input type="radio" name="internet" .checked=${current === option} ?disabled=${out.includes(option)}
    @change=${() => setComputer({ internet: /** @type {any} */ (option) })}><span>${t(`computer.internet.${option}`)}</span></label>`)}
</span>`

/** The sites it reaches without asking, the first two by name, each isolated from the language around it. @param {string[]} sites */
function named(sites) {
  if (!sites.length) return t('computer.sites.none')
  const shown = sites.length > 3 ? [...sites.slice(0, 2), t('computer.sites.more', { count: sites.length - 2 })] : sites
  return new Intl.ListFormat(intlLocales(), { type: 'conjunction' }).formatToParts(shown).map((part) => (part.type === 'element' ? html`<bdi>${part.value}</bdi>` : part.value))
}

// ─── Limits and package sources ──────────────────────────────────────────────

/** The longest a command may run, the relay, and where packages come from: each the user's, or the organization's, locked. */
function limitsPage() {
  const { rights, locked } = rightsNow()
  const lock = html`<small>${icons.lock} ${lockedBy()}</small>`
  return html`<ul class="list general">
      <li><span class="item-text"><strong id="computer-time">${t('computer.time')}</strong>${locked.has('timeMs') ? lock : html`<small>${t('computer.time.text')}</small>`}</span>
        <select aria-labelledby="computer-time" ?disabled=${locked.has('timeMs')} @change=${(/** @type {Event} */ e) => setComputer({ timeMs: Number(/** @type {HTMLSelectElement} */ (e.target).value) })}>
          ${[60_000, 120_000, 300_000, 600_000].map((ms) => html`<option value=${ms} ?selected=${rights.timeMs === ms}>${t('computer.minutes', { count: ms / 60_000 })}</option>`)}
        </select></li>
      <li><span class="item-text"><strong id="computer-relay">${t('computer.relay')}</strong>${locked.has('relay') ? lock : html`<small>${t('computer.relay.text')}</small>`}</span>
        <input dir="ltr" type="url" spellcheck="false" placeholder="https://…?url={url}" aria-labelledby="computer-relay" .value=${rights.relay}
          ?disabled=${locked.has('relay')} @change=${(/** @type {Event} */ e) => setComputer({ relay: /** @type {HTMLInputElement} */ (e.target).value.trim() })}></li>
    </ul>
    <section><h3>${t('computer.registries')}</h3><p class="muted">${t('computer.registries.text')}</p>
      ${REGISTRIES.map((kind) => html`<div class="stack">
        <label>${t(`computer.registry.${kind}`)}<input dir="ltr" type="url" spellcheck="false" .value=${app.settings.value.computer?.registries?.[kind] ?? ''}
          placeholder=${serviceURL(kind, app.settings.value, app.policy)} ?disabled=${locked.has(`registries.${kind}`)}
          @change=${(/** @type {Event} */ e) => setComputer({ registries: { ...app.settings.value.computer?.registries, [kind]: /** @type {HTMLInputElement} */ (e.target).value.trim() } })}></label>
        <label>${t('computer.registry.key')}<input type="password" autocomplete="off" spellcheck="false" dir="ltr" placeholder="••••"
          @change=${async (/** @type {Event} */ e) => { const value = /** @type {HTMLInputElement} */ (e.target).value.trim(); await (value ? setSecret(app.fs, `computer-${kind}`, value) : deleteSecret(app.fs, `computer-${kind}`)) }}></label>
      </div>`)}</section>`
}

// ─── The list and the pages ──────────────────────────────────────────────────

/** A row that opens its page: its picture or icon, its name, its line, how it stands. @param {string} page @param {unknown} icon @param {string} name @param {unknown} line @param {unknown} [end] */
const row = (page, icon, name, line, end = nothing) => html`<li><button class="item" data-page=${page} @click=${() => go(page)}>${icon}
  <span class="item-text"><strong>${name}</strong>${line ? html`<small dir="auto">${line}</small>` : nothing}</span>${end}${icons.chevron}</button></li>`

/** A computer's picture in its row, lit as it stands. @param {unknown} art @param {string} state */
const picture = (art, state) => html`<span class="item-icon computer-art" aria-hidden="true" data-state=${state}>${art}</span>`

/** The section: the computers, what the computer may reach, what it keeps, then its limits. */
function list() {
  const { rights, locked, rule } = rightsNow()
  const { state } = box.status.value
  const there = loaded.value.has('machine') ? machine.value : null
  const kept = files.value
  const size = kept?.reduce((sum, file) => sum + file.size, 0) ?? 0
  const set = ['timeMs', 'relay', ...REGISTRIES.map((kind) => `registries.${kind}`)].some((key) => locked.has(key))
  const why = rule === 'never' ? t('computer.internet.never') : locked.has('internet') || locked.has('any') ? html`${icons.lock} ${lockedBy()}` : t('computer.internet.text')
  const mine = there?.about(t('computer.state.ready'))
  return html`<header class="data-head"><div><h2>${t('cap.computer.name')}</h2></div>
      <button class="button" aria-keyshortcuts=${SHORTCUTS.terminal} @click=${() => terminal()}>${icons.terminal} ${t('computer.terminal')} ${keys}</button></header>
    <p class="lede">${there ? there.lede() : t('computer.lede')}</p>
    <section>${there ? html`<h3>${t('computer.where')}</h3>` : nothing}<ul class="list data-rows">
      ${row('sandbox', picture(SANDBOX, state), t('computer.sandbox'), t('computer.sandbox.text'), standing(state))}
      ${there && mine ? row('machine', picture(there.LAPTOP, mine.light), t('cap.machine.name'), mine.line, html`<span class="data-state">${light(mine.light)} ${mine.state}</span>`) : nothing}
    </ul></section>
    <section><h3>${t('computer.reach')}</h3><ul class="list general data-rows">
      <li class="computer-internet"><span class="item-icon">${icons.globe}</span><span class="item-text"><strong id="computer-internet">${t('computer.internet')}</strong><small>${why}</small></span>
        ${choice(rights.internet, rule === 'never' || locked.has('internet') ? ['off', 'ask', 'any'] : locked.has('any') ? ['any'] : [])}</li>
      ${row('sites', html`<span class="item-icon">${icons.check}</span>`, t('computer.sites'), named(rights.sites), rights.sites.length ? html`<span class="data-state">${rights.sites.length}</span>` : nothing)}
    </ul></section>
    <section><h3>${t('computer.keeps')}</h3><ul class="list data-rows">
      ${row('workspace', html`<span class="item-icon">${icons.folder}</span>`, t('computer.workspace'), kept === null ? '' : kept.length ? t('computer.workspace.files', { count: kept.length, size: sized(size) }) : t('computer.workspace.none'))}
    </ul></section>
    <ul class="list data-rows">${row('limits', html`<span class="item-icon">${icons.gear}</span>`, t('computer.limits'), set ? lockedBy() : t('computer.limits.line', { time: t('computer.minutes', { count: rights.timeMs / 60_000 }) }))}</ul>`
}

/**
 * Each page: its title, its line, what it does most at its head, what it holds; This computer's only while open, as
 * drawing it makes the line's key. @param {string} shown @returns {Record<string, { title: string, lede: unknown, end?: unknown, draw: () => unknown }>}
 */
function pages(shown) {
  const { state } = box.status.value
  const { rights, locked } = rightsNow()
  const kept = files.value ?? []
  const there = shown === 'machine' && loaded.value.has('machine') ? machine.value?.page() : null
  return {
    sandbox: { title: t('computer.sandbox'), lede: t('computer.text'), draw: sandboxPage,
      end: state === 'asleep' ? nothing : html`<button class="button subtle" @click=${restart}>${icons.retry} ${t('computer.restart')}</button>` },
    ...(there && { machine: { title: t('cap.machine.name'), ...there } }),
    sites: { title: t('computer.sites'), lede: t('computer.internet.text'),
      draw: () => siteList({ sites: rights.sites, fixed: locked.has('sites'), set: (sites) => setComputer({ sites }) }) },
    workspace: { title: t('computer.workspace'), lede: t('computer.workspace.text'),
      end: html`<button class="button subtle danger" ?disabled=${!kept.length || emptying.value} @click=${() => { emptying.value = true }}>${icons.trash} ${t('computer.workspace.empty')}</button>`,
      draw: () => html`${emptying.value ? html`<div class="computer-ask" role="alert"><p>${t('computer.workspace.confirm')} ${t('computer.workspace.kept')}</p>
          <button class="button subtle" @click=${() => { emptying.value = false }}>${t('computer.keep')}</button>
          <button class="button danger" @click=${empty}>${icons.trash} ${t('computer.workspace.empty')}</button></div>` : nothing}
        <div class="filled"><meter value=${kept.reduce((sum, file) => sum + file.size, 0) / (rights.workspaceMB * 1e6)} aria-label=${t('computer.workspace')}></meter>
          <span>${tParts('computer.of', { used: strong(sized(kept.reduce((sum, file) => sum + file.size, 0))), total: formatBytes(rights.workspaceMB * 1e6) })}</span></div>
        ${kept.length ? html`<ul class="list computer-files">${kept.map((file, i) => html`<li><span class="item-icon">${icons.file}</span>
          <span class="item-text"><bdi id=${`computer-file-${i}`}>${file.path}</bdi><small>${t('computer.file', { size: sized(file.size), when: relativeTime(file.at) })}</small></span>
          <button class="button subtle" aria-describedby=${`computer-file-${i}`} @click=${() => open(file.path)}>${t('computer.open')}</button></li>`)}</ul>`
          : html`<p class="muted">${t('computer.workspace.none')}</p>`}` },
    limits: { title: t('computer.limits'), lede: t('computer.limits.text'), draw: limitsPage },
  }
}

/** Settings' Computer: the list, or the page open, under Back and its title, a computer's with its picture. */
export function section() {
  const shown = pageOpen()
  const page = pages(shown)[shown]
  if (!page) return list()
  const art = shown === 'sandbox' ? picture(SANDBOX, box.status.value.state) : shown === 'machine' ? picture(machine.value?.LAPTOP, machine.value?.about('').light ?? 'asleep') : nothing
  return html`<button class="back button subtle" @click=${() => go('')}>${icons.back} ${t('cap.computer.name')}</button>
    <header class="data-head computer-head">${art}<div><h2 tabindex="-1">${page.title}</h2>${page.lede ? html`<p class="lede">${page.lede}</p>` : nothing}</div>${page.end ?? nothing}</header>${page.draw()}`
}

// Last, as the module is read: This computer's module once it is on; the workspace measured as the section opens (an
// address may name one of its pages), for another project, and as the computer comes back from a run.
effect(() => { if (loaded.value.has('machine') && !machine.value) import('../machine/machine.js').then((module) => { machine.value = module }) })
let inside = ''
effect(() => {
  const now = app.dialog.value === 'settings' && sectionOpen() === 'computer' ? app.project.value.dir : ''
  if (now && now !== inside) measure().catch(() => {})
  inside = now
})
effect(() => { if (box.status.value.state === 'ready' && files.peek() !== null) measure().catch(() => {}) })
