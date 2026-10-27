// The dock (D144, D635): what opens beside the conversation, each a pane (a file's preview, the browser, the terminal, a flow, and
// the tasks and creations dragged from the drawer, caps/split), laid out with the conversation as one screen in parts (./tree.js),
// side by side or one above the other, none ever covering another. A pane that opens goes beside the conversation at the line's
// end, its side as wide as the user last left it (kept in settings), or under the pane opened before it; one that closes gives its
// room back, and focus back where it was. The edge between two parts moves: dragged, with the arrow keys along it, or put back with
// a double click. A pane's head drags it elsewhere: dropped near the middle of another pane, the two change places; near an edge of
// a pane or of the conversation, it takes half of it, a box showing where as it goes, as for what the drawer drags. Where the parts
// aren't as the panes opening make them, the address says how (`?split=row(here,col40(files/report.pdf,browser))`). On a window narrower
// than 60rem the panes cover the conversation instead, along its longer side, the rest of the page inert. Loaded with the first
// pane, with its style sheet, before the pane's own.
import { batch, computed, effect, signal } from '@preact/signals-core'
import { app, updateSettings } from './state.js'
import { t } from '../core/i18n.js'
import { styleSheet } from './sheet.js'
import { keep } from './windows.js'
import { atEnd, scroller, toEnd } from './chat.js'
import { MOST, leaves, parse, places, put, rename as named, reshare, swap, without, write, zone } from './tree.js'

/** @import { Tree, Zone } from './tree.js' */

await styleSheet(new URL('dock.css', import.meta.url))

const WIDE = matchMedia('(min-width: 60rem)')
// In rem: the narrowest the panes' side starts, the room the conversation keeps beside it, the least a part keeps across and down,
// and how far an arrow key moves an edge.
const [DOCK, TALK, ACROSS, DOWN, STEP] = [20, 24, 14, 8, 2]
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
const root = document.documentElement
const dock = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'dock', id: 'dock' }))
const mark = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'dock-drop', hidden: true }))
mark.setAttribute('aria-hidden', 'true')
/** Every pane's element by its part's name, each one's name, and what had focus before each opened. */
const panes = /** @type {Map<string, HTMLElement>} */ (new Map()), names = /** @type {WeakMap<HTMLElement, string>} */ (new WeakMap())
const openers = /** @type {WeakMap<HTMLElement, Element | null>} */ (new WeakMap())
/** The panes open, in the order they opened; the screen's parts, as the address keeps them; an edge being moved; whether the window is wide. */
export const opened = signal(/** @type {string[]} */ ([])), layout = signal(/** @type {Tree} */ ('here')), wide = signal(WIDE.matches)
const moving = signal(/** @type {{ path: string, share: number } | null} */ (null))
WIDE.addEventListener('change', () => { wide.value = WIDE.matches })
/** The parts on screen, the conversation's and the panes open; where each is, an edge's share as it moves. */
const visible = computed(() => leaves(layout.value).reduce((tree, part) => (part === 'here' || opened.value.includes(part) ? tree : without(tree, part) ?? 'here'), layout.value))
const laid = computed(() => places(moving.value ? reshare(visible.value, moving.value.path, moving.value.share) : visible.value))
/** How wide the panes' side is, a share of the window, as the user left it. */
let { width } = app.settings.peek().dock ?? {}
let label = ''

const rtl = () => root.dir === 'rtl'
const rem = () => parseFloat(getComputedStyle(root).fontSize)
/** A part's place on the screen, in shares of it: where it starts and ends along the line, then down. @param {{ x: number, y: number, w: number, h: number }} place */
const inset = ({ x, y, w, h }) => [[x, 1 - x - w], [y, 1 - y - h]].map((pair) => pair.map((n) => `${(n * 100).toFixed(3)}%`).join(' '))

/** Where the parts are laid: the board, or before it is one, the room beside the drawer. */
function area() {
  const board = root.hasAttribute('data-split') && document.querySelector('.board'), shell = document.querySelector('app-shell')
  if (board || !shell) return board ? board.getBoundingClientRect() : new DOMRect(0, 0, root.clientWidth, root.clientHeight)
  const box = shell.getBoundingClientRect(), style = getComputedStyle(shell), [start, end] = [parseFloat(style.paddingLeft), parseFloat(style.paddingRight)]
  return new DOMRect(box.left + start, 0, box.width - start - end, root.clientHeight)
}

/** The conversation's share beside the panes' side: half the window up to 52rem, or as wide as the user left that side, the conversation keeping its room. */
function besideShare() {
  const room = area().width, side = width ? Math.min(Math.max(width * innerWidth, DOCK * rem()), room - TALK * rem()) : Math.min(innerWidth / 2, 52 * rem())
  return Math.min(Math.max(1 - side / room, 0.1), 0.9)
}
/** Where a pane opening goes: under the one opened before it, else beside the conversation, at the line's end. @param {Tree} tree @param {string} part @param {string[]} before */
const placed = (tree, part, before) => {
  const last = before.findLast((one) => leaves(tree).includes(one))
  return last ? put(tree, last, part, 'bottom') : put(tree, 'here', part, 'end', besideShare())
}
/** Every pane open has its place, those missing where opening puts them. @param {Tree} tree */
const filled = (tree) => opened.peek().reduce((all, part, i) => (leaves(all).includes(part) ? all : placed(all, part, opened.peek().slice(0, i))), tree)
/** The parts as the panes opening make them, from the conversation alone. */
const standard = () => opened.value.reduce((tree, part, i) => placed(tree, part, opened.value.slice(0, i)), /** @type {Tree} */ ('here'))

/** Whether a part is another task's, a file's or a creation's, which only this window keeps, rather than a window's pane. @param {string} part */
const tiled = (part) => ULID.test(part) || part.includes('/')
// In the address (D220), as a window, where the parts aren't as the panes opening make them or a task's or a file's are among them; an address naming
// the task as a part of its own leaves that one out.
// The room waits for the panes it names to show (D582), each a promise in `waits` while it is read.
export const waits = /** @type {Set<Promise<unknown>>} */ (new Set())
/**
 * The side beside the conversation as wide as opening makes it, which the address writes as none and reads back so (`besideShare`), each
 * share of a row next to the conversation given to `to`. @param {Tree} tree @param {(share: number, side: number) => number} to @returns {Tree}
 */
const sided = (tree, to) => (typeof tree === 'string' ? tree : { ...tree, a: sided(tree.a, to), b: sided(tree.b, to),
  ...(tree.split === 'row' && (tree.a === 'here' || tree.b === 'here') && { share: to(tree.share, tree.a === 'here' ? besideShare() : 1 - besideShare()) }) })
keep('split', {
  get: () => { const tree = visible.value; return tree === 'here' || (!leaves(tree).some(tiled) && write(tree) === write(standard())) ? null : write(sided(tree, (share, side) => (Math.abs(share - side) < 0.006 ? 0.5 : share))) },
  set: async (state) => {
    const read = state === null ? null : parse(state), tree = read && sided(read, (share, side) => (share === 0.5 ? side : share)), id = app.current.peek()?.id
    layout.value = filled((tree && id ? without(tree, id) : tree) ?? 'here')
    await Promise.all(waits)
  },
})
/** A part where opening puts it, unless the screen has it. @param {string} part */
export const add = (part) => { if (!leaves(layout.peek()).includes(part)) layout.value = placed(layout.peek(), part, opened.peek()) }
/** A pane showing something else in its place, a look a click gives another file (D635). @param {HTMLElement} element @param {string} part */
export function rename(element, part) {
  const was = names.get(element) ?? ''
  names.set(element, part), panes.delete(was), panes.set(part, element)
  batch(() => { layout.value = named(layout.peek(), was, part); opened.value = opened.peek().map((one) => (one === was ? part : one)) })
}

/** A pane's element goes in the dock, hidden until it opens, by its part's name. @param {HTMLElement} element @param {string} [part] */
export function join(element, part = element.localName.replace(/^app-/, '')) {
  element.hidden = true
  element.id ||= element.localName
  names.set(element, part)
  panes.set(part, element)
  dock.append(element)
}
/** A pane gone for good, a task's or a file's closed: out of the dock. @param {HTMLElement} element */
export function leave(element) {
  element.remove()
  place(element, false)
  panes.delete(names.get(element) ?? '')
}

/**
 * A pane opens, where it was if the screen has a place for it, else where opening puts it; or closes, giving its room back and focus
 * where it came from. Called after each render; says whether the pane has just opened, for it to take focus.
 * @param {HTMLElement} element @param {boolean} shown
 */
export function place(element, shown) {
  const part = names.get(element) ?? '', open = opened.peek()
  if (shown === open.includes(part)) return false
  batch(() => {
    if (shown) openers.set(element, document.activeElement)
    if (shown && !leaves(layout.peek()).includes(part)) layout.value = placed(layout.peek(), part, open)
    if (!shown && leaves(layout.peek()).includes(part)) layout.value = without(layout.peek(), part) ?? 'here'
    opened.value = shown ? [...open, part] : open.filter((one) => one !== part)
  })
  // At once, not once the pane's own drawing is done, for it to take the keys.
  arrange()
  // One an address names, there before the room shows, is there as it shows, with no way in (D582).
  if (shown && !root.classList.contains('is-ready')) for (const run of element.querySelector('.pane')?.getAnimations() ?? []) run.finish()
  const opener = openers.get(element), lost = !document.activeElement || document.activeElement === document.body
  if (!shown && lost && opener instanceof HTMLElement && opener.isConnected) opener.focus()
  return shown
}

/**
 * The parts where they go: the conversation in its own while panes are beside it, from where it was read; the dock over the board,
 * each pane in its place and an edge between each two; or the panes over the conversation, in the order they opened.
 */
function arrange() {
  const open = opened.peek(), beside = wide.peek() && open.length > 0, { tiles, splits } = laid.peek()
  if (open.length) root.dataset.dock = beside ? 'beside' : 'over'
  else delete root.dataset.dock
  const shell = /** @type {HTMLElement | null} */ (document.querySelector('app-shell'))
  if (shell) shell.inert = root.dataset.dock === 'over'
  if (beside !== root.hasAttribute('data-split')) {
    const [end, at] = [atEnd(), scroller().scrollTop]
    root.toggleAttribute('data-split', beside)
    end ? toEnd() : scroller().scrollTo({ top: at, behavior: 'instant' })
  }
  const here = tiles.find((tile) => tile.leaf === 'here') ?? { x: 0, y: 0, w: 1, h: 1 }, [inline, block] = inset(here), box = area(), board = document.querySelector('.board')
  root.style.setProperty('--here-inline', inline)
  root.style.setProperty('--here-block', block)
  // How far the conversation's part ends from the window's end, where the toasts keep to.
  root.style.setProperty('--here-end', `${beside ? (rtl() ? box.right - (here.x + here.w) * box.width : root.clientWidth - box.left - (here.x + here.w) * box.width) : 0}px`)
  // Followed as it changes, once the room has drawn it: until then, looked for again at each frame.
  if (board && board !== watched) boards.observe((watched = board))
  else if (beside && !board) soon()
  Object.assign(dock.style, beside ? { insetInlineStart: `${rtl() ? root.clientWidth - box.right : box.left}px`, insetBlockStart: `${box.top}px`, inlineSize: `${box.width}px`, blockSize: `${box.height}px` }
    : { insetInlineStart: '', insetBlockStart: '', inlineSize: '', blockSize: '' })
  dock.classList.toggle('is-row', !beside && dock.clientWidth > dock.clientHeight)
  for (const [part, element] of panes) {
    const tile = beside && tiles.find((one) => one.leaf === part), [across, down] = tile ? inset(tile) : ['', '']
    element.hidden = !open.includes(part) || (beside && !tile)
    Object.assign(element.style, { insetInline: across, insetBlock: down, order: String(open.indexOf(part)) })
  }
  edges(beside ? splits : [])
}
let watched = /** @type {Element | null} */ (null), queued = 0
/** Once the window, the board or the room has changed, out of the observer's turn, so that what moves isn't measured again in it; a timer, which runs in a tab out of sight too. */
const soon = () => { queued ||= setTimeout(() => { queued = 0; arrange() }) }
const boards = new ResizeObserver(soon)

// ─── The edges ───────────────────────────────────────────────────────────────

/** One for each split, wider to the pointer than it looks; next to the conversation along the line, the edge of the panes' side. */
const handles = /** @type {HTMLElement[]} */ ([])
/** @param {ReturnType<typeof places>['splits']} splits */
function edges(splits) {
  while (handles.length > splits.length) handles.pop()?.remove()
  splits.forEach((split, i) => {
    const handle = handles[i] ?? (handles[i] = dock.appendChild(grip(i))), row = split.split === 'row', [inline, block] = inset(split)
    const at = `${((row ? split.x + split.w * split.share : split.y + split.h * split.share) * 100).toFixed(3)}% auto`, side = row && split.parts.includes('here')
    handle.classList.toggle('dock-edge', side)
    handle.classList.toggle('dock-divider', !side)
    handle.setAttribute('aria-orientation', row ? 'vertical' : 'horizontal')
    handle.setAttribute('aria-valuenow', String(Math.round(split.share * 100)))
    handle.setAttribute('aria-controls', split.parts.flatMap(leaves).flatMap((part) => panes.get(part)?.id ?? []).join(' '))
    // Where two cross, the outer split's above.
    Object.assign(handle.style, row ? { insetInline: at, insetBlock: block } : { insetBlock: at, insetInline: inline }, { zIndex: String(10 - split.path.length) })
  })
}

/** The edge of a split: dragged, where it was taken staying under the pointer; moved by the arrow keys along it; put back with a double click. @param {number} i */
function grip(i) {
  const handle = Object.assign(document.createElement('div'), { tabIndex: 0 }), split = () => laid.peek().splits[i]
  handle.setAttribute('role', 'separator')
  handle.setAttribute('aria-label', label)
  /** A share for the split's first part, each part keeping its least. @param {number} share */
  const fit = (share) => {
    const { split: way, w, h } = split(), box = area(), least = Math.min(0.5, ((way === 'row' ? ACROSS : DOWN) * rem()) / (way === 'row' ? box.width * w : box.height * h))
    return Math.min(Math.max(share, least), 1 - least)
  }
  /** Into the screen's parts, and the panes' side's width into settings. @param {number} share */
  const set = (share) => {
    const { path, parts, w } = split(), fitted = fit(share)
    layout.value = reshare(visible.peek(), path, fitted)
    if (!handle.classList.contains('dock-edge')) return
    width = ((parts[0] === 'here' ? 1 - fitted : fitted) * w * area().width) / innerWidth
    save()
  }
  handle.addEventListener('pointerdown', (event) => {
    if (event.button) return
    event.preventDefault()
    const { path, split: way, x, y, w, h, share } = split(), box = area()
    const along = (/** @type {PointerEvent} */ at) => (way === 'row' ? ((rtl() ? box.right - at.clientX : at.clientX - box.left) / box.width - x) / w : ((at.clientY - box.top) / box.height - y) / h)
    const offset = along(event) - share, move = (/** @type {PointerEvent} */ at) => { moving.value = { path, share: fit(along(at) - offset) } }
    handle.setPointerCapture(event.pointerId)
    handle.classList.add('is-grabbed')
    root.dataset.resizing = way === 'row' ? 'vertical' : 'horizontal'
    handle.addEventListener('pointermove', move)
    handle.addEventListener('lostpointercapture', () => {
      handle.removeEventListener('pointermove', move)
      handle.classList.remove('is-grabbed')
      delete root.dataset.resizing
      batch(() => { const done = moving.peek(); if (done) set(done.share); moving.value = null })
    }, { once: true })
  })
  handle.addEventListener('keydown', (event) => {
    const { split: way, share, w, h } = split(), box = area()
    const by = way === 'row' ? /** @type {Record<string, number>} */ ({ ArrowRight: 1, ArrowLeft: -1 })[event.key] * (rtl() ? -1 : 1) : /** @type {Record<string, number>} */ ({ ArrowDown: 1, ArrowUp: -1 })[event.key]
    if (!by) return
    event.preventDefault()
    set(share + (by * STEP * rem()) / (way === 'row' ? box.width * w : box.height * h))
  })
  handle.addEventListener('dblclick', () => {
    if (handle.classList.contains('dock-edge')) width = undefined
    set(handle.classList.contains('dock-edge') ? (split().parts[0] === 'here' ? besideShare() : 1 - besideShare()) : 0.5)
  })
  return handle
}
effect(() => {
  label = t('dock.resize')
  for (const handle of handles) handle.setAttribute('aria-label', label)
})
effect(() => { void [opened.value, wide.value, laid.value]; arrange() })
new ResizeObserver(soon).observe(dock)
// The room may come after a pane an address names (D582), and is put out of reach under it then: at once, laid out before it first shows.
new MutationObserver(() => arrange()).observe(document.body, { childList: true })

let saving = 0
/** What the user set, kept once they stop. */
function save() {
  clearTimeout(saving)
  saving = setTimeout(() => updateSettings({ dock: { width: width && Math.round(width * 1000) / 1000 } }).catch((error) => console.warn('Dock', error)), 400)
}

// ─── Moved ───────────────────────────────────────────────────────────────────

/**
 * Where a part dragged would go: the part under the pointer and where in it, half of it a quarter from an edge while each half keeps
 * its room and the screen has room for one more, else its place; none off the screen, on itself, or where its place can't be taken:
 * the conversation's by anything but a task from the drawer, a pane's by anything from the drawer but in a task's or a file's.
 * @param {number} x @param {number} y @param {string} part @param {boolean} [drawer] whether the drawer drags it
 * @returns {{ leaf: string, x: number, y: number, w: number, h: number, at: Zone, box: DOMRect } | null}
 */
export function aim(x, y, part, drawer = false) {
  if (!WIDE.matches) return null
  const box = area(), u = (rtl() ? box.right - x : x - box.left) / box.width, v = (y - box.top) / box.height, all = leaves(visible.peek())
  const tile = laid.peek().tiles.find((one) => u >= one.x && u < one.x + one.w && v >= one.y && v < one.y + one.h)
  if (!tile || tile.leaf === part) return null
  let at = zone((u - tile.x) / tile.w, (v - tile.y) / tile.h)
  const [across, down] = [(tile.w * box.width) / (at === 'start' || at === 'end' ? 2 : 1), (tile.h * box.height) / (at === 'top' || at === 'bottom' ? 2 : 1)]
  if (across < ACROSS * rem() || down < DOWN * rem() || (all.length >= MOST && !all.includes(part))) at = 'center'
  return at === 'center' && (tile.leaf === 'here' ? !(drawer && ULID.test(part)) : drawer && !tiled(tile.leaf)) ? null : { ...tile, at, box }
}

/** The box showing where it goes, none without a place. @param {ReturnType<typeof aim>} target */
export function show(target) {
  mark.hidden = !target
  if (!target) return
  const { x, y, w, h, at, box } = target, [across, down] = [at === 'start' || at === 'end' ? w / 2 : w, at === 'top' || at === 'bottom' ? h / 2 : h]
  Object.assign(mark.style, { insetInlineStart: `${(rtl() ? root.clientWidth - box.right : box.left) + (x + (at === 'end' ? across : 0)) * box.width}px`,
    insetBlockStart: `${box.top + (y + (at === 'bottom' ? down : 0)) * box.height}px`, inlineSize: `${across * box.width}px`, blockSize: `${down * box.height}px` })
}

/** Dropped: a pane moved changing places with another, one from the drawer taking a task's or a file's, or beside the part, from where it was. @param {string} part @param {NonNullable<ReturnType<typeof aim>>} target @param {boolean} [drawer] */
export function land(part, { leaf, at }, drawer = false) {
  const tree = visible.peek()
  layout.value = filled(at === 'center' && !drawer ? swap(tree, part, leaf) : put(without(tree, part) ?? 'here', leaf, part, at))
  // Moved by hand, a pane is kept.
  panes.get(part)?.removeAttribute('data-look')
}

// A pane's head drags it, once the pointer has gone a few pixels, its buttons and fields their own.
dock.addEventListener('pointerdown', (event) => {
  const target = /** @type {Element} */ (event.target), head = /** @type {HTMLElement | null} */ (target.closest('.pane-head'))
  const part = head && [...panes].find(([, element]) => element.contains(head))?.[0]
  if (!head || !part || event.button || root.dataset.dock !== 'beside' || target.closest('button, a, input, select, textarea, summary, [contenteditable]')) return
  let aimed = /** @type {ReturnType<typeof aim>} */ (null), going = false
  const move = (/** @type {PointerEvent} */ at) => {
    going ||= Math.hypot(at.clientX - event.clientX, at.clientY - event.clientY) > 6
    if (going) root.dataset.resizing = 'move', show((aimed = aim(at.clientX, at.clientY, part)))
  }
  head.setPointerCapture(event.pointerId)
  head.addEventListener('pointermove', move)
  head.addEventListener('lostpointercapture', () => {
    head.removeEventListener('pointermove', move)
    if (going) delete root.dataset.resizing
    show(null)
    if (aimed) land(part, aimed)
  }, { once: true })
})
