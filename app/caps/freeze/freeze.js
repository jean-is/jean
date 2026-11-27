// SPDX-License-Identifier: MIT
// The divider after a collection's columns kept in view, dragged (caps/tables/view.js fetches this folder as it is first pressed): as the pointer moves, it goes
// to the nearest column's end edge among the first `most`, and `done` is given how many columns that keeps once it is let go, none moved giving -1.

/** @param {PointerEvent} e @param {HTMLElement} handle @param {number} most @param {(to: number) => void} done */
export default function drag(e, handle, most, done) {
  const table = /** @type {HTMLTableElement} */ (handle.closest('table')), rtl = getComputedStyle(table).direction === 'rtl', cells = [...table.tHead?.rows[0].cells ?? []]
  const ends = cells.slice(0, most + 1).map((cell) => ((rect) => (rtl ? rect.left : rect.right))(cell.getBoundingClientRect())), start = ends[0] - (cells[0]?.getBoundingClientRect().width ?? 0) * (rtl ? -1 : 1)
  let to = -1
  try { handle.setPointerCapture(e.pointerId) } catch { return }
  handle.classList.add('is-dragging')
  handle.onpointermove = (move) => {
    to = ends.reduce((best, end, k) => (Math.abs(end - move.clientX) < Math.abs(ends[best] - move.clientX) ? k : best), 0)
    table.style.setProperty('--frozen-end', `${Math.abs(ends[to] - start)}px`)
  }
  handle.onpointerup = handle.onpointercancel = () => {
    handle.onpointermove = handle.onpointerup = handle.onpointercancel = null
    handle.classList.remove('is-dragging')
    done(to)
  }
}
