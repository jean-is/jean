// The box's / and @ as text (D199): what is being typed after either at a word's start, what
// matches it, which of the words picked a message still holds, an earlier task as the brain reads
// it, and the note that tells the brain what each word names. ui/complete.js is the menu.
// Host-agnostic: no DOM.
import { fold } from '../core/search.js'
import { filesMade, foldTurns, splitSuggestions } from '../core/events.js'

/** @typedef {{ kind: '/' | '@', query: string, start: number }} Typing  start: where the / or @ is */

/**
 * What is typed after / or @ at a word's start, up to the caret, their full-width forms too (／, ＠),
 * as Chinese and Japanese keyboards type them; null when nothing is.
 * @param {string} text @param {number} caret @returns {Typing | null}
 */
export function typing(text, caret) {
  const match = /(?:^|\s)([/@／＠])(\S*)$/u.exec(text.slice(0, caret))
  if (!match) return null
  return { kind: match[1] === '／' || match[1] === '/' ? '/' : '@', query: match[2], start: caret - match[2].length - 1 }
}

/** Words to look in, as matching() reads them: composed and folded (core/search.js). @param {string} text */
export const searchable = (text) => fold(text.normalize('NFC'))

/**
 * The options whose words hold what was typed, case and accents aside: those that start with
 * it first, then those with a word that does, then the rest, each in its own order.
 * @template {{ words: string }} T @param {T[]} options their words made searchable() @param {string} query
 * @returns {T[]}
 */
export function matching(options, query) {
  const wanted = searchable(query)
  if (!wanted) return options
  /** @type {T[][]} */
  const ranks = [[], [], []]
  for (const option of options) {
    const at = option.words.indexOf(wanted)
    if (at >= 0) ranks[at === 0 ? 0 : /[\s/._-]/.test(option.words[at - 1]) ? 1 : 2].push(option)
  }
  return ranks.flat()
}

/** @param {string} text */
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The words picked that a message still holds, each at a word's start and followed by a space,
 * a mark or its end; the longest first, so "/Mail 2" isn't also "/Mail". Case aside, as a
 * name typed by hand may differ.
 * @param {string} text @param {string[]} words @returns {string[]}
 */
export function holds(text, words) {
  let left = text
  /** @type {string[]} */
  const found = []
  for (const word of [...new Set(words)].sort((a, b) => b.length - a.length)) {
    let hit = false
    left = left.replace(new RegExp(`(^|\\s)${escape(word)}(?=$|[\\s.,;:!?…)\\]}»"'])`, 'giu'), (_, before) => {
      hit = true
      return before
    })
    if (hit) found.push(word)
  }
  return found
}

/**
 * An earlier task as the brain reads it when the user points at it, or a routine's earlier run
 * (D122): what was asked, the files shared, what was answered and the files made, in order;
 * when longer than `max` characters, its start and its end.
 * @param {import('../core/types.js').Envelope[]} records @param {number} [max]
 */
export function digest(records, max = 16_000) {
  const text = foldTurns(records).flatMap((turn) => {
    const asked = turn.user ? [...turn.user.files.map((file) => `[${file.name}]`), turn.user.text].filter(Boolean).join(' ') : ''
    const answer = splitSuggestions(turn.steps.map((step) => step.text).filter(Boolean).join('\n\n')).text.trim()
    const made = [...new Set(filesMade(turn.steps.flatMap((step) => step.tools)).map((file) => file.name))]
    const answered = [answer && `Assistant: ${answer}`, made.length ? `Files made: ${made.join(', ')}` : ''].filter(Boolean).join('\n')
    return [...(asked ? [`User: ${asked}`] : []), ...(answered ? [answered] : [])]
  }).join('\n\n')
  if (text.length <= max) return text
  const head = Math.round(max / 8)
  return `${text.slice(0, head)}\n\n…\n\n${text.slice(text.length - (max - head))}`
}

/**
 * The note before a message that names things (D199): what each word names, in English, and
 * below it what it brings (a skill's steps, an earlier task).
 * @param {{ word: string, means: string, body?: string }[]} named
 */
export function pointing(named) {
  return ["In the user's next message:", ...named.map(({ word, means, body }) => `- "${word}" ${means}${body ? `:\n\n${body.trim()}\n` : '.'}`)].join('\n')
}
