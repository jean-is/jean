// Where a flow of a few named steps is (D700's pairing, the same on both devices): the step under way marked as the current one, those
// before it ticked, all of them once it is done. Its look is data-pages.css's, which the pages that hold such a flow load.
import { html, nothing } from 'lit-html'
import { icons } from './menu-icons.js'

/** @param {string} label @param {string[]} names @param {number} at the step under way @param {boolean} [done] */
export const rail = (label, names, at, done = false) => html`<ol class="rail" aria-label=${label}>${names.map((name, i) => html`<li class=${i < at || done ? 'is-done' : ''}
  aria-current=${i === at && !done ? 'step' : nothing}>${i < at || done ? icons.check : nothing}${name}</li>`)}</ol>`
