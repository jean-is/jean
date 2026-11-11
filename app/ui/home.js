// jean.is's page under the first screen (D397), which build:web writes after the app's root (site/home/page.js),
// one per language at its own address. It speaks the app's one language: when that changes, from Settings,
// ⌘⇧L or the page's own menu (which sets it as Settings does), the page shown is that language's, at its
// address, or English's where it has none, read from there and put in place of the other, the place read kept,
// without leaving. Each Try puts its request in the box as the ideas do, the sample spreadsheet's with its file, a
// tune's, a quiz's or a deck's with Jean's skill for it; their row turns a view at a time (ui/tiles.js), and Your turn, at
// the page's end, goes back up to the box. The page rises into the first screen just enough for its first title to
// show whole with the top of its row, never over the box's ideas, which stay where they are without it (D653).
// It is under every task that has no request yet, in a browser's tab, and goes with the request; a new task, which
// starts at its top, has it again, and so the name in the bar leads to it. In Jean installed it shows once the Vous
// menu's Homepage asks for it. Shown, the page is at its own address; hidden, a language's address gives way to the
// site's, as every other one is, its language kept. Shown, it is the
// main content, its <main> the skip link's #main, the app's first screen above it in a <div> (ui/shell.js); where
// something takes that screen's place (Creations), the room is the <main> again and the page goes, and while a
// pane covers it (D635) it is out of the keys' way.
import { app, effective, newConversation, newTasks, setLocale, turnPage, updateSettings, LOCALES } from './state.js'
import { homepage } from './shell.js'
import { dir, locale, pickLocale } from '../core/i18n.js'
import { yoursFirst } from './yours.js'
import { idea, skillFor, focusComposer } from './composer.js'
import { tiles } from './tiles.js'

/** The page whose buttons, menu and tiles work: the one in the document, another language's once read in its place. @type {Element | null} */
let bound = null
let showing = false
let calls = 0
// Its height, which the app's shell reaches over so that the drawer beside it stays put (home.css), in whole pixels, as
// ui/composer.js reads the shell's height without that reach.
const sizes = new ResizeObserver(([entry]) => document.body.style.setProperty('--home', `${Math.ceil(entry.borderBoxSize[0].blockSize)}px`))
/** What holds the place read over a change of language, while it does. @type {(() => void) | null} */
let holding = null
/**
 * How far the page rises into the first screen (--home-lift, home.css): where the box is centred, as far as shows its
 * first act's title whole and the top 40px of what follows it, its row, and never over the room the box's ideas leave
 * under them, less a gap; elsewhere, none. Measured in the frame after the box's part of the room or the page changes
 * size, which any change above or in it does, so that nothing is read or written while sizes are being told (WebKit
 * would say they looped).
 */
const rise = () => requestAnimationFrame(() => {
  const composer = document.querySelector('app-composer'), act = document.querySelector('body > .home .home-act'), title = act?.querySelector('.home-act-title')
  const lowest = Math.max(...[...composer?.children ?? []].filter((child) => child.localName !== 'p' && child.localName !== 'footer').map((child) => child.getBoundingClientRect().bottom))
  const room = document.documentElement.hasAttribute('data-centred') && composer ? composer.getBoundingClientRect().bottom - lowest - 48 : 0
  // From the top of the act, which is the page's, and moves with what is in it as it rises into place (home.css).
  const next = act?.querySelector('.home-row, .home-ways')?.getBoundingClientRect().top ?? 0
  const peek = act && title ? Math.max(title.getBoundingClientRect().bottom, next) - act.getBoundingClientRect().top + 40 : 0
  document.body.style.setProperty('--home-lift', `${Math.round(Math.max(0, Math.min(room, peek)))}px`)
  // Risen anew over a change of language, the page keeps the place read (follow()).
  holding?.()
})
const lift = new ResizeObserver(rise)

/**
 * The page where it goes: shown while it is to be and the room holds the first screen, then the main content; inert under a pane.
 * @param {HTMLElement} home
 */
function place(home) {
  const out = !showing || document.querySelector('app-shell .here > main') !== null, main = home.querySelector(':scope > main')
  Object.assign(home, { hidden: out, inert: document.documentElement.hasAttribute('data-dock') })
  main?.toggleAttribute('hidden', out)
  out ? main?.removeAttribute('id') : main?.setAttribute('id', 'main')
}
const placing = new MutationObserver(() => bound && place(/** @type {HTMLElement} */ (bound)))

/** The page, made to work. @param {HTMLElement} home */
function bind(home) {
  if (!bound) {
    placing.observe(document.querySelector('app-shell .here') ?? home, { childList: true })
    placing.observe(document.documentElement, { attributeFilter: ['data-dock'] })
    // A new task starts at its top, where the box is, however far down the page was read.
    newTasks.subscribe(() => { if (showing) scrollTo({ top: 0, behavior: 'instant' }) })
  }
  bound = home
  const list = home.querySelector('#site-languages > ul')
  if (list) yoursFirst(list, navigator.languages)
  home.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-try], [data-turn]') : null
    if (button instanceof HTMLElement) 'turn' in button.dataset ? yours() : ask(button.dataset.try ?? '')
    // A language is the app's, which this page follows from the same place, the keyboard on the menu's button; a link asked to open elsewhere does.
    const link = event.target instanceof Element ? event.target.closest('[data-language]') : null, menu = link?.closest('[popover]')
    if (!(link instanceof HTMLElement) || !(menu instanceof HTMLElement) || event.metaKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault(); menu.hidePopover(); /** @type {HTMLElement | null} */ (home.querySelector('.site-languages button'))?.focus(); setLocale(link.dataset.language ?? '')
  })
  sizes.disconnect()
  sizes.observe(home)
  lift.disconnect()
  for (const one of [document.querySelector('app-composer'), home]) if (one) lift.observe(one)
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

/** jean.is's page, from the Vous menu's Homepage: on a new task, at the top, in place; in Jean installed, where no task has it by itself, until a request. */
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

/** Your turn, at the page's end: back up to the box on a wide window (on a phone it is docked at the foot already), the keyboard in it. */
function yours() {
  if (matchMedia('(min-width: 48rem)').matches) scrollTo({ top: 0, behavior: 'instant' })
  focusComposer()
}

/** The page's blocks a reader is at: an act's head, a tile, a card, a question, the foot… */
const BLOCKS = '.home-act-head, .home-tile, .home-ways, .home-shelf > *, .home-move, .home-catch, .home-yours, .home-questions details, .site-foot'

/**
 * Where the reader is: the page's menu when it changed the language, else the block a third of the way down the
 * window or the nearest above it, by its place among its act's elements, or the page's, which every language's
 * page has alike, and how far down the window it is; above the page, the window's own place.
 * @param {HTMLElement} home @param {Element | null} menu
 */
function reading(home, menu) {
  const line = innerHeight / 3
  const held = menu !== null && menu.contains(document.activeElement)
  const [at] = held ? [{ block: menu, box: menu.getBoundingClientRect() }] : [...home.querySelectorAll(BLOCKS)].map((block) => ({ block, box: block.getBoundingClientRect() }))
    .filter(({ box }) => box.height && box.top <= line).sort((a, b) => Number(a.box.bottom <= line) - Number(b.box.bottom <= line) || b.box.top - a.box.top)
  // Within its act where it is in one: a language orders the acts as its promise says them.
  const act = at?.block.closest('.home-act')
  const place = at ? { act: act?.id, index: [...(act ?? home).querySelectorAll('*')].indexOf(at.block), top: at.box.top } : { y: scrollY }
  return { ...place, menu: held }
}

/** Back where the reader was, in the language now on the page (reading()). @param {HTMLElement} home @param {any} kept */
function goBack(home, kept) {
  const element = ((kept.act && home.querySelector(`#${kept.act}`)) || home).querySelectorAll('*')[kept.index]
  if (element) scrollBy({ top: element.getBoundingClientRect().top - kept.top, behavior: 'instant' })
  else scrollTo({ top: kept.y ?? 0, behavior: 'instant' })
}

/** @param {HTMLElement} home  the page @param {boolean} shown  whether it shows (ui/shell.js) @param {string} lang  the app's language */
export async function follow(home, shown, lang) {
  const call = ++calls
  home = document.querySelector('body > .home') ?? home
  if (bound !== home) bind(home)
  let menu = home.querySelector('.site-languages')
  const there = document.querySelector(`link[rel="alternate"][hreflang="${lang}"]`) ?? document.querySelector('link[rel="alternate"][hreflang="en"]')
  /** @type {ReturnType<typeof reading> | false | null} */
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
    menu = home.querySelector('.site-languages')
  }
  // Its language, the app's, which may have no page of its own, or none to choose where an organisation set it.
  const now = /** @type {HTMLElement | null | undefined} */ (menu?.querySelector(`[data-language="${lang}"]`))
  if (menu instanceof HTMLElement) menu.hidden = effective.value.locked.has('locale')
  if (now) Object.assign(/** @type {HTMLElement} */ (menu?.querySelector('button [lang]')), { lang, dir: dir(lang), textContent: now.textContent })
  for (const link of menu?.querySelectorAll('[data-language]') ?? []) link === now ? link.setAttribute('aria-current', 'true') : link.removeAttribute('aria-current')
  // Back under a task, the page is at its top, whatever was read above it; as Jean starts, where the browser has it.
  const back = shown && !showing && call > 1
  showing = shown
  place(home)
  if (back) scrollTo({ top: 0, behavior: 'instant' })
  // Over a change of language, the same place, held while the page settles: the fonts set the lines, and a style
  // sheet landing late (tips.css) has WebKit pull the window up. Until the reader moves, for a moment at most.
  if (kept) {
    const hold = () => goBack(home, kept)
    const stop = () => { removeEventListener('scroll', hold); if (holding === hold) holding = null }
    holding = hold
    hold()
    addEventListener('scroll', hold, { passive: true })
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown', 'focusin']) addEventListener(type, stop, { once: true, passive: true })
    setTimeout(stop, 1500)
    document.fonts.ready.then(hold)
    if (kept.menu) menu?.querySelector('button')?.focus({ preventScroll: true })
  }
  // Shown, the page is at its own address; hidden, at the site's.
  const own = document.querySelector(`link[rel="alternate"][hreflang="${home.lang}"]`)
  if (shown && own instanceof HTMLLinkElement) return history.replaceState(history.state, '', `${new URL(own.href).pathname}${location.search}${location.hash}`)
  if (shown) return
  const asked = document.querySelector('meta[name="app-language"]')?.getAttribute('content')
  if (asked && !location.pathname.endsWith('/') && !effective.value.settings.locale && locale.value === asked && pickLocale(LOCALES, navigator.languages) !== asked) updateSettings({ locale: asked }).catch(console.warn)
  if (!location.pathname.endsWith('/')) history.replaceState(history.state, '', `./${location.search}${location.hash}`)
}
