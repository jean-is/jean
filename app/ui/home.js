// jean.is's page under the first screen (D397), which build:web writes after the app's root (scripts/home.js),
// one per language at its own address. It speaks the app's one language: when that changes, from Settings,
// ⌘⇧L or the page's own menu (which sets it as Settings does), the page shown is that language's, at its
// address, or English's where it has none. Each Try puts its request in the box as the ideas do, the sample
// spreadsheet's with its file. Shown, the page is at its own address; hidden, a language's address gives way
// to the site's, as every other one is, its language kept.
import { app, effective, setLocale, updateSettings, LOCALES } from './state.js'
import { locale, pickLocale } from '../core/i18n.js'
import { idea, focusComposer } from './composer.js'

let started = false
let showing = false

/** A Try: back up to the box on a wide window (on a phone it is docked at the foot already), its request in it. @param {Event} event */
function tryIt(event) {
  const button = event.target instanceof Element ? event.target.closest('[data-try]') : null
  if (!(button instanceof HTMLElement)) return
  if (matchMedia('(min-width: 48rem)').matches) scrollTo({ top: 0, behavior: 'instant' })
  if (button.dataset.try === 'sample') return idea('sample')
  app.draft.value = button.closest('.home-tile')?.querySelector('.home-request')?.textContent ?? ''
  focusComposer()
}

/** @param {HTMLElement} home  the page @param {boolean} shown  whether it shows (ui/shell.js) @param {string} lang  the app's language */
export function follow(home, shown, lang) {
  const menu = home.querySelector('select')
  if (!started) {
    started = true
    home.addEventListener('click', tryIt)
    menu?.addEventListener('change', () => setLocale(menu.value))
  }
  const there = document.querySelector(`link[rel="alternate"][hreflang="${lang}"]`) ?? document.querySelector('link[rel="alternate"][hreflang="en"]')
  if (shown && there instanceof HTMLLinkElement && there.hreflang !== home.lang) {
    sessionStorage.setItem('app.about', String(app.about.peek()))
    return location.replace(new URL(there.href).pathname + location.search + location.hash)
  }
  sessionStorage.removeItem('app.about')
  if (menu) Object.assign(menu, { value: lang, disabled: effective.value.locked.has('locale') })
  home.hidden = !shown
  if (shown && !showing && app.about.peek()) home.scrollIntoView()
  showing = shown
  // Shown, the page is at its own address; hidden, at the site's.
  const own = document.querySelector(`link[rel="alternate"][hreflang="${home.lang}"]`)
  if (shown && own instanceof HTMLLinkElement) history.replaceState(history.state, '', new URL(own.href).pathname + location.search + location.hash)
  if (shown) return
  app.about.value = false
  const asked = document.querySelector('meta[name="app-language"]')?.getAttribute('content')
  if (!asked || location.pathname.endsWith('/')) return
  if (!effective.value.settings.locale && locale.value === asked && pickLocale(LOCALES, navigator.languages) !== asked) updateSettings({ locale: asked }).catch(console.warn)
  history.replaceState(history.state, '', `./${location.search}${location.hash}`)
}
