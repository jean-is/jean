// SPDX-License-Identifier: MIT
// npm run tiers: Auto's tiers held against models.dev's catalogue, without the network.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lineOf, moves, review, said } from '../scripts/tiers.js'

/** A catalogue as models.dev's, of a few providers. */
const CATALOGUE = {
  openai: { models: {
    'gpt-6-luna': { release_date: '2026-09-22', cost: { input: 0.1, output: 0.5 } },
    'gpt-6-sol': { release_date: '2026-09-22', cost: { input: 2, output: 10 } },
    'gpt-6.2-sol': { release_date: '2026-11-17', cost: { input: 2, output: 10 } },
    'gpt-6.2-sol-healthcare': { release_date: '2026-11-24', cost: { input: 2, output: 10 } },
    'gpt-6-astra': { release_date: '2026-09-04', cost: { input: 10, output: 50 } },
    'gpt-6.3-astra': { release_date: '2026-12-01', cost: { input: 12, output: 60 } },
  } },
  mistral: { models: {
    'mistral-small-latest': { release_date: '2026-03-16', cost: { input: 0.15, output: 0.6 } },
    'mistral-medium-latest': { release_date: '2026-04-28', status: 'deprecated', cost: { input: 1.5, output: 7.5 } },
  } },
  'google-vertex': { models: { 'gemini-4-carbon': { release_date: '2026-11-10', cost: { input: 2, output: 10 } } } },
}

test('a version’s line is its name but for its numbers; a name with none follows its line itself', () => {
  assert.equal(lineOf('gpt-6-sol'), lineOf('gpt-6.2-sol'))
  assert.equal(lineOf('claude-haiku-4-5'), lineOf('claude-haiku-5-5'))
  assert.notEqual(lineOf('gpt-6.2-sol'), lineOf('gpt-6.2-sol-healthcare'))
  assert.notEqual(lineOf('gemini-3.8-flash'), lineOf('gemini-3.5-flash-lite'))
  assert.equal(lineOf('mistral-large-latest'), null)
})

test('each tier is current, retired, has a newer version at no more cost or at more, or isn’t listed; only a provider’s first two ask for a change', () => {
  const findings = review({ openai: ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra'], mistral: ['mistral-small-latest', 'mistral-medium-latest'], vertex: ['google/gemini-4-carbon'], chatgpt: ['gpt-6-luna', 'gpt-6-sol'], copilot: ['gpt-5-mini'] }, CATALOGUE)
  assert.deepEqual(findings.map(({ provider, model, kind, newer }) => [provider, model, kind, newer]), [
    ['openai', 'gpt-6-sol', 'newer', 'gpt-6.2-sol'],
    ['openai', 'gpt-6-astra', 'dearer', 'gpt-6.3-astra'],
    ['mistral', 'mistral-medium-latest', 'retired', undefined],
    ['chatgpt', 'gpt-6-sol', 'newer', 'gpt-6.2-sol'],
    ['copilot', 'gpt-5-mini', 'unlisted', undefined],
  ])
  // A plan's list is its program's: what the catalogue says of it is a note.
  assert.deepEqual(findings.filter(moves).map(({ provider, model }) => `${provider}:${model}`), ['openai:gpt-6-sol', 'mistral:mistral-medium-latest'])
  assert.equal(said(findings[0]), "openai's Smart, gpt-6-sol, has a newer version at no more cost: gpt-6.2-sol ($2 and $10 a million tokens read and written, from 2026-11-17)")
  assert.equal(said(findings[3]), "chatgpt's Smart, gpt-6-sol, has a newer version at no more cost: gpt-6.2-sol ($2 and $10 a million tokens read and written, from 2026-11-17) (a plan: check its program's own list)")
  assert.deepEqual(review({ openai: ['gpt-6.2-sol'] }, CATALOGUE), [], 'a version newer only by a variant of its own is current')
})
