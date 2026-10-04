// The dock (D144): what opens beside the conversation, a file's preview and the browser, shares the
// side of the window, each a pane of its own, and none ever covers another. One fills the dock;
// more share it, and a pane that opens comes after those open already. Beside the conversation on
// a screen at least 60rem wide, one above the other, so that widening the dock widens them all;
// over it on a narrower one, along its longer side (side by side on a phone held sideways), where
// the rest of the page is inert while any is open. A pane that closes gives focus back where it
// was. Handles resize it: the dock's edge, beside the conversation, sets how wide it is, and a
// divider between two panes how they share it; each is dragged, moved with the arrow keys, or put
// back with a double click, and what the user sets is kept in settings. Loaded with the first
// pane, with its style sheet, before the pane's own.
import { effect } from '@preact/signals-core'
import { app, updateSettings } from './state.js'
import { t } from '../core/i18n.js'

await new Promise((resolve) => {
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('dock.css', import.meta.url).href })
  link.addEventListener('load', resolve, { once: true })
  link.addEventListener('error', resolve, { once: true })
  document.head.append(link)
})

/**
 * What a handle moves: a length along its axis, in pixels, read from the pointer or as it is now.
 * @typedef {{ at: (event: PointerEvent) => number, now: () => number, to: (length: number) => void, grow: string, reset: () => void }} Grip
 */

const WIDE = matchMedia('(min-width: 60rem)')
// In rem: the narrowest the dock gets, the room the conversation keeps beside it, the least a pane
// keeps of a divided dock, and how far an arrow key moves a handle.
const DOCK = 20
const TALK = 24
const PANE = 8
const STEP = 2
const SHRINK = /** @type {Record<string, string>} */ ({ ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft', ArrowDown: 'ArrowUp' })
const root = document.documentElement
const dock = Object.assign(document.createElement('div'), { className: 'dock', id: 'dock' })
/** Every pane's element; those open, in the order they opened; the dividers between them. @type {HTMLElement[]} */
const panes = []
/** @type {HTMLElement[]} */
const open = []
/** @type {HTMLElement[]} */
const dividers = []
/** What had focus before each pane opened. @type {WeakMap<HTMLElement, Element | null>} */
const openers = new WeakMap()
/** How wide the dock is, as a share of the window (as it comes when unset), and each pane's share by its element's name. */
let { width, sizes = {} } = app.settings.peek().dock ?? {}
let label = ''

const rem = () => parseFloat(getComputedStyle(root).fontSize)
const rtl = () => root.dir === 'rtl'
const row = () => dock.classList.contains('is-row')
/** A pane's length along the dock's axis. @param {Element} element */
const along = (element) => (row() ? element.getBoundingClientRect().width : element.getBoundingClientRect().height)

/** A handle: a separator to drag, or to move with the arrow keys. @param {string} className @param {(handle: HTMLElement) => Grip} grip */
function handle(className, grip) {
  const element = Object.assign(document.createElement('div'), { className, tabIndex: 0 })
  element.setAttribute('role', 'separator')
  element.setAttribute('aria-label', label)
  element.addEventListener('pointerdown', (event) => {
    if (event.button) return
    event.preventDefault()
    const { at, now, to } = grip(element)
    // Where it was taken, so it doesn't jump under the pointer.
    const offset = at(event) - now()
    const move = (/** @type {PointerEvent} */ moved) => to(at(moved) - offset)
    element.setPointerCapture(event.pointerId)
    element.classList.add('is-grabbed')
    root.dataset.resizing = element.getAttribute('aria-orientation') ?? 'vertical'
    element.addEventListener('pointermove', move)
    element.addEventListener('lostpointercapture', () => {
      element.removeEventListener('pointermove', move)
      element.classList.remove('is-grabbed')
      delete root.dataset.resizing
      save()
    }, { once: true })
  })
  element.addEventListener('keydown', (event) => {
    const { now, to, grow } = grip(element)
    const way = event.key === grow ? 1 : event.key === SHRINK[grow] ? -1 : 0
    if (!way) return
    event.preventDefault()
    to(now() + way * STEP * rem())
    save()
  })
  element.addEventListener('dblclick', () => {
    grip(element).reset()
    save()
  })
  return element
}

/** The dock's edge: how wide it is, measured from the window's side. @returns {Grip} */
function widthGrip() {
  const { left, right } = dock.getBoundingClientRect()
  return {
    at: (event) => (rtl() ? event.clientX - left : right - event.clientX),
    now: () => dock.getBoundingClientRect().width,
    // Kept as wide as it shows, so the keys move it again at once from either end.
    to: (length) => {
      width = length / innerWidth
      widen()
      width = dock.getBoundingClientRect().width / innerWidth
    },
    grow: rtl() ? 'ArrowRight' : 'ArrowLeft',
    reset: () => {
      width = undefined
      widen()
    },
  }
}

/** A divider: how the panes on either side share their room. @param {HTMLElement} divider @returns {Grip} */
function splitGrip(divider) {
  const i = dividers.indexOf(divider)
  const [first, second] = [open[i], open[i + 1]]
  const start = first.getBoundingClientRect()
  const total = along(first) + along(second)
  const shares = (sizes[first.localName] ?? 1) + (sizes[second.localName] ?? 1)
  const least = Math.min(total / 2, PANE * rem())
  return {
    at: (event) => (!row() ? event.clientY - start.top : rtl() ? start.right - event.clientX : event.clientX - start.left),
    now: () => along(first),
    to: (length) => {
      const share = Math.min(Math.max(length, least), total - least) / total
      sizes = { ...sizes, [first.localName]: share * shares, [second.localName]: (1 - share) * shares }
      layout()
    },
    grow: !row() ? 'ArrowDown' : rtl() ? 'ArrowLeft' : 'ArrowRight',
    reset: () => {
      const { [first.localName]: _, [second.localName]: __, ...rest } = sizes
      sizes = rest
      layout()
    },
  }
}

const edge = handle('dock-edge', widthGrip)
edge.setAttribute('aria-orientation', 'vertical')
edge.setAttribute('aria-controls', dock.id)
dock.append(edge)
document.body.append(dock)

/** The dock's width as the user set it, or as it comes; the conversation keeps room beside it. */
function widen() {
  if (width) root.style.setProperty('--pane', `clamp(${DOCK}rem, ${(width * 100).toFixed(2)}vw, 100vw - var(--list, 0rem) - ${TALK}rem)`)
  else root.style.removeProperty('--pane')
  values()
}

/** What each handle says it is at: a share, out of 100. */
function values() {
  edge.setAttribute('aria-valuenow', String(Math.round((100 * dock.getBoundingClientRect().width) / innerWidth)))
  dividers.forEach((divider, i) => {
    const [first, second] = [along(open[i]), along(open[i + 1])]
    divider.setAttribute('aria-valuenow', String(Math.round((100 * first) / (first + second || 1))))
  })
}

let saving = 0
/** What the user set, kept once they stop. */
function save() {
  clearTimeout(saving)
  const round = (/** @type {number} */ n) => Math.round(n * 1000) / 1000
  saving = setTimeout(() => {
    updateSettings({ dock: { width: width && round(width), sizes: Object.fromEntries(Object.entries(sizes).map(([name, n]) => [name, round(n)])) } }).catch((error) => console.warn('Dock', error))
  }, 400)
}

function layout() {
  if (open.length) root.dataset.dock = WIDE.matches ? 'beside' : 'over'
  else delete root.dataset.dock
  // Over the conversation, the panes are all there is until they close.
  const shell = /** @type {HTMLElement | null} */ (document.querySelector('app-shell'))
  if (shell) shell.inert = root.dataset.dock === 'over'
  // Along its longer side over the conversation; beside it, one above the other.
  dock.classList.toggle('is-row', root.dataset.dock === 'over' && dock.clientWidth > dock.clientHeight)
  while (dividers.length < open.length - 1) {
    const divider = handle('dock-divider', splitGrip)
    dividers.push(divider)
    dock.append(divider)
  }
  while (dividers.length > Math.max(0, open.length - 1)) dividers.pop()?.remove()
  // Pane, divider, pane: in the order they opened, each with its share.
  open.forEach((element, i) => {
    element.style.order = String(2 * i)
    element.style.flexGrow = String(sizes[element.localName] ?? 1)
  })
  dividers.forEach((divider, i) => {
    divider.style.order = String(2 * i + 1)
    divider.setAttribute('aria-orientation', row() ? 'vertical' : 'horizontal')
    divider.setAttribute('aria-controls', open[i].id)
  })
  for (const element of panes) element.hidden = !open.includes(element)
  values()
}
WIDE.addEventListener('change', layout)
new ResizeObserver(layout).observe(dock)
effect(() => {
  label = t('dock.resize')
  for (const element of [edge, ...dividers]) element.setAttribute('aria-label', label)
})
widen()

/** A pane's element goes in the dock, hidden until it opens. @param {HTMLElement} element */
export function join(element) {
  element.hidden = true
  element.id = element.localName
  panes.push(element)
  dock.append(element)
}

/**
 * A pane opens, after those open already, or closes and gives focus back. Called after each
 * render; says whether the pane has just opened, for it to take focus.
 * @param {HTMLElement} element @param {boolean} shown
 */
export function place(element, shown) {
  const at = open.indexOf(element)
  if (shown === at >= 0) return false
  if (shown) {
    openers.set(element, document.activeElement)
    open.push(element)
  } else open.splice(at, 1)
  layout()
  // Focus that was in the pane, and went with it, goes back where it came from.
  const opener = openers.get(element)
  const lost = !document.activeElement || document.activeElement === document.body
  if (!shown && lost && opener instanceof HTMLElement && opener.isConnected) opener.focus()
  return shown
}
