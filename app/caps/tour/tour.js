// A guided tour over a demo (D460, ui/demo.js): stops that each say a few words at a moment of the
// replay, pointing at what shows then, and go on after a while, with Next (or a clicker's Page Down),
// or once the viewer clicks what they point at, which plays the next request when it is a follow-up.
// Its file sits beside the task's: { "stops": [{ "at", "on", "say", "go" }] }. at: a line of the task's
// file, just before it plays; a call's id, as it starts; or "end". on: a selector, its last match.
// say: words, or words by language. go: milliseconds, "next" (the default) or "click". A help article's tour over
// Jean itself (live.js, D612) names what a stop points at by the app's string for it too (named), and Escape ends it.
import { html, nothing, render } from 'lit-html'
import { t, useStrings } from '../../core/i18n.js'
import { styleSheet } from '../../ui/sheet.js'

/** @typedef {{ at?: number | string, on?: string, named?: string, say: string | Record<string, string>, go?: number | 'next' | 'click' }} Stop */

await Promise.all([useStrings('tour'), styleSheet(new URL('../../ui/tips.css', import.meta.url)), styleSheet(new URL('tour.css', import.meta.url))])

const bubble = Object.assign(document.createElement('div'), { id: 'app-tour', className: 'tip tour', popover: 'manual' })
bubble.setAttribute('aria-live', 'polite')
document.body.append(bubble)
const FORWARD = ['PageDown', document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight']

/**
 * The tour at an address, for a demo in a language and at a speed: at() shows the stops at a moment
 * of the replay, one after another, and says whether there were any once they have gone on.
 * @param {URL} address @param {string} lang @param {number} speed
 */
export async function load(address, lang, speed) {
  const response = await fetch(address)
  if (!response.ok) throw new Error(`tour: ${response.status} for ${address}`)
  /** @type {Stop[]} */
  const stops = (await response.json()).stops ?? []
  return {
    /** @param {number | string | undefined} moment */
    async at(moment) {
      const here = stops.filter((stop) => stop.at === moment)
      for (const stop of here) await show(stop, lang, speed)
      return here.length > 0
    },
  }
}

/** Whether the app's string `key` names an element: its aria-label, or words of its own or of one inside it. @param {Element} element @param {string} key */
const names = (element, key) => [element.getAttribute('aria-label'), ...[element, ...element.querySelectorAll('*')].map((node) => [...node.childNodes].filter((child) => child.nodeType === 3).map((child) => child.textContent).join(''))]
  .some((name) => name?.trim() === t(key))

/**
 * The last element a selector finds that shows, or would once a list closed over it opens, and that the app's string
 * `named` names, given a few seconds to show
 * (a chart loads its code first) or longer, or none. @param {string | undefined} selector @param {string} [named] @param {number} [wait]
 * @returns {Promise<HTMLElement | null>}
 */
async function pointed(selector, named, wait = 3000) {
  for (let tries = 0; selector && tries < wait / 100; tries++) {
    try { const found = [...document.querySelectorAll(selector)].filter((element) => (element.checkVisibility() || element.closest('details:not([open])')) && (!named || names(element, named))).at(-1); if (found) return /** @type {HTMLElement} */ (found) } catch { return null }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
}

/**
 * A stop's words beside what it points at, until it goes on, and whether Escape ended it there.
 * @param {Stop} stop @param {string} lang @param {number} speed @param {number} [wait]  how long what it points at may take to show
 */
export async function show({ on, named, say, go = 'next' }, lang, speed, wait) {
  const target = await pointed(on, named, wait)
  // A list closed over it opens while it shows, as the reader would open it; after, it closes and the page goes back where it was.
  /** @type {Element[]} */
  const opened = []
  for (let shut = target?.parentElement?.closest('details:not([open])'); shut; shut = shut.parentElement?.closest('details:not([open])')) opened.push(shut)
  for (const shut of opened) shut.toggleAttribute('open', true)
  const was = scrollY
  target?.classList.add('is-toured')
  target?.scrollIntoView({ block: 'nearest' })
  bubble.classList.toggle('is-alone', !target)
  // Inside a modal dialog what it points at is in (Settings, live.js), else the dialog would leave it inert.
  const layer = target?.closest('dialog[open]') ?? document.querySelector('dialog[open]') ?? document.body
  if (bubble.parentElement !== layer) layer.append(bubble)
  const how = go === 'click' && !target ? 'next' : go
  const ended = await new Promise((resolve) => {
    const next = (stop = false) => { removeEventListener('keydown', key); resolve(stop) }
    const key = (/** @type {KeyboardEvent} */ event) => (event.key === 'Escape' ? next(true) : how === 'next' && FORWARD.includes(event.key) && next())
    render(html`<p dir="auto">${typeof say === 'string' ? say : say[lang] ?? say.en ?? Object.values(say)[0]}</p>
      ${how === 'next' ? html`<button class="button primary" @click=${() => next()}>${t('tour.next')}</button>` : nothing}`, bubble)
    bubble.showPopover()
    addEventListener('keydown', key)
    if (typeof how === 'number') setTimeout(next, how / speed)
    else if (how === 'click') target?.addEventListener('click', () => next(), { once: true })
  })
  bubble.hidePopover()
  target?.classList.remove('is-toured')
  for (const shut of opened) shut.toggleAttribute('open', false)
  scrollTo({ top: was, behavior: 'instant' })
  return ended
}
