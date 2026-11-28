// SPDX-License-Identifier: MIT
// The register answers address the person in: what each language offers, and what the brain reads of it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSystemPrompt, promptState, promptRecord, frozenPrompt, changeNotes, basePromptForBudget } from '../app/core/prompt.js'
import { registersOf, registerLine, OLD_FRENCH } from '../app/ui/register.js'
import { LOCALES } from './fixtures/locales.js'

test('every language offers formal, everyday and casual, in that order, and French alone the French of Rabelais and Montaigne', () => {
  for (const lang of LOCALES) assert.deepEqual(registersOf(lang), /^fr\b/.test(lang) ? ['formal', '', 'casual', 'old'] : ['formal', '', 'casual'], lang)
  assert.deepEqual([registersOf('fr').at(-1), registersOf('fr-CA').at(-1)], ['old', 'old'])
  assert.equal(OLD_FRENCH, 'Vieux françois', 'named as it wrote itself')
})

test('the everyday register says nothing; another is one line on the whole way of writing, in every reply, what is written for others keeping its own', () => {
  assert.equal(registerLine(undefined, 'fr'), '')
  assert.equal(registerLine('', 'en'), '')
  assert.equal(registerLine('loud', 'en'), '', 'an unknown one is none')
  assert.match(registerLine('formal', 'ja'), /^Write every reply to the user in a formal, elevated register, explanations included, /)
  assert.match(registerLine('casual', 'de'), /^Write every reply to the user in a casual register, explanations included, /)
  assert.match(registerLine('old', 'fr'), /^When you reply in French, write every sentence in the French of the sixteenth century, as Rabelais and Montaigne wrote it, not today’s French with a few old spellings/)
  // The form of address alone gets tu in the everyday register: each says the words and the sentences too.
  assert.match(registerLine('formal', 'fr'), /polite forms of address throughout, literary words .*carefully built sentences/)
  assert.match(registerLine('casual', 'fr'), /familiar forms of address throughout, colloquial words and slang, contractions, .*loose sentences/)
  // A language named as an example is one a brain then answers in: French's own register alone names French.
  for (const lang of LOCALES) for (const register of ['formal', 'casual']) assert.doesNotMatch(registerLine(register, lang), /French|German|Japanese|English/, `${register} in ${lang}`)
  assert.equal(registerLine('old', 'fr-CA'), registerLine('old', 'fr'))
  // Kept for French, it is none while the interface is in another language.
  assert.equal(registerLine('old', 'en'), '')
  for (const register of ['formal', 'casual', 'old']) {
    const line = registerLine(register, 'fr')
    assert.match(line, / What you write for the user to send or keep takes the register it needs\.$/, register)
    assert.ok(!line.includes('\n') && line.length / 4 <= 120, `${register}: one line`)
    // No shouting (AGENTS.md).
    assert.doesNotMatch(line, /\b[A-Z]{3,}\b/, register)
    assert.doesNotMatch(line, /\b(always|only|never|must)\b/i, register)
  }
})

test('a conversation told a register is told when the everyday one comes back, in words that say standard, not everyday', () => {
  const back = 'The user no longer asks for a register: write to them in the neutral, standard register of their language, as you would with none asked.'
  assert.equal(registerLine('', 'fr', true), back)
  assert.equal(registerLine('old', 'en', true), back, 'French’s own, the interface now in English')
  assert.equal(registerLine('formal', 'fr', true), registerLine('formal', 'fr'))
})

test('the prompt holds the register right after the language, and nothing of it by default', () => {
  const line = registerLine('formal', 'fr')
  const prompt = buildSystemPrompt({ assistantName: 'Jean', uiLanguage: 'French', sections: { register: line, project: 'Bakery', instructions: 'Keep it short.' } })
  assert.ok(prompt.includes(`use French.\n</language>\n\n<register>\n${line}\n</register>\n\n<project>\nBakery\n</project>\n\n<instructions>`), prompt)
  assert.doesNotMatch(buildSystemPrompt({ assistantName: 'Jean', uiLanguage: 'French', sections: { project: 'Bakery' } }), /register/)
  assert.doesNotMatch(basePromptForBudget(), /register/)
})

test('a register chosen, changed or taken back in a conversation is a note, the prompt staying as it was', () => {
  const at = new Date(2026, 10, 28)
  const state = (/** @type {string} */ register, told = false) => {
    const sections = { register: registerLine(register, 'fr', told) }
    return { sections, state: promptState({ language: 'French', tools: [], now: at, sections }) }
  }
  const start = state('')
  assert.deepEqual(start.state, { language: 'French', date: '2026-11-28', tools: [] }, 'nothing of it kept by default')
  const system = buildSystemPrompt({ assistantName: 'Jean', uiLanguage: 'French', sections: start.sections })
  const records = [promptRecord('dev', system, start.state)]

  const old = state('old')
  const chosen = changeNotes(start.state, old.state, old.sections)
  assert.deepEqual(chosen.map((note) => note.update?.sessionUpdate === '_system_note' && note.update.text), [`The <register> section is now:\n${registerLine('old', 'fr')}`])
  records.push(...chosen)
  assert.deepEqual(changeNotes(/** @type {any} */ (frozenPrompt(records)).state, old.state, old.sections), [], 'said once')

  const told = Boolean(frozenPrompt(records)?.state.sections?.register)
  assert.equal(told, true)
  const back = state('', told)
  const taken = changeNotes(/** @type {any} */ (frozenPrompt(records)).state, back.state, back.sections)
  assert.deepEqual(taken.map((note) => note.update?.sessionUpdate === '_system_note' && note.update.text), ['The <register> section is now:\nThe user no longer asks for a register: write to them in the neutral, standard register of their language, as you would with none asked.'])
  records.push(...taken)
  assert.equal(frozenPrompt(records)?.system, system)
  assert.deepEqual(changeNotes(/** @type {any} */ (frozenPrompt(records)).state, state('', true).state, state('', true).sections), [], 'and stays said')
})
