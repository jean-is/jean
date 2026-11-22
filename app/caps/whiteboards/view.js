// SPDX-License-Identifier: MIT
// A whiteboard beside the conversation (D747), <app-whiteboard>: its name, how it is shown (Whiteboard, Lanes or Table, in the address),
// and Jean's changes counted with Accept all and Reject all (D505). As a whiteboard: one board that only pans and zooms, the same for
// everyone (./layout.js), its sections each a <section> with its heading, a list of its notes and New note; what lies on the open ground;
// drawn lines as pictures a person names; the bar at its foot (the pointer, Note, Text, Section, Draw, the zoom), which turns, while notes
// are selected, into what to do with them; and under it the shelf, where notes are written and wait. A note is dragged, or moved with its
// grip and the arrows, or by its menu, and a drop settles on the fine grid, in a section or out of every one. The notes are one Tab stop,
// the arrows going from note to note by where they lie. What a person writes is a draft until it is left, and a note being dragged is held
// still, whatever comes meanwhile. Under 60% the board is marked far, and notes show their first words larger.
import { html, svg, nothing, render } from 'lit-html'
import { ref } from 'lit-html/directives/ref.js'
import { keyed } from 'lit-html/directives/keyed.js'
import { signal, effect, computed } from '@preact/signals-core'
import { t, intlLocales } from '../../core/i18n.js'
import { ulid } from '../../core/ulid.js'
import { assistantName, app } from '../../ui/state.js'
import { slots } from '../../ui/caps.js'
import { send } from '../../ui/send.js'
import { reviewBar } from '../../ui/review.js'
import { icons, icon } from '../../ui/menu-icons.js'
import { still } from '../../ui/sheet.js'
import { load, change, unkept, accept, reject, undoStep, reshapeTable, watched, wayOf } from '../tables/tables.js'
import { notesOf, ownProblem, kindOf } from '../tables/table.js'
import { fold } from '../tables/changes.js'
import { layout, snap, arrowPath, placeOf, footOf, NOTE, GRID, HUES, WIDE } from './layout.js'
import { all, show } from '../../ui/creations.js'
import { save, pictureOf } from '../../ui/save.js'
import { svgOf } from './picture.js'
import { beside, picked, writing, onShow } from './whiteboards.js'
import { view as tableOf } from '../tables/view.js'

/** @typedef {import('../tables/tables.js').Loaded} Loaded */
/** @typedef {import('../tables/changes.js').Row} Row */
/** @typedef {import('./layout.js').Item} Item */
/** @typedef {import('./layout.js').Area} Area */
/** What a press on the board makes, or what it does. @typedef {'pointer' | 'note' | 'text' | 'section' | 'arrow' | 'draw' | 'erase'} Tool */
/** What is being written, a row or a new one where it will lie: its words as typed. @typedef {{ row?: string, kind: 'note' | 'text' | 'area', area: string | null, x: number, y: number, words: string, shelf?: boolean }} Draft */

const GRIP = icon(svg`<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g>`)
const POINTER = icon(svg`<path d="M6 3.5l12 8.5-5.5 1.2 3.2 6-2.4 1.3-3.2-6L6 18.5z"/>`)
const NOTE_GLYPH = icon(svg`<path d="M5 4.5h14v10l-5 5H5zM14 19.5v-5h5"/>`)
const TEXT = icon(svg`<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>`)
const SECTION = icon(svg`<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9.5h17"/>`)
const ARROW = icon(svg`<path d="M5 19 19 5M10 5h9v9"/>`)
const DRAW = icon(svg`<path d="M4 20c3-1 5-6 8-9s5-6 7-5-1 4-4 7-6 4-6 6 3 1 5 0"/>`)
const ERASE = icon(svg`<path d="M8.5 19.5h11M4.8 14.7l8.5-8.5a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8l-7.3 7.3H8.5L4.8 15.5a.6.6 0 0 1 0-.8z"/>`)
/** The inks a line takes: the board's ink, then three of the sections' colours. */
const INKS = /** @type {const} */ (['ink', 0, 2, 5])
let made = 0

/** Sets a thing's place and size on the board, in its units, through the CSS object model (Trusted Types and the policy forbid style attributes). @param {{ x: number, y: number, w?: number, h?: number }} box */
const placed = (box) => ref((element) => {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return
  for (const [key, value] of Object.entries({ x: box.x, y: box.y, w: box.w, h: box.h })) if (value !== undefined) element.style.setProperty(`--${key}`, `${value}px`)
})
/** A line's points as an SVG path. @param {number[]} path */
const pathOf = (path) => path.reduce((d, n, i) => `${d}${i % 2 ? ' ' : i ? ' L' : 'M'}${n}`, '')
/** A note's words, its first line, for what names it. @param {Row} row */
const wordsOf = (row) => String(row.cells.note ?? '').trim()
/** The creation a note's words are the place of, among those Creations lists, whose card it shows. @param {Row} [row] */
const cardOf = (row) => ((place) => (place ? all.value.find((one) => one.link.uri === place || one.path === place) : undefined))(row && kindOf(row) === 'note' && placeOf(row.cells.note))
/** What names a row in what is said: its words, the creation it shows, or that it is a drawing. @param {Row} [row] */
const nameOf = (row) => cardOf(row)?.name || (row && wordsOf(row)) || t('whiteboards.line')
/**
 * A menu's row: the menu closed, then what the row does a frame later, so that one that takes its menu's anchor away never runs as the
 * menu closes, which WebKit can't bear (ui/creations-page.js's `away`). @param {() => unknown} act
 */
const menuRow = (act) => (/** @type {Event} */ event) => { /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[popover]'))?.hidePopover(); requestAnimationFrame(() => setTimeout(act)) }
/** @param {Element | null} element */
const rowOf = (element) => element?.closest('[data-row]')?.getAttribute('data-row') ?? null

customElements.define('app-whiteboard', class extends HTMLElement {
  /** @type {(() => void)[]} */
  holds = []
  where = signal(/** @type {Loaded | null} */ (null))
  #id = `wb-${++made}`
  #zoom = 1; #x = 0; #y = 0; #fitted = false
  /** Whether the person moved the board since it was fitted, which leaves it where they put it as the pane changes size; and how many rows it had. */
  #held = false; #count = 0
  /** Where the board was last moved to, as its pan and zoom. */
  #moved = ''
  /** @type {Tool} */
  #tool = 'pointer'
  /** @type {typeof INKS[number]} */
  #ink = 'ink'
  /** How it shows, which the address keeps by its place (Tables' wayOf): '' as a board, its lanes, as a table, or one section's notes as a table, `table/<id>`. */
  as = signal('')
  /** @type {Draft | null} */
  #draft = null
  #selected = /** @type {Set<string>} */ (new Set())
  /** The note the arrows start from, and the one moved with the keys: where it was, and where it is now. */
  #at = ''
  /** @type {{ row: string, from: { x: number, y: number }, x: number, y: number } | null} */
  #moving = null
  #said = ''
  /** The drawn line on its way, in board units, and the box being drawn around notes. @type {number[] | null} */
  #stroke = null
  /** @type {{ x: number, y: number, w: number, h: number } | null} */
  #box = null
  /** Where the next press puts what a tool makes, said by the menu's Move here; what an arrow being drawn starts from. @type {string | null} */
  #moveHere = null
  /** @type {string | null} */
  #from = null
  /** The arrow whose head is being pointed elsewhere, from its menu; and the first thing the Tab key reaches on the board. @type {string | null} */
  #rejoining = null
  #stop = ''
  /** Whether Before is pressed: the board as it was without what waits to be accepted, to look at, not to change. */
  #before = false
  /** One section's notes as a table, as its menu asks: Tables' view of them, made once while it shows. @type {{ area: string, node: Node, holds: (() => void)[] } | null} */
  #table = null
  /** The fingers on the board, for a pinch. @type {Map<number, { x: number, y: number }>} */
  #fingers = new Map()
  /** This person's pointer as Together last said it, and when, at two a second at most. */
  #pointer = { x: 0, y: 0, at: 0 }
  #later = /** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined)
  /** Cards' pictures, drawn only while near the screen, so that a large board's out of sight cost nothing (a deck, an app). */
  #near = new IntersectionObserver((all) => { for (const { target, isIntersecting } of all) this.#paint(/** @type {HTMLElement} */ (target), isIntersecting) }, { rootMargin: '25%' })

  async connectedCallback() {
    const holds = this.holds, folder = this.getAttribute('folder') ?? ''
    const one = await load(folder).catch(() => null)
    if (holds !== this.holds || !this.isConnected || !one) return
    this.where.value = one
    watched(this.where, holds)
    beside.add(this.where)
    onShow.value = [...onShow.peek(), folder]
    holds.push(() => beside.delete(this.where), () => { onShow.value = onShow.peek().filter((one) => one !== folder) }, () => this.#near.disconnect())
    // A narrow pane opens on its lanes, one section at a time, unless the address says otherwise.
    this.as = wayOf(folder).as
    if (!this.as.peek() && this.clientWidth && this.clientWidth < 30 * parseFloat(getComputedStyle(document.documentElement).fontSize)) this.as.value = 'lanes'
    holds.push(effect(() => { this.where.value; this.as.value; writing.value; this.draw() }))
    this.addEventListener('toggle', this.#placed, true)
    this.addEventListener('beforetoggle', this.#filled, true)
    holds.push(() => this.removeEventListener('toggle', this.#placed, true), () => this.removeEventListener('beforetoggle', this.#filled, true))
    const sized = new ResizeObserver(() => { if (!this.#held && !this.as.peek()) this.fit() })
    sized.observe(this)
    holds.push(() => sized.disconnect())
    holds.push(() => { this.as.value = '' })
    // Worked on together: the others' pointers, drawn on a layer of their own, and this person's, gone with the pane.
    const together = slots('pointers')[0], path = `${one.dir}/${one.folder}`
    if (together) holds.push(computed(() => together.of(path)).subscribe((list) => this.#others(list)), () => { clearTimeout(this.#later); together.say(path, null) })
  }

  /**
   * This person's pointer said to the others, with the note they write and the box around what they selected, at two a second at most, the
   * last place always going. @param {{ x: number, y: number }} at
   */
  #tell(at) {
    const together = slots('pointers')[0], one = this.where.peek()
    if (!together || !one) return
    Object.assign(this.#pointer, at)
    clearTimeout(this.#later)
    const wait = 500 - (Date.now() - this.#pointer.at)
    if (wait > 0) return void (this.#later = setTimeout(() => this.#tell(this.#pointer), wait))
    this.#pointer.at = Date.now()
    const { items } = layout(one.rows), chosen = items.filter((item) => this.#selected.has(item.row.id)), box = chosen.length ? [Math.min(...chosen.map((item) => item.x)), Math.min(...chosen.map((item) => item.y)), Math.max(...chosen.map((item) => item.x + item.w)), Math.max(...chosen.map((item) => item.y + item.h))] : []
    together.say(`${one.dir}/${one.folder}`, [[Math.round(at.x), Math.round(at.y), this.#draft?.row ?? ''], box.map(Math.round)])
  }

  /**
   * The others on the board: each one's pointer in their colour with their name, moving smoothly between what their copy says, a box around
   * what they selected, and a ring in their colour on the note they write. @param {{ who: string, name: string, colour: string, spots: any[] }[]} list
   */
  #others(list) {
    const layer = /** @type {HTMLElement | null} */ (this.querySelector('.wb-others'))
    for (const ringed of this.querySelectorAll('[data-writing]')) ringed.removeAttribute('data-writing')
    const valid = list.filter(({ spots: [at, box] }) => [at[0], at[1]].every(Number.isFinite) && (box.length === 0 || (box.length === 4 && box.every(Number.isFinite))))
    for (const { colour, spots: [[, , writing]] } of valid) {
      const note = writing && this.querySelector(`[data-row="${CSS.escape(String(writing))}"]`)
      if (note instanceof HTMLElement) note.setAttribute('data-writing', ''), note.style.setProperty('--badge', colour)
    }
    // Who is here, and where, in the head: their faces open a list, each with Go there, which brings the board to them once.
    const people = /** @type {HTMLElement | null} */ (this.querySelector('.wb-people')), one = this.where.peek(), areas = one ? layout(one.rows).areas : []
    const face = (/** @type {string} */ name, /** @type {string} */ colour) => html`<span class="wb-face" ${ref((element) => element instanceof HTMLElement && element.style.setProperty('--badge', colour))}>${[...name][0] ?? ''}</span>`
    if (people) render(valid.length ? html`<button type="button" class="button subtle wb-faces" aria-label=${t('whiteboards.here', { count: valid.length })} popovertarget=${`${this.#id}-people`}>${valid.slice(0, 4).map(({ name, colour }) => face(name, colour))}</button>
      <div id=${`${this.#id}-people`} class="menu wb-menu" popover><ul>${valid.map(({ name, colour, spots: [[x, y]] }) => ((area) => html`<li class="wb-person">${face(name, colour)}<span><bdi>${name}</bdi><small>${area ? t('whiteboards.inSection', { section: wordsOf(area.row) }) : t('whiteboards.onBoard')}</small></span>
        <button type="button" class="button subtle" @click=${menuRow(() => this.#go(x, y))}>${t('whiteboards.goThere')}</button></li>`)([...areas].reverse().find((area) => x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h)))}</ul></div>` : nothing, people)
    if (layer) render(valid.map(({ who, name, colour, spots: [[x, y], box] }) => keyed(who, html`<div class="wb-pointer" ${ref((element) => element instanceof HTMLElement && (element.style.setProperty('--x', `${x}px`), element.style.setProperty('--y', `${y}px`), element.style.setProperty('--badge', colour)))}>${POINTER}<bdi>${name}</bdi></div>
      ${box.length === 4 ? html`<div class="wb-theirs" ${placed({ x: box[0], y: box[1], w: box[2] - box[0], h: box[3] - box[1] })} ${ref((element) => element instanceof HTMLElement && element.style.setProperty('--badge', colour))}></div>` : nothing}`)), layer)
  }

  disconnectedCallback() {
    for (const hold of [...this.holds, ...this.#table?.holds ?? []]) hold()
    this.holds = []
    this.#table = null
  }

  /**
   * A menu opened, placed under its button as the screen shows it, or over it where there is no room, inside the window: CSS anchoring
   * measures a button before the board's zoom, so it would put the menu where the button would be at 100%. @param {Event} event
   */
  #placed = (event) => {
    const menu = /** @type {HTMLElement} */ (event.target)
    if (!menu.matches?.('.wb-menu') || /** @type {ToggleEvent} */ (event).newState !== 'open') return
    const at = this.querySelector(`[popovertarget="${CSS.escape(menu.id)}"]`)?.getBoundingClientRect(), { offsetWidth: w, offsetHeight: h } = menu
    if (!at) return
    const top = at.bottom + 4 + h > innerHeight - 8 ? Math.max(8, at.top - 4 - h) : at.bottom + 4, start = getComputedStyle(menu).direction === 'rtl' ? innerWidth - at.right : at.left
    menu.style.setProperty('--top', `${top}px`)
    menu.style.setProperty('--at', `${Math.max(8, Math.min(start, innerWidth - w - 8))}px`)
    menu.toggleAttribute('data-placed', true)
  }

  /**
   * The board as a picture to keep, a PNG, the whole of it or the part in view, in the look as it is, at most 16 million pixels: its
   * colours read from the look by an element of each kind, out of sight, its words in the faces they show in. @param {boolean} [inView]
   */
  async picture(inView = false) {
    const one = this.#one, probe = this.appendChild(Object.assign(document.createElement('div'), { className: 'wb-probe' }))
    probe.style.setProperty('background', 'var(--room)')
    render(html`<div class="wb-board"></div><i class="wb-note"></i><i class="wb-count"></i><svg class="wb-ink"></svg>${Array.from({ length: HUES }, (_, i) => html`<div class=${`wb-area wb-hue-${i}`}><i class="wb-note"></i><svg class=${`wb-ink wb-hue-${i}`}></svg></div>`)}`, probe)
    const style = (/** @type {string} */ selector) => getComputedStyle(/** @type {Element} */ (probe.querySelector(selector)))
    const palette = { room: getComputedStyle(probe).backgroundColor, board: style('.wb-board').backgroundColor, ink: style(':scope > .wb-ink').color, soft: style('.wb-count').color, wait: style(':scope > .wb-note').backgroundColor,
      hues: Array.from({ length: HUES }, (_, i) => ({ area: style(`.wb-hue-${i}`).backgroundColor, edge: style(`.wb-hue-${i}`).borderTopColor, note: style(`.wb-hue-${i} .wb-note`).backgroundColor, ink: style(`.wb-hue-${i} .wb-ink`).color })) }
    probe.remove()
    const room = this.querySelector('.wb-board')?.getBoundingClientRect(), [a, b] = room ? [this.#point({ clientX: room.left, clientY: room.top }), this.#point({ clientX: room.right, clientY: room.bottom })] : []
    const { svg, w, h } = svgOf(one.rows, { dir: one.table.dir, palette, font: getComputedStyle(this).fontFamily, words: nameOf, columns: one.table.properties, locales: intlLocales(), ...(inView && a && b && { view: { x: Math.min(a.x, b.x), y: a.y, w: Math.abs(b.x - a.x), h: b.y - a.y } }) })
    const k = Math.min(1, Math.sqrt(4e6 / (w * h)))
    save(await pictureOf(svg, Math.round(w * k), Math.round(h * k)), `${one.table.name}.png`)
  }

  /**
   * A card's picture in its box while the box is near the screen, gone once it isn't, drawn again if the note shows another; observed from
   * its first drawing, which lit makes before the box is in the page. @param {HTMLElement} box @param {boolean} [near]
   */
  #paint(box, near = box.hasAttribute('data-near')) {
    if (!box.isConnected) return this.#near.unobserve(box)
    const card = cardOf(this.#row(rowOf(box) ?? '')), place = near && card ? card.link.uri : ''
    box.toggleAttribute('data-near', near)
    if ((box.dataset.drawn ?? '') === place) return
    render(card && place ? card.kind.preview?.(card) ?? card.kind.draw() : nothing, box)
    box.dataset.drawn = place
  }

  /** A note's or a text's menu, filled as it opens: a board of hundreds keeps one menu's rows, not hundreds. @param {Event} event */
  #filled = (event) => {
    const menu = /** @type {HTMLElement} */ (event.target), row = this.#row(menu.dataset?.menu ?? ''), one = this.#one
    if (!row || /** @type {ToggleEvent} */ (event).newState !== 'open') return
    render(this.#menu(one, row, !this.#before && unkept(one).some((line) => line.row === row.id), layout(one.rows).areas), menu)
  }

  /** A section's notes as a table, read again with each change, or none. @param {string} area */
  #section(area) {
    if (this.#table?.area === area) return this.#table.node
    for (const hold of this.#table?.holds ?? []) hold()
    const holds = /** @type {(() => void)[]} */ ([]), where = computed(() => ((one) => one && { ...one, rows: one.rows.filter((row) => row.cells.area === area) })(this.where.value))
    this.#table = { area, holds, node: tableOf(holds, /** @type {any} */ (where)) }
    return this.#table.node
  }

  /** @returns {Loaded} */
  get #one() { return /** @type {Loaded} */ (this.where.peek()) }
  get #rtl() { return this.#one.table.dir === 'rtl' }

  /** Says what happened, in the status region. @param {string} text */
  say(text) { this.#said = text; this.draw() }

  /** A change of the person's own, one step to undo; what goes wrong is said. @param {{ row?: string, set?: Record<string, unknown>, delete?: boolean }[]} edits */
  async edit(edits) {
    try { return await change(this.#one, edits, 'user') } catch (error) { console.warn('Whiteboard', error); this.say(t('whiteboards.wrong')); return [] }
  }

  // ─── The board's place and zoom ───────────────────────────────────────────────

  get #layer() { return /** @type {HTMLElement | null} */ (this.querySelector('.wb-layer')) }
  /** The board moved and zoomed as it is now, without drawing it again. */
  #turn() {
    const board = /** @type {HTMLElement | null} */ (this.querySelector('.wb-board'))
    if (!board) return
    // On the layer and the dots alone: a custom property set on the board would restyle each of its thousands of elements at each step. The dots stay
    // 40 to 80 pixels apart at any zoom, on the board's own points, those between them coming in as they part.
    Object.assign(/** @type {HTMLElement} */ (this.#layer).style, { translate: `${this.#x}px ${this.#y}px`, scale: String(this.#zoom) })
    const dots = this.#zoom / 2 ** Math.floor(Math.log2(this.#zoom)), lay = (/** @type {number} */ step) => `${this.#rtl ? `calc(100% + ${this.#x + step / 2}px)` : `${this.#x - step / 2}px`} ${this.#y - step / 2}px / ${step}px ${step}px`; board.style.background = `radial-gradient(circle, var(--line-strong) 1px, transparent 1.5px) ${lay(40 * dots)}, radial-gradient(circle, color-mix(in oklab, var(--line-strong) ${(dots - 1) * 100}%, transparent) 1px, transparent 1.5px) ${lay(20 * dots)} var(--line)`
    board.toggleAttribute('data-far', this.#zoom < 0.6)
    // A menu opened over the board stays where its button was: it closes as the board moves, not as it is drawn again.
    const at = `${this.#x} ${this.#y} ${this.#zoom}`
    if (at !== this.#moved) for (const menu of board.querySelectorAll('.wb-layer .wb-menu:popover-open')) /** @type {HTMLElement} */ (menu).hidePopover()
    this.#moved = at
    // Its level, in a span lit leaves alone.
    for (const level of this.querySelectorAll('.wb-level span')) level.textContent = new Intl.NumberFormat(intlLocales(), { style: 'percent' }).format(this.#zoom)
  }
  /** @param {number} x @param {number} y */
  pan(x, y) { this.#x += x; this.#y += y; this.#turn() }
  /** A point of the window in board units, from the board's start corner. @param {{ clientX: number, clientY: number }} event */
  #point(event) {
    const at = this.#layer?.getBoundingClientRect() ?? { left: 0, top: 0 }
    return { x: (this.#rtl ? at.left - event.clientX : event.clientX - at.left) / this.#zoom, y: (event.clientY - at.top) / this.#zoom }
  }
  /**
   * Zoomed a step in or out, or to a level, about a point of the window, the board's middle unless one is given: what was under it stays
   * under it. @param {number} by @param {number} [to] @param {{ clientX: number, clientY: number }} [at]
   */
  zoom(by, to, at) {
    const room = this.querySelector('.wb-board')?.getBoundingClientRect()
    if (!room) return
    const on = at ?? { clientX: room.x + room.width / 2, clientY: room.y + room.height / 2 }, was = this.#point(on)
    this.#zoom = Math.max(0.15, Math.min(2, to ?? this.#zoom * 1.25 ** by))
    this.#turn()
    const now = this.#point(on)
    this.pan((now.x - was.x) * this.#zoom * (this.#rtl ? -1 : 1), (now.y - was.y) * this.#zoom)
  }
  /** Everything in view, at its own size where it fits, else smaller; on an empty board, its corner. */
  fit() {
    const room = this.querySelector('.wb-board')?.getBoundingClientRect(), { bounds } = layout(this.#one.rows)
    if (!room) return
    // What floats over the board, its head and its dock, covers none of it.
    const top = Math.max(24, (this.querySelector('.wb-head')?.getBoundingClientRect().bottom ?? room.top) - room.top + 16), under = Math.max(24, room.bottom - (this.querySelector('.wb-dock')?.getBoundingClientRect().top ?? room.bottom) + 16), high = room.height - top - under
    this.#zoom = Math.max(0.15, Math.min(1, (room.width - 48) / bounds.w, high / bounds.h))
    this.#x = (this.#rtl ? -1 : 1) * ((room.width - bounds.w * this.#zoom) / 2 - bounds.x * this.#zoom)
    this.#y = top + Math.max(0, (high - bounds.h * this.#zoom) / 2) - bounds.y * this.#zoom
    this.#turn()
  }
  /** The wheel or two fingers move the board; with Ctrl or ⌘, as a pinch sends, it zooms about the pointer. */
  wheel = { handleEvent: (/** @type {WheelEvent} */ event) => { event.preventDefault(); this.#held = true; event.ctrlKey || event.metaKey ? this.zoom(0, this.#zoom * Math.exp(Math.max(-25, Math.min(25, -event.deltaY)) / 250), event) : this.pan(-event.deltaX, -event.deltaY) }, passive: false }

  // ─── Pressing and dragging ────────────────────────────────────────────────────

  /**
   * A press on the board: with a tool, what it makes, there; on a note, a drag that moves it, or a press that gives it the keys; Shift with
   * a press, a note added to what is selected, or on the ground a box around notes; on the ground, the board moved; two fingers pan and
   * pinch. @param {PointerEvent} event
   */
  down = (event) => {
    const target = /** @type {HTMLElement} */ (event.target)
    if (event.button !== 0 || target.closest('button:not(.wb-words), input, textarea, select, .wb-bar, [popover]')) return
    const board = /** @type {HTMLElement} */ (event.currentTarget), at = this.#point(event), row = rowOf(target)
    // Two fingers pinch: the board zooms about their middle and moves with it.
    if (event.pointerType === 'touch' && board.matches('.wb-board')) {
      this.#fingers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      board.addEventListener('pointerup', (/** @type {PointerEvent} */ up) => this.#fingers.delete(up.pointerId), { once: true })
      if (this.#fingers.size === 2) return this.#pinch(board)
    }
    // On the shelf, only a note dragged out of it.
    if (board.matches('.wb-shelf')) return void (row && target.closest('.wb-note') && this.#drag(event, board, /** @type {HTMLElement} */ (target.closest('.wb-note')), row))
    if (this.#moveHere) return void this.#drop(this.#moveHere, at, event)
    const kind = row ? kindOf(this.#row(row) ?? { cells: {} }) : ''
    if (this.#tool === 'arrow' || this.#from) return void (row && kind !== 'arrow' ? this.#arrow(event, board, row) : ((this.#from = this.#rejoining = null), this.draw()))
    if (this.#tool === 'draw') return this.#draw(event, board, at)
    if (this.#tool === 'erase') return void ((kind === 'line' || kind === 'arrow') && this.erase([/** @type {string} */ (row)]).then(() => kind === 'line' && this.say(t('whiteboards.erased'))))
    if (this.#tool !== 'pointer') return void this.#make(this.#tool, at)
    if (row && event.shiftKey) return void (this.#selected.has(row) ? this.#selected.delete(row) : this.#selected.add(row), this.draw())
    if (kind === 'arrow') return this.#end(event, board, /** @type {string} */ (row), at)
    const item = row && target.closest('.wb-note, .wb-text, .wb-line, .wb-area-head')
    if (item) return this.#drag(event, board, /** @type {HTMLElement} */ (item), /** @type {string} */ (row))
    if (event.shiftKey) return this.#boxing(event, board, at)
    const from = { x: event.clientX, y: event.clientY }, move = (/** @type {PointerEvent} */ next) => { if (this.#fingers.size < 2) this.pan(next.clientX - from.x, next.clientY - from.y); Object.assign(from, { x: next.clientX, y: next.clientY }) }
    if (this.#selected.size) this.#selected.clear(), this.draw()
    this.#held = true
    board.setPointerCapture(event.pointerId)
    board.addEventListener('pointermove', move)
    board.addEventListener('pointerup', () => board.removeEventListener('pointermove', move), { once: true })
  }

  /** A pinch, while two fingers stay: the board zoomed by how far apart they go, about their middle, which it follows. @param {HTMLElement} board */
  #pinch(board) {
    const middle = () => { const [a, b] = [...this.#fingers.values()]; return { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2, apart: Math.hypot(a.x - b.x, a.y - b.y) || 1 } }
    let last = middle()
    this.#held = true
    const move = (/** @type {PointerEvent} */ event) => {
      if (!this.#fingers.has(event.pointerId) || this.#fingers.size < 2) return
      this.#fingers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const now = middle()
      this.pan(now.clientX - last.clientX, now.clientY - last.clientY)
      this.zoom(0, this.#zoom * now.apart / last.apart, now)
      last = now
    }
    const end = () => { if (this.#fingers.size < 2) board.removeEventListener('pointermove', move) }
    board.addEventListener('pointermove', move)
    board.addEventListener('pointerup', end, { once: true })
  }

  /** The board brought to a place, its middle there, once; nothing follows anyone. @param {number} x @param {number} y */
  #go(x, y) {
    const room = this.querySelector('.wb-board')?.getBoundingClientRect()
    if (!room) return
    const middle = this.#point({ clientX: room.x + room.width / 2, clientY: room.y + room.height / 2 })
    this.#held = true
    this.pan((middle.x - x) * this.#zoom * (this.#rtl ? -1 : 1), (middle.y - y) * this.#zoom)
  }

  /** @param {string} id */
  #row(id) { return this.#one.rows.find((row) => row.id === id) }

  /**
   * A note, a text, a line or a section's head dragged: held still under the pointer, whatever comes meanwhile, then dropped where it lies
   * when let go; a press that hardly moves gives it the keys. @param {PointerEvent} event @param {HTMLElement} board @param {HTMLElement} item @param {string} row
   */
  #drag(event, board, item, row) {
    const from = { x: event.clientX, y: event.clientY }, moved = { x: 0, y: 0 }, held = item.closest('.wb-area') && item.matches('.wb-area-head') ? /** @type {HTMLElement} */ (item.closest('.wb-area')) : item, card = cardOf(this.#row(row))
    let going = false, pressed = false
    const scale = held.closest('.wb-layer') ? this.#zoom : 1
    // On touch, a long press that hardly moves opens its menu.
    const long = event.pointerType === 'touch' ? setTimeout(() => { if (!going) (pressed = true), /** @type {HTMLElement | null} */ (item.querySelector('[popover]') ?? held.querySelector(':scope > h3 [popover]'))?.showPopover() }, 550) : undefined
    const move = (/** @type {PointerEvent} */ next) => {
      Object.assign(moved, { x: next.clientX - from.x, y: next.clientY - from.y })
      if (pressed || (!going && Math.hypot(moved.x, moved.y) < 4)) return
      clearTimeout(long)
      going = true
      held.toggleAttribute('data-held', true)
      this.querySelector('.wb-shelf')?.toggleAttribute('data-dragging', true)
      // In the board's layer, a step of the pointer is a step of the board's, zoomed.
      held.style.setProperty('--dx', `${moved.x / scale}px`)
      held.style.setProperty('--dy', `${moved.y / scale}px`)
    }
    const up = (/** @type {PointerEvent} */ last) => {
      board.removeEventListener('pointermove', move)
      clearTimeout(long)
      if (pressed) return
      const box = held.getBoundingClientRect(), shelf = this.querySelector('.wb-shelf')?.getBoundingClientRect()
      held.removeAttribute('data-held')
      this.querySelector('.wb-shelf')?.removeAttribute('data-dragging')
      held.style.removeProperty('--dx'), held.style.removeProperty('--dy')
      // A press that hardly moves gives it the keys, or opens the creation whose card it shows.
      if (!going) return void (card ? show(card)() : (this.#at = row, this.draw(), /** @type {HTMLElement | null} */ (this.querySelector(`[data-row="${row}"] .wb-words`))?.focus()))
      const onShelf = shelf && last.clientY > shelf.top && last.clientY < shelf.bottom && last.clientX > shelf.left && last.clientX < shelf.right
      this.#drop(row, this.#point({ clientX: this.#rtl ? box.right : box.left, clientY: box.top }), last, Boolean(onShelf))
    }
    board.setPointerCapture(event.pointerId)
    board.addEventListener('pointermove', move)
    board.addEventListener('pointerup', up, { once: true })
  }

  /**
   * Something dropped with its corner at `at`: a section where it is put, its notes with it; a note, a text or a line in the section it lies
   * over, at its place there, or on the ground, or back on the shelf, losing its section and its place. @param {string} id @param {{ x: number, y: number }} at
   * @param {{ clientX: number, clientY: number }} [pointer] @param {boolean} [shelf]
   */
  async #drop(id, at, pointer, shelf = false) {
    const row = this.#row(id)
    this.#moveHere = null
    if (!row) return
    const x = snap(at.x), y = snap(at.y)
    if (kindOf(row) === 'area') return void (await this.edit([{ row: id, set: { '@spot': { area: null, x, y } } }]), this.say(t('whiteboards.moved', { name: wordsOf(row) })))
    if (shelf && kindOf(row) === 'note') return void (await this.edit([{ row: id, set: { area: null, '@spot': null } }]), this.say(t('whiteboards.shelved', { name: wordsOf(row) })))
    const { into, set } = this.#placing(at)
    await this.edit([{ row: id, set }])
    this.say(into ? t('whiteboards.movedTo', { name: nameOf(row), section: wordsOf(into.row) }) : t('whiteboards.onGround', { name: nameOf(row) }))
    if (pointer) this.#at = id
  }

  /** The section a point lies in, the one on top. @param {{ x: number, y: number }} at */
  #under(at) { return [...layout(this.#one.rows).areas].reverse().find((area) => at.x >= area.x && at.x <= area.x + area.w && at.y >= area.y && at.y <= area.y + area.h) }
  /** Where a note with its corner at `at` goes, on the fine grid: the section its middle lies in, at its place there, or the open board. @param {{ x: number, y: number }} at */
  #placing(at) {
    const into = this.#under({ x: at.x + NOTE.w / 2, y: at.y + NOTE.h / 2 })
    return { into, set: into ? { area: into.row.id, '@spot': { area: into.row.id, x: snap(at.x - into.x), y: snap(at.y - into.y) } } : { area: null, '@spot': { area: null, x: snap(at.x), y: snap(at.y) } } }
  }

  /** A Creations card over the board, which takes it. @param {DragEvent} event */
  over = (event) => { if (event.dataTransfer?.types.some((type) => type.startsWith('text/x-creation'))) event.preventDefault() }
  /** A Creations card dropped on the board: a note where it lands, whose words are its place, which shows its card. @param {DragEvent} event */
  landed = async (event) => {
    const place = placeOf(event.dataTransfer?.getData('text/x-creation-block') || event.dataTransfer?.getData('text/x-creation')), card = place && all.peek().find((one) => one.link.uri === place || one.path === place)
    if (!card) return
    event.preventDefault()
    const at = this.#point(event), { into, set } = this.#placing({ x: at.x - NOTE.w / 2, y: at.y - NOTE.h / 2 })
    await this.edit([{ set: { note: `[[${card.link.uri}|${card.name.replace(/[[\]|\n]+/g, ' ')}]]`, ...set } }])
    this.say(into ? t('whiteboards.movedTo', { name: card.name, section: wordsOf(into.row) }) : t('whiteboards.onGround', { name: card.name }))
  }

  /** What a tool makes at a place: a note or a text written there, or a section named there; the tool then back to the pointer. @param {Tool} tool @param {{ x: number, y: number }} at */
  #make(tool, at) {
    const into = tool === 'section' ? undefined : this.#under(at)
    this.#draft = { kind: tool === 'section' ? 'area' : tool === 'text' ? 'text' : 'note', area: into?.row.id ?? null, x: snap(at.x - (into?.x ?? 0)), y: snap(at.y - (into?.y ?? 0)), words: '' }
    this.#tool = 'pointer'
    this.draw()
    requestAnimationFrame(() => /** @type {HTMLElement | null} */ (this.querySelector('.wb-draft textarea, .wb-draft input'))?.focus())
  }

  /** A line drawn while Draw is pressed, kept as points from its own corner, thinned, once it is finished. @param {PointerEvent} event @param {HTMLElement} board @param {{ x: number, y: number }} at */
  #draw(event, board, at) {
    const points = [Math.round(at.x), Math.round(at.y)]
    this.#stroke = points
    const lo = { x: at.x, y: at.y }, hi = { x: at.x, y: at.y }
    const move = (/** @type {PointerEvent} */ next) => {
      const p = this.#point(next), [x, y] = points.slice(-2)
      if (Math.hypot(p.x - x, p.y - y) < 3 || points.length >= 4000) return
      points.push(Math.round(p.x), Math.round(p.y))
      Object.assign(lo, { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y) }), Object.assign(hi, { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y) })
      this.#live(pathOf(points), lo, hi)
    }
    board.setPointerCapture(event.pointerId)
    board.addEventListener('pointermove', move)
    board.addEventListener('pointerup', async () => {
      board.removeEventListener('pointermove', move)
      this.#stroke = null
      this.#live('')
      if (points.length < 4) return
      const xs = points.filter((_, i) => i % 2 === 0), ys = points.filter((_, i) => i % 2), x = Math.min(...xs), y = Math.min(...ys)
      const into = this.#under({ x, y }), own = points.map((n, i) => n - (i % 2 ? y : x))
      await this.edit([{ set: { '@kind': 'line', '@path': own, '@ink': this.#ink, ...(into ? { area: into.row.id } : {}), '@spot': { area: into?.row.id ?? null, x: x - (into?.x ?? 0), y: y - (into?.y ?? 0) } } }])
      this.say(t('whiteboards.drawn'))
    }, { once: true })
  }

  /**
   * A line on its way, drawn as it comes in a box as large as its points, which is what a browser paints again as it changes; none once
   * it is done. @param {string} d @param {{ x: number, y: number }} [lo] @param {{ x: number, y: number }} [hi]
   */
  #live(d, lo, hi) {
    const path = this.querySelector('.wb-stroke path'), stroke = path?.closest('svg'), box = lo && hi && { x: Math.floor(lo.x) - 8, y: Math.floor(lo.y) - 8, w: Math.ceil(hi.x - lo.x) + 16, h: Math.ceil(hi.y - lo.y) + 16 }
    for (const key of /** @type {const} */ (['x', 'y', 'w', 'h'])) box ? stroke?.style.setProperty(`--${key}`, `${box[key]}px`) : stroke?.style.removeProperty(`--${key}`)
    if (box) stroke?.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`)
    path?.setAttribute('d', d)
  }

  /**
   * An arrow from what was pressed, following the pointer: let go on another thing, it points there; let go where it was pressed, the next
   * press says where, or Enter on another, or its menu. @param {PointerEvent} event @param {HTMLElement} board @param {string} row
   */
  #arrow(event, board, row) {
    if (this.#from && this.#from !== row) return void this.#link(row)
    this.#from = row
    this.draw()
    const { items, areas } = layout(this.#one.rows), from = [...items, ...areas].find((one) => one.row.id === row)
    if (!from) return
    const start = { x: Math.round(from.x + from.w / 2), y: Math.round(from.y + from.h / 2) }
    const move = (/** @type {PointerEvent} */ next) => { const p = this.#point(next); this.#rubber([start.x, start.y, Math.round(p.x), Math.round(p.y)]) }
    board.setPointerCapture(event.pointerId)
    board.addEventListener('pointermove', move)
    board.addEventListener('pointerup', (/** @type {PointerEvent} */ up) => {
      board.removeEventListener('pointermove', move)
      this.#live('')
      const to = rowOf(document.elementFromPoint(up.clientX, up.clientY))
      to && to !== row ? this.#link(to) : this.say(t('whiteboards.arrowWhere'))
    }, { once: true })
  }

  /** An arrow on its way, from its ends. @param {number[]} ends */
  #rubber(ends) { this.#live(arrowPath(ends), { x: Math.min(ends[0], ends[2]) - 16, y: Math.min(ends[1], ends[3]) - 16 }, { x: Math.max(ends[0], ends[2]) + 16, y: Math.max(ends[1], ends[3]) + 16 }) }

  /**
   * An arrow pressed: near either end, a drag takes that end to what it is let go on, the other staying; a press that hardly moves gives
   * it the keys. @param {PointerEvent} event @param {HTMLElement} board @param {string} id @param {{ x: number, y: number }} at
   */
  #end(event, board, id, at) {
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = layout(this.#one.rows).items.find((one) => one.row.id === id)?.ends ?? [], [tail, head] = [Math.hypot(at.x - x1, at.y - y1), Math.hypot(at.x - x2, at.y - y2)]
    const from = { x: event.clientX, y: event.clientY }, held = this.querySelector(`[data-row="${id}"]`)
    let going = false
    const move = (/** @type {PointerEvent} */ next) => {
      if (Math.min(tail, head) > 32 || (!going && Math.hypot(next.clientX - from.x, next.clientY - from.y) < 4)) return
      going = true
      held?.toggleAttribute('data-ghost', true)
      const p = this.#point(next)
      this.#rubber((head < tail ? [x1, y1, p.x, p.y] : [p.x, p.y, x2, y2]).map(Math.round))
    }
    board.setPointerCapture(event.pointerId)
    board.addEventListener('pointermove', move)
    board.addEventListener('pointerup', (/** @type {PointerEvent} */ up) => {
      board.removeEventListener('pointermove', move)
      held?.removeAttribute('data-ghost')
      this.#live('')
      going ? this.#rejoin(id, rowOf(document.elementFromPoint(up.clientX, up.clientY)), head < tail) : this.#refocus(id)
    }, { once: true })
  }
  /** An arrow's end taken to another thing, its other end staying: one step to undo, and a cell like any other for Together. @param {string} id @param {string | null} to @param {boolean} head */
  async #rejoin(id, to, head) {
    const ends = /** @type {string[]} */ (this.#row(id)?.cells['@ends'] ?? []), end = to ? this.#row(to) : undefined, now = head ? [ends[0], to] : [to, ends[1]]
    if (!end || kindOf(end) === 'arrow' || now[0] === now[1] || String(now) === String(ends)) return this.draw()
    await this.edit([{ row: id, set: { '@ends': now } }])
    this.say(t('whiteboards.arrowMoved', { from: nameOf(this.#row(String(now[0]))), to: nameOf(this.#row(String(now[1]))) }))
  }
  /** An arrow pointed elsewhere, from its menu: its start kept, the next press, Enter or a menu's Point the arrow here says where. @param {string} id */
  #repoint(id) {
    this.#from = String(/** @type {string[]} */ (this.#row(id)?.cells['@ends'] ?? [])[0] ?? '')
    this.#rejoining = id
    this.draw()
    this.say(t('whiteboards.arrowWhere'))
  }

  /** The arrow being drawn, or pointed elsewhere, made to point at a note, a text, a line or a section: a row of its own, unless one already joins them so. @param {string} to */
  async #link(to) {
    const from = this.#from, end = this.#row(to), again = this.#rejoining
    this.#from = this.#rejoining = null
    if (again) return this.#rejoin(again, to, true)
    if (!from || from === to || !this.#row(from) || !end || kindOf(end) === 'arrow') return this.draw()
    if (!this.#one.rows.some((row) => kindOf(row) === 'arrow' && String(row.cells['@ends']) === `${from},${to}`)) await this.edit([{ set: { '@kind': 'arrow', '@ends': [from, to] } }])
    this.say(t('whiteboards.arrowMade', { from: nameOf(this.#row(from)), to: nameOf(end) }))
  }
  /** A menu's row for arrows: one drawn from this, or, while one is, pointing it here. @param {string} id */
  #arrowRow(id) {
    const to = this.#from && this.#from !== id
    return html`<li><button type="button" class="menu-item" @click=${menuRow(() => (to ? this.#link(id) : ((this.#from = id), this.draw(), this.say(t('whiteboards.arrowWhere')))))}>${ARROW}${t(to ? 'whiteboards.arrowTo' : 'whiteboards.arrowFrom')}</button></li>`
  }

  /** Shift with a drag on the ground: a box, and the notes, texts and lines it touches selected. @param {PointerEvent} event @param {HTMLElement} board @param {{ x: number, y: number }} from */
  #boxing(event, board, from) {
    const move = (/** @type {PointerEvent} */ next) => {
      const p = this.#point(next)
      this.#box = { x: Math.min(from.x, p.x), y: Math.min(from.y, p.y), w: Math.abs(p.x - from.x), h: Math.abs(p.y - from.y) }
      this.draw()
    }
    board.setPointerCapture(event.pointerId)
    board.addEventListener('pointermove', move)
    board.addEventListener('pointerup', () => {
      board.removeEventListener('pointermove', move)
      const box = this.#box
      this.#box = null
      if (box) for (const item of layout(this.#one.rows).items) if (item.x < box.x + box.w && item.x + item.w > box.x && item.y < box.y + box.h && item.y + item.h > box.y) this.#selected.add(item.row.id)
      this.draw()
      if (this.#selected.size) this.say(t('whiteboards.selected', { count: this.#selected.size }))
    }, { once: true })
  }

  // ─── Writing ──────────────────────────────────────────────────────────────────

  /** A row's words written again, as a draft until it is left. @param {Row} row */
  write(row) {
    this.#draft = { row: row.id, kind: kindOf(row) === 'area' ? 'area' : kindOf(row) === 'text' ? 'text' : 'note', area: null, x: 0, y: 0, words: wordsOf(row) }
    this.draw()
    requestAnimationFrame(() => { const field = /** @type {HTMLTextAreaElement | null} */ (this.querySelector('.wb-draft textarea, .wb-draft input')); field?.focus(); field?.select() })
  }

  /** The draft left: its words kept where there are some, a new row made for a new one; none for one left empty. @param {boolean} [keep] */
  async leave(keep = true) {
    const draft = this.#draft
    this.#draft = null
    if (!draft || !keep) return this.draw()
    const words = draft.words.trim(), was = draft.row ? this.#row(draft.row) : null
    if (was && words !== wordsOf(was)) await this.edit([{ row: was.id, set: { note: words || null } }])
    else if (!draft.row && (words || draft.kind === 'area')) {
      const set = { note: words || t('whiteboards.untitledSection'), ...(draft.kind !== 'note' && { '@kind': draft.kind }), ...(draft.kind === 'text' && { '@size': 'line' }), ...(draft.area && { area: draft.area }),
        ...(!draft.shelf && { '@spot': { area: draft.area, x: draft.x, y: draft.y } }) }
      const [row] = await this.edit([{ set }])
      if (row) this.#at = row
      this.say(t(draft.kind === 'area' ? 'whiteboards.sectionMade' : 'whiteboards.written'))
    }
    this.draw()
  }

  /** The keys while writing: Enter keeps it (never while an input method composes), Shift with Enter starts a line, Escape leaves it as it was. @param {KeyboardEvent} event */
  writing = (event) => {
    if (event.isComposing) return
    if (event.key === 'Escape') return event.preventDefault(), event.stopPropagation(), this.leave(false)
    if (event.key === 'Enter' && !event.shiftKey) return event.preventDefault(), this.leave()
  }

  /** The shelf's field: Enter keeps a note there and leaves the keys for the next; in a section on show in the lanes, it goes there. @param {KeyboardEvent} event */
  shelved = async (event) => {
    const field = /** @type {HTMLTextAreaElement} */ (event.target)
    if (event.isComposing || event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    const words = field.value.trim()
    if (!words) return
    field.value = ''
    // On a phone's lanes, the section on show takes it; elsewhere it waits on the shelf.
    const area = this.as.peek() === 'lanes' && this.#narrow() ? this.#onShow() : null
    await this.edit([{ set: { note: words, ...(area && { area }) } }])
    this.say(area ? t('whiteboards.movedTo', { name: words, section: wordsOf(/** @type {Row} */ (this.#row(area))) }) : t('whiteboards.waiting', { name: words }))
  }

  /** Whether the pane is under 30rem, where the lanes show one section at a time. */
  #narrow() { return this.clientWidth > 0 && this.clientWidth < 30 * parseFloat(getComputedStyle(document.documentElement).fontSize) }
  /** The lane on show in a phone's lanes: its section's id, or none for the notes in no section. */
  #onShow() {
    const lanes = this.querySelector('.wb-lanes'), all = [...this.querySelectorAll('.wb-lane')], i = lanes && all.length ? Math.round(Math.abs(lanes.scrollLeft) / Math.max(1, lanes.scrollWidth / all.length)) : 0
    return all[Math.min(i, all.length - 1)]?.getAttribute('data-area') || null
  }
  /** A phone's lane brought on show, from its button in the strip, by as far as it lies from the lanes' start, either way round. @param {string} area */
  #bring(area) {
    const lanes = this.querySelector('.wb-lanes'), lane = this.querySelector(`.wb-lane[data-area="${CSS.escape(area)}"]`)
    if (!lanes || !lane) return
    const [box, at] = [lanes.getBoundingClientRect(), lane.getBoundingClientRect()], rtl = getComputedStyle(lanes).direction === 'rtl'
    lanes.scrollBy({ left: rtl ? at.right - box.right : at.left - box.left - parseFloat(getComputedStyle(lanes).paddingInlineStart), behavior: still() ? 'auto' : 'smooth' })
  }
  /** The strip over a phone's lanes says which is on show, as the lanes scroll. */
  #shown = () => {
    const on = this.#onShow() ?? ''
    for (const tab of this.querySelectorAll('.wb-tabs button')) tab.setAttribute('aria-current', String(tab.getAttribute('data-area') === on))
  }

  // ─── Keys ─────────────────────────────────────────────────────────────────────

  /**
   * The keys on the board: the arrows from note to note by where they lie (mirrored right to left), Enter writing one, Delete removing it;
   * while one moves, the arrows move it a step, past its section's edge, Enter dropping it and Escape putting it back; ⌘Z and ⇧⌘Z; + − 0.
   * @param {KeyboardEvent} event
   */
  keys = (event) => {
    const target = /** @type {HTMLElement} */ (event.target), typing = target.matches('input, textarea, select, [contenteditable]')
    if (typing || event.altKey || event.isComposing) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') return event.preventDefault(), undoStep(this.#one, event.shiftKey)
    if (event.metaKey || event.ctrlKey) return
    const step = event.shiftKey ? GRID * 4 : GRID, back = this.#rtl ? -1 : 1
    const arrow = /** @type {Record<string, [number, number]>} */ ({ ArrowRight: [back, 0], ArrowLeft: [-back, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] })[event.key]
    if (this.#moving) {
      event.preventDefault()
      if (arrow) return (this.#moving.x += arrow[0] * step), (this.#moving.y += arrow[1] * step), this.draw()
      if (event.key === 'Enter' || event.key === ' ') { const { row, x, y } = this.#moving; this.#moving = null; return void this.#drop(row, { x, y }).then(() => this.#refocus(row)) }
      if (event.key === 'Escape') { const { row } = this.#moving; this.#moving = null; this.say(t('whiteboards.putBack')); return this.#refocus(row) }
      return
    }
    const nearer = /** @type {Record<string, number>} */ ({ '+': 1, '=': 1, '-': -1, '−': -1 })[event.key]
    if (nearer && !target.closest('.wb-note')) return event.preventDefault(), (this.#held = true), this.zoom(nearer)
    if (event.key === '0' && !target.closest('.wb-note')) return event.preventDefault(), this.fit()
    const row = rowOf(target)
    if (event.key === 'Escape' && (this.#selected.size || this.#from)) return event.preventDefault(), this.#selected.clear(), (this.#from = this.#rejoining = null), this.draw()
    if (!row || !target.matches('.wb-words')) return
    if (event.key === 'Enter' && this.#from) return event.preventDefault(), void this.#link(row)
    if ((event.key === 'Delete' || event.key === 'Backspace')) return event.preventDefault(), this.erase([row])
    if (!arrow) return
    event.preventDefault()
    // The nearest thing that way, a note, a text, a drawing or an arrow, by its middle.
    const { items } = layout(this.#one.rows), found = items.find((item) => item.row.id === row), [dx, dy] = /** @type {[number, number]} */ (arrow).map((n, i) => (i === 0 ? n * back : n))
    const spot = (/** @type {Item} */ item) => ({ item, x: item.x + (item.w - NOTE.w) / 2, y: item.y + (item.h - NOTE.h) / 2 })
    if (!found) return
    const from = spot(found), next = items.filter((item) => item !== found).map(spot).filter((at) => ((at.x - from.x) * dx > 0 || (at.y - from.y) * dy > 0) && (dx ? Math.abs(at.y - from.y) < Math.abs(at.x - from.x) + NOTE.h : Math.abs(at.x - from.x) < Math.abs(at.y - from.y) + NOTE.w))
      .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0]
    if (next) this.#refocus(next.item.row.id)
  }

  /** A note given the keys, and the board moved so that it shows. @param {string} row */
  #refocus(row) {
    this.#at = row
    this.draw()
    const words = /** @type {HTMLElement | null} */ (this.querySelector(`[data-row="${row}"] .wb-words`))
    words?.focus({ preventScroll: true })
    const box = words?.closest('[data-row]')?.getBoundingClientRect(), room = this.querySelector('.wb-board')?.getBoundingClientRect()
    if (box && room) this.pan(Math.max(0, room.left + 24 - box.left) || Math.min(0, room.right - 24 - box.right), Math.max(0, room.top + 24 - box.top) || Math.min(0, room.bottom - 96 - box.bottom))
  }

  /** The grip's Move: the arrows then move the note a step, Enter drops it and Escape puts it back. @param {string} id */
  move(id) {
    const item = layout(this.#one.rows).items.find((one) => one.row.id === id) ?? layout(this.#one.rows).areas.find((one) => one.row.id === id)
    if (!item) return
    this.#moving = { row: id, from: { x: item.x, y: item.y }, x: item.x, y: item.y }
    this.say(t('whiteboards.moving'))
    requestAnimationFrame(() => /** @type {HTMLElement | null} */ (this.querySelector(`[data-row="${id}"] .wb-grip`))?.focus())
  }

  /** Rows removed, a section with what it holds but its notes, which go back to the shelf, and the arrows to any; one step to undo. @param {string[]} ids */
  async erase(ids) {
    const gone = new Set(ids)
    for (const row of this.#one.rows) if (gone.has(String(row.cells.area)) && kindOf(row) !== 'note') gone.add(row.id)
    for (const row of this.#one.rows) if (kindOf(row) === 'arrow' && [row.cells['@ends']].flat().some((end) => gone.has(/** @type {string} */ (end)))) gone.add(row.id)
    await this.edit([...gone].map((row) => ({ row, delete: true })))
    this.#selected.clear()
    this.say(t('whiteboards.removed', { count: ids.length }))
  }

  /** Selected notes wrapped in a new section, made where they lie, each keeping its place in it. */
  async wrap() {
    const { items } = layout(this.#one.rows), chosen = items.filter((item) => this.#selected.has(item.row.id) && item.kind !== 'arrow')
    if (!chosen.length) return
    const x = snap(Math.min(...chosen.map((item) => item.x)) - GRID), y = snap(Math.min(...chosen.map((item) => item.y)) - 3 * GRID), id = ulid()
    await this.edit([{ row: id, set: { note: t('whiteboards.untitledSection'), '@kind': 'area', '@spot': { area: null, x, y } } },
      ...chosen.map((item) => ({ row: item.row.id, set: { area: id, '@spot': { area: id, x: snap(item.x - x), y: snap(item.y - y) } } }))])
    this.#selected.clear()
    this.write(/** @type {Row} */ (this.#row(id)))
  }

  /** A section's notes put back in rows: their places go, in one step. @param {string} area */
  async tidy(area) {
    const placed = this.#one.rows.filter((row) => row.cells.area === area && kindOf(row) === 'note' && row.cells['@spot'])
    if (placed.length) await this.edit(placed.map((row) => ({ row: row.id, set: { '@spot': null } })))
    this.say(t('whiteboards.tidied'))
  }

  /** Jean asked about the notes selected, or a section's: the box given the keys, the note for the next message naming them by id. @param {string[]} rows */
  ask(rows) {
    picked.value = { folder: this.#one.folder, rows }
    this.say(t('whiteboards.asking', { count: rows.length, name: assistantName() }))
    ;/** @type {HTMLElement | null} */ (document.querySelector('#prompt'))?.focus()
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────────

  draw() {
    const one = this.where.peek()
    if (!one) return
    const [way, section] = this.as.peek().split('/'), as = way || 'board', dir = one.table.dir ?? 'ltr', only = section ? this.#row(section) : undefined
    const marked = unkept(one), name = assistantName()
    // Before: the rows without Jean's changes that wait, nothing marked; once none wait, After again.
    if (!marked.length) this.#before = false
    if (!(as === 'table' && only) && this.#table) { for (const hold of this.#table.holds) hold(); this.#table = null }
    const seen = this.#before ? { ...one, rows: fold(one.lines.filter((line) => !marked.includes(/** @type {any} */ (line)))) } : one, jean = new Set(this.#before ? [] : marked.map((line) => line.row))
    const shows = [['board', t('whiteboards.showBoard')], ['lanes', t('whiteboards.showLanes')], ['table', t('whiteboards.showTable')]]
    render(html`<div class="wb" data-as=${as}><div class="wb-stage">
      <div class="wb-head">
        <span class="wb-end"><span class="wb-people"></span>
          <span class="wb-shows" role="group" aria-label=${t('whiteboards.showAs')}>${shows.map(([id, label]) => html`<button type="button" class="button subtle" aria-pressed=${String(as === id)} @click=${() => { this.as.value = id === 'board' ? '' : id }}>${label}</button>`)}</span></span>
      </div>
      ${marked.length ? html`<div class="wb-review">${reviewBar({ label: t('whiteboards.review', { name }), count: t('whiteboards.changes', { count: jean.size, name }), previous: '', next: '',
        accept: () => accept(one), reject: () => reject(one), acceptAll: t('whiteboards.acceptAll'), rejectAll: t('whiteboards.rejectAll') })}
        <span class="wb-shows" role="group" aria-label=${t('whiteboards.compare', { name })}>${[true, false].map((before) => html`<button type="button" class="button subtle" aria-pressed=${String(this.#before === before)}
          @click=${() => { this.#before = before; this.#said = before ? t('whiteboards.beforeSaid', { name }) : ''; this.draw() }}>${t(before ? 'whiteboards.before' : 'whiteboards.after')}</button>`)}</span></div>` : nothing}
      ${as === 'table' && only ? html`<p class="wb-only"><span dir="auto">${t('whiteboards.only', { section: wordsOf(only) })}</span> <button type="button" class="button subtle" @click=${() => { this.as.value = 'table' }}>${t('whiteboards.allSections')}</button></p>${this.#section(only.id)}`
        : as === 'table' ? keyed(one.folder, html`<app-table folder=${one.folder}></app-table>`) : as === 'lanes' ? this.#lanes(seen, jean) : this.#board(seen, dir, jean)}
      ${as === 'table' ? nothing : html`<div class="wb-dock">${as === 'board' ? (this.#selected.size ? this.#chosen(layout(seen.rows).areas) : this.#bar()) : nothing}${this.#shelf(seen, jean, as === 'lanes')}</div>`}
    </div><p class="visually-hidden" role="status">${this.#said}</p></div>`, this)
    // Fitted as it opens, and again as rows come while the person hasn't moved it: a whiteboard being written stays whole in view.
    if (as === 'board' && this.querySelector('.wb-board')?.clientWidth && (!this.#fitted || (!this.#held && one.rows.length !== this.#count))) (this.#fitted = true), this.fit()
    else this.#turn()
    this.#count = one.rows.length
  }

  /**
   * A note, a text or a line where it lies, in its section's list or the ground's: a note's words, which give it the keys and are written
   * again with Enter or a double press, its grip and its menu, an owner and a date at its foot; Jean's change marked, with Accept and
   * Reject. @param {Loaded} one @param {Item} item @param {{ x: number, y: number }} origin @param {Set<string>} jean @param {Area[]} areas @param {number} z
   */
  #item(one, item, origin, jean, areas, z) {
    const { row } = item, id = row.id, card = cardOf(row), words = card?.name ?? wordsOf(row), mine = this.#moving?.row === id ? this.#moving : null, box = { x: (mine?.x ?? item.x) - origin.x, y: (mine?.y ?? item.y) - origin.y, w: item.w, h: item.h }, hue = row.cells['@hue']
    const classes = `wb-${item.kind}${jean.has(id) ? ' is-jean' : ''}${this.#selected.has(id) ? ' is-selected' : ''}${mine || this.#from === id ? ' is-moving' : ''}${item.area ? '' : ' is-ground'}${row.cells['@size'] === 'title' ? ' is-title' : ''}${item.kind === 'note' && hue != null && !ownProblem('@hue', hue) ? ` is-hued wb-hue-${hue}` : ''}`
    if (this.#draft?.row === id) return html`<li class=${`${classes} wb-draft`} data-row=${id} ${placed(box)}>${this.#field(row)}</li>`
    const z_ = ref((element) => element instanceof HTMLElement && element.style.setProperty('--z', String(z + 1))), menu = `${this.#id}-menu-${id}`
    // The keys' one stop: where they were last, else the board's first thing; on the shelf and in the lanes (z below 0), each.
    const tab = this.#at === id || (!this.#at && (z < 0 || id === this.#stop)) ? 0 : -1
    if (item.kind === 'line' || item.ends) {
      const path = /** @type {number[]} */ (row.cells['@path']), ink = row.cells['@ink'], ends = item.ends?.map((n, i) => n - (i % 2 ? item.y : item.x))
      const name = ends ? t('whiteboards.arrowName', { from: nameOf(this.#row(/** @type {string[]} */ (row.cells['@ends'])[0])), to: nameOf(this.#row(/** @type {string[]} */ (row.cells['@ends'])[1])) }) : t('whiteboards.line')
      if (!ends && ownProblem('@path', path)) return nothing
      return html`<li class=${classes} data-row=${id} ${placed(box)} ${z_}><svg role="img" aria-label=${name} viewBox=${`0 0 ${item.w} ${item.h}`} class=${ends || ink === 'ink' ? 'wb-ink' : `wb-ink wb-hue-${Number(ink) % HUES}`}>${ends ? svg`<path class="wb-hit" d=${arrowPath(ends)}/>` : nothing}<path d=${ends ? arrowPath(ends) : pathOf(path)}/></svg>
        <button type="button" class="wb-words visually-hidden" tabindex=${tab}>${name}</button>${ends ? html`<button type="button" class="wb-more icon-button" tabindex=${tab} aria-label=${t('whiteboards.more', { name })} popovertarget=${menu}
          ${placed({ x: (ends[0] + ends[2]) / 2, y: (ends[1] + ends[3]) / 2 })}>${icons.more}</button><div id=${menu} class="menu wb-menu" popover><ul><li><button type="button" class="menu-item" @click=${menuRow(() => this.#repoint(id))}>${ARROW}${t('whiteboards.repoint')}</button></li>
          <li><button type="button" class="menu-item" @click=${menuRow(() => { this.erase([id]) })}>${icons.trash}${t('action.delete')}</button></li></ul></div>` : nothing}</li>`
    }
    const foot = footOf(one.table.properties, row)
    return html`<li class=${classes} data-row=${id} ${placed(box)} ${z_}>
      <button type="button" class=${card ? 'wb-words wb-card' : 'wb-words'} dir="auto" tabindex=${tab} aria-label=${card ? t('whiteboards.open', { name: card.name }) : nothing} @dblclick=${() => this.write(row)}
        @keydown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && !e.isComposing && !this.#from) { e.preventDefault(); card ? show(card)() : this.write(row) } }} @focus=${() => { this.#at = id }}>${card
          ? html`<span class="creation-preview" aria-hidden="true" inert ${ref((box) => { if (box instanceof HTMLElement) (this.#near.observe(box), box.isConnected && this.#paint(box)) })}></span><span class="wb-card-name">${card.kind.draw()}<span dir="auto">${card.name}</span></span>` : words || t('whiteboards.empty')}</button>
      ${foot.length ? html`<p class="wb-foot" dir="auto">${foot.map((words) => html`<span>${words}</span>`)}</p>` : nothing}
      <button type="button" class="wb-grip icon-button" tabindex=${tab} aria-label=${t('whiteboards.move', { name: words })} @click=${() => this.move(id)}>${GRIP}</button>
      <button type="button" class="wb-more icon-button" tabindex=${tab} aria-label=${t('whiteboards.more', { name: words })} popovertarget=${menu}>${icons.more}</button>
      <div id=${menu} class="menu wb-menu" popover data-menu=${id}></div></li>`
  }

  /** A row's menu: Move to… a section or the shelf, a note's colour, Move here, Write, Delete; Accept and Reject on Jean's change. @param {Loaded} one @param {Row} row @param {boolean} marked @param {Area[]} areas */
  #menu(one, row, marked, areas) {
    const to = (/** @type {string | null} */ area) => menuRow(() => this.edit([{ row: row.id, set: { area, '@spot': null } }]).then(() => this.say(area ? t('whiteboards.movedTo', { name: wordsOf(row), section: wordsOf(/** @type {Row} */ (this.#row(area))) }) : t('whiteboards.shelved', { name: wordsOf(row) }))))
    return html`<ul>${kindOf(row) === 'note' ? html`<li><p class="wb-menu-head">${t('whiteboards.moveTo')}</p></li>${areas.filter((area) => area.row.id !== row.cells.area).map((area) => html`<li><button type="button" class="menu-item" @click=${to(area.row.id)}><span class=${`wb-dot wb-hue-${area.hue}`}></span><span dir="auto">${wordsOf(area.row)}</span></button></li>`)}
      ${row.cells.area || row.cells['@spot'] ? html`<li><button type="button" class="menu-item" @click=${to(null)}>${t('whiteboards.toShelf')}</button></li>` : nothing}
      <li><p class="wb-menu-head" id=${`${this.#id}-hue-${row.id}`}>${t('whiteboards.colour')}</p><ul class="wb-hues" aria-labelledby=${`${this.#id}-hue-${row.id}`}>${[null, ...Array.from({ length: HUES }, (_, i) => i)].map((hue) => html`<li>
        <button type="button" class="icon-button wb-swatch" aria-label=${hue === null ? t('whiteboards.noHue') : t(`whiteboards.hue${hue}`)} aria-pressed=${String((row.cells['@hue'] ?? null) === hue)} @click=${menuRow(() => this.edit([{ row: row.id, set: { '@hue': hue } }]))}><span class=${hue === null ? 'wb-dot is-none' : `wb-dot wb-hue-${hue}`}></span></button></li>`)}</ul></li>` : nothing}
      <li><button type="button" class="menu-item" @click=${menuRow(() => { this.#moveHere = row.id; this.say(t('whiteboards.pressWhere')) })}>${t('whiteboards.moveHere')}</button></li>${this.#arrowRow(row.id)}
      ${kindOf(row) === 'line' ? nothing : html`<li><button type="button" class="menu-item" @click=${menuRow(() => { this.write(row) })}>${t('whiteboards.write')}</button></li>`}
      ${kindOf(row) === 'text' ? html`<li><button type="button" class="menu-item" @click=${menuRow(() => { this.edit([{ row: row.id, set: { '@size': row.cells['@size'] === 'title' ? 'line' : 'title' } }]) })}>${t(row.cells['@size'] === 'title' ? 'whiteboards.asLine' : 'whiteboards.asTitle')}</button></li>` : nothing}
      ${marked ? html`<li><button type="button" class="menu-item" @click=${menuRow(() => { accept(one, row.id) })}>${icons.check}${t('whiteboards.accept')}</button></li>
        <li><button type="button" class="menu-item" @click=${menuRow(() => { reject(one, row.id) })}>${t('whiteboards.reject')}</button></li>` : nothing}
      <li><button type="button" class="menu-item" @click=${menuRow(() => { this.erase([row.id]) })}>${icons.trash}${t('action.delete')}</button></li></ul>`
  }

  /** The field a row or a new one is written in: a section's name on one line, a note's or a text's words. @param {Row} [row] */
  #field(row) {
    const draft = /** @type {Draft} */ (this.#draft), input = (/** @type {Event} */ e) => { draft.words = /** @type {HTMLInputElement} */ (e.target).value }
    return draft.kind === 'area' ? html`<input dir="auto" title=${t('whiteboards.sectionName')} .value=${draft.words} @input=${input} @keydown=${this.writing} @blur=${() => this.leave()}>`
      : html`<textarea dir="auto" title=${row ? t('whiteboards.write') : t(draft.kind === 'text' ? 'whiteboards.newText' : 'whiteboards.newNote')} .value=${draft.words} @input=${input} @keydown=${this.writing} @blur=${() => this.leave()}></textarea>`
  }

  /**
   * The board: its sections, lowest first, each with its head (its colour, its name, how many notes, New note, its grip and its menu) and
   * its list; the ground's list; what a tool is making; and the bar at its foot. @param {Loaded} one @param {string} dir @param {Set<string>} jean
   */
  #board(one, dir, jean) {
    const { areas, items } = layout(one.rows), number = new Intl.NumberFormat(intlLocales()), order = new Map(items.map((item, i) => [item.row.id, i]))
    this.#stop = items.find((item) => item.kind !== 'arrow')?.row.id ?? ''
    // In reading order: top to bottom, from the start.
    const inArea = (/** @type {string | null} */ area) => items.filter((item) => item.area === area).sort((a, b) => a.y - b.y || a.x - b.x)
    const draft = this.#draft && !this.#draft.row ? this.#draft : null
    const section = (/** @type {Area} */ area) => {
      const id = area.row.id, mine = this.#moving?.row === id ? this.#moving : null, box = { x: mine?.x ?? area.x, y: mine?.y ?? area.y, w: area.w, h: area.h }, count = notesOf(inArea(id).map((item) => item.row)).length, words = wordsOf(area.row), menu = `${this.#id}-menu-${id}`
      const all = inArea(id).filter((item) => item.kind === 'note'), dashed = all.length && all.every((item) => jean.has(item.row.id))
      return html`<section class=${`wb-area wb-hue-${area.hue}${jean.has(id) ? ' is-jean' : ''}${dashed ? ' is-new' : ''}${mine || this.#from === id ? ' is-moving' : ''}`} data-row=${id} aria-labelledby=${`${this.#id}-${id}`} ${placed(box)}>
        <h3 class="wb-area-head" data-row=${id}>${this.#draft?.row === id ? this.#field(area.row) : html`<span class="wb-dot"></span><span id=${`${this.#id}-${id}`} dir="auto" @dblclick=${() => this.write(area.row)}>${words}</span>`}
          <span class="wb-count">${number.format(count)}</span>
          <button type="button" class="icon-button subtle" aria-label=${t('whiteboards.newIn', { section: words })} @click=${() => this.#make('note', { x: area.x + 16, y: area.y + area.h - NOTE.h - 16 })}>${icons.plus}</button>
          <button type="button" class="wb-grip icon-button subtle" aria-label=${t('whiteboards.move', { name: words })} @click=${() => this.move(id)}>${GRIP}</button>
          <button type="button" class="icon-button subtle" aria-label=${t('whiteboards.more', { name: words })} popovertarget=${menu}>${icons.more}</button>
          <div id=${menu} class="menu wb-menu" popover><ul>
            <li><button type="button" class="menu-item" @click=${menuRow(() => this.write(area.row))}>${t('action.rename')}</button></li>
            <li><button type="button" class="menu-item" @click=${menuRow(() => this.tidy(id))}>${t('whiteboards.tidy')}</button></li>${this.#arrowRow(id)}
            <li><button type="button" class="menu-item" @click=${menuRow(() => { this.as.value = `table/${id}` })}>${icons.table}${t('whiteboards.asTable')}</button></li>
            ${one.table.properties.some((property) => property.type === 'person' && !property.deleted) ? nothing : html`<li><button type="button" class="menu-item" @click=${menuRow(() => this.#dated())}>${t('whiteboards.dated')}</button></li>`}
            <li><button type="button" class="menu-item" @click=${menuRow(() => this.ask(inArea(id).map((item) => item.row.id)))}>${t('whiteboards.askAbout', { name: assistantName() })}</button></li>
            ${jean.has(id) ? html`<li><button type="button" class="menu-item" @click=${menuRow(() => accept(one, id))}>${icons.check}${t('whiteboards.accept')}</button></li><li><button type="button" class="menu-item" @click=${menuRow(() => reject(one, id))}>${t('whiteboards.reject')}</button></li>` : nothing}
            <li><button type="button" class="menu-item" @click=${menuRow(() => this.erase([id]))}>${icons.trash}${t('action.delete')}</button></li></ul></div></h3>
        <ul>${inArea(id).map((item) => this.#item(one, item, area, jean, areas, Number(order.get(item.row.id))))}${draft?.area === id ? this.#newOne(draft) : nothing}</ul></section>`
    }
    return html`<div class="wb-board" role="region" aria-label=${t('whiteboards.board', { name: one.table.name })} data-tool=${this.#tool} ?data-moving=${!!this.#moveHere} ?inert=${this.#before || writing.peek() === one.folder}
        @pointerdown=${this.down} @wheel=${this.wheel} @keydown=${this.keys} @dragenter=${this.over} @dragover=${this.over} @drop=${this.landed} @pointermove=${(/** @type {PointerEvent} */ e) => this.#tell(this.#point(e))}>
      <div class="wb-layer" dir=${dir}>
        <div class="wb-others" aria-hidden="true"></div>
        ${areas.map(section)}
        <section class="wb-ground" aria-label=${t('whiteboards.ground')}><ul>${inArea(null).map((item) => this.#item(one, item, { x: 0, y: 0 }, jean, areas, Number(order.get(item.row.id))))}${draft && !draft.area && draft.kind !== 'area' ? this.#newOne(draft) : nothing}</ul></section>
        ${draft?.kind === 'area' ? html`<div class="wb-area wb-draft" ${placed({ x: draft.x, y: draft.y, w: WIDE, h: 160 })}><h3 class="wb-area-head">${this.#field()}</h3></div>` : nothing}
        <svg class="wb-stroke" aria-hidden="true"><path class=${this.#ink === 'ink' ? 'wb-ink' : `wb-ink wb-hue-${this.#ink}`}/></svg>
        ${this.#box ? html`<div class="wb-box" ${placed(this.#box)}></div>` : nothing}
      </div>
    </div>`
  }

  /** A note or a text being made where a tool put it. @param {Draft} draft */
  #newOne(draft) {
    return html`<li class=${`wb-${draft.kind} wb-draft${draft.area ? '' : ' is-ground'}`} ${placed({ x: draft.x, y: draft.y, w: NOTE.w, h: NOTE.h })}>${this.#field()}</li>`
  }

  /** An owner and a date for the notes, as two columns, which the notes then show at their foot. */
  async #dated() {
    for (const [key, type] of /** @type {const} */ ([['owner', 'person'], ['due', 'date']])) await reshapeTable(/** @type {Loaded} */ (await load(this.#one.folder)), { add: { name: t(`whiteboards.${key}`), type } })
    this.say(t('whiteboards.datedSaid'))
  }

  /** The bar at the board's foot, a toolbar, one Tab stop: the pointer, Note, Text, Section, Arrow, Draw and its inks and eraser; then the zoom. */
  #bar() {
    const tool = (/** @type {Tool} */ id, /** @type {unknown} */ glyph, /** @type {string} */ label) => html`<button type="button" class="icon-button" aria-label=${label} aria-pressed=${String(this.#tool === id)} tabindex=${this.#tool === id ? 0 : -1}
      @click=${() => { this.#tool = id; this.#from = this.#rejoining = null; this.draw(); if ((id === 'note' || id === 'text' || id === 'section') && !matchMedia('(pointer: fine)').matches) this.#make(id, this.#middle()) }}>${glyph}</button>`
    const percent = new Intl.NumberFormat(intlLocales(), { style: 'percent' })
    return html`<div class="wb-bar" role="toolbar" aria-label=${t('whiteboards.tools')} @keydown=${this.#roving}>
      ${tool('pointer', POINTER, t('whiteboards.pointer'))}${tool('note', NOTE_GLYPH, t('whiteboards.note'))}${tool('text', TEXT, t('whiteboards.text'))}${tool('section', SECTION, t('whiteboards.section'))}${tool('arrow', ARROW, t('whiteboards.arrow'))}${tool('draw', DRAW, t('whiteboards.draw'))}
      ${this.#tool === 'draw' || this.#tool === 'erase' ? html`${INKS.map((ink) => html`<button type="button" class="icon-button wb-inks" aria-label=${ink === 'ink' ? t('whiteboards.ink') : t(`whiteboards.hue${ink}`)} aria-pressed=${String(this.#tool === 'draw' && this.#ink === ink)} tabindex="-1"
        @click=${() => { this.#ink = ink; this.#tool = 'draw'; this.draw() }}><span class=${ink === 'ink' ? 'wb-dot wb-ink' : `wb-dot wb-hue-${ink}`}></span></button>`)}${tool('erase', ERASE, t('whiteboards.erase'))}` : nothing}
      <span class="wb-zoom"><button type="button" class="icon-button subtle" tabindex="-1" aria-label=${t('whiteboards.zoomOut')} @click=${() => { this.#held = true; this.zoom(-1) }}>−</button>
        <button type="button" class="button subtle wb-level" tabindex="-1" title=${t('whiteboards.actual', { level: percent.format(1) })} @click=${() => { this.#held = true; this.zoom(0, 1) }}><span></span></button>
        <button type="button" class="icon-button subtle" tabindex="-1" aria-label=${t('whiteboards.zoomIn')} @click=${() => { this.#held = true; this.zoom(1) }}>+</button>
        <button type="button" class="button subtle" tabindex="-1" @click=${() => { this.#held = false; this.fit() }}>${t('whiteboards.fit')}</button></span></div>`
  }

  /** In the bar, the arrows move among its buttons, as a toolbar's do. @param {KeyboardEvent} event */
  #roving = (event) => {
    const step = /** @type {Record<string, number>} */ ({ ArrowRight: this.#rtl ? -1 : 1, ArrowLeft: this.#rtl ? 1 : -1, Home: -Infinity, End: Infinity })[event.key]
    if (!step) return
    event.preventDefault(), event.stopPropagation()
    const all = [.../** @type {HTMLElement} */ (event.currentTarget).querySelectorAll('button')], i = all.indexOf(/** @type {HTMLButtonElement} */ (event.target)), next = all[Math.max(0, Math.min(all.length - 1, Number.isFinite(step) ? i + step : step < 0 ? 0 : all.length - 1))]
    for (const button of all) button.tabIndex = button === next ? 0 : -1
    next?.focus()
  }

  /** The middle of the view, in board units, where what the keys make goes. */
  #middle() {
    const room = /** @type {Element} */ (this.querySelector('.wb-board')).getBoundingClientRect()
    return this.#point({ clientX: room.x + room.width / 2 - NOTE.w / 2, clientY: room.y + room.height / 2 - NOTE.h / 2 })
  }

  /** The bar while notes are selected, in the same place: how many, Ask Jean, Section around them, Move to…, Delete, Done. @param {Area[]} areas */
  #chosen(areas) {
    const rows = [...this.#selected], menu = `${this.#id}-chosen`, name = assistantName()
    const to = (/** @type {string | null} */ area) => menuRow(async () => { await this.edit(rows.filter((id) => kindOf(this.#row(id) ?? { cells: {} }) === 'note').map((row) => ({ row, set: { area, '@spot': null } }))); this.#selected.clear(); this.draw() })
    return html`<div class="wb-bar" role="toolbar" aria-label=${t('whiteboards.selected', { count: rows.length })} @keydown=${this.#roving}>
      <b>${t('whiteboards.selected', { count: rows.length })}</b>
      <button type="button" class="button primary" @click=${() => this.ask(rows)}>${t('whiteboards.askAbout', { name })}</button>
      <button type="button" class="button" tabindex="-1" @click=${() => this.wrap()}>${SECTION}${t('whiteboards.section')}</button>
      <button type="button" class="button" tabindex="-1" popovertarget=${menu}>${t('whiteboards.moveTo')}</button>
      <div id=${menu} class="menu wb-menu" popover><ul>${areas.map((area) => html`<li><button type="button" class="menu-item" @click=${to(area.row.id)}><span class=${`wb-dot wb-hue-${area.hue}`}></span><span dir="auto">${wordsOf(area.row)}</span></button></li>`)}
        <li><button type="button" class="menu-item" @click=${to(null)}>${t('whiteboards.toShelf')}</button></li></ul></div>
      <button type="button" class="button" tabindex="-1" @click=${() => this.erase(rows)}>${icons.trash}${t('action.delete')}</button>
      <button type="button" class="button subtle" tabindex="-1" @click=${() => { this.#selected.clear(); this.draw() }}>${t('whiteboards.done')}</button></div>`
  }

  /**
   * The shelf, floating at the board's foot: a note to write in, then the notes that wait, the newest first, in a row that scrolls, and
   * Group them, which asks Jean to sort them; in the lanes, where those notes have a lane of their own, its field and Group them alone.
   * @param {Loaded} one @param {Set<string>} jean @param {boolean} [lanes]
   */
  #shelf(one, jean, lanes = false) {
    const { shelf, areas } = layout(one.rows)
    return html`<section class=${`wb-shelf${shelf.length && !lanes ? '' : ' is-empty'}`} aria-labelledby=${`${this.#id}-shelf`} @pointerdown=${this.down} @keydown=${this.keys}>
      <h3 id=${`${this.#id}-shelf`} class="visually-hidden">${t('whiteboards.shelf')}</h3>
      <textarea class="wb-new" dir="auto" rows="1" title=${t('whiteboards.newNote')} placeholder=${t('whiteboards.newNote')} @keydown=${this.shelved}></textarea>
      ${shelf.length ? html`${lanes ? nothing : html`<ul>${shelf.map((row) => this.#item(one, { row, kind: 'note', area: null, placed: false, x: 0, y: 0, ...NOTE }, { x: 0, y: 0 }, jean, areas, -1))}</ul>`}
        ${shelf.length > 1 ? html`<button type="button" class="button" @click=${() => send(t('whiteboards.groupThem', { name: one.table.name }), { notes: [] })}>${t('whiteboards.group')}</button>` : nothing}` : nothing}
    </section>`
  }

  /** The lanes: a column for each section, then one for the notes in none, those that wait and those on the open board, each a card with its menu. @param {Loaded} one @param {Set<string>} jean */
  #lanes(one, jean) {
    const { areas, items, shelf } = layout(one.rows), number = new Intl.NumberFormat(intlLocales())
    const loose = [...items.filter((item) => !item.area && item.kind === 'note'), ...shelf.map((row) => ({ row, kind: /** @type {const} */ ('note'), area: null, placed: false, x: 0, y: 0, ...NOTE }))]
    // On a phone, one at a time, a strip of them over them: each a button that brings its lane, the one on show marked.
    const tabs = this.#narrow() ? html`<nav class="wb-tabs" aria-label=${t('whiteboards.showLanes')}><ul>${[...areas.map((area) => [area.row.id, wordsOf(area.row), area.hue]), ...(loose.length ? [['', t('whiteboards.shelf'), -1]] : [])].map(([id, name, hue], i) => html`<li>
      <button type="button" class="button subtle" data-area=${id} aria-current=${String(i === 0)} @click=${() => this.#bring(String(id))}><span class=${hue === -1 ? 'wb-dot' : `wb-dot wb-hue-${hue}`}></span><span dir="auto">${name}</span></button></li>`)}</ul></nav>` : nothing
    return html`${tabs}<div class="wb-lanes" dir=${one.table.dir ?? 'ltr'} @keydown=${this.keys} @scroll=${this.#shown}>${areas.map((area) => {
      const notes = items.filter((item) => item.area === area.row.id && item.kind === 'note')
      return html`<section class=${`wb-lane wb-hue-${area.hue}`} data-area=${area.row.id} aria-labelledby=${`${this.#id}-lane-${area.row.id}`}><h3 id=${`${this.#id}-lane-${area.row.id}`}><span class="wb-dot"></span><span dir="auto">${wordsOf(area.row)}</span> <span class="wb-count">${number.format(notes.length)}</span></h3>
        <ul>${notes.map((item) => this.#item(one, { ...item, x: 0, y: 0 }, { x: 0, y: 0 }, jean, areas, -1))}</ul></section>`
    })}${loose.length ? html`<section class="wb-lane is-loose" data-area="" aria-labelledby=${`${this.#id}-lane-loose`}><h3 id=${`${this.#id}-lane-loose`}><span class="wb-dot"></span><span dir="auto">${t('whiteboards.shelf')}</span> <span class="wb-count">${number.format(loose.length)}</span></h3>
      <ul>${loose.map((item) => this.#item(one, { ...item, x: 0, y: 0 }, { x: 0, y: 0 }, jean, areas, -1))}</ul></section>` : nothing}</div>`
  }
})

/**
 * What a whiteboard on show can do (ui/out.js), through Whiteboards' `out` slot: what a collection can, and a picture of it, whole, or,
 * shown as a whiteboard, as far as it is in view.
 */
export async function ways() {
  const { collectionWays } = await import('../made/ways.js')
  return { ways: (/** @type {import('../../ui/preview.js').Shown} */ file, /** @type {Element} */ pane) => {
    const all = collectionWays(file), board = () => /** @type {{ picture: (inView: boolean) => Promise<void> } | null} */ (/** @type {unknown} */ (pane.querySelector('app-whiteboard')))
    const picture = (/** @type {boolean} */ inView) => ({ id: 'png', glyph: icons.image, label: t(inView ? 'whiteboards.pictureView' : 'whiteboards.pictureAll'), run: () => board()?.picture(inView) })
    return { ...all, files: [picture(false), ...(!wayOf(file.uri).as.value ? [picture(true)] : []), ...all.files] }
  } }
}
