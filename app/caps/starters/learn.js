// SPDX-License-Identifier: MIT
// Ideas under the box (D743): what shows, four at most, the project's own, then the person's everywhere, then those noticed and
// not hidden; and what is noticed on the device, never by a brain: requests asked again, tasks that began alike (the same kind
// as Skills is offered for, D121), three at least. Pure, under node --test.
import { alike } from '../../core/search.js'
import { firstWords } from '../../core/i18n.js'

/** An idea: its words, its request with a skill it brings, or what it opens; noticed, the keys that hide it, one per task of its kind or its flow's; kept from one, its keys. @typedef {{ title: string, prompt: string, skill?: string, open?: () => unknown, keys?: string[], from?: string[] }} Idea */

/** The ideas under the box, at most. */
export const MOST = 4

/**
 * Each kind of request asked three times or more, as an idea: the newest task's title, and its request to change before it
 * goes; newest kind first, among the newest 200 tasks. @param {import('../../core/types.js').ConversationSummary[]} tasks @param {number} same how alike a kind's first words are
 * @returns {Idea[]}
 */
export function again(tasks, same, least = 3) {
  let left = tasks.filter((task) => task.opening && !task.routine).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 200)
  const found = []
  while (left.length) {
    const [newest, ...rest] = left
    const scores = alike(firstWords(newest.opening), rest.map((task) => firstWords(task.opening)))
    const kind = [newest, ...rest.filter((_, i) => scores[i] >= same)]
    if (kind.length >= least) found.push({ title: newest.title || firstWords(newest.opening), prompt: newest.opening, keys: kind.map((task) => `again:${task.id}`) })
    left = left.filter((task) => !kind.includes(task))
  }
  return found
}

/**
 * What shows under the box, or null for the organisation's or Jean's when there is nothing: the project's own and the person's
 * everywhere, each with words and a request, then what was noticed, unless hidden or kept already.
 * @param {{ own: Idea[], everywhere: Idea[], noticed: Idea[], hidden: string[] }} lists @returns {Idea[] | null}
 */
export function shown({ own, everywhere, noticed, hidden }) {
  const mine = [...own, ...everywhere].filter((idea) => idea.title.trim() && idea.prompt.trim())
  const all = [...mine, ...fresh(noticed, [...hidden, ...mine.flatMap((idea) => idea.from ?? [])])].slice(0, MOST)
  return all.length ? all : null
}

/**
 * One of the organisation's ideas in a language, as a skill names itself (D222): `title-fr-CA`, then `title-fr`, then
 * `title-en`, then `title`. @param {Record<string, string>} item @param {string} lang @returns {Idea}
 */
export function worded(item, lang) {
  const field = (/** @type {string} */ name) => [lang, lang.split('-')[0], 'en'].map((each) => item[`${name}-${each}`]).find(Boolean) ?? item[name]
  return { title: field('title'), prompt: field('prompt'), skill: item.skill }
}

/** What was noticed, but for what one of these keys hides. @param {Idea[]} noticed @param {string[]} gone */
export const fresh = (noticed, gone) => noticed.filter((idea) => !idea.keys?.some((key) => gone.includes(key)))
