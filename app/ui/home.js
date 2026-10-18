// jean.is's page under the first screen (D397), which build:web writes after the app's root (scripts/home.js),
// one per language at its own address. It speaks the app's one language: when that changes, from Settings,
// ⌘⇧L or the page's own menu (which sets it as Settings does), the page shown is that language's, at its
// address, or English's where it has none. Each Try puts its request in the box as the ideas do, the sample
// spreadsheet's with its file; one tile is the active one, the one pointed at, tapped or reached by the keyboard,
// and the filter's mark slides to the choice. Shown, the page is at its own address, the place read kept over a
// change of language; hidden, a language's address gives way to the site's, as every other one is, its language kept.
import { app, effective, setLocale, updateSettings, LOCALES } from './state.js'
import { locale, pickLocale } from '../core/i18n.js'
import { idea, focusComposer } from './composer.js'

let started = false
let showing = false

/** A Try: back up to the box on a wide window (on a phone it is docked at the foot already), emptied, its request in it. @param {Event} event */
function tryIt(event) {
  const button = event.target instanceof Element ? event.target.closest('[data-try]') : null
  if (!(button instanceof HTMLElement)) return
  if (matchMedia('(min-width: 48rem)').matches) scrollTo({ top: 0, behavior: 'instant' })
  app.attachments.value = []
  app.draft.value = ''
  if (button.dataset.try === 'sample') return idea('sample')
  app.draft.value = button.closest('.home-tile')?.querySelector('.home-request')?.textContent ?? ''
  focusComposer()
}

/** The active tile, which assistive technologies hear as the current one, its Try the primary one; one at all times, a visible one. @param {Element} home @param {Element | null | undefined} tile */
function activate(home, tile) {
  const tiles = [...home.querySelectorAll('.home-tile')]
  const active = tile && tile.checkVisibility() ? tile : tiles.find((one) => one.matches('.is-active') && one.checkVisibility()) ?? tiles.find((one) => one.checkVisibility())
  for (const one of tiles) {
    one.classList.toggle('is-active', one === active)
    one.querySelector('[data-try]')?.classList.toggle('primary', one === active)
    if (one === active) one.setAttribute('aria-current', 'true')
    else one.removeAttribute('aria-current')
  }
}

/** The filter's mark under its choice, from the inline start in either direction. @param {HTMLElement} filter */
function slide(filter) {
  const label = filter.querySelector('input:checked + label')
  if (!(label instanceof HTMLElement) || !label.offsetWidth) return
  const at = getComputedStyle(filter).direction === 'rtl' ? filter.clientWidth - label.offsetLeft - label.offsetWidth : label.offsetLeft
  filter.style.setProperty('--at', `${at}px`)
  filter.style.setProperty('--size', `${label.offsetWidth}px`)
  filter.classList.add('is-sliding')
}

/** The tiles' row turned a view at a time by its buttons, each hidden where the row ends, whichever way the page reads. @param {Element} home */
function turning(home) {
  const row = home.querySelector('.home-tiles')
  const [back, next] = home.querySelectorAll('.home-turn')
  if (!(row instanceof HTMLElement) || !(back instanceof HTMLButtonElement) || !(next instanceof HTMLButtonElement)) return () => {}
  const ends = () => {
    const at = Math.abs(row.scrollLeft)
    back.disabled = at < 4
    next.disabled = at + row.clientWidth >= row.scrollWidth - 4
  }
  const way = () => (getComputedStyle(row).direction === 'rtl' ? -1 : 1)
  back.addEventListener('click', () => row.scrollBy({ left: -way() * row.clientWidth }))
  next.addEventListener('click', () => row.scrollBy({ left: way() * row.clientWidth }))
  row.addEventListener('scroll', ends, { passive: true })
  new ResizeObserver(ends).observe(row)
  row.parentElement?.classList.add('is-turning')
  return () => { row.scrollTo({ left: 0 }); ends() }
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
    for (const type of ['pointerover', 'focusin']) home.addEventListener(type, (event) => event.target instanceof Element && event.target.closest('.home-tile') && activate(home, event.target.closest('.home-tile')))
    const filter = home.querySelector('.home-filter')
    const back = turning(home)
    if (filter instanceof HTMLElement) {
      new ResizeObserver(() => slide(filter)).observe(filter)
      filter.addEventListener('change', () => { slide(filter); activate(home, null); back() })
    }
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
