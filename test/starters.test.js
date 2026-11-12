// SPDX-License-Identifier: MIT
// Ideas under the box (D743): what shows and in what order, and what is noticed on the device, requests asked again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { again, shown, fresh, MOST } from '../app/caps/starters/learn.js'

const SAME = 0.5
/** A task as the drawer lists it, the day given making it newer. @param {string} id @param {string} opening @param {number} day */
const task = (id, opening, day, title = '') => ({ id, path: `c/${id}.jsonl`, title, opening, createdAt: `2026-11-${String(day).padStart(2, '0')}T09:00:00.000Z`, updatedAt: '' })
/** An idea of the person's. @param {string} title */
const own = (title, prompt = `${title}, please`) => ({ title, prompt })

test('a request asked three times is an idea: the newest task’s title and request, hidden by any of its tasks', () => {
  const tasks = [
    task('a', 'Write the weekly report for the bakery from this week’s sales', 3),
    task('b', 'Write the weekly report for the bakery from last week’s sales', 10, 'Bakery report'),
    task('c', 'Write the weekly report for the bakery from these sales', 17, 'Weekly bakery report'),
    task('d', 'Plan a trip to Lisbon in May', 12),
    task('e', 'Translate this letter to German', 14),
  ]
  const [idea, ...rest] = again(tasks, SAME)
  assert.deepEqual(rest, [])
  assert.equal(idea.title, 'Weekly bakery report')
  assert.equal(idea.prompt, tasks[2].opening)
  assert.deepEqual(idea.keys?.toSorted(), ['again:a', 'again:b', 'again:c'])
  assert.deepEqual(again(tasks.slice(1), SAME), [], 'twice is not yet')
})

test('every task of a project of one kind still makes its idea; a routine’s runs never do, nor tasks with no request', () => {
  const tasks = ['lundi', 'mardi', 'mercredi'].map((day, i) => task(String(i), `Résume les mails du ${day} et dis-moi ce qui attend une réponse`, i + 1))
  assert.equal(again(tasks, SAME).length, 1)
  assert.deepEqual(again(tasks.map((one) => ({ ...one, routine: 'r' })), SAME), [])
  assert.deepEqual(again([...tasks.slice(0, 2), { ...tasks[2], opening: '' }], SAME), [])
})

test('in Japanese, as in every language, the kind is found by its words, the newest kind first', () => {
  const tasks = [
    task('a', '今週の売上から週報を書いてください', 1), task('b', '先週の売上から週報を書いてください', 2), task('c', '今月の売上から週報を書いてください', 3),
    task('d', '京都旅行の持ち物リストを作って', 4), task('e', '京都旅行の持ち物リストを作ってください', 5), task('f', '京都旅行の持ち物リストをもう一度作って', 6),
  ]
  const found = again(tasks, SAME)
  assert.deepEqual(found.map((idea) => idea.keys?.[0]), ['again:f', 'again:c'])
  assert.ok(tasks[5].opening.startsWith(found[0].title.replace(/…$/, '')), 'with no title yet, its request’s first words name it')
  assert.equal(found[0].prompt, tasks[5].opening)
})

test('the project’s own first, then those for everywhere, then what was noticed, four at most', () => {
  const noticed = [{ title: 'Report', prompt: 'Write the report', keys: ['again:a'] }, { title: 'Weekly', prompt: '', keys: ['flow:f'], open: () => {} }]
  const ideas = shown({ own: [own('Mine')], everywhere: [own('Everywhere')], noticed, hidden: [] })
  assert.deepEqual(ideas?.map((idea) => idea.title), ['Mine', 'Everywhere', 'Report', 'Weekly'])
  assert.equal(shown({ own: [own('1'), own('2'), own('3')], everywhere: [own('4'), own('5')], noticed, hidden: [] })?.length, MOST)
})

test('nothing of the person’s: null, for the organisation’s or Jean’s; an idea not written yet, hidden or kept already, doesn’t count', () => {
  const noticed = [{ title: 'Report', prompt: 'Write the report', keys: ['again:a', 'again:b'] }]
  assert.equal(shown({ own: [], everywhere: [], noticed: [], hidden: [] }), null)
  assert.equal(shown({ own: [own(''), own('Words', ' ')], everywhere: [], noticed, hidden: ['again:b'] }), null)
  assert.equal(shown({ own: [{ ...own('Kept'), from: ['again:a'] }], everywhere: [], noticed, hidden: [] })?.length, 1)
  assert.deepEqual(fresh(noticed, ['flow:x']), noticed)
})
