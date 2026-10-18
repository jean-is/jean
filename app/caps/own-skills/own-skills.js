// Jean's own skills for the brain, Skills found or not (D406): until it is, <skills> names each of the directory's
// (D196), and `skill` reads one of those, which finds Skills, adds the skill and gives its steps (D401); another name
// finds nothing. Once found, Skills lists them with the user's, in their few words, and `skill` reads any of the room's.
// Loaded with the first message, like questions (D146), with no trophy: nothing of it shows (D281).
import { register, isDenied, loaded, unlock } from '../../ui/caps.js'
import { app } from '../../ui/state.js'
import { DIRECTORY } from '../skills/directory.js'

/** Their names, unless policy keeps to the organisation's sources. */
const own = app.policy.skills?.only ? [] : DIRECTORY.map((entry) => entry.name)

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
    const named = String(args?.name ?? '')
    if (!loaded.value.has('skills') && !(own.includes(named.trim().split('/')[0]) && await unlock('skills'))) throw new Error(`There is no skill named "${named}".`)
    return (await import('../skills/skills.js')).read(named)
  },
}

if (!isDenied('skills')) {
  register({
    id: 'own-skills',
    tools: [skillTool],
    lines: [{ name: 'skill', line: 'read the steps of a skill before following it' }],
    rules: ['When a request matches a skill, read it and follow its steps.'],
    sections: async () => (loaded.value.has('skills') || !own.length ? {} : { skills: own.map((name) => `- ${name}`).join('\n') }),
  })
}
