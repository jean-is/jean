// Dictation is always available (D26). This module only knows whether it can work here;
// the engine loads with the voice capability on the first press.
import { signal } from '@preact/signals-core'
import { unlock } from './caps.js'

/**
 * @typedef {{ state: 'idle' | 'preparing' | 'listening' | 'transcribing' | 'unavailable', progress?: number }} Dictation
 */

const speech = /** @type {any} */ (globalThis).SpeechRecognition ?? /** @type {any} */ (globalThis).webkitSpeechRecognition
// On-device recognition needs SpeechRecognition.available(); otherwise a small Whisper runs in a worker.
const possible = typeof speech?.available === 'function' || (typeof WebAssembly === 'object' && Boolean(navigator.mediaDevices?.getUserMedia))

export const dictation = signal(/** @type {Dictation} */ ({ state: possible ? 'idle' : 'unavailable' }))

/** @typedef {'off' | 'preparing' | 'listening' | 'thinking' | 'speaking'} Live */
// Live conversation's state (caps/live/live.js), here so the box shows it in its own button and words.
export const live = signal(/** @type {Live} */ ('off'))

export async function toggleDictation() {
  if (dictation.value.state === 'unavailable' || !(await unlock('voice'))) return
  const voice = await import('../caps/voice/voice.js')
  await voice.toggle()
}
