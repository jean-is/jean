// Routines (docs/product.md): the way a task the user keeps asking for is done, saved as an
// Agent Skill (core/skills.js), so it is done the same way every time. The prompt lists each
// routine's name and when to use it; `routine` reads its steps when a request matches, and
// `save_routine` writes one when the user asks for it, typically after "Make this a routine",
// suggested when the same kind of request comes up a third time (ui/discovery.js).
import { register } from '../../ui/caps.js'
import { app, notify } from '../../ui/state.js'
import { listSkills, saveSkill, skillLines } from '../../core/skills.js'
import { slug } from '../../core/settings.js'
import { t } from '../../core/i18n.js'

/** Global routines, then the project's, which win a name. */
const folders = () => (app.project.value.data.default === true ? [''] : ['', app.projectDir])

/** The routines of the room. */
export const routines = () => listSkills(app.fs, folders())

/** @type {import('../../core/loop.js').Tool} */
const routineTool = {
  spec: {
    name: 'routine',
    description: 'Read the steps of one of the routines listed in <skills>.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  kind: 'read',
  title: (args) => `Routine ${args?.name ?? ''}`,
  run: async (args) => {
    const all = await routines()
    const skill = all.find((candidate) => candidate.name === String(args?.name ?? '').trim())
    if (!skill) throw new Error(`There is no routine named "${args?.name}". Routines: ${all.map((candidate) => candidate.name).join(', ') || 'none'}.`)
    return skill.body
  },
}

/** @type {import('../../core/loop.js').Tool} */
const saveTool = {
  spec: {
    name: 'save_routine',
    description: 'Save how a task the user repeats is done, to do it the same way next time. name: a few English words joined by hyphens; description: when to use it; steps: Markdown starting with a "# " title. Description and steps in the user’s language.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' }, description: { type: 'string' }, steps: { type: 'string' } },
      required: ['name', 'description', 'steps'],
    },
  },
  kind: 'edit',
  title: (args) => `Save the routine ${args?.name ?? ''}`,
  run: async (args) => {
    const name = slug(String(args?.name ?? '')) || 'routine'
    const description = String(args?.description ?? '').trim()
    const steps = String(args?.steps ?? '').trim()
    if (!description || !steps) throw new Error('A routine needs a description and steps.')
    await saveSkill(app.fs, folders().at(-1) ?? '', { name, description, body: steps, by: 'jean' })
    const title = /^#\s+(.+)$/m.exec(steps)?.[1].trim() ?? name
    notify(t('routines.saved', { title }), { label: t('routines.open'), run: () => { app.dialog.value = 'knows' } })
    return `Saved the routine "${name}". It is listed for the next conversations.`
  },
}

register({
  id: 'routines',
  tools: [routineTool, saveTool],
  lines: [
    { name: 'routine', line: 'read the steps of a routine before following it' },
    { name: 'save_routine', line: 'save how a repeated task is done, when the user asks' },
  ],
  rules: ['When a request matches a routine, read it and follow its steps.'],
  sections: async () => {
    const text = skillLines(await routines())
    return text ? { skills: text } : {}
  },
})
