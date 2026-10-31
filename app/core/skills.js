// Skills are Agent Skills (https://agentskills.io): a folder per skill, skills/<name>/SKILL.md,
// whose front matter holds its name and when to use it. Only those go into the prompt; the
// steps are read when a request calls for them. Global ones live at the root, a project's in
// its own folder, and a project's skill replaces a global one with the same name. A skill may
// declare the kinds of fenced block it writes (`metadata.blocks`, D196), which Jean draws as widgets.
import { dirname, join, walk } from './fs.js'
import { parseFrontMatter, stringifyFrontMatter } from './settings.js'

/** @typedef {import('./types.js').FS} FS */
/**
 * @typedef {{ name: string, description: string, title: string, body: string, path: string, source?: string, blocks?: string[], metadata?: Record<string, any> }} Skill
 *   title: the first heading, in the user's language; source: where a skill from elsewhere came from (D121);
 *   blocks: the kinds of fenced block it writes, such as "echarts" (D196); metadata: its front matter's, kept as it came,
 *   with the name and few words it is shown with in each language it gives them in (`title-fr`, `text-fr`, D222)
 */

/** The standard's names: lower-case letters, digits and single hyphens, up to 64 characters. */
const NAME = /^(?=.{1,64}$)[a-z0-9]+(-[a-z0-9]+)*$/
const BLOCK = /^[a-z0-9][a-z0-9+-]{0,31}$/

/** The kinds of block a skill declares, from `metadata.blocks`: "echarts" or "abc, vega-lite". @param {unknown} value @returns {string[]} */
export const blocksOf = (value) => [...new Set(String(value ?? '').toLowerCase().split(/[\s,]+/).filter((kind) => BLOCK.test(kind)))]

/** @param {string} text @param {string} path @returns {Skill | null} */
export function parseSkill(text, path) {
  const { data, body } = parseFrontMatter(text)
  const name = String(data.name ?? '')
  const description = typeof data.description === 'string' ? data.description.trim() : ''
  if (!NAME.test(name) || !description) return null
  const source = typeof data.metadata?.source === 'string' ? data.metadata.source : undefined
  const blocks = blocksOf(data.metadata?.blocks)
  const metadata = typeof data.metadata === 'object' && data.metadata
  return { name, description, title: /^#\s+(.+)$/m.exec(body)?.[1].trim() ?? name.replace(/-/g, ' '), body: body.trim(), path, ...(source && { source }), ...(blocks.length && { blocks }), ...(metadata && { metadata }) }
}

/** Every skill in these folders' skills/, by name. @param {FS} fs @param {string[]} dirs @returns {Promise<Skill[]>} */
export async function listSkills(fs, dirs) {
  /** @type {Map<string, Skill>} */
  const found = new Map()
  for (const dir of dirs) {
    for (const entry of await fs.list(join(dir, 'skills'))) {
      const path = join(dir, 'skills', entry.name, 'SKILL.md')
      const skill = entry.kind === 'directory' ? parseSkill((await fs.read(path)) ?? '', path) : null
      if (skill?.name === entry.name) found.set(skill.name, skill)
    }
  }
  return [...found.values()]
}

/**
 * A skill as a brain names it, its name's underscores read as hyphens, which a name never has: a small brain
 * asked for process_improvement (D406). A file after "/" is kept as it is. @param {string} named
 */
export const skillNamed = (named) => named.trim().replace(/^[^/]*/, (name) => name.replaceAll('_', '-'))

/**
 * A skill's steps, naming the files beside them, or one of those files ("name/references/forms.md", its .md said or not).
 * @param {FS} fs @param {Skill[]} skills those it is looked for in @param {string} named
 */
export async function skillSteps(fs, skills, named) {
  const [name, ...rest] = named.trim().split('/')
  const skill = skills.find((candidate) => candidate.name === name)
  if (!skill) throw new Error(`There is no skill named "${name}". Skills: ${skills.map((candidate) => candidate.name).join(', ') || 'none'}.`)
  const folder = dirname(skill.path)
  if (rest.length) {
    const text = rest.includes('..') ? null : await fs.read(join(folder, ...rest)) ?? await fs.read(`${join(folder, ...rest)}.md`)
    if (text === null) throw new Error(`The skill "${name}" has no file "${rest.join('/')}".`)
    return text
  }
  const beside = (await walk(fs, folder)).map((path) => path.slice(folder.length + 1)).filter((path) => path !== 'SKILL.md')
  return beside.length ? `${skill.body}\n\nFiles beside these steps: ${beside.join(', ')}. Read one with skill({ name: "${name}/<file>" }).` : skill.body
}

/** The <skills> section. @param {{ name: string, description: string }[]} skills */
export const skillLines = (skills) => skills.map((skill) => `- ${skill.name}: ${skill.description}`).join('\n')

/**
 * Writes skills/<name>/SKILL.md in a folder ('' for the global ones). A skill from elsewhere keeps
 * where it came from and the digest it was checked against (D121); any skill, the kinds of block it draws, and the
 * metadata it came with (D222), whose author and date a skill saved again keeps.
 * @param {FS} fs @param {string} dir
 * @param {{ name: string, description: string, body: string, by: string, now?: Date, source?: string, digest?: string, blocks?: string[], metadata?: Record<string, any> }} skill
 */
export async function saveSkill(fs, dir, { name, description, body, by, now = new Date(), source, digest, blocks, metadata }) {
  if (!NAME.test(name)) throw new Error(`"${name}" is not a valid name: use lower-case letters, digits and hyphens.`)
  const path = join(dir, 'skills', name, 'SKILL.md')
  const { format: _, ...kept } = metadata ?? {}
  const about = { format: '1', author: by, created: now.toISOString(), ...kept, ...(source && { source }), ...(digest && { digest }), ...(blocks?.length && { blocks: blocks.join(' ') }) }
  await fs.write(path, stringifyFrontMatter({ name, description: description.replace(/\s+/g, ' ').trim().slice(0, 1024), metadata: about }, `${body.trim()}\n`))
  return path
}
