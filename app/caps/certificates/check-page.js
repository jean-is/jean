// The check page (check.html, D274): a certificate of an answer, its proof and the files it may name,
// and any picture's or film's Content Credentials (D324), dropped or chosen, checked here and kept
// nowhere. Its policy lets it reach Jean's own files only, so nothing it is given, and no address in
// it, goes out. In the visitor's language.
import { html, render, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { setLoader, useLocale, useStrings, pickLocale, locale, dir, t } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { checkGiven, card, credentialsGiven, credentialsCard } from './card.js'

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

/** What was checked last, undefined until something is given; and the pictures' and films' Content Credentials (D324). */
const checked = signal(/** @type {Checked | null | undefined} */ (undefined))
const credentials = signal(/** @type {Credentials[]} */ ([]))
/** @param {Iterable<File>} files */
const take = async (files) => {
  const given = await Promise.all([...files].map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })))
  ;[checked.value, credentials.value] = await Promise.all([checkGiven(given), credentialsGiven(given)])
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
  </main>`, document.body)
})
