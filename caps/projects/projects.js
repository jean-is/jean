// Projects (docs/product.md, "Projects"): anything the user keeps coming back to gets its own
// folder, with its conversations, files, instructions, memory and skills, and its own light:
// the room and the little light take its colour (D78). The home project is always there; once
// projects are discovered, the header shows the one the user is in, and opens on the others.
// A project can be kept on this device, whatever brain Auto would otherwise pick.
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { register, loaded } from '../../ui/caps.js'
import { app, enterProject, refreshProjects, newConversation, turnPage } from '../../ui/state.js'
import { syncDialog, closed, close, backdrop, head } from '../../ui/dialogs.js'
import { createProject, stringifyFrontMatter } from '../../core/settings.js'
import { BRAND } from '../../brand.js'
import { t } from '../../core/i18n.js'
import { icons } from '../../ui/icons.js'
import { SHORTCUTS } from '../../ui/shell.js'

/** @typedef {import('../../core/settings.js').Project} Project */

/** A room's light: Jean's amber, then around the colour wheel. Only the hue tints the little light. */
const COLOURS = Object.entries({ amber: 54, coral: 28, rose: 355, violet: 305, blue: 255, teal: 200, green: 150, olive: 105 })
  .map(([name, hue]) => [name, `oklch(0.74 0.17 ${hue})`])

/** The project whose dialog is open: null while a new one is being made. */
const editing = signal(/** @type {Project | null} */ (null))

/** Opens a project's dialog, or a new one's. @param {Project | null} [project] */
export function editProject(project = null) {
  editing.value = project
  app.dialog.value = 'project'
}

/** The home project is the assistant's own room, and goes by its name. @param {Project} project */
const nameOf = (project) => String(project.data.default === true ? project.data.assistantName || BRAND.name : project.data.name)

/** Each little light in a list shows its project's colour (CSSOM: the CSP allows no style attribute). @param {HTMLElement} host */
function tint(host) {
  for (const persona of host.querySelectorAll('app-persona[data-tint]')) /** @type {HTMLElement} */ (persona).style.setProperty('--tint', /** @type {string} */ (persona.getAttribute('data-tint')))
}

/**
 * The header, once projects are on: the room the user is in, which opens a menu to start a
 * conversation, walk into another room, make one, or set this one up.
 */
class Projects extends Element {
  render() {
    const here = app.project.value
    return html`<button class="wordmark" popovertarget="project-menu" title=${t('cap.projects.name')}>
        <app-persona></app-persona><span dir="auto">${nameOf(here)}</span>${icons.chevron}
      </button>
      <div id="project-menu" class="menu project-menu" popover>
        <button type="button" popovertarget="project-menu" popovertargetaction="hide" aria-keyshortcuts=${SHORTCUTS.new}
          @click=${() => turnPage(newConversation)}>${icons.compose}${t('action.new')}</button>
        <hr>
        ${app.projects.value.map((project) => html`<button type="button" class="project" popovertarget="project-menu" popovertargetaction="hide"
          aria-current=${project.dir === here.dir ? 'true' : 'false'} @click=${() => enterProject(project)}>
          <app-persona data-tint=${typeof project.data.colour === 'string' ? project.data.colour : COLOURS[0][1]}></app-persona>
          <span dir="auto">${nameOf(project)}</span>
        </button>`)}
        <hr>
        <button type="button" popovertarget="project-menu" popovertargetaction="hide" @click=${() => editProject()}>${icons.folder}${t('projects.new')}</button>
        ${here.data.default !== true ? html`<button type="button" popovertarget="project-menu" popovertargetaction="hide"
          @click=${() => editProject(here)}>${icons.gear}${t('projects.edit')}</button>` : nothing}
      </div>`
  }

  updated() {
    tint(this)
  }
}

/** @param {Project} project @param {Record<string, any>} patch @param {string[]} [drop] @param {string} [body] how its assistant should be */
async function rewrite(project, patch, drop = [], body = project.body) {
  const data = Object.fromEntries(Object.entries({ ...project.data, ...patch }).filter(([key]) => !drop.includes(key)))
  await app.fs.write(`${project.dir}/project.md`, stringifyFrontMatter(data, body))
}

/** @param {SubmitEvent} event */
async function save(event) {
  event.preventDefault()
  const form = new FormData(/** @type {HTMLFormElement} */ (event.target))
  const name = String(form.get('name') ?? '').trim()
  const colour = String(form.get('colour') ?? COLOURS[0][1])
  const local = form.get('local') === 'on'
  // Its assistant's name, and how it should be (assistant names, once discovered).
  const named = form.has('assistant')
  const assistant = String(form.get('assistant') ?? '').trim()
  const persona = String(form.get('persona') ?? '').trim()
  if (!name) return
  let project = editing.value
  if (!project) {
    const dir = await createProject(app.fs, { name, colour, by: app.deviceId })
    await refreshProjects()
    project = app.projects.value.find((candidate) => candidate.dir === dir) ?? null
  }
  const drop = [...(local ? [] : ['cloud']), ...(named && !assistant ? ['assistantName'] : [])]
  if (project) await rewrite(project, { name, colour, ...(local && { cloud: false }), ...(assistant && { assistantName: assistant }) }, drop, named ? (persona && `${persona}\n`) : project.body)
  await refreshProjects()
  const entered = app.projects.value.find((candidate) => candidate.dir === project?.dir)
  if (entered) await enterProject(entered)
  close()
}

/** Deleting a project deletes its folder: conversations, files, memory and skills. @param {Project} project */
async function remove(project) {
  if (!confirm(t('projects.confirmDelete', { name: String(project.data.name) }))) return
  const home = app.projects.value.find((candidate) => candidate.data.default === true)
  if (home) await enterProject(home)
  await app.fs.remove(project.dir)
  await refreshProjects()
  close()
}

// A project's dialog (D182): who it is first, its light as it will look beside its name and the
// colours to pick from; then its assistant, then where it is kept. Its actions stay at its foot.
class ProjectDialog extends Element {
  render() {
    const project = editing.value
    const current = typeof project?.data.colour === 'string' ? project.data.colour : COLOURS[0][1]
    return html`<dialog class="sheet project-dialog" @close=${closed('project')} @click=${backdrop}>
      ${head(t(project ? 'projects.edit' : 'projects.new'))}
      <form id="project-form" class="project-form" @submit=${save}>
        ${project ? nothing : html`<p class="lede">${t('cap.projects.text', { name: BRAND.name })}</p>`}
        <div class="project-identity">
          <app-persona class="project-light" data-tint=${current}></app-persona>
          <label>${t('projects.name')}
            <input name="name" required maxlength="80" dir="auto" autocomplete="off" autofocus .value=${live(project ? String(project.data.name) : '')}>
          </label>
          <fieldset class="swatches" @change=${(/** @type {Event} */ e) => /** @type {HTMLElement} */ (this.querySelector('.project-light')).style.setProperty('--tint', /** @type {HTMLInputElement} */ (e.target).value)}>
            <legend class="visually-hidden">${t('projects.colour')}</legend>
            ${COLOURS.map(([name, value]) => html`<label class="swatch" title=${t(`colour.${name}`)}>
              <input type="radio" name="colour" value=${value} .checked=${live(value === current)}>
              <app-persona data-tint=${value}></app-persona><span class="visually-hidden">${t(`colour.${name}`)}</span>
            </label>`)}
          </fieldset>
        </div>
        ${loaded.value.has('names') ? html`<section class="stack">
          <label>${t('projects.assistant')}
            <input name="assistant" maxlength="40" dir="auto" autocomplete="off" placeholder=${BRAND.name} .value=${live(String(project?.data.assistantName ?? ''))}>
          </label>
          <label>${t('projects.persona')}
            <textarea name="persona" rows="2" maxlength="300" dir="auto" placeholder=${t('projects.personaHint')} .value=${live(project?.body.trim() ?? '')}></textarea>
          </label>
        </section>` : nothing}
        <section class="stack">
          <label class="setting">${t('projects.local')}<input type="checkbox" class="switch" role="switch" name="local" .checked=${live(project?.data.cloud === false)}></label>
          ${project && loaded.value.has('folders') ? html`<app-folder-field .project=${project}></app-folder-field>` : nothing}
        </section>
      </form>
      <footer class="dialog-foot">
        ${project ? html`<button class="button subtle danger" @click=${() => remove(project)}>${icons.trash} ${t('projects.delete')}</button>` : nothing}
        <button class="button primary" form="project-form">${t(project ? 'projects.save' : 'projects.create')}</button>
      </footer>
    </dialog>`
  }

  updated() {
    syncDialog(this, 'project')
    tint(this)
  }
}

define('app-projects', Projects)
define('app-project-dialog', ProjectDialog)
register({ id: 'projects' })
