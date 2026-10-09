// The drawer beside the conversation, opened or put away (D234): it slides from the start edge, a view
// transition in which the conversation and the box move over as they will be. Loaded by the first
// press of its button or ⌘B (ui/state.js), with its style sheet.
import { sidebarOpen, setSidebar } from './state.js'
import { styleSheet } from './sheet.js'

await styleSheet(new URL('slide.css', import.meta.url))

/** @type {ViewTransition | null} */
let sliding = null

/**
 * Opens the drawer or puts it away once the page left is captured, so a second press meanwhile turns
 * it back; the root says "sliding" until it has.
 */
export function slide() {
  const root = document.documentElement
  root.toggleAttribute('data-sliding', true)
  const transition = document.startViewTransition(async () => {
    setSidebar(!sidebarOpen.value)
    // Drawn before the new view is captured, the first time it opens.
    if (sidebarOpen.value) await import('./inbox.js')
  })
  sliding = transition
  transition.ready.catch(() => {}) // skipped in a hidden tab, the change made all the same
  transition.finished.catch(() => {}).then(() => sliding === transition && root.removeAttribute('data-sliding'))
}
