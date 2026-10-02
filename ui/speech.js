// Read aloud with the operating system's voices, preferring voices that run
// on the device (localService) so nothing is sent anywhere. The voice speaks the
// answer's own language, which isn't always the one Jean is shown in.
import { signal } from '@preact/signals-core'

export const speaking = signal(/** @type {string | null} */ (null))

// Until the guesser has loaded (with the first answer that can be read aloud), the interface language.
let languageOf = (/** @type {string} */ _text, /** @type {string} */ hint) => hint.split('-')[0]
let guessing = false

/** @param {string} lang */
export function voicesFor(lang) {
  if (!globalThis.speechSynthesis) return []
  const base = lang.split('-')[0]
  return speechSynthesis.getVoices().filter((voice) => voice.localService && voice.lang.toLowerCase().startsWith(base))
}

/**
 * Speak a text, or stop if this text is already being spoken.
 * @param {string} id @param {string} text @param {string} hint the interface language
 * @param {string | null} [voiceName] the user's voice, used when it speaks the text's language
 */
export function toggleSpeech(id, text, hint, voiceName) {
  if (!globalThis.speechSynthesis) return
  speechSynthesis.cancel()
  if (speaking.value === id) {
    speaking.value = null
    return
  }
  const lang = languageOf(text, hint)
  const utterance = new SpeechSynthesisUtterance(text)
  const voices = voicesFor(lang)
  // The user's own variety first ("fr-CA" over "fr-FR"), then the system's choice.
  const theirs = [hint, ...navigator.languages].map((tag) => tag.toLowerCase())
  const voice = voices.find((candidate) => candidate.name === voiceName)
    ?? voices.find((candidate) => theirs.includes(candidate.lang.toLowerCase().replace('_', '-')))
    ?? voices.find((candidate) => candidate.default) ?? voices[0]
  utterance.lang = voice?.lang ?? lang
  if (voice) utterance.voice = voice
  utterance.onend = utterance.onerror = () => {
    if (speaking.value === id) speaking.value = null
  }
  speaking.value = id
  speechSynthesis.speak(utterance)
}

export function canSpeak() {
  if (!globalThis.speechSynthesis) return false
  if (!guessing) {
    guessing = true
    import('../core/language.js').then((module) => { languageOf = module.languageOf }, () => { guessing = false })
  }
  return true
}
