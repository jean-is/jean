// Read aloud with the operating system's voices, only those that run on the device
// (localService), so nothing is sent anywhere. Each answer is read in its own language, which
// isn't always the one Jean is shown in, by the voice that reads it best (ui/voices.js).
import { signal } from '@preact/signals-core'

export const speaking = signal(/** @type {string | null} */ (null))

/** ui/voices.js, loaded with the first answer that can be read aloud. */
let voices = /** @type {typeof import('./voices.js') | null} */ (null)
let loading = /** @type {Promise<typeof import('./voices.js')> | null} */ (null)
const load = () => (loading ??= import('./voices.js').then((module) => (voices = module), (error) => {
  loading = null
  throw error
}))

/**
 * Speak a text, or stop if this text is already being spoken.
 * @param {string} id @param {string} text @param {string} hint the interface language
 * @param {string | null} [choice] the user's voice, used when it speaks the text's language
 */
export function toggleSpeech(id, text, hint, choice) {
  if (!globalThis.speechSynthesis) return
  speechSynthesis.cancel()
  if (speaking.value === id) {
    speaking.value = null
    return
  }
  speaking.value = id
  // Within the click, as Safari wants: the voices are usually listed by then.
  if (voices?.deviceVoices().length) return voices.read(id, text, hint, choice)
  load().then(async (module) => {
    await module.listed()
    module.read(id, text, hint, choice)
  }, () => { speaking.value = null })
}

export function canSpeak() {
  if (!globalThis.speechSynthesis) return false
  load().catch((error) => console.warn('Read aloud', error))
  return true
}
