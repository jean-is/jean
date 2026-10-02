// Skills are Agent Skills (https://agentskills.io): a folder per skill, skills/<name>/SKILL.md,
// whose front matter holds its name and when to use it. Only those go into the prompt; the
// steps are read when a request calls for them. Global ones live at the root, a project's in
// its own folder, and a project's skill replaces a global one with the same name.
import { join } from './fs.js'
import { parseFrontMatter, stringifyFrontMatter } from './settings.js'

/** @typedef {import('./types.js').FS} FS */
/** @typedef {{ name: string, description: string, title: string, body: string, path: string }} Skill  title: the first heading, in the user's language */

/** The standard's names: lower-case letters, digits and single hyphens, up to 64 characters. */
const NAME = /^(?=.{1,64}$)[a-z0-9]+(-[a-z0-9]+)*$/

/** @param {string} text @param {string} path @returns {Skill | null} */
export function parseSkill(text, path) {
  const { data, body } = parseFrontMatter(text)
  const name = String(data.name ?? '')
  const description = typeof data.description === 'string' ? data.description.trim() : ''
  if (!NAME.test(name) || !description) return null
  return { name, description, title: /^#\s+(.+)$/m.exec(body)?.[1].trim() ?? name.replace(/-/g, ' '), body: body.trim(), path }
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

/** The <skills> section. @param {Skill[]} skills */
export const skillLines = (skills) => skills.map((skill) => `- ${skill.name}: ${skill.description}`).join('\n')

/**
 * Writes skills/<name>/SKILL.md in a folder ('' for the global ones).
 * @param {FS} fs @param {string} dir
 * @param {{ name: string, description: string, body: string, by: string, now?: Date }} skill
 */
export async function saveSkill(fs, dir, { name, description, body, by, now = new Date() }) {
  if (!NAME.test(name)) throw new Error(`"${name}" is not a valid name: use lower-case letters, digits and hyphens.`)
  const path = join(dir, 'skills', name, 'SKILL.md')
  const about = { format: '1', author: by, created: now.toISOString() }
  await fs.write(path, stringifyFrontMatter({ name, description: description.replace(/\s+/g, ' ').trim().slice(0, 1024), metadata: about }, `${body.trim()}\n`))
  return path
}
