// Skills (docs/product.md): the way a task the user keeps asking for is done, saved as an
// Agent Skill (core/skills.js), so it is done the same way every time. The prompt lists each
// skill's name and when to use it; `skill` reads its steps when a request matches, and
// `save_skill` writes one when the user asks for it, typically after "Save this as a skill",
// suggested when the same kind of request comes up a third time (ui/discovery.js).
// Skills from elsewhere (D121): the indexes in settings and policy are read on the device
// (./sources.js); the third request of a kind looks there first, and `suggest_skill` lets the
// brain look. Either way the user reads the steps and adds the skill (./ready.js), or not.
import { register } from '../../ui/caps.js'
import { app, effective, notify, conversationOf } from '../../ui/state.js'
import { SAME_KIND } from '../../ui/discovery.js'
import { listSkills, saveSkill, skillLines } from '../../core/skills.js'
import { slug } from '../../core/settings.js'
import { dirname, join, walk } from '../../core/fs.js'
import { t } from '../../core/i18n.js'
import { DEFAULT_SOURCES, bestFit, indexURL, readIndexes, siteOf, unpack } from './sources.js'

/** @typedef {import('./sources.js').Entry} Entry */

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
    // "name/references/forms.md" reads a file that came with a skill from elsewhere.
    const [name, ...rest] = String(args?.name ?? '').trim().split('/')
    const all = await skills()
    const skill = all.find((candidate) => candidate.name === name)
    if (!skill) throw new Error(`There is no skill named "${name}". Skills: ${all.map((candidate) => candidate.name).join(', ') || 'none'}.`)
    const folder = dirname(skill.path)
    if (rest.length) {
      const text = rest.includes('..') ? null : await app.fs.read(join(folder, ...rest))
      if (text === null) throw new Error(`The skill "${name}" has no file "${rest.join('/')}".`)
      return text
    }
    const beside = (await walk(app.fs, folder)).map((path) => path.slice(folder.length + 1)).filter((path) => path !== 'SKILL.md')
    return beside.length ? `${skill.body}\n\nFiles beside these steps: ${beside.join(', ')}. Read one with skill({ name: "${name}/<file>" }).` : skill.body
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
    notify(t('skills.saved', { title }), { label: t('skills.open'), run: () => import('../../ui/dialogs.js').then((dialogs) => dialogs.openSettings('skills')) })
    return `Saved the skill "${name}". It is listed for the next conversations.`
  },
}

// ─── Skills from elsewhere (D121) ────────────────────────────────────────────

/** @param {readonly unknown[]} addresses @returns {string[]} the indexes’ addresses */
const indexes = (addresses) => addresses.flatMap((address) => {
  try {
    return [indexURL(String(address))]
  } catch {
    return []
  }
})

/** The organisation's sources of skills, which the user can't remove (D121). */
export const locked = () => indexes(app.policy.skills?.sources ?? [])

/**
 * The indexes read: the organisation's, then the user's list (the hand-picked defaults until they
 * change it). Policy can keep to its own (`skills.only`).
 */
export const sources = () => [...new Set([...locked(), ...app.policy.skills?.only ? [] : indexes(effective.peek().settings.sources ?? DEFAULT_SOURCES)])]

/** What the sources offer, as last read (a day's cache in .cache/). @param {{ again?: boolean }} [options] */
export const offered = (options) => readIndexes(app.fs, sources(), options)

/** A skill from elsewhere suggested in a conversation, by the conversation's path, shown under its answers. @type {Map<string, Entry>} */
export const suggested = new Map()

/** The skill from elsewhere that fits a request, if one does and the user doesn't have it. @param {string} request */
export async function lookFor(request) {
  const have = (await skills()).map((skill) => skill.name)
  return bestFit(request, (await offered()).flatMap((index) => index.skills), have, SAME_KIND)
}

/** Downloads a skill and checks it against its digest (SkillError when it can't be added). @param {Entry} entry */
export async function download(entry) {
  const response = await fetch(entry.url)
  if (!response.ok) throw new Error(`The skill answered ${response.status}.`)
  return unpack(entry, new Uint8Array(await response.arrayBuffer()))
}

/**
 * Adds a skill from elsewhere as the user saw it: its steps and the text beside them, with where
 * it came from and the digest it was checked against. Its suggestions go.
 * @param {Entry} entry @param {{ body: string, files: { path: string, text: string }[] }} unpacked
 */
export async function adopt(entry, { body, files }) {
  const dir = folders().at(-1) ?? ''
  for (const file of files) await app.fs.write(join(dir, 'skills', entry.name, file.path), file.text)
  await saveSkill(app.fs, dir, { name: entry.name, description: entry.description, body, by: app.deviceId, source: entry.url, digest: entry.digest })
  for (const [path, other] of suggested) if (other.name === entry.name) suggested.delete(path)
  app.actions.value = Object.fromEntries(Object.entries(app.actions.value).map(([at, ids]) => [at, ids.filter((id) => id !== 'ready')]))
}

/** @type {import('../../core/loop.js').Tool} */
const suggestTool = {
  spec: {
    name: 'suggest_skill',
    description: 'Look for a ready-made skill for a task among those the user’s sources publish, and suggest the one that fits to the user, who reads its steps and decides whether to add it. task: what to do, in a few words, in English and in the user’s language.',
    parameters: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] },
  },
  kind: 'search',
  deferred: true,
  title: (args) => `Look for a skill: ${args?.task ?? ''}`,
  run: async (args, ctx) => {
    const path = conversationOf(ctx.signal)?.path
    const found = path ? await lookFor(String(args?.task ?? '')) : null
    if (!path || !found) return 'No ready-made skill fits that.'
    suggested.set(path, found)
    return `Found "${found.name}" on ${siteOf(found.url)}: ${found.description}\nA button under your answer lets the user read its steps and add it. It isn't added unless they do.`
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
  tools: [skillTool, saveTool, suggestTool, ...aliases],
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
