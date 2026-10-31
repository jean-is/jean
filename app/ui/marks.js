// What a request names and its tags. In a box (the message box, a request edited), a word / names (a skill, a
// connection, what Jean can do: names() in ui/complete.js) is a chip once picked from the menu or typed whole and gone past:
// its name in the user's language between two isolates, which nothing typed holds, so the box knows it whole (CHIP), a narrow
// space inside each for room. A layer behind the box's words, laid out as they are, draws it as a mode is drawn at the box's
// foot, renamed as soon as the user's language changes. The caret goes round it, never into it, and an edit that reaches it removes it whole; what is sent holds its / word
// again (`plain` in ui/composer.js). A request sent shows a name as a mode, its icon and its name, and a tag, once Creations is
// found, as a document's, which a click looks for there (D576). A name pointed at or clicked, or reached by the arrows in the
// box, shows a popover above it saying what the / menu says of it, in the user's language: its icon, its name, its group and
// what it does. Loaded once a / starts a word in the box, or a / or a # in a request on screen (ui/composer.js, ui/chat.js),
// or with the menus that put a chip, never with the first screen.
import { html, nothing, render } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app } from './state.js'
import { loaded, slots } from './caps.js'
import { withFormulas } from './markdown.js'
import { asked } from './chat.js'
import { plain } from './composer.js'
import { seek } from './creations.js'
import { pieces } from './mentions.js'
import { place } from './tips.js'
import { styleSheet } from './sheet.js'
import { locale } from '../core/i18n.js'

/** @typedef {Awaited<ReturnType<typeof import('./complete.js').names>>} Names */

await styleSheet(new URL('marks.css', import.meta.url))

/** What / names in the room, by its word in lower case. @type {import('@preact/signals-core').Signal<Names>} */
const known = signal(new Map())
let stale = true, said = '', timer = 0
// Words typed (a skill added from the menu is named there): what / names is read again when asked; a capability found or another language, at once.
effect(() => { void app.draft.value; stale = true })
effect(() => { void loaded.value, locale.value; stale = true; if (known.peek().size) want() })

/** Reads again what / names, a moment after a word drawn starts with a / that names nothing yet, or a chip is one it doesn't know, once a moment while typing goes on; what is drawn changes only if it did. */
function want() {
  if (!stale || timer) return
  stale = false
  timer = setTimeout(async () => {
    timer = 0
    const found = await (await import('./complete.js')).names()
    const now = [...found].map(([word, { label, detail, about, aside }]) => [word, label, detail, about, aside].join('\n')).join('\n\n')
    if (now !== said) [said, known.value] = [now, found]
  }, 150)
}

/** A text's pieces, by what / names now. @param {string} text */
function cut(text) {
  const all = pieces(text, [...known.value.keys()])
  if (all.some((piece) => !piece.kind && /(?:^|\s)\/\S/.test(piece.text))) want()
  return all
}

/** Scripts written right to left: Hebrew, Arabic, Syriac, Thaana, N'Ko and their forms. */
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/
/** Words' direction, by their first letter, as dir="auto" finds it; none without one. @param {string} words */
const sideOf = (words) => { const letter = /\p{L}/u.exec(words)?.[0]; return letter && (RTL.test(letter) ? 'rtl' : 'ltr') }

// ─── Chips ───────────────────────────────────────────────────────────────────

/** A chip in a box: first strong isolate, a narrow no-break space, its name, another, pop directional isolate. */
const CHIP = /\u2068\u202F([^\u2068\u2069]*)\u202F\u2069/g
/** What each chip stands for whatever the language (a skill's or a connection's word, a capability's id), by its name: every one made on this page. @type {Map<string, string>} */
const chips = new Map()
/** A chip for what / names, by its name in the user's language (the / menu's `id` and `label`, ui/complete.js). @param {string} id @param {string} label */
export const chip = (id, label) => (chips.set(label, id), `\u2068\u202F${label}\u202F\u2069`)
/** What / names now, by what it is whatever the language. @param {string} id */
const byId = (id) => [...known.peek().values()].find((named) => named.id === id)
/** What a chip stands for, by its name: as it was made, or what / names by that name now. @param {string} label */
const idOf = (label) => chips.get(label) ?? [...known.peek().values()].find((named) => named.label === label)?.id ?? label
/** The / word a chip is sent as, in the user's language now. @param {string} label */
const wordOf = (label) => { const id = idOf(label); return byId(id)?.word ?? (id.startsWith('/') ? id : label) }
plain.of = (text) => text.replace(CHIP, (_, label) => wordOf(label))

// ─── A request sent ──────────────────────────────────────────────────────────

/**
 * A name as a mode, its icon and its name in the user's language, which the popover finds by what it is, in the request's
 * direction, so that the request doesn't take its own from the name's script; a tag, once Creations is found, which a click looks
 * for there. @param {ReturnType<typeof pieces>[number]} piece @param {string} side
 */
function mark({ text, kind }, side) {
  const named = kind === 'name' && known.value.get(text.toLowerCase())
  return named ? html`<span class="mark-name" dir=${side} data-id=${String(named.id)}>${named.icon}<span dir="auto">${named.label}</span></span>`
    : kind === 'tag' && slots('creations').length ? html`<button type="button" class="mark-tag" @click=${() => seek(text)}>${text}</button>` : text
}

// A request: its formulas, and in its other words what it names and its tags.
asked.value = (text) => {
  const side = sideOf(cut(text).filter((piece) => piece.kind !== 'name').map((piece) => piece.text).join('')) ?? 'auto'
  return withFormulas(text).map((part) => (typeof part === 'string' ? cut(part).map((piece) => mark(piece, side)) : part))
}

// ─── The box ─────────────────────────────────────────────────────────────────

/** The layer behind each box, by the box. @type {WeakMap<HTMLTextAreaElement, HTMLElement>} */
const layers = new WeakMap()
/** Each box's words as last drawn, its caret then, and its words and caret after the user's last edit. */
const was = /** @type {WeakMap<HTMLTextAreaElement, { value: string, caret: number, typed?: string, at?: number }>} */ (new WeakMap())
const composing = new WeakSet()
/** Every box drawn, until it goes. @type {Set<HTMLTextAreaElement>} */
const boxes = new Set()
/** What the layer takes from its box, so that its words fall where the box's do. */
const LIKE = 'font-family font-size font-weight font-style font-stretch font-feature-settings font-variation-settings line-height letter-spacing word-spacing text-transform text-indent tab-size padding-block-start padding-block-end padding-inline-start padding-inline-end direction unicode-bidi text-align'.split(' ')

/**
 * Draws a box's chips behind its words, over its words' place and scrolled as they are, after making a chip of each word / names
 * typed whole; the first time, puts its layer in, and follows the box as it is typed in, scrolled, resized, and its caret.
 * A request edited (ui/edit.js) too. @param {HTMLTextAreaElement} area
 */
export function attach(area) {
  let layer = layers.get(area)
  if (!layer) {
    layers.set(area, layer = Object.assign(document.createElement('span'), { className: 'marks', ariaHidden: 'true' }))
    boxes.add(area)
    area.before(layer)
    const again = () => (area.isConnected ? attach(area) : sizes.disconnect())
    const sizes = new ResizeObserver(again)
    for (const each of [area, area.parentElement]) if (each) sizes.observe(each)
    // Before the box's own listener, whose draft draws it again.
    area.addEventListener('input', (event) => {
      hide()
      if (/** @type {InputEvent} */ (event).isComposing) return
      whole(area)
      if (event.isTrusted) was.set(area, { value: area.value, caret: area.selectionEnd, typed: area.value, at: area.selectionEnd })
      again()
    }, true)
    // Pressed into a chip, the caret goes to its nearer end.
    area.addEventListener('pointerdown', () => { const last = was.get(area); if (last) last.caret = NaN })
    area.addEventListener('compositionstart', () => composing.add(area))
    area.addEventListener('compositionend', () => { composing.delete(area); whole(area) })
    area.addEventListener('scroll', again)
    area.addEventListener('keyup', (event) => { if (/^(Arrow|Home|End)/.test(event.key)) toward((round(area), caretIn(area))) })
  }
  if (!composing.has(area)) typed(area)
  direct(area)
  const style = getComputedStyle(area)
  for (const name of LIKE) layer.style.setProperty(name, style.getPropertyValue(name))
  Object.assign(layer.style, { left: `${area.offsetLeft + area.clientLeft}px`, top: `${area.offsetTop + area.clientTop}px`, width: `${area.clientWidth}px`, height: `${area.clientHeight}px` })
  // A space after the words, so that a last line left empty is one. Spans, as a box's neighbours may style its divs (ui/edit.css).
  const value = area.value, drawn = []
  let at = 0
  for (const match of value.matchAll(CHIP)) {
    if (!byId(idOf(match[1]))) want()
    drawn.push(value.slice(at, match.index), html`<span class="mark-name" data-at=${match.index} data-id=${idOf(match[1])}>${match[0]}</span>`)
    at = match.index + match[0].length
  }
  render(html`<span>${drawn}${value.slice(at)} </span>`, layer)
  ;/** @type {HTMLElement} */ (layer.firstElementChild).style.translate = `0 ${-area.scrollTop}px`
  was.set(area, { ...was.get(area), value, caret: area.selectionEnd })
  stay()
}

/**
 * A chip takes its name as / names it now, in the user's language, and each word / names typed whole becomes a chip, unless the
 * caret is just after it, still typing it. @param {HTMLTextAreaElement} area
 */
function typed(area) {
  const last = was.get(area), names = known.peek()
  let changed = false
  for (const match of [...area.value.matchAll(CHIP)].reverse()) {
    const id = idOf(match[1]), named = byId(id)
    if (!named || named.label === match[1]) continue
    area.setRangeText(chip(id, named.label), match.index, match.index + match[0].length, 'preserve')
    changed = true
  }
  for (const { text, at, kind } of pieces(area.value, [...names.keys()]).reverse()) {
    const named = kind === 'name' ? names.get(text.toLowerCase()) : undefined
    if (!named?.id || (last?.typed === area.value && last.at === at + text.length)) continue
    area.setRangeText(chip(named.id, named.label), at, at + text.length, 'preserve')
    changed = true
  }
  if (!changed) return
  was.set(area, { value: area.value, caret: area.selectionEnd })
  area.dispatchEvent(new Event('input', { bubbles: true }))
}


/**
 * A box's direction as dir="auto" finds it, but past a chip its words start with, whose name's script says nothing of them
 * ("Mail" before Arabic): by their first letter outside chips. @param {HTMLTextAreaElement} area
 */
function direct(area) {
  const value = area.value, first = value.search(/\p{L}/u)
  area.dir = ([...value.matchAll(CHIP)].some((match) => first > match.index && first < match.index + match[0].length) && sideOf(value.replace(CHIP, ''))) || 'auto'
}

/** After an edit, what is left of a chip it reached goes too: a chip is only ever removed whole. @param {HTMLTextAreaElement} area */
function whole(area) {
  const old = was.get(area)?.value ?? area.value, now = area.value
  let start = 0, end = 0
  while (start < old.length && start < now.length && old[start] === now[start]) start++
  while (end < old.length - start && end < now.length - start && old[old.length - 1 - end] === now[now.length - 1 - end]) end++
  let from = start, to = old.length - end
  for (const match of old.matchAll(CHIP)) if (match.index < to && from < match.index + match[0].length) [from, to] = [Math.min(from, match.index), Math.max(to, match.index + match[0].length)]
  if (from === start && to === old.length - end) return
  const put = now.slice(start, now.length - end)
  area.value = `${old.slice(0, from)}${put}${old.slice(to)}`
  area.setSelectionRange(from + put.length, from + put.length)
  was.set(area, { value: area.value, caret: area.selectionEnd })
  area.dispatchEvent(new Event('input', { bubbles: true }))
}

/** The caret out of a chip, to the edge it was going to, or the nearest; a selection's ends out of one, round it whole. @param {HTMLTextAreaElement} area */
function round(area) {
  const { selectionStart: start, selectionEnd: end, value } = area, last = was.get(area), before = last?.caret ?? 0
  let [from, to] = [start, end]
  for (const { index: a, 0: { length } } of value.matchAll(CHIP)) {
    const b = a + length
    if (start === end && start > a && start < b) from = to = before <= a ? b : before >= b ? a : start - a < b - start ? a : b
    else [from, to] = [from > a && from < b ? a : from, to > a && to < b ? b : to]
  }
  if (from !== start || to !== end) area.setSelectionRange(from, to, area.selectionDirection)
  if (last) last.caret = area.selectionEnd
}
document.addEventListener('selectionchange', () => { const area = document.activeElement; if (area instanceof HTMLTextAreaElement && layers.has(area)) round(area) })

// The message box, as its words change, and every box as what / names does: in another language, its chips are renamed.
effect(() => {
  void app.draft.value, known.value
  queueMicrotask(() => {
    const box = document.getElementById('prompt')
    if (box instanceof HTMLTextAreaElement) attach(box)
    for (const each of boxes) if (!each.isConnected) boxes.delete(each); else if (each !== box) attach(each)
  })
})

/** The chip a box's caret is at, at either end. @param {HTMLTextAreaElement} area */
const caretIn = (area) => [...layers.get(area)?.querySelectorAll('.mark-name') ?? []]
  .find((name) => area.selectionStart >= Number(/** @type {HTMLElement} */ (name).dataset.at) && area.selectionEnd <= Number(/** @type {HTMLElement} */ (name).dataset.at) + (name.textContent?.length ?? 0)) ?? null

// ─── The popover ─────────────────────────────────────────────────────────────

const tip = Object.assign(document.createElement('div'), { className: 'tip mark-tip', popover: 'manual', role: 'tooltip' })
/** The name the popover is over, and the one last pointed at or reached, shown once what / names is read. @type {Element | null} */
let over = null
let wanted = /** @type {Element | null} */ (null)

/** The name under the pointer: in a request, its element; in a box, the chip behind its words there. @param {MouseEvent} event */
function under({ target, clientX: x, clientY: y }) {
  if (!(target instanceof Element)) return null
  const names = target instanceof HTMLTextAreaElement ? layers.get(target)?.querySelectorAll('.mark-name') ?? [] : [target.closest('.mark-name') ?? []].flat()
  return [...names].find((name) => [...name.getClientRects()].some((box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)) ?? null
}

/** The popover above a name, unless the / menu is open, saying what the menu does of it; or none. @param {Element | null} name */
function toward(name) {
  wanted = name
  const named = name && !document.getElementById('complete') ? byId(String(/** @type {HTMLElement} */ (name).dataset.id)) : undefined
  if (!name || !named) return hide()
  if (name === over && tip.matches(':popover-open')) return
  over = name
  const says = named.detail ?? named.about ?? named.aside
  render(html`${named.icon}<strong dir="auto">${named.label}</strong><small dir="auto">${named.heading}</small>${says ? html`<span dir="auto">${says}</span>` : nothing}`, tip)
  if (!tip.matches(':popover-open')) { document.body.append(tip); tip.showPopover() }
  stay()
}

/** The popover where its name is now, as the page or the box scrolls; none once the name is no longer drawn. */
const stay = () => over && (over.isConnected ? place(tip, over.getClientRects()[0] ?? over.getBoundingClientRect()) : hide())

// What / names read again: the popover says it anew, or goes with a name no longer one.
effect(() => { void known.value; const name = over ?? wanted; over = null; if (name) toward(name.isConnected ? name : null) })

function hide() {
  over = null
  if (tip.matches(':popover-open')) tip.hidePopover()
}

addEventListener('pointermove', (event) => { const name = event.pointerType === 'touch' ? over : under(event); if (name !== over) toward(name) })
addEventListener('click', (event) => { if (event.target instanceof HTMLTextAreaElement && layers.has(event.target)) round(event.target); toward(under(event)) })
addEventListener('scroll', stay, true)
// Escape puts the popover away, and goes no further: not to the answer being written, which it would stop.
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && over) { event.preventDefault(); hide() } }, true)
