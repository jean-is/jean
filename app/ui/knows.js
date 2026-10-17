// "What Jean knows about you" (docs/product.md), Settings' About you: the user's instructions,
// which Jean always follows, and what Jean noticed, which the user can edit, delete or turn into
// an instruction. Then, once each is on, Settings' Skills, with Jean's own directory of ready-made
// ones (D196) and those published elsewhere (D121), and Routines (D122). Everything here is a
// plain file (instructions.md, memory.md, SKILL.md, routines/*.md). Loaded the first time one of
// the three sections is shown (D134).
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { app, effective, brainsHere, notify, updateSettings, readBody, enterProject, openConversation } from './state.js'
import { loaded, unlock, isDenied } from './caps.js'
import { openSettings, setting, lockedBy } from './dialogs.js'
import { choices } from './picker.js'
import { changeMemory, parseMemory, oneLine } from '../core/memory.js'
import { listSkills, parseSkill, saveSkill } from '../core/skills.js'
import { DEFAULT_SOURCES, indexURL, siteOf } from '../caps/skills/sources.js'
import { shownIn } from '../caps/skills/directory.js'
import { EVERY, WHEN } from '../caps/routines/schedule.js'
import { stringifyFrontMatter } from '../core/settings.js'
import { dirname, join } from '../core/fs.js'
import { BRAND } from '../brand.js'
import { t, relativeTime, locale } from '../core/i18n.js'
import { icons } from './menu-icons.js'

/** @typedef {import('../core/memory.js').Entry} Entry */
/** @typedef {import('../caps/routines/schedule.js').Routine} Routine */
/**
 * @typedef {{ instructions: Record<string, string>, memory: { path: string, entries: Entry[] }[], skills: import('../core/skills.js').Skill[], routines: Routine[],
 *   directory: import('../caps/skills/directory.js').Ready[] }} Page
 */

const page = signal(/** @type {Page | null} */ (null))
/** The modules of Skills and Routines, once on. */
let skillsModule = /** @type {typeof import('../caps/skills/skills.js') | null} */ (null)
let routinesModule = /** @type {typeof import('../caps/routines/routines.js') | null} */ (null)
/** What the sources of skills offer, read when asked, and what the user typed to narrow it; the routine whose schedule shows. */
const elsewhere = signal(/** @type {import('../caps/skills/sources.js').Index[] | null} */ (null))
const [query, opened] = [signal(''), signal('')]

/** Where the room's files are: the person's at the root, the project's in its folder. */
function folders() {
  const { dir, data } = app.project.value
  return data.default === true ? [''] : ['', dir]
}

/** Reads the files again: each time one of the three sections is entered. */
export async function refresh() {
  const dirs = folders()
  if (loaded.value.has('skills')) skillsModule = await import('../caps/skills/skills.js')
  if (loaded.value.has('routines')) routinesModule = await import('../caps/routines/routines.js')
  page.value = {
    instructions: Object.fromEntries(await Promise.all(dirs.map(async (dir) => [dir, await readBody(join(dir, 'instructions.md'))]))),
    memory: await Promise.all(dirs.map(async (dir) => ({ path: join(dir, 'memory.md'), entries: parseMemory(await app.fs.read(join(dir, 'memory.md'))) }))),
    skills: loaded.value.has('skills') ? await listSkills(app.fs, dirs) : [],
    routines: (await routinesModule?.routines()) ?? [],
    directory: (await skillsModule?.directory()) ?? [],
  }
  // A skill added, changed or deleted here changes the blocks drawn as widgets (D196).
  skillsModule?.declare(page.value.skills)
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

/** @param {Event} event */
async function addSkill(event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const file = input.files?.[0]
  input.value = ''
  const skill = file && parseSkill(await file.text(), file.name)
  if (!skill) return notify(t('skills.invalid'))
  await saveSkill(app.fs, folders().at(-1) ?? '', { ...skill, by: app.deviceId })
  await refresh()
  notify(t('skills.added', { title: skill.title }))
}

/** @param {import('../core/skills.js').Skill} skill @param {string} body */
async function editSkill(skill, body) {
  await saveSkill(app.fs, dirname(dirname(dirname(skill.path))), { ...skill, body, by: app.deviceId })
  await refresh()
}

/** @param {import('../core/skills.js').Skill} skill */
async function removeSkill(skill) {
  if (!confirm(t('skills.confirmDelete', { title: skill.title }))) return
  await app.fs.remove(dirname(skill.path))
  await refresh()
}

// ─── Skills from elsewhere (D121) ────────────────────────────────────────────

/** Reads what the sources offer (from the day's cache unless asked again). @param {boolean} [again] */
async function browse(again = false) {
  elsewhere.value = (await skillsModule?.offered({ again })) ?? []
}

/** The user's own list of sources: the defaults until they change it. @returns {string[]} */
const ownSources = () => effective.value.settings.sources ?? [...DEFAULT_SOURCES]

/** @param {SubmitEvent} event */
async function addSource(event) {
  event.preventDefault()
  const form = /** @type {HTMLFormElement} */ (event.target)
  const address = String(new FormData(form).get('address') ?? '').trim()
  try {
    indexURL(address)
  } catch {
    return notify(t('skills.unreachable', { source: address }))
  }
  form.reset()
  await updateSettings({ sources: [...new Set([...ownSources(), address])] })
  await browse(true)
}

/** @param {string} url an index's address */
async function removeSource(url) {
  await updateSettings({ sources: ownSources().filter((address) => indexURL(address) !== url) })
  await browse()
}

/** @param {import('../caps/skills/sources.js').Entry} entry */
const preview = async (entry) => (await import('../caps/skills/ready.js')).preview(entry)

/**
 * Jean's own ready-made skills that the user hasn't added (D196): a tile each, named in their
 * language, read before it is added. @param {Page} state
 */
function directoryView(state) {
  const have = state.skills.map((skill) => skill.name)
  const open = state.directory.filter((entry) => !have.includes(entry.name))
  return open.length ? html`<section>
    <h3>${t('skills.directory')}</h3>
    <p class="muted small">${t('skills.directoryText')}</p>
    <ul class="services ready-made">${open.map((entry) => html`<li><button class="service" @click=${() => preview(entry)}>
      <span class="monogram" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24" focusable="false"><path d=${entry.icon}></path></svg></span>
      <span><strong>${shownIn(entry, locale.value).title}</strong><small>${shownIn(entry, locale.value).text}</small></span>${icons.plus}
    </button></li>`)}</ul>
  </section>` : nothing
}

/** Skills from elsewhere, read when asked: each source's the user hasn't, as cards, narrowed by what is typed; a source is removed where it shows. @param {Page} state */
function sourcesView(state) {
  const locked = skillsModule?.locked() ?? []
  const have = state.skills.map((skill) => skill.name)
  const words = query.value.trim().toLocaleLowerCase(locale.value)
  const offered = elsewhere.value?.map((index) => ({ index, entries: index.skills.filter((entry) => !have.includes(entry.name)
    && `${entry.name} ${entry.description}`.toLocaleLowerCase(locale.value).includes(words)) }))
  return html`<section class="sources">
    <h3>${t('skills.elsewhere')}</h3>
    <p class="muted small">${t('skills.elsewhereText')}</p>
    ${!offered ? html`<button class="button" @click=${(/** @type {Event} */ e) => { /** @type {HTMLButtonElement} */ (e.currentTarget).disabled = true; browse() }}>${icons.globe} ${t('skills.browse')}</button>` : html`
      ${elsewhere.value?.some((index) => index.skills.length > 6) ? html`<input type="search" class="sources-search" dir="auto" .value=${live(query.value)}
        placeholder=${t('skills.search')} aria-label=${t('skills.search')} @input=${(/** @type {Event} */ e) => { query.value = /** @type {HTMLInputElement} */ (e.target).value }}>` : nothing}
      ${words && !offered.some(({ entries }) => entries.length) ? html`<p class="muted small">${t('find.none', { query: query.value.trim() })}</p>` : nothing}
      ${offered.filter(({ index, entries }) => entries.length || index.error || !words).map(({ index, entries }) => {
        const site = siteOf(index.url)
        return html`<div class="source">
          <h4>${icons.globe} <span dir="ltr">${site}</span>${locked.includes(index.url) ? html` <span class="muted small">${lockedBy()}</span>`
            : html`<button class="icon-button subtle" aria-label=${t('action.remove')} @click=${() => removeSource(index.url)}>${icons.trash}</button>`}</h4>
          ${index.error ? html`<p class="muted small">${t('skills.unreachable', { source: site })}</p>` : nothing}
          <ul class="cards">${entries.map((entry) => html`<li><button class="card" @click=${() => preview(entry)}><strong dir="ltr">${entry.name}</strong><small dir="auto">${entry.description}</small></button></li>`)}</ul>
        </div>`
      })}
      ${app.policy.skills?.only ? nothing : html`<form class="row" @submit=${addSource}>
        <input name="address" required dir="ltr" inputmode="url" autocomplete="off" spellcheck="false" placeholder="example.com" aria-label=${t('skills.source')}>
        <button class="button">${t('skills.sourceAdd')}</button>
      </form>`}`}
  </section>`
}

// ─── Routines (D122) ─────────────────────────────────────────────────────────

let changing = Promise.resolve()

/**
 * Changes a routine's schedule, what sets it off or its request, kept only when the schedule is one.
 * Changes made in quick succession apply one after the other, each to the routine as it is kept.
 * @param {Routine} routine @param {Record<string, unknown>} change
 */
function changeRoutine(routine, change) {
  changing = changing.then(async () => {
    const { schedule, trigger, writeRoutine } = await import('../caps/routines/schedule.js')
    const kept = (await routinesModule?.routines())?.find((other) => other.path === routine.path)
    if (!kept) return
    const changed = /** @type {Record<string, any>} */ ({ ...kept, ...change })
    const { path, title, request, author, createdAt, lastRun, flow, brain, model } = changed
    // A file sets it off (D294), or a time: a week or a month needs its day, today's until the user picks
    // another; once, the next time it says; one a file set off before, at nine.
    const today = new Date()
    const every = 'every' in kept ? kept.every : undefined
    const plan = trigger(changed) ?? schedule({ at: '09:00', ...changed, on: changed.every === every ? changed.on : changed.every === 'week' ? today.getDay() : changed.every === 'once' ? undefined : today.getDate() })
    if (plan && request.trim()) await writeRoutine(app.fs, { path, title, request, author, createdAt, lastRun, flow, brain, model, ...plan })
  }).then(refresh, (error) => console.warn('Routine', error))
  return changing
}

/** @param {Routine} routine */
async function removeRoutine(routine) {
  if (!confirm(t('routines.confirmDelete', { title: routine.title }))) return
  await app.fs.remove(routine.path)
  await refresh()
}

/**
 * Who answers a routine's runs (D303): the brain the user's messages have, Auto, or one the picker offers; its own
 * at a version the picker no longer offers stays, and one the room no longer has answers as the user's messages do.
 * @param {Routine} routine
 */
function brainChoice(routine) {
  const offered = choices()
  const own = brainsHere.value.find((brain) => brain.id === routine.brain)
  const listed = offered.some(({ brain, model }) => brain.id === routine.brain && model === routine.model)
  const pick = (/** @type {Event} */ e) => {
    const value = /** @type {HTMLSelectElement} */ (e.target).value
    const choice = /^\d+$/.test(value) ? offered[Number(value)] : undefined
    changeRoutine(routine, choice ? { brain: choice.brain.id, model: choice.model } : { brain: value === 'auto' ? value : undefined, model: undefined })
  }
  return html`<label>${t('routines.brain')}<select @change=${pick}>
    <option value="" ?selected=${!routine.brain || (routine.brain !== 'auto' && !own)}>${t('routines.brain.yours')}</option>
    <option value="auto" ?selected=${routine.brain === 'auto'}>${t('auto.name')}</option>
    ${offered.map(({ label, behind, brain, model }, i) => html`<option value=${i} title=${behind} ?selected=${brain.id === routine.brain && model === routine.model}>${label}</option>`)}
    ${own && !listed ? html`<option selected>${(routine.model || own.model).split('/').at(-1)}</option>` : nothing}
  </select></label>`
}

/** Settings' Routines, open on a routine: from one of its runs (D122). @param {string} path */
export function showRoutine(path) {
  opened.value = path
  openSettings('routines')
}

/** @param {Routine} routine */
function routineView(routine) {
  const module = /** @type {NonNullable<typeof routinesModule>} */ (routinesModule)
  const next = module.next(routine)
  const { first } = module.week()
  const dayName = (/** @type {number} */ day) => new Intl.DateTimeFormat(locale.value, { weekday: 'long' }).format(new Date(2026, 0, 4 + day))
  const value = (/** @type {Event} */ e) => /** @type {HTMLInputElement} */ (e.target).value
  // A time, or what sets it off (D294).
  const timed = 'every' in routine ? routine : null
  // An hour's minutes, every five and the routine's own.
  const minute = Number(timed?.at.slice(3) ?? 0)
  const minutes = [...new Set([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, minute])].sort((a, b) => a - b)
  const two = new Intl.NumberFormat(locale.value, { minimumIntegerDigits: 2 })
  const open = opened.value === routine.path
  // Its runs, newest first (D122).
  const runs = app.conversations.value.filter((item) => item.routine === routine.path).sort((a, b) => (a.id < b.id ? 1 : -1))
  const when = new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
  // Run now beside the routine's name, so the row can't be a <details>: its summary would hold a button.
  return html`<li>
    <button class="item" aria-expanded=${open} @click=${() => { opened.value = open ? '' : routine.path }}><span class="item-icon">${icons.alarm}</span><span class="item-text">
      <strong dir="auto">${routine.title}</strong>${next ? html`<small>${t('routines.next', { when: relativeTime(next) })}</small>` : nothing}</span>${icons.chevron}</button>
    ${timed ? html`<button class="button" ?disabled=${app.busy.value} @click=${() => module.runNow(routine.path)}>${t('routines.run')}</button>` : nothing}
    ${open ? html`<div class="item-body">
      <div class="row routine-when">
        <select aria-label=${t('routines.every')} @change=${(/** @type {Event} */ e) => changeRoutine(routine, WHEN.includes(/** @type {any} */ (value(e))) ? { when: value(e) } : { every: value(e), when: undefined })}>
          ${EVERY.map((every) => html`<option value=${every} ?selected=${every === timed?.every}>${t(`routines.every.${every}`)}</option>`)}
          ${WHEN.map((when) => html`<option value=${when} ?selected=${!timed && 'when' in routine && when === routine.when}>${t(`routines.when.${when}`)}</option>`)}
        </select>
        ${timed?.every === 'week' ? html`<select aria-label=${t('routines.on')} @change=${(/** @type {Event} */ e) => changeRoutine(routine, { on: Number(value(e)) })}>
          ${[0, 1, 2, 3, 4, 5, 6].map((i) => (first + i) % 7).map((day) => html`<option value=${day} ?selected=${day === timed.on}>${dayName(day)}</option>`)}
        </select>` : timed?.every === 'month' ? html`<input type="number" min="1" max="31" .value=${live(String(timed.on ?? 1))} aria-label=${t('routines.on')}
          @change=${(/** @type {Event} */ e) => changeRoutine(routine, { on: Number(value(e)) })}>` : timed?.every === 'once' ? html`<input type="date" .value=${live(String(timed.on))}
          aria-label=${t('routines.on')} @change=${(/** @type {Event} */ e) => changeRoutine(routine, { on: value(e) })}>` : nothing}
        ${!timed ? nothing : timed.every === 'hour' ? html`<select aria-label=${t('routines.at')} @change=${(/** @type {Event} */ e) => changeRoutine(routine, { at: `${timed.at.slice(0, 3)}${value(e).padStart(2, '0')}` })}>
          ${minutes.map((each) => html`<option value=${each} ?selected=${each === minute}>${t('routines.minute', { minute: two.format(each) })}</option>`)}
        </select>` : html`<input type="time" .value=${live(timed.at)} aria-label=${t('routines.at')} @change=${(/** @type {Event} */ e) => changeRoutine(routine, { at: value(e) })}>`}
      </div>
      ${'when' in routine ? html`<label>${t('routines.if')}<input type="text" dir="auto" .value=${live(routine.if ?? '')}
        @change=${(/** @type {Event} */ e) => changeRoutine(routine, { if: value(e) })}></label>` : nothing}
      ${routine.flow ? html`<p><button class="link-button" title=${t('cap.flows.name')} @click=${() => { app.dialog.value = null; import('../caps/flows/flows.js').then((flows) => flows.edit(routine.flow)) }}>${icons.flow}
        <span dir="auto">${routine.request}</span></button></p>` : html`<label>${t('routines.request')}<textarea rows="3" dir="auto" .value=${live(routine.request)}
        @change=${(/** @type {Event} */ e) => changeRoutine(routine, { request: value(e) })}></textarea></label>`}
      ${brainChoice(routine)}
      ${runs.length ? html`<div class="routine-runs">${t('routines.runs')}<ul aria-label=${t('routines.runs')}>${runs.map((run) => html`<li>
        <button class="button" @click=${() => openConversation(run.path)}>${when.format(new Date(run.createdAt))}</button></li>`)}</ul></div>` : nothing}
      <div class="row"><button class="button subtle danger" @click=${() => removeRoutine(routine)}>${icons.trash} ${t('action.delete')}</button></div>
    </div>` : nothing}
  </li>`
}

// ─── The three sections ──────────────────────────────────────────────────────

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
    ${setting(t('you.name'), t('you.nameText'), html`<input class="you-name" autocomplete="given-name" dir="auto" maxlength="40" spellcheck="false"
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

/** Settings' Skills: each one's steps to read or change, one from a file, Jean's ready-made ones, and those from elsewhere. */
export function skills() {
  const state = page.value
  if (!state) return nothing
  return html`<p class="lede">${t('skills.text', { name: BRAND.name })}</p>
    <section>
      <div class="section-head"><h3>${t('skills.yours')}</h3><label class="button subtle">${icons.upload} ${t('skills.add')}
        <input type="file" accept=".md,text/markdown" class="visually-hidden" @change=${addSkill}></label></div>
      ${state.skills.length ? html`<ul class="list">${state.skills.map((skill) => html`<li><details>
        <summary><span class="item-icon">${icons.scroll}</span><span class="item-text"><strong dir="auto">${shownIn(skill, locale.value).title}</strong><small dir="auto">${shownIn(skill, locale.value).text}</small>${skill.source
          ? html`<small>${icons.globe} ${t('skills.from', { source: siteOf(skill.source) })}</small>` : nothing}</span>${icons.chevron}</summary>
        <div class="item-body">
          <textarea class="steps" rows="8" dir="auto" aria-label=${t('skills.steps')} .value=${live(skill.body)}
            @change=${(/** @type {Event} */ e) => editSkill(skill, /** @type {HTMLTextAreaElement} */ (e.target).value)}></textarea>
          <div class="row"><button class="button subtle danger" @click=${() => removeSkill(skill)}>${icons.trash} ${t('action.delete')}</button></div>
        </div>
      </details></li>`)}</ul>` : html`<p class="empty muted small">${t('skills.none')}</p>`}
    </section>
    ${directoryView(state)}
    ${sourcesView(state)}`
}

/** Settings' Routines: each one's schedule and request, to change or delete. */
export function routines() {
  const state = page.value
  if (!state || !routinesModule) return nothing
  return html`<p class="lede">${t('routines.text')}</p>
    <section>${state.routines.length ? html`<ul class="list routines">${state.routines.map(routineView)}</ul>`
      : html`<p class="muted small">${t('routines.none')}</p>`}</section>`
}
