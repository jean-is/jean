// Live conversation (docs/product.md, "Voice"): hands-free. Silero hears when the user starts
// and stops speaking, Whistle or Whisper writes it in the box as it is said, as dictation does
// (caps/voice/passes.js), the message goes like a typed one once they stop, and the answer
// is read aloud sentence by sentence while it streams. Speaking over Jean interrupts it. Voice
// detection and speech to text run on this device, in dictation's worker (about 82 MB, once);
// reading aloud uses the voices read-aloud does, in the answer's own language: the natural voice where
// it is on and reads that language (caps/reader, D455), else the system's.
import { effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { live } from '../../ui/dictation.js'
import { app, effective, send, stop, notify } from '../../ui/state.js'
import { prepare, writing, detect } from '../voice/voice.js'
import { listener, speakable } from './turns.js'
import { splitSuggestions } from '../../core/events.js'
import { plainText } from '../../ui/spoken.js'
import { listed, voiceFor, noVoice, natural } from '../../ui/voices.js'
import { locale, t } from '../../core/i18n.js'
import { scriptURL } from '../../ui/trusted.js'

// The microphone's frames of 96 ms (three of Silero's 32 ms) that come before speech is sure, so its start isn't lost.
const PREROLL = 7

/** @type {{ stream: MediaStream, context: AudioContext } | null} */
let session = null

export async function toggle() {
  if (live.value === 'off') await start()
  else end()
}

async function start() {
  live.value = 'preparing'
  try {
    if (!(await prepare(Boolean(effective.value.settings.offers.live)))) return end()
    await listed()
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
    // At the microphone's own rate, as Firefox wants; the worklet makes the 16 kHz voice detection reads.
    const context = new AudioContext()
    session = { stream, context }
    await context.audioWorklet.addModule(scriptURL(new URL('../voice/capture-worklet.js', import.meta.url)))
    const node = new AudioWorkletNode(context, 'capture', { processorOptions: { rate: 16000 } })
    context.createMediaStreamSource(stream).connect(node)
    node.port.onmessage = hear()
    live.value = 'listening'
  } catch (error) {
    console.warn('Live conversation', error)
    end()
    notify(t(/** @type {any} */ (error)?.name === 'NotAllowedError' ? 'dictation.denied' : 'dictation.failed'))
  }
}

function end() {
  natural.live?.hush()
  for (const track of session?.stream.getTracks() ?? []) track.stop()
  session?.context.close()
  session = null
  globalThis.speechSynthesis?.cancel()
  live.value = 'off'
}

/** Turns the microphone's frames into the user's turns, each written in the box as it is said. */
function hear() {
  const turn = listener()
  /** @type {Float32Array[]} the last frames, for the start of what is said */
  let recent = []
  /** @type {ReturnType<typeof writing> | null} the turn being said: the box shows it alone, not one still being finished */
  let saying = null
  return async (/** @type {MessageEvent<Float32Array>} */ { data }) => {
    const changes = (await detect(data.slice())).map((chance) => turn(chance, live.value === 'speaking'))
    if (changes.includes('start')) {
      // Speaking over Jean: stop reading aloud, and stop the answer if it is still coming.
      quiet()
      const said = writing((words) => { if (saying === said) app.draft.value = words })
      saying = said
      for (const frame of recent) said.hear(frame)
    }
    saying?.hear(data)
    recent = [...recent, data].slice(-PREROLL)
    if (!changes.includes('end')) return
    if (saying && session) finish(saying)
    saying = null
  }
}

function quiet() {
  globalThis.speechSynthesis?.cancel()
  natural.live?.hush()
  if (answering) muted.add(answering)
  answering = null
  if (app.busy.peek()) stop()
  live.value = 'listening'
}

/** The turn's last words, then the message. @param {ReturnType<typeof writing>} said */
async function finish(said) {
  live.value = 'thinking'
  const text = await said.end().catch(() => '')
  if (!session) return
  if (!text) return void (live.value = 'listening')
  await send(text)
}

// ─── Reading the answer aloud ───────────────────────────────────────────────

/** @type {import('../../core/events.js').Turn | null} the answer being read */
let answering = null
/** How far into it reading has gone, in characters of its plain text. */
let read = 0
/** @type {((sentence: string) => void) | null | undefined} how its sentences are read, chosen from its first ones: null when no voice here speaks its language */
let reader
/** The natural voice's sentences not yet heard. */
let voicing = 0
/** Answers the user spoke over: never read again. */
const muted = new WeakSet()

effect(() => {
  const current = app.live.value
  if (live.peek() === 'off') return
  if (current && current.turn !== answering && !muted.has(current.turn)) [answering, read, reader] = [current.turn, 0, undefined]
  if (!answering) return
  const text = plainText(splitSuggestions(answering.steps.map((step) => step.text).filter(Boolean).join('\n\n')).text)
  const { ready, next } = speakable(text, read, locale.peek(), !current)
  read = next
  if (ready.length && reader === undefined) reader = readerFor(text)
  if (reader) for (const sentence of ready) reader(sentence)
  if (current) return
  answering = null
  // Nothing (more) to read: listen again.
  if (!speechSynthesis.speaking && !speechSynthesis.pending && !voicing) live.value = 'listening'
})

/** The voice picked for the answer's language (D525), else the natural voice where it is on and reads it, else a system voice that does. @param {string} text */
function readerFor(text) {
  const { lang, voice, picked } = voiceFor(text, locale.peek(), effective.peek().settings.voice)
  if (!picked && natural.live?.can(lang)) return (/** @type {string} */ sentence) => voiced(sentence, lang)
  if (!voice) noVoice(lang)
  return voice && ((/** @type {string} */ sentence) => say(sentence, voice))
}

/** @param {string} sentence @param {string} lang */
function voiced(sentence, lang) {
  live.value = 'speaking'
  voicing++
  natural.live?.say(sentence, lang, session?.context).catch((error) => console.warn('Natural voice', error)).finally(() => { voicing--; heard() })
}

/** @param {string} sentence @param {SpeechSynthesisVoice} voice */
function say(sentence, voice) {
  const utterance = new SpeechSynthesisUtterance(sentence)
  utterance.lang = voice.lang
  utterance.voice = voice
  utterance.onend = heard
  live.value = 'speaking'
  speechSynthesis.speak(utterance)
}

/** A sentence heard: once none is left and the answer is complete, listen again. */
function heard() {
  if (live.peek() === 'speaking' && !speechSynthesis.pending && !voicing && !app.busy.peek()) live.value = 'listening'
}

register({ id: 'live' })
