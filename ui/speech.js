// Read aloud with the operating system's voices, preferring voices that run
// on the device (localService) so nothing is sent anywhere.
import { signal } from '@preact/signals-core'

export const speaking = signal(/** @type {string | null} */ (null))

/** @param {string} lang */
export function voicesFor(lang) {
  if (!globalThis.speechSynthesis) return []
  const base = lang.split('-')[0]
  return speechSynthesis.getVoices().filter((voice) => voice.localService && voice.lang.toLowerCase().startsWith(base))
}

/**
 * Speak a text, or stop if this text is already being spoken.
 * @param {string} id @param {string} text @param {string} lang @param {string | null} [voiceName]
 */
export function toggleSpeech(id, text, lang, voiceName) {
  if (!globalThis.speechSynthesis) return
  speechSynthesis.cancel()
  if (speaking.value === id) {
    speaking.value = null
    return
  }
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  const voices = voicesFor(lang)
  const voice = voices.find((candidate) => candidate.name === voiceName) ?? voices.find((candidate) => candidate.default) ?? voices[0]
  if (voice) utterance.voice = voice
  utterance.onend = utterance.onerror = () => {
    if (speaking.value === id) speaking.value = null
  }
  speaking.value = id
  speechSynthesis.speak(utterance)
}

export const canSpeak = () => Boolean(globalThis.speechSynthesis)
