// Jean's own directory of ready-made skills (D196), for what people ask of it: each a SKILL.md
// beside this module, shipped and kept offline with the skills capability, read when the directory
// is shown or a request is compared with it, and added as a skill from elsewhere is, once the
// user has read its steps. Each has an icon, drawn here, and in every language a name and a few
// words, in its own metadata (`title-<lang>`, `text-<lang>`, D222); its steps are in English, for the brain.
// Host-agnostic: no DOM.
import { parseSkill } from '../../core/skills.js'

/** @typedef {import('./sources.js').Entry & { icon: string, group: string, body: string, blocks?: string[] }} Ready  digest '': Jean's own, read from its own files, its steps too */

/** The skills, by name, with what they are for, as Settings' Add a skill groups them (D517), and their icon's path (24×24, drawn with a line). */
/** @type {readonly { name: string, group: string, icon: string, cap?: string, beside?: string[] }[]} */
export const DIRECTORY = Object.freeze([
  { name: 'plain-words', group: 'day', icon: 'M4.5 5.5h15v10h-8l-4 3.5v-3.5h-3zM8 9h8M8 12h5' },
  { name: 'letter', group: 'day', icon: 'M3.5 6.5h17v11h-17zM3.5 7l8.5 6 8.5-6' },
  { name: 'budget', group: 'day', icon: 'M5 7a7 2.5 0 1 0 14 0 7 2.5 0 1 0-14 0v10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V7M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5' },
  { name: 'compare', group: 'day', icon: 'M12 3.5v16M8 19.5h8M4.5 7.5h15M4.5 7.5l-2.5 6h5zM19.5 7.5l-2.5 6h5z' },
  { name: 'calendar-event', group: 'day', icon: 'M4.5 6h15v13.5h-15zM4.5 10h15M8.5 3.5V8M15.5 3.5V8M8 13.5h2M14 13.5h2M8 16.5h2' },
  { name: 'quiz', group: 'day', icon: 'M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 1 0-17 0M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 16.5v.5' },
  { name: 'learn-it', group: 'learning', icon: 'M12 6.5c-2-1.5-5-2-8.5-1.5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5v-13C17 4.5 14 5 12 6.5zM12 6.5v13' },
  { name: 'flash-cards', group: 'learning', icon: 'M4 9.5h12v10H4zM8 9.5v-4h12v10h-4' },
  { name: 'study-plan', group: 'learning', icon: 'M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 1 0-17 0M12 7v5l3.5 2' },
  { name: 'relations', group: 'drawn', icon: 'M4 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0M16 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0M10 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8 6h8M6.9 7.8l4.2 8.4M17.1 7.8l-4.2 8.4' },
  { name: 'project-plan', group: 'work', icon: 'M4 4.5v15h16M7 7.5h6M9.5 11.5h7M12.5 15.5h5.5' },
  { name: 'goals', group: 'work', icon: 'M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 1 0-17 0M7.5 12a4.5 4.5 0 1 0 9 0 4.5 4.5 0 1 0-9 0M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0' },
  { name: 'problem-solving', group: 'work', icon: 'M4 6.5h4.5M4 12h4.5M4 17.5h4.5M8.5 6.5 12 12l-3.5 5.5M12 12h8.5M17 9l3.5 3-3.5 3' },
  { name: 'process-improvement', group: 'work', icon: 'M3.5 8.5h5v7h-5zM15.5 8.5h5v7h-5zM8.5 12h7M13 9.5l2.5 2.5-2.5 2.5' },
  { name: 'risk-analysis', group: 'work', icon: 'M12 4 21 19.5H3zM12 10v4.5M12 17v.5' },
  { name: 'design-thinking', group: 'work', icon: 'M9.5 17.5h5M10.5 20.5h3M12 3.5a5.5 5.5 0 0 0-3.4 9.8c.6.5.9 1.2.9 1.9v.3h5v-.3c0-.7.3-1.4.9-1.9A5.5 5.5 0 0 0 12 3.5z' },
  { name: 'chart', group: 'drawn', icon: 'M3.5 19.5h17M6.5 19.5v-6M10.5 19.5V9M14.5 19.5v-8M18.5 19.5V5.5' },
  { name: 'visual', group: 'drawn', icon: 'M3.5 6.5l5-2 7 2 5-2v13l-5 2-7-2-5 2zM8.5 4.5v13M15.5 6.5v13' },
  { name: 'music-score', group: 'drawn', icon: 'M9 18.5V6l10-2v12.5M4 18.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M14 16.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0' },
  { name: 'slides', group: 'drawn', icon: 'M3.5 4.5h17M5 4.5V14a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 14V4.5M12 15.5V18M8.5 20.5 12 18l3.5 2.5M9 12v-1.5M12 12V8M15 12V9.5' },
  // Games (D648): the capability it brings, and its sheets beside its steps.
  { name: 'game', group: 'drawn', icon: 'M7.5 7h9a4.5 4.5 0 0 1 4.4 5.4l-1 4.4a2.3 2.3 0 0 1-4 1L14 16h-4l-1.9 1.8a2.3 2.3 0 0 1-4-1l-1-4.4A4.5 4.5 0 0 1 7.5 7zM8 10v4M6 12h4M15.5 10.5v.01M17.5 13v.01', cap: 'games', beside: ['phaser.md', 'babylon.md', 'canvas.md', 'feel.md'] },
  { name: 'pptx', group: 'drawn', icon: 'M6.5 3.5h8l4 4v13h-12zM14.5 3.5v4h4M9 14a3 3 0 1 0 6 0 3 3 0 1 0-6 0M12 11v3h3' },
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
  const read = await Promise.all(DIRECTORY.map(async ({ name, group, icon, cap, beside }) => {
    const url = new URL(`${name}/SKILL.md`, base).href
    const skill = await fetch(url).then(async (response) => (response.ok ? parseSkill(await response.text(), url) : null)).catch(() => null)
    return skill?.name === name ? [{ name, type: /** @type {const} */ ('skill-md'), description: skill.description, url, digest: '', source: '', icon, group, metadata: skill.metadata, body: skill.body, blocks: skill.blocks, cap, beside }] : []
  }))
  return read.flat()
}
