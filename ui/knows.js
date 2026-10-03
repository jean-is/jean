// "What Jean knows about you" (docs/product.md): the user's instructions, which Jean always
// follows, and what Jean noticed, which the user can edit, delete or turn into an instruction;
// then the skills, with those published elsewhere (D121), and the routines (D122). Everything
// here is a plain file (instructions.md, memory.md, SKILL.md, routines/*.md).
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
import { t, relativeTime, locale } from '../core/i18n.js'
import { icons } from './icons.js'

/** @typedef {import('../core/memory.js').Entry} Entry */
/** @typedef {import('../caps/routines/schedule.js').Routine} Routine */
/**
 * @typedef {{ instructions: Record<string, string>, memory: { path: string, entries: Entry[] }[], skills: import('../core/skills.js').Skill[], routines: Routine[] }} Page
 */

const page = signal(/** @type {Page | null} */ (null))
/** The modules of Skills and Routines, once on. */
let skillsModule = /** @type {typeof import('../caps/skills/skills.js') | null} */ (null)
let routinesModule = /** @type {typeof import('../caps/routines/routines.js') | null} */ (null)
/** What the sources of skills offer, read when their list is opened. */
const elsewhere = signal(/** @type {import('../caps/skills/sources.js').Index[] | null} */ (null))

/** Where the room's files are: the person's at the root, the project's in its folder. */
function folders() {
  const { dir, data } = app.project.value
  return data.default === true ? [''] : ['', dir]
}

async function load() {
  const dirs = folders()
  if (loaded.value.has('skills')) skillsModule = await import('../caps/skills/skills.js')
  if (loaded.value.has('routines')) routinesModule = await import('../caps/routines/routines.js')
  page.value = {
    instructions: Object.fromEntries(await Promise.all(dirs.map(async (dir) => [dir, await readBody(join(dir, 'instructions.md'))]))),
    memory: await Promise.all(dirs.map(async (dir) => ({ path: join(dir, 'memory.md'), entries: parseMemory(await app.fs.read(join(dir, 'memory.md'))) }))),
    skills: loaded.value.has('skills') ? await listSkills(app.fs, dirs) : [],
    routines: (await routinesModule?.routines()) ?? [],
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
async function addSkill(event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const file = input.files?.[0]
  input.value = ''
  const skill = file && parseSkill(await file.text(), file.name)
  if (!skill) return notify(t('skills.invalid'))
  await saveSkill(app.fs, folders().at(-1) ?? '', { ...skill, by: app.deviceId })
  await load()
  notify(t('skills.added', { title: skill.title }))
}

/** @param {import('../core/skills.js').Skill} skill @param {string} body */
async function editSkill(skill, body) {
  await saveSkill(app.fs, dirname(dirname(dirname(skill.path))), { ...skill, body, by: app.deviceId })
  await load()
}

/** @param {import('../core/skills.js').Skill} skill */
async function removeSkill(skill) {
  if (!confirm(t('skills.confirmDelete', { title: skill.title }))) return
  await app.fs.remove(dirname(skill.path))
  await load()
}

// ─── Skills from elsewhere (D121) ────────────────────────────────────────────

/** Reads what the sources offer (from the day's cache unless asked again). @param {boolean} [again] */
async function browse(again = false) {
  elsewhere.value = (await skillsModule?.offered({ again })) ?? []
}

/** The user's own list of sources: the defaults until they change it. */
async function ownSources() {
  const { DEFAULT_SOURCES } = await import('../caps/skills/sources.js')
  return effective.value.settings.sources ?? [...DEFAULT_SOURCES]
}

/** @param {SubmitEvent} event */
async function addSource(event) {
  event.preventDefault()
  const form = /** @type {HTMLFormElement} */ (event.target)
  const address = String(new FormData(form).get('address') ?? '').trim()
  const { indexURL } = await import('../caps/skills/sources.js')
  try {
    indexURL(address)
  } catch {
    return notify(t('skills.unreachable', { source: address }))
  }
  form.reset()
  await updateSettings({ sources: [...new Set([...await ownSources(), address])] })
  await browse(true)
}

/** @param {string} url an index's address */
async function removeSource(url) {
  const { indexURL } = await import('../caps/skills/sources.js')
  await updateSettings({ sources: (await ownSources()).filter((address) => indexURL(address) !== url) })
  await browse()
}

/** @param {import('../caps/skills/sources.js').Entry} entry */
const preview = async (entry) => (await import('../caps/skills/ready.js')).preview(entry)

/** The sources, what each offers that the user doesn't have, and a way to add one. @param {Page} state */
function sourcesView(state) {
  const locked = skillsModule?.locked() ?? []
  const have = state.skills.map((skill) => skill.name)
  return html`<details class="other sources" @toggle=${(/** @type {Event} */ e) => /** @type {HTMLDetailsElement} */ (e.target).open && !elsewhere.value && browse()}>
    <summary>${t('skills.elsewhere')}</summary>
    <p class="muted small">${t('skills.elsewhereText')}</p>
    ${elsewhere.value?.map((index) => {
      const site = new URL(index.url).host
      return html`<section class="source">
        <h4>${icons.globe} <span dir="ltr">${site}</span>${locked.includes(index.url) ? html` <span class="muted small">${t('policy.locked')}</span>`
          : html`<button class="icon-button subtle" title=${t('action.remove')} aria-label=${t('action.remove')} @click=${() => removeSource(index.url)}>${icons.trash}</button>`}</h4>
        ${index.error ? html`<p class="muted small">${t('skills.unreachable', { source: site })}</p>` : nothing}
        <ul class="skills">${index.skills.filter((entry) => !have.includes(entry.name)).map((entry) => html`<li>
          <button class="link-button" @click=${() => preview(entry)}><strong>${entry.name}</strong></button>
          <small dir="auto">${entry.description}</small>
        </li>`)}</ul>
      </section>`
    }) ?? nothing}
    ${app.policy.skills?.only ? nothing : html`<form class="row" @submit=${addSource}>
      <input name="address" required dir="ltr" inputmode="url" autocomplete="off" spellcheck="false" placeholder="example.com" aria-label=${t('skills.source')}>
      <button class="button">${t('skills.sourceAdd')}</button>
    </form>`}
  </details>`
}

// ─── Routines (D122) ─────────────────────────────────────────────────────────

let changing = Promise.resolve()

/**
 * Changes a routine's schedule or request, kept only when the schedule is one. Changes made in
 * quick succession apply one after the other, each to the routine as it is kept.
 * @param {Routine} routine @param {Partial<Routine>} change
 */
function changeRoutine(routine, change) {
  changing = changing.then(async () => {
    const { schedule, writeRoutine } = await import('../caps/routines/schedule.js')
    const kept = (await routinesModule?.routines())?.find((other) => other.path === routine.path)
    if (!kept) return
    const changed = { ...kept, ...change }
    // A week or a month needs its day: today's, until the user picks another.
    const today = new Date()
    const plan = schedule({ ...changed, on: changed.every === kept.every ? changed.on : changed.every === 'week' ? today.getDay() : today.getDate() })
    if (plan && changed.request.trim()) await writeRoutine(app.fs, { ...changed, on: undefined, ...plan })
  }).then(load, (error) => console.warn('Routine', error))
  return changing
}

/** @param {Routine} routine */
async function removeRoutine(routine) {
  if (!confirm(t('routines.confirmDelete', { title: routine.title }))) return
  await app.fs.remove(routine.path)
  await load()
}

/** @param {Routine} routine */
function routineView(routine) {
  const module = /** @type {NonNullable<typeof routinesModule>} */ (routinesModule)
  const next = module.next(routine)
  const { first } = module.week()
  const dayName = (/** @type {number} */ day) => new Intl.DateTimeFormat(locale.value, { weekday: 'long' }).format(new Date(2026, 0, 4 + day))
  const value = (/** @type {Event} */ e) => /** @type {HTMLInputElement} */ (e.target).value
  return html`<li><details>
    <summary><strong dir="auto">${routine.title}</strong>${next ? html`<small>${t('routines.next', { when: relativeTime(next) })}</small>` : nothing}</summary>
    <div class="row routine-when">
      <select aria-label=${t('routines.every')} @change=${(/** @type {Event} */ e) => changeRoutine(routine, { every: /** @type {any} */ (value(e)) })}>
        ${(/** @type {const} */ (['day', 'weekday', 'week', 'month'])).map((every) => html`<option value=${every} ?selected=${every === routine.every}>${t(`routines.every.${every}`)}</option>`)}
      </select>
      ${routine.every === 'week' ? html`<select aria-label=${t('routines.on')} @change=${(/** @type {Event} */ e) => changeRoutine(routine, { on: Number(value(e)) })}>
        ${[0, 1, 2, 3, 4, 5, 6].map((i) => (first + i) % 7).map((day) => html`<option value=${day} ?selected=${day === routine.on}>${dayName(day)}</option>`)}
      </select>` : routine.every === 'month' ? html`<input type="number" min="1" max="31" .value=${live(String(routine.on ?? 1))} aria-label=${t('routines.on')}
        @change=${(/** @type {Event} */ e) => changeRoutine(routine, { on: Number(value(e)) })}>` : nothing}
      <input type="time" .value=${live(routine.at)} aria-label=${t('routines.at')} @change=${(/** @type {Event} */ e) => changeRoutine(routine, { at: value(e) })}>
    </div>
    <textarea rows="3" dir="auto" aria-label=${t('routines.request')} .value=${live(routine.request)}
      @change=${(/** @type {Event} */ e) => changeRoutine(routine, { request: value(e) })}></textarea>
    <button class="button subtle" @click=${() => removeRoutine(routine)}>${icons.trash} ${t('action.delete')}</button>
  </details></li>`
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
      ${loaded.value.has('skills') ? html`<section>
        <h3>${icons.repeat} ${t('cap.skills.name')}</h3>
        <p class="muted small">${t('skills.text', { name: BRAND.name })}</p>
        ${state.skills.length ? html`<ul class="skills">${state.skills.map((skill) => html`<li><details>
          <summary><strong dir="auto">${skill.title}</strong><small dir="auto">${skill.description}</small>${skill.source
            ? html`<small>${icons.globe} ${t('skills.from', { source: new URL(skill.source).host })}</small>` : nothing}</summary>
          <textarea rows="8" dir="auto" aria-label=${t('skills.steps')} .value=${live(skill.body)}
            @change=${(/** @type {Event} */ e) => editSkill(skill, /** @type {HTMLTextAreaElement} */ (e.target).value)}></textarea>
          <button class="button subtle" @click=${() => removeSkill(skill)}>${icons.trash} ${t('action.delete')}</button>
        </details></li>`)}</ul>` : html`<p class="muted small">${t('skills.none')}</p>`}
        <label class="button subtle">${icons.upload} ${t('skills.add')}
          <input type="file" accept=".md,text/markdown" class="visually-hidden" @change=${addSkill}>
        </label>
        ${sourcesView(state)}
      </section>` : nothing}
      ${loaded.value.has('routines') && routinesModule ? html`<section>
        <h3>${icons.calendar} ${t('cap.routines.name')}</h3>
        <p class="muted small">${t('routines.text')}</p>
        ${state.routines.length ? html`<ul class="skills routines">${state.routines.map(routineView)}</ul>` : html`<p class="muted small">${t('routines.none')}</p>`}
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
