// SPDX-License-Identifier: MIT
// How creations link, drawn (docs/composition.md#the-map, D764), fetched as a map first opens: the graph's columns (./refs.js `layered()`), its sources at the
// start and each consumer further along, lists side by side in the page's direction, stacked where the map is narrow; each creation a button that opens it,
// its glyph, its name and how it stands, over the lines, drawn between them in SVG once they land and again as they move, as Your data's map is
// (../../ui/map.js): a reference from its source to what shows it, a relation and a form that proposes rows dashed. One pointed at, or holding the keyboard,
// lights its chain, what it uses and what uses it as far as they go, the rest dimmed; the arrows walk the links, along them and in a column.
import { html, svg, render, nothing } from 'lit-html'
import { layered, further } from './refs.js'
import { t } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'

/** @import { Edge } from './refs.js' */
/**
 * What a map draws: its creations and the links between them, the one it is about (`here`), those a search kept (`lit`, all of them when null), and for each
 * its name, glyph, the lines of how it stands, those that say it shows nothing, and how it opens.
 * @typedef {{ places: string[], edges: Edge[], here?: string, lit?: Set<string> | null, name: (place: string) => string, glyph: (place: string) => unknown, said: (place: string) => string[], alert?: (place: string) => Set<string>, open: (place: string) => unknown }} Drawing
 */

/** Where a line goes, from one creation's button to another's, in the map's frame: across between two columns, else round their start side. @param {DOMRect} a @param {DOMRect} b @param {DOMRect} box @param {boolean} rtl */
function way(a, b, box, rtl) {
  const [y1, y2] = [a.y + a.height / 2 - box.y, b.y + b.height / 2 - box.y], apart = a.right < b.left || b.right < a.left
  const [x1, x2] = (apart ? (a.right < b.left ? [a.right, b.left] : [a.left, b.right]) : rtl ? [a.right, b.right] : [a.left, b.left]).map((x) => x - box.x)
  const bend = apart ? (x1 + x2) / 2 : (rtl ? Math.max(x1, x2) : Math.min(x1, x2)) + (rtl ? 1 : -1) * Math.min(40, 14 + Math.abs(y2 - y1) / 8)
  return `M${x1} ${y1}C${bend} ${y1} ${bend} ${y2} ${x2} ${y2}`
}
/** A creation's button among those a map holds. @param {Element} map @param {string} place @returns {HTMLButtonElement | null} */
const buttonOf = (map, place) => map.querySelector(`button[data-place="${CSS.escape(place)}"]`)
/** The place a button stands for, from an event inside the map. @param {Event} event */
const placeOf = (event) => /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest?.('button[data-place]'))?.dataset.place ?? ''
let made = 0

customElements.define('app-links-map', class extends HTMLElement {
  seen = new ResizeObserver(() => this.lines())
  arrow = `links-arrow-${++made}`
  /** @type {Drawing | undefined} */
  drawing
  set data(/** @type {Drawing} */ drawing) { this.drawing = drawing; this.draw() } connectedCallback() { this.seen.observe(this) } disconnectedCallback() { this.seen.disconnect() }
  /** Its columns, then its lines once they land: a form's from the site to the collection it proposes into, any other from what is used to what uses it. */
  draw() {
    const one = this.drawing
    if (!one) return
    const start = (/** @type {Edge} */ edge) => (edge.kind === 'form' ? edge.from : edge.to), end = (/** @type {Edge} */ edge) => (edge.kind === 'form' ? edge.to : edge.from)
    render(html`<svg class="links-lines" aria-hidden="true"><defs><marker id=${this.arrow} viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 8 4 0 8z"/></marker></defs>
      ${one.edges.map((edge) => svg`<path data-from=${start(edge)} data-to=${end(edge)} class=${edge.kind ? 'is-dashed' : ''} marker-end=${edge.kind === 'relation' ? nothing : `url(#${this.arrow})`}/>`)}</svg>
      <div class="links-columns" @pointerover=${(/** @type {Event} */ e) => placeOf(e) && this.light(placeOf(e))} @focusin=${(/** @type {Event} */ e) => this.light(placeOf(e))} @keydown=${(/** @type {KeyboardEvent} */ e) => this.walk(e)}
        @pointerleave=${() => this.light(/** @type {HTMLElement | null} */ (this.querySelector('button:focus'))?.dataset.place ?? '')} @focusout=${(/** @type {FocusEvent} */ e) => this.contains(/** @type {Node | null} */ (e.relatedTarget)) || this.light('')}>
        ${layered(one.edges, one.places).map((column) => html`<ul>${column.map((place) => html`<li class="${place === one.here ? 'is-here' : ''} ${one.lit && !one.lit.has(place) ? 'is-dim' : ''}"><button type="button" data-place=${place} @click=${() => one.open(place)}>
          ${one.glyph(place)}<span dir="auto">${one.name(place)}</span>${one.said(place).map((line) => html`<small dir="auto" class=${one.alert?.(place).has(line) ? 'is-alert' : ''}>${line}</small>`)}</button></li>`)}</ul>`)}</div>`, this)
    requestAnimationFrame(() => this.lines())
  }
  lines() {
    const box = this.getBoundingClientRect(), rtl = getComputedStyle(this).direction === 'rtl'
    for (const path of /** @type {NodeListOf<SVGPathElement>} */ (this.querySelectorAll('.links-lines path[data-from]'))) ((a, b) => a && b && path.setAttribute('d', way(a, b, box, rtl)))(buttonOf(this, path.dataset.from ?? '')?.getBoundingClientRect(), buttonOf(this, path.dataset.to ?? '')?.getBoundingClientRect())
  }
  /** A creation's chain lit, what it uses and what uses it as far as they go, the rest dimmed; none with no place. @param {string} place */
  light(place) {
    const edges = this.drawing?.edges ?? [], chain = place ? new Set([place, ...edges.flatMap((edge) => (edge.from === place ? [edge.to] : edge.to === place ? [edge.from] : [])), ...[...further(edges, place, true), ...further(edges, place, false)].map(([one]) => one)]) : null
    this.toggleAttribute('data-chain', Boolean(chain))
    for (const button of /** @type {NodeListOf<HTMLElement>} */ (this.querySelectorAll('button[data-place]'))) button.parentElement?.classList.toggle('is-chain', Boolean(chain?.has(button.dataset.place ?? '')))
    for (const path of /** @type {NodeListOf<SVGPathElement>} */ (this.querySelectorAll('path[data-from]'))) path.classList.toggle('is-chain', Boolean(chain?.has(path.dataset.from ?? '') && chain.has(path.dataset.to ?? '')))
  }
  /** The arrows: up and down in a column, and along a link toward what uses it (the page's way) or back toward what it uses, to the nearest. @param {KeyboardEvent} event */
  walk(event) {
    const place = placeOf(event), button = place ? buttonOf(this, place) : null, rtl = getComputedStyle(this).direction === 'rtl', key = event.key
    if (!button || !this.drawing) return
    const column = [...button.closest('ul')?.querySelectorAll('button') ?? []], at = column.indexOf(/** @type {HTMLButtonElement} */ (button)), y = (/** @type {Element} */ one) => one.getBoundingClientRect().y
    const along = key === (rtl ? 'ArrowLeft' : 'ArrowRight'), back = key === (rtl ? 'ArrowRight' : 'ArrowLeft'), linked = this.drawing.edges.flatMap((edge) => (along && edge.to === place ? [edge.from] : back && edge.from === place ? [edge.to] : []))
    const to = key === 'ArrowDown' ? column[at + 1] : key === 'ArrowUp' ? column[at - 1] : linked.map((one) => buttonOf(this, one)).filter((one) => one !== null).sort((a, b) => Math.abs(y(a) - y(button)) - Math.abs(y(b) - y(button)))[0]
    if (to) event.preventDefault(), to.focus()
  }
})

/** The map as a page shows it, named as the links menu is. @param {Drawing} drawing */
export const drawn = (drawing) => html`<app-links-map role="group" aria-label=${t('compose.links')} .data=${drawing}></app-links-map>`

/** The map about one creation, in a sheet over the page under its name: a creation pressed opens, the sheet closing. @param {string} title @param {Drawing} drawing */
export async function sheet(title, drawing) {
  await import('../../ui/dialogs.js')
  const dialog = Object.assign(document.createElement('dialog'), { className: 'sheet links-sheet' })
  dialog.setAttribute('aria-label', title), dialog.addEventListener('close', () => dialog.remove()), document.body.append(dialog)
  render(html`<header class="dialog-head"><h2 dir="auto">${title}</h2><button type="button" class="icon-button" aria-label=${t('action.close')} @click=${() => dialog.close()}>${icons.close}</button></header>
    ${drawn({ ...drawing, open: (place) => (dialog.close(), drawing.open(place)) })}`, dialog)
  dialog.showModal()
}
