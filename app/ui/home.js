// jean.is's page under the first screen (D397), which build:web writes after the app's root (scripts/home.js):
// each Try puts its request in the box as the ideas do, the sample spreadsheet's with its file. Once the
// page is gone, a language's own address gives way to the site's, as every other one is, its language kept.
import { app, effective, updateSettings, LOCALES } from './state.js'
import { locale, pickLocale } from '../core/i18n.js'
import { idea, focusComposer } from './composer.js'

let trying = false

/** A Try: back up to the box on a wide window (on a phone it is docked at the foot already), its request in it. @param {Event} event */
function tryIt(event) {
  const button = event.target instanceof Element ? event.target.closest('[data-try]') : null
  if (!(button instanceof HTMLElement)) return
  if (matchMedia('(min-width: 48rem)').matches) scrollTo({ top: 0, behavior: 'instant' })
  if (button.dataset.try === 'sample') return idea('sample')
  app.draft.value = button.closest('.home-tile')?.querySelector('.home-request')?.textContent ?? ''
  focusComposer()
}

/** @param {Element} home  the page @param {boolean} shown  whether it stays (ui/shell.js) */
export function follow(home, shown) {
  if (shown && !trying) home.addEventListener('click', tryIt)
  trying ||= shown
  const asked = document.querySelector('meta[name="app-language"]')?.getAttribute('content')
  if (shown || !asked) return
  if (!effective.value.settings.locale && locale.value === asked && pickLocale(LOCALES, navigator.languages) !== asked) updateSettings({ locale: asked }).catch(console.warn)
  history.replaceState(history.state, '', `./${location.search}${location.hash}`)
}
