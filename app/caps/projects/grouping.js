// Tasks that go together, as a project (D716): looked for among the home project's tasks once a week when it holds many,
// and once a bring-in ends, by their titles (./groups.js), on this device. The first group not offered before is offered
// in a toast; taken, it is a project of its own, its tasks moved there with the files they shared or Jean made, then its
// dialog opens, to name it otherwise.
import { app, effective, updateSettings, notify, refreshProjects, refreshConversations, enterProject } from '../../ui/state.js'
import { unlock } from '../../ui/caps.js'
import { createProject } from '../../core/settings.js'
import { loadConversation } from '../../core/conversations.js'
import { linkedFiles, filesMade, callsIn } from '../../core/events.js'
import { join } from '../../core/fs.js'
import { t, useStrings } from '../../core/i18n.js'
import { COLOURS } from '../../ui/touches.js'
import { groups } from './groups.js'

let looking = false

/** Offers the first group of the home project's tasks not offered before. */
export async function suggest() {
  if (looking || app.project.peek().data.default !== true) return
  looking = true
  try {
    const offered = effective.peek().settings.grouped ?? []
    const group = groups(app.conversations.peek().filter((one) => !one.routine).map(({ path, title, opening }) => ({ path, text: title || opening })))
      .find(({ name }) => !offered.includes(name))
    await updateSettings({ grouped: group ? [...offered, group.name] : offered, groupedAt: new Date().toISOString() })
    if (!group) return
    await useStrings('projects')
    notify(t('projects.grouped', { name: group.name }), { label: t('projects.group'), run: () => make(group) })
  } finally {
    looking = false
  }
}

/** The group, a project of its own: each task moved there with the files it shared or Jean made in it, then the project's dialog. @param {{ name: string, paths: string[] }} group */
async function make({ name, paths }) {
  if (!(await unlock('projects'))) return
  const from = app.projectDir
  const dir = await createProject(app.fs, { name, colour: COLOURS[1 + (app.projects.peek().length % (COLOURS.length - 1))][1], by: app.deviceId })
  for (const path of paths) {
    const records = (await loadConversation(app.fs, path).catch(() => null))?.records ?? []
    for (const { uri } of [...linkedFiles(records), ...filesMade(callsIn(records))]) {
      const base = uri.replace(/\.[^./]+$/, '')
      for (const one of new Set([uri, `${base}.md`, `${base}.meta.json`])) {
        const bytes = await app.fs.readBytes(join(from, one))
        if (bytes && !(await app.fs.exists(join(dir, one)))) await app.fs.writeBytes(join(dir, one), bytes)
      }
    }
    const text = await app.fs.read(path)
    if (text === null) continue
    await app.fs.write(join(dir, 'conversations', path.split('/').at(-1) ?? ''), text)
    await app.fs.remove(path)
  }
  await Promise.all([refreshProjects(), refreshConversations()])
  const project = app.projects.peek().find((one) => one.dir === dir)
  if (project) await enterProject(project).then(() => import('./projects.js')).then((module) => module.editProject(project))
}
