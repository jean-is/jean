// SPDX-License-Identifier: MIT
// A Formula column's words as tokens: numbers, "text", the row's columns by their names as written (the longest name first, as it is cased before in any case),
// operators, brackets and functions' names, so that a renamed column keeps its formulas (`renamed()`). What a formula works out is ../formula/engine.js's, fetched
// by a collection that has one. Pure, so Node's tests run it.

/** @import { Property } from './table.js' */
/** @typedef {{ text: string, at: number, column?: Property }} Token */

const TOKEN = /^(?:(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[\p{L}_][\p{L}\p{N}_]*|\*\*|[<>!]=|<>|[-+*/%^(),=<>&])/iu

/** Why a formula can't be read and where, for its dialog to say: a word it doesn't know, a bracket or a quote left open, a function given too few or too many parts, a part missing, or one too many. */
export class Unread extends Error {
  /** @param {number} at @param {'word' | 'close' | 'quote' | 'parts' | 'more' | 'extra'} why @param {string} [word] */
  constructor(at, why, word = '') { super('This formula can\'t be worked out.'); this.at = at; this.why = why; this.word = word }
}

/** A formula's tokens, a column's where its name is written, the longest first, as a word of its own. @param {string} text @param {Property[]} columns @returns {Token[]} */
export function tokens(text, columns) {
  const named = [...columns].sort((a, b) => b.name.length - a.name.length), out = []
  for (let at = 0; at < text.length;) {
    const rest = text.slice(at), space = /^\s+/u.exec(rest)?.[0].length
    if (space) { at += space; continue }
    /** The longest name written here, as a word of its own, not a function's. @param {(said: string, name: string) => boolean} same */
    const written = (same) => named.find(({ name }) => same(rest.slice(0, name.length), name) && !/^(?:[\p{L}\p{N}_]|\s*\()/u.test(rest.slice(name.length)))
    const column = written((said, name) => said === name) ?? written((said, name) => said.toLocaleLowerCase() === name.toLocaleLowerCase())
    const found = column ? rest.slice(0, column.name.length) : TOKEN.exec(rest)?.[0]
    if (!found) throw new Unread(at, /^["']/.test(rest) ? 'quote' : 'word', rest[0])
    out.push({ text: found, at, column })
    at += found.length
  }
  return out
}

/** A formula with a column's name written anew where it names it; as it was when it can't be read. @param {string} text @param {Property[]} columns @param {string} id @param {string} name */
export function renamed(text, columns, id, name) {
  try { return tokens(text, columns).reduceRight((out, token) => (token.column?.id === id ? `${out.slice(0, token.at)}${name}${out.slice(token.at + token.text.length)}` : out), text) } catch { return text }
}
