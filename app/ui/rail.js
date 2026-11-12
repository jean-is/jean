// SPDX-License-Identifier: MIT
// Where a flow of a few named steps is (D700's pairing, the same on both devices, D727's meeting): the step under way marked as the current
// one, those before it ticked, all of them once it is done; and the keyboard following it. Its look is data-pages.css's, which the pages that
// hold such a flow load.
import { html, nothing } from 'lit-html'
import { effect } from '@preact/signals-core'
import { icons } from './menu-icons.js'

/** @param {string} label @param {string[]} names @param {number} at the step under way @param {boolean} [done] */
export const rail = (label, names, at, done = false) => html`<ol class="rail" aria-label=${label}>${names.map((name, i) => html`<li class=${i < at || done ? 'is-done' : ''}
  aria-current=${i === at && !done ? 'step' : nothing}>${i < at || done ? icons.check : nothing}${name}</li>`)}</ol>`

/**
 * A step that changes, or one under way as its page opens (a link that came), takes the keyboard to the first there of what it asks for now:
 * a field, its title, its first button, or what starts the flow again. @param {() => string} step its steps, 'idle' each at rest @param {() => boolean} open @param {string[]} where
 */
export function follow(step, open, where) {
  let was = ''
  effect(() => { const now = step(); if (was ? now !== was : now.split(' ').some((one) => one !== 'idle')) requestAnimationFrame(() => open() && /** @type {HTMLElement | undefined} */ (where.map((one) => document.querySelector(one)).find(Boolean))?.focus()); was = now })
}
