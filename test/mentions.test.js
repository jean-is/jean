// The box's / and @ as text (D199): what is typed after either at a word's start, what matches
// it, which picked words a message still holds, an earlier task as the brain reads it, and the note;
// a request cut where it names something and at its tags (D610).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { typing, searchable, matching, holds, pieces, digest, pointing } from '../app/ui/mentions.js'
import { envelope, userRecords } from '../app/core/events.js'

test('typing: a / or @ at a word’s start, up to the caret', () => {
  assert.deepEqual(typing('/', 1), { kind: '/', query: '', start: 0 })
  assert.deepEqual(typing('Make a chart /cha', 17), { kind: '/', query: 'cha', start: 13 })
  assert.deepEqual(typing('Read @docs/plan.md', 18), { kind: '@', query: 'docs/plan.md', start: 5 })
  assert.deepEqual(typing('Read @docs and more', 10), { kind: '@', query: 'docs', start: 5 })
  assert.deepEqual(typing('line one\n@Bud', 13), { kind: '@', query: 'Bud', start: 9 })
  // As Chinese and Japanese keyboards type them, after a full-width space too.
  assert.deepEqual(typing('グラフ　／チャ', 7), { kind: '/', query: 'チャ', start: 4 })
  assert.deepEqual(typing('＠予算', 3), { kind: '@', query: '予算', start: 0 })
  // In a word, an address or a mail, after a space: nothing.
  for (const text of ['and/or', 'https://example.com', 'marie@example.com', '/charts ', 'a @ b']) assert.equal(typing(text, text.length), null, text)
})

test('matching: what starts with it, then a word that does, then the rest, case and accents aside', () => {
  const options = ['Web search', 'Résumé.pdf', 'Charts', 'Search', 'research notes', '会議の議事録'].map((label) => ({ label, words: searchable(label) }))
  assert.deepEqual(matching(options, 'sea').map((option) => option.label), ['Search', 'Web search', 'research notes'])
  assert.deepEqual(matching(options, 'RESU').map((option) => option.label), ['Résumé.pdf'])
  assert.deepEqual(matching(options, '議事').map((option) => option.label), ['会議の議事録'])
  assert.equal(matching(options, '').length, options.length)
  assert.deepEqual(matching(options, 'xyz'), [])
})

test('holds: the picked words a message still holds, the longest first, case aside', () => {
  assert.deepEqual(holds('/Mail 2 and /mail, then /charts.', ['/Mail', '/Mail 2', '/charts', '/Notion']), ['/Mail 2', '/charts', '/Mail'])
  assert.deepEqual(holds('Only /Mail 2 here', ['/Mail', '/Mail 2']), ['/Mail 2'])
  assert.deepEqual(holds('See @Budget 2026, and @docs/', ['@Budget 2026', '@docs/', '@docs/plan.md']), ['@Budget 2026', '@docs/'])
  // In a word, or followed by more of one: not named.
  assert.deepEqual(holds('a/charts and /chartsy', ['/charts']), [])
  // What a pattern would read as one.
  assert.deepEqual(holds('see @a.b (x) and @a+b', ['@a.b (x)', '@axb', '@a+b']), ['@a.b (x)', '@a+b'])
})

test('pieces: a text cut where it names a word given, the longest first, case aside, and at its tags', () => {
  assert.deepEqual(pieces('Plot /chart and /Documents and spreadsheets, #sales', ['/chart', '/documents and spreadsheets', '/documents']), [
    { text: 'Plot ', at: 0 },
    { text: '/chart', at: 5, kind: 'name' },
    { text: ' and ', at: 11 },
    { text: '/Documents and spreadsheets', at: 16, kind: 'name' },
    { text: ', ', at: 43 },
    { text: '#sales', at: 45, kind: 'tag' },
  ])
  // In a word, a year, a heading, or followed by more of a word: neither.
  assert.deepEqual(pieces('a/chart C# #1984 # title /charts', ['/chart']), [{ text: 'a/chart C# #1984 # title /charts', at: 0 }])
  // A tag in brackets, with a slash, in Japanese, on a line of its own; and with nothing to name.
  assert.deepEqual(pieces('(#plan/2026) 予定\n#会議', []).filter((piece) => piece.kind).map((piece) => piece.text), ['#plan/2026', '#会議'])
  assert.deepEqual(pieces('', ['/chart']), [])
})

test('digest: what was asked, shared and answered, without the follow-ups; its start and end when long', () => {
  const answer = (/** @type {string} */ text) => envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }, 0)
  const records = [
    ...userRecords('Sum up the budget', [{ type: 'resource_link', uri: 'files/sha256-a.xlsx', name: 'Budget.xlsx' }], 'me'),
    answer('The total is 1,200.\n\n<suggestions>\n- Chart it\n</suggestions>'),
    ...userRecords('And per month?', [], 'me'),
    answer('About 100.'),
  ]
  assert.equal(digest(records), 'User: [Budget.xlsx] Sum up the budget\n\nAssistant: The total is 1,200.\n\nUser: And per month?\n\nAssistant: About 100.')
  // The files an answer made, named after it.
  const file = { uri: 'files/sha256-b.xlsx', name: 'Monthly.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 10 }
  const made = envelope('jean', /** @type {any} */ ({ sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'Write Monthly.xlsx', kind: 'edit', status: 'completed', _meta: { file } }), 0)
  assert.equal(digest([...records, made]), 'User: [Budget.xlsx] Sum up the budget\n\nAssistant: The total is 1,200.\n\nUser: And per month?\n\nAssistant: About 100.\nFiles made: Monthly.xlsx')
  const long = digest(records, 60)
  assert.ok(long.startsWith('User: [') && long.endsWith('About 100.') && long.includes('\n…\n') && long.length < 70, long)
})

test('pointing: a line for each word, with what it brings below it', () => {
  assert.equal(pointing([
    { word: '/charts', means: 'is the skill charts: follow its steps for this message', body: '# Charts\n\nWrite an echarts block.\n' },
    { word: '/Web search', means: 'asks you to use web_search for this message' },
  ]), 'In the user\'s next message:\n- "/charts" is the skill charts: follow its steps for this message:\n\n# Charts\n\nWrite an echarts block.\n\n- "/Web search" asks you to use web_search for this message.')
})
