// The curtain (D669, docs/design.md): moving between profiles is one gesture, though a whole Jean opens afresh for it
// (D228). The click leaves here who the page is for; index.html's first line paints it, the room's colours with a badge and
// a name and nothing Jean keeps, growing from the badge touched over a picture of the page left. It stays while the room
// is drawn behind it, or a lock asks (caps/lock/lock.js), then lifts, the badge flying to where it lives.
import { html, nothing } from 'lit-html'
import { ref } from 'lit-html/directives/ref.js'
import { BRAND } from '../brand.js'
import { app, sidebarOpen } from './state.js'
import { PROFILE, PLACE, left, mine } from './opfs.js'
import { icons } from './menu-icons.js'
import { still } from './sheet.js'
import { locale, t } from '../core/i18n.js'

/** What a curtain says of a profile: its name, its badge's letter and colour. @typedef {{ name: string, initial: string, colour?: string }} Who */

/** A name's first letter, as a badge draws it. @param {string} name */
export const initialOf = (name) => ([...new Intl.Segmenter(locale.value).segment(name)][0]?.segment ?? '').toLocaleUpperCase(locale.value)

/** What a curtain says of a profile by its vault.json: Jean's name where it has none yet. @param {{ name?: string, colour?: string } | null} [of] @returns {Who} */
export const whoOf = (of) => ({ name: of?.name || BRAND.name, initial: of?.name ? initialOf(of.name) : '', colour: of?.colour })

/** The curtain that is up, or one drawn now for this person. @param {Who} who @returns {HTMLElement} */
export const curtainFor = (who) => document.getElementById('curtain') ?? /** @type {typeof self & { curtain: (who: Who) => HTMLElement }} */ (self).curtain(who)

/** This page leaves Jean's address and comes back to it behind the curtain, as for an identity provider. @param {Who} who */
export function behind(who) {
  curtainFor(who)
  sessionStorage.setItem('app.curtain', JSON.stringify(who))
}

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

/**
 * The other profiles as badges at a card's foot, a lock on those that will ask. @param {[string, { name?: string, colour?: string, slots: { kind: string }[] } | null][]} others their folders and vault.json
 */
export const otherBadges = (others) => (others.length ? html`<div class="lock-others">${others.map(([dir, of]) => {
  const who = whoOf({ ...of, name: of?.name || t('profile.you') })
  return html`<button class="lock-other" @click=${(/** @type {Event} */ e) => switchTo(dir, who, /** @type {Element} */ (e.currentTarget).querySelector('.avatar'))}>
    <span class="avatar" aria-hidden="true" ${ref((avatar) => /** @type {HTMLElement | undefined} */ (avatar)?.style.setProperty('--badge', who.colour ?? 'var(--flame)'))}>${who.initial}</span>
    <span dir="auto">${who.name}</span>${of?.slots.some((slot) => slot.kind === 'device') ? nothing : icons.lock}</button>`
})}</div>` : nothing)

/** An answer, a dictation, or a conversation answered out of sight (D147), under way, which leaving would stop. */
export const working = () => Boolean(app.busy.value || app.running.value.length) || !['idle', 'done'].includes(app.presence.value)

/**
 * The page a new version held on screen (ui/update.js) lets go: now, or as this one is first drawn, which a look's
 * style sheet still loading puts off past the code that calls this.
 */
export function unhold() {
  const skip = (/** @type {PageRevealEvent} */ event) => event.viewTransition?.skipTransition()
  // A page is revealed before its frame's callbacks run, so the next one comes after its reveal.
  addEventListener('pagereveal', skip, { once: true })
  requestAnimationFrame(() => removeEventListener('pagereveal', skip))
  document.activeViewTransition?.skipTransition()
  for (const animation of document.getAnimations()) if (/** @type {KeyframeEffect | null} */ (animation.effect)?.pseudoElement?.startsWith('::view-transition')) animation.finish()
}

/** Whatever would play as a page arrives has played, the wait for it included; not what a scroll drives (the drawer's fades), which finished would stay at its end whatever the scroll. */
export function settle() {
  unhold()
  for (const animation of document.getAnimations()) {
    if (animation.timeline === document.timeline && animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish()
  }
}

/** The room is drawn: once the curtain has risen, it goes, at most 150 ms ahead of the capabilities, which arrive without moving what is there. */
export async function lift() {
  const curtain = document.getElementById('curtain')
  if (!curtain) return
  const soon = new Promise((resolve) => setTimeout(resolve, 150))
  await Promise.all([/** @type {HTMLElement & { arrived?: Promise<void> }} */ (curtain).arrived, sidebarOpen.peek() && import('./inbox.js')])
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
