// A toast swiped aside goes, as its close button makes it go (ui/shell.js): it follows the pointer
// across, fading, and once past a third of its width or flicked, leaves that way and closes; short
// of that, it comes back. Its buttons and links are their own, and a finger going up or down still
// scrolls the page (touch-action, ui/style.css). Loaded with ui/update.js, after the first paint.
import { still } from './sheet.js'

addEventListener('pointerdown', (event) => {
  const target = event.target instanceof Element ? event.target : null, toast = /** @type {HTMLElement | null | undefined} */ (target?.closest('.toast'))
  if (!toast || event.button || target?.closest('button, a')) return
  event.preventDefault()
  const width = toast.offsetWidth, stop = new AbortController(), { signal } = stop
  let by = 0
  const move = (/** @type {PointerEvent} */ at) => {
    by = at.clientX - event.clientX
    toast.style.translate = `${by}px`
    toast.style.opacity = String(Math.max(1 - Math.abs(by) / width, 0))
  }
  const end = (/** @type {PointerEvent} */ at) => {
    stop.abort()
    const from = { translate: `${by}px`, opacity: toast.style.opacity || 1 }, far = Math.abs(by)
    toast.style.translate = toast.style.opacity = ''
    // Its close button is the toast's only round one.
    const close = /** @type {HTMLButtonElement | null} */ (toast.querySelector(':scope > .icon-button'))
    if (close && at.type === 'pointerup' && (far > width / 3 || (far > 24 && far / (at.timeStamp - event.timeStamp) > 0.6))) {
      if (still()) close.click()
      else toast.animate([from, { translate: `${Math.sign(by) * width}px`, opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' }).finished.then(() => close.click())
    } else if (far && !still()) toast.animate([from, {}], { duration: 200, easing: 'ease-out' })
  }
  toast.setPointerCapture(event.pointerId)
  toast.addEventListener('pointermove', move, { signal })
  toast.addEventListener('pointerup', end, { signal })
  toast.addEventListener('pointercancel', end, { signal })
})
