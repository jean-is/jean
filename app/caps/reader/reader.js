// The natural voice (D455): answers read aloud by Kyutai's Pocket TTS on this device, on one WebAssembly
// thread, in the languages Kyutai documents (NATURAL, ui/voices.js); the system's voices read the others,
// and any whose voice isn't here. About 108 MB for the first language, downloaded once with consent, and
// 97 MB for each other, offered the first time an answer in it is read. The audio plays as the worker makes
// it; read-aloud's button stops it as it stops the system's voices. Kyutai's weights and Alba MacKenna's
// voice are under CC BY 4.0, credited in Settings.
import { signal, effect } from '@preact/signals-core'
import { html } from 'lit-html'
import { register } from '../../ui/caps.js'
import { effective, notify, updateSettings, weightsHost } from '../../ui/state.js'
import { modelWorker, downloading } from '../../ui/model.js'
import { speaking } from '../../ui/speech.js'
import { natural, NATURAL } from '../../ui/voices.js'
import { t, useStrings, locale, formatBytes } from '../../core/i18n.js'

/** @import { Download } from '../brain-local/brain-local.js' */

/** @type {[string, string, number]} the manifest on the weights host, its SHA-256 and bytes: it pins the rest */
const MANIFEST = ['jean-is/pocket-tts-q8-ONNX/resolve/78b34b0a51ec6e987628d93a95a0602d12f7d7a9/pocket-tts.json', '1758cb631691edffeff857f04ccbb252c174deaebcc0798fec603ca7bbe085b3', 33759]
/** What the first language downloads, the decoder with it, and each other. */
const [FIRST, EACH] = [107.6e6, 97e6]

export const download = signal(/** @type {Download} */ ({ state: 'idle' }))
/** The languages whose voice is here. */
const here = signal(/** @type {Set<string>} */ (new Set()))
const worker = modelWorker(new URL('./reader-worker.js', import.meta.url), 'The natural voice stopped')
const fileOf = (/** @type {string} */ lang) => new URL(`${lang}.bin`, new URL(MANIFEST[0], weightsHost())).href
const on = () => /** @type {any} */ (effective.value.settings).naturalVoice !== false
const named = (/** @type {string} */ lang) => new Intl.DisplayNames([locale.value], { type: 'language' }).of(lang) ?? lang

/** Which languages' voices are in the cache. */
async function look() {
  const cache = await caches.open('transformers-cache')
  const found = await Promise.all(NATURAL.map(async (lang) => Boolean(await cache.match(fileOf(lang)))))
  here.value = new Set(NATURAL.filter((_, i) => found[i]))
  if (here.value.size) ready()
}

function ready() {
  download.value = { state: 'ready' }
  natural.read = read
  register({ id: 'reader', ready: true, slots })
}

/**
 * Downloads a language's voice, the one answers were read in when it was offered, else the interface's,
 * else English. @param {string} [lang]
 */
export async function prepare(lang = natural.wanted ?? (NATURAL.includes(locale.value) ? locale.value : 'en')) {
  const total = here.value.size ? EACH : FIRST
  download.value = { state: 'downloading', loaded: 0, total }
  navigator.storage?.persist?.().catch(() => {})
  try {
    await worker.call({ type: 'load', host: weightsHost(), manifest: MANIFEST, lang }, { onMessage: (message) => { download.value = downloading(message, total) } })
    here.value = new Set([...here.value, lang])
    ready()
  } catch (error) {
    download.value = { state: 'failed', message: error instanceof Error ? error.message : String(error) }
    throw error
  }
}

/** Languages offered this visit, once each. */
const offered = new Set()
/** @param {string} lang */
function offer(lang) {
  if (offered.has(lang) || download.peek().state === 'downloading') return
  offered.add(lang)
  notify(t('reader.more', { language: named(lang) }), { label: t('cap.reader.yes', { size: formatBytes(EACH) }), run: () => { prepare(lang).catch(() => notify(t('cap.reader.failed'))) } })
}

/** @type {{ id: string, context: AudioContext, sources: AudioBufferSourceNode[], request: number } | null} */
let playing = null

/**
 * Reads plain text aloud as `id`, from the click that asked: false when this voice can't (turned off, its
 * language not here, which it then offers), so the system's voices do. @param {string} id @param {string} text @param {string} lang one of NATURAL
 */
export function read(id, text, lang) {
  if (!on()) return false
  if (!here.peek().has(lang)) {
    offer(lang)
    return false
  }
  stop()
  // Made and resumed within the click, as Safari wants.
  const context = new AudioContext()
  context.resume()
  const request = worker.id()
  const reading = { id, context, sources: /** @type {AudioBufferSourceNode[]} */ ([]), request }
  playing = reading
  let at = 0
  const play = (/** @type {Float32Array<ArrayBuffer>} */ audio, /** @type {number} */ rate) => {
    const buffer = context.createBuffer(1, audio.length, rate)
    buffer.copyToChannel(audio, 0)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    // Back to back, a tenth of a second ahead the first time, or after the worker fell behind.
    at = Math.max(at, context.currentTime + 0.1)
    source.start(at)
    at += buffer.duration
    reading.sources.push(source)
  }
  worker.call({ type: 'speak', host: weightsHost(), manifest: MANIFEST, text, lang }, { id: request, onMessage: ({ audio, rate }) => { if (playing === reading) play(audio, rate) } })
    .then(() => new Promise((resolve) => setTimeout(resolve, Math.max(0, at - context.currentTime) * 1000)))
    .catch((error) => console.warn('Natural voice', error))
    .finally(() => {
      if (playing !== reading) return
      stop()
      if (speaking.peek() === id) speaking.value = null
    })
  return true
}

function stop() {
  if (!playing) return
  const { context, sources, request } = playing
  playing = null
  worker.post({ type: 'abort', of: request })
  for (const source of sources) source.stop()
  context.close()
}

// Read-aloud's button, pressed again or on another answer, stops this voice as it does the system's.
// `speaking` is read first, even while nothing plays, so the effect follows it from its first run.
effect(() => {
  if (speaking.value !== playing?.id && playing) stop()
})

/** Its switch among Settings' General ones, with its languages and whose voice it is. @param {{ setting: typeof import('../../ui/dialogs.js').setting }} props */
const draw = ({ setting }) => setting(t('cap.reader.name'), `${t('reader.text', { languages: new Intl.ListFormat(locale.value).format(NATURAL.map(named)) })} ${t('reader.credit')}`,
  html`<input type="checkbox" class="switch" role="switch" aria-label=${t('cap.reader.name')} .checked=${on()}
    @change=${(/** @type {Event} */ e) => updateSettings(/** @type {any} */ ({ naturalVoice: /** @type {HTMLInputElement} */ (e.target).checked }))}>`)
const slots = { general: { at: 5, draw } }

await useStrings('reader')
register({ id: 'reader', slots })
look().catch(() => {})
