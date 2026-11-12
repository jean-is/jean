// SPDX-License-Identifier: MIT
// What the parts of a document's editor share (D485): an element made, a glyph drawn, a box floated
// beside what it is for, never past the window's edges, and a line's language.
import { languageOf } from '../../ui/language.js'
import { LOCALES } from '../../core/i18n.js'

/** An id no other in the page has, as another document open beside this one may hold the plain one. @param {string} name @param {string} [part] what is named after it */
export const free = (name, part = '') => { let id = name; for (let n = 2; document.getElementById(id + part); n++) id = `${name}-${n}`; return id }

/** A letter of a language written right to left. */
export const RTL = /^[֐-ࣿיִ-﷿ﹰ-﻿]/

/** A text's language where it isn't the page's and Jean is sure of it: one other at most as close, whatever language Jean is read in. @param {string} text */
export function langOf(text) {
  const page = document.documentElement.lang.split('-')[0], one = languageOf(text, page)
  return one !== page && new Set(LOCALES.map((hint) => languageOf(text, hint))).size < 3 ? one : ''
}

/** A box over a document, shown or not: next after its pane's view in the order of focus, in the top layer. @param {HTMLElement} box @param {HTMLElement} doc @param {boolean} on */
export function pop(box, doc, on, view = doc.closest('.view')) {
  if (on && view && box.parentElement !== view.parentElement) view.after(box)
  box.hidden = !on
  if (box.isConnected && box.matches(':popover-open') !== on) box.togglePopover(on)
}

/** @param {string} tag @param {Record<string, string>} [attrs] @param {...(Node | string)} children */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
  node.append(...children)
  return node
}

/** A glyph: one path drawn in the text's colour. @param {string} d @param {number} [width] its stroke's */
export function icon(d, width = 2) {
  const [svg, path] = ['svg', 'path'].map((tag) => document.createElementNS('http://www.w3.org/2000/svg', tag))
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': String(width), 'stroke-linecap': 'round', 'aria-hidden': 'true' })) svg.setAttribute(name, value)
  path.setAttribute('d', d)
  svg.append(path)
  return svg
}

/**
 * A fixed box beside what it is for: under it, or over it when `over` (each the other way round where there is no
 * room), its start at the rect's start as the page reads, or `centred` on it.
 * @param {HTMLElement} box @param {{ top: number, bottom: number, left: number, right: number }} rect
 * @param {{ over?: boolean, centred?: boolean, gap?: number }} [how]
 */
export function float(box, rect, { over = false, centred = false, gap = 6 } = {}) {
  const { offsetWidth: width, offsetHeight: height } = box
  const [below, above] = [rect.bottom + gap + height <= innerHeight - 8, rect.top - gap - height >= 8]
  box.style.top = `${Math.max(8, (over ? above || !below : !below && above) ? rect.top - gap - height : rect.bottom + gap)}px`
  const start = centred ? (rect.left + rect.right - width) / 2 : document.documentElement.dir === 'rtl' ? rect.right - width : rect.left
  box.style.left = `${Math.max(8, Math.min(start, innerWidth - width - 8))}px`
}
