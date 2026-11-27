// SPDX-License-Identifier: MIT
// A document's table, its rows and columns picked and changed as a collection's are. While the caret is in a table, a grip sits over each column's head and at
// each row's start; pressed, it selects its column or its row and opens a menu to put one before or after it, move it or delete it, as a collection's head's
// menu does. From the keyboard, ⌘⌥ (Ctrl+Alt) and an arrow move the row or the column the caret is in, as the page reads, and Shift+F10 or the menu key opens
// that menu for both, its arrows, Home and End going through it, Escape or Tab closing it.
import { Plugin, Decoration, DecorationSet, TableMap, CellSelection, findTable, selectionCell, selectedRect, addColumnBefore, addColumnAfter, addRowBefore, addRowAfter, deleteColumn, deleteRow, moveTableRow, moveTableColumn } from '#prosemirror'
import { el, pop, float } from './ui.js'

/** @import { EditorView, EditorState } from '#prosemirror' */
/** @typedef {import('prosemirror-state').Command} Command */
/** @typedef {(key: string, values?: Record<string, string | number>) => string} Label */

/** @param {{ label: Label }} given */
export function grid({ label }) {
  const menu = el('div', { class: 'block-menu grid-menu', role: 'menu', hidden: '' })
  menu.setAttribute('popover', 'manual')
  let view = /** @type {EditorView | null} */ (null)
  const close = (/** @type {boolean} */ back) => { if (!menu.hidden && view) pop(menu, view.dom, false), back && view.focus() }
  /** Where the caret's cell is, and its table. @param {EditorState} state */
  const here = (state) => { try { const table = findTable(state.selection.$from), rect = table && selectedRect(state); return table && rect ? { table, rect, rtl: getComputedStyle(/** @type {HTMLElement} */ (view?.nodeDOM(table.pos) ?? document.body)).direction === 'rtl' } : null } catch { return null } }
  /** The row or the column moved one place, `by` -1 toward the start. @param {'row' | 'column'} kind @param {number} by @returns {Command} */
  const move = (kind, by) => (state, dispatch) => {
    const at = here(state), from = at ? (kind === 'row' ? at.rect.top : at.rect.left) : -1, to = from + by
    if (!at || to < 0 || to >= (kind === 'row' ? at.rect.map.height : at.rect.map.width)) return false
    return (kind === 'row' ? moveTableRow : moveTableColumn)({ from, to, select: true })(state, dispatch)
  }
  /**
   * The menu for a row, a column or both, under `anchor`, its row or column selected first. @param {EditorView} editor @param {'row' | 'column' | 'both'} kind @param {DOMRect} anchor
   * @param {number} [cell] the cell's position whose row or column it is about, else the caret's
   */
  const open = (editor, kind, anchor, cell) => {
    view = editor
    if (cell !== undefined && kind !== 'both') editor.dispatch(editor.state.tr.setSelection(CellSelection[kind === 'row' ? 'rowSelection' : 'colSelection'](editor.state.doc.resolve(cell))))
    const rtl = here(editor.state)?.rtl
    /** @param {string} key @param {string} glyph @param {Command} run */
    const item = (key, glyph, run) => {
      const button = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', tabindex: '-1', role: 'menuitem' }, el('span', { class: 'block-menu-glyph', 'aria-hidden': 'true' }, glyph), label(key)))
      button.disabled = !run(editor.state)
      button.addEventListener('click', () => { close(true); run(editor.state, editor.dispatch) })
      return el('li', { role: 'none' }, button)
    }
    const [start, end] = rtl ? ['→', '←'] : ['←', '→']
    const rows = [item('insertAbove', '↥', addRowBefore), item('insertBelow', '↧', addRowAfter), item('moveUp', '↑', move('row', -1)), item('moveDown', '↓', move('row', 1)), item('deleteRow', '⌫', deleteRow)]
    const columns = [item('insertStart', start, addColumnBefore), item('insertEnd', end, addColumnAfter), item('moveStart', start, move('column', -1)), item('moveEnd', end, move('column', 1)), item('deleteColumn', '⌫', deleteColumn)]
    menu.setAttribute('aria-label', label(kind === 'row' ? 'rowMenu' : kind === 'column' ? 'columnMenu' : 'tableMenu'))
    menu.replaceChildren(...[kind !== 'column' && rows, kind !== 'row' && columns].filter((list) => list !== false).map((list) => el('ul', { role: 'group' }, ...list)))
    pop(menu, editor.dom, true)
    float(menu, anchor, { gap: 4 })
    ;/** @type {HTMLButtonElement | null} */ (menu.querySelector('button:not(:disabled)'))?.focus()
  }
  menu.addEventListener('keydown', (event) => {
    const all = [...menu.querySelectorAll('button:not(:disabled)')], now = all.indexOf(/** @type {Element} */ (document.activeElement))
    const next = /** @type {Record<string, number>} */ ({ ArrowDown: now + 1, ArrowUp: now - 1, Home: 0, End: all.length - 1 })[event.key]
    if (next !== undefined) /** @type {HTMLElement | undefined} */ (all[(next + all.length) % all.length])?.focus()
    else if (event.key === 'Escape' || event.key === 'Tab') close(true)
    else return
    event.preventDefault()
  })
  menu.addEventListener('focusout', (event) => { if (!menu.contains(/** @type {Node | null} */ (event.relatedTarget))) close(false) })
  /** A grip, over a column's head or at a row's start. @param {'row' | 'column'} kind @param {number} n its place, from 1 @param {number} cell its cell's position */
  const grip = (kind, n, cell) => Decoration.widget(cell + 1, (editor) => {
    const button = el('button', { type: 'button', class: `grid-grip is-${kind}`, tabindex: '-1', contenteditable: 'false', 'aria-haspopup': 'menu', 'aria-label': label(kind === 'row' ? 'rowGrip' : 'columnGrip', { n }) })
    button.addEventListener('mousedown', (event) => { event.preventDefault(); open(editor, kind, button.getBoundingClientRect(), cell) })
    return button
  }, { side: -1, key: `${kind}-${n}-${cell}`, ignoreSelection: true, stopEvent: () => true })
  return new Plugin({
    view: (editor) => { view = editor; document.body.append(menu); return { destroy: () => menu.remove() } },
    props: {
      // The grips of the table the caret is in alone.
      decorations(state) {
        const table = findTable(state.selection.$from)
        if (!table) return null
        const map = TableMap.get(table.node), at = (/** @type {number} */ row, /** @type {number} */ column) => table.start + map.map[row * map.width + column]
        return DecorationSet.create(state.doc, [...Array.from({ length: map.width }, (_, column) => grip('column', column + 1, at(0, column))), ...Array.from({ length: map.height }, (_, row) => grip('row', row + 1, at(row, 0)))])
      },
      handleKeyDown(editor, event) {
        const at = (event.metaKey || event.ctrlKey) && event.altKey && /^Arrow/.test(event.key) && here(editor.state)
        if (at) {
          const by = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: at.rtl ? 1 : -1, ArrowRight: at.rtl ? -1 : 1 }[event.key] ?? 0
          return move(/^Arrow(Up|Down)$/.test(event.key) ? 'row' : 'column', by)(editor.state, editor.dispatch)
        }
        if (!((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') || !here(editor.state)) return false
        open(editor, 'both', /** @type {Element} */ (editor.domAtPos(selectionCell(editor.state).pos + 1).node.parentElement ?? editor.dom).getBoundingClientRect())
        return true
      },
    },
  })
}
