// Jean's own directory of ready-made skills (D196), for what people ask of it: each a SKILL.md
// beside this module, shipped and kept offline with the skills capability, read when the directory
// is shown or a request is compared with it, and added as a skill from elsewhere is, once the
// user has read its steps. Each has an icon, drawn here, and in every language a name and a few
// words (the dialogs' `skill.<name>`); its steps are in English, for the brain.
// Host-agnostic: no DOM.
import { parseSkill } from '../../core/skills.js'

/** @typedef {import('./sources.js').Entry & { icon: string }} Ready  digest '': Jean's own, read from its own files */

/** The skills, by name, with their icon's path (24×24, drawn with a line). */
export const DIRECTORY = Object.freeze([
  { name: 'chart', icon: 'M3.5 19.5h17M6.5 19.5v-6M10.5 19.5V9M14.5 19.5v-8M18.5 19.5V5.5' },
  { name: 'music-score', icon: 'M9 18.5V6l10-2v12.5M4 18.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M14 16.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0' },
  { name: 'slides', icon: 'M3.5 4.5h17v11h-17zM12 15.5v4M8 19.5h8' },
  { name: 'pptx', icon: 'M6.5 3.5h8l4 4v13h-12zM14.5 3.5v4h4M9 14a3 3 0 1 0 6 0 3 3 0 1 0-6 0M12 11v3h3' },
])

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
      return skill?.name === name ? [{ name, type: /** @type {const} */ ('skill-md'), description: skill.description, url, digest: '', source: '', icon }] : []
    } catch {
      return []
    }
  }))
  return read.flat()
}
