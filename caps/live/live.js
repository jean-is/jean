// Live conversation (docs/product.md, "Voice"): hands-free. Silero hears when the user starts
// and stops speaking, Whisper writes it down, the message goes like a typed one, and the answer
// is read aloud sentence by sentence while it streams. Speaking over Jean interrupts it. Voice
// detection and speech to text run on this device, in dictation's worker (about 82 MB, once);
// reading aloud uses the system's voices, like read-aloud.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { register } from '../../ui/caps.js'
import { app, effective, send, stop, notify, setPresence } from '../../ui/state.js'
import { prepare, transcribe, detect } from '../voice/voice.js'
import { listener, speakable } from './turns.js'
import { splitSuggestions } from '../../core/events.js'
import { plainText } from '../../ui/markdown.js'
import { voicesFor } from '../../ui/speech.js'
import { locale, t } from '../../core/i18n.js'
import { scriptURL } from '../../ui/trusted.js'
import { icons } from '../../ui/icons.js'

/** @typedef {'off' | 'preparing' | 'listening' | 'thinking' | 'speaking'} State */
export const live = signal(/** @type {State} */ ('off'))

const LABELS = { preparing: 'dictation.preparing', listening: 'dictation.listening', thinking: 'activity.thinking', speaking: 'live.speaking' }
// Silero reads 512 samples at a time (32 ms); this many come before speech is sure, so its start isn't lost.
const FRAME = 512
const PREROLL = 20

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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
    const context = new AudioContext({ sampleRate: 16000 })
    session = { stream, context }
    await context.audioWorklet.addModule(scriptURL(new URL('./capture-worklet.js', import.meta.url)))
    const node = new AudioWorkletNode(context, 'capture')
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
  for (const track of session?.stream.getTracks() ?? []) track.stop()
  session?.context.close()
  session = null
  globalThis.speechSynthesis?.cancel()
  live.value = 'off'
}

/** Turns the microphone's frames into the user's turns. */
function hear() {
  const turn = listener()
  /** @type {Float32Array[]} the frames of what is being said, and a few from just before */
  let heard = []
  let speaking = false
  return async (/** @type {MessageEvent<Float32Array>} */ { data }) => {
    const chances = await detect(data.slice())
    for (const [i, chance] of chances.entries()) {
      heard.push(data.subarray(i * FRAME, (i + 1) * FRAME))
      const change = turn(chance, live.value === 'speaking')
      if (change === 'start') {
        speaking = true
        // Speaking over Jean: stop reading aloud, and stop the answer if it is still coming.
        quiet()
      } else if (change === 'end' && session) {
        speaking = false
        const audio = new Float32Array(heard.length * FRAME)
        heard.forEach((frame, n) => audio.set(frame, n * FRAME))
        heard = []
        said(audio)
      }
      if (!speaking) heard = heard.slice(-PREROLL)
    }
  }
}

function quiet() {
  globalThis.speechSynthesis?.cancel()
  if (answering) muted.add(answering)
  answering = null
  if (app.busy.peek()) stop()
  live.value = 'listening'
}

/** @param {Float32Array} audio */
async function said(audio) {
  live.value = 'thinking'
  const text = (await transcribe(audio).catch(() => '')).trim()
  if (!session) return
  if (!text) return void (live.value = 'listening')
  await send(text)
}

// ─── Reading the answer aloud ───────────────────────────────────────────────

/** @type {import('../../core/events.js').Turn | null} the answer being read */
let answering = null
/** How far into it reading has gone, in characters of its plain text. */
let read = 0
/** Answers the user spoke over: never read again. */
const muted = new WeakSet()

effect(() => {
  const current = app.live.value
  if (live.peek() === 'off') return
  if (current && current.turn !== answering && !muted.has(current.turn)) [answering, read] = [current.turn, 0]
  if (!answering) return
  const text = plainText(splitSuggestions(answering.steps.map((step) => step.text).filter(Boolean).join('\n\n')).text)
  const { ready, next } = speakable(text, read, locale.peek(), !current)
  read = next
  for (const sentence of ready) say(sentence)
  if (current) return
  answering = null
  // Nothing (more) to read: listen again.
  if (!speechSynthesis.speaking && !speechSynthesis.pending) live.value = 'listening'
})

/** @param {string} sentence */
function say(sentence) {
  const utterance = new SpeechSynthesisUtterance(sentence)
  const voices = voicesFor(locale.peek())
  utterance.lang = locale.peek()
  utterance.voice = voices.find((voice) => voice.name === effective.value.settings.voice) ?? voices.find((voice) => voice.default) ?? voices[0] ?? null
  utterance.onend = () => {
    if (live.peek() === 'speaking' && !speechSynthesis.pending && !app.busy.peek()) live.value = 'listening'
  }
  live.value = 'speaking'
  speechSynthesis.speak(utterance)
}

// The little light leans toward the user while it listens.
effect(() => {
  if (live.value === 'listening' && !app.busy.peek()) setPresence('listening')
})

class Live extends Element {
  render() {
    const state = live.value
    const on = state !== 'off'
    return html`<button type="button" class="icon-button ${on ? 'is-active is-listening' : ''}" aria-pressed=${on ? 'true' : 'false'}
      aria-label=${t(on ? 'live.stop' : 'live.start')} title=${t(on ? 'live.stop' : 'live.start')} @click=${toggle}>${icons.wave}</button>
      ${on ? html`<span class="live-state" role="status">${t(LABELS[state])}</span>` : nothing}`
  }
}

define('app-live', Live)
register({ id: 'live' })
