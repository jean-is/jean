// Old tasks let go (D718): with Your data's Delete old tasks set, the tasks of every project not changed for that long, those
// pinned kept, are deleted for good as Jean opens, once a day, through the hooks on `remove` (D412), which an organisation's
// retention can refuse.
import { app, effective, updateSettings, removing, refreshConversations } from './state.js'
import { listConversations, deleteConversation } from '../core/conversations.js'

/** Deletes the tasks older than the setting says, once a day, or now when `now` is set. @param {boolean} [now] */
export async function forget(now = false) {
  const { forget: days, forgotAt } = effective.peek().settings
  if (!days || (!now && Date.now() - (Date.parse(forgotAt ?? '') || 0) < 86_400_000)) return
  await updateSettings({ forgotAt: new Date().toISOString() })
  const before = Date.now() - days * 86_400_000
  const old = (await Promise.all(app.projects.peek().map(({ dir }) => listConversations(app.fs, dir).catch(() => []))))
    .flat().filter((task) => !task.pinned && (Date.parse(task.updatedAt) || Infinity) < before && task.path !== app.current.peek()?.path)
  if (!old.length) return
  await removing(old.map(({ path }) => ({ task: path, all: true })), async () => { for (const { path } of old) await deleteConversation(app.fs, path) })
  await refreshConversations()
}
