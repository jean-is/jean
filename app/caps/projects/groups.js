// Tasks that go together (D716): what each task's title is about, by its telling words, those of five letters or more
// (two signs where words aren't spaced, never kana alone), which leaves out the little words of every language. The word in
// the most tasks, four at least and at most half of them, makes a group of those tasks, and the rest are looked at again.
// Its name is that word as a title writes it. Pure, under node --test.
import { keys, fold } from '../../core/search.js'

/** @typedef {{ path: string, text: string }} Task */

const UNSPACED = /[\p{Script=Han}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u
/** Whether a word says what a title is about. @param {string} word */
const telling = (word) => (UNSPACED.test(word) ? [...word].length >= 2 : !/^\p{Script=Hiragana}+$/u.test(word) && [...word].length >= 5)

/** @param {Task[]} tasks @param {{ least?: number }} [options] @returns {{ name: string, paths: string[] }[]} */
export function groups(tasks, { least = 4 } = {}) {
  const words = tasks.map(({ text }) => new Set(keys(text).filter(telling)))
  const left = new Set(tasks.keys()), found = []
  for (;;) {
    const count = /** @type {Map<string, number>} */ (new Map())
    for (const i of left) for (const word of words[i]) count.set(word, (count.get(word) ?? 0) + 1)
    const best = [...count].filter(([, n]) => n >= least && n <= Math.max(least, tasks.length / 2)).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]
    if (!best) return found
    const members = [...left].filter((i) => words[i].has(best[0]))
    const word = members.flatMap((i) => tasks[i].text.match(/[\p{L}\p{N}]+/gu) ?? []).find((one) => fold(one) === best[0]) ?? best[0]
    found.push({ name: word.charAt(0).toLocaleUpperCase() + word.slice(1), paths: members.map((i) => tasks[i].path) })
    for (const i of members) left.delete(i)
  }
}
