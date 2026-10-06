// Dictation, private by default: the browser's on-device recognition where it has one
// (Chrome's processLocally), otherwise a small Whisper in a worker, downloaded once with
// consent. Never the cloud recognition some browsers use by default.
import { register } from '../../ui/caps.js'
import { dictation } from '../../ui/dictation.js'
import { app, effective, answerOffer, updateSettings, weightsHost, notify } from '../../ui/state.js'
import { locale, t } from '../../core/i18n.js'
import { modelWorker } from '../../ui/model.js'

register({ id: 'voice' })

/** About 80 MB, 8-bit weights (dtype "q8", files "_quantized"); runs on WebAssembly everywhere. */
const WHISPER = { model: 'onnx-community/whisper-base', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, megabytes: 80 }
/** Voice detection for live conversation, about 2 MB. */
const SILERO = 'onnx-community/silero-vad'
const OFFER = 'voice.download'
const worker = modelWorker(new URL('./whisper-worker.js', import.meta.url), 'Dictation stopped')
/** Whisper, loaded once, its download's progress shown in the box. */
const load = () => worker.call({ type: 'load', host: weightsHost(), ...WHISPER }, {
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
  // Whisper already on this device beats a second download.
  if ((status !== 'downloadable' && status !== 'downloading') || effective.value.settings.offers[OFFER]) return false
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
 * Whisper, for live conversation: downloaded once, with consent. False when the user declines.
 * @param {boolean} [consented] they accepted live conversation, which says how big it is
 */
export async function prepare(consented = false) {
  if (!effective.value.settings.offers[OFFER]) {
    if (!consented && !confirm(t('dictation.download', { size: WHISPER.megabytes }))) return false
    await answerOffer(OFFER)
  }
  await load()
  return true
}

/** What was said, in the interface language. @param {Float32Array} audio 16 kHz mono */
export const transcribe = async (audio) => String((await worker.call({ type: 'transcribe', audio, language: languageTag().split('-')[0] }, { transfer: [audio.buffer] })).text ?? '')

/** How likely each 32 ms of the frames is speech. @param {Float32Array} frames 16 kHz mono @returns {Promise<number[]>} */
export const detect = async (frames) => (await worker.call({ type: 'vad', host: weightsHost(), model: SILERO, audio: frames }, { transfer: [frames.buffer] })).speech

/** Appends dictated words to the draft, keeping what was typed. @param {string} before @param {string} words */
const join = (before, words) => (before && words && !/\s$/.test(before) ? `${before} ${words}` : before + words)

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

/** Whisper: record until the second press, then transcribe. @param {string} lang */
async function record(lang) {
  if (!effective.value.settings.offers[OFFER]) {
    if (!confirm(t('dictation.download', { size: WHISPER.megabytes }))) return
    await answerOffer(OFFER)
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  /** @type {Blob[]} */
  const chunks = []
  const ready = load()
  // A failed download shouldn't wait for the user to stop talking.
  ready.catch(() => recorder.state === 'recording' && recorder.stop())
  recorder.ondataavailable = (event) => chunks.push(event.data)
  recorder.onstop = async () => {
    for (const track of stream.getTracks()) track.stop()
    session = null
    dictation.value = { state: 'transcribing' }
    try {
      await ready
      const audio = await decode(new Blob(chunks, { type: recorder.mimeType }))
      const { text } = await worker.call({ type: 'transcribe', audio, language: lang.split('-')[0] }, { transfer: [audio.buffer] })
      const words = String(text ?? '').trim()
      if (words) {
        app.draft.value = join(app.draft.value, words)
        counted()
      } else notify(t('dictation.nothing'))
    } catch (error) {
      console.warn('Dictation', error)
      notify(t('dictation.failed'))
    } finally {
      dictation.value = { state: 'idle' }
    }
  }
  session = { stop: () => recorder.stop() }
  dictation.value = { state: 'listening' }
  recorder.start()
}

/** Mono, 16 kHz, as Whisper wants. @param {Blob} blob */
async function decode(blob) {
  const context = new AudioContext({ sampleRate: 16000 })
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    const mono = new Float32Array(buffer.length)
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channel = buffer.getChannelData(c)
      for (let i = 0; i < channel.length; i++) mono[i] += channel[i] / buffer.numberOfChannels
    }
    return mono
  } finally {
    context.close()
  }
}
