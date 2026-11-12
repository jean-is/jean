// SPDX-License-Identifier: MIT
// When rounds run (D157, D721), Sync's with its folder and the store's with the relay alike: as Jean opens, every minute while it is
// on screen, as it goes out of sight or comes back, and two seconds after Jean's files change here, in any of its tabs, each change
// putting the round off until they settle; one tab and one round at a time (a Web Lock), a round asked for meanwhile coming soon
// after. A kind of round that sends outside this device starts none while an answer is written, in this tab or another, which holds
// `app-answering` meanwhile, so that what About this answer counts is the answer's alone (caps/receipt). What came in shows where
// the person is, with nothing to answer.
import { effect } from '@preact/signals-core'
import { app, refreshProjects, refreshConversations } from '../../ui/state.js'
import { unlock, loaded as capabilities } from '../../ui/caps.js'
import { mine } from '../../ui/opfs.js'
import { loadConversation } from '../../core/conversations.js'
import { settleHomes } from './mirror.js'

/** A kind of round: what it carries, whether it sends outside this device, and its round, which gives the paths that came in. @typedef {{ carry: (path: string) => boolean, outside?: boolean, run: () => Promise<string[]> }} Kind */

/** @type {Set<Kind>} */
const kinds = new Set()
let soon = /** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined)
/** A round once changes settle. */
export const later = () => { clearTimeout(soon); soon = setTimeout(round, 2000) }

/** Whether an answer is being written, in this tab or another of this profile's. */
export const answering = async () => app.running.peek().length > 0 || Boolean((await navigator.locks.query()).held?.some((one) => one.name === mine('app-answering')))

/** A round of each kind, one after the other, unless another tab is having one: then soon after. */
export const round = () => navigator.locks.request(mine('app-rounds'), { ifAvailable: true }, async (lock) => {
  if (!lock) return void later()
  for (const kind of [...kinds]) {
    if (kind.outside && await answering()) continue
    const came = await kind.run().catch((error) => { console.warn('Rounds', error); return [] })
    if (came.length) await show(came)
  }
})

/** Rounds of a kind from now on, the first soon; gives what stops them. @param {Kind} kind */
export function rounds(kind) {
  kinds.add(kind)
  later()
  return () => void kinds.delete(kind)
}

/**
 * What came in shows: the projects (and Projects, Memory and Skills when what they keep came), the
 * room's conversations, and the one on screen unless it is being answered, which closes if it went. @param {string[]} came
 */
async function show(came) {
  await settleHomes(app.fs)
  await refreshProjects()
  const home = app.projects.value.find((project) => project.data.default === true)
  if (home && !app.projects.value.some((project) => project.dir === app.projectDir)) app.project.value = home
  await refreshConversations()
  if (app.projects.value.some((project) => !project.data.default)) unlock('projects')
  if (came.some((path) => path.endsWith('memory.md'))) unlock('memory')
  if (came.some((path) => /(^|\/)skills\//.test(path))) unlock('skills')
  // Collections changed on the other device, read again wherever they are drawn: a view, a document, a page's parts (D633).
  if (capabilities.peek().has('tables') && came.some((path) => path.includes('/collections/'))) await (await import('../tables/tables.js')).came(came)
  const current = app.current.peek()
  if (!current || !came.includes(current.path) || app.running.peek().includes(current.path)) return
  const loaded = await loadConversation(app.fs, current.path).catch(() => null)
  if (app.current.peek() === current) app.current.value = loaded && { ...current, records: loaded.records }
}

// While this tab answers, it holds `app-answering`, shared, so that the other tabs' rounds wait too; once it is done, a round soon.
let release = /** @type {(() => void) | null} */ (null)
effect(() => {
  const busy = app.running.value.length > 0
  if (busy && !release) { const done = new Promise((resolve) => { release = () => resolve(undefined) }); navigator.locks.request(mine('app-answering'), { mode: 'shared' }, () => done) }
  if (!busy) { release?.(); release = null; later() }
})
if (globalThis.document) {
  setInterval(() => document.visibilityState === 'visible' && round(), 60_000)
  // Going out of sight sends what was done; coming back brings what the other devices did.
  document.addEventListener('visibilitychange', () => round())
  // What changes here goes soon, in this tab or another: an answer, a task deleted, a document, memory, a collection.
  app.fs.watch?.((path) => [...kinds].some((kind) => kind.carry(path)) && later(), { all: true })
}
