// Skills (docs/product.md): the way a task the user keeps asking for is done, saved as an
// Agent Skill (core/skills.js), so it is done the same way every time. The prompt lists each
// skill's name and when to use it; `skill` reads its steps when a request matches, and
// `save_skill` writes one when the user asks for it, typically after "Save this as a skill",
// suggested when the same kind of request comes up a third time (ui/discovery.js).
// They were called routines until D115.
import { register } from '../../ui/caps.js'
import { app, notify } from '../../ui/state.js'
import { listSkills, saveSkill, skillLines } from '../../core/skills.js'
import { slug } from '../../core/settings.js'
import { t } from '../../core/i18n.js'

/** Global skills, then the project's, which win a name. */
const folders = () => (app.project.value.data.default === true ? [''] : ['', app.projectDir])

/** The skills of the room. */
export const skills = () => listSkills(app.fs, folders())

/** @type {import('../../core/loop.js').Tool} */
const skillTool = {
  spec: {
    name: 'skill',
    description: 'Read the steps of one of the skills listed in <skills>.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  kind: 'read',
  title: (args) => `Skill ${args?.name ?? ''}`,
  run: async (args) => {
    const all = await skills()
    const skill = all.find((candidate) => candidate.name === String(args?.name ?? '').trim())
    if (!skill) throw new Error(`There is no skill named "${args?.name}". Skills: ${all.map((candidate) => candidate.name).join(', ') || 'none'}.`)
    return skill.body
  },
}

/** @type {import('../../core/loop.js').Tool} */
const saveTool = {
  spec: {
    name: 'save_skill',
    description: 'Save how a task the user repeats is done, to do it the same way next time. name: a few English words joined by hyphens; description: when to use it; steps: Markdown starting with a "# " title. Description and steps in the user’s language.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' }, description: { type: 'string' }, steps: { type: 'string' } },
      required: ['name', 'description', 'steps'],
    },
  },
  kind: 'edit',
  title: (args) => `Save the skill ${args?.name ?? ''}`,
  run: async (args) => {
    const name = slug(String(args?.name ?? '')) || 'skill'
    const description = String(args?.description ?? '').trim()
    const steps = String(args?.steps ?? '').trim()
    if (!description || !steps) throw new Error('A skill needs a description and steps.')
    await saveSkill(app.fs, folders().at(-1) ?? '', { name, description, body: steps, by: 'jean' })
    const title = /^#\s+(.+)$/m.exec(steps)?.[1].trim() ?? name
    notify(t('skills.saved', { title }), { label: t('skills.open'), run: () => { app.dialog.value = 'knows' } })
    return `Saved the skill "${name}". It is listed for the next conversations.`
  },
}

// Conversations started before D115 declared `routine` and `save_routine`, and their tools are
// frozen (D46): the same tools answer to those names, with the specs those conversations know.
const aliases = [
  { ...skillTool, spec: { ...skillTool.spec, name: 'routine', description: 'Read the steps of one of the routines listed in <skills>.' }, hidden: true },
  { ...saveTool, spec: { ...saveTool.spec, name: 'save_routine' }, hidden: true },
]

register({
  id: 'skills',
  tools: [skillTool, saveTool, ...aliases],
  lines: [
    { name: 'skill', line: 'read the steps of a skill before following it' },
    { name: 'save_skill', line: 'save how a repeated task is done, when the user asks' },
  ],
  rules: ['When a request matches a skill, read it and follow its steps.'],
  sections: async () => {
    const text = skillLines(await skills())
    return text ? { skills: text } : {}
  },
})
