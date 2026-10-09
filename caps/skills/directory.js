// Jean's own directory of ready-made skills (D196), for what people ask of it: each a SKILL.md
// beside this module, shipped and kept offline with the skills capability, read when the directory
// is shown or a request is compared with it, and added as a skill from elsewhere is, once the
// user has read its steps. Each has an icon, drawn here, and in every language a name and a few
// words, in its own metadata (`title-<lang>`, `text-<lang>`, D222); its steps are in English, for the brain.
// Host-agnostic: no DOM.
import { parseSkill } from '../../core/skills.js'

/** @typedef {import('./sources.js').Entry & { icon: string }} Ready  digest '': Jean's own, read from its own files */

/** The skills, by name, with their icon's path (24×24, drawn with a line). */
export const DIRECTORY = Object.freeze([
  { name: 'plain-words', icon: 'M4.5 5.5h15v10h-8l-4 3.5v-3.5h-3zM8 9h8M8 12h5' },
  { name: 'letter', icon: 'M3.5 6.5h17v11h-17zM3.5 7l8.5 6 8.5-6' },
  { name: 'budget', icon: 'M5 7a7 2.5 0 1 0 14 0 7 2.5 0 1 0-14 0v10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V7M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5' },
  { name: 'compare', icon: 'M12 3.5v16M8 19.5h8M4.5 7.5h15M4.5 7.5l-2.5 6h5zM19.5 7.5l-2.5 6h5z' },
  { name: 'calendar-event', icon: 'M4.5 6h15v13.5h-15zM4.5 10h15M8.5 3.5V8M15.5 3.5V8M8 13.5h2M14 13.5h2M8 16.5h2' },
  { name: 'quiz', icon: 'M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 1 0-17 0M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 16.5v.5' },
  { name: 'relations', icon: 'M4 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0M16 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0M10 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8 6h8M6.9 7.8l4.2 8.4M17.1 7.8l-4.2 8.4' },
  { name: 'chart', icon: 'M3.5 19.5h17M6.5 19.5v-6M10.5 19.5V9M14.5 19.5v-8M18.5 19.5V5.5' },
  { name: 'music-score', icon: 'M9 18.5V6l10-2v12.5M4 18.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M14 16.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0' },
  { name: 'slides', icon: 'M3.5 4.5h17v11h-17zM12 15.5v4M8 19.5h8' },
  { name: 'pptx', icon: 'M6.5 3.5h8l4 4v13h-12zM14.5 3.5v4h4M9 14a3 3 0 1 0 6 0 3 3 0 1 0-6 0M12 11v3h3' },
])

/**
 * What a skill is called and when it is used: in this language when its metadata gives it (D222), else in English, else as
 * written. @param {{ name: string, description: string, title?: string, metadata?: Record<string, any> }} skill @param {string} lang
 */
export function shownIn({ name, description, title = name, metadata = {} }, lang) {
  const tag = [lang, 'en'].find((each) => typeof metadata[`title-${each}`] === 'string')
  return tag ? { title: String(metadata[`title-${tag}`]), text: String(metadata[`text-${tag}`] ?? description) } : { title, text: description }
}

/**
 * The directory's skills, each as its SKILL.md says (one that can't be read is left out).
 * @param {{ fetch?: typeof globalThis.fetch, base?: string | URL }} [options] base: where the directory is
 * @returns {Promise<Ready[]>}
 */
export async function readDirectory({ fetch = globalThis.fetch, base = new URL('directory/', import.meta.url) } = {}) {
  const read = await Promise.all(DIRECTORY.map(async ({ name, icon }) => {
    const url = new URL(`${name}/SKILL.md`, base).href
    try {
      const response = await fetch(url)
      const skill = response.ok ? parseSkill(await response.text(), url) : null
      return skill?.name === name ? [{ name, type: /** @type {const} */ ('skill-md'), description: skill.description, url, digest: '', source: '', icon, metadata: skill.metadata }] : []
    } catch {
      return []
    }
  }))
  return read.flat()
}
