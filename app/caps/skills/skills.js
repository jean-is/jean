// Skills (docs/product.md): the way a task the user keeps asking for is done, saved as an
// Agent Skill (core/skills.js), so it is done the same way every time. The prompt lists each
// skill's name and when to use it; `skill` (../own-skills/) reads its steps when a request matches, and
// `save_skill` writes one when the user asks for it, typically after "Save this as a skill",
// suggested when the same kind of request comes up a third time (ui/discovery.js), or once the
// brain has asked what a new one needs; its example becomes the answer's first suggestion (D322).
// Skills from elsewhere (D121): the indexes and repositories in settings and policy are read on
// the device (./sources.js), and Jean's own directory with them (./directory.js, D196); the third
// request of a kind looks there first, and `suggest_skill` lets the brain look. Either way the user
// reads the steps and adds the skill (./ready.js), or not. Jean's own are listed with the room's,
// and one the brain reads is added as it reads it (D401), which before Skills is found finds it (D406).
// A skill declares the kinds of block it writes (D196); answers draw those as widgets while one
// of the room's skills declares them. One the user turns off in Settings (./page.js, D517) says so in its file (`off`) and
// stays in its folder, so Jean never adds it again, but neither lists, reads nor draws with it until it is turned on. The scores
// answers hold and the decks they write, kept as files once the answer ends, are among the creations (./scores.js, ./decks.js, D542, D558, D591).
import { nothing } from 'lit-html'
import { effect, signal } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { declared, WIDGETS } from '../../ui/markdown.js'
import { subRow } from '../../ui/composer.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { app, effective, notify, conversationOf } from '../../ui/state.js'
import { SAME_KIND } from '../../ui/discovery.js'
import { act } from '../../ui/acts.js'
import { listSkills, saveSkill, skillLines, skillSteps } from '../../core/skills.js'
import { slug } from '../../core/settings.js'
import { dirname, join } from '../../core/fs.js'
import { t, locale, useStrings } from '../../core/i18n.js'
import { DEFAULT_SOURCES, bestFit, indexURL, readIndexes, siteOf, fetchSkill } from './sources.js'
import { readDirectory, shownIn } from './directory.js'
import * as creations from '../../ui/creations.js'
import { scores } from './scores.js'
import { decks, keep, opener } from './decks.js'

await Promise.all([useStrings('skills'), styleSheet(new URL('skills.css', import.meta.url))])

/** @typedef {import('./sources.js').Entry} Entry */

/** Global skills, then the project's, which win a name. */
export const folders = () => (app.project.value.data.default === true ? [''] : ['', app.projectDir])

/** Whether the user turned a skill off (D517). @param {import('../../core/skills.js').Skill} skill */
export const isOff = (skill) => skill.metadata?.off === true
/** Every skill of the room, those turned off too, as Settings lists them. */
export const room = () => listSkills(app.fs, folders())
/** The skills of the room Jean follows: those not turned off. */
export const skills = async () => (await room()).filter((skill) => !isOff(skill))

// A deck as brains fence one, as Markdown or Slidev's, is Slides' to tell from code (D591): the kinds the Slides skill declares too.
Object.assign(WIDGETS, { markdown: 'slides', md: 'slides', slidev: 'slides' })
/** The kinds of block these skills write, drawn as widgets in answers (D196). @param {import('../../core/skills.js').Skill[]} list */
export const declare = (list) => { declared.value = new Set(list.flatMap((skill) => skill.blocks ?? [])) }
/** Reads them again: in a new room, and when a skill comes, goes or is turned off or on. */
export const redeclare = async () => { await follow(await room()); declare(await skills()) }

/**
 * Jean's own ready-made skills follow Jean (D598): a copy one of them left in the room, which nobody edits, is written again as
 * the directory has it now once they differ, only whether it is off kept, so that what Jean changes in one reaches whoever added it.
 * @param {import('../../core/skills.js').Skill[]} list the room's
 */
async function follow(list) {
  const ours = list.filter((skill) => !skill.source && skill.metadata?.['title-en']), own = ours.length ? await directory() : []
  const words = (/** @type {any} */ { author, created, format, off, blocks, ...rest } = {}) => JSON.stringify(rest)
  for (const skill of ours) {
    const entry = own.find((one) => one.name === skill.name)
    if (entry && [skill.body, skill.description, skill.blocks, words(skill.metadata)].join('\0') !== [entry.body, entry.description, entry.blocks, words(entry.metadata)].join('\0')) {
      await saveSkill(app.fs, dirname(dirname(dirname(skill.path))), { ...entry, by: String(skill.metadata?.author ?? 'jean'), metadata: { ...entry.metadata, ...(isOff(skill) && { off: true }) } })
    }
  }
}
effect(() => {
  void app.project.value
  void redeclare()
})

/** A skill's steps for `skill`: one of Jean's own the room doesn't have yet comes in as it is read, and the toast says so (D401). @param {string} named */
export const read = async (named, [name] = named.trim().split('/')) => { for (const title of await bring([name])) saved(title, name); return steps(named) }

/** Says a skill is in the room now, with a way to see its page. @param {string} title @param {string} name */
const saved = (title, name) => notify(t('skills.saved', { title }), { label: t('skills.open'), run: () => import('../../ui/dialogs.js').then((dialogs) => dialogs.openSettings(`skills/${name}`)) })

/** A skill's steps, or one of the files beside them, for `skill` and for a skill named in the box (D199). @param {string} named */
export const steps = async (named) => skillSteps(app.fs, await skills(), named)

/** @type {import('../../core/loop.js').Tool} */
const saveTool = {
  spec: {
    name: 'save_skill',
    description: 'Save a skill: how a task is done, to do it the same way every time. For a new one the user asks for, first ask the few things you need to know (what it is for, what they will give it, what should come back and how) unless the conversation already says, then save it. name: a few English words joined by hyphens; description: when to use it; example: a short request that uses it, complete enough to send as it is; steps: Markdown starting with a "# " title. Description, example and steps in the user’s language.',
    // The long text last: a brain that ends it badly loses nothing after it (D322).
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' }, description: { type: 'string' }, example: { type: 'string' }, steps: { type: 'string' } },
      required: ['name', 'description', 'example', 'steps'],
    },
  },
  kind: 'edit',
  title: (args) => `Save the skill ${args?.name ?? ''}`,
  run: async (args, ctx) => {
    const name = slug(String(args?.name ?? '')) || 'skill'
    // Steps cut where a brain that closed them badly went on with the markup of its call (D322).
    const [description, steps, example] = [args?.description, String(args?.steps ?? '').split(/<\/(?:parameter|steps|invoke)>|<parameter name=/)[0], args?.example].map((value) => String(value ?? '').trim())
    if (!description || !steps) throw new Error('A skill needs a description and steps.')
    // One changed keeps its folder and what it came with; its example is kept for Try it on its page (D517).
    // One of Jean's own changed is the user's from then on, no longer following Jean's (D598): its names in every language go.
    const kept = (await room()).find((skill) => skill.name === name), had = Object.entries(kept?.metadata ?? {}).filter(([key]) => kept?.source || !/^(title|text)-/.test(key))
    await saveSkill(app.fs, kept ? dirname(dirname(dirname(kept.path))) : folders().at(-1) ?? '', { name, description, body: steps, by: 'jean', metadata: { ...Object.fromEntries(had), ...(example && { example }) } })
    act('skill.add', { task: conversationOf(ctx.signal)?.path, name, source: 'made' })
    saved(/^#\s+(.+)$/m.exec(steps)?.[1].trim() ?? name, name)
    // In the room at once: the next message's note lists it, and /name in the box reads its steps. Saved without
    // an example too, which the answer gives: a call made again for it would write the steps again (D322).
    return `Saved the skill "${name}". From the user's next message on, it is in <skills>, and /${name} in their box uses it. Tell them it is ready and how to use it, in their own words or with /${name}, and give ${example ? 'your' : 'an'} example. Make it your first suggestion, so one click tries it: /${name} ${example || '<the example>'}`
  },
}

// ─── Skills from elsewhere (D121) ────────────────────────────────────────────

/** @param {readonly unknown[]} addresses @returns {string[]} the indexes’ addresses */
const indexes = (addresses) => addresses.flatMap((address) => { try { return [indexURL(String(address))] } catch { return [] } })

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

/**
 * The skills <skills> lists: the room's, then Jean's own in the directory's order, the room's of that name in its place,
 * each in its few English words, whether the room has it yet or not, so one added changes nothing the brain read (D401).
 */
async function listed() {
  const [all, own] = await Promise.all([room(), directory()])
  const have = all.filter((skill) => !isOff(skill))
  return [...have.filter((skill) => !own.some((entry) => entry.name === skill.name)),
    ...own.filter((entry) => !all.some((skill) => skill.name === entry.name && isOff(skill))).map((entry) => ({ name: entry.name, description: shownIn(have.find((skill) => skill.name === entry.name) ?? entry, 'en').text }))]
}

/** A skill from elsewhere suggested in a conversation, by the conversation's path, shown under its answers. @type {Map<string, Entry>} */
export const suggested = new Map()

/** The skill from elsewhere that fits a request, if one does and the user doesn't have it. @param {string} request */
export async function lookFor(request) {
  const have = (await room()).map((skill) => skill.name)
  return bestFit(request, [...await directory(), ...(await offered()).flatMap((index) => index.skills)], have, SAME_KIND)
}

/**
 * Adds a skill from elsewhere as the user saw it: its steps and the text beside them, with where
 * it came from and the digest it was checked against (one of Jean's own, with neither). Its
 * suggestions go. Its author: the user, or Jean when a request brought it (D517).
 * @param {Entry} entry @param {{ body: string, files: { path: string, text: string }[], blocks?: string[], metadata?: Record<string, any> }} unpacked
 */
export async function adopt(entry, { body, files, blocks, metadata }, by = app.deviceId) {
  const dir = folders().at(-1) ?? ''
  for (const file of files) await app.fs.write(join(dir, 'skills', entry.name, file.path), file.text)
  await saveSkill(app.fs, dir, { name: entry.name, description: entry.description, body, by, blocks, metadata, ...(entry.digest && { source: entry.url, digest: entry.digest }) })
  act('skill.add', { name: entry.name, source: entry.digest ? 'elsewhere' : 'directory', ...(entry.digest && { address: new URL(entry.url).hostname, digest: entry.digest }) })
  await redeclare()
  for (const [path, other] of suggested) if (other.name === entry.name) suggested.delete(path)
  app.actions.value = Object.fromEntries(Object.entries(app.actions.value).map(([at, ids]) => [at, ids.filter((id) => id !== 'ready')]))
}

/** Jean's own skill for each kind of block it draws once a skill declares it. */
const DRAWS = /** @type {Record<string, string>} */ ({ echarts: 'chart', abc: 'music-score', deck: 'slides' })

/**
 * Jean's own skills by name, added as the user adds one, unless a skill of the room has the name: what a task brought
 * in draws needs (D378), an idea asks for (D366), or the brain reads (D401), even one turned off (D517). Their names, in the user's
 * language. @param {string[]} names
 */
export async function bring(names) {
  const have = await room()
  const ready = (await directory()).filter((entry) => names.includes(entry.name) && !have.some((skill) => skill.name === entry.name))
  for (const entry of ready) await adopt(entry, await fetchSkill(entry), 'jean')
  return ready.map((entry) => shownIn(entry, locale.peek()).title)
}

/**
 * What a task brought in from elsewhere holds is drawn here (a share, D378): a kind of block no skill of the room
 * declares comes with Jean's own skill that does. @param {string[]} kinds the kinds of block the task holds
 */
export async function drawWith(kinds) {
  const have = await skills()
  return bring(kinds.filter((kind) => DRAWS[kind] && !have.some((skill) => skill.blocks?.includes(kind))).map((kind) => DRAWS[kind]))
}

/** Settings' Skills, from ./page.js, loaded the first time it shows (D517). */
const page = signal(/** @type {(() => unknown) | null} */ (null))
let paging = false

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
  tools: [saveTool, suggestTool],
  // A deck an answer wrote, kept as a file of the project's once the answer ends (D591).
  hooks: [{ on: 'turn.end', match: { aborted: false }, run: (e, next) => { keep(e).catch(console.warn); return next(e) } }],
  lines: [{ name: 'save_skill', line: 'save how a task is done as a skill, or make one with the user, when they ask' }],
  rules: ['When a request matches a skill, read it and follow its steps.'],
  sections: async () => {
    const text = skillLines(await listed())
    return text ? { skills: text } : {}
  },
  slots: {
    // In +, a row whose menu beside it holds the room's skills (D292).
    add: { at: 4, draw: () => subRow('skills', icons.scroll) },
    // The scores answers hold and the decks they wrote, among the creations, and their page (D542, D558, D591); under a deck in an answer, the one kept.
    creations: [scores, decks], main: creations.page, drawn: { at: 0, draw: opener },
    settings: { id: 'skills', at: 60, label: 'cap.skills.name', icon: icons.scroll, draw: () => {
      if (!paging) { paging = true; import('./page.js').then((module) => { page.value = module.section }) }
      return page.value?.() ?? nothing
    } },
  },
})
