// The natural voice (D455): answers read aloud by Kyutai's Pocket TTS on this device, on one WebAssembly
// thread, in the languages Kyutai documents (NATURAL, ui/voices.js); the system's voices read the others,
// and any whose voice isn't here. About 108 MB for the first language, downloaded once with consent, and
// 97 MB for each other, offered the first time an answer in it is read. The audio plays as the worker makes
// it; read-aloud's button stops it as it stops the system's voices. Kyutai's weights and Alba MacKenna's
// voice are under CC BY 4.0, credited in Settings.
import { signal, effect } from '@preact/signals-core'
import { nothing } from 'lit-html'
import { register } from '../../ui/caps.js'
import { effective, notify, weightsHost } from '../../ui/state.js'
import { modelWorker, downloading } from '../../ui/model.js'
import { unpinned } from '../../ui/weights.js'
import { speaking } from '../../ui/speech.js'
import { natural, NATURAL } from '../../ui/voices.js'
import { t, useStrings, locale, intlLocales, formatBytes } from '../../core/i18n.js'

/** @import { Download } from '../brain-local/brain-local.js' */

/** @type {[string, string, number]} the manifest on the weights host, its SHA-256 and bytes: it pins the rest */
const MANIFEST = ['jean-is/pocket-tts-q8-ONNX/resolve/b94b57dd6e20af2a8d79779fef5a8e60dbe9fc51/pocket-tts.json', '7d08c86ba5cc8427d95659ead36704a977695b4a98a41270f677e675a2710e2e', 33759]
/** What the first language downloads, the decoder with it, and each other. */
export const [FIRST, EACH] = [107.6e6, 97e6]

export const download = signal(/** @type {Download} */ ({ state: 'idle' }))
/** The languages whose voice is here, and the one downloading. */
export const here = signal(/** @type {Set<string>} */ (new Set()))
export const getting = signal('')
const worker = modelWorker(new URL('./reader-worker.js', import.meta.url), 'The natural voice stopped')
const fileOf = (/** @type {string} */ lang) => new URL(`${lang}.bin`, new URL(MANIFEST[0], weightsHost())).href
export const on = () => /** @type {any} */ (effective.value.settings).naturalVoice !== false
export const named = (/** @type {string} */ lang) => new Intl.DisplayNames(intlLocales(), { type: 'language' }).of(lang) ?? lang

/**
 * Which languages' voices are in the cache. Those kept at an older pin are brought to this one while it is on,
 * one after the other: what didn't change is filed anew, the rest downloaded again, the old copies gone.
 */
async function look() {
  const kept = (await (await caches.open('transformers-cache')).keys()).map((request) => request.url)
  here.value = new Set([...here.peek(), ...NATURAL.filter((lang) => kept.includes(fileOf(lang)))])
  if (here.value.size) ready()
  for (const lang of NATURAL) if (on() && !here.peek().has(lang) && kept.some((url) => unpinned(url) === unpinned(fileOf(lang)))) await prepare(lang).catch(() => {})
}

function ready() {
  download.value = { state: 'ready' }
  natural.read = read
  natural.live = { can, say: (text, lang, context) => queue(LIVE, text, lang, context), hush: () => playing?.id === LIVE && stop() }
  register({ id: 'reader', ready: true, slots })
}

/**
 * Downloads a language's voice, the one answers were read in when it was offered, else the interface's,
 * else English. @param {string} [lang]
 */
export async function prepare(lang = natural.wanted ?? (NATURAL.includes(locale.value) ? locale.value : 'en')) {
  const total = here.value.size ? EACH : FIRST
  download.value = { state: 'downloading', loaded: 0, total }
  getting.value = lang
  navigator.storage?.persist?.().catch(() => {})
  await worker.call({ type: 'load', host: weightsHost(), manifest: MANIFEST, lang }, { onMessage: (message) => { download.value = downloading(message, total) } }).catch((error) => {
    download.value = { state: 'failed', message: error instanceof Error ? error.message : String(error) }
    throw error
  }).finally(() => { getting.value = '' })
  here.value = new Set([...here.value, lang])
  ready()
}

/** Languages offered this visit, once each. */
const offered = new Set()
/** Offers a language's voice while this voice is on, by a notice. False: the system's voices read on. @param {string} lang */
function offer(lang) {
  if (!on() || offered.has(lang) || download.peek().state === 'downloading') return false
  offered.add(lang)
  notify(t('reader.more', { language: named(lang) }), { label: t('cap.reader.yes', { size: formatBytes(EACH) }), run: () => { prepare(lang).catch(() => notify(t('cap.reader.failed'))) } })
  return false
}

/** What Live conversation's sentences are read as (caps/live), one after the other as its answer streams. */
const LIVE = 'live'
/**
 * What this voice is reading: an answer read aloud, as its turn's id, or Live's sentences; the context it
 * plays in, which it closes when it made it, where the next piece goes, and its requests to the worker.
 * @type {{ id: string, context: AudioContext, made: boolean, at: number, sources: AudioBufferSourceNode[], requests: Set<number> } | null}
 */
let playing = null
const can = (/** @type {string} */ lang) => /** @type {any} */ (effective.peek().settings).naturalVoice !== false && here.peek().has(lang)

/**
 * Reads plain text after what `playing` holds, which starts afresh when it is another's: a promise of when it
 * has been heard. In `given`, Live's context that its microphone keeps running, else one made and resumed
 * here, within the click that asked, as Safari wants. @param {string} id @param {string} text @param {string} lang @param {AudioContext} [given]
 */
function queue(id, text, lang, given) {
  if (playing?.id !== id) stop()
  const reading = (playing ??= { id, context: given ?? new AudioContext(), made: !given, at: 0, sources: [], requests: new Set() })
  const { context } = reading
  context.resume()
  const play = (/** @type {Float32Array<ArrayBuffer>} */ audio, /** @type {number} */ rate) => {
    const buffer = context.createBuffer(1, audio.length, rate)
    buffer.copyToChannel(audio, 0)
    const source = new AudioBufferSourceNode(context, { buffer })
    source.connect(context.destination)
    // Back to back, a tenth of a second ahead the first time, or after the worker fell behind.
    reading.at = Math.max(reading.at, context.currentTime + 0.1)
    source.start(reading.at)
    reading.at += buffer.duration
    reading.sources.push(source)
  }
  const request = worker.id()
  reading.requests.add(request)
  return worker.call({ type: 'speak', host: weightsHost(), manifest: MANIFEST, text, lang }, { id: request, onMessage: ({ audio, rate }) => { if (playing === reading) play(audio, rate) } })
    .then(() => playing === reading && new Promise((resolve) => setTimeout(resolve, Math.max(0, reading.at - context.currentTime) * 1000)))
    .finally(() => reading.requests.delete(request))
}

/**
 * Reads plain text aloud as `id`, from the click that asked: false when this voice can't (turned off, its
 * language not here, which it then offers), so the system's voices do. @param {string} id @param {string} text @param {string} lang one of NATURAL
 */
export function read(id, text, lang) {
  if (!can(lang)) return offer(lang)
  stop()
  const heard = queue(id, text, lang)
  const reading = playing
  heard.catch((error) => console.warn('Natural voice', error)).finally(() => {
    if (playing !== reading) return
    stop()
    if (speaking.peek() === id) speaking.value = null
  })
  return true
}

function stop() {
  if (!playing) return
  const { context, made, sources, requests } = playing
  playing = null
  for (const request of requests) worker.post({ type: 'abort', of: request })
  for (const source of sources) source.stop()
  if (made) context.close()
}

// Read-aloud's button, pressed again or on another answer, stops this voice as it does the system's.
// `speaking` is read first, even while nothing plays, so the effect follows it from its first run.
effect(() => {
  if (speaking.value !== playing?.id && playing && playing.id !== LIVE) stop()
})

/** Which of its files a cached address is: a language's, '' for one they share, undefined for another's (Your data › Space used). @param {string} url */
export const fileIn = (url) => (unpinned(url).startsWith(unpinned(new URL('.', fileOf('en')).href)) ? NATURAL.find((lang) => unpinned(url) === unpinned(fileOf(lang))) ?? '' : undefined)

/** Takes a language's voice off this device, from Your data › Space used (D525): its file, and with the last, those all share. @param {string} lang */
export async function remove(lang) {
  here.value = new Set([...here.peek()].filter((one) => one !== lang))
  const cache = await caches.open('transformers-cache')
  for (const request of await cache.keys()) if (fileIn(request.url) === lang || (!here.peek().size && fileIn(request.url) !== undefined)) await cache.delete(request)
}

/** Its row in Settings › General and its page there, from ./page.js, loaded the first time General shows (D525). */
const drawn = signal(/** @type {typeof import('./page.js') | null} */ (null))
let paging = /** @type {Promise<void> | null} */ (null)
const lazily = (/** @type {'row' | 'page'} */ part) => () => (paging ??= import('./page.js').then((module) => { drawn.value = module }), drawn.value?.[part]() ?? nothing)
const slots = { general: { id: 'natural', at: 0, group: 'reading', draw: lazily('row'), page: lazily('page') } }

await useStrings('reader')
register({ id: 'reader', slots })
look().catch(() => {})
