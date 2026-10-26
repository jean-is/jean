// A long list drawn only where it shows (D627): a design's takes row, which deals as long as it is scrolled (D572), and each group
// of cards on Creations (D544). A directive in the list's element, which holds its items alone, one element each: it draws those in
// view and a screen's worth either side, between two empty ones as long as the rest, so that its scroll bar is as long as all of
// them: not the element's padding, which a scroller's parent would make room for. The step from a row to the next (an item and the gap) and the lanes a row holds (a grid's columns, else one) are read from
// those drawn, so CSS alone lays them out; what is in view is the element's own scroll along its axis, else the window's, down.
// A list without an end is asked for more as that end comes into reach.
import { html } from 'lit-html'
import { AsyncDirective, directive } from 'lit-html/async-directive.js'
import { repeat } from 'lit-html/directives/repeat.js'

/**
 * How many there are, each drawn by its place, given those drawn (`from` to `to`, for a roving tabindex); each kept by its key
 * (its place by default); `more` for a list without an end; `x` for a row; `at`, one drawn and scrolled to whenever it changes.
 * @typedef {{ count: number, draw: (i: number, from: number, to: number) => unknown, key?: (i: number) => unknown, more?: () => void, x?: boolean, at?: number }} Options
 */

class Virtual extends AsyncDirective {
  from = 0; to = 0; step = 0; gap = 0; lanes = 1; at = -1; queued = 0; lengths = [0, 0]
  /** @type {Options} */ options = { count: 0, draw: () => null }; box = /** @type {HTMLElement | undefined} */ (undefined)
  seen = new ResizeObserver(() => { this.measure(); this.check() })
  queue = () => { this.queued ||= requestAnimationFrame(() => { this.queued = 0; this.check() }) }

  /** @param {Options} options */
  render(options) {
    const { count, draw, key = (/** @type {number} */ i) => i, x } = (this.options = options), { from, to, step, gap, lanes, box } = this
    const lengths = [from / lanes, Math.ceil(count / lanes) - Math.ceil(to / lanes)].map((rows) => rows * step - gap)
    // Each as long as its rows, but for the gap after it, a row of its own in a grid; while the rows change, no shorter than it was,
    // so that a layout before the new ones are in (a row with the keyboard taken out) never pulls the scroll back.
    const size = (/** @type {number[]} */ all) => [box?.firstElementChild, box?.lastElementChild].forEach((end, i) => { if (end instanceof HTMLElement) end.style.cssText = `display: ${all[i] > 0 ? 'block' : 'none'}; flex: none; grid-column: 1 / -1; ${x ? 'inline' : 'block'}-size: ${all[i]}px` })
    size(lengths.map((length, i) => Math.max(length, this.lengths[i]))); queueMicrotask(() => size((this.lengths = lengths)))
    return html`<i aria-hidden="true"></i>${repeat(Array.from({ length: to - from }, (_, i) => from + i), key, (i) => draw(i, from, to))}<i aria-hidden="true"></i>`
  }

  /** @param {import('lit-html').ChildPart} part @param {[Options]} options */
  update(part, [options]) {
    if (!this.box) { this.box = /** @type {HTMLElement} */ (part.parentNode); this.reconnected() }
    const { count, at = -1 } = options, row = (/** @type {number} */ i) => Math.min(count, Math.max(0, i - (i % this.lanes)))
    // Until the first are measured, those from the start; and the one to scroll to, drawn now with those around it.
    ;[this.from, this.to] = this.step ? this.shown(options) : [0, Math.min(count, 12)]
    if (at >= 0 && at !== this.at && (at < this.from || at >= this.to)) [this.from, this.to] = [row(at - 12), row(at + 12 + this.lanes)]
    this.queue(); return this.render(options)
  }

  /** Those in view and a screen's worth either side, whole rows of them, and the row past the last. @param {Options} options */
  shown({ count, x }) {
    const box = /** @type {HTMLElement} */ (this.box), own = getComputedStyle(box)[x ? 'overflowX' : 'overflowY'] !== 'visible', { top, left } = box.getBoundingClientRect()
    const start = own ? Math.abs(x ? box.scrollLeft : box.scrollTop) : -(x ? left : top), size = own ? box[x ? 'clientWidth' : 'clientHeight'] : x ? innerWidth : innerHeight
    const ahead = Math.ceil(size / this.step), end = Math.ceil((start + size) / this.step) + ahead, clamp = (/** @type {number} */ row) => Math.min(count, Math.max(0, row * this.lanes))
    return [clamp(Math.floor(start / this.step) - ahead), clamp(end), end]
  }

  /** The step and lanes read from the first drawn, between the two empty ones, as it first shows and whenever its size changes; to the fraction of a pixel, which hundreds of rows would add up. */
  measure() {
    const box = this.box, first = box && box.children.length > 2 && box.children[1], { x } = this.options
    if (!(first instanceof HTMLElement)) return
    const style = getComputedStyle(/** @type {HTMLElement} */ (box)), gap = (this.gap = parseFloat(x ? style.columnGap : style.rowGap) || 0)
    this.step = first.getBoundingClientRect()[x ? 'width' : 'height'] + gap; this.lanes = !x && style.display === 'grid' ? style.gridTemplateColumns.split(' ').length : 1
  }

  /** The one to scroll to scrolled to, then those to draw now; more asked for once the end is in reach. */
  check() {
    const box = this.box, { at = -1, count, more } = this.options
    if (!box?.isConnected) return; if (!this.step) this.measure()
    if (at !== this.at) { this.at = at; box.children[at - this.from + 1]?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }
    if (!this.step) return void (!count && more?.())
    const [from, to, end] = this.shown(this.options)
    if (from === this.from && to === this.to) return void (more && end * this.lanes >= count && more())
    // As long as before, so where it was scrolled to stays: WebKit moved the drawer by the rows taken out above, at its end. Not the
    // page, which scrolls smoothly, and which putting back would stop.
    let scroller = /** @type {Element | null} */ (box); while (scroller && scroller.scrollHeight <= scroller.clientHeight && scroller.scrollWidth <= scroller.clientWidth) scroller = scroller.parentElement
    const { x } = this.options, where = scroller?.[x ? 'scrollLeft' : 'scrollTop']
    this.from = from; this.to = to; this.setValue(this.render(this.options))
    if (scroller && scroller !== document.scrollingElement && scroller[x ? 'scrollLeft' : 'scrollTop'] !== where) scroller.scrollTo({ [x ? 'left' : 'top']: where, behavior: 'instant' })
    if (more && end * this.lanes >= count) more()
  }

  disconnected() { removeEventListener('scroll', this.queue, true); removeEventListener('resize', this.queue); this.seen.disconnect() }
  reconnected() { addEventListener('scroll', this.queue, { capture: true, passive: true }); addEventListener('resize', this.queue); if (this.box) this.seen.observe(this.box) }
}

/** The list's items, those in view drawn. */
export const virtual = directive(Virtual)
