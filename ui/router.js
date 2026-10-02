// The address keeps the minimum to come back to the same place: the open conversation
// (#/c/<ulid>), so reloading, sharing the tab or going back shows the same content.
// A hash works on any static host and never reaches the server. The unsent draft
// survives a reload too, per conversation, in this tab only (sessionStorage).
import { effect } from '@preact/signals-core'
import { app, openConversation, newConversation } from './state.js'
import { join } from '../core/fs.js'

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
const DRAFTS = 'app.drafts'

/** @param {string} hash @returns {string | null} the conversation id in an address */
export function conversationIn(hash) {
  const id = /^#\/c\/([^/?#]+)/.exec(hash)?.[1] ?? null
  return id && ULID.test(id) ? id : null
}

/** @param {string | null} id */
const hashFor = (id) => (id ? `#/c/${id}` : '#/')

/** Opens what the address points at; an unknown conversation falls back to a new one. */
async function follow() {
  const id = conversationIn(location.hash)
  if (id === (app.current.value?.id ?? null)) return
  if (!id) return newConversation()
  const known = app.conversations.value.find((item) => item.id === id)
  await openConversation(known?.path ?? join(app.projectDir, 'conversations', `${id}.jsonl`)).catch((error) => console.warn(error))
  if (app.current.value?.id === id) return
  history.replaceState(null, '', hashFor(null))
  newConversation()
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
  const saved = drafts()[app.current.value?.id ?? '']
  if (saved && !app.draft.value) app.draft.value = saved

  // Opening, starting or creating a conversation updates the address (one history entry
  // each) and brings back that conversation's unsent draft. One effect, so a switch can
  // never file one conversation's draft under another.
  let shown = app.current.value?.id ?? null
  effect(() => {
    const id = app.current.value?.id ?? null
    const draft = app.draft.value
    if (id !== shown) {
      shown = id
      if (conversationIn(location.hash) !== id) history.pushState(null, '', hashFor(id))
      const restored = drafts()[id ?? ''] ?? ''
      if (restored !== draft) app.draft.value = restored
      return
    }
    const all = drafts()
    if (draft) all[id ?? ''] = draft
    else delete all[id ?? '']
    try {
      sessionStorage.setItem(DRAFTS, JSON.stringify(all))
    } catch {}
  })
}
