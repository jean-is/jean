// Ideas (D743): what shows under the box on a new task, four at most (./learn.js): the project's own, then the person's for
// everywhere, then what Jean noticed on this device in the project, requests asked again and its flows. Each list is a file,
// starters.json, at the root for everywhere and the home project, in its folder for another; what was noticed and hidden, or
// kept, is hidden there by its keys. With none, the organisation's, policy's `starters`, in the person's language, which
// turns this on (ui/discovery.js), and under its `only` theirs alone; else null, for the box's own. Settings' Ideas (./page.js) changes them.
import { signal, effect, computed } from '@preact/signals-core'
import { register, loaded } from '../../ui/caps.js'
import { lazyPage } from '../../ui/lazy-page.js'
import { app } from '../../ui/state.js'
import { SAME_KIND } from '../../ui/discovery.js'
import { readJSON, writeJSON } from '../../core/fs.js'
import { ulid } from '../../core/ulid.js'
import { icons } from '../../ui/menu-icons.js'
import { locale } from '../../core/i18n.js'
import { again, shown, worded } from './learn.js'

/** An idea the person keeps. @typedef {{ id: string, title: string, prompt: string, by: string, createdAt: string, updatedAt: string, from?: string[] }} Kept */
/** A list as its file holds it. @typedef {{ format: 1, ideas: Kept[], hidden: string[] }} List */

/** Where a project's list is: the home project's is everywhere's, at the root. @param {{ dir: string, data: Record<string, unknown> }} project */
export const fileOf = (project) => (project.data.default === true ? EVERYWHERE : `${project.dir}/starters.json`)
export const EVERYWHERE = 'starters.json'

/** The lists read, by file. */
export const lists = signal(/** @type {Record<string, List>} */ ({}))
/** @param {string} file @returns {Promise<List>} */
export async function read(file) {
  const list = { format: /** @type {const} */ (1), ideas: [], hidden: [], ...(await readJSON(app.fs, file, null).catch(() => null)) }
  lists.value = { ...lists.peek(), [file]: list }
  return list
}
let changing = Promise.resolve()
/** Changes a list as its file holds it now, changes one after the other. @param {string} file @param {(list: List) => List} change */
export const change = (file, change) => (changing = changing.then(async () => {
  const list = change(await read(file))
  await writeJSON(app.fs, file, list)
  lists.value = { ...lists.peek(), [file]: list }
}).catch((error) => console.warn('Ideas', error)))
/** An idea of the person's. @param {string} title @param {string} prompt @returns {Kept} */
export const kept = (title, prompt, now = new Date().toISOString()) => ({ id: ulid(), title, prompt, by: app.deviceId, createdAt: now, updatedAt: now })

/** Flows, once found, for the project's. */
const flows = signal(/** @type {typeof import('../flows/flows.js') | null} */ (null))
effect(() => { if (loaded.value.has('flows') && !flows.peek()) import('../flows/flows.js').then((module) => { flows.value = module }) })

/** What Jean noticed in the room's project: requests asked again, then its flows, which open where Run is. */
export const noticed = computed(() => [...again(app.conversations.value, SAME_KIND), ...(flows.value?.flows.value ?? [])
  .map((flow) => ({ title: flow.name, prompt: '', keys: [`flow:${flow.id}`], open: () => flows.value?.edit(flow.id) }))])

effect(() => {
  const project = app.project.value
  void read(fileOf(project))
  if (fileOf(project) !== EVERYWHERE) void read(EVERYWHERE)
})

register({
  id: 'starters',
  slots: {
    // None while the lists are read, rather than Jean's for a moment.
    ideas: { at: 1, draw: () => {
      const [own, everywhere, theirs] = [lists.value[fileOf(app.project.value)], lists.value[EVERYWHERE], app.policy.starters]
      const words = theirs?.list?.map((/** @type {Record<string, string>} */ item) => worded(item, locale.value)) ?? null
      return theirs?.only ? words : !own || !everywhere ? [] : shown({ own: own.ideas, everywhere: own === everywhere ? [] : everywhere.ideas, noticed: noticed.value, hidden: own.hidden }) ?? words
    } },
    settings: { id: 'starters', at: 55, label: 'cap.starters.name', icon: icons.lamp, draw: lazyPage(() => import('./page.js')) },
  },
})
