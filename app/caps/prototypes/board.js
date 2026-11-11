// A prototype beside the task (D742), <app-prototype>, in two views. All pages: its pages side by side on a board that pans and zooms, a
// column per step from the first page as pressing through found them, each a still picture (./press.js) over its title, its place and where
// it leads, in words; one Tab stop whose arrows move along the flow and within a step, Enter or a click opening the page in Try it. Try it:
// the one live frame, a site's (../sites/frame.js), with its looks, widths, words retyped and parts pointed at (D741) and the brain's version
// waiting (D505), its links and forms carrying their choices. The board draws no frame of its own: its pictures are drawn one at a time.
import { html, nothing, render } from 'lit-html'
import { ref } from 'lit-html/directives/ref.js'
import { t, locale } from '../../core/i18n.js'
import { assistantName } from '../../ui/state.js'
import { unescape } from '../sites/html.js'
import { picture } from './press.js'
import '../sites/frame.js'

/** A prototype on show: a site's, its frame's name, and what pressing through found. @typedef {import('../sites/frame.js').Shown & { label: string, flow?: import('./check.js').Flow & { at?: Record<string, string> } }} Prototype */

const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5]
let made = 0

/** Its pages in steps, a column each from the first page, in the order pressing through reached them; those nothing reaches last. @param {Prototype} one */
function stepsOf(one) {
  const pages = [...one.files.keys()].filter((path) => path.endsWith('.html')), order = [...(one.flow?.reached ?? []), ...pages.sort()].filter((path, i, all) => pages.includes(path) && all.indexOf(path) === i)
  const leads = new Map(one.flow?.leads ?? []), depth = new Map([['index.html', 0]]), queue = ['index.html']
  for (let page; (page = queue.shift());) for (const to of leads.get(page) ?? []) if (!depth.has(to)) depth.set(to, /** @type {number} */ (depth.get(page)) + 1), queue.push(to)
  const last = Math.max(...depth.values()) + 1, steps = /** @type {string[][]} */ ([])
  for (const page of order) (steps[depth.get(page) ?? last] ??= []).push(page)
  return { steps: steps.filter(Boolean), leads }
}

customElements.define('app-prototype', class extends HTMLElement {
  #one = /** @type {Prototype | null} */ (null)
  #given = /** @type {Prototype | null} */ (null)
  #view = 'board'
  #zoom = 0.67
  #fitted = false
  #at = 'index.html'
  #pictures = /** @type {Map<string, string>} */ (new Map())
  #id = `proto-${++made}`
  /** What the pane gave last, which lit gives again each time it draws, as it does any object. @param {Prototype | null} one */
  set prototype(one) {
    if (one === this.#given) return
    if (one?.path !== this.#one?.path) (this.#view = 'board'), (this.#at = 'index.html'), (this.#fitted = false), this.#pictures.clear()
    this.#given = this.#one = one
    this.isConnected && this.draw()
  }
  get prototype() { return this.#one }
  /** Its live frame, in Try it. @returns {(HTMLElement & { site?: Prototype, page?: string, pointed?: import('../sites/frame.js').Pointed | null, go?: (page: string, search?: string) => void }) | null} */
  get #live() { return this.#view === 'play' ? this.querySelector('app-site') : null }
  /** For the note a message comes with (../sites/kind.js), as a site's view: the prototype as it is now, its page on show, the part pointed at. */
  get site() { return this.#live?.site ?? this.#one }
  get page() { return this.#live?.page ?? this.#at }
  get pointed() { return this.#live?.pointed ?? null }

  connectedCallback() { this.draw() }

  /** A page's title, else its name. @param {string} page */
  #title(page) { return unescape(/<title[^>]*>([^<]*)<\/title>/i.exec(new TextDecoder().decode(this.site?.files.get(page) ?? new Uint8Array()))?.[1].trim() ?? '') || page }

  /** A view: the board, its page on show in Try it picked; or Try it, on a page. @param {string} view @param {string} [page] */
  show(view, page) {
    const live = this.#live
    // What Try it changed (a look picked, words retyped) stays on the board.
    if (view === 'board' && live?.site && this.#one) (this.#at = live.page ?? this.#at), (this.#one = { ...this.#one, files: live.site.files })
    this.#view = view
    this.draw(view === 'board')
    if (view === 'play') {
      const live = this.#live, at = page ?? this.#at
      if (!live) return
      if (at !== 'index.html' || this.#one?.flow?.at?.[at]) live.go?.(at, this.#one?.flow?.at?.[at] ?? '')
      if (page) live.querySelector('iframe')?.focus()
    } else /** @type {HTMLElement | null} */ (this.querySelector(`.proto-page[data-page="${CSS.escape(this.#at)}"]`))?.focus()
  }

  /** The board zoomed a step in or out, or to a level. @param {number} by @param {number} [to] */
  zoom(by, to) {
    const at = ZOOMS.findIndex((level) => level >= this.#zoom - 0.001)
    this.#zoom = to ?? ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (at < 0 ? ZOOMS.length - 1 : at) + by))]
    this.draw(false)
  }

  /** The board zoomed so that every page shows, or every step's width on a narrow pane, never past its own size. */
  fit() {
    const board = this.querySelector('.proto-board'), steps = /** @type {HTMLElement | null} */ (this.querySelector('.proto-steps'))
    if (!board || !steps) return
    const box = steps.getBoundingClientRect(), [width, height] = [box.width / this.#zoom, box.height / this.#zoom], narrow = getComputedStyle(steps).flexDirection === 'column'
    const room = (board.clientWidth - 48) / width, fits = narrow ? room : Math.min(room, (board.clientHeight - 48) / height)
    if (Number.isFinite(fits) && fits > 0) this.zoom(0, Math.max(ZOOMS[0], Math.min(1, fits)))
  }

  /** Arrows along the flow (mirrored right to left) and within a step, Home and End; +, − and 0 zoom. @param {KeyboardEvent} event */
  keys = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (['+', '='].includes(event.key)) return event.preventDefault(), this.zoom(1)
    if (['-', '−'].includes(event.key)) return event.preventDefault(), this.zoom(-1)
    if (event.key === '0') return event.preventDefault(), this.fit()
    const from = /** @type {HTMLElement} */ (event.target).closest?.('.proto-page')?.getAttribute('data-page')
    if (!from || !this.#one) return
    const { steps } = stepsOf(this.#one), c = steps.findIndex((step) => step.includes(from)), r = steps[c].indexOf(from), back = getComputedStyle(this).direction === 'rtl' ? -1 : 1
    const to = { ArrowRight: [c + back, r], ArrowLeft: [c - back, r], ArrowDown: [c, r + 1], ArrowUp: [c, r - 1], Home: [0, 0], End: [steps.length - 1, Infinity] }[event.key]
    if (!to) return
    event.preventDefault()
    const step = steps[Math.max(0, Math.min(steps.length - 1, to[0]))], page = step[Math.max(0, Math.min(step.length - 1, to[1]))]
    this.#at = page
    this.draw(false)
    const next = /** @type {HTMLElement | null} */ (this.querySelector(`.proto-page[data-page="${CSS.escape(page)}"]`))
    next?.focus()
  }

  /** Ctrl or ⌘ with the wheel, as a pinch on a touchpad sends, zooms. */
  wheel = { handleEvent: (/** @type {WheelEvent} */ event) => { if (event.ctrlKey || event.metaKey) event.preventDefault(), this.zoom(event.deltaY < 0 ? 1 : -1) }, passive: false }

  /** Dragging the board's ground pans it, as its scrollbars and the keys do. @param {PointerEvent} event */
  drag = (event) => {
    const board = /** @type {HTMLElement} */ (event.currentTarget)
    if (event.button !== 0 || /** @type {HTMLElement} */ (event.target).closest('.proto-page')) return
    const [x, y, left, top] = [event.clientX, event.clientY, board.scrollLeft, board.scrollTop], move = (/** @type {PointerEvent} */ next) => { board.scrollLeft = left - (next.clientX - x); board.scrollTop = top - (next.clientY - y) }
    board.setPointerCapture(event.pointerId)
    board.addEventListener('pointermove', move)
    board.addEventListener('pointerup', () => board.removeEventListener('pointermove', move), { once: true })
  }

  /** Its pages' pictures, each drawn one at a time where its page changed (./press.js keeps them), the board drawn again as each comes. */
  async #draw() {
    const one = this.#one
    for (const page of one ? stepsOf(one).steps.flat() : []) {
      if (!one || this.#one !== one || this.#view !== 'board') return
      const shot = await picture(one.files, page, one.flow?.at?.[page] ?? '')
      if (shot !== this.#pictures.get(page) && this.#one === one) this.#pictures.set(page, shot), this.#view === 'board' && this.draw(false)
    }
  }

  /** Its bar, then the board or Try it. @param {boolean} [more] whether to draw the pictures it lacks */
  draw(more = true) {
    const one = this.#one
    if (!one) return
    const { steps, leads } = stepsOf(one), all = steps.flat(), name = assistantName()
    const number = new Intl.NumberFormat(locale.value), list = new Intl.ListFormat(locale.value, { type: 'conjunction' }), percent = new Intl.NumberFormat(locale.value, { style: 'percent' })
    const changed = (/** @type {string} */ page) => one.mine && String(one.mine.get(page)) !== String(one.files.get(page))
    const zoomed = ref((steps) => steps instanceof HTMLElement && steps.style.setProperty('zoom', String(this.#zoom)))
    const button = (/** @type {string} */ label, /** @type {string} */ glyph, /** @type {() => void} */ run) => html`<button type="button" class="button subtle" aria-label=${label} @click=${run}><span aria-hidden="true">${glyph}</span></button>`
    render(html`<div class="proto-bar">
        <span class="segmented" role="radiogroup" aria-label=${t('prototypes.view')}>${['board', 'play'].map((view) => html`<label for=${`${this.#id}-${view}`}><input id=${`${this.#id}-${view}`} type="radio"
          name=${this.#id} .checked=${this.#view === view} @change=${() => this.show(view)}><span>${t(`prototypes.${view}`)}</span></label>`)}</span>
        ${this.#view === 'board' ? html`<span class="proto-zoom">${button(t('prototypes.zoomOut'), '−', () => this.zoom(-1))}<output role="status">${t('prototypes.zoom', { level: percent.format(this.#zoom) })}</output>
          ${button(t('prototypes.zoomIn'), '+', () => this.zoom(1))}<button type="button" class="button subtle" @click=${() => this.fit()}>${t('prototypes.fit')}</button></span>` : nothing}
      </div>
      ${this.#view === 'board' ? html`<div class="proto-board" role="region" aria-label=${t('prototypes.pages', { name: one.name })} @keydown=${this.keys} @wheel=${this.wheel} @pointerdown=${this.drag}>
        <div class="proto-steps" ${zoomed}>${steps.map((step, c) => html`${c ? html`<span class="proto-arrow" aria-hidden="true">→</span>` : nothing}<ol class="proto-step">${step.map((page) => {
          const i = all.indexOf(page), to = [...leads.get(page) ?? []].filter((one) => all.includes(one)), picture = this.#pictures.get(page)
          return html`<li><button type="button" class="proto-page" data-page=${page} tabindex=${page === this.#at ? 0 : -1} aria-describedby=${`${this.#id}-said-${i}`} @click=${() => this.show('play', page)}
              @focus=${() => { this.#at = page }}>${picture ? html`<img src=${picture} alt="" width="390" height="844">` : html`<span class="proto-blank"></span>`}<span class="proto-title" dir="auto">${this.#title(page)}</span></button>
            <p class="proto-says" id=${`${this.#id}-said-${i}`}>${t('prototypes.page', { n: number.format(i + 1), count: number.format(all.length) })}${to.length ? html`<br>${t('prototypes.leads', { pages: list.format(to.map((one) => this.#title(one))) })}` : nothing}${changed(page)
              ? html`<br><strong>${t('prototypes.changed', { name })}</strong>` : nothing}</p></li>`
        })}</ol>`)}</div></div>` : html`<app-site class="beside" .site=${one}></app-site>`}`, this)
    if (this.#view === 'board' && !this.#fitted) (this.#fitted = true), requestAnimationFrame(() => this.fit())
    if (more && this.#view === 'board') this.#draw().catch(console.warn)
  }
})
