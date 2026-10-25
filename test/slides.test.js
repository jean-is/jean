// Slides (D591): what Jean changes in a deck's Markdown, as text, the rest of it byte for byte: a slide's layout, the kit
// the deck is drawn with in its headmatter, and Jean's version set against the user's, slide by slide (D505).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDeck } from '@codename/deck'
import { piecesOf, withKit, withoutKit, withLayout, changesOf, swapped } from '../app/caps/slides/edit.js'

const DECK = '---\ntitle: A second oven\n---\n\n# A second oven\n\nPlan for 2027\n\n---\n\n## Where we are\n\n- 120 croissants a day\n\n---\nlayout: fact\n---\n\n# 14 months\n\nto pay it back\n'
/** Each slide's layout and first words, as deck reads them. @param {string} source */
const read = (source) => parseDeck(source).slides.map((slide) => [slide.settings.layout ?? '', slide.title])

test('a deck is pieces, a slide each, that join back into it exactly, a rule in code or a comment cutting none', () => {
  const tricky = `${DECK}\n---\n\n## Code\n\n\`\`\`\n---\n\`\`\`\n\n<!--\n---\n-->\n`
  assert.equal(piecesOf(tricky).join(''), tricky)
  assert.equal(piecesOf(tricky).length, 4)
  assert.match(piecesOf(DECK)[1], /^\n---\n\n## Where we are/)
})

test('the kit goes into the headmatter as one line, read back as the deck’s own, and out again for the brain', () => {
  const kit = { name: 'Jean', tokens: { paper: '#ffffff', primary: '#f7c531', dark: { paper: '#19181b' } } }
  const kept = withKit(DECK, kit)
  assert.deepEqual(parseDeck(kept).settings.kit, kit)
  assert.deepEqual(read(kept), read(DECK), 'the slides as they were')
  assert.equal(withKit(kept, { name: 'Other' }), kept, 'a deck’s own kit stays')
  assert.equal(withoutKit(kept), DECK)
  const bare = '---\n\n# One\n\n---\n\n## Two\n'
  assert.deepEqual(read(withKit(bare, kit)), [['', 'One'], ['', 'Two']], 'no empty slide from a rule the deck starts with')
  assert.equal(withoutKit(withKit('# One\n', kit)), '# One\n')
})

test('a slide’s layout is set in its settings, the headmatter’s for the first, others kept, the rest of the deck untouched', () => {
  assert.deepEqual(read(withLayout(DECK, 0, 'cover')), [['cover', 'A second oven'], ['', 'Where we are'], ['fact', '14 months']])
  assert.match(withLayout(DECK, 0, 'cover'), /^---\ntitle: A second oven\nlayout: cover\n---\n/)
  assert.deepEqual(read(withLayout(DECK, 1, 'two-cols')), [['', 'A second oven'], ['two-cols', 'Where we are'], ['fact', '14 months']])
  assert.deepEqual(read(withLayout(DECK, 2, 'statement')), [['', 'A second oven'], ['', 'Where we are'], ['statement', '14 months']])
  assert.deepEqual(read(withLayout('# One\n\n---\n\n## Two\n', 0, 'section')), [['section', 'One'], ['', 'Two']])
  const twice = withLayout(withLayout(DECK, 1, 'two-cols'), 1, 'center')
  assert.equal(twice, withLayout(DECK, 1, 'center'), 'set again, it is changed, not added')
})

test('Jean’s version against the user’s: each slide changed, added or taken away is a change, taken or given up', () => {
  const theirs = DECK.replace('120 croissants a day', '150 croissants a day').replace('# 14 months', '# 12 months') + '\n---\n\n## Next steps\n'
  const changes = changesOf(DECK, theirs)
  assert.deepEqual(changes, [{ mine: [1, 2], theirs: [1, 2] }, { mine: [2, 3], theirs: [2, 3] }, { mine: [3, 3], theirs: [3, 4] }])
  // Taken: the user's deck with Jean's slides in place of theirs.
  const taken = swapped(DECK, changes[0].mine, theirs, changes[0].theirs)
  assert.match(taken, /150 croissants/)
  assert.deepEqual(changesOf(taken, theirs), [{ mine: [2, 3], theirs: [2, 3] }, { mine: [3, 3], theirs: [3, 4] }])
  // Given up: Jean's version with the user's slides in place of its own, one at a time.
  let left = swapped(theirs, [2, 3], DECK, [2, 3])
  left = swapped(left, [3, 4], DECK, [3, 3])
  assert.deepEqual(changesOf(taken, left), [], 'nothing left to decide')
  assert.equal(left, taken)
  // A slide taken away, the first changed: rules where a slide no longer comes first, and none before the first.
  const fewer = '# A second oven\n\n---\n\n## Where we are\n\n- 120 croissants a day\n'
  assert.deepEqual(changesOf(DECK, fewer), [{ mine: [0, 1], theirs: [0, 1] }, { mine: [2, 3], theirs: [2, 2] }])
  assert.deepEqual(read(swapped(DECK, [2, 3], fewer, [2, 2])), [['', 'A second oven'], ['', 'Where we are']])
  assert.deepEqual(read(swapped(DECK, [0, 2], fewer, [1, 2])), [['', 'Where we are'], ['fact', '14 months']])
  assert.deepEqual(read(swapped(fewer, [1, 1], DECK, [0, 1])), [['', 'A second oven'], ['', 'A second oven'], ['', 'Where we are']])
})
