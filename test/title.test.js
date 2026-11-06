// A task's title (ui/title.js): the reply of the brain asked for one, tidied, and none when it is in another
// script than the message, as a title in another language would be (a Japanese task once came back in French).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tidy } from '../app/ui/title.js'

const JA = 'レアの7歳のお誕生日会の招待状を作って。11月14日（土）午後3時から、リヨンのリラ通り12番地で。'
const AR = 'صمّم دعوة لعيد ميلاد ليا السابع: السبت ١٤ نوفمبر الساعة ٣ عصرًا، في ١٢ شارع الزنابق، ليون.'

test('title: a reply in its message’s script is kept, tidied', () => {
  assert.equal(tidy('レアの7歳誕生日会招待状', JA), 'レアの7歳誕生日会招待状')
  assert.equal(tidy('دعوة عيد ميلاد ليا', AR), 'دعوة عيد ميلاد ليا')
  assert.equal(tidy('**Plan a sailing trip.**', 'Plan a 3-day sailing trip for two beginners'), 'Plan a sailing trip')
  assert.equal(tidy('« Anniversaire de Léa »', 'Fais une invitation pour l’anniversaire de Léa'), 'Anniversaire de Léa')
  // Latin words in a Japanese message may stay Latin in its title.
  assert.equal(tidy('Excel VLOOKUPで売上集計', 'ExcelのVLOOKUPで売上を集計して'), 'Excel VLOOKUPで売上集計')
  // A message with no letters tells no script.
  assert.equal(tidy('Simple sum', '2+2?'), 'Simple sum')
})

test('title: a reply in another script than its message is none, for the message’s first words to stand in', () => {
  assert.equal(tidy('Anniversaire de Rose : invitation à 7 ans', JA), '')
  assert.equal(tidy('Léa’s seventh birthday', AR), '')
  assert.equal(tidy('誕生日の招待状', 'Make an invitation for Léa’s seventh birthday'), '')
})
