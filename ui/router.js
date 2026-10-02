// The address keeps the minimum to come back to the same place: the open conversation, in the
// home project (#/c/<ulid>) or another one (#/p/<ulid>/c/<ulid>; #/p/<ulid>/ is a new one there),
// so reloading, sharing the tab or going back shows the same content. A hash works on any
// static host and never reaches the server. The unsent draft survives a reload too, per
// place, in this tab only (sessionStorage).
import { effect } from '@preact/signals-core'
import { app, openConversation, newConversation, enterProject } from './state.js'
import { join } from '../core/fs.js'

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
const DRAFTS = 'app.drafts'

/** The project and conversation an address names (null for the home project, or a new conversation). @param {string} hash */
export function placeIn(hash) {
  const [, project = '', conversation = ''] = /^#\/(?:p\/([^/?#]+)\/?)?(?:c\/([^/?#]+))?/.exec(hash) ?? []
  const valid = (/** @type {string} */ id) => (ULID.test(id) ? id : null)
  return { project: valid(project), conversation: valid(conversation) }
}

/** @param {string} hash @returns {string | null} the conversation id in an address */
export const conversationIn = (hash) => placeIn(hash).conversation

/** @param {import('../core/settings.js').Project} project @param {string | null} id */
export function hashFor(project, id) {
  const base = project.data.default === true || !project.id ? '#/' : `#/p/${project.id}/`
  return id ? `${base}c/${id}` : base
}

/** @param {string} a @param {string} b */
const samePlace = (a, b) => JSON.stringify(placeIn(a)) === JSON.stringify(placeIn(b))
const here = () => hashFor(app.project.value, app.current.value?.id ?? null)

let following = false

/** Opens what the address points at; an unknown project or conversation falls back to a new one at home. */
async function follow() {
  following = true
  try {
    const { project: id, conversation } = placeIn(location.hash)
    const projects = app.projects.value
    const project = projects.find((candidate) => candidate.id === id) ?? projects.find((candidate) => candidate.data.default === true)
    if (project) await enterProject(project)
    if (conversation === (app.current.value?.id ?? null)) return
    if (!conversation) return newConversation()
    const known = app.conversations.value.find((item) => item.id === conversation)
    await openConversation(known?.path ?? join(app.projectDir, 'conversations', `${conversation}.jsonl`)).catch((error) => console.warn(error))
    if (app.current.value?.id !== conversation) newConversation()
  } finally {
    following = false
    if (!samePlace(location.hash, here())) history.replaceState(null, '', here())
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

export async function startRouter() {
  await follow()
  addEventListener('hashchange', follow)
  const saved = drafts()[here()]
  if (saved && !app.draft.value) app.draft.value = saved

  // Opening, starting or creating a conversation, or walking into another project, updates the
  // address (one history entry each) and brings back that place's unsent draft. One effect, so
  // a switch can never file one conversation's draft under another.
  let shown = here()
  effect(() => {
    const place = here()
    const draft = app.draft.value
    if (place !== shown) {
      shown = place
      if (!following && !samePlace(location.hash, place)) history.pushState(null, '', place)
      const restored = drafts()[place] ?? ''
      if (restored !== draft) app.draft.value = restored
      return
    }
    const all = drafts()
    if (draft) all[place] = draft
    else delete all[place]
    try {
      sessionStorage.setItem(DRAFTS, JSON.stringify(all))
    } catch {}
  })
}
