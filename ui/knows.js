// "What Jean knows about you" (docs/product.md): the user's instructions, which Jean always
// follows, and what Jean noticed, which the user can edit, delete or turn into an instruction;
// then the routines. Everything here is a plain file (instructions.md, memory.md, SKILL.md).
// Loaded the first time the page opens.
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, effective, notify, updateSettings, readBody, enterProject, openConversation } from './state.js'
import { loaded, unlock, isDenied } from './caps.js'
import { syncDialog, closed, close, backdrop, head } from './dialogs.js'
import { changeMemory, parseMemory, oneLine } from '../core/memory.js'
import { listSkills, parseSkill, saveSkill } from '../core/skills.js'
import { stringifyFrontMatter } from '../core/settings.js'
import { dirname, join } from '../core/fs.js'
import { BRAND } from '../brand.js'
import { t, relativeTime } from '../core/i18n.js'
import { icons } from './icons.js'

/** @typedef {import('../core/memory.js').Entry} Entry */
/** @typedef {{ instructions: Record<string, string>, memory: { path: string, entries: Entry[] }[], skills: import('../core/skills.js').Skill[] }} Page */

const page = signal(/** @type {Page | null} */ (null))

/** Where the room's files are: the person's at the root, the project's in its folder. */
function folders() {
  const { dir, data } = app.project.value
  return data.default === true ? [''] : ['', dir]
}

async function load() {
  const dirs = folders()
  page.value = {
    instructions: Object.fromEntries(await Promise.all(dirs.map(async (dir) => [dir, await readBody(join(dir, 'instructions.md'))]))),
    memory: await Promise.all(dirs.map(async (dir) => ({ path: join(dir, 'memory.md'), entries: parseMemory(await app.fs.read(join(dir, 'memory.md'))) }))),
    skills: loaded.value.has('routines') ? await listSkills(app.fs, dirs) : [],
  }
}

/** @param {string} dir @param {string} text */
async function writeInstructions(dir, text) {
  await app.fs.write(join(dir, 'instructions.md'), stringifyFrontMatter({ format: 1, kind: 'instructions' }, text.trim() ? `${text.trim()}\n` : ''))
  await load()
}

/** @param {string} path @param {Entry} entry @param {(entries: Entry[]) => Entry[]} change */
async function changeEntry(path, entry, change) {
  await changeMemory(app.fs, path, change)
  await load()
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

/** @param {Event} event */
async function addRoutine(event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const file = input.files?.[0]
  input.value = ''
  const skill = file && parseSkill(await file.text(), file.name)
  if (!skill) return notify(t('routines.invalid'))
  await saveSkill(app.fs, folders().at(-1) ?? '', { ...skill, by: app.deviceId })
  await load()
  notify(t('routines.added', { title: skill.title }))
}

/** @param {import('../core/skills.js').Skill} skill @param {string} body */
async function editRoutine(skill, body) {
  await saveSkill(app.fs, dirname(dirname(dirname(skill.path))), { ...skill, body, by: app.deviceId })
  await load()
}

/** @param {import('../core/skills.js').Skill} skill */
async function removeRoutine(skill) {
  if (!confirm(t('routines.confirmDelete', { title: skill.title }))) return
  await app.fs.remove(dirname(skill.path))
  await load()
}

class Knows extends Element {
  render() {
    const { data } = app.project.value
    const state = page.value
    const memoryOn = loaded.value.has('memory') && effective.value.settings.memory !== false
    const label = (/** @type {string} */ dir) => (dir ? t('knows.forProject', { project: String(data.name) }) : t('knows.forYou'))
    return html`<dialog class="sheet knows" @close=${closed('knows')} @click=${backdrop}>
      ${head(t('knows.title', { name: BRAND.name }))}
      <p class="lede">${t('knows.lede', { name: BRAND.name })}</p>
      ${state ? html`
      <section>
        <h3>${icons.pin} ${t('knows.instructions')}</h3>
        <p class="muted small">${t('knows.instructionsText', { name: BRAND.name })}</p>
        ${app.policy.instructions ? html`<p class="locked" dir="auto">${app.policy.instructions}</p><p class="muted small">${t('policy.locked')}</p>` : nothing}
        ${Object.entries(state.instructions).map(([dir, text]) => html`<label>${label(dir)}
          <textarea rows="3" dir="auto" placeholder=${t('knows.instructionsPlaceholder')} .value=${live(text)}
            @change=${(/** @type {Event} */ e) => writeInstructions(dir, /** @type {HTMLTextAreaElement} */ (e.target).value).then(() => notify(t('knows.saved')))}></textarea>
        </label>`)}
      </section>
      <section>
        <h3>${icons.note} ${t('knows.noticed', { name: BRAND.name })}</h3>
        ${!loaded.value.has('memory') ? html`
          <p class="muted">${t('cap.memory.text', { name: BRAND.name })}</p>
          ${isDenied('memory') ? nothing : html`<button class="button" @click=${() => unlock('memory')}>${t('cap.memory.yes')}</button>`}` : html`
          <label class="toggle">
            <input type="checkbox" .checked=${memoryOn} @change=${(/** @type {Event} */ e) => updateSettings({ memory: /** @type {HTMLInputElement} */ (e.target).checked })}>
            <span>${t('knows.memoryOn', { name: BRAND.name })}</span>
          </label>
          ${state.memory.map(({ path, entries }) => html`<h4>${label(dirname(path))}</h4>
            ${entries.length ? html`<ul class="noticed">${entries.map((entry) => html`<li>
              <textarea class="noticed-text" rows="1" dir="auto" aria-label=${t('knows.edit')} .value=${live(entry.text)}
                @change=${(/** @type {Event} */ e) => edit(path, entry, /** @type {HTMLTextAreaElement} */ (e.target).value)}></textarea>
              <span class="noticed-actions">
                ${entry.conversation ? html`<button class="link-button small" title=${t('knows.from')}
                  @click=${() => openFrom(/** @type {string} */ (entry.conversation))}>${entry.at ? relativeTime(entry.at) : t('knows.from')}</button>` : nothing}
                <button class="icon-button subtle" title=${t('knows.promote')} aria-label=${t('knows.promote')} @click=${() => promote(path, entry)}>${icons.pin}</button>
                <button class="icon-button subtle" title=${t('action.delete')} aria-label=${t('action.delete')} @click=${() => forget(path, entry)}>${icons.trash}</button>
              </span>
            </li>`)}</ul>` : html`<p class="muted small">${t('knows.nothing')}</p>`}`)}
          <p class="muted small">${t('knows.cloud', { name: BRAND.name })}</p>`}
      </section>
      ${loaded.value.has('routines') ? html`<section>
        <h3>${icons.repeat} ${t('cap.routines.name')}</h3>
        <p class="muted small">${t('routines.text', { name: BRAND.name })}</p>
        ${state.skills.length ? html`<ul class="routines">${state.skills.map((skill) => html`<li><details>
          <summary><strong dir="auto">${skill.title}</strong><small dir="auto">${skill.description}</small></summary>
          <textarea rows="8" dir="auto" aria-label=${t('routines.steps')} .value=${live(skill.body)}
            @change=${(/** @type {Event} */ e) => editRoutine(skill, /** @type {HTMLTextAreaElement} */ (e.target).value)}></textarea>
          <button class="button subtle" @click=${() => removeRoutine(skill)}>${icons.trash} ${t('action.delete')}</button>
        </details></li>`)}</ul>` : html`<p class="muted small">${t('routines.none')}</p>`}
        <label class="button subtle">${icons.upload} ${t('routines.add')}
          <input type="file" accept=".md,text/markdown" class="visually-hidden" @change=${addRoutine}>
        </label>
      </section>` : nothing}` : nothing}
    </dialog>`
  }

  updated() {
    const open = app.dialog.value === 'knows'
    if (open && !this.querySelector('dialog')?.open) load()
    syncDialog(this, 'knows')
  }
}

define('app-knows', Knows)
