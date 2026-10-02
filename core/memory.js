// What Jean noticed (memory.md): one Markdown line per entry, oldest first, each with when,
// by whom and in which conversation it was noted, in an HTML comment that rendering hides.
// Curated by Jean, and the user can edit or delete any line.
import { parseFrontMatter, stringifyFrontMatter } from './settings.js'
import { estimateTokens } from './files.js'

/** @typedef {import('./types.js').FS} FS */
/** @typedef {{ text: string, at: string, by: string, conversation?: string }} Entry  conversation: its path */

const LINE = /^[-*]\s+(.+?)\s*(?:<!--(.*?)-->)?$/

/** @param {string | null} text @returns {Entry[]} */
export function parseMemory(text) {
  /** @type {Entry[]} */
  const entries = []
  for (const line of parseFrontMatter(text ?? '').body.split('\n')) {
    const match = LINE.exec(line.trim())
    if (!match) continue
    const about = Object.fromEntries((match[2] ?? '').trim().split(/\s+/).filter(Boolean).map((pair) => pair.split('=')))
    entries.push({ text: match[1], at: about.at ?? '', by: about.by ?? '', ...(about.conversation && { conversation: about.conversation }) })
  }
  return entries
}

/** @param {Entry[]} entries */
export function stringifyMemory(entries) {
  const lines = entries.map(({ text, at, by, conversation }) => `- ${oneLine(text)} <!-- at=${at} by=${by}${conversation ? ` conversation=${conversation}` : ''} -->\n`)
  return stringifyFrontMatter({ format: 1, kind: 'memory' }, lines.join(''))
}

/**
 * Reads a memory file, changes its entries, and writes it back if they changed.
 * @param {FS} fs @param {string} path @param {(entries: Entry[]) => Entry[]} change return the same array for no change
 */
export async function changeMemory(fs, path, change) {
  const entries = parseMemory(await fs.read(path))
  const changed = change(entries)
  if (changed !== entries) await fs.write(path, stringifyMemory(changed))
  return changed
}

/** An entry stays one line, and never closes its own comment. @param {string} text */
export const oneLine = (text) => text.replace(/\s+/g, ' ').replace(/-->/g, '→').trim()

/** What the brain reads: the newest lines that fit the budget, in their order. @param {Entry[]} entries */
export function memoryText(entries, budgetTokens = 1000) {
  const kept = []
  let used = 0
  for (const entry of [...entries].reverse()) {
    used += estimateTokens(entry.text) + 1
    if (used > budgetTokens) break
    kept.unshift(`- ${entry.text}`)
  }
  return kept.join('\n')
}
