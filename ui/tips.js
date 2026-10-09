// Tips (D233): the name of a button or link that shows no words of its own (an icon, a count), or what
// an element's title adds, shown above it as a source's is, once the pointer rests on it or the keyboard
// brings it focus, in place of the browser's own, which can't be styled. A title is lifted off
// meanwhile, so the browser's doesn't show too, and put back after. A name or title written again
// meanwhile (Read aloud, then Stop reading) shows. Loaded by the first pointer or focus (ui/app.js).
import { styleSheet } from './sheet.js'

await styleSheet(new URL('tips.css', import.meta.url))

// As long as the browser's own waits; once a tip has shown, the next comes at once for a moment.
const WAIT_MS = 500
const WARM_MS = 400
const GAP = 6
const TIPPED = '[title]:not(iframe), :is(button, a)[aria-label]'

const tip = Object.assign(document.createElement('div'), { id: 'app-tip', className: 'tip', popover: 'manual', dir: 'auto' })
tip.setAttribute('role', 'tooltip')

/** The element with a tip, what it says, and whether its title is lifted off. @type {HTMLElement | null} */
let target = null
let text = ''
let lifted = false
let described = false
let timer = 0
let shown = 0

/** Its title, or its name when nothing on it says it in words. @param {Element} element */
const said = (element) => element.getAttribute('title') ?? (/\p{L}/u.test(element.textContent ?? '') ? '' : element.getAttribute('aria-label') ?? '')

const watch = new MutationObserver(() => {
  const title = target?.getAttribute('title')
  if (!target || (title == null && lifted)) return
  text = title ?? said(target)
  if (title != null) target.removeAttribute('title')
  lifted ||= title != null
  if (tip.matches(':popover-open')) show()
})

/** The element pointed at or focused, and whether its tip shows at once. @param {EventTarget | null} element @param {boolean} now */
function over(element, now) {
  if (!(element instanceof Element)) return
  const tipped = /** @type {HTMLElement | null} */ (element.closest(TIPPED))
  // Still within it, unless on what has a tip of its own there.
  if (target?.contains(element) && (tipped === target || !target.contains(tipped))) return
  out()
  const words = tipped && said(tipped)
  if (!tipped || !words) return
  target = tipped
  text = words
  lifted = tipped.hasAttribute('title')
  tipped.removeAttribute('title')
  watch.observe(tipped, { attributeFilter: ['title', 'aria-label'] })
  timer = setTimeout(show, now || Date.now() - shown < WARM_MS ? 0 : WAIT_MS)
}

/** Above the element, or under it where there is no room above; within the window. */
function show() {
  if (!target?.isConnected) return out()
  tip.textContent = text
  if (!tip.matches(':popover-open')) {
    // In a dialog, within it: the rest of the page is inert.
    ;(target.closest('dialog[open]') ?? document.body).append(tip)
    tip.showPopover()
  }
  if (!described && !target.hasAttribute('aria-describedby') && text !== target.getAttribute('aria-label')) {
    target.setAttribute('aria-describedby', tip.id)
    described = true
  }
  const box = target.getBoundingClientRect()
  const { width, height } = tip.getBoundingClientRect()
  tip.style.left = `${Math.max(GAP, Math.min(box.left + (box.width - width) / 2, innerWidth - width - GAP))}px`
  tip.style.top = `${box.top - height - GAP < 0 ? box.bottom + GAP : box.top - height - GAP}px`
}

/** The tip goes; a title stays lifted off until the pointer or focus leaves, as the browser's doesn't come back either. */
function hide() {
  clearTimeout(timer)
  if (!tip.matches(':popover-open')) return
  tip.hidePopover()
  shown = Date.now()
}

/** The tip goes, and a title comes back, unless it was written again meanwhile. */
function out() {
  hide()
  watch.disconnect()
  if (lifted && target && !target.hasAttribute('title')) target.setAttribute('title', text)
  if (described) target?.removeAttribute('aria-describedby')
  target = null
  described = false
}

/** @param {PointerEvent} event */
const pointed = (event) => event.pointerType !== 'touch' && over(event.target, false)
/** @param {FocusEvent} event */
const focused = (event) => event.target instanceof Element && event.target.matches(':focus-visible') && over(event.target, true)

addEventListener('pointerover', pointed)
addEventListener('pointerout', (event) => { if (target && !target.contains(/** @type {Node | null} */ (event.relatedTarget))) out() })
addEventListener('focusin', focused)
addEventListener('focusout', (event) => { if (target?.contains(/** @type {Node} */ (event.target))) out() })
addEventListener('pointerdown', hide, true)
addEventListener('scroll', () => tip.matches(':popover-open') && show(), true)
addEventListener('keydown', (event) => { if (event.key === 'Escape') hide() })

/** The event that loaded the module, handled as the next ones are. @param {Event} event */
export const first = (event) => (event.type === 'focusin' ? focused(/** @type {FocusEvent} */ (event)) : pointed(/** @type {PointerEvent} */ (event)))
