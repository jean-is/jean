// SPDX-License-Identifier: MIT
// A prototype beside the task (D742), <app-prototype>, in two views. Try it, as it opens: the one live frame, a site's (../sites/frame.js),
// in the shape it was made for, with its looks, its words retyped and its parts pointed at (D741) and the brain's version waiting (D505),
// its links and forms carrying their choices; ahead of its bar, Back, Start over and the page on show with its place, and at its end Build
// it, which asks Jean for the app it shows; beside it on a wide pane, a strip of its pages, the one on show marked, each a still picture
// (./press.js) by its name. All pages: the same pages on a board without edges, moved by a drag, the wheel or the keys and zoomed about
// the pointer, a column per step from the first page as pressing through found them (./check.js), each under the control that leads to it
// and over its name, its place and where it leads on, words that keep their size. Either way the pages are one Tab stop whose arrows move
// among them, Enter or a click showing the page in Try it. Neither draws a frame of its own: the pictures are drawn one at a time.
import { html, svg, nothing, render } from 'lit-html'
import { t, locale } from '../../core/i18n.js'
import { noteRecord } from '../../core/events.js'
import { send } from '../../ui/send.js'
import { assistantName } from '../../ui/state.js'
import { icon, icons } from '../../ui/menu-icons.js'
import { still } from '../../ui/sheet.js'
import { unescape } from '../sites/html.js'
import { stepsOf, named } from './check.js'
import { picture } from './press.js'
import '../sites/frame.js'

/** A prototype on show: a site's, its frame's name, and what pressing through found. @typedef {import('../sites/frame.js').Shown & { label: string, flow?: import('./check.js').Flow }} Prototype */
/** Its live frame, in Try it. @typedef {HTMLElement & { site?: Prototype, page?: string, pointed?: import('../sites/frame.js').Pointed | null, went?: number, go?: (page: string, search?: string) => void, back?: (first?: boolean) => void }} Live */

/** An arrow coming round to where it began: Start over. */
const AGAIN = icon(svg`<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4.5v4h4"/>`)
let made = 0

/** Its pages. @param {Prototype} one */
const pagesOf = (one) => [...one.files.keys()].filter((path) => path.endsWith('.html'))
/** A button that is its drawing, named by its tip. @param {string} label @param {unknown} glyph @param {() => void} run @param {boolean} [off] */
const button = (label, glyph, run, off = false) => html`<button type="button" class="icon-button subtle" aria-label=${label} ?disabled=${off} @click=${run}>${glyph}</button>`

customElements.define('app-prototype', class extends HTMLElement {
  #one = /** @type {Prototype | null} */ (null)
  #given = /** @type {Prototype | null} */ (null)
  #view = 'play'
  #zoom = 0.67; #x = 0; #y = 0
  #fitted = false
  #at = 'index.html'
  #pictures = /** @type {Map<string, string>} */ (new Map())
  #id = `proto-${++made}`
  /** What the pane gave last, which lit gives again each time it draws, as it does any object; its frame is told what a prototype's is. @param {Prototype | null} one */
  set prototype(one) {
    if (one === this.#given) return
    if (one?.path !== this.#one?.path) (this.#view = 'play'), (this.#at = 'index.html'), (this.#fitted = false), this.#pictures.clear()
    this.#given = one
    this.#one = one && { ...one, lead: this.lead, hint: t('prototypes.pressable'), own: t('prototypes.own') }
    this.isConnected && this.draw()
  }
  /** Its live frame, in Try it. @returns {Live | null} */
  get #live() { return this.#view === 'play' ? this.querySelector('app-site') : null }
  /** For the note a message comes with (../sites/kind.js), as a site's view: the prototype as it is now, its page on show, the part pointed at. */
  get site() { return this.#live?.site ?? this.#one }
  get page() { return this.#live?.page ?? this.#at }
  get pointed() { return this.#live?.pointed ?? null }

  connectedCallback() { this.draw() }

  /** A page's title, else its name. @param {string} page */
  #title(page) { return unescape(/<title[^>]*>([^<]*)<\/title>/i.exec(new TextDecoder().decode(this.site?.files.get(page) ?? new Uint8Array()))?.[1].trim() ?? '') || page }

  /** Ahead of Try it's bar: Back, Start over, and the page on show with its place, which opens All pages; and last in it, Build it. @param {Live} live @param {boolean} [last] */
  lead = (live, last) => {
    if (last) return html`<button type="button" class="button primary" @click=${this.build}>${t('prototypes.build')}</button>`
    const one = this.#one, all = one ? stepsOf(pagesOf(one), one.flow).steps.flat() : [], i = Math.max(0, all.indexOf(live.page ?? '')), number = new Intl.NumberFormat(locale.value)
    return html`<span class="proto-nav">${button(t('prototypes.back'), icons.back, () => live.back?.(), !live.went)}${button(t('prototypes.restart'), AGAIN, () => live.back?.(true))}
      <button type="button" class="button subtle proto-place" title=${t('prototypes.board')} @click=${() => this.show('board')}><b dir="auto">${named(all.map((page) => this.#title(page)))[i]}</b>
        <span>${t('prototypes.page', { n: number.format(i + 1), count: number.format(all.length) })}</span></button></span>`
  }

  /** Build it: Jean is asked for the app the prototype shows, one that works, and given every file of it, as its skill says to build one; the pane makes way where it covers the conversation. */
  build = () => {
    const one = /** @type {Prototype} */ (this.site), files = [...one.files].filter(([path]) => /\.(html|css|js)$/.test(path)).map(([path, bytes]) => `${path}\n\`\`\`\n${new TextDecoder().decode(bytes)}\n\`\`\``)
    send(t('prototypes.building', { name: one.name }), { notes: [noteRecord(`The user asks you to build the prototype ${one.name} (${one.path}) for real. Read the skills prototype and app if they aren't above, and follow the first's part “Build it for real”. Every file of the prototype:\n\n${files.join('\n\n')}`, { kind: 'prototype', uri: one.path })] })
    if (document.documentElement.dataset.dock === 'over') import('../../ui/preview.js').then(({ unshow }) => unshow(one.path))
  }

  /**
   * A view: Try it, on a page; or the board, the page that was on show picked. Between the two, where motion is welcome, the page's picture
   * grows into its frame, or its frame comes down to its picture: a view transition (prototypes.css), the two marked only while it lasts,
   * and the frame's page awaited a moment, its second load, so that what the picture becomes is the page. @param {string} view @param {string} [page]
   */
  show(view, page) {
    const turn = () => {
      const live = this.#live, was = this.#view
      // What Try it changed (a look picked, words retyped) stays on the board.
      if (view === 'board' && live?.site && this.#one) (this.#at = live.page ?? this.#at), (this.#one = { ...this.#one, files: live.site.files })
      ;(this.#view = view), this.draw()
      const now = this.#live, at = page ?? this.#at
      if (now && at !== now.page) now.go?.(at, this.#one?.flow?.at?.[at] ?? '')
      now ? page && was === 'board' && now.querySelector('iframe')?.focus() : this.reach(this.querySelector(`.proto-page[data-page="${CSS.escape(this.#at)}"]`))
    }
    // The page pressed is the one picked, whose picture grows.
    if (page && view === 'play') (this.#at = page), this.draw(false)
    if (view === this.#view || still() || !document.startViewTransition) return turn()
    const end = () => this.removeAttribute('data-turning'), turned = document.startViewTransition(async () => { turn(); const frame = this.querySelector('iframe'); if (frame) await new Promise((done) => { let loads = 0; frame.addEventListener('load', () => ++loads > 1 && done(0)); setTimeout(done, 400) }) })
    turned.ready.catch(() => {}), turned.finished.then(end, end), this.toggleAttribute('data-turning', true)
  }

  /** The board moved by so much: it has no edges. @param {number} x @param {number} y */
  pan(x, y) { this.style.setProperty('--x', `${(this.#x += x)}px`); this.style.setProperty('--y', `${(this.#y += y)}px`) }

  /** A page of the board given the keys, and the board moved so that it shows whole, where it can. @param {Element | null} page */
  reach(page) { if (page instanceof HTMLElement) { page.focus({ preventScroll: true }); const at = page.getBoundingClientRect(), room = /** @type {Element} */ (page.closest('.proto-board')).getBoundingClientRect(); this.pan(Math.max(0, room.left + 24 - at.left) || Math.min(0, room.right - 24 - at.right), Math.max(0, room.top + 24 - at.top) || Math.min(0, room.bottom - 24 - at.bottom)) } }

  /**
   * The board zoomed a step in or out, or to a level, about a point of the window, its own middle unless one is given: what was under the
   * point stays under it, as nearly as words that keep their size allow. @param {number} by @param {number} [to] @param {{ x: number, y: number }} [at]
   */
  zoom(by, to, at) {
    const room = this.querySelector('.proto-board')?.getBoundingClientRect(), steps = this.querySelector('.proto-steps'), was = steps?.getBoundingClientRect(), on = at ?? (room && { x: room.x + room.width / 2, y: room.y + room.height / 2 })
    this.#zoom = Math.max(0.2, Math.min(2, to ?? this.#zoom * 1.25 ** by))
    this.draw(false)
    const now = steps?.getBoundingClientRect()
    if (was?.width && now && on) this.pan(on.x - now.x - (on.x - was.x) / was.width * now.width, on.y - now.y - (on.y - was.y) / was.height * now.height)
  }

  /** The board zoomed so that every step shows across it, or one on a narrow pane, its pictures never past their own size, and set in its middle, or under its top where it is taller. */
  fit() {
    const board = this.querySelector('.proto-board'), steps = /** @type {HTMLElement | null} */ (this.querySelector('.proto-steps')), shot = board?.querySelector('.proto-page :is(img, .proto-blank)')
    if (!board || !steps || !shot) return
    // What doesn't zoom across it: the words' room and the gaps between its steps, or around one page where they are one column.
    const column = getComputedStyle(steps).flexDirection === 'column', count = column ? 1 : steps.children.length, wide = shot.getBoundingClientRect().width, around = (column ? /** @type {Element} */ (shot.parentElement) : steps).getBoundingClientRect().width - count * wide
    const fits = (board.clientWidth - 48 - around) / (count * wide / this.#zoom)
    if (Number.isFinite(fits) && fits > 0) this.zoom(0, Math.min(1, fits))
    const all = steps.getBoundingClientRect(), room = board.getBoundingClientRect()
    this.pan(room.x + (room.width - all.width) / 2 - all.x, room.y + Math.max(24, (room.height - all.height) / 2) - all.y)
  }

  /** On the board, arrows along the flow (mirrored right to left) and within a step, the board following, and +, − and 0 zoom; in the strip, one step, arrows up and down it; Home and End. @param {KeyboardEvent} event */
  keys = (event) => {
    const one = this.#one, board = this.#view === 'board'
    if (event.altKey || event.ctrlKey || event.metaKey || !one) return
    const nearer = board && /** @type {Record<string, number>} */ ({ '+': 1, '=': 1, '-': -1, '−': -1 })[event.key]
    if (nearer || (board && event.key === '0')) return event.preventDefault(), nearer ? this.zoom(nearer) : this.fit()
    const from = /** @type {HTMLElement} */ (event.target).closest?.('.proto-page')?.getAttribute('data-page')
    if (!from) return
    const laid = stepsOf(pagesOf(one), one.flow).steps, steps = board ? laid : [laid.flat()], c = steps.findIndex((step) => step.includes(from)), r = steps[c].indexOf(from), back = getComputedStyle(this).direction === 'rtl' ? -1 : 1
    const to = /** @type {Record<string, number[]>} */ ({ ArrowRight: [c + back, r], ArrowLeft: [c - back, r], ArrowDown: [c, r + 1], ArrowUp: [c, r - 1], Home: [0, 0], End: [steps.length - 1, Infinity] })[event.key]
    if (!to) return
    event.preventDefault()
    const step = steps[Math.max(0, Math.min(steps.length - 1, to[0]))], page = step[Math.max(0, Math.min(step.length - 1, to[1]))], next = /** @type {HTMLElement | null} */ (this.querySelector(`.proto-page[data-page="${CSS.escape(page)}"]`))
    // The board's page with the keys is the one Tab comes back to; the strip's stays the page on show.
    if (board) (this.#at = page), this.draw(false), this.reach(next)
    else next?.focus()
  }

  /** The wheel, or two fingers on a touchpad, moves the board; with Ctrl or ⌘, as a pinch sends, it zooms about the pointer little by little, by how far it turned: a wheel's notch, a tenth. */
  wheel = { handleEvent: (/** @type {WheelEvent} */ event) => { event.preventDefault(); event.ctrlKey || event.metaKey ? this.zoom(0, this.#zoom * Math.exp(Math.max(-25, Math.min(25, -event.deltaY)) / 250), event) : this.pan(-event.deltaX, -event.deltaY) }, passive: false }

  /** Dragging the board's ground moves it, as the wheel and the keys do. @param {PointerEvent} event */
  drag = (event) => {
    const board = /** @type {HTMLElement} */ (event.currentTarget)
    if (event.button !== 0 || /** @type {HTMLElement} */ (event.target).closest('.proto-page')) return
    const from = { x: event.clientX, y: event.clientY }, move = (/** @type {PointerEvent} */ next) => { this.pan(next.clientX - from.x, next.clientY - from.y); Object.assign(from, { x: next.clientX, y: next.clientY }) }
    board.setPointerCapture(event.pointerId)
    board.addEventListener('pointermove', move)
    board.addEventListener('pointerup', () => board.removeEventListener('pointermove', move), { once: true })
  }

  /** Its pages' pictures, each drawn one at a time where its page changed (./press.js keeps them), in its shape, the view drawn again as each comes. */
  async #draw() {
    const one = this.#one
    for (const page of one ? stepsOf(pagesOf(one), one.flow).steps.flat() : []) {
      if (!one || this.#one !== one) return
      const shot = await picture(one.files, page, one.flow?.at?.[page] ?? '', one.shape === 'computer')
      if (shot !== this.#pictures.get(page) && this.#one === one) this.#pictures.set(page, shot), this.draw(false)
    }
  }

  /** Try it with its strip, or the board under its bar. @param {boolean} [more] whether to draw the pictures it lacks */
  draw(more = true) {
    const one = this.#one
    if (!one) return
    this.dataset.shape = one.shape ?? 'phone'
    const { steps, on, by } = stepsOf(pagesOf(one), one.flow), all = steps.flat(), names = named(all.map((page) => this.#title(page))), name = assistantName(), board = this.#view === 'board'
    const number = new Intl.NumberFormat(locale.value), list = new Intl.ListFormat(locale.value, { type: 'conjunction' }), percent = new Intl.NumberFormat(locale.value, { style: 'percent' })
    const changed = (/** @type {string} */ page) => one.mine && String(one.mine.get(page)) !== String(one.files.get(page)), [width, height] = one.shape === 'computer' ? [1280, 800] : [390, 844]
    this.style.setProperty('--zoom', String(this.#zoom))
    /** A page: on the board, under the control that leads to it; its picture over its name; then its place and where it leads on, which the strip keeps for screen readers. */
    const card = (/** @type {string} */ page) => {
      const i = all.indexOf(page), to = on(page), picture = this.#pictures.get(page)
      return html`<li>${board ? html`<p class="proto-by">${by[page] ? t('prototypes.press', { control: by[page][1] }) : nothing}</p>` : nothing}
        <button type="button" class="proto-page" data-page=${page} tabindex=${page === this.#at ? 0 : -1} aria-current=${!board && page === this.#at ? 'page' : nothing} aria-describedby=${`${this.#id}-said-${i}`}
          @click=${() => this.show('play', page)} @focus=${() => { if (board) this.#at = page }}>${picture ? html`<img src=${picture} alt="" width=${width} height=${height}>` : html`<span class="proto-blank"></span>`}<span class="proto-title" dir="auto">${names[i]}</span></button>
        <p class="proto-says" id=${`${this.#id}-said-${i}`}><span class=${board ? '' : 'visually-hidden'}>${t('prototypes.page', { n: number.format(i + 1), count: number.format(all.length) })}${to.length
          ? html`<br>${t('prototypes.leads', { pages: list.format(to.map((next) => names[all.indexOf(next)])) })}` : nothing}</span>${changed(page) ? html`<strong>${t('prototypes.changed', { name })}</strong>` : nothing}</p></li>`
    }
    render(board ? html`<div class="proto-bar">
        <span class="segmented" role="radiogroup" aria-label=${t('prototypes.view')}>${['board', 'play'].map((view) => html`<label for=${`${this.#id}-${view}`}><input id=${`${this.#id}-${view}`} type="radio"
          name=${this.#id} .checked=${view === 'board'} @change=${() => this.show(view)}><span>${t(`prototypes.${view}`)}</span></label>`)}</span>
        <span class="proto-zoom">${button(t('prototypes.zoomOut'), '−', () => this.zoom(-1))}<output role="status">${t('prototypes.zoom', { level: percent.format(this.#zoom) })}</output>
          ${button(t('prototypes.zoomIn'), '+', () => this.zoom(1))}<button type="button" class="button subtle" @click=${() => this.fit()}>${t('prototypes.fit')}</button></span>
      </div>
      <div class="proto-board" role="region" aria-label=${t('prototypes.pages', { name: one.name })} @keydown=${this.keys} @wheel=${this.wheel} @pointerdown=${this.drag}>
        <div class="proto-steps">${steps.map((step) => html`<ol class="proto-step">${step.map(card)}</ol>`)}</div></div>`
      : html`<div class="proto-play"><div class="proto-strip"><button type="button" class="button subtle" @click=${() => this.show('board')}>${icons.board}${t('prototypes.board')}</button>
          <ol aria-label=${t('prototypes.pages', { name: one.name })} @keydown=${this.keys}>${all.map(card)}</ol></div>
        <app-site class="beside" .site=${one} @input=${() => { this.#at = this.#live?.page ?? this.#at; this.draw(false) }}></app-site></div>`, this)
    if (board && !this.#fitted) (this.#fitted = true), this.fit()
    if (more) this.#draw().catch(console.warn)
  }
})
