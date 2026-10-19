// Meetings (D224): the projects' assistants meet on a topic, each speaking for its project from what
// it knows (how it should be, its instructions, memory and latest tasks), in rounds where each hears
// what the others said; the room's assistant chairs, and tells the user what came of it. Who joins,
// what each knows and the minutes are worked out here; the tools are in ./projects.js.
// Host-agnostic: no DOM.
import { usedIn, isLocal, parseFrontMatter } from '../../core/settings.js'
import { parseMemory, memoryText } from '../../core/memory.js'
import { listConversations, loadConversation } from '../../core/conversations.js'
import { foldTurns, splitSuggestions } from '../../core/events.js'
import { limitedUse } from '../../core/llm.js'
import { join } from '../../core/fs.js'
import { BRAND } from '../../brand.js'

/** @typedef {import('../../core/settings.js').Project} Project */
/** @typedef {import('../../core/types.js').FS} FS */
/** @typedef {import('../../core/types.js').BrainConfig} BrainConfig */

/** At most this many speakers, this many speaking at once, this many rounds, and this many of a project's tasks read. */
export const SPEAKERS = 5
export const AT_ONCE = 3
export const ROUNDS = 3
const TASKS = 8

/** The home project is the assistant's own room, and goes by its name. @param {Project} project */
export const nameOf = (project) => String(project.data.default === true ? project.data.assistantName || BRAND.name : project.data.name)

/**
 * Who joins a meeting held in the room `here`, heard by `brain`: the projects named (a part of a name is
 * enough), or every other one, five at most. A project kept on this device doesn't join when the brain
 * is in the cloud (or unknown), nor one the brain isn't used in (D194). A name no project has is an error that lists them.
 * @param {Project[]} projects @param {{ here: string, names?: string[], brain: BrainConfig | null }} options
 */
export function attendees(projects, { here, names = [], brain }) {
  const wanted = names.map((name) => String(name).trim().toLowerCase()).filter(Boolean)
  const unknown = wanted.filter((name) => !projects.some((project) => nameOf(project).toLowerCase().includes(name)))
  if (unknown.length) throw new Error(`No project is called ${unknown.join(', ')}. The projects are: ${projects.map(nameOf).join(', ')}.`)
  const asked = wanted.length ? projects.filter((project) => wanted.some((name) => nameOf(project).toLowerCase().includes(name))) : projects.filter((project) => project.dir !== here)
  /** @type {Project[]} */
  const joins = []
  /** @type {{ name: string, why: string }[]} */
  const out = []
  for (const project of asked) {
    if (project.data.cloud === false && !(brain && isLocal(brain))) out.push({ name: nameOf(project), why: 'kept on this device' })
    else if (brain && !usedIn(brain, project.id)) out.push({ name: nameOf(project), why: 'this brain is not used there' })
    else if (joins.length < SPEAKERS) joins.push(project)
    else out.push({ name: nameOf(project), why: `${SPEAKERS} speak at most` })
  }
  return { joins, out }
}

/**
 * What a project knows, for its assistant to speak from: its instructions, the newest lines of its memory
 * that fit, and its latest tasks, each with the start of its last answer, but for one that used Google's services, which
 * goes to no other task (D440). Never another project's.
 * @param {FS} fs @param {Project} project
 */
export async function knows(fs, project) {
  const instructions = parseFrontMatter((await fs.read(join(project.dir, 'instructions.md'))) ?? '').body.trim()
  const memory = memoryText(parseMemory(await fs.read(join(project.dir, 'memory.md'))))
  const tasks = await Promise.all((await listConversations(fs, project.dir)).slice(0, TASKS).map(async ({ path, title, updatedAt }) => {
    const records = (await loadConversation(fs, path).catch(() => null))?.records ?? []
    const turns = foldTurns(limitedUse(records) ? [] : records)
    const answer = splitSuggestions(turns.at(-1)?.steps.map((step) => step.text).filter(Boolean).join(' ') ?? '').text.replace(/\s+/g, ' ').trim()
    return `- ${title || 'Untitled'}, ${updatedAt.slice(0, 10)}${answer ? `: ${answer.length > 300 ? `${answer.slice(0, 300)}…` : answer}` : ''}`
  }))
  return { instructions, memory, tasks: tasks.join('\n') }
}

/**
 * What a speaker is told, in English like every prompt: who it is, the meeting, and what its project knows.
 * @param {{ speaker: string, project: string, chair: string, body: string, instructions: string, memory: string, tasks: string }} about
 */
export function speakerPrompt({ speaker, project, chair, body, instructions, memory, tasks }) {
  const sections = { 'how-to-be': body.trim(), instructions, memory, tasks }
  return [`You are ${speaker}, the assistant of the project "${project}", in a meeting ${chair} holds with the assistants of other projects.

<rules>
- Speak for your project, from what it knows below. Never invent facts, numbers or plans.
- When what was said before concerns your project, agree, object or add to it.
- Two to five sentences: what matters to the topic, what you need, what you propose. Say "Nothing from me." when your project has nothing to add.
</rules>`, ...Object.entries(sections).filter(([, text]) => text).map(([name, text]) => `<${name}>\n${text}\n</${name}>`)].join('\n\n')
}

/** What a speaker is asked: the topic, and what was said so far. @param {string} topic @param {string} [minutes] */
export const request = (topic, minutes) => `The topic: ${topic}${minutes ? `\n\nWhat was said so far:\n\n${minutes}` : ''}\n\nWhat do you say for your project?`

/** The minutes: each round, what each speaker said. @param {{ speaker: string, said: string }[][]} rounds */
export const minutes = (rounds) => rounds.map((said, i) => `Round ${i + 1}:\n${said.map(({ speaker, said }) => `${speaker}: ${said}`).join('\n')}`).join('\n\n')

/**
 * What the chair gets back: the minutes, who was left out and why, and what to tell the user.
 * @param {string} topic @param {{ speaker: string, said: string }[][]} rounds @param {{ name: string, why: string }[]} out
 */
export const report = (topic, rounds, out) => [`The minutes of the meeting on "${topic}":`, minutes(rounds),
  ...(out.length ? [`Left out: ${out.map(({ name, why }) => `${name} (${why})`).join('; ')}.`] : []),
  'Tell the user what was decided, what each project will do, and what needs them.'].join('\n\n')

/** Runs the jobs a few at a time, as helpers do; a speaker that fails says so. @param {(() => Promise<string>)[]} jobs */
export async function pool(jobs, size = AT_ONCE) {
  /** @type {string[]} */
  const results = []
  let next = 0
  const work = async () => {
    for (let i = next++; i < jobs.length; i = next++) results[i] = await jobs[i]().catch((error) => `(Could not speak: ${error.message})`)
  }
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, work))
  return results
}
