// Dictation, private by default: the browser's on-device recognition where it has one
// (Chrome's processLocally), otherwise Whistle or a small Whisper, by language, in a worker,
// downloaded once with consent. Never the cloud recognition some browsers use by default.
import { register } from '../../ui/caps.js'
import { dictation } from '../../ui/dictation.js'
import { app, effective, answerOffer, updateSettings, weightsHost, notify } from '../../ui/state.js'
import { locale, t } from '../../core/i18n.js'
import { modelWorker } from '../../ui/model.js'
import { scriptURL } from '../../ui/trusted.js'
import { passes, join } from './passes.js'

register({ id: 'voice' })

/** About 80 MB, 8-bit weights (dtype "q8", files "_quantized"); runs on WebAssembly everywhere. */
const WHISPER = { model: 'onnx-community/whisper-base', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, megabytes: 80, offer: 'voice.download', engine: 'whisper' }
/** Whistle (D205), about 18 MB and many times faster, in the languages where it measured as good as Whisper or better. */
const WHISTLE = { engine: 'whistle', languages: ['en', 'de', 'fr', 'es', 'it', 'nl'], megabytes: 18, offer: 'voice.whistle' }
/** Which writes a language down. @param {string} lang a tag ("fr-FR") */
const writer = (lang) => (WHISTLE.languages.includes(lang.split('-')[0]) ? WHISTLE : WHISPER)
/** Voice detection for live conversation, about 2 MB. */
const SILERO = 'onnx-community/silero-vad'
const worker = modelWorker(new URL('./whisper-worker.js', import.meta.url), 'Dictation stopped')
// Voice detection in a worker of its own, so that live conversation hears a turn end on time, never behind a pass of Whisper.
const detector = modelWorker(new URL('./whisper-worker.js', import.meta.url), 'Dictation stopped')
/** The language's writer, loaded once, its download's progress shown in the box. @param {string} lang */
const load = (lang) => worker.call({ type: 'load', host: weightsHost(), ...writer(lang) }, {
  onMessage: ({ loaded, total }) => { dictation.value = { ...dictation.value, progress: Math.min(loaded / total, 1) } },
})
const Recognition = /** @type {any} */ (globalThis).SpeechRecognition ?? /** @type {any} */ (globalThis).webkitSpeechRecognition

/** How long the browser gets to install its on-device recognition, and to end once stopped. */
const INSTALL_MS = 15_000
const STOP_MS = 2_000

/** @type {{ stop: () => void } | null} */
let session = null
// Set when the browser's own recognition failed or heard nothing: use Whisper from then on.
let onDeviceFailed = false

/** The interface language as a full tag the recogniser knows ("fr" → "fr-FR" when the user has it). */
function languageTag() {
  const base = locale.value.split('-')[0]
  return navigator.languages.find((tag) => tag.toLowerCase().split('-')[0] === base) ?? locale.value
}

export async function toggle() {
  if (session) return session.stop()
  if (dictation.value.state !== 'idle') return
  const lang = languageTag()
  try {
    if (!onDeviceFailed && (await onDevice(lang))) return listen(lang)
    await record(lang)
  } catch (error) {
    console.warn('Dictation', error)
    session = null
    dictation.value = { state: 'idle' }
    notify(t(/** @type {any} */ (error)?.name === 'NotAllowedError' ? 'dictation.denied' : 'dictation.failed'))
  }
}

/** @param {string} lang */
async function onDevice(lang) {
  if (typeof Recognition?.available !== 'function') return false
  const options = { langs: [lang], processLocally: true }
  const status = await Recognition.available(options).catch(() => 'unavailable')
  if (status === 'available') return true
  // A writer already on this device beats a second download.
  if ((status !== 'downloadable' && status !== 'downloading') || effective.value.settings.offers[writer(lang).offer]) return false
  dictation.value = { state: 'preparing' }
  // Some Chromium browsers (Arc) offer the download, then never finish it.
  const installed = Boolean(await Promise.race([
    Recognition.install(options).catch(() => false),
    new Promise((resolve) => setTimeout(resolve, INSTALL_MS, false)),
  ]))
  dictation.value = { state: 'idle' }
  if (!installed) onDeviceFailed = true
  return installed
}

/** Live conversation is offered to people who dictate (ui/discovery.js). */
const counted = () => updateSettings({ dictated: (app.settings.value.dictated ?? 0) + 1 })

/**
 * The interface language's writer, for live conversation: downloaded once, with consent. False when the user declines.
 * @param {boolean} [consented] they accepted live conversation, which says how big it is
 */
export async function prepare(consented = false) {
  const { offer, megabytes } = writer(languageTag())
  if (!effective.value.settings.offers[offer]) {
    if (!consented && !confirm(t('dictation.download', { size: megabytes }))) return false
    await answerOffer(offer)
  }
  await load(languageTag())
  return true
}

/** Writes down what was said. @param {Float32Array} audio 16 kHz mono @param {string} lang a tag ("fr-FR") */
const write = async (audio, lang) => String((await worker.call({ type: 'transcribe', audio, language: lang.split('-')[0], engine: writer(lang).engine }, { transfer: [audio.buffer] })).text ?? '')

/** What is said in the interface language, written as it comes (passes.js), for live conversation's 16 kHz frames. @param {(words: string) => void} show */
export const writing = (show) => passes((audio) => write(audio, languageTag()), show, languageTag())

/** How likely each 32 ms of the frames is speech. @param {Float32Array} frames 16 kHz mono @returns {Promise<number[]>} */
export const detect = async (frames) => (await detector.call({ type: 'vad', host: weightsHost(), model: SILERO, audio: frames }, { transfer: [frames.buffer] })).speech

/** @param {string} lang */
function listen(lang) {
  const recognition = new Recognition()
  recognition.lang = lang
  recognition.processLocally = true
  recognition.interimResults = true
  recognition.continuous = true
  const before = app.draft.value
  let heard = false
  /** @type {string | null} */
  let error = null
  recognition.onresult = (/** @type {any} */ event) => {
    heard = true
    let words = ''
    for (const result of event.results) words += result[0].transcript
    app.draft.value = join(before, words.trim())
  }
  recognition.onerror = (/** @type {any} */ event) => {
    console.warn('Dictation', event.error)
    error = event.error
  }
  let ended = false
  const end = () => {
    if (ended) return
    ended = true
    session = null
    dictation.value = { state: 'idle' }
    if (error === 'not-allowed' || error === 'service-not-allowed') return notify(t('dictation.denied'))
    if (heard) counted()
    if (error === 'aborted' || heard) return
    // Some Chromium browsers say on-device recognition is there, then never deliver.
    onDeviceFailed = true
    notify(t(error === 'no-speech' ? 'dictation.nothing' : 'dictation.retry'))
  }
  recognition.onend = end
  // Nor do they always end when asked: the button never stays stuck on "listening".
  const stop = () => {
    recognition.stop()
    setTimeout(() => {
      if (ended) return
      recognition.abort()
      end()
    }, STOP_MS)
  }
  session = { stop }
  dictation.value = { state: 'listening' }
  recognition.start()
}

/** Whistle or Whisper, written as it is said (passes.js) until the second press. @param {string} lang */
async function record(lang) {
  const { offer, megabytes } = writer(lang)
  if (!effective.value.settings.offers[offer]) {
    if (!confirm(t('dictation.download', { size: megabytes }))) return
    await answerOffer(offer)
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  // At the microphone's own rate, as Firefox wants; the worklet makes 16 kHz.
  const context = new AudioContext()
  const release = () => (stream.getTracks().forEach((track) => track.stop()), context.close())
  await context.audioWorklet.addModule(scriptURL(new URL('./capture-worklet.js', import.meta.url))).catch((error) => release().then(() => Promise.reject(error)))
  const ready = load(lang)
  const before = app.draft.value
  /** What the audio says, once the writer is here; failing, dictation ends at once. @param {Float32Array<ArrayBuffer>} audio */
  const pass = (audio) => ready.then(() => write(audio, lang)).catch((error) => {
    stop()
    throw error
  })
  const said = passes(pass, (words) => { app.draft.value = join(before, words) }, lang)
  const stop = async () => {
    if (session?.stop !== stop) return
    release()
    session = null
    dictation.value = { state: 'transcribing' }
    const words = await said.end().catch((error) => console.warn('Dictation', error))
    dictation.value = { state: 'idle' }
    if (words) counted()
    else notify(t(words === undefined ? 'dictation.failed' : 'dictation.nothing'))
  }
  session = { stop }
  // A failed download shouldn't wait for the user to stop talking.
  ready.catch(stop)
  const node = new AudioWorkletNode(context, 'capture', { processorOptions: { rate: 16000 } })
  node.port.onmessage = ({ data }) => said.hear(data)
  context.createMediaStreamSource(stream).connect(node)
  dictation.value = { state: 'listening' }
}
