// The check page (check.html, D274): a certificate of an answer, its proof and the files it may name,
// and any picture's or film's Content Credentials (D324), dropped or chosen, checked here and kept
// nowhere. Its policy lets it reach Jean's own files only, so nothing it is given, and no address in
// it, goes out. A picture's invisible watermark is read too where Jean has downloaded TrustMark's
// decoder on this device, from the browser's cache, never from the network; and so is the watermark of
// the brain on a device in words pasted or dropped, with Gemma's tokenizer (D402). In the visitor's language.
import { html, render, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { setLoader, useLocale, useStrings, pickLocale, locale, dir, t } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { checkGiven, card, credentialsGiven, credentialsCard, watermarksOf, wordsCard, PICTURE } from './card.js'
import { DECODER } from '../pictures/watermark.js'
import { BRAIN } from '../brain-local/watermark.js'
import { scriptURL } from '../../ui/trusted.js'

/** @import { Checked, Credentials } from './card.js' */

const root = document.documentElement
root.dataset.theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
setLoader(async (lang, part) => {
  const response = await fetch(`locales/${part && `${part}/`}${lang}.json`)
  return response.ok ? response.json() : null
})
const { locales = [] } = await fetch('capabilities.json').then((response) => response.json(), () => ({}))
await useLocale(pickLocale(locales.flatMap((/** @type {string} */ path) => /^locales\/([\w-]+)\.json$/.exec(path)?.[1] ?? []), navigator.languages))
await useStrings('certificates')

/** What was checked last, undefined until something is given; the pictures' and films' Content Credentials (D324); and whether a picture's watermark couldn't be looked for. */
const checked = signal(/** @type {Checked | null | undefined} */ (undefined))
const credentials = signal(/** @type {Credentials[]} */ ([]))
const unread = signal(false)
/** Words' count (D402): null until words are given, 'unread' where Gemma's tokenizer isn't kept here. */
const words = signal(/** @type {{ counted: number, z: number } | 'unread' | null} */ (null))
const TOKENIZER = `${BRAIN}/resolve/main/tokenizer.json`
const TEXT = /\.(txt|md)$/i

/** Where a file Jean keeps on this device came from: the weights host of its address in the cache, which Transformers.js and download() read before any network. @param {string} path */
async function hostOf(path) {
  const keys = await (await caches.open('transformers-cache')).keys().catch(() => [])
  return keys.map(({ url }) => url).find((url) => url.endsWith(path))?.slice(0, -path.length) ?? null
}

/** SD-Turbo's worker, where the decoder runs, kept for the page's life: WebKit ends the page when a worker holding WebGPU is ended. @type {Worker | undefined} */
let worker
/** What TrustMark's decoder reads in a picture, its file from the cache at that host. @param {string} host @param {Uint8Array} bytes @returns {Promise<number[]>} */
function read(host, bytes) {
  const reading = (worker ??= new Worker(scriptURL(new URL('../pictures/device-worker.js', import.meta.url)), { type: 'module' }))
  return new Promise((resolve, reject) => {
    reading.onmessage = ({ data }) => (data.type === 'done' ? resolve(data.bits) : data.type === 'error' ? reject(new Error(data.message)) : null)
    reading.postMessage({ id: 1, type: 'detect', host, bytes })
  })
}

/** The brain's worker, for its tokenizer alone, from the cache at that host. @type {Worker | undefined} */
let counter
/** Words' count, or 'unread'. @param {string} text @returns {Promise<{ counted: number, z: number } | 'unread'>} */
async function count(text) {
  const host = await hostOf(TOKENIZER)
  if (!host) return 'unread'
  const counting = (counter ??= new Worker(scriptURL(new URL('../brain-local/brain-worker.js', import.meta.url)), { type: 'module' }))
  return new Promise((resolve) => {
    counting.onmessage = ({ data }) => (data.type === 'done' ? resolve({ counted: data.counted, z: data.z }) : data.type === 'error' ? resolve('unread') : null)
    counting.postMessage({ id: 1, type: 'lean', host, model: BRAIN, text })
  })
}

/** @param {Iterable<File>} files */
const take = async (files) => {
  const given = await Promise.all([...files].map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })))
  const text = given.filter(({ name }) => TEXT.test(name)).map(({ bytes }) => new TextDecoder().decode(bytes)).join('\n\n')
  const [found, list, host] = await Promise.all([checkGiven(given), credentialsGiven(given), given.some(({ name }) => PICTURE.test(name)) ? hostOf(DECODER[0]) : null])
  if (host) await watermarksOf(given, list, (bytes) => read(host, bytes)).catch(() => {})
  ;[checked.value, credentials.value, unread.value] = [text && !found && !list.length ? undefined : found, list, !host && given.some(({ name }) => PICTURE.test(name))]
  if (text) words.value = await count(text)
}

let pause = 0
/** Words pasted, counted once the typing stops. @param {Event} event */
const pasted = (event) => {
  clearTimeout(pause)
  const text = /** @type {HTMLTextAreaElement} */ (event.target).value.trim()
  pause = setTimeout(async () => { words.value = text ? await count(text) : null }, 500)
}

effect(() => {
  root.lang = locale.value
  root.dir = dir(locale.value)
  document.title = `${t('certificates.title')} · ${BRAND.name}`
  render(html`<main class="certificates-page" @dragover=${(/** @type {DragEvent} */ event) => event.preventDefault()}
      @drop=${(/** @type {DragEvent} */ event) => { event.preventDefault(); take(event.dataTransfer?.files ?? []) }}>
    <h1>${t('certificates.title')}</h1>
    <p class="receipt-note">${t('certificates.text')}</p>
    <label class="button">${t('certificates.choose')}<input type="file" multiple class="visually-hidden"
      @change=${(/** @type {Event} */ event) => take(/** @type {HTMLInputElement} */ (event.target).files ?? [])}></label>
    ${checked.value === undefined || (!checked.value && credentials.value.length) ? nothing : card(checked.value)}
    ${credentials.value.map(credentialsCard)}
    ${unread.value ? html`<p class="receipt-note">${t('certificates.watermark.unread', { name: BRAND.name })}</p>` : nothing}
    <label class="certificates-words">${t('certificates.words')}<textarea dir="auto" rows="4" @input=${pasted}></textarea></label>
    ${words.value === 'unread' ? html`<p class="receipt-note">${t('certificates.words.unread', { name: BRAND.name })}</p>` : words.value ? wordsCard(words.value) : nothing}
  </main>`, document.body)
})
