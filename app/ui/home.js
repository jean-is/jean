// jean.is's page under the first screen (D397), which build:web writes after the app's root (scripts/home.js),
// one per language at its own address. It speaks the app's one language: when that changes, from Settings,
// ⌘⇧L or the page's own menu (which sets it as Settings does), the page shown is that language's, at its
// address, or English's where it has none. Each Try puts its request in the box as the ideas do, the sample
// spreadsheet's with its file. Shown, the page is at its own address, the place read kept over a change of
// language; hidden, a language's address gives way to the site's, as every other one is, its language kept.
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

/** The page's blocks a reader is at: a door, a tile, a question, the foot… */
const BLOCKS = '.home-strip, .home-head, .home-formats, .home-filter, .home-tile, .home-replay, .home-door, .home-questions details, .home-foot'

/**
 * Where the reader is: the page's menu when it changed the language, else the block a third of the way down the
 * window or the nearest above it, by its place among the page's elements, which every language's page has
 * alike, and how far down the window it is; above the page, the window's own place.
 * @param {HTMLElement} home @param {Element | null} menu
 */
function reading(home, menu) {
  const line = innerHeight / 3
  const held = menu && document.activeElement === menu
  const [at] = held ? [{ block: menu, box: menu.getBoundingClientRect() }] : [...home.querySelectorAll(BLOCKS)].map((block) => ({ block, box: block.getBoundingClientRect() }))
    .filter(({ box }) => box.height && box.top <= line).sort((a, b) => Number(a.box.bottom <= line) - Number(b.box.bottom <= line) || b.box.top - a.box.top)
  const place = at ? { index: [...home.querySelectorAll('*')].indexOf(at.block), top: at.box.top } : { y: scrollY }
  return { ...place, menu: held }
}

/** Back where the reader was, in the language now on the page (reading()). @param {HTMLElement} home @param {any} kept */
function goBack(home, kept) {
  const element = home.querySelectorAll('*')[kept.index]
  if (element) scrollBy({ top: element.getBoundingClientRect().top - kept.top, behavior: 'instant' })
  else scrollTo({ top: kept.y ?? 0, behavior: 'instant' })
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
    if (showing) sessionStorage.setItem('app.reading', JSON.stringify(reading(home, menu)))
    return location.replace(new URL(there.href).pathname + location.search + location.hash)
  }
  const kept = shown && JSON.parse(sessionStorage.getItem('app.reading') ?? 'null')
  for (const key of ['app.about', 'app.reading']) sessionStorage.removeItem(key)
  if (menu) Object.assign(menu, { value: lang, disabled: effective.value.locked.has('locale') })
  home.hidden = !shown
  // Over a change of language, the same place, held while the page settles: the fonts set the lines, and a style
  // sheet landing late (tips.css) has WebKit pull the window up. Until the reader moves, for a moment at most.
  if (kept) {
    const hold = () => goBack(home, kept)
    const stop = () => removeEventListener('scroll', hold)
    hold()
    addEventListener('scroll', hold, { passive: true })
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown', 'focusin']) addEventListener(type, stop, { once: true, passive: true })
    setTimeout(stop, 1500)
    document.fonts.ready.then(hold)
    if (kept.menu) menu?.focus({ preventScroll: true })
  } else if (shown && !showing && app.about.peek()) home.scrollIntoView()
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
