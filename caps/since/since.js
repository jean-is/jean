// Since last time (docs/product.md, "What Jean is doing"): when the user opens Jean after time
// away and has connected services, Jean starts with a short brief of what is new there. The
// brief only reads: for that turn anything that would send, change or delete is refused,
// whatever the rules say, and reading still asks first unless the user allowed it. Jean can't
// work while the tab is closed, so the brief is read when the user comes back, and says so.
import { effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, effective, newConversation, send } from '../../ui/state.js'
import { noteRecord } from '../../core/events.js'
import { t } from '../../core/i18n.js'

/** Whether there is anything to read: a service the user or the organisation connected. */
export const connected = () => Boolean((effective.peek().settings.connections ?? []).length || (app.policy.connections ?? []).length)

/** What the brain is told, in English like every prompt, with when the user was last here. @param {Date} since */
const note = (since) => noteRecord(`The user is back; they were last here on ${since.toISOString().slice(0, 16).replace('T', ' ')} UTC. Start with a short brief of what is new in their connected services since then. Only read: never send, change or delete anything.`, { kind: 'since', since: since.toISOString() })

/** The brief, in a conversation of its own. @param {number} [since] when the user was last here */
export async function brief(since = app.back.peek()) {
  app.back.value = 0
  if (!since || !connected() || !effective.peek().settings.brains.length || app.busy.peek()) return
  // The services' tools have to be listed before the brain is told about them.
  await (await import('../connections/connections.js')).listed
  newConversation()
  await send(t('since.prompt'), { notes: [note(new Date(since))] })
}

effect(() => {
  if (app.back.value && connected()) queueMicrotask(() => brief())
})

register({ id: 'since' })
