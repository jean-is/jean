// The check page (check.html, D274): a certificate of an answer, its proof and the files it may name,
// any picture's or film's Content Credentials (D324), and what a file Jean made says of how it was made
// (D407), dropped or chosen, checked here and kept nowhere: nothing given goes out, nor any address in it.
// A picture's invisible watermark is read too, and the watermark of the brain on a device in words pasted
// or dropped, a Word document's included (D402), each with its reader, TrustMark's decoder or Gemma's
// tokenizer: from the browser's cache where Jean keeps it on this device, else downloaded from the weights
// host, the site's policy's or Jean's own, once the visitor agrees (D407). In the visitor's language.
import { html, render, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { setLoader, useLocale, useStrings, pickLocale, locale, dir, t, formatBytes } from '../../core/i18n.js'
import { DEFAULT_URLS } from '../../core/settings.js'
import { BRAND } from '../../brand.js'
import { checkGiven, card, credentialsGiven, credentialsCard, watermarksOf, wordsCard, PICTURE } from './card.js'
import { DECODER } from '../pictures/watermark.js'
import { BRAIN } from '../brain-local/watermark.js'
import { modelWorker } from '../../ui/model.js'

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

/** The weights host (D53): the site's policy's, else Jean's own. */
const policy = document.querySelector('meta[name="app-policy"]')?.getAttribute('content')
const weights = String((policy && (await fetch(policy).then((response) => response.json()).catch(() => null))?.urls?.modelWeights) || DEFAULT_URLS.modelWeights)

/** What was checked last, undefined until something is given; the pictures' and films' Content Credentials (D324), or what files say of themselves (D407). */
const checked = signal(/** @type {Checked | null | undefined} */ (undefined))
const credentials = signal(/** @type {Credentials[]} */ ([]))
/** Words' count (D402), null until words are given. */
const words = signal(/** @type {{ counted: number, z: number } | null} */ (null))
/** Gemma's tokenizer and its size, about the same each revision. */
const TOKENIZER = /** @type {const} */ ([`${BRAIN}/resolve/main/tokenizer.json`, '', 19439251])
const TEXT = /\.(txt|md)$/i

/**
 * A look for a watermark, with its reader's file: what it does with the reader's host, and how far a download has come.
 * @typedef {{ file: readonly [string, string, number], then: (host: string, progress: (message: { loaded: number, total: number }) => void) => Promise<void>, loaded?: number, total?: number, failed?: boolean }} Look
 */
/** The looks that wait for the visitor to agree to download their reader, or for it to come (D407), and the readers agreed to. */
const looks = signal(/** @type {Map<string, Look>} */ (new Map()))
const agreed = new Set()
/** @param {string} reader @param {Look} [look] */
const waits = (reader, look) => { const next = new Map(looks.value); look ? next.set(reader, look) : next.delete(reader); looks.value = next }

/** Where a file Jean keeps on this device came from: the weights host of its address in the cache, which Transformers.js and download() read before any network. @param {string} path */
async function hostOf(path) {
  const keys = await (await caches.open('transformers-cache')).keys().catch(() => [])
  return keys.map(({ url }) => url).find((url) => url.endsWith(path))?.slice(0, -path.length) ?? null
}

/** A look with its reader from the cache, else downloaded from the weights host once agreed to, else waiting. @param {string} reader @param {Look} look */
async function withReader(reader, look) {
  const kept = await hostOf(look.file[0])
  if (!kept && !agreed.has(reader)) return waits(reader, look)
  waits(reader, kept ? undefined : { ...look, loaded: 0, total: look.file[2] })
  await look.then(kept ?? weights, ({ loaded, total }) => waits(reader, { ...look, loaded, total }))
    .then(() => waits(reader), () => { agreed.delete(reader); waits(reader, { ...look, failed: true }) })
}

/** SD-Turbo's worker, where the decoder runs, kept for the page's life (WebKit ends the page when a worker holding WebGPU is ended); the brain's, for its tokenizer alone. */
const turbo = modelWorker(new URL('../pictures/device-worker.js', import.meta.url), '')
const brain = modelWorker(new URL('../brain-local/brain-worker.js', import.meta.url), '')
/** Words, counted (D402). @param {string} text */
const count = (text) => withReader('words', { file: TOKENIZER, then: async (host, onMessage) => { words.value = await brain.call({ type: 'lean', host, model: BRAIN, text }, { onMessage }) } })
/** A file's words, to count: a text's, or a Word document's (D407). @param {{ name: string, bytes: Uint8Array }} file */
const wordsIn = async ({ name, bytes }) => (TEXT.test(name) ? new TextDecoder().decode(bytes)
  : /\.docx$/i.test(name) ? ((await (await import('../files/extract.js')).extractPages(name, bytes).catch(() => null)) ?? []).join('\n') : '')

/** @param {Iterable<File>} files */
const take = async (files) => {
  const given = await Promise.all([...files].map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })))
  const text = (await Promise.all(given.map(wordsIn))).filter(Boolean).join('\n\n')
  const [found, list] = await Promise.all([checkGiven(given), credentialsGiven(given)])
  ;[checked.value, credentials.value] = [text && !found && !list.length ? undefined : found, list]
  if (!given.some(({ name }) => PICTURE.test(name))) waits('watermark')
  else withReader('watermark', { file: DECODER, then: async (host, onMessage) => { credentials.value = [...await watermarksOf(given, list, async (bytes) => (await turbo.call({ type: 'detect', host, bytes }, { onMessage })).bits)] } })
  if (text) count(text)
}

let pause = 0
/** Words pasted, counted once the typing stops. @param {Event} event */
const pasted = (event) => {
  clearTimeout(pause)
  const text = /** @type {HTMLTextAreaElement} */ (event.target).value.trim()
  pause = setTimeout(() => (text ? count(text) : ((words.value = null), waits('words'))), 500)
}

/** What a look waits for: the visitor's yes, which says where its reader comes from, then how far it has come. @param {string} reader */
function waiting(reader) {
  const look = looks.value.get(reader)
  const said = look && t(look.failed ? 'certificates.failed' : `certificates.${reader}.fetch`, { host: new URL(weights).host })
  return !look ? nothing : html`<p class="receipt-note">${said}</p>${look.loaded === undefined
    ? html`<button class="button" @click=${() => { agreed.add(reader); withReader(reader, { file: look.file, then: look.then }) }}>${t('certificates.fetch', { size: formatBytes(look.file[2]) })}</button>`
    : html`<progress aria-label=${String(said)} max=${look.total ?? 0} .value=${look.loaded}></progress>`}`
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
    ${waiting('watermark')}
    <label class="certificates-words">${t('certificates.words')}<textarea dir="auto" rows="4" @input=${pasted}></textarea></label>
    ${waiting('words')}
    ${words.value ? wordsCard(words.value) : nothing}
  </main>`, document.body)
})
