// "What Jean knows about you" (docs/product.md), Settings' About you (D134, D521): a title, and a line on where it goes,
// or on what presses; the user's name, which no brain is sent; their instructions, which Jean always follows, read as
// text and changed with Save and Cancel; the organization's or a parent's as a row of their own; the newest lines Jean
// noticed, newest first, each with its menu (Edit, Make it an instruction, the task it came from, Delete), all of them on
// a page of their own, you/noticed, those a task no longer reads past a line; and a row for each project with its own,
// opening its page, you/<its ULID>. Everything here is a plain file (instructions.md, memory.md); Skills and Routines are
// their capabilities' own (D517, D509). Loaded the first time it is shown (D134), its strings a part of their own.
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { app, effective, notify, updateSettings, readBody, enterProject, openConversation } from './state.js'
import { loaded, unlock, isDenied } from './caps.js'
import { openSettings, setting, pageOpen } from './dialogs.js'
import { changeMemory, parseMemory, memoryText, oneLine } from '../core/memory.js'
import { stringifyFrontMatter } from '../core/settings.js'
import { dirname, join } from '../core/fs.js'
import { BRAND } from '../brand.js'
import { t, relativeTime, useStrings } from '../core/i18n.js'
import { icons } from './menu-icons.js'
import { styleSheet } from './sheet.js'

await Promise.all([useStrings('you'), styleSheet(new URL('knows.css', import.meta.url))])

/** @typedef {import('../core/memory.js').Entry} Entry */
/** A file of lines Jean noticed: the person's ('' for the root) or a project's. @typedef {{ dir: string, path: string, entries: Entry[] }} Kept */
/** @typedef {{ instructions: Record<string, string>, memory: Kept[] }} Page */

const page = signal(/** @type {Page | null} */ (null))
/** The instructions being written, where, and what the box starts with. */
const writing = signal(/** @type {{ dir: string, text: string } | null} */ (null))
/** The line being edited, by its menu's id. */
const editing = signal('')
/** What the page of lines is searched for. */
const query = signal('')

/** The projects but the home one, whose files are the person's, at the root. */
const projects = () => app.projects.value.filter((project) => project.data.default !== true)
/** The room's folder: '' at home, the project's in it. */
const room = () => (app.project.value.data.default === true ? '' : app.project.value.dir)

/** Reads the files again, the person's and every project's: each time the section is entered. */
export async function refresh() {
  const dirs = ['', ...projects().map((project) => project.dir)]
  const files = await Promise.all(dirs.map((dir) => Promise.all([readBody(join(dir, 'instructions.md')), app.fs.read(join(dir, 'memory.md'))])))
  page.value = { instructions: Object.fromEntries(dirs.map((dir, i) => [dir, files[i][0]])), memory: dirs.map((dir, i) => ({ dir, path: join(dir, 'memory.md'), entries: parseMemory(files[i][1]) })) }
}

/** @param {string} dir @param {string} text */
async function writeInstructions(dir, text) {
  await app.fs.write(join(dir, 'instructions.md'), stringifyFrontMatter({ format: 1, kind: 'instructions' }, text.trim() ? `${text.trim()}\n` : ''))
  await refresh()
}

/** @param {string} path @param {Entry} entry @param {(entries: Entry[]) => Entry[]} change */
async function changeEntry(path, entry, change) {
  await changeMemory(app.fs, path, change)
  await refresh()
}

/** Edits a line in place; emptied, it goes. @param {string} path @param {Entry} entry @param {string} value */
function edit(path, entry, value) {
  const text = oneLine(value)
  return changeEntry(path, entry, (entries) => entries.flatMap((other) => (other !== entries.find((e) => e.at === entry.at && e.text === entry.text) ? [other]
    : text ? [{ ...other, text, by: app.deviceId }] : [])))
}

/** @param {string} path @param {Entry} entry */
const forget = (path, entry) => changeEntry(path, entry, (entries) => entries.filter((other) => !(other.at === entry.at && other.text === entry.text)))

/** A noticed line becomes a standing instruction, where it was kept. @param {string} path @param {Entry} entry */
async function promote(path, entry) {
  const dir = dirname(path)
  const current = page.value?.instructions[dir] ?? ''
  await writeInstructions(dir, current ? `${current}\n${entry.text}` : entry.text)
  await forget(path, entry)
  notify(t('knows.promoted'))
}

/** Opens the conversation a line came from, in its project. @param {string} path */
async function openFrom(path) {
  const project = app.projects.value.find((candidate) => path.startsWith(`${candidate.dir}/`))
  if (!project) return
  await enterProject(project)
  await openConversation(path)
}

/** A routine's page in Settings (D509), from one of its runs or its flow: routines/<its file's ULID>. @param {string} path */
export const showRoutine = (path) => openSettings(`routines/${path.split('/').at(-1)?.replace(/\.md$/, '')}`)

// ─── The section and its pages ───────────────────────────────────────────────

// The page open (pageOpen()): '' for the section, 'noticed', 'organization', or a project's ULID.

/** Opens the section ('') or a page, the keyboard on its title, or back on the row it came from. @param {string} to */
function go(to) {
  const from = pageOpen()
  ;[app.section.value, query.value, editing.value, writing.value] = [to ? `you/${to}` : 'you', '', '', null]
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '.you-head h2' : `[data-row="${from}"]`))?.focus())
}

/** Puts the caret at the end of a field, the keyboard in it. @param {HTMLInputElement | HTMLTextAreaElement | null} field */
const focusEnd = (field) => { field?.focus(); field?.setSelectionRange(field.value.length, field.value.length) }
/** Whose a file is: the person's, everywhere, or a project's. @param {string} dir */
const scope = (dir) => (dir ? t('knows.forProject', { project: String(app.projects.value.find((project) => project.dir === dir)?.data.name) }) : t('knows.forYou'))
/** A file's lines, the newest first. @param {Kept} file */
const newest = (file) => [...file.entries].reverse()
/** The lines Jean noticed, in all. @param {Page} state */
const total = (state) => state.memory.reduce((sum, file) => sum + file.entries.length, 0)
/** The organization's instructions; in a child's profile they hold what the brain is told of the child, which Set by a parent says in their words (D389). */
const organization = () => (app.policy.child ? '' : String(app.policy.instructions ?? ''))

/** The lines a task no longer reads: the room's oldest, past what fits (memoryText, caps/memory/memory.js). @param {Page} state */
function unread(state) {
  if (!loaded.value.has('memory') || effective.value.settings.memory === false) return new Set()
  const flat = state.memory.filter(({ dir }) => !dir || dir === room()).flatMap(({ entries }) => entries)
  return new Set(flat.slice(0, flat.length - memoryText(flat).split('\n').filter(Boolean).length))
}

/** A row that opens a page, or another section. @param {string} id @param {unknown} icon @param {string} title @param {string} text @param {() => void} open */
const row = (id, icon, title, text, open) => html`<li><button class="item" data-row=${id} @click=${open}><span class="item-icon">${icon}</span>
  <span class="item-text"><strong dir="auto">${title}</strong>${text ? html`<small dir="auto">${text}</small>` : nothing}</span>${icons.chevron}</button></li>`

/** One of a line's actions, which closes its menu. @param {string} menu @param {unknown} icon @param {string} label @param {() => unknown} act */
const action = (menu, icon, label, act) => html`<button type="button" popovertarget=${menu} popovertargetaction="hide" @click=${act}>${icon}${label}</button>`

/**
 * A line Jean noticed: its words, when and the task it came from, and its menu; a field while it is edited, saved as
 * it is left or with Enter, Escape taking it back. @param {Kept} file @param {Entry} entry @param {Set<Entry>} old @param {string} id
 */
function line(file, entry, old, id) {
  const task = app.conversations.value.find((one) => one.path === entry.conversation)?.title
  if (editing.value === id) return html`<li><input class="you-edit" dir="auto" aria-label=${t('knows.edit')} .value=${entry.text}
    @keydown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && !e.isComposing) /** @type {HTMLInputElement} */ (e.target).blur(); if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); editing.value = '' } }}
    @blur=${(/** @type {FocusEvent} */ e) => { if (editing.value === id) { editing.value = ''; edit(file.path, entry, /** @type {HTMLInputElement} */ (e.target).value) } }}></li>`
  return html`<li class=${old.has(entry) ? 'is-old' : ''}>
    <span class="item-text"><span dir="auto">${entry.text}</span><small>${entry.at ? relativeTime(entry.at) : nothing}${task ? html` · <bdi>${task}</bdi>` : nothing}</small></span>
    <button class="icon-button subtle" popovertarget=${id} aria-label=${t('you.more')}>${icons.more}</button>
    <div id=${id} class="menu task-menu" popover>
      ${action(id, icons.compose, t('you.edit'), () => { editing.value = id; requestAnimationFrame(() => focusEnd(document.querySelector('.you-edit'))) })}
      ${action(id, icons.pin, t('knows.promote'), () => promote(file.path, entry))}
      ${entry.conversation ? action(id, icons.external, t('knows.from'), () => openFrom(/** @type {string} */ (entry.conversation))) : nothing}
      ${action(id, icons.trash, t('action.delete'), () => forget(file.path, entry))}
    </div>
  </li>`
}

/**
 * Starters, which add their words on a line of their own to the box open, or open it with them after what is written.
 * @param {string} dir
 */
const starters = (dir) => html`<div class="you-starts">${['work', 'language', 'length'].map((id) => html`<button type="button" class="starter" @click=${(/** @type {Event} */ e) => {
  const [box, words] = [/** @type {HTMLTextAreaElement | undefined} */ (/** @type {HTMLElement} */ (e.currentTarget).closest('form')?.elements.namedItem('text')), t(`you.start.${id}Text`)]
  if (!box) return write(dir, words)
  box.value = box.value.trim() ? `${box.value.trimEnd()}\n${words}` : words
  focusEnd(box)
}}>${icons.plus} ${t(`you.start.${id}`)}</button>`)}</div>`

/** Opens the box on a folder's instructions, with words of a starter's after them. @param {string} dir @param {string} [words] */
function write(dir, words = '') {
  writing.value = { dir, text: [page.value?.instructions[dir], words].filter(Boolean).join('\n') }
  requestAnimationFrame(() => focusEnd(document.querySelector('.you-write textarea')))
}

/** A folder's instructions ('' for the person's): read as text with Edit, or the box with starters, Save and Cancel. @param {string} dir */
function instructions(dir) {
  const [text, open] = [page.value?.instructions[dir] ?? '', writing.value?.dir === dir]
  return html`<section>
    <div class="you-group"><h3>${icons.pin} ${t('knows.instructions')}</h3>${open ? nothing : html`<button class="button subtle" @click=${() => write(dir)}>${icons.compose} ${t('you.edit')}</button>`}</div>
    ${open ? html`<form class="you-write" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); writing.value = null; writeInstructions(dir, String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get('text') ?? '')) }}>
      <textarea name="text" rows="5" dir="auto" aria-label=${t('knows.instructions')} placeholder=${t('knows.instructionsPlaceholder')} .value=${writing.value?.text ?? ''}></textarea>
      ${starters(dir)}
      <div class="you-acts"><button class="button primary">${t('projects.save')}</button><button type="button" class="button subtle" @click=${() => { writing.value = null }}>${t('you.cancel')}</button></div>
    </form>` : text ? html`<p class="you-text" dir="auto">${text}</p>` : html`<p class="muted">${t('you.empty', { name: BRAND.name })}</p>${starters(dir)}`}
  </section>`
}

/** What Jean noticed: memory to turn on; or its switch, the newest three of the person's lines and a row to all of them. @param {Page} state @param {Set<Entry>} old */
function noticed(state, old) {
  const head = html`${icons.note} ${t('knows.noticed', { name: BRAND.name })}`
  if (!loaded.value.has('memory')) return setting(head, t('cap.memory.text', { name: BRAND.name }),
    isDenied('memory') ? nothing : html`<button class="button" @click=${() => unlock('memory').then(refresh)}>${t('cap.memory.yes')}</button>`)
  const [own, all] = [state.memory[0], total(state)]
  const lines = newest(own).slice(0, 3).map((entry, i) => line(own, entry, old, `you-line-${i}`))
  return html`<section>
    <div class="you-group"><h3>${head}</h3><label class="you-switch">${t('you.remember')}<input type="checkbox" class="switch" role="switch" .checked=${effective.value.settings.memory !== false}
      @change=${(/** @type {Event} */ e) => updateSettings({ memory: /** @type {HTMLInputElement} */ (e.target).checked })}></label></div>
    ${all ? html`<ul class="list noticed">${lines}${all > lines.length ? row('noticed', icons.list, t('you.all', { count: all }), '', () => go('noticed')) : nothing}</ul>` : html`<p class="muted small">${t('knows.nothing')}</p>`}
  </section>`
}

/** A page's head: Back to the section, its title and its line. @param {string} title @param {string} said */
const head = (title, said) => html`<button class="back button subtle" @click=${() => go('')}>${icons.back} ${t('settings.you')}</button>
  <header class="you-head"><div><h2 tabindex="-1" dir="auto">${title}</h2><p class="lede">${said}</p></div></header>`

/** Every line Jean noticed, by whose, searched, those a task no longer reads under a line of their own. @param {Page} state @param {Set<Entry>} old */
const lines = (state, old) => html`${head(t('knows.noticed', { name: BRAND.name }), t('you.lines', { count: total(state) }))}
  ${old.size ? html`<p class="you-wait">${t('you.cut', { count: old.size })}</p>` : nothing}
  <input type="search" class="you-search" dir="auto" placeholder=${t('you.search', { name: BRAND.name })} aria-label=${t('you.search', { name: BRAND.name })}
    @input=${(/** @type {Event} */ e) => { query.value = /** @type {HTMLInputElement} */ (e.target).value }}>
  ${state.memory.map((file, f) => {
    const shown = newest(file).filter((entry) => entry.text.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()))
    return shown.length ? html`<section><h3>${scope(file.dir)}</h3><ul class="list noticed">${shown.map((entry, i) => html`${old.has(entry) && !old.has(shown[i - 1])
      ? html`<li class="you-cut">${t('you.unread')}</li>` : nothing}${line(file, entry, old, `you-line-${f}-${i}`)}`)}</ul></section>` : nothing
  })}`

/** The line under the title: the lines a task no longer reads, nothing known yet, or where it all goes. @param {Page} state @param {Set<Entry>} old */
const said = (state, old) => (old.size ? t('you.cut', { count: old.size }) : !state.instructions[''] && !state.memory[0].entries.length ? t('you.none') : t('you.line', { name: BRAND.name }))

/** Settings' About you, or one of its pages: all the lines, a project's (its instructions and its lines), the organization's instructions. */
export function you() {
  const state = page.value
  if (!state) return nothing
  const [open, old] = [pageOpen(), unread(state)]
  const theirs = projects().find((one) => one.id === open)
  const kept = (/** @type {string} */ dir) => /** @type {Kept} */ (state.memory.find((file) => file.dir === dir))
  if (open === 'noticed') return lines(state, old)
  if (theirs) return html`${head(String(theirs.data.name), t('you.project'))}${instructions(theirs.dir)}${kept(theirs.dir).entries.length ? html`<section>
    <h3>${icons.note} ${t('knows.noticed', { name: BRAND.name })}</h3><ul class="list noticed">${newest(kept(theirs.dir)).map((entry, i) => line(kept(theirs.dir), entry, old, `you-line-p${i}`))}</ul></section>` : nothing}`
  if (open === 'organization' && organization()) return html`${head(t('you.org'), t('policy.locked'))}<p class="you-text" dir="auto">${organization()}</p>`
  // A project with its own shows, and the one open, to begin its own; a parent's or an organization's above.
  const own = projects().filter((one) => one.dir === room() || state.instructions[one.dir] || kept(one.dir).entries.length)
  const above = [app.policy.child && row('parent', icons.shield, t('policy.parent'), '', () => { app.section.value = 'parent' }),
    organization() && row('organization', icons.badge, t('you.org'), t('policy.locked'), () => go('organization'))].filter(Boolean)
  // Emptied, the name stays empty: Jean notes one only while the user has never set one (D150).
  return html`<header class="you-head"><h2>${t('settings.you')}</h2></header><p class="lede">${said(state, old)}</p>
    ${setting(t('you.name'), t('you.nameText', { name: BRAND.name }), html`<input class="you-name" autocomplete="given-name" dir="auto" maxlength="40" spellcheck="false"
      aria-label=${t('you.name')} .value=${live(effective.value.settings.name ?? '')} @change=${(/** @type {Event} */ e) => updateSettings({ name: oneLine(/** @type {HTMLInputElement} */ (e.target).value) })}>`)}
    ${above.length ? html`<ul class="list you-rows">${above}</ul>` : nothing}
    ${instructions('')}${noticed(state, old)}
    ${own.length ? html`<section><ul class="list you-rows">${own.map((one) => row(one.id, icons.folder, String(one.data.name),
      state.instructions[one.dir]?.split('\n')[0] || t('you.lines', { count: kept(one.dir).entries.length }), () => go(one.id)))}</ul></section>` : nothing}`
}
