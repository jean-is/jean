// Settings' Ideas (D743): how the ideas under the box are chosen, then a row for everywhere and one for each project, each
// opening its list, starters/all or starters/<the project's ULID>: each idea's words and request, moved up or down or removed,
// and a new one; on the list of the project the room is in, what is often asked there, kept or hidden. Without Projects, the
// one list is the section. Under the organisation's `only`, theirs, which no one changes.
import { html, nothing } from 'lit-html'
import { effect } from '@preact/signals-core'
import { app } from '../../ui/state.js'
import { loaded } from '../../ui/caps.js'
import { sectionOpen, pageOpen, lockedBy, valueOf as value } from '../../ui/dialogs.js'
import { fresh, worded } from './learn.js'
import { t, useStrings, intlLocales, locale } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { EVERYWHERE, fileOf, lists, read, change, kept, noticed } from './starters.js'

await Promise.all([useStrings('starters'), styleSheet(new URL('starters.css', import.meta.url))])

/** The projects with lists of their own, once Projects is found. */
const projects = () => (loaded.value.has('projects') ? app.projects.value.filter((project) => project.data.default !== true) : [])
effect(() => { if (app.dialog.value === 'settings' && sectionOpen() === 'starters') for (const project of projects()) void read(fileOf(project)) })

/** Opens the list ('') or a list's page, the keyboard on its title, or back on its row. @param {string} to */
function go(to) {
  const from = pageOpen()
  app.section.value = to ? `starters/${to}` : 'starters'
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '.starters-head h2' : `[data-list="${from}"]`))?.focus())
}

/** Settings' Ideas: how they are chosen and the lists, a list's page, or the organisation's alone. */
export function section() {
  const [open, theirs] = [pageOpen(), app.policy.starters]
  if (theirs?.only) return html`${head(t('cap.starters.name'), t('starters.text'))}<p class="small">${icons.lock} ${lockedBy()}</p>
    <ul class="list starters-theirs">${(theirs.list ?? []).map((/** @type {Record<string, string>} */ item) => html`<li><span class="item-text"><strong dir="auto">${worded(item, locale.value).title}</strong>
      <small dir="auto">${worded(item, locale.value).prompt}</small></span></li>`)}</ul>`
  const project = projects().find((one) => one.id === open)
  if (project || open === 'all' || !projects().length) return page(project, Boolean(open))
  const names = new Intl.ListFormat(intlLocales(), { type: 'unit' })
  return html`${head(t('cap.starters.name'), t('starters.text'))}${theirs?.list ? html`<p class="small">${t('starters.theirs')}</p>` : nothing}
    <section><ul class="list starters-lists">${[{ id: 'all', name: t('starters.everywhere'), file: EVERYWHERE }, ...projects().map((one) => ({ id: one.id, name: String(one.data.name ?? ''), file: fileOf(one) }))].map(({ id, name, file }) => {
      const ideas = (lists.value[file]?.ideas ?? []).filter((idea) => idea.title.trim())
      return html`<li><button class="item" data-list=${id} @click=${() => go(id)}><span class="item-icon">${icons[id === 'all' ? 'lamp' : 'layers']}</span>
        <span class="item-text"><strong dir="auto">${name}</strong><small dir="auto">${ideas.length ? names.format(ideas.map((idea) => idea.title)) : t('starters.none')}</small></span>${icons.chevron}</button></li>`
    })}</ul></section>`
}

/** The section's title or a page's, with what it says, and the way back from a page. @param {string} title @param {string} said @param {boolean} [back] */
const head = (title, said, back = false) => html`${back ? html`<button class="back button subtle" @click=${() => go('')}>${icons.back} ${t('cap.starters.name')}</button>` : nothing}
  <header class="starters-head"><h2 dir="auto" tabindex="-1">${title}</h2><p class="lede">${said}</p></header>`

/**
 * A list's page: everywhere's, or a project's. Each idea's words and request, kept as they change, then a new one; and in the
 * project the room is in, what is often asked there. @param {import('../../core/settings.js').Project | undefined} project @param {boolean} back
 */
function page(project, back) {
  const file = project ? fileOf(project) : EVERYWHERE
  const { ideas = [], hidden = [] } = lists.value[file] ?? {}
  /** @param {string} id @param {Record<string, string>} patch */
  const edit = (id, patch) => change(file, (list) => ({ ...list, ideas: list.ideas.map((one) => (one.id === id ? { ...one, ...patch, updatedAt: new Date().toISOString() } : one)) }))
  /** @param {string} id @param {number} by */
  const move = (id, by) => change(file, (list) => {
    const moved = [...list.ideas], at = moved.findIndex((one) => one.id === id)
    moved.splice(at + by, 0, ...moved.splice(at, 1))
    return { ...list, ideas: moved }
  })
  const add = () => change(file, (list) => ({ ...list, ideas: [...list.ideas, kept('', '')] }))
    .then(() => requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector('.starters-kept > li:last-child input'))?.focus()))
  // What is often asked in the project the room is in: kept, it is the person's, and no longer shows as noticed.
  const often = fileOf(app.project.value) === file ? fresh(noticed.value, [...hidden, ...ideas.flatMap((idea) => idea.from ?? [])]) : null
  /** @param {import('./learn.js').Idea} idea @param {boolean} keep */
  const take = (idea, keep) => change(file, (list) => (keep ? { ...list, ideas: [...list.ideas, { ...kept(idea.title, idea.prompt), from: idea.keys }] } : { ...list, hidden: [...list.hidden, ...idea.keys ?? []] }))
  return html`${head(project ? String(project.data.name ?? '') : back ? t('starters.everywhere') : t('cap.starters.name'), t(project ? 'starters.first' : back ? 'starters.everywhere.text' : 'starters.text'), back)}
    ${ideas.length ? html`<ol class="list starters-kept">${ideas.map((idea, i) => html`<li>
      <label for=${`idea-${idea.id}`}>${t('starters.words')}<input id=${`idea-${idea.id}`} dir="auto" maxlength="60" .value=${idea.title} @change=${(/** @type {Event} */ e) => edit(idea.id, { title: value(e) })}></label>
      <label for=${`request-${idea.id}`}>${t('starters.request')}<textarea id=${`request-${idea.id}`} rows="2" dir="auto" .value=${idea.prompt} @change=${(/** @type {Event} */ e) => edit(idea.id, { prompt: value(e) })}></textarea></label>
      <div class="row">
        <button class="icon-button subtle is-up" aria-label=${t('starters.up', { title: idea.title })} ?disabled=${i === 0} @click=${() => move(idea.id, -1)}>${icons.chevron}</button>
        <button class="icon-button subtle" aria-label=${t('starters.down', { title: idea.title })} ?disabled=${i === ideas.length - 1} @click=${() => move(idea.id, 1)}>${icons.chevron}</button>
        <button class="icon-button subtle" aria-label=${t('starters.remove', { title: idea.title })} @click=${() => change(file, (list) => ({ ...list, ideas: list.ideas.filter((one) => one.id !== idea.id) }))}>${icons.trash}</button>
      </div></li>`)}</ol>` : html`<p class="muted small">${t('starters.none')}</p>`}
    <div class="row starters-add"><button class="button" @click=${add}>${icons.plus} ${t('starters.add')}</button></div>
    ${often ? html`<section><h3>${t('starters.noticed')}</h3><p class="small">${t('starters.noticed.text')}</p>
      ${often.length ? html`<ul class="list starters-noticed">${often.map((idea, i) => html`<li><span class="item-text" id=${`noticed-${i}`}><strong dir="auto">${idea.title}</strong>
        <small dir="auto">${idea.prompt || t('cap.flows.name')}</small></span>
        ${idea.prompt ? html`<button class="button subtle" aria-describedby=${`noticed-${i}`} @click=${() => take(idea, true)}>${t('starters.keep')}</button>` : nothing}
        <button class="button subtle" aria-describedby=${`noticed-${i}`} @click=${() => take(idea, false)}>${t('starters.hide')}</button></li>`)}</ul>` : html`<p class="muted small">${t('starters.noticed.none')}</p>`}
      ${hidden.length ? html`<button class="link-button" @click=${() => change(file, (list) => ({ ...list, hidden: [] }))}>${t('starters.unhide')}</button>` : nothing}</section>` : nothing}`
}
