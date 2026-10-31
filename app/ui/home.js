// jean.is's page under the first screen (D397), which build:web writes after the app's root (scripts/home.js),
// one per language at its own address. It speaks the app's one language: when that changes, from Settings,
// ⌘⇧L or the page's own menu (which sets it as Settings does), the page shown is that language's, at its
// address, or English's where it has none, read from there and put in place of the other, the place read kept,
// without leaving. Each Try puts its request in the box as the ideas do, the sample spreadsheet's with its file, a
// tune's, a quiz's or a deck's with Jean's skill for it. One tile is the active one (ui/tiles.js). The page rises into
// the first screen as far as the room leaves free under its ideas, which stay where they are without it (D653).
// Shown, the page is at its own address; hidden, a language's address gives way to the site's, as every other one
// is, its language kept, and ?index=1 goes; the Vous menu's Homepage shows it again on a new task.
import { app, effective, newConversation, setLocale, turnPage, updateSettings, LOCALES } from './state.js'
import { homepage } from './shell.js'
import { locale, pickLocale } from '../core/i18n.js'
import { idea, skillFor, focusComposer } from './composer.js'
import { tiles } from './tiles.js'

/** The page whose buttons, menu and tiles work: the one in the document, another language's once read in its place. @type {Element | null} */
let bound = null
let showing = false
let calls = 0
// Its height, which the app's shell reaches over so that the drawer beside it stays put (home.css), in whole pixels, as
// ui/composer.js reads the shell's height without that reach.
const sizes = new ResizeObserver(([entry]) => document.body.style.setProperty('--home', `${Math.ceil(entry.borderBoxSize[0].blockSize)}px`))
/**
 * How far the page rises into the first screen (--home-lift, home.css): where the box is centred, the room its
 * ideas leave under them, less a gap, 13rem at most; elsewhere, none. Measured in the frame after the box's part of
 * the room changes size, which any change above or in it does, so that nothing is read or written while sizes are
 * being told (WebKit would say they looped).
 */
const lift = new ResizeObserver(() => requestAnimationFrame(() => {
  const composer = document.querySelector('app-composer')
  const lowest = Math.max(...[...composer?.children ?? []].filter((child) => child.localName !== 'p').map((child) => child.getBoundingClientRect().bottom))
  const room = document.documentElement.hasAttribute('data-centred') && composer ? composer.getBoundingClientRect().bottom - lowest - 32 : 0
  document.body.style.setProperty('--home-lift', `${Math.round(Math.max(0, Math.min(room, 208)))}px`)
}))

/** The page, made to work. @param {HTMLElement} home */
function bind(home) {
  if (!bound) lift.observe(document.querySelector('app-composer') ?? home)
  bound = home
  home.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-try]') : null
    if (button instanceof HTMLElement) ask(button.dataset.try ?? '')
  })
  home.addEventListener('change', (event) => event.target instanceof HTMLSelectElement && event.target.closest('.home-languages') && setLocale(event.target.value))
  sizes.disconnect()
  sizes.observe(home)
  tiles(home)
}

/**
 * Another language's page, from its address, read as a document, where its scripts never run, or null.
 * @param {string} address @returns {Promise<HTMLElement | null>}
 */
const read = (address) => new Promise((resolve) => {
  const request = new XMLHttpRequest()
  request.open('GET', address)
  request.responseType = 'document'
  request.onload = () => resolve(request.status === 200 ? request.response?.querySelector('body > .home') ?? null : null)
  request.onerror = () => resolve(null)
  request.send()
})

/** jean.is's page again, from the Vous menu's Homepage: on a new task, at the top, as a first visit has it, in place. */
export async function again() {
  await turnPage(newConversation)
  homepage.value = true
  scrollTo({ top: 0, behavior: 'instant' })
  focusComposer()
}

/**
 * A Try's request in a new task's box, emptied first, its words the tile's; back up to the box on a wide window (on a
 * phone it is docked at the foot already).
 * @param {string} key
 */
async function ask(key) {
  if (!/^[a-z]+$/.test(key)) return
  if (matchMedia('(min-width: 48rem)').matches) scrollTo({ top: 0, behavior: 'instant' })
  if (app.current.value?.records.length) await turnPage(newConversation)
  app.attachments.value = []
  app.draft.value = ''
  if (key === 'sample') return idea('sample')
  await skillFor(key)
  app.draft.value = document.querySelector(`.home-tile [data-try="${key}"]`)?.closest('.home-tile')?.querySelector('.home-request')?.textContent || ''
  focusComposer()
}

/** The page's blocks a reader is at: a door, a tile, a question, the foot… */
const BLOCKS = '.home-strip, .home-head, .home-formats, .home-filter, .home-tile, .home-replay, .home-door, .home-questions details, .site-foot'

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
export async function follow(home, shown, lang) {
  const call = ++calls
  home = document.querySelector('body > .home') ?? home
  if (bound !== home) bind(home)
  let menu = home.querySelector('select')
  const there = document.querySelector(`link[rel="alternate"][hreflang="${lang}"]`) ?? document.querySelector('link[rel="alternate"][hreflang="en"]')
  /** @type {any} */
  let kept = null
  if (shown && there instanceof HTMLLinkElement && there.hreflang !== home.lang) {
    kept = showing && reading(home, menu)
    const next = await read(there.href)
    if (call !== calls) return
    if (!next) return location.replace(new URL(there.href).pathname + location.search + location.hash)
    next.hidden = home.hidden
    home.replaceWith(document.adoptNode(next))
    home = next
    bind(home)
    menu = home.querySelector('select')
  }
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
  }
  showing = shown
  const query = new URLSearchParams(location.search)
  // Shown, the page is at its own address, asked for there once the Vous menu's Homepage showed it; hidden, at the site's.
  const own = document.querySelector(`link[rel="alternate"][hreflang="${home.lang}"]`)
  if (shown && own instanceof HTMLLinkElement) {
    if (homepage.peek()) query.set('index', '1')
    return history.replaceState(history.state, '', `${new URL(own.href).pathname}${`${query}` && `?${query}`}${location.hash}`)
  }
  if (shown) return
  query.delete('index')
  const search = `${query}` && `?${query}`
  const asked = document.querySelector('meta[name="app-language"]')?.getAttribute('content')
  if (asked && !location.pathname.endsWith('/') && !effective.value.settings.locale && locale.value === asked && pickLocale(LOCALES, navigator.languages) !== asked) updateSettings({ locale: asked }).catch(console.warn)
  if (location.pathname.endsWith('/')) return search === location.search || history.replaceState(history.state, '', location.pathname + search + location.hash)
  history.replaceState(history.state, '', `./${search}${location.hash}`)
}
