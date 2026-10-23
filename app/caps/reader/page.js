// The natural voice in Settings › General (D525): its row under Reading aloud, the languages here or off, which opens its page,
// settings/general/natural: its switch, its six languages with whose voice reads each, Listen once here, else Download, and
// its credit. A language is removed in Your data › Space used. Loaded the first time General shows.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { notify, updateSettings } from '../../ui/state.js'
import { openSettings } from '../../ui/dialogs.js'
import { speaking } from '../../ui/speech.js'
import { NATURAL, SPEAKERS, listen } from '../../ui/voices.js'
import { icons } from '../../ui/menu-icons.js'
import { t, intlLocales, formatBytes, preferredLocales } from '../../core/i18n.js'
import { here, getting, download, on, named, prepare, FIRST, EACH } from './reader.js'

/** General's list, or this voice's page, the keyboard on its title, or back on its row. */
const go = (/** @type {string} */ to) => { openSettings(to ? `general/${to}` : 'general'); requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '.general-head h2' : '[data-part="natural"]'))?.focus()) }

/** Listen's sentence in each of its languages, from their catalogues' dialogs part, fetched as its page first shows. */
const samples = signal(/** @type {Record<string, string>} */ ({}))
let sampling = /** @type {Promise<unknown> | null} */ (null)
/** The language Listen was last pressed for, which shows Stop while it reads. */
let heard = ''

/** Its row in General's Reading aloud: the languages here, or off, opening its page. */
export const row = () => html`<li><button class="item" data-part="natural" @click=${() => go('natural')}><span class="item-icon">${icons.voice}</span>
  <span class="item-text"><strong>${t('cap.reader.name')}</strong><small>${!on() ? t('reader.off') : here.value.size
    ? t('reader.on', { languages: new Intl.ListFormat(intlLocales()).format([...here.value].map(named)) }) : t('reader.none')}</small></span>
  <span class="data-state">${on() ? html`${icons.check}${t('collection.on')}` : t('collection.off')}</span>${icons.chevron}</button></li>`

/**
 * Its page, settings/general/natural (D525): its switch; its six languages, the user's first, each with whose voice it is
 * and Listen once here, or Download; where one is removed, Your data › Space used; and the credit.
 */
export function page() {
  sampling ??= Promise.all(NATURAL.map((lang) => fetch(new URL(`../../locales/dialogs/${lang}.json`, import.meta.url)).then((response) => response.json())
    .then((strings) => [lang, strings['settings.sample']]))).then((pairs) => { samples.value = Object.fromEntries(pairs) }, () => { sampling = null })
  const yours = preferredLocales(NATURAL, navigator.languages)
  const langs = [...yours, ...NATURAL.filter((lang) => !yours.includes(lang)).sort((a, b) => named(a).localeCompare(named(b), intlLocales()))]
  const playing = (/** @type {string} */ lang) => speaking.value === 'sample' && heard === lang
  const end = (/** @type {string} */ lang) => here.value.has(lang) ? on() && samples.value[lang] ? html`<button type="button" class="icon-button listen" aria-label=${t(playing(lang) ? 'action.stop' : 'settings.listen')}
    @click=${() => { heard = lang; listen(samples.value[lang], lang, null) }}>${playing(lang) ? icons.stop : icons.play}</button>` : nothing
    : getting.value === lang && download.value.state === 'downloading' ? html`<progress value=${download.value.loaded} max=${download.value.total}></progress>`
    : html`<button class="button" ?disabled=${Boolean(getting.value)} @click=${() => prepare(lang).catch(() => notify(t('cap.reader.failed')))}>${icons.download} ${t('cap.reader.yes', { size: formatBytes(here.value.size ? EACH : FIRST) })}</button>`
  return html`<button class="back button subtle" @click=${() => go('')}>${icons.back} ${t('settings.general')}</button>
    <header class="general-head"><div><h2 tabindex="-1">${t('cap.reader.name')}</h2><p class="lede">${t('cap.reader.text', { size: formatBytes(EACH) })}</p></div>
      <input type="checkbox" class="switch" role="switch" aria-label=${t('cap.reader.name')} .checked=${on()}
        @change=${(/** @type {Event} */ e) => updateSettings(/** @type {any} */ ({ naturalVoice: /** @type {HTMLInputElement} */ (e.target).checked }))}></header>
    <ul class="list general">${langs.map((lang) => html`<li><span class="item-text"><strong>${named(lang)}</strong>
      <small><bdi>${SPEAKERS[lang]}</bdi>${here.value.has(lang) ? ` · ${t('reader.here', { size: formatBytes(EACH) })}` : ''}</small></span>${end(lang)}</li>`)}</ul>
    <p class="hint"><button class="link-button" @click=${() => openSettings('data/space')}>${t('reader.room')}</button></p>
    <p class="hint">${t('reader.credit')}</p>`
}
