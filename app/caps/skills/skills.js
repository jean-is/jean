// Skills (docs/product.md): the way a task the user keeps asking for is done, saved as an
// Agent Skill (core/skills.js), so it is done the same way every time. The prompt lists each
// skill's name and when to use it; `skill` reads its steps when a request matches, and
// `save_skill` writes one when the user asks for it, typically after "Save this as a skill",
// suggested when the same kind of request comes up a third time (ui/discovery.js).
// Skills from elsewhere (D121): the indexes and repositories in settings and policy are read on
// the device (./sources.js), and Jean's own directory with them (./directory.js, D196); the third
// request of a kind looks there first, and `suggest_skill` lets the brain look. Either way the user
// reads the steps and adds the skill (./ready.js), or not.
// A skill declares the kinds of block it writes (D196); answers draw those as widgets while one
// of the room's skills declares them.
import { effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { declared } from '../../ui/markdown.js'
import { subRow } from '../../ui/composer.js'
import { icons } from '../../ui/icons.js'
import { app, effective, notify, conversationOf } from '../../ui/state.js'
import { SAME_KIND } from '../../ui/discovery.js'
import { listSkills, saveSkill, skillLines, skillSteps } from '../../core/skills.js'
import { slug } from '../../core/settings.js'
import { join } from '../../core/fs.js'
import { t } from '../../core/i18n.js'
import { DEFAULT_SOURCES, bestFit, indexURL, readIndexes, siteOf } from './sources.js'
import { readDirectory } from './directory.js'

/** @typedef {import('./sources.js').Entry} Entry */

/** Global skills, then the project's, which win a name. */
const folders = () => (app.project.value.data.default === true ? [''] : ['', app.projectDir])

/** The skills of the room. */
export const skills = () => listSkills(app.fs, folders())

/** The kinds of block these skills write, drawn as widgets in answers (D196). @param {import('../../core/skills.js').Skill[]} list */
export const declare = (list) => { declared.value = new Set(list.flatMap((skill) => skill.blocks ?? [])) }
/** Reads them again: in a new room, and when a skill comes or goes. */
export const redeclare = async () => declare(await skills())
effect(() => {
  void app.project.value
  void redeclare()
})

/** @type {import('../../core/loop.js').Tool} */
const skillTool = {
  spec: {
    name: 'skill',
    description: 'Read the steps of one of the skills listed in <skills>.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  kind: 'read',
  title: (args) => `Skill ${args?.name ?? ''}`,
  run: (args) => steps(String(args?.name ?? '')),
}

/** A skill's steps, or one of the files beside them, for `skill` and for a skill named in the box (D199). @param {string} named */
export const steps = async (named) => skillSteps(app.fs, await skills(), named)

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

/** @type {Promise<import('./directory.js').Ready[]> | null} */
let shelf = null
/** Jean's own ready-made skills (D196), read once, unless policy keeps to the organisation's sources. */
export const directory = async () => (app.policy.skills?.only ? [] : (shelf ??= readDirectory()))

/** A skill from elsewhere suggested in a conversation, by the conversation's path, shown under its answers. @type {Map<string, Entry>} */
export const suggested = new Map()

/** The skill from elsewhere that fits a request, if one does and the user doesn't have it. @param {string} request */
export async function lookFor(request) {
  const have = (await skills()).map((skill) => skill.name)
  return bestFit(request, [...await directory(), ...(await offered()).flatMap((index) => index.skills)], have, SAME_KIND)
}

/**
 * Adds a skill from elsewhere as the user saw it: its steps and the text beside them, with where
 * it came from and the digest it was checked against (one of Jean's own, with neither). Its
 * suggestions go.
 * @param {Entry} entry @param {{ body: string, files: { path: string, text: string }[], blocks?: string[], metadata?: Record<string, any> }} unpacked
 */
export async function adopt(entry, { body, files, blocks, metadata }) {
  const dir = folders().at(-1) ?? ''
  for (const file of files) await app.fs.write(join(dir, 'skills', entry.name, file.path), file.text)
  await saveSkill(app.fs, dir, { name: entry.name, description: entry.description, body, by: app.deviceId, blocks, metadata, ...(entry.digest && { source: entry.url, digest: entry.digest }) })
  await redeclare()
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
    return `Found "${found.name}"${found.digest ? ` on ${siteOf(found.url)}` : ''}: ${found.description}\nA button under your answer lets the user read its steps and add it. It isn't added unless they do.`
  },
}

register({
  id: 'skills',
  tools: [skillTool, saveTool, suggestTool],
  lines: [
    { name: 'skill', line: 'read the steps of a skill before following it' },
    { name: 'save_skill', line: 'save how a repeated task is done, when the user asks' },
  ],
  rules: ['When a request matches a skill, read it and follow its steps.'],
  sections: async () => {
    const text = skillLines(await skills())
    return text ? { skills: text } : {}
  },
  // In +, a row whose menu beside it holds the room's skills (D292).
  slots: { add: { at: 4, draw: () => subRow('skills', icons.scroll) } },
})
