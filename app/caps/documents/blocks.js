// Blocks, as in Notion (D485): whole paragraphs, headings, tables, quotes and a list's items, selected
// together, then removed, copied, moved or turned into another kind. A list's items are blocks of their
// own: one moved up past its list's first becomes a list of its own above it, and one moved into the
// list beside it joins it. A drag that starts off the text draws a rectangle and selects the blocks it
// crosses: in the margin, between or below blocks, and inside a block too, past the end of a line,
// beside a heading, on an empty line, a list's bullets or a quote's bar; near the pane's top or foot
// it scrolls. A click there only puts the caret on that line, nearest where it was, and a second click
// is the browser's. Text is selected as ever from the text itself, and tables' cells and code keep their
// own ways. The grip (⋮⋮) beside the block under the pointer selects it on a click and opens its menu
// (Move up, Move down, Turn into, Delete), so moving needs no drag (WCAG 2.5.7); a drag moves it, or the
// blocks selected with it, and scrolls too. On a touch screen, where nothing hovers and a drag scrolls,
// the grip shows beside the block the caret is in. From the keyboard, Escape selects the block the caret
// is in, the arrows move to the block before or after, Shift+arrows grow the selection, ⌘⇧↑ and ⌘⇧↓
// move the blocks (the caret's own too), Shift+F10 opens their menu, Delete removes them, Enter or Escape
// goes back to the text. A selection of blocks hides the text's highlight and draws its own; copying,
// cutting and ⌘Z work on it as on any selection, and Jean is told what it holds, as of any selection.
import { Plugin, PluginKey, Selection, TextSelection, Fragment, Decoration, DecorationSet } from '#prosemirror'
import { el, icon, float } from './ui.js'

/** @typedef {import('prosemirror-model').Node} PMNode */
/** @typedef {import('prosemirror-state').EditorState} EditorState */
/** @typedef {import('prosemirror-state').Command} Command */
/** @typedef {import('prosemirror-view').EditorView} EditorView */
/** @typedef {import('prosemirror-transform').Mappable} Mappable */
/**
 * A block: where it starts and ends as a selection of blocks has it (a list's first item from the list's
 * start, its last to the list's end), where its node is, and the list it is an item of.
 * @typedef {{ from: number, to: number, at: number, node: PMNode, list: { pos: number, node: PMNode } | null }} Unit
 */
/** What a line can become, from the "/" menu's: its name's key, its glyph, and the command that turns it. @typedef {{ key: string, glyph: string, run: Command }} Kind */

const LIST = /^(bullet|ordered)_list$/
const EDGE = 32

/** The document's blocks in order: each top-level block, but a list, whose items are blocks. @param {PMNode} doc @returns {Unit[]} */
export function units(doc) {
  /** @type {Unit[]} */
  const out = []
  doc.forEach((node, pos) => {
    if (!LIST.test(node.type.name)) return void out.push({ from: pos, to: pos + node.nodeSize, at: pos, node, list: null })
    node.forEach((item, offset, i) => {
      const at = pos + 1 + offset
      out.push({ from: i ? at : pos, to: i === node.childCount - 1 ? pos + node.nodeSize : at + item.nodeSize, at, node: item, list: { pos, node } })
    })
  })
  return out
}

/** A place between blocks as a selection of blocks has it: inside a list at its very start or end is the list's edge. @param {PMNode} doc @param {number} pos */
function snap(doc, pos) {
  const $pos = doc.resolve(pos)
  if ($pos.depth !== 1 || !LIST.test($pos.parent.type.name)) return pos
  return $pos.index() === 0 ? $pos.before() : $pos.index() === $pos.parent.childCount ? $pos.after() : pos
}

/** Whole blocks of the document, from the start of one to the end of another. */
export class BlockSelection extends Selection {
  /** The blocks between two of their edges. @param {PMNode} doc @param {number} anchor @param {number} head */
  static create(doc, anchor, head) {
    return new BlockSelection(doc.resolve(snap(doc, anchor)), doc.resolve(snap(doc, head)))
  }

  /** @param {PMNode} doc @param {Mappable} mapping @returns {Selection} */
  map(doc, mapping) {
    const anchor = mapping.map(this.anchor, this.anchor <= this.head ? 1 : -1)
    const head = mapping.map(this.head, this.head < this.anchor ? 1 : -1)
    return anchor === head ? TextSelection.near(doc.resolve(anchor)) : BlockSelection.create(doc, anchor, head)
  }

  /** @param {Selection} other */
  eq(other) {
    return other instanceof BlockSelection && other.anchor === this.anchor && other.head === this.head
  }

  toJSON() {
    return { type: 'block', anchor: this.anchor, head: this.head }
  }

  getBookmark() {
    return bookmark(this.anchor, this.head)
  }
}
BlockSelection.prototype.visible = false

/** What undo gives back after the blocks it removed: the blocks, selected again. @param {number} anchor @param {number} head @returns {import('prosemirror-state').SelectionBookmark} */
const bookmark = (anchor, head) => ({ map: (mapping) => bookmark(mapping.map(anchor), mapping.map(head)),
  resolve: (doc) => (anchor === head ? TextSelection.near(doc.resolve(anchor)) : BlockSelection.create(doc, anchor, head)) })

/** The blocks a selection touches, edge to edge: those of a selection of blocks, or the one the caret or the text selected is in. @param {EditorState} state */
export function blockRange(state) {
  const all = units(state.doc)
  const { from, to } = state.selection
  if (state.selection instanceof BlockSelection) return { from, to, all, chosen: all.filter((unit) => unit.from >= from && unit.to <= to) }
  const chosen = all.filter((unit) => unit.from <= Math.max(from, to - 1) && unit.to > from)
  return { from: chosen[0]?.from ?? from, to: chosen.at(-1)?.to ?? to, all, chosen }
}

/**
 * The blocks, or the caret's own, one block up or down; what was selected stays selected. Some of a list's
 * items move among its items, out of it as a list of their own, or into the list of a kind beside it; any
 * other blocks, a whole list among them, move past the block before or after, a list as one.
 * @param {-1 | 1} dir @returns {Command}
 */
export const moveBlocks = (dir) => (state, dispatch) => {
  let { from, to, all, chosen } = blockRange(state)
  const list = chosen[0]?.list
  const items = Boolean(list) && chosen.every((unit) => unit.list?.pos === list?.pos)
  if (!items && chosen.some((unit) => unit.list)) {
    // Mixed with other blocks: whole lists move.
    from = Math.min(from, ...chosen.map((unit) => unit.list?.pos ?? unit.from))
    to = Math.max(to, ...chosen.map((unit) => (unit.list ? unit.list.pos + unit.list.node.nodeSize : unit.to)))
  }
  const near = dir < 0 ? all.findLast((unit) => unit.to <= from) : all.find((unit) => unit.from >= to)
  if (!near) return false
  if (dispatch) {
    const own = near.list?.pos === list?.pos
    const kin = items && near.list && (own || near.list.node.type === list?.node.type)
    // Among its list's items, or into the end or start of the list of a kind beside it; else past the near block, or its whole list.
    const target = kin ? ((dir < 0) === own ? near.at : near.at + near.node.nodeSize)
      : near.list ? (dir < 0 ? near.list.pos : near.list.pos + near.list.node.nodeSize) : dir < 0 ? near.from : near.to
    const nodes = items ? chosen.map((unit) => unit.node) : []
    const content = items ? (kin ? Fragment.from(nodes) : Fragment.from(/** @type {NonNullable<typeof list>} */ (list).node.copy(Fragment.from(nodes)))) : state.doc.slice(from, to).content
    const tr = state.tr.delete(from, to)
    const at = tr.mapping.map(target, dir)
    tr.insert(at, content)
    // How far what moved went: items into a list of their own are one step deeper.
    const by = items ? (kin ? at : at + 1) - chosen[0].at : at - from
    const { selection } = state
    tr.setSelection(selection instanceof BlockSelection ? BlockSelection.create(tr.doc, at, at + content.size) : TextSelection.create(tr.doc, selection.anchor + by, selection.head + by))
    dispatch(tr.scrollIntoView())
  }
  return true
}

const key = new PluginKey('blocks')

/**
 * @param {{ label: (key: string, values?: Record<string, string | number>) => string, announce: (text: string) => void, kinds: Kind[], mac: boolean }} options
 * `kinds` are what a block can be turned into, from its menu.
 */
export function blocks({ label, announce, kinds, mac }) {
  /** @param {EditorState} state @param {number} anchor @param {number} head */
  const select = (state, anchor, head) => state.tr.setSelection(BlockSelection.create(state.doc, anchor, head)).scrollIntoView()
  /** What the view gives the keys: the menu of the blocks selected. */
  const ui = { menu: () => {} }

  return new Plugin({
    key,
    props: {
      decorations(state) {
        const { selection } = state
        if (!(selection instanceof BlockSelection)) return null
        return DecorationSet.create(state.doc, blockRange(state).chosen.map((unit) => Decoration.node(unit.at, unit.at + unit.node.nodeSize, { class: 'block-selected' })))
      },
      handleKeyDown(view, event) {
        if (event.isComposing) return false
        const { state } = view
        const { selection } = state
        const mod = mac ? event.metaKey : event.ctrlKey
        if (mod && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) return moveBlocks(event.key === 'ArrowUp' ? -1 : 1)(state, view.dispatch)
        if (!(selection instanceof BlockSelection)) {
          // Escape with the caret in text selects its block (what was selected in it, bubble aside).
          if (event.key !== 'Escape' || event.shiftKey || mod || event.altKey) return false
          const { from, to } = blockRange(state)
          view.dispatch(select(state, from, to))
          return true
        }
        if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') return ui.menu(), true
        const { all, chosen } = blockRange(state)
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          const forward = event.key === 'ArrowDown'
          if (event.shiftKey) {
            // The head moves a block, the anchor stays; a single block grows either way, its far edge the anchor.
            const [anchor, head] = chosen.length === 1 ? (forward ? [selection.from, selection.to] : [selection.to, selection.from]) : [selection.anchor, selection.head]
            const next = forward ? all.find((unit) => unit.from === head)?.to : all.find((unit) => unit.to === head)?.from
            if (next !== undefined) view.dispatch(select(state, anchor, next))
          } else {
            const next = forward ? all.find((unit) => unit.from >= selection.to) : all.findLast((unit) => unit.to <= selection.from)
            if (next) view.dispatch(select(state, next.from, next.to))
          }
          return true
        }
        if (event.key === 'Escape' || event.key === 'Enter') {
          // Back to the text: at the end of the first block selected.
          const first = chosen[0]
          view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(first ? first.at + first.node.nodeSize - 1 : selection.from), -1)))
          return true
        }
        // A letter typed over blocks doesn't replace them, as in Notion.
        if (event.key.length === 1 && !mod && !event.altKey) return true
        return false
      },
    },
    view(editor) {
      const doc = editor.dom.ownerDocument
      // The document's own room, its margins included, and what scrolls it: the pane's view.
      const area = /** @type {HTMLElement} */ (editor.dom.parentElement)
      const scroller = () => /** @type {HTMLElement} */ (editor.dom.closest('.view') ?? doc.scrollingElement)
      // Six dots, a grip, as Notion's.
      const handle = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'block-handle', draggable: 'true', hidden: '', tabindex: '-1', 'aria-haspopup': 'menu' }, icon('M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01', 3.5)))
      const menu = el('div', { class: 'block-menu', role: 'menu', hidden: '' })
      const marquee = el('div', { class: 'marquee', hidden: '' })
      doc.body.append(handle, menu, marquee)
      // What it listens to, let go at once with the view.
      const off = new AbortController()
      const on = { signal: off.signal }
      /** The block the grip is beside: where its node is. */
      let at = -1
      let said = ''

      /** Each block, with where it is on the screen; a list drawn as an answer draws it (drawn.js), as one. */
      const laid = () => units(editor.state.doc).flatMap((unit) => {
        const dom = /** @type {HTMLElement | null} */ (editor.nodeDOM(unit.at))
        if (dom?.getClientRects().length) return [{ ...unit, rect: dom.getBoundingClientRect() }]
        const list = unit.list && unit.from === unit.list.pos && /** @type {HTMLElement | null} */ (editor.nodeDOM(unit.list.pos))
        return list && unit.list ? [{ ...unit, to: unit.list.pos + unit.list.node.nodeSize, rect: list.getBoundingClientRect() }] : []
      })
      const touch = () => matchMedia('(pointer: coarse)').matches
      const rtl = () => doc.documentElement.dir === 'rtl'

      /** The grip beside a block, in the margin where its line starts, outside a list's bullets, centred on its first line. @param {Unit & { rect: DOMRect }} block */
      const show = (block) => {
        at = block.at
        const first = editor.coordsAtPos(Math.min(block.at + 1, editor.state.doc.content.size))
        const side = /** @type {HTMLElement} */ (editor.nodeDOM(block.list?.pos ?? block.at)).getBoundingClientRect()
        handle.hidden = false
        handle.setAttribute('aria-label', label('handle'))
        handle.style.top = `${Math.max(block.rect.top, Math.min((first.top + first.bottom - handle.offsetHeight) / 2, block.rect.bottom - handle.offsetHeight))}px`
        handle.style.left = `${rtl() ? side.right + 4 : side.left - handle.offsetWidth - 4}px`
      }
      /** The grip beside the block at this height, with a mouse. @param {number} y */
      const hover = (y) => {
        const block = laid().find(({ rect }) => y >= rect.top && y <= rect.bottom)
        if (block && !touch()) show(block)
      }
      const onMove = (/** @type {MouseEvent} */ event) => {
        if (!marquee.hidden || event.buttons || !menu.hidden) return
        if (!area.contains(/** @type {Node} */ (event.target)) && !handle.contains(/** @type {Node} */ (event.target))) return hide(event)
        if (/** @type {Element} */ (event.target).closest?.('.review, .slash, .bubble, .block-menu')) return
        hover(event.clientY)
      }

      // ── The rectangle drawn from off the text, scrolling the pane near its top or foot ───────────
      /** @type {{ x: number, y: number, moved: boolean, id: number, last: { x: number, y: number } } | null} */
      let drawing = null
      let rolling = 0
      /** Whether a point in a line's element is off its text: no box of its text there, a few pixels around each. @param {Element} line @param {number} x @param {number} y */
      const offText = (line, x, y) => {
        const range = doc.createRange()
        range.selectNodeContents(line)
        return ![...range.getClientRects()].some((rect) => rect.width > 1 && x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 4 && y <= rect.bottom + 4)
      }
      /** @param {PointerEvent} event */
      const fromVoid = (event) => {
        const target = /** @type {Element} */ (event.target)
        if (!area.contains(target)) return false
        if (target === editor.dom || !editor.dom.contains(target)) return true
        if (target.closest('td, th, pre, .suggest, .task-box, input, .drawn-form, .drawn-formula')) return false
        const line = target.closest('p, h1, h2, h3, h4, h5, h6')
        // A list's own box (its bullets), a quote's, a rule: off the text.
        return line ? offText(line, event.clientX, event.clientY) : true
      }
      /** Where the last click was let go: a second one there is the browser's, to select a word or a line. */
      let lastUp = { time: -Infinity, x: 0, y: 0 }
      const onDown = (/** @type {PointerEvent} */ event) => {
        if (event.pointerType !== 'mouse' || event.button !== 0 || !fromVoid(event)) return
        if (event.timeStamp - lastUp.time < 500 && Math.hypot(event.clientX - lastUp.x, event.clientY - lastUp.y) < 6) return
        event.preventDefault()
        event.stopPropagation()
        close(false)
        drawing = { x: event.clientX, y: event.clientY + scroller().scrollTop, moved: false, id: event.pointerId, last: { x: event.clientX, y: event.clientY } }
      }
      /** The rectangle from where it began to the pointer, in what scrolls, its part in view drawn, and the blocks it crosses, top to bottom. */
      const draw = () => {
        if (!drawing) return
        const { x, y } = drawing.last
        const [box, off] = [scroller().getBoundingClientRect(), scroller().scrollTop]
        const top = Math.min(drawing.y, y + off)
        const bottom = Math.max(drawing.y, y + off)
        Object.assign(marquee.style, { left: `${Math.min(drawing.x, x)}px`, top: `${Math.max(top - off, box.top)}px`, width: `${Math.abs(x - drawing.x)}px`, height: `${Math.max(0, Math.min(bottom - off, box.bottom) - Math.max(top - off, box.top))}px` })
        marquee.hidden = false
        const crossed = laid().filter(({ rect }) => rect.bottom + off >= top && rect.top + off <= bottom)
        if (!crossed.length) return
        const [first, last] = [crossed[0].from, /** @type {Unit} */ (crossed.at(-1)).to]
        const down = y + off >= drawing.y
        const { selection } = editor.state
        if (!(selection instanceof BlockSelection) || selection.from !== first || selection.to !== last) editor.dispatch(select(editor.state, down ? first : last, down ? last : first))
      }
      /** Which way to scroll with the pointer near the top or the foot of what scrolls, if it is. @param {number} y */
      const edge = (y) => { const box = scroller().getBoundingClientRect(); return y < box.top + EDGE ? -1 : y > box.bottom - EDGE ? 1 : 0 }
      /** Scrolls while the pointer is near the top or the foot. @param {number} y */
      const roll = (y) => {
        cancelAnimationFrame(rolling)
        const step = edge(y)
        if (!step) return
        const go = () => {
          scroller().scrollBy(0, step * 12)
          draw()
          if (drawing) rolling = requestAnimationFrame(go)
        }
        rolling = requestAnimationFrame(go)
      }
      const onDrag = (/** @type {PointerEvent} */ event) => {
        if (!drawing || event.pointerId !== drawing.id) return
        drawing.last = { x: event.clientX, y: event.clientY }
        if (!drawing.moved && Math.abs(event.clientY + scroller().scrollTop - drawing.y) + Math.abs(event.clientX - drawing.x) < 5) return
        drawing.moved = true
        handle.hidden = true
        draw()
        roll(event.clientY)
      }
      const onUp = (/** @type {PointerEvent} */ event) => {
        if (!drawing || event.pointerId !== drawing.id) return
        const moved = drawing.moved
        drawing = null
        cancelAnimationFrame(rolling)
        marquee.hidden = true
        editor.focus()
        // A click off the text: the caret on that line, nearest where it was.
        if (!moved) {
          lastUp = { time: event.timeStamp, x: event.clientX, y: event.clientY }
          const box = editor.dom.getBoundingClientRect()
          const found = editor.posAtCoords({ left: Math.max(box.left + 1, Math.min(event.clientX, box.right - 1)), top: Math.max(box.top + 1, Math.min(event.clientY, box.bottom - 1)) })
          if (found) editor.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(found.pos))))
        }
      }

      // ── The blocks' menu: Move up, Move down, Turn into, Delete ───────────────────────────────────
      /** The menu's items, the one under the keyboard first. */
      const items = () => /** @type {HTMLButtonElement[]} */ ([...menu.querySelectorAll('[role="menuitem"]')])
      /** @param {boolean} back whether the document takes the keyboard again */
      function close(back) {
        if (menu.hidden) return
        menu.hidden = true
        handle.setAttribute('aria-expanded', 'false')
        if (back) editor.focus()
      }
      /** A command on the blocks selected, run from the menu, the menu then closed. @param {() => void} run */
      const act = (run) => () => {
        close(true)
        run()
      }
      /** The blocks selected, turned into another kind, then selected again. @param {Kind} kind */
      const turn = (kind) => {
        const { from, to } = editor.state.selection
        editor.dispatch(editor.state.tr.setSelection(TextSelection.between(editor.state.doc.resolve(from), editor.state.doc.resolve(to))))
        kind.run(editor.state, editor.dispatch, editor)
        const range = blockRange(editor.state)
        editor.dispatch(select(editor.state, range.from, range.to))
      }
      /** Opens the menu of the blocks selected, under the grip or beside the first of them. */
      ui.menu = () => {
        const { state } = editor
        const { from, to } = state.selection
        const probe = state.apply(state.tr.setSelection(TextSelection.between(state.doc.resolve(from), state.doc.resolve(to))))
        /** @param {string} name @param {() => void} run @param {string} glyph @param {boolean} [off] */
        const item = (name, run, glyph, off = false) => {
          const button = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', tabindex: '-1', role: 'menuitem' }, el('span', { class: 'block-menu-glyph', 'aria-hidden': 'true' }, glyph), label(name)))
          button.disabled = off
          button.addEventListener('click', act(run))
          return button
        }
        const group = el('div', { role: 'group', 'aria-label': label('blocks') }, ...kinds.filter((kind) => kind.run(probe)).map((kind) => item(kind.key, () => turn(kind), kind.glyph)))
        menu.setAttribute('aria-label', label('blockMenu'))
        menu.replaceChildren(
          item('moveUp', () => moveBlocks(-1)(editor.state, editor.dispatch), '↑', !moveBlocks(-1)(state)),
          item('moveDown', () => moveBlocks(1)(editor.state, editor.dispatch), '↓', !moveBlocks(1)(state)),
          ...(group.childElementCount ? [group] : []),
          item('remove', () => editor.dispatch(editor.state.tr.deleteSelection().scrollIntoView()), '⌫'),
        )
        menu.hidden = false
        handle.setAttribute('aria-expanded', 'true')
        // Under the grip, or from the keyboard under the first block selected.
        const first = blockRange(state).chosen[0]
        const anchor = handle.hidden && first ? /** @type {HTMLElement} */ (editor.nodeDOM(first.at)).getBoundingClientRect() : handle.getBoundingClientRect()
        menu.style.maxBlockSize = `${Math.max(innerHeight - anchor.bottom, anchor.top, 136) - 16}px`
        float(menu, anchor, { gap: 4 })
        items().find((button) => !button.disabled)?.focus()
      }
      menu.addEventListener('keydown', (event) => {
        if (event.isComposing) return
        const all = items().filter((button) => !button.disabled)
        const now = all.indexOf(/** @type {HTMLButtonElement} */ (doc.activeElement))
        const next = { ArrowDown: now + 1, ArrowUp: now - 1, Home: 0, End: all.length - 1 }[event.key]
        if (next !== undefined) all[(next + all.length) % all.length]?.focus()
        else if (event.key === 'Escape' || event.key === 'Tab') close(true)
        else return
        event.preventDefault()
      })
      menu.addEventListener('focusout', (event) => { if (!menu.contains(/** @type {Node | null} */ (event.relatedTarget))) close(false) })

      // The grip: a click (a tap) selects its block, unless it is among those selected, and opens their menu; a drag moves them.
      /** The grip's block, selected unless it is among those selected already. */
      const pick = () => {
        const unit = laid().find((one) => one.at === at)
        const { selection } = editor.state
        if (unit && !(selection instanceof BlockSelection && selection.from <= unit.from && unit.to <= selection.to)) editor.dispatch(select(editor.state, unit.from, unit.to))
        return unit
      }
      handle.addEventListener('mousedown', (event) => event.stopPropagation(), on)
      handle.addEventListener('click', () => pick() && ui.menu(), on)
      handle.addEventListener('dragstart', (event) => {
        const unit = pick()
        if (!unit || !event.dataTransfer) return
        close(false)
        const slice = editor.state.selection.content()
        const { dom, text } = editor.serializeForClipboard(slice)
        event.dataTransfer.clearData()
        event.dataTransfer.setData('text/html', dom.innerHTML)
        event.dataTransfer.setData('text/plain', text)
        event.dataTransfer.effectAllowed = 'copyMove'
        const block = /** @type {HTMLElement | null} */ (editor.nodeDOM(unit.at))
        if (block) event.dataTransfer.setDragImage(block.getClientRects().length ? block : /** @type {HTMLElement} */ (editor.nodeDOM(unit.list?.pos ?? unit.at)), 0, 0)
        editor.dragging = /** @type {any} */ ({ slice, move: true })
      })
      handle.addEventListener('dragend', () => { editor.dragging = null })
      // A drag near the top or the foot of the document scrolls it, as the browser would a page's.
      const onDragOver = (/** @type {DragEvent} */ event) => {
        const step = area.contains(/** @type {Node} */ (event.target)) ? edge(event.clientY) : 0
        if (step) scroller().scrollBy(0, step * 16)
      }

      const replace = () => { if (!handle.hidden && at >= 0 && !editor.state.doc.nodeAt(at)) handle.hidden = true }
      const hide = (/** @type {Event} */ event) => { if (!touch() && !handle.contains(/** @type {Node} */ (event.target))) handle.hidden = true }
      doc.addEventListener('mousemove', onMove, on)
      doc.addEventListener('pointerdown', onDown, { ...on, capture: true })
      doc.addEventListener('pointermove', onDrag, on)
      doc.addEventListener('pointerup', onUp, on)
      doc.addEventListener('keydown', hide, on)
      doc.addEventListener('dragover', onDragOver, on)
      addEventListener('scroll', hide, { ...on, capture: true })

      return {
        update(view, previous) {
          if (!view.state.doc.eq(previous.doc)) replace()
          const { selection } = view.state
          // On a touch screen, the grip beside the block the caret is in.
          if (touch() && view.hasFocus() && menu.hidden) {
            const { chosen } = blockRange(view.state)
            const block = laid().find((unit) => unit.at === chosen[0]?.at)
            if (block && chosen.length === 1) show(block)
            else handle.hidden = true
          }
          const now = selection instanceof BlockSelection ? blockRange(view.state).chosen.length : 0
          const text = now ? label('blocksSelected', { n: now }) : ''
          if (text && text !== said) announce(text)
          said = text
        },
        destroy() {
          off.abort()
          handle.remove()
          menu.remove()
          marquee.remove()
        },
      }
    },
  })
}
