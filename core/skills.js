// Skills are Agent Skills (https://agentskills.io): a folder per skill, skills/<name>/SKILL.md,
// whose front matter holds its name and when to use it. Only those go into the prompt; the
// steps are read when a request calls for them. Global ones live at the root, a project's in
// its own folder, and a project's skill replaces a global one with the same name.
import { join } from './fs.js'
import { parseFrontMatter, stringifyFrontMatter } from './settings.js'

/** @typedef {import('./types.js').FS} FS */
/**
 * @typedef {{ name: string, description: string, title: string, body: string, path: string, license?: string, source?: string, digest?: string }} Skill
 * title: the first heading, in the user's language; source and digest: where one from elsewhere came from, as listed (D120)
 */

/** The standard's names: lower-case letters, digits and single hyphens, up to 64 characters. */
export const NAME = /^(?=.{1,64}$)[a-z0-9]+(-[a-z0-9]+)*$/
// What each description adds to <skills> (D120): a published one can run to a page.
const DESCRIBED = 300

/**
 * A published skill's front matter in the subset parseFrontMatter reads (D120): its folded (`>`)
 * or literal (`|`) blocks and its single-quoted strings become double-quoted ones.
 * @param {string} text
 */
function plain(text) {
  const [head, inner] = /^---\n([\s\S]*?)\n---\n/.exec(text) ?? []
  if (!head) return text
  const lines = inner.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const [, indent = '', key, raw = ''] = /^(\s*)([^\s:][^:]*):\s*(.*?)\s*$/.exec(lines[i]) ?? []
    if (!key) out.push(lines[i])
    else if (/^[>|][+-]?$/.test(raw)) {
      const block = []
      while (i + 1 < lines.length && /^(\s|$)/.test(lines[i + 1]) && !(indent && !lines[i + 1].startsWith(`${indent} `))) block.push(lines[++i].trim())
      out.push(`${indent}${key}: ${JSON.stringify(raw[0] === '>' ? block.join(' ').trim() : block.join('\n').trim())}`)
    } else out.push(/^'.*'$/.test(raw) ? `${indent}${key}: ${JSON.stringify(raw.slice(1, -1).replaceAll("''", "'"))}` : lines[i])
  }
  return `---\n${out.join('\n')}\n---\n${text.slice(head.length)}`
}

/** @param {string} text @param {string} path @returns {Skill | null} */
export function parseSkill(text, path) {
  const { data, body } = parseFrontMatter(plain(text.replace(/\r\n/g, '\n')))
  const name = String(data.name ?? '')
  const description = typeof data.description === 'string' ? data.description.replace(/\s+/g, ' ').trim() : ''
  if (!NAME.test(name) || !description) return null
  const about = typeof data.metadata === 'object' && data.metadata ? data.metadata : {}
  return {
    name, description, title: /^#\s+(.+)$/m.exec(body)?.[1].trim() ?? name.replace(/-/g, ' '), body: body.trim(), path,
    ...(typeof data.license === 'string' && { license: data.license }),
    ...(typeof about.source === 'string' && { source: about.source }),
    ...(typeof about.digest === 'string' && { digest: about.digest }),
  }
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

/** The <skills> section: each skill's name and when to use it, cut where it would go on. @param {Skill[]} skills */
export const skillLines = (skills) => skills.map(({ name, description }) => {
  const chars = [...description]
  return `- ${name}: ${chars.length > DESCRIBED ? `${chars.slice(0, DESCRIBED - 1).join('')}…` : description}`
}).join('\n')

/**
 * Writes skills/<name>/SKILL.md in a folder ('' for the global ones).
 * @param {FS} fs @param {string} dir
 * @param {{ name: string, description: string, body: string, by: string, now?: Date, license?: string, source?: string, digest?: string }} skill
 */
export async function saveSkill(fs, dir, { name, description, body, by, now = new Date(), license, source, digest }) {
  if (!NAME.test(name)) throw new Error(`"${name}" is not a valid name: use lower-case letters, digits and hyphens.`)
  const path = join(dir, 'skills', name, 'SKILL.md')
  const about = { format: '1', author: by, created: now.toISOString(), ...(source && { source }), ...(digest && { digest }) }
  const data = { name, description: description.replace(/\s+/g, ' ').trim().slice(0, 1024), ...(license && { license }), metadata: about }
  await fs.write(path, stringifyFrontMatter(data, `${body.trim()}\n`))
  return path
}
