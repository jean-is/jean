// The curtain (D669, docs/design.md): moving between profiles is one gesture, though a whole Jean opens afresh for it
// (D228). The click leaves here who the page is for; index.html's first line paints it, the room's colours with a badge and
// a name and nothing Jean keeps, growing from the badge touched over a picture of the page left. It stays while the room
// is drawn behind it, or a lock asks (caps/lock/lock.js), then lifts, the badge flying to where it lives.
import { app, sidebarOpen } from './state.js'
import { PROFILE, PLACE, left, mine } from './opfs.js'
import { still } from './sheet.js'
import { locale } from '../core/i18n.js'

/** What a curtain says of a profile: its name, its badge's letter and colour. @typedef {{ name: string, initial: string, colour?: string }} Who */

/** A name's first letter, as a badge draws it. @param {string} name */
export const initialOf = (name) => ([...new Intl.Segmenter(locale.value).segment(name)][0]?.segment ?? '').toLocaleUpperCase(locale.value)

/**
 * A profile opened afresh behind its curtain, grown from what was touched, and where this tab left this one for coming back.
 * @param {string} dir @param {Who} who @param {Element | null} [from]
 */
export function switchTo(dir, who, from) {
  const box = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('prompt'))
  sessionStorage.setItem(mine(PLACE), JSON.stringify({ place: location.hash, caret: box && [box.selectionStart, box.selectionEnd] }))
  const at = from?.getBoundingClientRect()
  sessionStorage.setItem('app.curtain', JSON.stringify({ ...who, ...(at && { x: at.x + at.width / 2, y: at.y + at.height / 2, size: at.width }) }))
  for (const store of [sessionStorage, localStorage]) store.setItem(PROFILE, dir)
  document.documentElement.dataset.curtain = ''
  location.replace(location.pathname)
}

/** Whatever would play as a page arrives has played, the wait for it included; not what a scroll drives (the drawer's fades), which finished would stay at its end whatever the scroll. */
export function settle() {
  for (const animation of document.getAnimations()) {
    if (animation.timeline === document.timeline && animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish()
  }
}

/** The room is drawn: once the curtain has risen, it goes, at most 150 ms ahead of the capabilities, which arrive without moving what is there. */
export async function lift() {
  const curtain = document.getElementById('curtain')
  if (!curtain) return
  const soon = new Promise((resolve) => setTimeout(resolve, 150))
  await Promise.all([/** @type {any} */ (curtain).arrived, sidebarOpen.peek() && import('./inbox.js')])
  await Promise.race([app.ready.catch(() => {}), soon])
  await new Promise(requestAnimationFrame)
  const [disc, badge, name, wave] = /** @type {HTMLElement[]} */ ([...curtain.children])
  wave.remove()
  if (left?.caret) /** @type {HTMLTextAreaElement | null} */ (document.getElementById('prompt'))?.setSelectionRange(left.caret[0], left.caret[1])
  settle()
  // What is under it can be used from now on.
  curtain.style.pointerEvents = 'none'
  const avatar = /** @type {HTMLElement | null} */ (document.querySelector('.sidebar-settings.profile .avatar'))
  const home = avatar ?? document.querySelector('.sidebar-toggle')
  if (still() || !home || !badge.textContent) await curtain.animate({ opacity: [1, 0] }, 100).finished
  else {
    if (avatar) avatar.style.visibility = 'hidden'
    const [from, to] = [badge.getBoundingClientRect(), home.getBoundingClientRect()]
    for (const part of [disc, name]) part.animate({ opacity: [1, 0] }, { duration: 160, fill: 'both' })
    await badge.animate({ transform: ['none', `translate(${to.x + to.width / 2 - from.x - from.width / 2}px, ${to.y + to.height / 2 - from.y - from.height / 2}px) scale(${to.width / from.width})`], opacity: [1, avatar ? 1 : 0] },
      { duration: 240, easing: 'cubic-bezier(0.2, 0.7, 0.1, 1)', fill: 'both' }).finished
    if (avatar) avatar.style.visibility = ''
  }
  curtain.remove()
  delete document.documentElement.dataset.curtain
}
