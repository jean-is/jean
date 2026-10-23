// The address keeps the minimum to come back to the same place: the open conversation, in the
// home project (#/c/<ulid>) or another one (#/p/<ulid>/c/<ulid>; #/p/<ulid>/ is a new one there),
// Settings over it (D137), on a section or one of its pages (settings/routines/<ulid>, D509), and the windows beside it (D220, ui/windows.js), so reloading, sharing
// the tab or going back shows the same content (D59). The unsent draft survives a reload too, per
// place, in this tab only (sessionStorage).
import { effect, signal } from '@preact/signals-core'
import { app, openConversation, newConversation, enterProject, turnPage } from './state.js'
import { join } from '../core/fs.js'
import { unlock } from './caps.js'

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
const ADDRESS = /^#\/(?:p\/([^/?#]+)\/?)?(?:c\/([^/?#]+)\/?)?(settings(?:\/([a-z]+(?:\/\w+)?))?)?/
const DRAFTS = 'app.drafts'

/** The project and conversation an address names (null for the home project, or a new conversation). @param {string} hash */
export function placeIn(hash) {
  const [, project = '', conversation = ''] = ADDRESS.exec(hash) ?? []
  const valid = (/** @type {string} */ id) => (ULID.test(id) ? id : null)
  return { project: valid(project), conversation: valid(conversation) }
}

/** @param {string} hash @returns {string | null} the section of Settings open over the place */
export function settingsIn(hash) {
  const [, , , open, section] = ADDRESS.exec(hash) ?? []
  return open ? section ?? 'general' : null
}

/** @param {import('../core/settings.js').Project} project @param {string | null} id */
export function hashFor(project, id) {
  const base = project.data.default === true || !project.id ? '#/' : `#/p/${project.id}/`
  return id ? `${base}c/${id}` : base
}

/** @param {string} place @param {string | null} section */
export const withSettings = (place, section) => (section ? `${place.replace(/\/?$/, '/')}settings${section === 'general' ? '' : `/${section}`}` : place)

/** The windows beside the place, as ui/windows.js writes them. */
export const beside = signal('')

/** @param {string} a @param {string} b */
const samePlace = (a, b) => JSON.stringify(placeIn(a)) === JSON.stringify(placeIn(b))
const place = () => hashFor(app.project.value, app.current.value?.id ?? null)
const here = () => withSettings(place(), app.dialog.value === 'settings' ? app.section.value : null) + (beside.value && `?${beside.value}`)

let following = false
let backing = false

/** Opens what the address points at, with its windows unless it stays in the place; an unknown project or conversation falls back to a new one at home. */
async function follow(windows = true, hash = location.hash) {
  const asked = /\?(.*)/.exec(hash)?.[1] ?? ''
  following = true
  try {
    const { project: id, conversation } = placeIn(hash)
    const projects = app.projects.value
    const project = projects.find((candidate) => candidate.id === id) ?? projects.find((candidate) => candidate.data.default === true)
    if (project) await enterProject(project)
    if (conversation && conversation !== app.current.value?.id) {
      const known = app.conversations.value.find((item) => item.id === conversation)
      await openConversation(known?.path ?? join(app.projectDir, 'conversations', `${conversation}.jsonl`)).catch(console.warn)
    }
    if ((app.current.value?.id ?? null) !== conversation) newConversation()
    const section = settingsIn(hash)
    if (section) app.section.value = section
    if (section || app.dialog.value === 'settings') app.dialog.value = section ? 'settings' : null
    if (windows && (asked || beside.peek())) {
      beside.value = asked
      import('./windows.js').then((module) => module.follow(asked))
    }
  } finally {
    following = false
    if (location.hash === hash) write(true)
  }
}

/** Back to an address kept while the page was away (signing in); resolves once it shows. @param {string} hash */
export function returnTo(hash) {
  history.replaceState(null, '', location.pathname + hash)
  return follow()
}

// One history entry per place, and per opening of Settings, which Back closes; its sections and
// the windows share it. Closed where it opened, Settings goes back to the entry before, so Back
// won't open it again.
function write(followed = false) {
  const address = here()
  const now = location.hash
  const moved = !samePlace(now, address)
  const open = settingsIn(now)
  if (following || backing || address === now) return
  if (!moved && open === settingsIn(address)) history.replaceState(history.state, '', address)
  else if (!followed && (moved || !open)) history.pushState(!moved && 'over', '', address)
  else if (followed || settingsIn(address) || history.state !== 'over') history.replaceState(history.state, '', address)
  else {
    backing = true
    history.back()
  }
}

/** @returns {Record<string, string>} */
function drafts() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFTS) ?? '{}')
  } catch {
    return {}
  }
}

/** A share opened in this Jean (D361), from its viewer's Continue: brought in, then the address is the task's (caps/share/share.js), which it follows. */
const bringShared = async () => location.hash.startsWith('#/shared/') && unlock('share').then((ok) => ok && import('../caps/share/share.js').then((module) => module.fromAddress()).then(() => true))

export async function startRouter() {
  await bringShared()
  await follow()
  addEventListener('hashchange', () => turnPage(async () => {
    if (await bringShared()) return follow()
    if (!backing) return follow(!samePlace(location.hash, place()))
    backing = false
    write()
  }))
  const saved = drafts()[place()]
  if (saved && !app.draft.value) app.draft.value = saved

  // Once all that changes at once has: opening a conversation closes Settings.
  let writing = false
  effect(() => {
    here()
    if (!writing) queueMicrotask(() => { writing = false; write() })
    writing = true
  })

  // Another place brings back its unsent draft. One effect, so a switch can never file one
  // conversation's draft under another.
  let shown = place()
  effect(() => {
    const where = place()
    const draft = app.draft.value
    if (where !== shown) {
      shown = where
      const restored = drafts()[where] ?? ''
      if (restored !== draft) app.draft.value = restored
      return
    }
    const all = drafts()
    if (draft) all[where] = draft
    else delete all[where]
    try {
      sessionStorage.setItem(DRAFTS, JSON.stringify(all))
    } catch {}
  })
}
