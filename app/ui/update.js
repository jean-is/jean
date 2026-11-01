// A new version, once it is ready: the toast's button lets it in when nothing is under way, and it
// comes back where the page was, on the same entry, scrolled to the same line, the caret where it
// was. A page's code can't be swapped as it runs (a module loads once, an element is defined once),
// so a new page comes in; with view transitions (style.css), the page left stays on screen until
// the new one is drawn as it was, and nothing moves (D138). A capability turned off, here or in
// another tab, goes the same way, since its module can't be unloaded either (D433). Loaded after
// the first paint.
import { effect } from '@preact/signals-core'
import { app, chipLabel, decisionsHere } from './state.js'
import { BRAND } from '../brand.js'
import { shown } from './creations.js'
import { titleOf } from '../core/events.js'
import { locale, t } from '../core/i18n.js'
import { loaded } from './caps.js'
import { LOOKS } from './looks.js'
import { scriptURL } from './trusted.js'
import { settle, working } from './curtain.js'

/** What the page left hands to the new one, in this tab only. */
const HANDOVER = 'app.update'

let updating = false
// A capability turned off is denied as the page begins (ui/app.js), so one loaded here was turned off since.
effect(() => { if (!updating && !working() && app.settings.value.off?.some((id) => loaded.peek().has(id))) { updating = true; leave() } })

// The window's title says what the page is: search, Creations, a task's name, or the first screen's; Settings says its section (ui/dialogs.js).
const home = document.title, first = locale.peek()
effect(() => { const language = locale.value, sheet = app.dialog.value, named = sheet === 'find' ? t('cap.find.name') : shown.value ? t('creations.title') : titleOf(app.current.value?.records ?? []); if (sheet !== 'settings') document.title = named ? `${named} · ${BRAND.name}` : language === first ? home : BRAND.name })
// What Jean is doing, said to a screen reader as it changes: that it waits on the person, asks again, is thinking and writing, and when it has answered, not its stream of words.
const said = Object.assign(document.createElement('span'), { className: 'visually-hidden', role: 'status' }); said.style.position = 'fixed'; document.body.append(said)
effect(() => { const now = app.presence.value, offer = app.offering.value, waiting = decisionsHere().length + (offer && offer.conversation === app.current.value?.path ? 1 : 0); const words = waiting ? t('inbox.waiting', { count: waiting }) : app.live.value?.turn.steps.some((step) => step.tools.some((tool) => tool._meta?.retrying)) ? t('activity.retrying') : now === 'thinking' ? t('activity.thinking') : now === 'answering' ? t('activity.writing') : now === 'done' ? t('activity.answeredWith', { brain: chipLabel.value ?? '' }) : ''; if (said.textContent !== words) said.textContent = words })

export function start() {
  arrive()
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('controllerchange', () => updating && leave())
  navigator.serviceWorker.register(scriptURL('./sw.js')).then((registration) => {
    const check = () => { if (registration.waiting && navigator.serviceWorker.controller) app.updateReady.value = registration.waiting }
    check()
    registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', check))
    // The browser asks only when a page loads, and an installed app comes back on screen without loading (Android's, for days), so it asks then, at most every quarter of an hour.
    let asked = Date.now()
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - asked > 15 * 60e3) { asked = Date.now(); registration.update().catch(() => {}) } })
  }).catch((error) => console.warn('Service worker', error))
}

/** Lets the new version in, after the answer or the dictation under way. @param {ServiceWorker} worker */
export function apply(worker) {
  app.updateReady.value = null
  effect(() => {
    if (updating || working()) return
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
  const held = !document.getElementById('curtain') && document.getAnimations().some((animation) => /** @type {KeyframeEffect | null} */ (animation.effect)?.pseudoElement?.startsWith('::view-transition'))
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
  settle()
}
