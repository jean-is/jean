// "Find a skill" (D120): the skills published at the places in settings or policy, searched on
// the device. A skill is read before it is added, and added only as its publisher listed it,
// with where it came from. Loaded the first time the dialog opens.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { app, updateSettings, notify } from '../../ui/state.js'
import { syncDialog, closed, backdrop, head } from '../../ui/dialogs.js'
import { markdown } from '../../ui/markdown.js'
import { saveSkill } from '../../core/skills.js'
import { openingOf } from '../../core/events.js'
import { skills, folders } from './skills.js'
import { indexURL, places, refreshIndexes, cachedIndexes, offered, searchSkills, fetchSkill, SkillError } from './sources.js'
import { BRAND } from '../../brand.js'
import { t } from '../../core/i18n.js'
import { icons } from '../../ui/icons.js'

/** @typedef {import('./sources.js').Entry} Entry */
/** @typedef {import('../../core/skills.js').Skill} Skill */

const indexes = signal(/** @type {Record<string, import('./sources.js').Index>} */ ({}))
const query = signal('')
const installed = signal(/** @type {Skill[]} */ ([]))
/** The skill being read before it is added. */
const reading = signal(/** @type {{ entry: Entry, skill?: Skill } | null} */ (null))
const message = signal(/** @type {{ kind: 'busy' | 'error', text: string } | null} */ (null))

const where = () => places(app.settings.value, app.policy)
const host = (/** @type {string} */ url) => new URL(url).host
const have = (/** @type {Entry} */ entry) => installed.value.some((skill) => skill.source === entry.url)

/** What was read before at once, then the places a day old read again. */
async function load() {
  installed.value = await skills()
  indexes.value = await cachedIndexes(app.fs)
  const urls = where()
  if (urls.length) indexes.value = { ...indexes.value, ...await refreshIndexes(app.fs, urls) }
}

effect(() => {
  if (app.dialog.value === 'skills') queueMicrotask(load)
})

/** Opens on the skills that may do what a request asks: by default, the one that opened this conversation. @param {string} [text] */
export function findFor(text = openingOf(app.current.value?.records ?? [])) {
  query.value = text
  reading.value = null
  app.dialog.value = 'skills'
}

/** @param {SubmitEvent} event */
async function addPlace(event) {
  event.preventDefault()
  const form = /** @type {HTMLFormElement} */ (event.target)
  const url = indexURL(String(new FormData(form).get('address') ?? ''))
  message.value = { kind: 'busy', text: t('brain.connecting') }
  const read = url ? await refreshIndexes(app.fs, [url], { force: true }) : {}
  if (!url || !read[url].entries?.length) return (message.value = { kind: 'error', text: t('skills.placeFailed') })
  indexes.value = { ...indexes.value, ...read }
  message.value = null
  form.reset()
  if (!where().includes(url)) await updateSettings({ skillIndexes: [...(app.settings.value.skillIndexes ?? []), url] })
}

/** @param {string} url */
const removePlace = (url) => updateSettings({ skillIndexes: (app.settings.value.skillIndexes ?? []).filter((other) => other !== url) })

/** Fetches a skill to read it: only the one its publisher listed. @param {Entry} entry */
async function look(entry) {
  message.value = null
  reading.value = { entry }
  try {
    const skill = await fetchSkill(entry)
    if (reading.value?.entry === entry) reading.value = { entry, skill }
  } catch (error) {
    console.warn(entry.url, error)
    reading.value = null
    message.value = { kind: 'error', text: t(error instanceof SkillError && error.code === 'changed' ? 'skills.changed' : 'skills.unreadable', { name: BRAND.name }) }
  }
}

/** @param {Skill} skill */
async function add(skill) {
  const same = installed.value.find((other) => other.name === skill.name)
  if (same && same.source !== skill.source && !confirm(t('skills.replace', { title: same.title }))) return
  await saveSkill(app.fs, folders().at(-1) ?? '', { ...skill, by: app.deviceId })
  installed.value = await skills()
  reading.value = null
  notify(t('skills.added', { title: skill.title }))
}

/** @param {{ entry: Entry, skill?: Skill }} open */
function reader({ entry, skill }) {
  return html`<article class="reader">
    ${skill ? html`<h3 dir="auto">${skill.title}</h3>
      <p class="muted small" dir="auto">${skill.description}</p>
      <p class="hint">${t('skills.from', { place: host(entry.url) })}${skill.license ? html` · <bdi>${skill.license}</bdi>` : nothing}</p>
      <section class="prose reader-steps" dir="auto" aria-label=${t('skills.steps')}>${markdown(skill.body.replace(/^#\s+.+\n*/, ''))}</section>
      <div class="row">
        <button class="button primary" ?disabled=${have(entry)} @click=${() => add(skill)}>${t(have(entry) ? 'skills.have' : 'skills.addThis')}</button>
        <button class="button subtle" @click=${() => { reading.value = null }}>${t('skills.back')}</button>
      </div>` : html`<p class="muted" role="status">${t('brain.connecting')}</p>`}
  </article>`
}

class Finder extends Element {
  render() {
    const urls = where()
    const mine = app.settings.value.skillIndexes ?? []
    const { usable, other } = offered(indexes.value, urls)
    const found = searchSkills(query.value, usable)
    const shown = message.value
    return html`<dialog class="sheet finder" @close=${closed('skills')} @click=${backdrop}>
      ${head(t('skills.find'))}
      ${reading.value ? reader(reading.value) : html`
        <p class="lede">${t('skills.findText', { name: BRAND.name })}</p>
        ${usable.length ? html`<input type="search" class="finder-search" dir="auto" .value=${query.value} placeholder=${t('skills.search')}
          aria-label=${t('skills.search')} @input=${(/** @type {Event} */ e) => { query.value = /** @type {HTMLInputElement} */ (e.target).value }}>` : nothing}
        ${shown ? html`<p class="status is-${shown.kind}" role="status">${shown.text}</p>` : nothing}
        ${found.length ? html`<ul class="services">${found.map((entry) => html`<li><button class="service" @click=${() => look(entry)}>
          <span><strong dir="auto">${entry.name[0].toUpperCase()}${entry.name.slice(1).replace(/-/g, ' ')}</strong><small dir="auto">${entry.description}</small>
            <small>${have(entry) ? html`${t('skills.have')} · ` : nothing}<bdi>${host(entry.url)}</bdi></small></span>
        </button></li>`)}</ul>` : html`<p class="muted">${t(urls.length ? 'skills.nothing' : 'skills.nowhere')}</p>`}
        ${other ? html`<p class="hint">${t('skills.more', { count: other, name: BRAND.name })}</p>` : nothing}
        <details class="other" ?open=${!urls.length}>
          <summary>${t('skills.places')}</summary>
          ${urls.length ? html`<section class="connected"><ul>${urls.map((url) => html`<li class="connection">${icons.globe}
            <span class="connection-text"><strong dir="ltr">${host(url)}</strong>
              <small>${indexes.value[url]?.error ? t('skills.placeFailed') : t('skills.count', { count: indexes.value[url]?.entries?.length ?? 0 })}</small></span>
            ${mine.includes(url) ? html`<button class="icon-button subtle" aria-label=${t('action.remove')} title=${t('action.remove')}
              @click=${() => removePlace(url)}>${icons.trash}</button>` : html`<small class="hint">${t('policy.locked')}</small>`}
          </li>`)}</ul></section>` : nothing}
          <form class="stack" @submit=${addPlace}>
            <label>${t('skills.place')}<input name="address" required dir="ltr" placeholder="example.com" autocomplete="off" spellcheck="false"></label>
            <button class="button" ?disabled=${shown?.kind === 'busy'}>${t('skills.placeAdd')}</button>
          </form>
        </details>`}
    </dialog>`
  }

  updated() {
    syncDialog(this, 'skills')
    if (app.dialog.value !== 'skills' && message.value?.kind === 'error') message.value = null
  }
}

define('app-skill-finder', Finder)
