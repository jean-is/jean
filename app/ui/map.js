// Where the user's things are, drawn (D728): this device in the middle, the copies they keep on the start side, their other devices on the
// end side, a line to each, moving while it is in step, dashed while there is none yet; a dashed place is an offer, a button. The words are
// HTML in a grid that turns with the page's direction and wraps in any language, and the lines are drawn between the discs as they land.
import { html, svg, nothing } from 'lit-html'
import { define } from './base.js'
import { handheld } from './model.js'
import { icons } from './menu-icons.js'
import { t } from '../core/i18n.js'

/**
 * A place on the map: its side, picture, name and line, how it stands, moving while in step, and, for an offer, what choosing it does.
 * @typedef {{ side: 'start' | 'end', icon: unknown, name: string, sub?: string, state?: 'ok' | 'wait' | 'off', flow?: boolean, act?: () => unknown }} Place
 */

/** Each line, from the middle's disc to a place's, where both are drawn now. @param {Element} map */
function draw(map) {
  const [box, [mid, ...discs]] = [map.getBoundingClientRect(), [...map.querySelectorAll('.data-disc')].map((disc) => disc.getBoundingClientRect())]
  const [x0, y0] = [mid.x + mid.width / 2 - box.x, mid.y + mid.height / 2 - box.y]
  ;[...map.querySelector('.data-lines')?.children ?? []].forEach((line, i) => { const [x, y] = [discs[i].x + discs[i].width / 2 - box.x, discs[i].y + discs[i].height / 2 - box.y]
    line.setAttribute('d', `M${x0} ${y0}C${(x0 + x) / 2} ${y0} ${(x0 + x) / 2} ${y} ${x} ${y}`) })
}
define('app-map', class extends HTMLElement {
  seen = new ResizeObserver(() => draw(this))
  connectedCallback() { this.seen.observe(this) }
  disconnectedCallback() { this.seen.disconnect() }
})

/** Another device of the person's, to add, a computer from a phone, in Your data's words (locales/data/). @param {() => unknown} act @returns {Place} */
export const ghost = (act) => ({ side: 'end', icon: handheld() ? icons.computer : icons.phone, name: t(handheld() ? 'data.computer' : 'data.phone'), sub: t('data.addIt'), act })

/** The map, at most two places a side, a lone one level with the middle. @param {string} label @param {{ icon: unknown, name: string }} here @param {Place[]} places */
export function map(label, here, places) {
  const sides = [places.filter((one) => one.side === 'start').slice(0, 2), places.filter((one) => one.side === 'end').slice(0, 2)]
  const shown = sides.flatMap((side, s) => side.map((one, i) => ({ ...one, at: `at-${s ? 'end' : 'start'}${side.length > 1 ? i + 1 : ''}`, is: `is-${one.act ? 'ghost' : one.state ?? 'ok'}` })))
  requestAnimationFrame(() => document.querySelectorAll('app-map').forEach(draw))
  return html`<app-map><svg class="data-lines" aria-hidden="true">${shown.map((one) => svg`<path class=${`${one.is}${one.flow ? ' is-flow' : ''}`}/>`)}</svg>
    <ul aria-label=${label}><li class="is-here"><span class="data-disc">${here.icon}</span><strong>${here.name}</strong></li>${shown.map((one) => {
      const inside = html`<span class="data-disc">${one.icon}</span><strong dir="auto">${one.name}</strong>${one.sub ? html`<small dir="auto">${one.sub}</small>` : nothing}`
      return html`<li class=${`${one.at} ${one.is}`}>${one.act ? html`<button type="button" @click=${one.act}>${inside}</button>` : inside}</li>`
    })}</ul></app-map>`
}
