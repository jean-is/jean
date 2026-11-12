// SPDX-License-Identifier: MIT
// Tasks that go together (D716).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groups } from '../app/caps/projects/groups.js'

test('tasks about one thing are a group, named by its most telling word as a task writes it; four at least', () => {
  const bakery = ['Prix des croissants à la Boulangerie', 'Horaires de la boulangerie en août', 'Commande de farine pour la boulangerie', 'Affiche pour la boulangerie du quartier', 'Recrutement boulangerie: annonce']
  const other = ['Recipe for lentil soup', 'Translate this letter to German', 'Plan a trip to Lisbon', 'What is a Roth IRA', 'Fix my CV summary', 'Birthday poem for Zoé']
  const tasks = [...bakery, ...other].map((text, i) => ({ path: `c/${i}.jsonl`, text }))
  const found = groups(tasks)
  assert.equal(found.length, 1)
  assert.equal(found[0].name, 'Boulangerie')
  assert.deepEqual(found[0].paths.toSorted(), bakery.map((_, i) => `c/${i}.jsonl`))
  assert.deepEqual(groups(tasks.slice(2)), [])
})

test('in Japanese, words a segmenter finds make the group, never kana alone', () => {
  const trip = ['京都旅行の予算', '京都旅行の持ち物リスト', '京都旅行で行きたいお寺', '京都旅行のホテル比較']
  const tasks = [...trip, 'レシピについて', '手紙の翻訳について', '履歴書について'].map((text, i) => ({ path: `c/${i}.jsonl`, text }))
  const [group] = groups(tasks)
  assert.ok(['京都', '旅行'].includes(group.name))
  assert.equal(group.paths.length, 4)
})
