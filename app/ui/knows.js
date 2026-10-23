// "What Jean knows about you" (docs/product.md), Settings' About you: the user's instructions,
// which Jean always follows, and what Jean noticed, which the user can edit, delete or turn into
// an instruction; Skills and Routines are their capabilities' own (caps/skills/page.js, D517; caps/routines/page.js,
// D509). Everything here is a plain file (instructions.md, memory.md). Loaded the first time it is shown (D134).
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { app, effective, notify, updateSettings, readBody, enterProject, openConversation } from './state.js'
import { loaded, unlock, isDenied } from './caps.js'
import { openSettings, setting, lockedBy } from './dialogs.js'
import { changeMemory, parseMemory, oneLine } from '../core/memory.js'
import { stringifyFrontMatter } from '../core/settings.js'
import { dirname, join } from '../core/fs.js'
import { BRAND } from '../brand.js'
import { t, relativeTime, locale } from '../core/i18n.js'
import { icons } from './menu-icons.js'

/** @typedef {import('../core/memory.js').Entry} Entry */
/** @typedef {{ instructions: Record<string, string>, memory: { path: string, entries: Entry[] }[] }} Page */

const page = signal(/** @type {Page | null} */ (null))

/** Where the room's files are: the person's at the root, the project's in its folder. */
function folders() {
  const { dir, data } = app.project.value
  return data.default === true ? [''] : ['', dir]
}

/** Reads the files again: each time the section is entered. */
export async function refresh() {
  const dirs = folders()
  page.value = {
    instructions: Object.fromEntries(await Promise.all(dirs.map(async (dir) => [dir, await readBody(join(dir, 'instructions.md'))]))),
    memory: await Promise.all(dirs.map(async (dir) => ({ path: join(dir, 'memory.md'), entries: parseMemory(await app.fs.read(join(dir, 'memory.md'))) }))),
  }
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

// ─── The section ─────────────────────────────────────────────────────────────

/** Whose a file is, when there are two (in a project): the person's, everywhere, or the project's. @param {string} dir */
const scope = (dir) => (dir ? t('knows.forProject', { project: String(app.project.value.data.name) }) : t('knows.forYou'))

/** Settings' About you: the instructions, then what Jean noticed, or memory to turn on. */
export function you() {
  const state = page.value
  if (!state) return nothing
  const both = folders().length > 1
  const noticed = html`${icons.note} ${t('knows.noticed', { name: BRAND.name })}`
  // Emptied, the name stays empty: Jean notes one only while the user has never set it (D150).
  return html`<p class="lede">${t('knows.lede', { name: BRAND.name })}</p>
    ${setting(t('you.name'), null, html`<input class="you-name" autocomplete="given-name" dir="auto" maxlength="40" spellcheck="false"
      aria-label=${t('you.name')} .value=${live(effective.value.settings.name ?? '')}
      @change=${(/** @type {Event} */ e) => updateSettings({ name: oneLine(/** @type {HTMLInputElement} */ (e.target).value) })}>`)}
    <section>
      <h3>${icons.pin} ${t('knows.instructions')}</h3>
      <p class="muted small">${t('knows.instructionsText', { name: BRAND.name })}</p>
      ${app.policy.instructions ? html`<p class="locked" dir="auto">${app.policy.instructions}</p><p class="muted small">${lockedBy()}</p>` : nothing}
      ${Object.entries(state.instructions).map(([dir, text]) => html`<label>${both ? scope(dir) : nothing}
        <textarea rows="3" dir="auto" aria-label=${both ? nothing : t('knows.instructions')} placeholder=${t('knows.instructionsPlaceholder')} .value=${live(text)}
          @change=${(/** @type {Event} */ e) => writeInstructions(dir, /** @type {HTMLTextAreaElement} */ (e.target).value).then(() => notify(t('knows.saved')))}></textarea>
      </label>`)}
    </section>
    ${!loaded.value.has('memory') ? setting(noticed, t('cap.memory.text', { name: BRAND.name }),
      isDenied('memory') ? nothing : html`<button class="button" @click=${() => unlock('memory').then(refresh)}>${t('cap.memory.yes')}</button>`) : html`
      <section>
        <div class="setting">
          <div><h3>${noticed}</h3><p class="muted">${t('knows.memoryOn', { name: BRAND.name })}</p></div>
          <input type="checkbox" class="switch" role="switch" aria-label=${t('knows.memoryOn', { name: BRAND.name })} .checked=${effective.value.settings.memory !== false}
            @change=${(/** @type {Event} */ e) => updateSettings({ memory: /** @type {HTMLInputElement} */ (e.target).checked })}>
        </div>
        ${state.memory.map(({ path, entries }) => html`${both ? html`<h4>${scope(dirname(path))}</h4>` : nothing}
          ${entries.length ? html`<ul class="list noticed">${entries.map((entry) => html`<li>
            <textarea class="noticed-text" rows="1" dir="auto" aria-label=${t('knows.edit')} .value=${live(entry.text)}
              @change=${(/** @type {Event} */ e) => edit(path, entry, /** @type {HTMLTextAreaElement} */ (e.target).value)}></textarea>
            <span class="noticed-actions">
              ${entry.conversation ? html`<button class="link-button small" title=${t('knows.from')}
                @click=${() => openFrom(/** @type {string} */ (entry.conversation))}>${entry.at ? relativeTime(entry.at) : t('knows.from')}</button>` : nothing}
              <button class="icon-button subtle" aria-label=${t('knows.promote')} @click=${() => promote(path, entry)}>${icons.pin}</button>
              <button class="icon-button subtle" aria-label=${t('action.delete')} @click=${() => forget(path, entry)}>${icons.trash}</button>
            </span>
          </li>`)}</ul>` : html`<p class="muted small">${t('knows.nothing')}</p>`}`)}
        <p class="hint">${t('knows.cloud', { name: BRAND.name })}</p>
      </section>`}`
}
