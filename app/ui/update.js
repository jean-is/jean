// A new version, once it is ready: the toast's button lets it in when nothing is under way, and it
// comes back where the page was, on the same entry, scrolled to the same line, the caret where it
// was. A page's code can't be swapped as it runs (a module loads once, an element is defined once),
// so a new page comes in; with view transitions (style.css), the page left stays on screen until
// the new one is drawn as it was, and nothing moves (D138). Loaded after the first paint.
import { effect } from '@preact/signals-core'
import { app } from './state.js'
import { LOOKS } from './looks.js'
import { scriptURL } from './trusted.js'

/** What the page left hands to the new one, in this tab only. */
const HANDOVER = 'app.update'

let updating = false

export function start() {
  arrive()
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('controllerchange', () => updating && leave())
  navigator.serviceWorker.register(scriptURL('./sw.js')).then((registration) => {
    const check = () => {
      if (registration.waiting && navigator.serviceWorker.controller) app.updateReady.value = registration.waiting
    }
    check()
    registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', check))
  }).catch((error) => console.warn('Service worker', error))
}

/** Lets the new version in, after the answer or the dictation under way. @param {ServiceWorker} worker */
export function apply(worker) {
  app.updateReady.value = null
  effect(() => {
    // Nor while a conversation is answered out of sight (D147).
    if (updating || app.busy.value || app.running.value.length || !['idle', 'done'].includes(app.presence.value)) return
    updating = true
    worker.postMessage({ type: 'SKIP_WAITING' })
  })
}

function leave() {
  const box = document.activeElement
  const caret = box instanceof HTMLTextAreaElement && box.id === 'prompt' ? [box.selectionStart, box.selectionEnd] : null
  try {
    sessionStorage.setItem(HANDOVER, JSON.stringify({ place: location.hash, state: history.state, scroll: scrollY, caret }))
  } catch {}
  // Another address: this one again, but for its hash, would only scroll. The new page drops it.
  location.replace(`${location.pathname}?${Date.now().toString(36)}${location.hash}`)
}

/** The new page, drawn as the one it replaced, and shown. */
async function arrive() {
  let saved
  try {
    saved = JSON.parse(sessionStorage.getItem(HANDOVER) ?? 'null')
    sessionStorage.removeItem(HANDOVER)
  } catch {}
  const held = document.getAnimations().some((animation) => /** @type {KeyframeEffect | null} */ (animation.effect)?.pseudoElement?.startsWith('::view-transition'))
  if (!saved && !held) return
  saved ??= {}
  history.replaceState(saved.state ?? null, '', location.pathname + location.hash)
  await Promise.all([app.ready.catch(() => {}), app.dialog.peek() && import('./dialogs.js'), LOOKS[app.look.peek()].list && import('./inbox.js')])
  if (saved.place === location.hash) {
    scrollTo({ top: saved.scroll, behavior: 'instant' })
    const box = document.getElementById('prompt')
    if (saved.caret && box instanceof HTMLTextAreaElement) {
      box.focus()
      box.setSelectionRange(saved.caret[0], saved.caret[1])
    }
  }
  // Whatever would play as the page arrives has played, the wait for it included (style.css); not
  // what a scroll drives (the drawer's fades), which finished would stay at its end whatever the scroll.
  for (const animation of document.getAnimations()) {
    if (animation.timeline === document.timeline && animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish()
  }
}
