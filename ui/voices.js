// The device's voices, and the one that reads a text best (language.js): loaded with the
// first answer that can be read aloud, outside the first load. Only voices that run on the
// device; when none speaks a text's language, Jean says so rather than read it in another's.
import { signal } from '@preact/signals-core'
import { languageOf, rankVoices } from './language.js'
import { t, locale } from '../core/i18n.js'
import { notify } from './state.js'
import { speaking } from './speech.js'

const voices = signal(/** @type {SpeechSynthesisVoice[]} */ ([]))
// Chrome lists them a moment after it is first asked.
if (globalThis.speechSynthesis) {
  const update = () => { voices.value = speechSynthesis.getVoices() }
  speechSynthesis.addEventListener('voiceschanged', update)
  update()
}

/** The device's voices, for a list that updates when they arrive. */
export const deviceVoices = () => voices.value

/** Resolves once the voices are listed, or after a second (some devices have none). */
export async function listed() {
  if (voices.peek().length || !globalThis.speechSynthesis) return
  await new Promise((resolve) => {
    speechSynthesis.addEventListener('voiceschanged', resolve, { once: true })
    setTimeout(resolve, 1000)
  })
}

/**
 * A text's language, and the voice here that reads it best (null if none does): the user's pick
 * when it speaks that language.
 * @param {string} text @param {string} hint the interface language @param {string | null} [choice] the user's voice
 */
export function voiceFor(text, hint, choice) {
  const lang = languageOf(text, hint)
  const ranked = rankVoices(voices.peek(), lang, [hint, ...navigator.languages])
  return { lang, voice: ranked.find((voice) => voice.name === choice) ?? ranked[0] ?? null }
}

/** @param {string} lang */
export function noVoice(lang) {
  notify(t('speech.noVoice', { language: new Intl.DisplayNames([locale.value], { type: 'language' }).of(lang) ?? lang }))
}

/**
 * Reads a text aloud as `id`, unless that was stopped in the meantime.
 * @param {string} id @param {string} text @param {string} hint @param {string | null} [choice]
 */
export function read(id, text, hint, choice) {
  if (speaking.value !== id) return
  const { lang, voice } = voiceFor(text, hint, choice)
  if (!voice) {
    speaking.value = null
    return noVoice(lang)
  }
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = voice.lang
  utterance.voice = voice
  utterance.onend = utterance.onerror = () => {
    if (speaking.value === id) speaking.value = null
  }
  speechSynthesis.speak(utterance)
}
