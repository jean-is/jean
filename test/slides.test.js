// Slides (D200): a ```marp block read as Marp writes a deck: its slides, each with the settings
// that hold on it, and nothing of the comments, notes or pictures' layout words drawn.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lex } from '../ui/markdown.js'
import { readDeck } from '../caps/slides/deck.js'

/** Each slide as the kinds of its tokens and the settings that hold on it. @param {string} source */
const read = (source) => readDeck(source, lex).map(({ tokens, settings }) => ({ kinds: tokens.map((token) => token.type), settings }))

test('slides are cut at rules, not at a rule in code, and the front matter is settings, not a slide', () => {
  const deck = read('---\npaginate: true\nfooter: "Bakery, 2027"\n---\n\n# Plan\n\n---\n\n## Code\n\n```\n---\n```\n\n***\n\n- one')
  assert.deepEqual(deck.map((slide) => slide.kinds), [['heading'], ['heading', 'code'], ['list']])
  assert.deepEqual(deck[2].settings, { paginate: 'true', footer: 'Bakery, 2027' })
  assert.equal(readDeck('---\n\n# Not front matter\n\n---\n\nTwo', lex).length, 3, 'a rule first, then slides')
})

test('a setting holds from its slide on, one with _ on its slide only', () => {
  const deck = read('# One\n\n---\n\n<!-- class: invert -->\n<!-- _paginate: false -->\n## Two\n\n---\n\n<!--\n_class: lead\nbackgroundColor: navy\n-->\n## Three\n\n---\n\nFour')
  assert.deepEqual(deck.map((slide) => slide.settings), [
    {},
    { class: 'invert', paginate: 'false' },
    { class: 'lead', backgroundColor: 'navy' },
    { class: 'invert', backgroundColor: 'navy' },
  ])
  assert.deepEqual(deck[1].kinds, ['heading'], 'the comments aren’t shown')
})

test('the speaker’s notes and other comments are never shown, nor settings written in a line', () => {
  const [slide] = readDeck('## Sales\n\n<!-- Say the numbers slowly. -->\n\nUp 20% <!-- _class: lead --> this year.', lex)
  assert.deepEqual(slide.tokens.map((token) => token.type), ['heading', 'paragraph'])
  assert.equal(slide.tokens[1].tokens.map((/** @type {any} */ part) => part.raw).join(''), 'Up 20%  this year.')
  assert.deepEqual(slide.settings, { class: 'lead' })
})

test('pictures: colours set the slide’s, a background picture is left out, and the layout words aren’t shown', () => {
  const [slide] = readDeck('![bg](#1e3a5f)\n![](white)\n\n![bg left:40%](photo.jpg)\n\n## Oven\n\n![w:200 The new oven](oven.png)', lex)
  assert.deepEqual(slide.settings, { backgroundColor: '#1e3a5f', color: 'white' })
  assert.deepEqual(slide.tokens.map((token) => token.type), ['heading', 'paragraph'])
  assert.equal(slide.tokens[1].tokens[0].text, 'The new oven')
})
