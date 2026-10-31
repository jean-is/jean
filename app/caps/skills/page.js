// Settings' Skills (D121, D196, D261): the skill followed last, then the room's skills, each with its few words, where it
// came from in a word when not from the user (a site, ready-made) and Off once turned off. A row opens its page, skills/<name>:
// where it came from, how often it was followed, its switch, then when it is followed, an example to try, its steps, Change it
// with Jean (a new task that names it), Edit, Save as a file and Delete; one of Jean's own says what it does instead, its English
// steps folded, its switch in Delete's place. skills/add holds the ways to add one and Jean's own by what they are for, each read
// on skills/add/<name> before it is added, as a source's is from skills/sites (D121). Loaded the first time Settings shows Skills;
// read again as it is entered, a page opened or a task ends, which may have followed one.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app, effective, notify, updateSettings, newConversation } from '../../ui/state.js'
import { act } from '../../ui/acts.js'
import { sectionOpen, lockedBy } from '../../ui/dialogs.js'
import { focusComposer } from '../../ui/composer.js'
import { markdown } from '../../ui/markdown.js'
import { save } from '../../ui/save.js'
import { loadConversation } from '../../core/conversations.js'
import { parseSkill, saveSkill } from '../../core/skills.js'
import { dirname, walk } from '../../core/fs.js'
import { t, locale, relativeTime, intlLocales } from '../../core/i18n.js'
import { byName } from '../../core/search.js'
import { BRAND } from '../../brand.js'
import { icons } from '../../ui/menu-icons.js'
import { DEFAULT_SOURCES, indexURL, siteOf } from './sources.js'
import { shownIn } from './directory.js'
import { followed } from './followed.js'
import { directory, folders, isOff, locked, offered, redeclare, room } from './skills.js'
import { add, body, glyph, titleOf, unpack } from './ready.js'

/** @typedef {import('../../core/skills.js').Skill} Skill */
/** @typedef {{ skills: Skill[], own: import('./directory.js').Ready[], followed: import('./followed.js').Followed, beside: string[] }} Known */

/** The room's skills, Jean's own, how often each was followed, and the files beside the one whose page is open. */
const known = signal(/** @type {Known | null} */ (null))
/** What the sources offer, read when asked (D121), and what the user typed to narrow it. */
const elsewhere = signal(/** @type {import('./sources.js').Index[] | null} */ (null))
const query = signal('')
/** The skill to add whose page is open, skills/add/<name>, once downloaded and checked. */
const shown = signal(/** @type {import('./ready.js').Shown | null} */ (null))
/** The skill whose words are being changed on its page. */
const editing = signal('')
/** What the groups of Jean's own are for, in the order Add a skill shows them. */
const GROUPS = ['day', 'work', 'learning', 'drawn']

/** The page open: '' for the list, a skill's name, add, add/<name> or sites. */
const pageOpen = () => app.section.value.split('/').slice(1).join('/')

/** The tasks last counted, so going from page to page doesn't read them again. */
let counted = /** @type {unknown} */ (null)

async function refresh() {
  const [skills, own] = await Promise.all([room(), directory()])
  const open = skills.find((skill) => skill.name === pageOpen())
  const folder = open && dirname(open.path)
  const beside = folder ? (await walk(app.fs, folder)).map((path) => path.slice(folder.length + 1)).filter((path) => path !== 'SKILL.md') : []
  known.value = { skills, own, beside, followed: known.peek()?.followed ?? new Map() }
  const ready = /^add\/(.+)/.exec(pageOpen())?.[1]
  if (ready && shown.peek()?.entry.name !== ready) await show(ready)
  if (counted === app.conversations.peek()) return
  counted = app.conversations.peek()
  let seen = /** @type {import('./followed.js').Followed} */ (new Map())
  for (const { path } of app.conversations.peek()) seen = followed((await loadConversation(app.fs, path))?.records ?? [], seen)
  known.value = { ...known.value, followed: seen }
}
effect(() => {
  void app.conversations.value
  if (app.dialog.value === 'settings' && sectionOpen() === 'skills') refresh().catch((error) => console.warn('Skills', error))
})

/** Puts the keyboard on what this finds, once it is drawn: a skill to add shows once its file is read. @param {string} selector */
const focus = (selector, frames = 30) => requestAnimationFrame(() => {
  const found = /** @type {HTMLElement | null} */ (document.querySelector(selector))
  return found ? found.focus() : frames && focus(selector, frames - 1)
})

/** Opens the list ('') or a page, the keyboard on its title, or back on the list on the skill's row. @param {string} to */
function go(to) {
  focus(to ? '.skill-head h2[tabindex]' : `[data-skill="${pageOpen()}"]`)
  editing.value = ''
  app.section.value = to ? `skills/${to}` : 'skills'
}

/** A new task, its box holding these words, for the user to finish or send. @param {string} words */
const ask = (words) => { newConversation(); app.draft.value = words; focusComposer() }

/** Words of the user's inside a sentence of Jean's, kept in their own direction (an English example in Arabic). @param {string} text */
const apart = (text) => `\u2068${text}\u2069`
/** One of Jean's own, as its directory gives it, unless the room's skill of its name is another. @param {Skill} skill */
const ownOf = (skill) => (skill.source || !skill.metadata?.['title-en'] ? undefined : known.value?.own.find((entry) => entry.name === skill.name))
/** A skill's icon: one of Jean's own's, a globe for one from a site, else a scroll. @param {Skill} skill */
const glyphOf = (skill) => (skill.source ? icons.globe : glyph(ownOf(skill) ?? /** @type {any} */ ({})))

/** Where a skill came from and when, and how often it was followed and when last. @param {Skill} skill */
function said(skill) {
  const when = Date.parse(skill.metadata?.created ?? '')
  const [date, jean] = [when ? new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'long' }).format(when) : '', skill.metadata?.author === 'jean']
  const from = skill.source ? t('skills.from', { source: siteOf(skill.source) }) : t(ownOf(skill) ? (jean ? 'skills.byJean' : 'skills.byYou') : jean ? 'skills.made' : 'skills.fromFile', { name: BRAND.name, date })
  const seen = known.value?.followed.get(skill.name)
  return seen ? `${from} · ${t('skills.followed', { count: seen.count, when: relativeTime(new Date(seen.at)) })}` : from
}

// ─── Changing them ───────────────────────────────────────────────────────────

/** Turned off, Jean neither follows nor adds it again until it is turned on: its file says so. @param {Skill} skill */
const turn = (skill) => async (/** @type {{ target: HTMLInputElement }} */ { target }) => {
  const { off, ...metadata } = skill.metadata ?? {}
  await saveSkill(app.fs, dirname(dirname(dirname(skill.path))), { ...skill, metadata: { ...metadata, ...(!target.checked && { off: true }) }, by: app.deviceId })
  await Promise.all([redeclare(), refresh()])
}

/** Keeps what was changed on a skill's page: when it is followed and its steps, under its heading. @param {SubmitEvent} event @param {Skill} skill */
async function change(event, skill) {
  event.preventDefault()
  const form = new FormData(/** @type {HTMLFormElement} */ (event.target))
  const heading = /^#\s[^\n]*\n+/.exec(skill.body)?.[0] ?? ''
  await saveSkill(app.fs, dirname(dirname(dirname(skill.path))), { ...skill, description: String(form.get('description')), body: `${heading}${form.get('steps')}`, by: app.deviceId })
  editing.value = ''
  await refresh()
}

/** @param {Skill} skill */
async function remove(skill) {
  if (!confirm(t('skills.confirmDelete', { title: shownIn(skill, locale.value).title }))) return
  await app.fs.remove(dirname(skill.path))
  act('skill.remove', { name: skill.name })
  await redeclare()
  go('')
}

/** @param {Event} event */
async function fromFile(event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const file = input.files?.[0]
  input.value = ''
  const skill = file && parseSkill(await file.text(), file.name)
  if (!skill) return notify(t('skills.invalid'))
  await saveSkill(app.fs, folders().at(-1) ?? '', { ...skill, by: app.deviceId })
  act('skill.add', { name: skill.name, source: 'file' })
  await redeclare()
  notify(t('skills.added', { title: skill.title }))
  go(skill.name)
}

/** Finds a skill to add by its name, Jean's own or a source's, and downloads it. @param {string} name */
async function show(name) {
  const entry = (await directory()).find((one) => one.name === name) ?? (elsewhere.peek() ?? await offered()).flatMap((index) => index.skills).find((one) => one.name === name)
  shown.value = entry ? { entry } : null
  const state = entry && await unpack(entry)
  if (state && shown.peek()?.entry === entry) shown.value = state
}

// ─── Skills from elsewhere (D121) ────────────────────────────────────────────

/** Reads what the sources offer (from the day's cache unless asked again). @param {boolean} [again] */
const browse = async (again = false) => { elsewhere.value = await offered({ again }) }
/** The user's own list of sources: the defaults until they change it. @returns {string[]} */
const ownSources = () => effective.value.settings.sources ?? [...DEFAULT_SOURCES]

/** @param {SubmitEvent} event */
async function addSource(event) {
  event.preventDefault()
  const form = /** @type {HTMLFormElement} */ (event.target)
  const address = String(new FormData(form).get('address') ?? '').trim()
  try { indexURL(address) } catch { return notify(t('skills.unreachable', { source: address })) }
  form.reset()
  await updateSettings({ sources: [...new Set([...ownSources(), address])] })
  await browse(true)
}

/** @param {string} url an index's address */
async function removeSource(url) {
  await updateSettings({ sources: ownSources().filter((address) => indexURL(address) !== url) })
  await browse()
}

// ─── The list and the pages ──────────────────────────────────────────────────

/** Settings' Skills: the list, or the page open. */
export function section() {
  const [state, open] = [known.value, pageOpen()]
  const skill = state?.skills.find((one) => one.name === open)
  return !state ? nothing : skill ? page(skill) : open === 'add' ? html`${back('')}<header class="skill-head"><h2 tabindex="-1">${t('skills.addOne')}</h2></header>${adding(state)}`
    : open === 'sites' ? sites(state) : open.startsWith('add/') ? (shown.value ? ready(shown.value) : nothing) : listed(state)
}

/** The way back, to the list or another page. @param {string} to */
const back = (to, label = t('cap.skills.name')) => html`<button class="back button subtle" @click=${() => go(to)}>${icons.back} ${label}</button>`

/** The skill followed last, then every skill of the room, and Jean's own not added yet; with none, the ways to add one. @param {Known} state */
function listed(state) {
  const { skills, own, followed: seen } = state
  const [last] = [...seen].filter(([name]) => skills.some((skill) => skill.name === name)).sort(([, a], [, b]) => (a.at < b.at ? 1 : -1))
  const lastly = last && skills.find((skill) => skill.name === last[0])
  const more = own.filter((entry) => !skills.some((skill) => skill.name === entry.name)).length
  return html`<header class="skill-head"><h2>${t('cap.skills.name')}</h2>${skills.length ? html`<button class="button" @click=${() => go('add')}>${icons.plus} ${t('skills.addOne')}</button>` : nothing}</header>
    ${!skills.length ? html`<p class="lede">${t('skills.none')}</p>${adding(state)}` : html`
      <p class="lede">${lastly ? html`<strong dir="auto">${t('skills.last', { title: apart(shownIn(lastly, locale.value).title), when: relativeTime(new Date(last[1].at)) })}</strong> ` : nothing}${t('skills.lede')}</p>
      <ul class="list skills">${byName(skills, (skill) => shownIn(skill, locale.value).title, locale.value).map((skill) => {
        const { title, text } = shownIn(skill, locale.value)
        const from = isOff(skill) ? t('skills.off') : skill.source ? siteOf(skill.source) : ownOf(skill) ? t('skills.readyWord') : ''
        return html`<li><button class="item" data-skill=${skill.name} @click=${() => go(skill.name)}>
          <span class="item-icon ${isOff(skill) ? 'is-off' : ''}">${glyphOf(skill)}</span><span class="item-text"><strong dir="auto">${title}</strong><small dir="auto">${text}</small></span>
          ${from ? html`<span class="skill-from" dir="auto">${from}</span>` : nothing}${icons.chevron}</button></li>`
      })}</ul>
      ${more ? html`<ul class="list skills"><li><button class="item" @click=${() => go('add')}><span class="item-icon is-off">${icons.plus}</span>
        <span class="item-text"><strong>${t('skills.readyMade')}</strong><small>${t('skills.more', { count: more })}</small></span>${icons.chevron}</button></li></ul>` : nothing}`}`
}

/** A skill's page: where it came from and how often it was followed, its switch, then what it does and how. @param {Skill} skill */
function page(skill) {
  const { title } = shownIn(skill, locale.value)
  const [own, steps, beside] = [ownOf(skill), skill.body.replace(/^#\s[^\n]*\n+/, ''), known.value?.beside ?? []]
  return html`${back('')}
    <header class="skill-head"><span class="item-icon">${glyphOf(skill)}</span><div><h2 dir="auto" tabindex="-1">${title}</h2><p class="lede" dir="auto">${said(skill)}</p></div>
      <input type="checkbox" class="switch" role="switch" aria-label=${title} .checked=${!isOff(skill)} @change=${turn(skill)}></header>
    ${own ? html`<div class="ready-body">${body({ entry: own, unpacked: { body: skill.body, files: [] } })}</div>` : editing.value === skill.name ? html`
      <form class="skill-edit" @submit=${(/** @type {SubmitEvent} */ e) => change(e, skill)}>
        <label>${t('skills.when', { name: BRAND.name })}<textarea name="description" rows="2" dir="auto" required .value=${skill.description}></textarea></label>
        <label>${t('skills.steps')}<textarea name="steps" rows="10" dir="auto" required .value=${steps}></textarea></label>
        <p class="hint">${t('skills.stepsHint')}</p>
        <div class="row"><button class="button primary">${t('skills.keep')}</button><button type="button" class="button subtle" @click=${() => { editing.value = '' }}>${t('skills.cancel')}</button></div>
      </form>` : html`
      <section><h3>${t('skills.when', { name: BRAND.name })}</h3><p dir="auto">${skill.description}</p></section>
      ${skill.metadata?.example ? html`<div class="skill-try"><p dir="auto">${t('skills.example', { example: apart(skill.metadata.example) })}</p>
        <button class="button" @click=${() => ask(`/${skill.name} ${skill.metadata?.example}`)}>${icons.play} ${t('skills.try')}</button></div>` : nothing}
      <section>
        <div class="section-head"><h3>${t('skills.steps')}</h3><span class="row">
          <button class="button subtle" @click=${() => ask(t('skills.changeAsk', { skill: `/${skill.name}` }))}>${icons.brain} ${t('skills.change', { name: BRAND.name })}</button>
          <button class="button subtle" @click=${() => { editing.value = skill.name }}>${icons.compose} ${t('skills.edit')}</button></span></div>
        <div class="prose skill-steps" dir="auto">${markdown(steps)}</div>
        ${beside.length ? html`<p class="hint" dir="auto">${icons.file} ${t('skills.ready.files', { files: new Intl.ListFormat(intlLocales()).format(beside) })}</p>` : nothing}
      </section>`}
    ${editing.value === skill.name ? nothing : html`<div class="row skill-foot">
      <button class="button subtle" @click=${async () => save(new Blob([await app.fs.read(skill.path) ?? ''], { type: 'text/markdown' }), 'SKILL.md')}>${icons.download} ${t('skills.save')}</button>
      ${own ? nothing : html`<button class="button subtle danger" @click=${() => remove(skill)}>${icons.trash} ${t('skills.delete')}</button>`}
    </div>`}`
}

/** The ways to add a skill, then Jean's own by what they are for, those the room has marked so. @param {Known} state */
function adding({ skills, own }) {
  const have = (/** @type {string} */ name) => skills.some((skill) => skill.name === name)
  return html`<ul class="services skill-ways">
      <li><button class="service" @click=${() => ask(t('skills.makeAsk'))}><span class="monogram">${icons.brain}</span>
        <span><strong>${t('skills.make', { name: BRAND.name })}</strong><small>${t('skills.makeText', { name: BRAND.name })}</small></span></button></li>
      <li><label class="service"><span class="monogram">${icons.upload}</span><span><strong>${t('skills.file')}</strong><small>${t('skills.fileText')}</small></span>
        <input type="file" accept=".md,text/markdown" class="visually-hidden" @change=${fromFile}></label></li>
      <li><button class="service" @click=${() => go('sites')}><span class="monogram">${icons.globe}</span>
        <span><strong>${t('skills.site')}</strong><small>${t('skills.siteText')}</small></span></button></li>
    </ul>
    ${GROUPS.map((group) => [group, own.filter((entry) => entry.group === group)]).filter(([, entries]) => entries.length).map(([group, entries]) => html`<section>
      <h3>${t(`skills.group.${group}`)}</h3>
      <ul class="services ready-made">${byName(/** @type {typeof own} */ (entries), (entry) => shownIn(entry, locale.value).title, locale.value).map((entry) => html`<li>
        <button class="service" @click=${() => go(have(entry.name) ? entry.name : `add/${entry.name}`)}><span class="monogram" aria-hidden="true">${glyph(entry)}</span>
          <span><strong>${shownIn(entry, locale.value).title}</strong><small>${shownIn(entry, locale.value).text}</small></span>
          ${have(entry.name) ? html`<span class="skill-had">${icons.check}<span class="visually-hidden">${t('skills.had')}</span></span>` : icons.plus}</button></li>`)}</ul>
    </section>`)}`
}

/** A skill to add, read first: Jean's own or a source's, with Add this skill. @param {import('./ready.js').Shown} state */
function ready(state) {
  const site = state.entry.digest && siteOf(state.entry.url)
  return html`${site ? back('sites', t('skills.elsewhere')) : back('add', t('skills.addOne'))}
    <header class="skill-head"><span class="item-icon">${glyph(state.entry)}</span><div><h2 dir="auto" tabindex="-1">${titleOf(state)}</h2>
      <p class="lede" dir="auto">${site ? t('skills.from', { source: site }) : t('skills.readyWord')}</p></div>
      ${state.failed ? nothing : html`<button class="button primary" ?disabled=${!state.unpacked} @click=${() => add(state).then(() => go(state.entry.name))}>${icons.plus} ${t('skills.ready.add')}</button>`}</header>
    <div class="ready-body">${body(state)}</div>`
}

/** Skills from elsewhere, read when asked: each source's the room hasn't, narrowed by what is typed; a source is removed where it shows. @param {Known} state */
function sites({ skills }) {
  const words = query.value.trim().toLocaleLowerCase(locale.value)
  const offers = elsewhere.value?.map((index) => ({ index, entries: index.skills.filter((entry) => !skills.some((skill) => skill.name === entry.name)
    && `${entry.name} ${entry.description}`.toLocaleLowerCase(locale.value).includes(words)) }))
  return html`${back('add', t('skills.addOne'))}
    <header class="skill-head"><div><h2 tabindex="-1">${t('skills.elsewhere')}</h2><p class="lede">${t('skills.elsewhereText')}</p></div></header>
    <section class="sources">
      ${!offers ? html`<button class="button" @click=${(/** @type {Event} */ e) => { /** @type {HTMLButtonElement} */ (e.currentTarget).disabled = true; browse() }}>${icons.globe} ${t('skills.browse')}</button>` : html`
        ${elsewhere.value?.some((index) => index.skills.length > 6) ? html`<input type="search" class="sources-search" dir="auto" .value=${query.value}
          placeholder=${t('skills.search')} aria-label=${t('skills.search')} @input=${(/** @type {Event} */ e) => { query.value = /** @type {HTMLInputElement} */ (e.target).value }}>` : nothing}
        ${words && !offers.some(({ entries }) => entries.length) ? html`<p class="muted small">${t('find.none', { query: query.value.trim() })}</p>` : nothing}
        ${offers.filter(({ index, entries }) => entries.length || index.error || !words).map(({ index, entries }) => html`<div class="source">
          <h4>${icons.globe} <span dir="ltr">${siteOf(index.url)}</span>${locked().includes(index.url) ? html` <span class="muted small">${lockedBy()}</span>`
            : html`<button class="icon-button subtle" aria-label=${t('action.remove')} @click=${() => removeSource(index.url)}>${icons.trash}</button>`}</h4>
          ${index.error ? html`<p class="muted small">${t('skills.unreachable', { source: siteOf(index.url) })}</p>` : nothing}
          <ul class="cards">${entries.map((entry) => html`<li><button class="card" @click=${() => go(`add/${entry.name}`)}><strong dir="ltr">${entry.name}</strong><small dir="auto">${entry.description}</small></button></li>`)}</ul>
        </div>`)}
        ${app.policy.skills?.only ? nothing : html`<form class="row" @submit=${addSource}>
          <input name="address" required dir="ltr" inputmode="url" autocomplete="off" spellcheck="false" placeholder="example.com" aria-label=${t('skills.source')}>
          <button class="button">${t('skills.sourceAdd')}</button>
        </form>`}`}
    </section>`
}
