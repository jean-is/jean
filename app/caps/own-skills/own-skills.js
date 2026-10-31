// Jean's own skills for the brain, Skills found or not (D406): until it is, `skill`'s line names each of the directory's
// (D196), and `skill` reads one of those, which finds Skills, adds the skill and gives its steps (D401); another name
// finds nothing. Once found, Skills lists them with the user's, in their few words, with the rule to read the one a
// request matches, and `skill` reads any of the room's. Beside them, what Jean knows of itself: `about` reads its guide,
// with where each capability stands for this user (about.js, D423), policy denying Skills or not.
// Loaded with the first message, like questions (D146), with no trophy: nothing of it shows (D281).
import { register, isDenied, loaded, unlock } from '../../ui/caps.js'
import { app } from '../../ui/state.js'
import { DIRECTORY } from '../skills/directory.js'
import { skillNamed, listSkills, parseSkill, saveSkill } from '../../core/skills.js'
import { t } from '../../core/i18n.js'
import { reach } from '../../core/deferred.js'
import { BRAND } from '../../brand.js'

/** Their names, unless policy keeps to the organisation's sources. */
const own = app.policy.skills?.only ? [] : DIRECTORY.filter((entry) => !entry.cap || !isDenied(entry.cap)).map((entry) => entry.name)

// Visual answers is in every room from the start: Jean's own copy, as reading it would bring it (D401), written once among the
// skills every project shares, unless a skill of that name is there, turned off or not, so that the user's choice stands.
if (own.includes('visual') && !isDenied('skills')) void Promise.all([listSkills(app.fs, ['', app.projectDir ?? '']), fetch(new URL('../skills/directory/visual/SKILL.md', import.meta.url)).then((response) => response.text())])
  .then(([have, text]) => (have.some((skill) => skill.name === 'visual') ? null : saveSkill(app.fs, '', { .../** @type {import('../../core/skills.js').Skill} */ (parseSkill(text, 'skills/visual/SKILL.md')), by: 'jean' }))).catch(console.warn)

/** @type {import('../../core/loop.js').Tool} */
const skillTool = {
  spec: { name: 'skill', description: 'Read the steps of a skill.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  kind: 'read',
  title: (args) => `Skill ${args?.name ?? ''}`,
  run: async (args, ctx) => {
    const named = skillNamed(String(args?.name ?? ''))
    if (!loaded.value.has('skills') && !(own.includes(named.split('/')[0]) && await unlock('skills'))) throw new Error(`There is no skill named "${named}".`)
    const steps = await (await import('../skills/skills.js')).read(named)
    // One that brings a capability (Games, D648) brings its tools, from the next step on.
    const cap = DIRECTORY.find((entry) => entry.name === named.split('/')[0])?.cap, names = cap && await unlock(cap) ? (loaded.peek().get(cap)?.tools ?? []).map((tool) => tool.spec.name).filter((name) => !ctx.declared.includes(name)) : []
    return names.length ? `${steps}\n\nNew tools: ${names.join(', ')}. ${reach(names, ctx)}` : steps
  },
}

// The line is read as a conversation starts: in it, a small brain reads one as often as from a <skills> list, and
// offers what else a request needs as often as without them (D406).
const line = { name: 'skill', get line() { return `read the steps of a skill before following it${loaded.value.has('skills') || !own.length ? '' : `: ${own.join(', ')}`}` } }

/** @type {import('../../core/loop.js').Tool} The activity calls it as the user's menu does (D127). */
const aboutTool = { spec: { name: 'about', description: 'What you can do in this app and how it is used, as it stands for this user: each part in a line, and those a topic matches whole.', parameters: { type: 'object', properties: { topic: { type: 'string', description: 'What the user asks about, in English, such as "share a task"; none for every part' } } } },
  kind: 'read', title: () => t('collection.title', { name: BRAND.name }), run: async (args) => (await import('./about.js')).read(String(args?.topic ?? '')) }
register({ id: 'own-skills', tools: [...(isDenied('skills') ? [] : [skillTool]), aboutTool], lines: [...(isDenied('skills') ? [] : [line]), { name: 'about', line: 'what you can do in this app and how it is used, read before answering a question about them' }] })
