// Projects (docs/product.md, "Projects"): anything the user keeps coming back to gets its own
// folder, with its conversations, files, instructions, memory and routines, and its own light:
// the room and the little light take its colour (D78). The home project is always there; once
// projects are discovered, the conversations drawer lists them, and walking into one is a click.
// A project can be kept on this device, whatever brain Auto would otherwise pick.
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { register } from '../../ui/caps.js'
import { app, enterProject, refreshProjects } from '../../ui/state.js'
import { syncDialog, closed, close, backdrop, head } from '../../ui/dialogs.js'
import { createProject, stringifyFrontMatter } from '../../core/settings.js'
import { BRAND } from '../../brand.js'
import { t } from '../../core/i18n.js'
import { icons } from '../../ui/icons.js'

/** @typedef {import('../../ui/state.js').Project} Project */

/** A room's light: Jean's amber, then around the colour wheel. Only the hue tints the little light. */
const COLOURS = Object.entries({ amber: 54, coral: 28, rose: 355, violet: 305, blue: 255, teal: 200, green: 150, olive: 105 })
  .map(([name, hue]) => [name, `oklch(0.74 0.17 ${hue})`])

/** The project whose dialog is open: null while a new one is being made. */
const editing = signal(/** @type {Project | null} */ (null))

export function newProject() {
  editing.value = null
  app.dialog.value = 'project'
}

/** @param {Project} project */
const nameOf = (project) => (project.data.default === true ? t('projects.home') : String(project.data.name))

/** Each little light in a list shows its project's colour (CSSOM: the CSP allows no style attribute). @param {HTMLElement} host */
function tint(host) {
  for (const persona of host.querySelectorAll('app-persona[data-tint]')) /** @type {HTMLElement} */ (persona).style.setProperty('--tint', /** @type {string} */ (persona.getAttribute('data-tint')))
}

/** The list of rooms, at the top of the conversations drawer. */
class Projects extends Element {
  render() {
    const here = app.project.value
    return html`<nav class="projects" aria-label=${t('cap.projects.name')}>
      <ul>${app.projects.value.map((project) => html`<li class=${project.dir === here.dir ? 'is-current' : ''}>
        <button class="project" aria-current=${project.dir === here.dir ? 'true' : 'false'} @click=${() => enterProject(project)}>
          <app-persona data-tint=${typeof project.data.colour === 'string' ? project.data.colour : COLOURS[0][1]}></app-persona>
          <span dir="auto">${nameOf(project)}</span>
        </button>
        ${project.dir === here.dir && project.data.default !== true ? html`<button class="icon-button subtle" title=${t('projects.edit')}
          aria-label=${t('projects.edit')} @click=${() => { editing.value = project; app.dialog.value = 'project' }}>${icons.gear}</button>` : nothing}
      </li>`)}</ul>
      <button class="button subtle" @click=${newProject}>${icons.plus} ${t('projects.new')}</button>
    </nav>`
  }

  updated() {
    tint(this)
  }
}

/** @param {Project} project @param {Record<string, any>} patch @param {string[]} [drop] */
async function rewrite(project, patch, drop = []) {
  const data = Object.fromEntries(Object.entries({ ...project.data, ...patch }).filter(([key]) => !drop.includes(key)))
  await app.fs.write(`${project.dir}/project.md`, stringifyFrontMatter(data, project.body))
}

/** @param {SubmitEvent} event */
async function save(event) {
  event.preventDefault()
  const form = new FormData(/** @type {HTMLFormElement} */ (event.target))
  const name = String(form.get('name') ?? '').trim()
  const colour = String(form.get('colour') ?? COLOURS[0][1])
  const local = form.get('local') === 'on'
  if (!name) return
  let project = editing.value
  if (!project) {
    const dir = await createProject(app.fs, { name, colour, by: app.deviceId })
    await refreshProjects()
    project = app.projects.value.find((candidate) => candidate.dir === dir) ?? null
  }
  if (project) await rewrite(project, { name, colour, ...(local && { cloud: false }) }, local ? [] : ['cloud'])
  await refreshProjects()
  const entered = app.projects.value.find((candidate) => candidate.dir === project?.dir)
  if (entered) await enterProject(entered)
  close()
}

/** Deleting a project deletes its folder: conversations, files, memory and routines. @param {Project} project */
async function remove(project) {
  if (!confirm(t('projects.confirmDelete', { name: String(project.data.name) }))) return
  const home = app.projects.value.find((candidate) => candidate.data.default === true)
  if (home) await enterProject(home)
  await app.fs.remove(project.dir)
  await refreshProjects()
  close()
}

class ProjectDialog extends Element {
  render() {
    const project = editing.value
    const current = typeof project?.data.colour === 'string' ? project.data.colour : COLOURS[0][1]
    return html`<dialog class="sheet project-dialog" @close=${closed('project')} @click=${backdrop}>
      ${head(t(project ? 'projects.edit' : 'projects.new'))}
      <p class="lede">${t('cap.projects.text', { name: BRAND.name })}</p>
      <form class="stack" @submit=${save}>
        <label>${t('projects.name')}
          <input name="name" required maxlength="80" dir="auto" autocomplete="off" autofocus .value=${live(project ? String(project.data.name) : '')}>
        </label>
        <fieldset class="swatches">
          <legend>${t('projects.colour')}</legend>
          ${COLOURS.map(([name, value]) => html`<label class="swatch" title=${t(`colour.${name}`)}>
            <input type="radio" name="colour" value=${value} .checked=${live(value === current)}>
            <app-persona data-tint=${value}></app-persona><span class="visually-hidden">${t(`colour.${name}`)}</span>
          </label>`)}
        </fieldset>
        <label class="toggle">
          <input type="checkbox" name="local" .checked=${live(project?.data.cloud === false)}>
          <span>${t('projects.local')}</span>
        </label>
        <button class="button primary">${t(project ? 'projects.save' : 'projects.create')}</button>
      </form>
      ${project ? html`<button class="button subtle danger" @click=${() => remove(project)}>${icons.trash} ${t('projects.delete')}</button>` : nothing}
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
