// A design's parts moved and resized by hand (D572): dragged with the pointer or a finger, snapping to the page's middle and
// edges, its printer's margin and the other parts' edges, a guide drawn where it snaps, the part placed again as it moves and
// written once let go; resized by its handles, words keeping their size and wrapping, a picture its shape; with the keys, the
// arrows moving a millimetre, five with Shift, and resizing with Alt; and from the part's bar, a little higher or lower, bigger
// or smaller, so that nothing needs dragging (WCAG 2.5.7). Each is one ⌘Z step, and said to a screen reader.
import { html } from 'lit-html'
import { t } from '../../core/i18n.js'
import { shown, picked } from './designs.js'
import { unitOf, changed } from './layout.js'
import { vars } from './page.js'
import { changePart, say, nameOf } from './view.js'

/** @import { Design, Part } from './layout.js' */

/** A step of the keys: a millimetre on paper, half a hundredth of a screen's shorter side. @param {Design} design */
const stepOf = (design) => (design.page.mm ? 1 / design.page.mm : unitOf(design.page) / 2)
/** A box as custom properties, in percent of the page. @param {Design} design @param {number[]} box */
const place = (design, [x, y, w, h]) => ({ '--x': `${(x / design.page.w) * 100}%`, '--y': `${(y / design.page.h) * 100}%`, '--w': `${(w / design.page.w) * 100}%`, '--h': `${(h / design.page.h) * 100}%` })

/** The handles at the part picked's corners, 44 px to a finger. @param {Design} design @param {Part} part */
export const handles = (design, part) => html`<div class="design-handles" ${vars(place(design, part.box))}>${['nw', 'ne', 'sw', 'se'].map((corner) => html`<i class="design-handle"
  data-corner=${corner} @pointerdown=${(/** @type {PointerEvent} */ event) => drag(event, part, corner)}></i>`)}</div>`

/** Where a moving part snaps: the page's edges and middle, its printer's margin, the other parts' edges and middles. @param {Design} design @param {Part} part */
function lines(design, part) {
  const { w, h, mm } = design.page, edge = mm ? 5 / mm : 0, others = design.parts.filter((one) => one.id !== part.id && one.role !== 'shape')
  return { x: [0, edge, w / 2, w - edge, w, ...others.flatMap(({ box: [x, , bw] }) => [x, x + bw / 2, x + bw])], y: [0, edge, h / 2, h - edge, h, ...others.flatMap(({ box: [, y, , bh] }) => [y, y + bh / 2, y + bh])] }
}
/** How far the nearest line is from a box's start, middle or end, within `room`, and where it is. @param {number[]} edges @param {number[]} at @param {number} room */
function snap(edges, at, room) {
  let best = [0, NaN]
  for (const edge of edges) for (const line of at) if (Math.abs(line - edge) < room && (Number.isNaN(best[1]) || Math.abs(line - edge) < Math.abs(best[0]))) best = [line - edge, line]
  return best
}

/**
 * A part pressed: picked, then dragged, or by a handle resized, placed again as it moves and written once let go; a press that
 * doesn't move only picks it. @param {PointerEvent} event @param {Part} part @param {string} [corner] nw, ne, sw or se
 */
export function drag(event, part, corner = '') {
  const one = shown.peek(), target = /** @type {HTMLElement} */ (event.currentTarget), over = target.closest('.design-over'), page = over?.parentElement
  if (!one || !over || !page || event.button !== 0) return
  picked.value = part.id
  // Jean's version of a part is accepted or rejected before it moves.
  if (one.side?.parts[part.id] !== undefined) return
  event.stopPropagation()
  const { design } = one, scale = design.page.w / page.getBoundingClientRect().width, [x0, y0, w0, h0] = part.box, from = [event.clientX, event.clientY]
  const at = lines(design, part), guides = /** @type {HTMLElement} */ (over.querySelector('.design-guides')), least = stepOf(design) * 5, keep = part.role === 'picture'
  let box = part.box, moved = false
  target.setPointerCapture(event.pointerId)
  const move = (/** @type {PointerEvent} */ e) => {
    const dx = (e.clientX - from[0]) * scale, dy = (e.clientY - from[1]) * scale
    if (!moved && Math.hypot(e.clientX - from[0], e.clientY - from[1]) < 4) return
    moved = true
    let gx = NaN, gy = NaN
    if (!corner) {
      const [sx, x] = snap([x0 + dx, x0 + dx + w0 / 2, x0 + dx + w0], at.x, 6 * scale), [sy, y] = snap([y0 + dy, y0 + dy + h0 / 2, y0 + dy + h0], at.y, 6 * scale)
      ;[gx, gy] = [x, y]
      box = [x0 + dx + sx, y0 + dy + sy, w0, h0]
    } else {
      const w = Math.max(least, corner.includes('e') ? w0 + dx : w0 - dx), h = keep ? (w * h0) / w0 : Math.max(least, corner.includes('s') ? h0 + dy : h0 - dy)
      box = [corner.includes('w') ? x0 + w0 - w : x0, corner.includes('n') ? y0 + h0 - h : y0, w, h]
    }
    for (const element of over.parentElement?.querySelectorAll(`[data-part="${part.id}"], [data-hit="${part.id}"], .design-handles`) ?? []) {
      for (const [name, value] of Object.entries(place(design, box))) /** @type {HTMLElement} */ (element).style.setProperty(name, value)
    }
    guides.toggleAttribute('data-x', !Number.isNaN(gx))
    guides.toggleAttribute('data-y', !Number.isNaN(gy))
    guides.style.setProperty('--gx', `${(gx / design.page.w) * 100}%`)
    guides.style.setProperty('--gy', `${(gy / design.page.h) * 100}%`)
  }
  const up = () => {
    target.removeEventListener('pointermove', move)
    guides.removeAttribute('data-x')
    guides.removeAttribute('data-y')
    if (!moved) return
    changePart(part.id, { box, moved: true })
    say(t(corner ? 'designs.resized' : 'designs.moved', { part: nameOf(part) }))
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up, { once: true })
  target.addEventListener('pointercancel', up, { once: true })
}

/** The keys on a part: Enter changes its words or a picture's photo, the arrows move it, with Shift five times as far, with Alt resize it. @param {KeyboardEvent} event @param {Part} part @param {() => void} edit */
export function keyed(event, part, edit) {
  const design = shown.peek()?.design, way = /** @type {Record<string, number[]>} */ ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] })[event.key]
  if (!design || event.isComposing) return
  if (event.key === 'Enter' && part.role !== 'shape') { event.preventDefault(); edit(); return }
  if (!way) return
  event.preventDefault()
  const step = stepOf(design) * (event.shiftKey ? 5 : 1), [x, y, w, h] = part.box
  changePart(part.id, { moved: true, box: event.altKey ? [x, y, Math.max(step, w + way[0] * step), Math.max(step, h + way[1] * step)] : [x + way[0] * step, y + way[1] * step, w, h] }, `key:${part.id}`)
  say(t(event.altKey ? 'designs.resized' : 'designs.moved', { part: nameOf(part) }))
}

/** A little higher or lower, bigger or smaller, from the part's bar, as design_change does it. @param {Part} part @param {string} how up, down, bigger or smaller */
export function nudge(part, how) {
  const design = shown.peek()?.design, next = design && changed(design, [{ part: part.id, ...(['up', 'down'].includes(how) ? { move: how } : { grow: how }) }], '').parts[part.id]
  if (!next) return
  changePart(part.id, { box: next.box, moved: true, ...(next.size && { size: next.size }) })
  say(t(['up', 'down'].includes(how) ? 'designs.moved' : 'designs.resized', { part: nameOf(part) }))
}
