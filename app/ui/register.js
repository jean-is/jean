// SPDX-License-Identifier: MIT
// The register answers address the person in (D776): formal, everyday or casual in every language, and in French the
// French of Rabelais and Montaigne too. The interface keeps its own, and the everyday one says nothing to the brain.

/** French's own register, named as it wrote itself, as a language's name is (D496). */
export const OLD_FRENCH = 'Vieux françois'

// Each line says the whole way of writing, in every reply: told the form of address alone, a brain says tu in the everyday
// register, and goes back to vous as soon as it explains. None names a language as an example, which a brain then answers
// in; and Vieux françois says it isn't today's French with old spellings, which is what a small brain writes otherwise.
const LINES = /** @type {Record<string, string>} */ ({
  formal: 'Write every reply to the user in a formal, elevated register, explanations included, the way a cultivated letter is written: polite forms of address throughout, literary words in place of everyday ones, long and carefully built sentences, the turns of phrase of courtesy, no colloquial word.',
  casual: 'Write every reply to the user in a casual register, explanations included, the way close friends talk: familiar forms of address throughout, colloquial words and slang, contractions, dropped words and short loose sentences, as their language is spoken, not written.',
  old: 'When you reply in French, write every sentence in the French of the sixteenth century, as Rabelais and Montaigne wrote it, not today’s French with a few old spellings: its spelling throughout (estoit, sçavoir, vostre, moy, mesme, luy, & for et), its words, and its long winding sentences and turns of phrase, keeping today’s words for what it had none for.',
})
/** What takes a register back: "everyday" alone reads as casual to a brain told to be. */
const EVERYDAY = 'The user no longer asks for a register: write to them in the neutral, standard register of their language, as you would with none asked.'

/** The registers a language offers, in the menu's order, '' the everyday one. @param {string} lang */
export const registersOf = (lang) => ['formal', '', 'casual', ...(/^fr\b/.test(lang) ? ['old'] : [])]

/**
 * What the brain reads of a register: nothing for the everyday one, or for one this language lacks, unless the
 * conversation was told another, which it is then taken back from in words.
 * @param {string | undefined} register @param {string} lang the interface's @param {boolean} [told]
 */
export function registerLine(register, lang, told = false) {
  const line = register && registersOf(lang).includes(register) && LINES[register]
  return line ? `${line} What you write for the user to send or keep takes the register it needs.` : told ? EVERYDAY : ''
}
