// The device's voices, and the one that reads a text best (language.js): loaded with the
// first answer that can be read aloud, outside the first load. Only voices that run on the
// device; when none speaks a text's language, Jean says so rather than read it in another's.
// The natural voice (caps/reader, D455), once on, reads the languages it speaks well.
import { signal } from '@preact/signals-core'
import { languageOf, rankVoices } from './language.js'
import { t, intlLocales } from '../core/i18n.js'
import { app, notify, updateSettings } from './state.js'
import { speaking } from './speech.js'
import { plainText } from './spoken.js'

/** The languages Kyutai's Pocket TTS documents, which the natural voice reads (D455). */
export const NATURAL = ['de', 'en', 'es', 'fr', 'it', 'pt']
/** Whose voice reads each: Kyutai's speakers, credited by name (D455, D525). */
export const SPEAKERS = /** @type {Record<string, string>} */ ({ de: 'Alba MacKenna', en: 'Alba MacKenna', es: 'Lola', fr: 'Stuart Bell', it: 'Giovanni', pt: 'Alba MacKenna' })
/**
 * The natural voice (caps/reader), once one of its languages is here: true when it reads the text; the
 * language answers were read in when it was offered, which it downloads first; and Live conversation's way
 * to it (caps/live): whether it reads a language now, a sentence queued after the last, heard when its
 * promise settles, in Live's own AudioContext, and silence.
 * @type {{ read: ((id: string, text: string, lang: string) => boolean) | null, wanted: string | null,
 *   live: { can: (lang: string) => boolean, say: (text: string, lang: string, context?: AudioContext) => Promise<unknown>, hush: () => void } | null }}
 */
export const natural = { read: null, wanted: null, live: null }
/** Answers read aloud in one of its languages before it is offered. */
const READ = 3

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
 * when it speaks that language, which the natural voice gives way to (D525).
 * @param {string} text @param {string} hint the interface language @param {string | null} [choice] the user's voice @param {string} [lang] the text's, when known
 */
export function voiceFor(text, hint, choice, lang = languageOf(text, hint)) {
  const ranked = rankVoices(voices.peek(), lang, [hint, ...navigator.languages])
  const picked = ranked.find((voice) => voice.name === choice)
  return { lang, voice: picked ?? ranked[0] ?? null, picked: Boolean(picked) }
}

/** @param {string} lang */
export function noVoice(lang) {
  notify(t('speech.noVoice', { language: new Intl.DisplayNames(intlLocales(), { type: 'language' }).of(lang) ?? lang }))
}

/**
 * Reads a message aloud as `id`, unless that was stopped in the meantime. A sample, in a language given, never
 * counts towards offering the natural voice.
 * @param {string} id @param {string} source its markdown @param {string} hint @param {string | null} [choice] @param {string} [given]
 */
export function read(id, source, hint, choice, given) {
  if (speaking.value !== id) return
  const text = plainText(source)
  const { lang, voice, picked } = voiceFor(text, hint, choice, given)
  if (!picked && NATURAL.includes(lang) && (natural.read ? natural.read(id, text, lang) : !given && offer(lang))) return
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

/**
 * Counts a reading in one of the natural voice's languages; from the third, ui/discovery.js offers it, told
 * by an event (a saved copy, D305, has no discovery). False: read on. @param {string} lang
 */
function offer(lang) {
  const count = (/** @type {any} */ (app.settings.peek()).readAloud ?? 0) + 1
  natural.wanted = lang
  updateSettings(/** @type {any} */ ({ readAloud: count }))
  if (count >= READ) document.dispatchEvent(new CustomEvent('app-read-natural'))
  return false
}

/** Settings' Listen (D525): a sentence in the language `tag` names, read as an answer in it would be, by the voice picked; pressed again, it stops. @param {string} text @param {string} tag @param {string | null} choice */
export function listen(text, tag, choice) {
  speechSynthesis.cancel()
  speaking.value = speaking.peek() === 'sample' ? null : 'sample'
  read('sample', text, tag, choice, tag.split('-')[0])
}
