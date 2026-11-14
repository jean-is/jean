// SPDX-License-Identifier: MIT
// A keyboard on the screen over the box, loaded at the start where a touch, not a mouse, is what points (ui/app.js).
// Where the browser says how much of the window the keyboard leaves, the window shorter or what is seen of it
// (visualViewport), the box rises above it whenever it would be under it. Where it says nothing, as a Tesla's doesn't,
// a box a touch gave the keys on a screen with no mouse, or in a Tesla, rises under the bar while its words have them,
// so that what is written stays in sight; its / and @ menu opens under it then (ui/complete.css).

const view = visualViewport
const tesla = /\bTesla/.test(navigator.userAgent)
/** The box risen, by how much, and its look's own background, from before it rose. @type {HTMLFormElement | null} */
let box = null
let risen = 0
let under = ''
/** The window's tallest at its width: shorter by a keyboard's height, it has one. */
let width = innerWidth
let tallest = innerHeight
/** Whether a touch came last, not a mouse or a key, and whether a keyboard is assumed over the box. */
let touched = false
let assumed = false
let timer = 0
let frame = 0

/** The box whose words have the keys. */
const keyed = () => (document.activeElement instanceof HTMLTextAreaElement ? document.activeElement.closest('form.composer') : null)
// Pinched, what is seen is smaller for another reason.
const pinched = () => !view || Math.abs(view.scale - 1) > 0.01
const told = () => innerHeight < tallest - 100 || (!pinched() && (view?.height ?? innerHeight) < innerHeight - 100)

/** Where the box goes, in the next frame: above what the browser leaves of the window, or under the bar where it says nothing. */
export function place() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const form = /** @type {HTMLFormElement | null} */ (keyed())
    if (box && box !== form) {
      for (const property of ['translate', 'background']) box.style.removeProperty(property)
      box.removeAttribute('data-risen')
      risen = 0
    }
    box = form
    if (!box || !view) return
    const { top, bottom } = box.getBoundingClientRect(), bar = document.querySelector('app-shell > .bar')?.getBoundingClientRect().bottom ?? 0
    const by = pinched() ? 0 : Math.round(Math.max(0, assumed ? top + risen - bar - 8 : bottom + risen - view.offsetTop - view.height + 8))
    box.toggleAttribute('data-risen', assumed && by > 0)
    if (by === risen) return
    if (!risen) under = getComputedStyle(box).backgroundColor
    risen = by
    box.style.translate = risen ? `0 ${-risen}px` : ''
    // The room under the box's own background, whose blur reaches only what is at the room's foot (app-composer, a view
    // transition's), so that nothing written behind the box risen shows through it.
    box.style.background = risen ? `linear-gradient(${under}, ${under}) var(--room)` : ''
  })
}

/** What the browser says, which a keyboard assumed gives way to. */
function changed() {
  if (innerWidth !== width) [width, tallest] = [innerWidth, innerHeight]
  tallest = Math.max(tallest, innerHeight)
  if (told()) assumed = false
  place()
}

/**
 * Once a keyboard has had time to come, if the browser said nothing of it, one is assumed over the window's lower part:
 * where a touch gave the box the keys and no mouse is, or in a Tesla, whose browser never says its keyboard is up.
 */
function wait() {
  clearTimeout(timer)
  if (!tesla && (!touched || matchMedia('(any-pointer: fine)').matches)) return
  timer = setTimeout(() => {
    if (!keyed() || told()) return
    assumed = true
    place()
  }, 700)
}

view?.addEventListener('resize', changed)
view?.addEventListener('scroll', place)
addEventListener('resize', changed)
addEventListener('pointerdown', (event) => {
  touched = event.pointerType !== 'mouse'
  // A touch on the box that already has the keys brings the keyboard back.
  if (event.target instanceof Element && event.target.closest('form.composer') === keyed() && keyed()) wait()
}, true)
addEventListener('keydown', () => { touched = false }, true)
document.addEventListener('focusin', () => { if (keyed()) wait() })
document.addEventListener('focusout', () => {
  clearTimeout(timer)
  assumed = false
  place()
})
// The box grows with what is written, and rises again to stay under the bar.
document.addEventListener('input', () => { if (assumed) place() })
